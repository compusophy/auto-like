"use client";

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { SignerData } from '../lib/types';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Settings, Download, Users, UserMinus, UserPlus, Loader2, CheckCircle, AlertCircle, Upload, FileText } from 'lucide-react';
import { LoadingSpinner, LoadingOverlay } from './LoadingSpinner';
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

  // Follow FIDs tool states
  const [fidsInput, setFidsInput] = useState<string>('');
  const [followingFids, setFollowingFids] = useState(false);
  const [followFidsProgress, setFollowFidsProgress] = useState({ current: 0, total: 0 });
  const [followFidsMessage, setFollowFidsMessage] = useState<string | null>(null);
  const [followFidsResults, setFollowFidsResults] = useState<UnfollowResult[]>([]);

  // Load signer data when connected
  useEffect(() => {
    if (isConnected && address) {
      getSignerByEthAddress(address)
        .then((signer) => {
          console.log('Fetched signer data:', signer);
          if (signer) {
            setSignerData({
              address: signer.address,
              fid: signer.fid,
              privateKey: signer.privateKey
            });
          }
        })
        .catch((error) => {
          console.error('Error fetching signer:', error);
        });
    } else {
      setSignerData(null);
    }
  }, [isConnected, address]);

  const handleUnfollowAll = async () => {
    if (!signerData) {
      setUnfollowMessage('❌ Please connect your wallet first');
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
      setRefollowMessage('❌ Please connect your wallet first');
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
      setBackupMessage('❌ Please connect your wallet first');
      return;
    }

    setBackingUp(true);
    setBackupMessage(null);
    setBackupResults(null);

    try {
      const response = await fetch('/api/backup-following', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signerData }),
      });

      const result = await response.json();

      if (response.ok) {
        setBackupMessage(`✅ ${result.message}`);
        setBackupResults(result);
      } else {
        setBackupMessage(`❌ ${result.error || 'Failed to backup following'}`);
      }
    } catch (error) {
      console.error('Backup error:', error);
      setBackupMessage('❌ Failed to backup following');
    } finally {
      setBackingUp(false);
    }
  };

  const downloadCSV = () => {
    if (!backupResults?.csvData) return;

    const filename = `farcaster-following-${new Date().toISOString().split('T')[0]}.csv`;
    const downloadUrl = `/api/download?data=${encodeURIComponent(backupResults.csvData)}&filename=${encodeURIComponent(filename)}`;
    
    // Construct full URL for SDK
    const fullUrl = `${window.location.origin}${downloadUrl}`;
    
    // Use SDK to open the download URL
    sdk.actions.openUrl(fullUrl);
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
      setFollowFidsMessage('❌ Please connect your wallet first');
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

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Farcaster Tools
          </CardTitle>
          <CardDescription>
            Connect your wallet to use Farcaster tools
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Show loading while fetching signer data
  if (isConnected && !signerData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Farcaster Tools
          </CardTitle>
          <CardDescription>
            Loading your signer data...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingSpinner message="Loading signer data..." />
        </CardContent>
      </Card>
    );
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
            backingUp ? 'Backing up following data...' :
            'Processing...'
          }
        />
      )}
      
      <div className="space-y-6">
        {/* 3-Step Flow Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Farcaster Tools
            </CardTitle>
            <CardDescription>
              Follow this 3-step process to manage your Farcaster following
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-8">
            {/* Step 1: Backup */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  backupResults ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {backupResults ? <CheckCircle className="h-5 w-5" /> : '1'}
                </div>
                <div>
                  <h4 className="text-lg font-medium flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Create Backup
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    First, backup all your following accounts. This is required before unfollowing.
                  </p>
                </div>
              </div>
              
              {!backupResults && (
                <Button
                  onClick={handleBackup}
                  disabled={backingUp}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  {backingUp ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Backup...
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">
                      ✅ Backup Complete - {backupResults.count} accounts found
                    </span>
                    <Button
                      onClick={downloadCSV}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download CSV
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Unfollow ALL */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  unfollowedAccounts.length > 0 ? 'bg-green-100 text-green-700' : 
                  backupResults ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {unfollowedAccounts.length > 0 ? <CheckCircle className="h-5 w-5" /> : 
                   backupResults ? <AlertCircle className="h-5 w-5" /> : '2'}
                </div>
                <div>
                  <h4 className="text-lg font-medium flex items-center gap-2">
                    <UserMinus className="h-4 w-4" />
                    Unfollow ALL
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Unfollow all accounts from your backup. This will unfollow {backupResults?.count || 0} accounts.
                  </p>
                </div>
              </div>
              
              {backupResults && unfollowedAccounts.length === 0 && (
                <Button
                  onClick={handleUnfollowAll}
                  disabled={unfollowing}
                  variant="destructive"
                  size="lg"
                  className="w-full"
                >
                  {unfollowing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Unfollowing All... ({unfollowProgress.current}/{unfollowProgress.total})
                    </>
                  ) : (
                    <>
                      <UserMinus className="h-4 w-4 mr-2" />
                      Unfollow ALL ({backupResults.count} accounts)
                    </>
                  )}
                </Button>
              )}
              
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

            {/* Step 3: Refollow ALL */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  refollowResults.length > 0 ? 'bg-green-100 text-green-700' : 
                  unfollowedAccounts.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {refollowResults.length > 0 ? <CheckCircle className="h-5 w-5" /> : 
                   unfollowedAccounts.length > 0 ? <AlertCircle className="h-5 w-5" /> : '3'}
                </div>
                <div>
                  <h4 className="text-lg font-medium flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Refollow ALL
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    Re-follow all previously unfollowed accounts.
                  </p>
                </div>
              </div>
              
              {refollowResults.length === 0 && (
                <Button
                  onClick={handleRefollowAll}
                  disabled={refollowing}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  {refollowing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Re-following All... ({refollowProgress.current}/{refollowProgress.total})
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Refollow ALL
                    </>
                  )}
                </Button>
              )}
              
              {refollowMessage && !refollowMessage.startsWith('✅') && (
                <p className="text-sm text-red-600">
                  {refollowMessage}
                </p>
              )}
              
              {refollowResults.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">
                      ✅ Re-followed {refollowResults.length} accounts
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Follow FIDs Tool Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Follow FIDs
            </CardTitle>
            <CardDescription>
              Enter a list of FIDs to follow all accounts
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Enter FIDs
                </h4>
                <p className="text-muted-foreground text-sm">
                  Enter FIDs separated by commas, spaces, or new lines. One FID per line or comma-separated.
                </p>
              </div>
              
              <div className="space-y-3">
                <textarea
                  value={fidsInput}
                  onChange={(e) => setFidsInput(e.target.value)}
                  placeholder="Enter FIDs here...&#10;Example:&#10;373255&#10;812150, 235323&#10;248704 16214"
                  className="w-full h-32 p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                
                <div className="flex gap-3">
                  <Button
                    onClick={handleFollowFids}
                    disabled={followingFids || !fidsInput.trim()}
                    variant="default"
                    size="lg"
                    className="flex-1"
                  >
                    {followingFids ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Following... ({followFidsProgress.current}/{followFidsProgress.total})
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Follow FIDs
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={clearFids}
                    variant="outline"
                    size="lg"
                  >
                    Clear
                  </Button>
                </div>
              </div>
              
              {followFidsMessage && (
                <p className={`text-sm ${
                  followFidsMessage.startsWith('✅') ? 'text-green-600' : 'text-red-600'
                }`}>
                  {followFidsMessage}
                </p>
              )}
              
              {fidsInput.trim() && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">
                      📋 Found {parseFidsInput(fidsInput).length} FIDs to follow
                    </span>
                  </div>
                  
                  <div className="max-h-32 overflow-y-auto">
                    <h5 className="text-sm font-medium mb-2">FIDs to follow:</h5>
                    <div className="space-y-1">
                      {parseFidsInput(fidsInput).slice(0, 10).map((fid, index) => (
                        <div key={index} className="text-xs">
                          FID {fid}
                        </div>
                      ))}
                      {parseFidsInput(fidsInput).length > 10 && (
                        <div className="text-muted-foreground text-xs">
                          ... and {parseFidsInput(fidsInput).length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {followFidsResults.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">
                      ✅ Followed {followFidsResults.length} accounts
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
} 