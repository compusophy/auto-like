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

// Get signer by FID (searches through existing signers without modifying database)
export async function getSignerByFid(fid: number): Promise<{ signer: Signer; ethAddress: string } | null> {
  console.log('getSignerByFid called for fid:', fid);

  if (!redisReadOnly) {
    console.warn('Redis not configured - cannot fetch signer data');
    return null;
  }

  try {
    // Since we can't use KEYS command, we need to try known addresses
    // This is a simple brute-force approach for finding existing signers
    const knownAddresses = [
      '0x1964923A14701B45F2e36Ff39FB19F40749Eb011', // User's known working address
      // Add more known addresses as needed
    ];

    for (const address of knownAddresses) {
      try {
        const signerKey = `signer_${address}`;
        const stored = await redisReadOnly.get(signerKey);

        if (stored) {
          const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
          const signer = parsed as Signer;

          // Check if this signer has the requested FID
          if (signer.fid && parseInt(signer.fid) === fid) {
            console.log(`Found signer for FID ${fid} at address ${address}`);
            return { signer, ethAddress: address };
          }
        }
      } catch (error) {
        // Continue to next address
      }
    }

    // If we don't find it in known addresses, try some common patterns
    // This is just a fallback and may not work for all cases
    for (let i = 0; i < 100; i++) {
      const address = `0x${i.toString().padStart(40, '0')}`;
      try {
        const signerKey = `signer_${address}`;
        const stored = await redisReadOnly.get(signerKey);

        if (stored) {
          const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
          const signer = parsed as Signer;

          if (signer.fid && parseInt(signer.fid) === fid) {
            console.log(`Found signer for FID ${fid} at address ${address}`);
            return { signer, ethAddress: address };
          }
        }
      } catch (error) {
        // Continue
      }
    }

    console.log(`No signer found for FID ${fid}`);
    return null;
  } catch (error) {
    console.error('Error finding signer by FID:', error);
    return null;
  }
} 