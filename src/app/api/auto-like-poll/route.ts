import { NextRequest, NextResponse } from 'next/server';
import {
  getAllActiveAutoLikeConfigs,
  updateAutoLikeLastCheck,
  hasCastBeenLiked,
  storeLikedCast,
  cleanupOldLikedCasts,
  getDatabaseStats,
  getAutoLikeConfig,
  storeAutoLikeConfig
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

// Global in-memory cache for this polling cycle (cleared after each cycle)
let pollingCycleCache: Map<number, any[]> = new Map();

// Track failed attempts per signer to deactivate after consecutive failures
let failureTracker: Map<string, { count: number; lastFailure: number }> = new Map();

// Constants for failure handling
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_RESET_TIME = 24 * 60 * 60 * 1000; // 24 hours

// Track and handle failed attempts
async function trackFailure(signerAddress: string): Promise<boolean> {
  const now = Date.now();
  const current = failureTracker.get(signerAddress) || { count: 0, lastFailure: 0 };

  // Reset count if it's been more than 24 hours since last failure
  if (now - current.lastFailure > FAILURE_RESET_TIME) {
    current.count = 0;
  }

  current.count++;
  current.lastFailure = now;
  failureTracker.set(signerAddress, current);

  // If too many consecutive failures, deactivate the user
  if (current.count >= MAX_CONSECUTIVE_FAILURES) {
    console.log(`🚨 Too many failures for ${signerAddress} (${current.count} failures), deactivating...`);

    try {
      const config = await getAutoLikeConfig(signerAddress);
      if (config) {
        await storeAutoLikeConfig(signerAddress, {
          ...config,
          isActive: false
        });
        console.log(`✅ Deactivated auto-like for ${signerAddress} due to consecutive failures`);
      }
      return true; // User was deactivated
    } catch (error) {
      console.error(`❌ Failed to deactivate ${signerAddress}:`, error);
    }
  }

  return false; // User not deactivated
}

// Clear failure count on successful operation
function clearFailures(signerAddress: string) {
  failureTracker.delete(signerAddress);
}

// Fetch recent casts for a specific FID (with caching)
async function fetchRecentCasts(fid: number, limit: number = 10): Promise<any[]> {
  // Check cache first
  if (pollingCycleCache.has(fid)) {
    console.log(`📋 Using cached casts for FID ${fid}`);
    return pollingCycleCache.get(fid)!;
  }

  try {
    if (!NEYNAR_API_KEY) {
      throw new Error('NEYNAR_API_KEY not configured');
    }

    // Updated to match the fetch-casts API endpoint (only top-level casts)
    const url = `${NEYNAR_API_URL}?fid=${fid}&limit=${limit}&include_replies=false`;

    console.log(`🌐 Fetching casts for FID ${fid} from Neynar API`);
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
    const casts = data.casts || [];

    // Store in cache for this polling cycle
    pollingCycleCache.set(fid, casts);
    console.log(`💾 Cached ${casts.length} casts for FID ${fid}`);

    return casts;
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
async function processAutoLikes(signerAddress: string, config: any): Promise<{
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

    // Additional validation: ensure source FID matches the signer we retrieved
    if (config.sourceFid !== parseInt(sourceSigner.fid)) {
      console.log(`❌ Source FID mismatch: config has ${config.sourceFid}, signer has ${sourceSigner.fid}`);
      return results;
    }

        // Allow liking your own casts - no FID restriction

    console.log(`🔍 Processing auto-likes for source FID ${config.sourceFid} targeting ${config.targetFids?.length || 0} FIDs: ${config.targetFids?.join(', ') || 'none'}`);

    // Process each target FID
    if (!config.targetFids || config.targetFids.length === 0) {
      console.log('⚠️ No target FIDs configured');
      return results;
    }

    let hasAnySuccess = false;

    for (const targetFid of config.targetFids) {
      console.log(`🎯 Checking target FID ${targetFid}...`);

      // Fetch recent casts from this target FID (now cached!)
      const casts = await fetchRecentCasts(targetFid, 5); // Limit to 5 most recent per FID

      if (casts.length === 0) {
        console.log(`📭 No recent casts found for FID ${targetFid} in the last hour`);
        continue; // Move to next target FID
      }

      console.log(`📋 Found ${casts.length} recent casts from FID ${targetFid} (checking for new likes)`);

      // Process each cast for this target FID
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

          // Check if cast is recent enough (within last hour to avoid liking old casts)
          const castTime = new Date(cast.timestamp).getTime();
          const oneHourAgo = Date.now() - (60 * 60 * 1000);

          if (castTime < oneHourAgo) {
            console.log(`⏭️ Cast ${cast.hash} is too old, skipping`);
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
            console.log(`✅ Successfully auto-liked new cast ${cast.hash} by FID ${targetFid}`);
            results.liked++;
            hasAnySuccess = true;
          } else {
            console.log(`❌ Failed to like cast ${cast.hash}: ${likeResult.error}`);
            results.errors++;
          }

          // Add small delay between likes
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`❌ Error processing cast ${cast.hash}:`, error);
          results.errors++;
        }
      }

      // Add delay between different target FIDs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update last check timestamp
    await updateAutoLikeLastCheck(signerAddress);

    // Handle success/failure tracking
    if (hasAnySuccess) {
      clearFailures(signerAddress);
      console.log(`✅ ${signerAddress} had successful operations, failure count reset`);
    } else if (results.errors > 0) {
      const wasDeactivated = await trackFailure(signerAddress);
      if (wasDeactivated) {
        console.log(`🚨 ${signerAddress} was deactivated due to consecutive failures`);
      }
    }

      } catch (error) {
      console.error(`❌ Error in processAutoLikes for ${signerAddress}:`, error);
      // Track this as a failure
      const wasDeactivated = await trackFailure(signerAddress);
      if (wasDeactivated) {
        console.log(`🚨 ${signerAddress} was deactivated due to error`);
      }
    }

  // Log final summary
  console.log(`📊 Auto-like summary for ${signerAddress} (${config.targetFids?.length || 0} target FIDs): ${results.liked} liked, ${results.skipped} skipped, ${results.errors} errors`);

  return results;
}

