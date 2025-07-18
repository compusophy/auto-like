"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { SignerData } from '../lib/types';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader2, PenTool } from 'lucide-react';
import { sdk } from '@farcaster/miniapp-sdk';

interface AuthWrapperProps {
  children: (signerData: SignerData | null) => React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { address, isConnected } = useAccount();
  const [signerData, setSignerData] = useState<SignerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  // Handle authentication state
  useEffect(() => {
    if (isConnected && address) {
      // Check Redis database for signer
      getSignerByEthAddress(address)
        .then((signer) => {
          console.log('AuthWrapper: Fetched signer data:', signer);
          if (signer) {
            setSignerData({
              address: address,
              fid: signer.fid,
              privateKey: signer.privateKey
            });
          } else {
            setSignerData(null);
          }
        })
        .catch((error) => {
          console.error('AuthWrapper: Error fetching signer:', error);
          setSignerData(null);
        })
        .finally(() => {
          setIsLoading(false);
          setHasCheckedAuth(true);
        });
    } else if (!isConnected) {
      // Not connected, we're done loading
      setSignerData(null);
      setIsLoading(false);
      setHasCheckedAuth(true);
    }
  }, [isConnected, address]);

  // Call SDK ready when we have definitive auth state
  useEffect(() => {
    if (hasCheckedAuth) {
      sdk.actions.ready();
    }
  }, [hasCheckedAuth]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">Loading...</h3>
              <p className="text-sm text-gray-600">
                Checking your signer status
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show signer required when wallet is connected but no signer found
  if (isConnected && !signerData) {
    return (
      <div className="space-y-6">
        {/* Signer requirement card */}
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="text-center space-y-4">
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
                <PenTool className="h-4 w-4 mr-2" />
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

  // Render the main app with signer data
  return <>{children(signerData)}</>;
} 