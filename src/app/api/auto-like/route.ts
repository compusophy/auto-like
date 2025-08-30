import { NextRequest, NextResponse } from 'next/server';
import { 
  storeAutoLikeConfig, 
  getAutoLikeConfig, 
  getAllActiveAutoLikeConfigs,
  updateAutoLikeLastCheck,
  hasCastBeenLiked,
  storeLikedCast
} from '../../lib/redis-write';
import { getSignerByEthAddress, getSignerByFid } from '../../lib/redis-read';
import { 
  NobleEd25519Signer, 
  makeReactionAdd,
  ReactionType,
  FarcasterNetwork,
  Message
} from '@farcaster/hub-nodejs';
import { hexToBytes } from '@noble/hashes/utils';

// Neynar API configuration
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/feed/user/casts';

interface AutoLikeConfig {
  sourceFid: number; // FID that will do the liking
  targetFids: number[]; // FIDs to auto-like posts from
  frequency: number; // in minutes
  isActive: boolean;
}

// Fetch recent casts for a specific FID
async function fetchRecentCasts(fid: number, limit: number = 10): Promise<any[]> {
  try {
    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    const url = `${NEYNAR_API_URL}?fid=${fid}&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'accept': 'application/json',
        'x-api-key': NEYNAR_API_KEY
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch casts for FID ${fid}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.casts || [];
  } catch (error) {
    console.error(`Error fetching casts for FID ${fid}:`, error);
    return [];
  }
}

// Add like reaction to a cast
async function addLikeReaction(
  fid: number, 
  privateKeyHex: string, 
  targetCastHash: string,
  targetFid: number
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    // Remove '0x' prefix if present
    const cleanPrivateKey = privateKeyHex.replace('0x', '');
    
    // Convert private key to proper format and create signer
    const privateKeyBytes = hexToBytes(cleanPrivateKey);
    const signer = new NobleEd25519Signer(privateKeyBytes);

    // Remove '0x' prefix from cast hash if present
    const cleanCastHash = targetCastHash.replace('0x', '');
    
    // Create the like reaction message
    const messageResult = await makeReactionAdd(
      {
        type: ReactionType.LIKE,
        targetCastId: {
          fid: targetFid,
          hash: hexToBytes(cleanCastHash)
        }
      },
      {
        fid: fid,
        network: FarcasterNetwork.MAINNET
      },
      signer
    );

    if (!messageResult.isOk()) {
      return { success: false, error: messageResult.error.message || String(messageResult.error) };
    }

    // Get the message
    const message = messageResult.value;
    
    // Ensure dataBytes is set
    if (!message.dataBytes) {
      return { success: false, error: 'Message is missing dataBytes' };
    }

    // Encode the message to binary
    const messageBytes = Buffer.from(Message.encode(message).finish());

    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    // Use Neynar's HTTP API
    const neynarEndpoint = 'https://hub-api.neynar.com/v1/submitMessage';

    const response = await fetch(neynarEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-API-KEY': NEYNAR_API_KEY
      },
      body: messageBytes
    });
    
    if (response.ok) {
      const responseData = await response.arrayBuffer();
      const hash = `0x${Buffer.from(responseData).toString("hex")}`;
      return { success: true, hash };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Process auto-likes for a specific signer
async function processAutoLikes(signerAddress: string, config: AutoLikeConfig): Promise<{
  processed: number;
  liked: number;
  skipped: number;
  errors: number;
}> {
  const results = { processed: 0, liked: 0, skipped: 0, errors: 0 };
  
  try {
    // Get the source signer data (the FID that will do the liking)
    const sourceSignerData = await getSignerByFid(config.sourceFid);
    if (!sourceSignerData) {
      console.log(`❌ No signer found for source FID ${config.sourceFid}`);
      return results;
    }

    const { signer: sourceSigner, ethAddress: sourceAddress } = sourceSignerData;

    if (!sourceSigner || !sourceSigner.isValidated || !sourceSigner.privateKey) {
      console.log(`❌ Invalid source signer for FID ${config.sourceFid}`);
      return results;
    }

    // Process each target FID
    for (const targetFid of config.targetFids) {
      // Skip if source FID is the same as target (can't like your own casts)
      if (config.sourceFid === targetFid) {
        console.log(`⏭️ Skipping auto-like - source FID ${config.sourceFid} same as target FID ${targetFid}`);
        continue;
      }

      console.log(`🔍 Processing auto-likes for source FID ${config.sourceFid} targeting FID ${targetFid}`);

      // Fetch recent casts from target FID
      const casts = await fetchRecentCasts(targetFid, 10);
    
      if (casts.length === 0) {
        console.log(`📭 No recent casts found for FID ${targetFid}`);
        continue;
      }

      console.log(`📋 Found ${casts.length} recent casts from FID ${targetFid}`);

      // Process each cast
      for (const cast of casts) {
        results.processed++;

        try {
          // Check if we've already liked this cast
          const alreadyLiked = await hasCastBeenLiked(signerAddress, cast.hash);

          if (alreadyLiked) {
            console.log(`⏭️ Already liked cast ${cast.hash}, skipping`);
            results.skipped++;
            continue;
          }

          // Add like reaction
          const likeResult = await addLikeReaction(
            config.sourceFid,
            sourceSigner.privateKey,
            cast.hash,
            targetFid
          );

          if (likeResult.success) {
            // Store that we liked this cast
            await storeLikedCast(signerAddress, cast.hash, targetFid);
            console.log(`✅ Successfully liked cast ${cast.hash} by FID ${targetFid}`);
            results.liked++;
          } else {
            console.log(`❌ Failed to like cast ${cast.hash}: ${likeResult.error}`);
            results.errors++;
          }

          // Add small delay between likes
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(`❌ Error processing cast ${cast.hash}:`, error);
          results.errors++;
        }
      }

      // Add delay between target FIDs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update last check timestamp
    await updateAutoLikeLastCheck(signerAddress);

  } catch (error) {
    console.error(`❌ Error in processAutoLikes for ${signerAddress}:`, error);
  }

  return results;
}

// Configure auto-like settings
export async function POST(request: NextRequest) {
  try {
    // 🔐 SECURITY: Validate request origin
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');

    // Only allow requests from our own domain
    if (origin && !origin.includes('localhost') && !origin.includes('vercel.app')) {
      console.warn('🚨 SECURITY: Unauthorized request origin:', origin);
      return NextResponse.json({ error: 'Unauthorized request origin' }, { status: 403 });
    }

    const { signerAddress, fid, sourceFid, targetFids, frequency, isActive }: {
      signerAddress: string;
      fid: string;
      sourceFid: number;
      targetFids: number[];
      frequency: number;
      isActive: boolean;
    } = await request.json();

    console.log('🔐 SECURITY: Auto-like config request from:', {
      signerAddress: signerAddress.substring(0, 10) + '...',
      fid,
      origin,
      host,
      timestamp: new Date().toISOString()
    });

    // 🔐 SECURITY: Validate required parameters
    if (!signerAddress) {
      console.warn('🚨 SECURITY: Missing signerAddress in request');
      return NextResponse.json({ error: 'signerAddress is required' }, { status: 400 });
    }

    if (!fid) {
      console.warn('🚨 SECURITY: Missing fid in request');
      return NextResponse.json({ error: 'fid is required' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate signerAddress format (Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(signerAddress)) {
      console.warn('🚨 SECURITY: Invalid signerAddress format:', signerAddress);
      return NextResponse.json({ error: 'Invalid signerAddress format' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate FID format
    const fidNum = parseInt(fid);
    if (isNaN(fidNum) || fidNum <= 0) {
      console.warn('🚨 SECURITY: Invalid FID format:', fid);
      return NextResponse.json({ error: 'Invalid FID format' }, { status: 400 });
    }

    if (isActive && (!sourceFid || !targetFids || targetFids.length === 0 || !frequency)) {
      return NextResponse.json({
        error: 'sourceFid, targetFids and frequency are required when isActive is true'
      }, { status: 400 });
    }

    // 🔐 SECURITY: Validate signer exists and is validated using the passed FID
    const signer = await getSignerByEthAddress(signerAddress);
    if (!signer) {
      console.warn('🚨 SECURITY: Signer not found for address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Signer not found' }, { status: 404 });
    }

    // 🔐 SECURITY: Validate signer data integrity
    if (!signer.fid || !signer.privateKey || typeof signer.isValidated !== 'boolean') {
      console.warn('🚨 SECURITY: Invalid signer data structure for address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Invalid signer data' }, { status: 500 });
    }

    if (!signer.isValidated) {
      console.warn('🚨 SECURITY: Unvalidated signer access attempt for address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Signer is not validated' }, { status: 403 });
    }

    // 🔐 SECURITY: Verify the passed FID matches the signer's FID
    if (parseInt(fid) !== parseInt(signer.fid)) {
      console.warn('🚨 SECURITY: FID mismatch - requested:', fid, 'actual:', signer.fid, 'address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'FID mismatch - authentication required' }, { status: 403 });
    }

    console.log('✅ SECURITY: Signer validation passed for FID:', fid, 'address:', signerAddress.substring(0, 10) + '...');

    // Validate that the source FID matches the authenticated user's signer FID
    if (sourceFid !== parseInt(fid)) {
      return NextResponse.json({
        error: `Source FID ${sourceFid} does not match your authenticated signer FID ${fid}. You can only use your own validated signer.`
      }, { status: 403 });
    }

    // Store configuration
    await storeAutoLikeConfig(signerAddress, {
      sourceFid: sourceFid || 350911, // Default to 350911 as requested
      targetFids: targetFids || [350911], // Default to 350911 as requested
      frequency: frequency || 1, // Default to 1 minute
      isActive,
      lastCheck: Date.now()
    });

    return NextResponse.json({
      success: true,
      message: isActive ? 'Auto-like activated' : 'Auto-like deactivated',
      config: {
        sourceFid: sourceFid || 350911,
        targetFids: targetFids || [350911],
        frequency: frequency || 1,
        isActive,
        lastCheck: Date.now()
      }
    });

  } catch (error) {
    console.error('Auto-like config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get auto-like configuration
export async function GET(request: NextRequest) {
  try {
    // 🔐 SECURITY: Validate request origin
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');

    // Only allow requests from our own domain
    if (origin && !origin.includes('localhost') && !origin.includes('vercel.app')) {
      console.warn('🚨 SECURITY: Unauthorized GET request origin:', origin);
      return NextResponse.json({ error: 'Unauthorized request origin' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const signerAddress = searchParams.get('signerAddress');
    const fid = searchParams.get('fid');

    console.log('🔐 SECURITY: Auto-like GET request from:', {
      signerAddress: signerAddress?.substring(0, 10) + '...',
      fid,
      origin,
      host,
      timestamp: new Date().toISOString()
    });

    // 🔐 SECURITY: Validate required parameters
    if (!signerAddress) {
      console.warn('🚨 SECURITY: Missing signerAddress in GET request');
      return NextResponse.json({ error: 'signerAddress parameter is required' }, { status: 400 });
    }

    if (!fid) {
      console.warn('🚨 SECURITY: Missing fid in GET request');
      return NextResponse.json({ error: 'fid parameter is required' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate signerAddress format (Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(signerAddress)) {
      console.warn('🚨 SECURITY: Invalid signerAddress format in GET:', signerAddress);
      return NextResponse.json({ error: 'Invalid signerAddress format' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate FID format
    const fidNum = parseInt(fid);
    if (isNaN(fidNum) || fidNum <= 0) {
      console.warn('🚨 SECURITY: Invalid FID format in GET:', fid);
      return NextResponse.json({ error: 'Invalid FID format' }, { status: 400 });
    }

    // 🔐 SECURITY: Validate signer exists and is validated using the passed FID
    const signer = await getSignerByEthAddress(signerAddress);
    if (!signer) {
      console.warn('🚨 SECURITY: Signer not found for GET address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Signer not found' }, { status: 404 });
    }

    // 🔐 SECURITY: Validate signer data integrity
    if (!signer.fid || !signer.privateKey || typeof signer.isValidated !== 'boolean') {
      console.warn('🚨 SECURITY: Invalid signer data structure for GET address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Invalid signer data' }, { status: 500 });
    }

    if (!signer.isValidated) {
      console.warn('🚨 SECURITY: Unvalidated signer GET access attempt for address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'Signer is not validated' }, { status: 403 });
    }

    // 🔐 SECURITY: Verify the passed FID matches the signer's FID
    if (parseInt(fid) !== parseInt(signer.fid)) {
      console.warn('🚨 SECURITY: FID mismatch in GET - requested:', fid, 'actual:', signer.fid, 'address:', signerAddress.substring(0, 10) + '...');
      return NextResponse.json({ error: 'FID mismatch - authentication required' }, { status: 403 });
    }

    console.log('✅ SECURITY: GET signer validation passed for FID:', fid, 'address:', signerAddress.substring(0, 10) + '...');

    const config = await getAutoLikeConfig(signerAddress);

    if (!config) {
      // Return default config with user's actual FID
      return NextResponse.json({
        success: true,
        config: {
          sourceFid: parseInt(fid), // Use the authenticated user's FID
          targetFids: [350911], // Default target
          frequency: 1, // Default
          isActive: false,
          lastCheck: null
        }
      });
    }

    // Handle migration from old targetFid to new targetFids format
    const correctedConfig = config as any;
    if (correctedConfig.targetFid && !correctedConfig.targetFids) {
      correctedConfig.targetFids = [correctedConfig.targetFid];
      delete correctedConfig.targetFid;

      // Update stored config with new format
      await storeAutoLikeConfig(signerAddress, correctedConfig);
      console.log('✅ Migrated config from targetFid to targetFids format');
    }

    // Validate that stored config source FID matches authenticated user's FID
    if (config.sourceFid !== parseInt(fid)) {
      console.warn(`Config source FID ${config.sourceFid} doesn't match authenticated FID ${fid}, correcting...`);

      // Auto-correct the source FID to match authenticated user
      const correctedConfig = {
        ...config,
        sourceFid: parseInt(fid)
      };

      // Update the stored config
      await storeAutoLikeConfig(signerAddress, correctedConfig);

      return NextResponse.json({
        success: true,
        config: correctedConfig
      });
    }

    return NextResponse.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('Get auto-like config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Manual trigger for auto-like process (for testing)
export async function PUT(request: NextRequest) {
  try {
    const { signerAddress } = await request.json();

    if (!signerAddress) {
      return NextResponse.json({ error: 'signerAddress is required' }, { status: 400 });
    }

    const config = await getAutoLikeConfig(signerAddress);

    // Handle migration from old targetFid to new targetFids format
    const correctedConfig = config as any;
    if (correctedConfig && correctedConfig.targetFid && !correctedConfig.targetFids) {
      correctedConfig.targetFids = [correctedConfig.targetFid];
      delete correctedConfig.targetFid;

      // Update stored config with new format
      await storeAutoLikeConfig(signerAddress, correctedConfig);
      console.log('✅ Migrated config from targetFid to targetFids format');
    }

    if (!correctedConfig || !correctedConfig.isActive) {
      return NextResponse.json({ error: 'Auto-like not active for this signer' }, { status: 400 });
    }

    console.log(`🔄 Manual trigger for auto-like: ${signerAddress}`);
    const results = await processAutoLikes(signerAddress, correctedConfig);

    return NextResponse.json({
      success: true,
      message: 'Auto-like process completed',
      results
    });

  } catch (error) {
    console.error('Manual auto-like trigger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
