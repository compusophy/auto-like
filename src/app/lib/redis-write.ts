// Server-only Redis write functions (using full token)
// NEVER import this in client-side code!
import { redisServer } from './redis-client';
import type { Signer } from './types';

// Store signer by ETH address (server-only)
export async function storeSignerByEthAddress(ethAddress: string, signer: Signer): Promise<void> {
  console.log('🔧 storeSignerByEthAddress called:', { 
    ethAddress, 
    hasUrl: !!process.env.UPSTASH_REDIS_URL,
    hasToken: !!process.env.UPSTASH_REDIS_TOKEN,
    signerData: {
      fid: signer.fid,
      isValidated: signer.isValidated,
      isPending: signer.isPending
    }
  });
  
  try {
    const key = `signer_${ethAddress}`;
    const value = JSON.stringify(signer);
    
    console.log('💾 Storing to Redis with key:', key);
    const result = await redisServer.set(key, value);
    console.log('✅ Redis set result:', result);
    
    // Verify the store worked
    const verification = await redisServer.get(key);
    if (!verification) {
      throw new Error('Redis verification failed - key not found after storage');
    }
    console.log('✅ Redis storage verified successfully');
    
  } catch (error) {
    console.error('❌ Redis storage error:', error);
    console.error('Redis config check:', {
      hasUrl: !!process.env.UPSTASH_REDIS_URL,
      hasToken: !!process.env.UPSTASH_REDIS_TOKEN,
      urlPreview: process.env.UPSTASH_REDIS_URL?.slice(0, 20) + '...'
    });
    throw error;
  }
}

// Check if signer is valid (exists and fully validated)
export function isSignerValid(signer: Signer | null): boolean {
  return signer !== null && signer.isValidated && !signer.isPending;
}

// Validate and update signer by ETH address (server-only)
export async function validateSignerByEthAddress(ethAddress: string): Promise<{ isValid: boolean; signer?: Signer }> {
  const stored = await redisServer.get(`signer_${ethAddress}`);
  
  if (!stored) {
    return { isValid: false };
  }
  
  try {
    const signer = typeof stored === 'string' ? JSON.parse(stored) : stored;
    
    // Check if already valid
    if (isSignerValid(signer)) {
      return { isValid: true, signer };
    }
    
    // Update validation status - this just checks existence, doesn't validate
    return { isValid: false, signer };
  } catch {
    return { isValid: false };
  }
}

// Complete signer validation by ETH address (when user approves)
export async function completeSignerValidation(ethAddress: string, fid?: string): Promise<{ isValid: boolean; signer?: Signer }> {
  console.log('🔧 completeSignerValidation called with:', { ethAddress, fid });
  
  const stored = await redisServer.get(`signer_${ethAddress}`);
  
  if (!stored) {
    console.log('❌ completeSignerValidation: No stored signer found for', ethAddress);
    return { isValid: false };
  }
  
  try {
    const signer = typeof stored === 'string' ? JSON.parse(stored) : stored;
    console.log('📦 Current signer state:', {
      fid: signer.fid,
      isPending: signer.isPending,
      isValidated: signer.isValidated,
      token: signer.token?.slice(0, 10) + '...'
    });
    
    // Complete the validation process
    const updatedSigner = { 
      ...signer, 
      isPending: false, 
      isValidated: true,
      fid: fid || signer.fid
    };
    
    console.log('💾 Updating signer to:', {
      fid: updatedSigner.fid,
      isPending: updatedSigner.isPending,
      isValidated: updatedSigner.isValidated,
      token: updatedSigner.token?.slice(0, 10) + '...'
    });
    
    await redisServer.set(`signer_${ethAddress}`, JSON.stringify(updatedSigner));
    
    const isValidResult = isSignerValid(updatedSigner);
    console.log('✅ completeSignerValidation result:', { isValid: isValidResult, signerValidated: updatedSigner.isValidated });
    
    return { isValid: isValidResult, signer: updatedSigner };
  } catch (error) {
    console.error('❌ completeSignerValidation error:', error);
    return { isValid: false };
  }
}

// Delete signer by ETH address (server-only)
export async function deleteSignerByEthAddress(ethAddress: string): Promise<{ success: boolean; message: string }> {
  try {
    const deleted = await redisServer.del(`signer_${ethAddress}`);
    
    if (deleted === 1) {
      return { success: true, message: 'Signer deleted successfully' };
    } else {
      return { success: false, message: 'Signer not found' };
    }
  } catch (error) {
    console.error('Error deleting signer:', error);
    return { success: false, message: 'Failed to delete signer' };
  }
}

// Get signer by FID (server-only) - Legacy function for backward compatibility
export async function getSignerByFid(fid: string): Promise<Signer | null> {
  console.log('getSignerByFid called for fid:', fid);
  
  const stored = await redisServer.get(`signer_${fid}`);
  if (!stored) return null;
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch {
    return null;
  }
} 