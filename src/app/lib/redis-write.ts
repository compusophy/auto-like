// Server-only Redis write functions (using full token)
// NEVER import this in client-side code!
import { redisServer, isRedisAvailable } from './redis-client';
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

  if (!redisServer) {
    throw new Error('Redis not configured - cannot store signer data');
  }

  try {
    const key = `signer_${ethAddress}`;
    // Add creation timestamp to the signer data
    const signerWithTimestamp = {
      ...signer,
      createdAt: signer.createdAt || Date.now()
    };
    const value = JSON.stringify(signerWithTimestamp);

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
  if (!redisServer) {
    throw new Error('Redis not configured - cannot validate signer');
  }
  
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
  
  if (!redisServer) {
    throw new Error('Redis not configured - cannot complete signer validation');
  }
  
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
    
    // Complete the validation process (preserve createdAt timestamp)
    const updatedSigner = {
      ...signer,
      isPending: false,
      isValidated: true,
      fid: fid || signer.fid,
      createdAt: signer.createdAt || Date.now() // Preserve original creation time
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
  if (!redisServer) {
    throw new Error('Redis not configured - cannot delete signer');
  }
  
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
  
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get signer by FID');
  }
  
  const stored = await redisServer.get(`signer_${fid}`);
  if (!stored) return null;
  
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return parsed as Signer;
  } catch {
    return null;
  }
}

// Store backup data for a user
export async function storeBackupData(ethAddress: string, accounts: any[]): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot store backup data');
  }
  
  try {
    const key = `backup_${ethAddress}`;
    const backupData = {
      accounts,
      createdAt: Date.now(),
      count: accounts.length,
      unfollowed: false // Track if user has unfollowed from this backup
    };
    
    console.log('💾 Storing backup data for:', ethAddress, 'with', accounts.length, 'accounts');
    await redisServer.set(key, JSON.stringify(backupData));
    console.log('✅ Backup data stored successfully');
  } catch (error) {
    console.error('❌ Error storing backup data:', error);
    throw error;
  }
}

// Get backup data for a user
export async function getBackupData(ethAddress: string): Promise<any[] | null> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get backup data');
  }
  
  try {
    const key = `backup_${ethAddress}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      return null;
    }
    
    const backupData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return backupData.accounts || null;
  } catch (error) {
    console.error('❌ Error retrieving backup data:', error);
    return null;
  }
}

// Get backup info including unfollowed status
export async function getBackupInfo(ethAddress: string): Promise<{ exists: boolean; count: number; unfollowed: boolean } | null> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get backup info');
  }
  
  try {
    const key = `backup_${ethAddress}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      return null;
    }
    
    const backupData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return {
      exists: true,
      count: backupData.count || 0,
      unfollowed: backupData.unfollowed || false
    };
  } catch (error) {
    console.error('❌ Error retrieving backup info:', error);
    return null;
  }
}

// Mark backup as unfollowed
export async function markBackupAsUnfollowed(ethAddress: string): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot mark backup as unfollowed');
  }
  
  try {
    const key = `backup_${ethAddress}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      throw new Error('Backup not found');
    }
    
    const backupData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    const updatedBackupData = {
      ...backupData,
      unfollowed: true
    };
    
    console.log('💾 Marking backup as unfollowed for:', ethAddress);
    await redisServer.set(key, JSON.stringify(updatedBackupData));
    console.log('✅ Backup marked as unfollowed successfully');
  } catch (error) {
    console.error('❌ Error marking backup as unfollowed:', error);
    throw error;
  }
}

// Store unfollowed accounts for a user
export async function storeUnfollowedAccounts(ethAddress: string, accounts: any[]): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot store unfollowed accounts');
  }
  
  try {
    const key = `unfollowed_${ethAddress}`;
    const unfollowedData = {
      accounts,
      unfollowedAt: Date.now(),
      count: accounts.length
    };
    
    console.log('💾 Storing unfollowed accounts for:', ethAddress, 'with', accounts.length, 'accounts');
    await redisServer.set(key, JSON.stringify(unfollowedData));
    console.log('✅ Unfollowed accounts stored successfully');
  } catch (error) {
    console.error('❌ Error storing unfollowed accounts:', error);
    throw error;
  }
}

// Get unfollowed accounts for a user
export async function getUnfollowedAccounts(ethAddress: string): Promise<any[] | null> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get unfollowed accounts');
  }
  
  try {
    const key = `unfollowed_${ethAddress}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      return null;
    }
    
    const unfollowedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return unfollowedData.accounts || null;
  } catch (error) {
    console.error('❌ Error retrieving unfollowed accounts:', error);
    return null;
  }
}

// Store CSV data temporarily for download
export async function storeCSVForDownload(csvData: string, filename: string): Promise<string> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot store CSV for download');
  }
  
  try {
    const downloadId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const key = `csv_download_${downloadId}`;
    
    const downloadData = {
      csvData,
      filename,
      createdAt: Date.now()
    };
    
    console.log('💾 Storing CSV for download:', downloadId);
    await redisServer.setex(key, 3600, JSON.stringify(downloadData)); // Expire in 1 hour
    
    return downloadId;
  } catch (error) {
    console.error('❌ Error storing CSV for download:', error);
    throw error;
  }
}

