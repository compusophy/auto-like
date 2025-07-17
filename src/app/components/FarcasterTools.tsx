"use client";

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { SignerData } from '../lib/types';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Settings, Download, Users, UserMinus, UserPlus, Loader2, CheckCircle, AlertCircle, Upload, FileText, Cloud } from 'lucide-react';
import { LoadingSpinner, LoadingOverlay } from './LoadingSpinner';
import { ConfirmModal } from './ConfirmModal';
import { sdk } from '@farcaster/miniapp-sdk';

interface UnfollowResult {
  targetFid: number;
  username?: string;
  displayName?: string;
  success: boolean;
  hash?: string;
  error?: string;
}

interface UnfollowedAccount {
  fid: number;
  username?: string;
  displayName?: string;
  unfollowedAt: number;
}

interface BackupResult {
  message: string;
  count: number;
  csvData: string;
  accounts: any[];
}



export function FarcasterTools() {
  const { address, isConnected } = useAccount();
  const [signerData, setSignerData] = useState<SignerData | null>(null);
  const [unfollowing, setUnfollowing] = useState(false);
  const [unfollowResults, setUnfollowResults] = useState<UnfollowResult[]>([]);
  const [unfollowMessage, setUnfollowMessage] = useState<string | null>(null);
  const [unfollowedAccounts, setUnfollowedAccounts] = useState<UnfollowedAccount[]>([]);
  const [unfollowProgress, setUnfollowProgress] = useState({ current: 0, total: 0 });
  
  const [refollowing, setRefollowing] = useState(false);
  const [refollowResults, setRefollowResults] = useState<UnfollowResult[]>([]);
  const [refollowMessage, setRefollowMessage] = useState<string | null>(null);
  const [refollowProgress, setRefollowProgress] = useState({ current: 0, total: 0 });
  
  const [backingUp, setBackingUp] = useState(false);
  const [backupResults, setBackupResults] = useState<BackupResult | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState({ current: 0, total: 0 });

  // Follow FIDs tool states
  const [fidsInput, setFidsInput] = useState<string>('');
  const [followingFids, setFollowingFids] = useState(false);
  const [followFidsProgress, setFollowFidsProgress] = useState({ current: 0, total: 0 });
  const [followFidsMessage, setFollowFidsMessage] = useState<string | null>(null);
  const [followFidsResults, setFollowFidsResults] = useState<UnfollowResult[]>([]);

  // Confirmation modal states
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Load signer data and check for existing backup when connected
  useEffect(() => {
    if (isConnected && address) {
      getSignerByEthAddress(address)
        .then((signer) => {
          console.log('Fetched signer data:', signer);
          if (signer) {
            setSignerData({
              address: address, // Use the address from wagmi hook
              fid: signer.fid,
              privateKey: signer.privateKey
            });
            
            // Check for existing backup using the address from wagmi hook
            checkExistingBackup(address);
          }
        })
        .catch((error) => {
          console.error('Error fetching signer:', error);
        });
    } else {
      setSignerData(null);
      setBackupResults(null);
    }
  }, [isConnected, address]);

  const handleUnfollowAll = async () => {
    if (!signerData) {
      setUnfollowMessage('❌ Signer data not found');
      return;
    }

    if (!backupResults) {
      setUnfollowMessage('❌ Please create a backup first');
      return;
    }

    setUnfollowing(true);
    setUnfollowMessage(null);
    setUnfollowResults([]);
    setUnfollowedAccounts([]);
    setUnfollowProgress({ current: 0, total: backupResults.count });

    try {
      // Use Server-Sent Events for real-time progress
      const response = await fetch('/api/unfollow-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData,
          useSSE: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setUnfollowMessage(`❌ ${errorData.error || 'Failed to unfollow accounts'}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setUnfollowMessage('❌ Failed to start streaming response');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setUnfollowProgress({ 
                  current: data.current, 
                  total: data.total 
                });
                setUnfollowMessage(`🔄 ${data.message}`);
              } else if (data.type === 'complete') {
                setUnfollowMessage(`✅ ${data.message}`);
                setUnfollowResults(data.results || []);
                setUnfollowedAccounts(data.unfollowedAccounts || []);
                setUnfollowProgress({ 
                  current: data.unfollowed || 0, 
                  total: data.total 
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      console.error('Unfollow error:', error);
      setUnfollowMessage('❌ Failed to unfollow accounts');
    } finally {
      setUnfollowing(false);
    }
  };

  const handleRefollowAll = async () => {
    if (!signerData) {
      setRefollowMessage('❌ Signer data not found');
      return;
    }

    setRefollowing(true);
    setRefollowMessage(null);
    setRefollowResults([]);
    setRefollowProgress({ current: 0, total: 0 }); // Will be updated by API

    try {
      // Use Server-Sent Events for real-time progress
      const response = await fetch('/api/refollow-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData,
          useSSE: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setRefollowMessage(`❌ ${errorData.error || 'Failed to re-follow accounts'}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setRefollowMessage('❌ Failed to start streaming response');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setRefollowProgress({ 
                  current: data.current, 
                  total: data.total 
                });
                setRefollowMessage(`🔄 ${data.message}`);
              } else if (data.type === 'complete') {
                setRefollowMessage(`✅ ${data.message}`);
                setRefollowResults(data.results || []);
                setRefollowProgress({ 
                  current: data.refollowed || 0, 
                  total: data.total 
                });
                // Clear the unfollowed accounts after successful re-follow
                setUnfollowedAccounts([]);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      console.error('Re-follow error:', error);
      setRefollowMessage('❌ Failed to re-follow accounts');
    } finally {
      setRefollowing(false);
    }
  };

  const handleBackup = async () => {
    if (!signerData) {
      setBackupMessage('❌ Signer data not found');
      return;
    }

    setBackingUp(true);
    setBackupMessage(null);
    setBackupResults(null);
    setBackupProgress({ current: 0, total: 0 });

    try {
      // Use Server-Sent Events for real-time progress
      const response = await fetch('/api/backup-following', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData,
          useSSE: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setBackupMessage(`❌ ${errorData.error || 'Failed to backup accounts'}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setBackupMessage('❌ Failed to start streaming response');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setBackupProgress({ 
                  current: data.current, 
                  total: data.total 
                });
                setBackupMessage(`🔄 ${data.message}`);
              } else if (data.type === 'complete') {
                setBackupMessage(`✅ ${data.message}`);
                setBackupResults(data);
                setBackupProgress({ 
                  current: data.count || 0, 
                  total: data.count || 0 
                });
              } else if (data.type === 'error') {
                setBackupMessage(`❌ ${data.message}`);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      console.error('Backup error:', error);
      setBackupMessage('❌ Failed to backup accounts');
    } finally {
      setBackingUp(false);
    }
  };

  const downloadCSV = async () => {
    if (!signerData) return;

    try {
      const filename = `farcaster-following-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Get CSV data from backup
      const response = await fetch('/api/generate-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData
        }),
      });

      if (!response.ok) {
        console.error('Failed to generate CSV');
        return;
      }

      const { csvData } = await response.json();
      
      // Generate download ID
      const downloadResponse = await fetch('/api/generate-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvData,
          filename
        }),
      });

      if (!downloadResponse.ok) {
        console.error('Failed to generate download');
        return;
      }

      const { downloadUrl } = await downloadResponse.json();
      
      // Construct full URL for SDK
      const fullUrl = `${window.location.origin}${downloadUrl}`;
      
      // Use SDK to open the download URL
      sdk.actions.openUrl(fullUrl);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  // Follow FIDs tool functions
  const parseFidsInput = (input: string): number[] => {
    const fids: number[] = [];
    const lines = input.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Handle comma-separated or space-separated FIDs
      const parts = trimmed.split(/[,\s]+/);
      for (const part of parts) {
        const fid = parseInt(part.trim());
        if (!isNaN(fid) && fid > 0) {
          fids.push(fid);
        }
      }
    }
    
    return [...new Set(fids)]; // Remove duplicates
  };

  const handleFollowFids = async () => {
    if (!signerData) {
      setFollowFidsMessage('❌ Signer data not found');
      return;
    }

    const fids = parseFidsInput(fidsInput);
    if (fids.length === 0) {
      setFollowFidsMessage('❌ No valid FIDs to follow');
      return;
    }

    setFollowingFids(true);
    setFollowFidsMessage(null);
    setFollowFidsResults([]);
    setFollowFidsProgress({ current: 0, total: fids.length });

    try {
      // Use Server-Sent Events for real-time progress
      const response = await fetch('/api/follow-fids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData,
          fids,
          useSSE: true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setFollowFidsMessage(`❌ ${errorData.error || 'Failed to follow accounts'}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setFollowFidsMessage('❌ Failed to start streaming response');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setFollowFidsProgress({ 
                  current: data.current, 
                  total: data.total 
                });
                setFollowFidsMessage(`🔄 ${data.message}`);
              } else if (data.type === 'complete') {
                setFollowFidsMessage(`✅ ${data.message}`);
                setFollowFidsResults(data.results || []);
                setFollowFidsProgress({ 
                  current: data.followed || 0, 
                  total: data.total 
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      console.error('Follow FIDs error:', error);
      setFollowFidsMessage('❌ Failed to follow accounts');
    } finally {
      setFollowingFids(false);
    }
  };

  const clearFids = () => {
    setFidsInput('');
    setFollowFidsMessage(null);
    setFollowFidsResults([]);
  };

  const checkExistingBackup = async (ethAddress: string) => {
    try {
      console.log('Checking backup for address:', ethAddress);
      
      const response = await fetch('/api/get-backup-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ethAddress
        }),
      });

      console.log('Backup check response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Backup check response data:', data);
        
        if (data.exists) {
          setBackupResults({
            message: `Backup found with ${data.count} accounts`,
            count: data.count,
            csvData: '', // We'll generate this when needed
            accounts: [] // We don't need to load all accounts here
          });
          setBackupMessage(`✅ Found existing backup with ${data.count} accounts`);
        }
      } else {
        const errorData = await response.json();
        console.error('Backup check failed:', errorData);
      }
    } catch (error) {
      console.error('Error checking existing backup:', error);
    }
  };

  const deleteBackup = async () => {
    if (!signerData) {
      return;
    }

    try {
      const response = await fetch('/api/delete-backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerData
        }),
      });

      if (response.ok) {
        setBackupResults(null);
        setBackupMessage('✅ Backup deleted successfully');
      } else {
        setBackupMessage('❌ Failed to delete backup');
      }
    } catch (error) {
      console.error('Delete backup error:', error);
      setBackupMessage('❌ Failed to delete backup');
    }
  };





  // Show signer required message when wallet is connected but no signer data
  if (isConnected && !signerData) {
    return (
      <div className="space-y-6">
        {/* Preview of main interface (disabled) */}
        <Card className="opacity-50">
          <CardContent className="space-y-6 pt-6">
            {/* Step 1: Backup */}
            <div className="space-y-4">
              <Button
                disabled
                variant="default"
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
              >
                <Download className="h-4 w-4 mr-2" />
                Create Backup
              </Button>
            </div>

            {/* Step 2: Unfollow ALL */}
            <div className="space-y-4">
              <Button
                disabled
                variant="destructive"
                size="lg"
                className="w-full"
              >
                <UserMinus className="h-4 w-4 mr-2" />
                Unfollow ALL
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Signer requirement card */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <AlertCircle className="h-12 w-12 text-orange-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Signer Required</h3>
                <p className="text-sm text-gray-600">
                  This app requires a compusophy signer to manage your Farcaster following.
                </p>
              </div>
              <Button
                onClick={() => {
                  sdk.actions.openMiniApp({
                    url: 'https://farcaster.xyz/miniapps/QKe6PvOqtlqH/compusophy-signer'
                  });
                }}
                variant="default"
                size="lg"
                className="w-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Get compusophy Signer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show nothing when not connected
  if (!isConnected) {
    return null;
  }

  return (
    <>
      {/* Loading overlay for long operations */}
      {(unfollowing || refollowing || backingUp || followingFids) && (
        <LoadingOverlay 
          message={
            unfollowing ? `Unfollowing accounts... ${unfollowProgress.current}/${unfollowProgress.total}` :
            refollowing ? `Re-following accounts... ${refollowProgress.current}/${refollowProgress.total}` :
            followingFids ? `Following accounts... ${followFidsProgress.current}/${followFidsProgress.total}` :
            backingUp ? `Backing up following data... ${backupProgress.current}/${backupProgress.total}` :
            'Processing...'
          }
        />
      )}
      
      <div className="space-y-6">
        {/* 3-Step Flow Card */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Step 1: Backup */}
            <div className="space-y-4">
              
                              {!backupResults && (
                  <Button
                    onClick={handleBackup}
                    disabled={backingUp}
                    variant="default"
                    size="lg"
                    className="w-full bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                  >
                    {backingUp ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating Backup... ({backupProgress.current}/{backupProgress.total})
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Create Backup
                      </>
                    )}
                  </Button>
                )}
              
              {backupMessage && !backupMessage.startsWith('✅') && (
                <p className="text-sm text-red-600">
                  {backupMessage}
                </p>
              )}
              
                            {backupResults && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <div className="text-lg font-semibold text-green-800">Backup complete!</div>
                      <div className="text-sm text-green-700">{backupResults.count} accounts stored in the cloud</div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={downloadCSV}
                        variant="outline"
                        size="sm"
                        className="w-full text-green-700 border-green-300 hover:bg-green-100"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download CSV
                      </Button>
                      <Button
                        onClick={() => setShowDeleteConfirm(true)}
                        variant="outline"
                        size="sm"
                        className="w-full text-red-700 border-red-300 hover:bg-red-100"
                      >
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Delete Backup
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Unfollow ALL */}
            <div className="space-y-4">
              
              <Button
                onClick={() => setShowUnfollowConfirm(true)}
                disabled={!backupResults || unfollowing}
                variant="destructive"
                size="lg"
                className="w-full"
              >
                <UserMinus className="h-4 w-4 mr-2" />
                Unfollow ALL {backupResults ? `(${backupResults.count} accounts)` : ''}
              </Button>
              
              {unfollowMessage && !unfollowMessage.startsWith('✅') && (
                <p className="text-sm text-red-600">
                  {unfollowMessage}
                </p>
              )}
              
              {unfollowedAccounts.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-orange-800">
                      ✅ Unfollowed {unfollowedAccounts.length} accounts
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={showUnfollowConfirm}
        onClose={() => setShowUnfollowConfirm(false)}
        onConfirm={() => {
          setShowUnfollowConfirm(false);
          handleUnfollowAll();
        }}
        title="Unfollow All Accounts"
        message={`Are you sure you want to unfollow all ${backupResults?.count || 0} accounts? This action cannot be undone.`}
        confirmText="Unfollow All"
        cancelText="Cancel"
        confirmVariant="destructive"
        isLoading={unfollowing}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteBackup();
        }}
        title="Delete Backup"
        message="Are you sure you want to delete your backup? This will remove all backed-up account data from the database."
        confirmText="Delete Backup"
        cancelText="Cancel"
        confirmVariant="destructive"
      />
    </>
  );
} 