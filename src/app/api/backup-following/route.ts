import { NextRequest, NextResponse } from 'next/server';
import { getSignerByEthAddress } from '../../lib/redis-read';
import { storeBackupData, completeSignerValidation } from '../../lib/redis-write';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'F27E25B1-9B59-494C-85CC-2189447DD04A';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster';

interface Following {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  followerCount?: number;
  followingCount?: number;
  verifiedAddresses?: string[];
}

// Get all following accounts with pagination and progress updates
async function getAllFollowingWithProgress(sourceFid: number, sendProgress: (data: any) => void): Promise<Following[]> {
  const allFollowing: Following[] = [];
  let cursor: string | undefined = undefined;
  const batchSize = 100; // Neynar API limit
  let batchCount = 0;
  
  console.log(`Starting to fetch all following for FID ${sourceFid}...`);
  
  while (true) {
    try {
      batchCount++;
      const url: string = `${NEYNAR_API_URL}/following?fid=${sourceFid}&limit=${batchSize}${cursor ? `&cursor=${cursor}` : ''}`;
      
      // Send progress update before fetching this batch
      sendProgress({ 
        type: 'progress', 
        current: allFollowing.length, 
        total: allFollowing.length + batchSize, 
        message: `Fetching batch ${batchCount} (${allFollowing.length} accounts so far)...` 
      });
      
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
            displayName: item.user.display_name || undefined,
            pfpUrl: item.user.pfp_url || undefined,
            followerCount: item.user.follower_count || undefined,
            followingCount: item.user.following_count || undefined,
            verifiedAddresses: item.user.verified_addresses || undefined
          });
        } else if (item && item.fid && typeof item.fid === 'number' && item.fid > 0) {
          allFollowing.push({
            fid: item.fid,
            username: item.username || undefined,
            displayName: item.display_name || undefined,
            pfpUrl: item.pfp_url || undefined,
            followerCount: item.follower_count || undefined,
            followingCount: item.following_count || undefined,
            verifiedAddresses: item.verified_addresses || undefined
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

// Get all following accounts with pagination (original function for non-SSE)
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
            displayName: item.user.display_name || undefined,
            pfpUrl: item.user.pfp_url || undefined,
            followerCount: item.user.follower_count || undefined,
            followingCount: item.user.following_count || undefined,
            verifiedAddresses: item.user.verified_addresses || undefined
          });
        } else if (item && item.fid && typeof item.fid === 'number' && item.fid > 0) {
          allFollowing.push({
            fid: item.fid,
            username: item.username || undefined,
            displayName: item.display_name || undefined,
            pfpUrl: item.pfp_url || undefined,
            followerCount: item.follower_count || undefined,
            followingCount: item.following_count || undefined,
            verifiedAddresses: item.verified_addresses || undefined
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

// Validate signer before allowing backup operations
async function validateSigner(signerData: any): Promise<{ isValid: boolean; message: string; fid?: string }> {
  try {
    console.log('🔧 Validating signer before backup for address:', signerData.address);

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

// Convert data to CSV format
function convertToCSV(data: Following[]): string {
  const headers = [
    'FID',
    'Username',
    'Display Name',
    'Profile Picture URL',
    'Follower Count',
    'Following Count',
    'Verified Addresses'
  ];
  
  const csvRows = [headers.join(',')];
  
  for (const account of data) {
    const row = [
      account.fid,
      account.username ? `"${account.username.replace(/"/g, '""')}"` : '',
      account.displayName ? `"${account.displayName.replace(/"/g, '""')}"` : '',
      account.pfpUrl ? `"${account.pfpUrl}"` : '',
      account.followerCount || '',
      account.followingCount || '',
      Array.isArray(account.verifiedAddresses) && account.verifiedAddresses.length > 0 ? `"${account.verifiedAddresses.join(';')}"` : ''
    ];
    csvRows.push(row.join(','));
  }
  
  return csvRows.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { signerData, useSSE } = await request.json();
    
    if (!signerData || !signerData.fid) {
      return NextResponse.json({ error: 'Valid signer data is required' }, { status: 400 });
    }
    
    const sourceFid = parseInt(signerData.fid);
    if (isNaN(sourceFid)) {
      return NextResponse.json({ error: 'Invalid FID in signer data' }, { status: 400 });
    }

    // Validate signer before proceeding with backup
    console.log('🔍 Validating signer before backup...');
    const validationResult = await validateSigner(signerData);
    
    if (!validationResult.isValid) {
      console.log('❌ Signer validation failed:', validationResult.message);
      return NextResponse.json({ 
        error: `Signer validation failed: ${validationResult.message}` 
      }, { status: 403 });
    }
    
    console.log('✅ Signer validation successful, proceeding with backup...');
    
    // If SSE is requested, return a streaming response
    if (useSSE) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          const sendProgress = (data: any) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };
          
          // Send initial progress
          sendProgress({ type: 'progress', current: 0, total: 0, message: 'Validating signer...' });
          
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
            
            sendProgress({ type: 'progress', current: 0, total: 0, message: 'Connecting to Farcaster API...' });
            
            // Get all following accounts with progress updates
            const following = await getAllFollowingWithProgress(sourceFid, sendProgress);
            
            if (following.length === 0) {
              sendProgress({
                type: 'complete',
                message: 'No following accounts found',
                count: 0,
                csvData: ''
              });
              controller.close();
              return;
            }
            
            // Send progress for storing data
            sendProgress({ type: 'progress', current: following.length, total: following.length, message: `Storing ${following.length} accounts in database...` });
            
            // Store backup data in Redis
            await storeBackupData(signerData.address, following);
            
            // Convert to CSV for download
            const csvData = convertToCSV(following);
            
            // Send final result
            sendProgress({
              type: 'complete',
              message: `Successfully backed up ${following.length} following accounts`,
              count: following.length,
              csvData,
              accounts: following
            });
            
          } catch (error) {
            console.error('Backup error in SSE:', error);
            sendProgress({
              type: 'error',
              message: 'Failed to backup accounts',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
          
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
    const following = await getAllFollowing(sourceFid);
    
    if (following.length === 0) {
      return NextResponse.json({ 
        message: 'No following accounts found',
        count: 0,
        csvData: ''
      });
    }
    
    // Store backup data in Redis
    await storeBackupData(signerData.address, following);
    
    // Convert to CSV for download
    const csvData = convertToCSV(following);
    
    return NextResponse.json({
      message: `Successfully backed up ${following.length} following accounts`,
      count: following.length,
      csvData,
      accounts: following
    });
    
  } catch (error) {
    console.error('Backup following error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 