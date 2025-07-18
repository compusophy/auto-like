"use client";

import { useState, useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
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
  const { connect, connectors } = useConnect();
  const [signerData, setSignerData] = useState<SignerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  // Auto-connect to wallet if not connected
  useEffect(() => {
    if (!isConnected && connectors.length > 0) {
      console.log('🔄 Auto-connecting to wallet...');
      connect({ connector: connectors[0] });
    }
  }, [isConnected, connect, connectors]);

  // Handle authentication state
  useEffect(() => {
    if (isConnected && address) {
      console.log('🔗 Wallet connected:', address);
      
      // Check API for signer data
      fetch(`/api/get-signer/${address}`)
        .then((response) => {
          if (response.ok) {
            return response.json();
          } else if (response.status === 404) {
            // Signer not found, which is expected for new users
            console.log('No existing signer found for address:', address);
            return null;
          } else {
            console.error('API Error:', response.status);
            // Even if API fails, wallet connection is sufficient
            return null;
          }
        })
        .then((data) => {
          console.log('AuthWrapper: Fetched signer data:', data);
          if (data && data.signer) {
            setSignerData({
              address: address,
              fid: data.signer.fid,
              privateKey: data.signer.privateKey
            });
          } else {
            // No signer found, but wallet is connected - this is valid
            setSignerData(null);
          }
        })
        .catch((error) => {
          console.error('AuthWrapper: Error fetching signer:', error);
          // Even if API fails, wallet connection is sufficient
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
    );
  }

  // Show connect button when not connected
  if (!isConnected) {
    return (
      <div className="space-y-6">
        <Button
          onClick={() => connect({ connector: connectors[0] })}
          variant="default"
          size="lg"
          className="w-full"
        >
          <PenTool className="h-4 w-4 mr-2" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  // Render the main app with signer data
  return <>{children(signerData)}</>;
} 