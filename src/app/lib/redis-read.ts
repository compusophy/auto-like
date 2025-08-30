// Frontend Redis read functions (using read-only token)
import { redisReadOnly, isRedisAvailable } from './redis-client';
import type { Signer } from './types';

// Get signer from Redis by ETH address
export async function getSignerByEthAddress(ethAddress: string): Promise<Signer | null> {
  console.log('getSignerByEthAddress called for address:', ethAddress);
  
  if (!redisReadOnly) {
    console.warn('Redis not configured - cannot fetch signer data');
    return null;
  }
  
  try {
    const stored = await redisReadOnly.get(`signer_${ethAddress}`);
    if (!stored) return null;
    
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch (error) {
    console.error('Error fetching signer from Redis:', error);
    return null;
  }
}

// Legacy function for backward compatibility
export async function getSigner(fid: string): Promise<Signer | null> {
  console.log('getSigner called for fid:', fid);

  if (!redisReadOnly) {
    console.warn('Redis not configured - cannot fetch signer data');
    return null;
  }

  try {
    const stored = await redisReadOnly.get(`signer_${fid}`);
    if (!stored) return null;

    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch (error) {
    console.error('Error fetching signer from Redis:', error);
    return null;
  }
}

// Get signer by FID (searches through all existing signers)
export async function getSignerByFid(fid: number): Promise<{ signer: Signer; ethAddress: string } | null> {
  console.log('getSignerByFid called for fid:', fid);

  if (!redisReadOnly) {
    console.warn('Redis not configured - cannot fetch signer data');
    return null;
  }

  try {
    // Use SCAN to find all signer keys (more reliable than hardcoded list)
    const signerKeys = [];
    let cursor = '0';

    do {
      const [newCursor, keys] = await redisReadOnly.scan(cursor, {
        match: 'signer_*',
        count: 100
      });
      cursor = newCursor;
      signerKeys.push(...keys);

      // Limit to prevent infinite loops
      if (signerKeys.length > 1000) break;
    } while (cursor !== '0');

    console.log(`Scanning ${signerKeys.length} signer keys for FID ${fid}`);

    // Search through all signer keys
    for (const signerKey of signerKeys) {
      try {
        const stored = await redisReadOnly.get(signerKey);

        if (stored) {
          const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
          const signer = parsed as Signer;

          // Check if this signer has the requested FID
          if (signer.fid && parseInt(signer.fid) === fid) {
            const ethAddress = signerKey.replace('signer_', '');
            console.log(`✅ Found signer for FID ${fid} at address ${ethAddress}`);
            return { signer, ethAddress };
          }
        }
      } catch (error) {
        // Continue to next signer
        console.log(`⚠️ Error parsing signer ${signerKey}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`❌ No signer found for FID ${fid} after scanning ${signerKeys.length} keys`);
    return null;
  } catch (error) {
    console.error('Error finding signer by FID:', error);
    return null;
  }
} 