// Polling endpoint to check and process auto-likes
export async function POST(request: NextRequest) {
  try {
    // 🔐 SECURITY: Validate request origin for polling
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    const userAgent = request.headers.get('user-agent');

    // Only allow requests from our own domain or cron services
    if (origin && !origin.includes('localhost') && !origin.includes('vercel.app') && !origin.includes('cron')) {
      console.warn('🚨 SECURITY: Unauthorized polling request origin:', origin);
      return NextResponse.json({ error: 'Unauthorized request origin' }, { status: 403 });
    }

    console.log('🔐 SECURITY: Auto-like polling request from:', {
      origin,
      host,
      userAgent: userAgent?.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    });

    console.log('🔄 Starting auto-like polling cycle...');
    
    // Get all active auto-like configurations
    const activeConfigs = await getAllActiveAutoLikeConfigs();
    
    if (activeConfigs.length === 0) {
      console.log('📭 No active auto-like configurations found');
      return NextResponse.json({
        success: true,
        message: 'No active configurations',
        processed: 0
      });
    }

    console.log(`📋 Found ${activeConfigs.length} active auto-like configurations`);
    
    const results = {
      totalProcessed: 0,
      totalLiked: 0,
      totalSkipped: 0,
      totalErrors: 0,
      signerResults: [] as any[]
    };

    // Process each active configuration
    for (const { signerAddress, config } of activeConfigs) {
      try {
        // Check if enough time has passed since last check
        const now = Date.now();
        const frequencyMs = config.frequency * 60 * 1000; // Convert minutes to milliseconds
        const timeSinceLastCheck = now - (config.lastCheck || 0);
        
        if (timeSinceLastCheck < frequencyMs) {
          console.log(`⏰ Skipping ${signerAddress} - not enough time passed (${Math.round(timeSinceLastCheck / 1000)}s < ${config.frequency * 60}s) - will run in ${Math.round((frequencyMs - timeSinceLastCheck) / 1000)}s`);
          continue;
        }

        console.log(`🔄 Processing auto-likes for ${signerAddress}`);
        const signerResults = await processAutoLikes(signerAddress, config);
        
        results.totalProcessed += signerResults.processed;
        results.totalLiked += signerResults.liked;
        results.totalSkipped += signerResults.skipped;
        results.totalErrors += signerResults.errors;
        
        results.signerResults.push({
          signerAddress,
          ...signerResults
        });

        // Add delay between signers to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error processing signer ${signerAddress}:`, error);
        results.totalErrors++;
      }
    }

    console.log('✅ Auto-like polling cycle completed:', {
      totalProcessed: results.totalProcessed,
      totalLiked: results.totalLiked,
      totalSkipped: results.totalSkipped,
      totalErrors: results.totalErrors
    });

    // Clear the polling cycle cache
    const cachedFids = Array.from(pollingCycleCache.keys());
    pollingCycleCache.clear();
    console.log(`🧹 Cleared polling cycle cache (${cachedFids.length} FIDs: ${cachedFids.join(', ')})`);

    return NextResponse.json({
      success: true,
      message: 'Polling cycle completed',
      results,
      cacheCleared: cachedFids.length
    });

  } catch (error) {
    console.error('❌ Auto-like polling error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Get polling status and maintenance options
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'stats') {
      // Get database statistics
      const stats = await getDatabaseStats();
      return NextResponse.json({
        success: true,
        stats,
        message: 'Database statistics retrieved'
      });
    }

    if (action === 'cleanup') {
      // Perform cleanup of old liked casts
      const olderThanHours = parseInt(url.searchParams.get('hours') || '3');
      const result = await cleanupOldLikedCasts(olderThanHours);
      return NextResponse.json({
        success: true,
        cleanup: result,
        message: `Cleaned up ${result.deleted} liked casts older than ${olderThanHours} hours`
      });
    }

    // Default: Get polling status
    const activeConfigs = await getAllActiveAutoLikeConfigs();

    return NextResponse.json({
      success: true,
      activeConfigs: activeConfigs.length,
      configs: activeConfigs.map(({ signerAddress, config }) => ({
        signerAddress,
        targetFid: config.targetFid,
        frequency: config.frequency,
        lastCheck: config.lastCheck,
        nextCheck: config.lastCheck ? config.lastCheck + (config.frequency * 60 * 1000) : Date.now()
      }))
    });

  } catch (error) {
    console.error('Get polling status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
