"use client";

import { useEffect, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { Signer } from '../lib/types';
import { ConfirmModal } from './ConfirmModal';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Settings, Wallet, Database, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const [signer, setSigner] = useState<Signer | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Load signer data when connected
  useEffect(() => {
    if (isConnected && address) {
      setLoading(true);
      getSignerByEthAddress(address)
        .then((signerData) => {
          setSigner(signerData);
        })
        .catch((error) => {
          console.error('Error fetching signer:', error);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setSigner(null);
    }
  }, [isConnected, address]);

  const handleValidate = async () => {
    if (!address) return;
    
    setValidating(true);
    setValidationMessage(null);
    
    try {
      const response = await fetch(`/api/validate-signer/${address}`, {
        method: 'POST',
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setValidationMessage(`✅ ${result.message}`);
        // Refresh signer data to show updated status
        const updatedSigner = await getSignerByEthAddress(address);
        setSigner(updatedSigner);
      } else {
        setValidationMessage(`❌ ${result.message || result.error}`);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationMessage('❌ Failed to validate signer');
    } finally {
      setValidating(false);
    }
  };

  const handleDelete = async () => {
    if (!address || !signer) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!address || !signer) return;
    
    setDeleting(true);
    setDeleteMessage(null);
    setShowDeleteModal(false);
    
    try {
      const response = await fetch(`/api/delete-signer/${address}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setDeleteMessage(`✅ ${result.message}`);
        setSigner(null);
      } else {
        setDeleteMessage(`❌ ${result.message || result.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      setDeleteMessage('❌ Failed to delete signer');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings & Database Status
            </DialogTitle>
            <DialogDescription>
              Manage your wallet connection and database settings
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Wallet Connection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Connection
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isConnected ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{address}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Not Connected</span>
                    </div>
                    <div className="space-y-2">
                      {connectors.map((connector) => (
                        <Button
                          key={connector.uid}
                          onClick={() => connect({ connector })}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          Connect {connector.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Database Status */}
            {isConnected && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Database Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading signer data...</span>
                    </div>
                  ) : signer ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Status:</span>
                        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          signer.isValidated 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                            : signer.isPending 
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' 
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {signer.isValidated ? (
                            <>
                              <CheckCircle className="h-3 w-3" />
                              Validated
                            </>
                          ) : signer.isPending ? (
                            <>
                              <AlertCircle className="h-3 w-3" />
                              Pending
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              Not Validated
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex space-x-3">
                        <Button
                          onClick={handleValidate}
                          disabled={validating}
                          variant={signer.isValidated ? "outline" : "default"}
                          size="sm"
                        >
                          {validating ? 'Validating...' : signer.isValidated ? 'Revalidate' : 'Validate'}
                        </Button>
                        
                        <Button
                          onClick={handleDelete}
                          disabled={deleting}
                          variant="destructive"
                          size="sm"
                        >
                          {deleting ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                      
                      {/* Messages */}
                      {validationMessage && (
                        <p className={`text-xs ${
                          validationMessage.startsWith('✅') ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {validationMessage}
                        </p>
                      )}
                      
                      {deleteMessage && (
                        <p className={`text-xs ${
                          deleteMessage.startsWith('✅') ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {deleteMessage}
                        </p>
                      )}
                      
                      {/* Raw Data */}
                      <details className="mt-3">
                        <summary className="text-xs cursor-pointer hover:text-foreground text-muted-foreground">
                          Raw Database Data
                        </summary>
                        <pre className="text-xs overflow-auto whitespace-pre-wrap break-all bg-muted p-2 rounded mt-2">
                          {JSON.stringify(signer, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm">No signer data found for this address</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Signer"
        message="Are you sure you want to delete this signer? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="destructive"
        isLoading={deleting}
      />
    </>
  );
} 