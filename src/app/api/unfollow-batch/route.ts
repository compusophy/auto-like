import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { storeUnfollowedAccounts, markBackupAsUnfollowed } from '../../lib/redis-write';
import { 
  NobleEd25519Signer, 
  makeLinkRemove,
  FarcasterNetwork,
  createDefaultMetadataKeyInterceptor,
  getSSLHubRpcClient 
} from '@farcaster/hub-nodejs';
import { hexToBytes } from '@noble/hashes/utils';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'F27E25B1-9B59-494C-85CC-2189447DD04A';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster';

interface Following {
  fid: number;
  username?: string;
  displayName?: string;
}

// Get all following accounts with pagination (same as backup API)
async function getAllFollowing(sourceFid: number): Promise<Following[]> {
  const allFollowing: Following[] = [];
  let cursor: string | undefined = undefined;
  const batchSize = 100; // Neynar API limit
  
  console.log(`Starting to fetch all following for FID ${sourceFid}...`);
  
  while (true) {
    try {
      const url: string = `${NEYNAR_API_URL}/following?fid=${sourceFid}&limit=${batchSize}${cursor ? `&cursor=${cursor}` : ''}`;
      
      const response: Response = await fetch(url, {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data: any = await response.json();
      
      if (!data.users || data.users.length === 0) {
        console.log('No more accounts to fetch');
        break;
      }
      
      console.log(`Fetched batch of ${data.users.length} accounts`);
      
      // Process accounts in this batch
      for (const item of data.users) {
        if (item && item.user && item.user.fid && typeof item.user.fid === 'number' && item.user.fid > 0) {
          allFollowing.push({
            fid: item.user.fid,
            username: item.user.username || undefined,
            displayName: item.user.display_name || undefined
          });
        } else if (item && item.fid && typeof item.fid === 'number' && item.fid > 0) {
          allFollowing.push({
            fid: item.fid,
            username: item.username || undefined,
            displayName: item.display_name || undefined
          });
        }
      }
      
      // Check for next cursor
      const nextCursor: string | undefined = data.next?.cursor || data.next_cursor;
      if (!nextCursor) {
        console.log('No more pages available');
        break;
      }
      
      cursor = nextCursor;
      
      // Add a small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Error fetching following batch:', error);
      break;
    }
  }
  
  console.log(`Total accounts fetched: ${allFollowing.length}`);
  return allFollowing;
}

// Unfollow a single account
async function unfollowAccount(
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
    
    const messageResult = await makeLinkRemove(
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
    const { signerData, useSSE } = await request.json();
    
    console.log('Received signer data:', { 
      hasFid: !!signerData?.fid, 
      hasPrivateKey: !!signerData?.privateKey,
      fid: signerData?.fid,
      useSSE
    });
    
    if (!signerData || !signerData.fid || !signerData.privateKey) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    const sourceFid = parseInt(signerData.fid);
    if (isNaN(sourceFid)) {
      return NextResponse.json({ error: 'Invalid FID in signer data' }, { status: 400 });
    }
    
    console.log(`Processing unfollow for FID: ${sourceFid}`);
    
    // Get all accounts to unfollow (using the same batching logic as backup)
    const accounts = await getAllFollowing(sourceFid);
    
    if (accounts.length === 0) {
      return NextResponse.json({ 
        message: 'No accounts found to unfollow',
        unfollowed: 0,
        failed: 0,
        total: 0
      });
    }
    
    console.log(`Starting to unfollow ${accounts.length} accounts...`);
    
    // If SSE is requested, return a streaming response
    if (useSSE) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          
          // Send initial progress
          sendProgress({ type: 'progress', current: 0, total: accounts.length, message: 'Starting unfollow process...' });
          
          // Process unfollows
          const results = [];
          const unfollowedAccounts = [];
          let successCount = 0;
          let failCount = 0;
          
          for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            console.log(`Unfollowing FID ${account.fid}...`);
            
            const result = await unfollowAccount(sourceFid, signerData.privateKey, account.fid);
            
            const resultData = {
              targetFid: account.fid,
              username: account.username,
              displayName: account.displayName,
              success: result.success,
              hash: result.hash,
              error: result.error
            };
            
            results.push(resultData);
            
            if (result.success) {
              successCount++;
              unfollowedAccounts.push({
                fid: account.fid,
                username: account.username,
                displayName: account.displayName,
                unfollowedAt: Date.now()
              });
              console.log(`✅ Successfully unfollowed FID ${account.fid}`);
            } else {
              failCount++;
              console.log(`❌ Failed to unfollow FID ${account.fid}: ${result.error}`);
            }
            
            // Send progress update
            sendProgress({
              type: 'progress',
              current: i + 1,
              total: accounts.length,
              successCount,
              failCount,
              message: `Unfollowing FID ${account.fid}...`
            });
            
            // Add a small delay between unfollows to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Store unfollowed accounts in Redis
          if (unfollowedAccounts.length > 0) {
            await storeUnfollowedAccounts(signerData.address, unfollowedAccounts);
          }
          
          // Mark backup as unfollowed if we had any successful unfollows
          if (successCount > 0) {
            await markBackupAsUnfollowed(signerData.address);
          }
          
          // Send final result
          sendProgress({
            type: 'complete',
            message: `Unfollowed ${successCount} accounts, ${failCount} failed`,
            unfollowed: successCount,
            failed: failCount,
            total: accounts.length,
            results,
            unfollowedAccounts
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
    const unfollowedAccounts = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const account of accounts) {
      console.log(`Unfollowing FID ${account.fid}...`);
      const result = await unfollowAccount(sourceFid, signerData.privateKey, account.fid);
      
      const resultData = {
        targetFid: account.fid,
        username: account.username,
        displayName: account.displayName,
        success: result.success,
        hash: result.hash,
        error: result.error
      };
      
      results.push(resultData);
      
      if (result.success) {
        successCount++;
        unfollowedAccounts.push({
          fid: account.fid,
          username: account.username,
          displayName: account.displayName,
          unfollowedAt: Date.now()
        });
        console.log(`✅ Successfully unfollowed FID ${account.fid}`);
      } else {
        failCount++;
        console.log(`❌ Failed to unfollow FID ${account.fid}: ${result.error}`);
      }
      
      // Add a small delay between unfollows to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Unfollow complete: ${successCount} successful, ${failCount} failed`);
    
    // Store unfollowed accounts in Redis
    if (unfollowedAccounts.length > 0) {
      await storeUnfollowedAccounts(signerData.address, unfollowedAccounts);
    }
    
    // Mark backup as unfollowed if we had any successful unfollows
    if (successCount > 0) {
      await markBackupAsUnfollowed(signerData.address);
    }
    
    return NextResponse.json({
      message: `Unfollowed ${successCount} accounts, ${failCount} failed`,
      unfollowed: successCount,
      failed: failCount,
      total: accounts.length,
      results,
      unfollowedAccounts
    });
    
  } catch (error) {
    console.error('Unfollow batch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 