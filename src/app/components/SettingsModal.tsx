"use client";

import { useEffect, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { Signer } from '../lib/types';
import { ConfirmModal } from './ConfirmModal';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Settings, Wallet, Database, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

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
              Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Wallet Connection */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="h-4 w-4" />
                  Wallet Connection
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Connected</span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all bg-muted p-2 rounded">{address}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Not Connected</span>
                    </div>
                    <div className="space-y-3">
                      {connectors.map((connector) => (
                        <Button
                          key={connector.uid}
                          onClick={() => connect({ connector })}
                          variant="outline"
                          size="lg"
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
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database className="h-4 w-4" />
                    Database Status
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading signer data...</span>
                    </div>
                  ) : signer ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
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
                      <div className="flex flex-col gap-3">
                        <Button
                          onClick={handleValidate}
                          disabled={validating}
                          variant={signer.isValidated ? "outline" : "default"}
                          size="lg"
                          className="w-full"
                        >
                          {validating ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Validating...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              {signer.isValidated ? 'Revalidate' : 'Validate'}
                            </>
                          )}
                        </Button>
                        
                        <Button
                          onClick={handleDelete}
                          disabled={deleting}
                          variant="destructive"
                          size="lg"
                          className="w-full"
                        >
                          {deleting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Messages */}
                      {validationMessage && (
                        <div className={`p-3 rounded-lg text-sm ${
                          validationMessage.startsWith('✅') 
                            ? 'bg-green-50 text-green-800 border border-green-200' 
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                          {validationMessage}
                        </div>
                      )}
                      
                      {deleteMessage && (
                        <div className={`p-3 rounded-lg text-sm ${
                          deleteMessage.startsWith('✅') 
                            ? 'bg-green-50 text-green-800 border border-green-200' 
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                          {deleteMessage}
                        </div>
                      )}
                      
                      {/* Raw Data */}
                      <details className="mt-4">
                        <summary className="text-xs cursor-pointer hover:text-foreground text-muted-foreground font-medium">
                          Raw Database Data
                        </summary>
                        <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
                          {JSON.stringify(signer, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm">No signer data found</span>
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
        message="Are you sure you want to delete your signer data? This will remove all your Farcaster authentication data from the database."
        confirmText="Delete Signer"
        cancelText="Cancel"
        confirmVariant="destructive"
        isLoading={deleting}
      />
    </>
  );
} 