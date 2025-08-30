"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import type { SignerData } from '../lib/types';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Heart, Loader2, Play, Pause, Plus, X } from 'lucide-react';

interface AutoLikeConfig {
  sourceFid: number; // FID that will do the liking
  targetFids: number[]; // FIDs to auto-like posts from
  frequency: number; // in minutes
  isActive: boolean;
  lastCheck?: number;
}

interface AutoLikeToolsProps {
  signerData: SignerData | null;
}

export function AutoLikeTools({ signerData }: AutoLikeToolsProps) {
  const { address, isConnected } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-like configuration state
  const [config, setConfig] = useState<AutoLikeConfig>({
    sourceFid: parseInt(signerData?.fid || '0'), // Use authenticated user's FID
    targetFids: [350911], // Default FIDs to auto-like posts from
    frequency: 1, // Default 1 minute
    isActive: false,
    lastCheck: undefined
  });

  // Form state
  const [targetFidsInput, setTargetFidsInput] = useState<string[]>(['350911']);
  const [newTargetFidInput, setNewTargetFidInput] = useState('');
  
  // Status messages
  const [message, setMessage] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Target FID management functions
  const addTargetFid = async () => {
    if (config.isActive) {
      setMessage('⏸️ Stop auto-like before modifying target FIDs');
      return;
    }

    const newFid = parseInt(newTargetFidInput.trim());
    if (!isNaN(newFid) && newFid > 0 && !targetFidsInput.includes(newTargetFidInput.trim())) {
      const updatedFids = [...targetFidsInput, newTargetFidInput.trim()];
      setTargetFidsInput(updatedFids);
      setNewTargetFidInput('');

      // Auto-save configuration
      await saveConfiguration(updatedFids);
    }
  };

  const removeTargetFid = async (fidToRemove: string) => {
    if (config.isActive) {
      setMessage('⏸️ Stop auto-like before modifying target FIDs');
      return;
    }

    const updatedFids = targetFidsInput.filter(fid => fid !== fidToRemove);
    setTargetFidsInput(updatedFids);

    // Auto-save configuration
    await saveConfiguration(updatedFids);
  };

  // Auto-save function
  const saveConfiguration = async (fids: string[]) => {
    if (!signerData || !address) return;

    try {
      const response = await fetch('/api/auto-like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerAddress: address,
          fid: signerData.fid,
          sourceFid: parseInt(signerData.fid),
          targetFids: fids.map(fid => parseInt(fid)).filter(fid => !isNaN(fid) && fid > 0),
          frequency: config.frequency || 1, // Keep existing frequency
          isActive: config.isActive // Keep existing active state
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('✅ Configuration auto-saved');
        // Update local config to reflect server state
        setConfig(prev => ({
          ...prev,
          targetFids: fids.map(fid => parseInt(fid)).filter(fid => !isNaN(fid) && fid > 0)
        }));
      } else {
        console.warn('⚠️ Auto-save failed:', data.error);
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const handleNewTargetFidKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTargetFid();
    }
  };



  // Load existing configuration when component mounts
  useEffect(() => {
    if (signerData && address) {
      // Load existing configuration
      fetch(`/api/auto-like?signerAddress=${encodeURIComponent(address)}&fid=${signerData.fid}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (data?.success && data.config) {
            const targetFids = data.config.targetFids ||
                             (data.config.targetFid ? [data.config.targetFid] : [350911]);
            setConfig({
              sourceFid: parseInt(signerData.fid),
              targetFids: targetFids,
              frequency: data.config.frequency || 1,
              isActive: data.config.isActive || false,
              lastCheck: data.config.lastCheck
            });
            setTargetFidsInput(targetFids.map(fid => fid.toString()));
            if (data.config.isActive) {
              setMessage('✅ Auto-like is currently active');
            } else {
              setMessage('⏸️ Auto-like is currently paused');
            }
          } else {
            setTargetFidsInput(['350911']);
          }
        })
        .catch((error) => {
          console.error('Error loading auto-like config:', error);
          setTargetFidsInput(['350911']);
        });
    }
  }, [signerData, address]);

  // Update source FID when signer data changes
  useEffect(() => {
    if (signerData?.fid) {
      setConfig(prev => ({
        ...prev,
        sourceFid: parseInt(signerData.fid)
      }));
    }
  }, [signerData?.fid]);

  const handleToggleAutoLike = async () => {
    if (!signerData || !address) {
      setMessage('❌ Signer data not found');
      return;
    }

    // Prevent starting if no target FIDs
    if (!config.isActive && targetFidsInput.length === 0) {
      setMessage('❌ Add at least one target FID before starting');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const newActiveState = !config.isActive;

      const response = await fetch('/api/auto-like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerAddress: address,
          fid: signerData.fid,
          sourceFid: config.sourceFid,
          targetFids: config.targetFids,
          frequency: config.frequency,
          isActive: newActiveState
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setConfig(prev => ({ ...prev, isActive: newActiveState }));
        setMessage(newActiveState ? '✅ Auto-like activated' : '⏸️ Auto-like paused');
      } else {
        setMessage(`❌ ${data.error || 'Failed to toggle auto-like'}`);
      }
    } catch (error) {
      console.error('Toggle error:', error);
      setMessage('❌ Failed to toggle auto-like');
    } finally {
      setIsLoading(false);
    }
  };








  // Show nothing when not connected
  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center space-x-2">
              <Heart className="h-5 w-5 text-red-500 fill-red-500" />
              <span className="font-medium">Auto-Like</span>
            </span>
            <Button
              onClick={handleToggleAutoLike}
              disabled={isLoading || (!config.isActive && targetFidsInput.length === 0)}
              size="sm"
              variant={config.isActive ? "destructive" : "default"}
              className={config.isActive ? "" : "bg-green-600 hover:bg-green-700"}
            >
              {config.isActive ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {targetFidsInput.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {targetFidsInput.map((fid, index) => (
                  <div key={index} className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md text-sm font-medium">
                    <span>{fid}</span>
                    <button
                      onClick={() => removeTargetFid(fid)}
                      className="text-blue-500 hover:text-blue-700 ml-1 p-0.5 hover:bg-blue-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading || config.isActive}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                value={newTargetFidInput}
                onChange={(e) => setNewTargetFidInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTargetFid()}
                placeholder={config.isActive ? "Stop auto-like to modify" : "Enter FID to add"}
                min="1"
                disabled={isLoading || config.isActive}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              <Button
                type="button"
                onClick={addTargetFid}
                disabled={isLoading || !newTargetFidInput.trim() || config.isActive}
                size="sm"
                variant="outline"
                className="h-10 w-10 p-0 flex items-center justify-center shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {configMessage && (
            <div className={`px-3 py-2 rounded-md text-sm font-medium ${
              configMessage.startsWith('✅')
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {configMessage}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
