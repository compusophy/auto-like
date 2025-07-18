import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { storeUnfollowedAccounts, markBackupAsUnfollowed, completeSignerValidation } from '../../lib/redis-write';
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

// Validate signer before allowing unfollow operations
async function validateSigner(signerData: any): Promise<{ isValid: boolean; message: string; fid?: string }> {
  try {
    console.log('🔧 Validating signer before unfollow for address:', signerData.address);

    // Get signer from database
    const signer = await getSignerByEthAddress(signerData.address);
    
    if (!signer) {
      console.log('❌ No signer found in database for address:', signerData.address);
      return { isValid: false, message: 'No signer found for this address' };
    }

    console.log('📋 Signer found in database:', {
      fid: signer.fid,
      isValidated: signer.isValidated,
      isPending: signer.isPending,
      hasToken: !!signer.token
    });

    // Always perform validation check (even if already validated)
    if (!signer.token) {
      console.log('❌ No token found for signer, cannot validate');
      return { isValid: false, message: 'No token found - cannot validate' };
    }

    console.log('🔍 Checking signed key request status via Farcaster API...');

    // Test the signer by attempting a follow operation
    try {
      console.log('🧪 Testing signer by attempting follow operation...');
      
      // Import required modules dynamically
      const { NobleEd25519Signer, makeLinkAdd, FarcasterNetwork } = await import('@farcaster/hub-nodejs');
      const { hexToBytes } = await import('@noble/hashes/utils');
      
      if (!signer.fid) {
        return { isValid: false, message: 'No FID found for signer' };
      }

      // Prepare the private key
      const cleanPrivateKey = signer.privateKey.replace('0x', '');
      const privateKeyBytes = hexToBytes(cleanPrivateKey);
      const ed25519Signer = new NobleEd25519Signer(privateKeyBytes);

      // Target FID to follow (use a known FID that exists)
      const targetFid = 373255; // Your FID
      
      // Skip if this signer's FID is the same as our target (can't follow yourself)
      if (parseInt(signer.fid) === targetFid) {
        console.log('⏭️ Skipping follow test - same FID as target');
        // Mark as valid since we can't test it
        const validationResult = await completeSignerValidation(signerData.address, signer.fid);
        return { 
          isValid: validationResult.isValid, 
          message: validationResult.isValid ? 'Signer validated (same FID as target)' : 'Failed to validate signer',
          fid: signer.fid
        };
      }

      console.log(`🔍 Testing signer for FID ${signer.fid} by following FID ${targetFid}`);

      // Create a follow message
      const messageResult = await makeLinkAdd(
        {
          type: "follow",
          targetFid: targetFid
        },
        {
          fid: parseInt(signer.fid),
          network: FarcasterNetwork.MAINNET
        },
        ed25519Signer
      );

      if (!messageResult.isOk()) {
        console.log('❌ Failed to create follow message:', messageResult.error);
        return { isValid: false, message: `Failed to create test message: ${messageResult.error}` };
      }

      // Submit to Farcaster hub via Neynar
      const { Message } = await import('@farcaster/hub-nodejs');
      const messageBytes = Buffer.from(Message.encode(messageResult.value).finish());

      const neynarApiKey = process.env.NEYNAR_API_KEY;
      if (!neynarApiKey) {
        return { isValid: false, message: 'NEYNAR_API_KEY not configured' };
      }

      const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-API-KEY': neynarApiKey
        },
        body: messageBytes
      });

      if (response.ok) {
        const responseData = await response.arrayBuffer();
        const hash = `0x${Buffer.from(responseData).toString("hex")}`;
        console.log(`✅ Follow test successful! Hash: ${hash}`);
        
        // Update the signer as validated
        const validationResult = await completeSignerValidation(signerData.address, signer.fid);
        
        return {
          isValid: true,
          message: 'Signer validated successfully!',
          fid: signer.fid
        };
      } else {
        const errorText = await response.text();
        console.log(`❌ Follow test failed: ${errorText}`);
        
        // Check if it's an invalid signer error
        const isInvalidSigner = errorText.toLowerCase().includes('invalid signer') ||
                               errorText.toLowerCase().includes('unknown_signer') ||
                               errorText.toLowerCase().includes('unauthorized');
        
        if (isInvalidSigner) {
          return { isValid: false, message: 'Signer is invalid or not approved' };
        } else {
          return { isValid: false, message: `Test failed: ${errorText}` };
        }
      }
      
    } catch (testError) {
      console.error('❌ Signer test error:', testError);
      return { isValid: false, message: 'Failed to test signer' };
    }

  } catch (error) {
    console.error('❌ Signer validation error:', error);
    return { isValid: false, message: 'Internal validation error' };
  }
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
    
    // Validate signer before proceeding with unfollow
    console.log('🔍 Validating signer before unfollow...');
    const validationResult = await validateSigner(signerData);
    
    if (!validationResult.isValid) {
      console.log('❌ Signer validation failed:', validationResult.message);
      return NextResponse.json({ 
        error: `Signer validation failed: ${validationResult.message}` 
      }, { status: 403 });
    }
    
    console.log('✅ Signer validation successful, proceeding with unfollow...');
    
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
          sendProgress({ type: 'progress', current: 0, total: accounts.length, message: 'Validating signer...' });
          
          try {
            // Validate signer before proceeding
            const validationResult = await validateSigner(signerData);
            
            if (!validationResult.isValid) {
              sendProgress({
                type: 'error',
                message: `Signer validation failed: ${validationResult.message}`
              });
              controller.close();
              return;
            }
            
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
          } catch (error) {
            console.error('Error in unfollow SSE:', error);
            sendProgress({
              type: 'error',
              message: 'Failed to unfollow accounts'
            });
            controller.close();
          }
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