// Get CSV data for download
export async function getCSVForDownload(downloadId: string): Promise<{ csvData: string; filename: string } | null> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get CSV for download');
  }
  
  try {
    const key = `csv_download_${downloadId}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      return null;
    }
    
    const downloadData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return {
      csvData: downloadData.csvData,
      filename: downloadData.filename
    };
  } catch (error) {
    console.error('❌ Error retrieving CSV for download:', error);
    return null;
  }
}

// Auto-like system functions

// Store liked cast to avoid duplicates
export async function storeLikedCast(signerAddress: string, castHash: string, targetFid: number): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot store liked cast');
  }
  
  try {
    const key = `liked_cast_${signerAddress}_${castHash}`;
    const likedData = {
      castHash,
      targetFid,
      likedAt: Date.now(),
      signerAddress
    };
    
    console.log('💾 Storing liked cast:', { signerAddress, castHash, targetFid });
    // Store for 2 hours (since we only check last hour of casts, no need for longer)
    await redisServer.setex(key, 2 * 60 * 60, JSON.stringify(likedData));
    console.log('✅ Liked cast stored successfully');
  } catch (error) {
    console.error('❌ Error storing liked cast:', error);
    throw error;
  }
}

// Check if cast has already been liked by this signer
export async function hasCastBeenLiked(signerAddress: string, castHash: string): Promise<boolean> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot check liked cast');
  }
  
  try {
    const key = `liked_cast_${signerAddress}_${castHash}`;
    const stored = await redisServer.get(key);
    return stored !== null;
  } catch (error) {
    console.error('❌ Error checking liked cast:', error);
    return false; // Default to not liked if error
  }
}

// Store auto-like configuration
export async function storeAutoLikeConfig(signerAddress: string, config: {
  sourceFid: number; // FID that will do the liking
  targetFids: number[]; // FIDs to auto-like posts from
  frequency: number; // in minutes
  isActive: boolean;
  lastCheck?: number;
}): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot store auto-like config');
  }
  
  try {
    const key = `autolike_config_${signerAddress}`;
    const configData = {
      ...config,
      updatedAt: Date.now()
    };
    
    console.log('💾 Storing auto-like config:', { signerAddress, config });
    await redisServer.set(key, JSON.stringify(configData));
    console.log('✅ Auto-like config stored successfully');
  } catch (error) {
    console.error('❌ Error storing auto-like config:', error);
    throw error;
  }
}

// Get auto-like configuration
export async function getAutoLikeConfig(signerAddress: string): Promise<{
  sourceFid: number;
  targetFids: number[];
  frequency: number;
  isActive: boolean;
  lastCheck?: number;
} | null> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get auto-like config');
  }
  
  try {
    const key = `autolike_config_${signerAddress}`;
    const stored = await redisServer.get(key);
    
    if (!stored) {
      return null;
    }
    
    const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return configData;
  } catch (error) {
    console.error('❌ Error retrieving auto-like config:', error);
    return null;
  }
}

// Update last check timestamp for auto-like
export async function updateAutoLikeLastCheck(signerAddress: string): Promise<void> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot update auto-like last check');
  }
  
  try {
    const config = await getAutoLikeConfig(signerAddress);
    if (config) {
      await storeAutoLikeConfig(signerAddress, {
        ...config,
        lastCheck: Date.now()
      });
    }
  } catch (error) {
    console.error('❌ Error updating auto-like last check:', error);
    throw error;
  }
}

// Get all active auto-like configurations (for polling system)
export async function getAllActiveAutoLikeConfigs(): Promise<Array<{
  signerAddress: string;
  config: {
    sourceFid: number;
    targetFid: number;
    frequency: number;
    isActive: boolean;
    lastCheck?: number;
  };
}>> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get active auto-like configs');
  }

  try {
    // Get all keys matching autolike_config_*
    const keys = await redisServer.keys('autolike_config_*');
    const activeConfigs = [];

    for (const key of keys) {
      const stored = await redisServer.get(key);
      if (stored) {
        const configData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (configData.isActive) {
          const signerAddress = key.replace('autolike_config_', '');
          activeConfigs.push({
            signerAddress,
            config: configData
          });
        }
      }
    }

    return activeConfigs;
  } catch (error) {
    console.error('❌ Error getting active auto-like configs:', error);
    return [];
  }
}

// Cleanup old liked casts (manual maintenance function)
export async function cleanupOldLikedCasts(olderThanHours: number = 3): Promise<{ deleted: number }> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot cleanup liked casts');
  }

  try {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    let deleted = 0;

    // Get all liked cast keys
    const keys = await redisServer.keys('liked_cast_*');

    for (const key of keys) {
      const stored = await redisServer.get(key);
      if (stored) {
        const likedData = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (likedData.likedAt && likedData.likedAt < cutoffTime) {
          await redisServer.del(key);
          deleted++;
        }
      }
    }

    console.log(`🧹 Cleaned up ${deleted} liked casts older than ${olderThanHours} hours`);
    return { deleted };
  } catch (error) {
    console.error('❌ Error cleaning up liked casts:', error);
    return { deleted: 0 };
  }
}

// Get database statistics for monitoring
export async function getDatabaseStats(): Promise<{
  totalKeys: number;
  likedCasts: number;
  autoLikeConfigs: number;
  signers: number;
  backups: number;
}> {
  if (!redisServer) {
    throw new Error('Redis not configured - cannot get database stats');
  }

  try {
    const allKeys = await redisServer.keys('*');
    const likedCasts = allKeys.filter(key => key.startsWith('liked_cast_')).length;
    const autoLikeConfigs = allKeys.filter(key => key.startsWith('autolike_config_')).length;
    const signers = allKeys.filter(key => key.startsWith('signer_')).length;
    const backups = allKeys.filter(key => key.startsWith('backup_')).length;

    return {
      totalKeys: allKeys.length,
      likedCasts,
      autoLikeConfigs,
      signers,
      backups
    };
  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    return {
      totalKeys: 0,
      likedCasts: 0,
      autoLikeConfigs: 0,
      signers: 0,
      backups: 0
    };
  }
} 