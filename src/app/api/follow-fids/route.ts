import { NextRequest, NextResponse } from 'next/server';
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

interface FollowRequest {
  signerData: {
    fid: string;
    privateKey: string;
    address: string;
  };
  fids: number[];
  useSSE?: boolean;
}

// Follow a single account
async function followAccount(
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
    const { signerData, fids, useSSE }: FollowRequest = await request.json();
    
    console.log('Received follow request:', { 
      hasFid: !!signerData?.fid, 
      hasPrivateKey: !!signerData?.privateKey,
      fid: signerData?.fid,
      fidsCount: fids?.length,
      useSSE
    });
    
    if (!signerData || !signerData.fid || !signerData.privateKey) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    if (!fids || !Array.isArray(fids) || fids.length === 0) {
      return NextResponse.json({ error: 'Valid FID list is required' }, { status: 400 });
    }
    
    const sourceFid = parseInt(signerData.fid);
    if (isNaN(sourceFid)) {
      return NextResponse.json({ error: 'Invalid FID in signer data' }, { status: 400 });
    }
    
    console.log(`Processing follow for FID: ${sourceFid}, following ${fids.length} accounts`);
    
    // If SSE is requested, return a streaming response
    if (useSSE) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          
          // Send initial progress
          sendProgress({ type: 'progress', current: 0, total: fids.length, message: 'Starting follow process...' });
          
          // Process follows
          const results = [];
          let successCount = 0;
          let failCount = 0;
          
          for (let i = 0; i < fids.length; i++) {
            const targetFid = fids[i];
            console.log(`Following FID ${targetFid}...`);
            
            const result = await followAccount(sourceFid, signerData.privateKey, targetFid);
            
            const resultData = {
              targetFid,
              success: result.success,
              hash: result.hash,
              error: result.error
            };
            
            results.push(resultData);
            
            if (result.success) {
              successCount++;
              console.log(`✅ Successfully followed FID ${targetFid}`);
            } else {
              failCount++;
              console.log(`❌ Failed to follow FID ${targetFid}: ${result.error}`);
            }
            
            // Send progress update
            sendProgress({
              type: 'progress',
              current: i + 1,
              total: fids.length,
              successCount,
              failCount,
              message: `Following FID ${targetFid}...`
            });
            
            // Add a small delay between follows to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Send final result
          sendProgress({
            type: 'complete',
            message: `Followed ${successCount} accounts, ${failCount} failed`,
            followed: successCount,
            failed: failCount,
            total: fids.length,
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
    
    for (const targetFid of fids) {
      console.log(`Following FID ${targetFid}...`);
      const result = await followAccount(sourceFid, signerData.privateKey, targetFid);
      
      const resultData = {
        targetFid,
        success: result.success,
        hash: result.hash,
        error: result.error
      };
      
      results.push(resultData);
      
      if (result.success) {
        successCount++;
        console.log(`✅ Successfully followed FID ${targetFid}`);
      } else {
        failCount++;
        console.log(`❌ Failed to follow FID ${targetFid}: ${result.error}`);
      }
      
      // Add a small delay between follows to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`Follow complete: ${successCount} successful, ${failCount} failed`);
    
    return NextResponse.json({
      message: `Followed ${successCount} accounts, ${failCount} failed`,
      followed: successCount,
      failed: failCount,
      total: fids.length,
      results
    });
    
  } catch (error) {
    console.error('Follow FIDs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 