// Frontend Redis read functions (using read-only token)
import { redisReadOnly } from './redis-client';
import type { Signer } from './types';

// Get signer from Redis by ETH address
export async function getSignerByEthAddress(ethAddress: string): Promise<Signer | null> {
  console.log('getSignerByEthAddress called for address:', ethAddress);
  
  const stored = await redisReadOnly.get(`signer_${ethAddress}`);
  if (!stored) return null;
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch {
    return null;
  }
}

// Legacy function for backward compatibility
export async function getSigner(fid: string): Promise<Signer | null> {
  console.log('getSigner called for fid:', fid);
  
  const stored = await redisReadOnly.get(`signer_${fid}`);
  if (!stored) return null;
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch {
    return null;
  }
} 