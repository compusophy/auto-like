import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { getUnfollowedAccounts } from '../../lib/redis-write';
import { 
  NobleEd25519Signer, 
  makeLinkAdd,
  FarcasterNetwork,
  createDefaultMetadataKeyInterceptor,
  getSSLHubRpcClient 
} from '@farcaster/hub-nodejs';
import { hexToBytes } from '@noble/hashes/utils';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'F27E25B1-9B59-494C-85CC-2189447DD04A';

// Re-follow a single account
async function refollowAccount(
  sourceFid: number,
  sourcePrivateKey: string,
  targetFid: number
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const cleanPrivateKey = sourcePrivateKey.replace('0x', '');
    
    const hubClient = getSSLHubRpcClient('hub-grpc-api.neynar.com', {
      interceptors: [
        createDefaultMetadataKeyInterceptor('x-api-key', NEYNAR_API_KEY),
      ],
    });

    const privateKeyBytes = hexToBytes(cleanPrivateKey);
    const signer = new NobleEd25519Signer(privateKeyBytes);
    
    const messageResult = await makeLinkAdd(
      {
        type: "follow",
        targetFid: targetFid
      },
      {
        fid: sourceFid,
        network: FarcasterNetwork.MAINNET
      },
      signer
    );

    if (!messageResult.isOk()) {
      return { success: false, error: messageResult.error.message || String(messageResult.error) };
    }

    const result = await hubClient.submitMessage(messageResult.value);
    
    if (result.isOk()) {
      const hash = `0x${Buffer.from(result.value.hash).toString("hex")}`;
      return { success: true, hash };
    } else {
      return { success: false, error: result.error.message || String(result.error) };
    }

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { signerData, accounts, useSSE } = await request.json();
    
    if (!signerData || !signerData.fid || !signerData.privateKey) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    // If no accounts provided, try to get from Redis
    let accountsToRefollow = accounts;
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      const storedAccounts = await getUnfollowedAccounts(signerData.address);
      if (!storedAccounts || storedAccounts.length === 0) {
        return NextResponse.json({ error: 'No accounts to refollow. Please unfollow some accounts first.' }, { status: 400 });
      }
      accountsToRefollow = storedAccounts;
    }
    
    const sourceFid = parseInt(signerData.fid);
    if (isNaN(sourceFid)) {
      return NextResponse.json({ error: 'Invalid FID in signer data' }, { status: 400 });
    }
    
    // If SSE is requested, return a streaming response
    if (useSSE) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          
          // Send initial progress
          sendProgress({ type: 'progress', current: 0, total: accountsToRefollow.length, message: 'Starting refollow process...' });
          
          // Process re-follows
          const results = [];
          let successCount = 0;
          let failCount = 0;
          
          for (let i = 0; i < accountsToRefollow.length; i++) {
            const account = accountsToRefollow[i];
            if (!account.fid || typeof account.fid !== 'number') {
              console.log(`Skipping invalid account:`, account);
              failCount++;
              continue;
            }
            
            console.log(`Refollowing FID ${account.fid}...`);
            const result = await refollowAccount(sourceFid, signerData.privateKey, account.fid);
            
            results.push({
              targetFid: account.fid,
              username: account.username,
              success: result.success,
              hash: result.hash,
              error: result.error
            });
            
            if (result.success) {
              successCount++;
              console.log(`✅ Successfully refollowed FID ${account.fid}`);
            } else {
              failCount++;
              console.log(`❌ Failed to refollow FID ${account.fid}: ${result.error}`);
            }
            
            // Send progress update
            sendProgress({
              type: 'progress',
              current: i + 1,
              total: accountsToRefollow.length,
              successCount,
              failCount,
              message: `Refollowing FID ${account.fid}...`
            });
            
            // Add a small delay between refollows to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Send final result
          sendProgress({
            type: 'complete',
            message: `Re-followed ${successCount} accounts, ${failCount} failed`,
            refollowed: successCount,
            failed: failCount,
            total: accountsToRefollow.length,
            results
          });
          
          controller.close();
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Regular non-SSE processing
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const account of accountsToRefollow) {
      if (!account.fid || typeof account.fid !== 'number') {
        console.log(`Skipping invalid account:`, account);
        failCount++;
        continue;
      }
      
      const result = await refollowAccount(sourceFid, signerData.privateKey, account.fid);
      
      results.push({
        targetFid: account.fid,
        username: account.username,
        success: result.success,
        hash: result.hash,
        error: result.error
      });
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    return NextResponse.json({
      message: `Re-followed ${successCount} accounts, ${failCount} failed`,
      refollowed: successCount,
      failed: failCount,
      total: accountsToRefollow.length,
      results
    });
    
  } catch (error) {
    console.error('Re-follow batch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 