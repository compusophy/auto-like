"use client";

import { useEffect, useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { getSignerByEthAddress } from '../lib/redis-read';
import type { Signer } from '../lib/types';
import { ConfirmModal } from './ConfirmModal';

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

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white font-mono">
              Settings & Database Status
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl"
            >
              ×
            </button>
          </div>
          
          {/* Body */}
          <div className="px-6 py-4">
            {/* Wallet Connection */}
            <div className="mb-6">
              <h4 className="text-md font-semibold text-white mb-3">Wallet Connection</h4>
              {isConnected ? (
                <div className="bg-gray-800 rounded p-3">
                  <p className="text-green-400 text-sm mb-2">✅ Connected</p>
                  <p className="text-gray-300 text-xs break-all">{address}</p>
                </div>
              ) : (
                <div className="bg-gray-800 rounded p-3">
                  <p className="text-red-400 text-sm mb-3">❌ Not Connected</p>
                  <div className="space-y-2">
                    {connectors.map((connector) => (
                      <button
                        key={connector.uid}
                        onClick={() => connect({ connector })}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded"
                      >
                        Connect {connector.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Database Status */}
            {isConnected && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-white mb-3">Database Status</h4>
                
                {loading ? (
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-gray-400 text-sm">Loading signer data...</p>
                  </div>
                ) : signer ? (
                  <div className="bg-gray-800 rounded p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-300 text-sm">Status:</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        signer.isValidated 
                          ? 'bg-green-100 text-green-800' 
                          : signer.isPending 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {signer.isValidated ? 'Validated' : signer.isPending ? 'Pending' : 'Not Validated'}
                      </span>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex space-x-3">
                      <button
                        onClick={handleValidate}
                        disabled={validating}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          validating
                            ? 'bg-blue-300 text-blue-700 cursor-wait'
                            : signer.isValidated
                            ? 'bg-orange-500 hover:bg-orange-700 text-white'
                            : 'bg-green-500 hover:bg-green-700 text-white'
                        }`}
                      >
                        {validating ? 'Validating...' : signer.isValidated ? 'Revalidate' : 'Validate'}
                      </button>
                      
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          deleting
                            ? 'bg-red-300 text-red-700 cursor-wait'
                            : 'bg-red-500 hover:bg-red-700 text-white'
                        }`}
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                    
                    {/* Messages */}
                    {validationMessage && (
                      <p className={`text-xs ${
                        validationMessage.startsWith('✅') ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {validationMessage}
                      </p>
                    )}
                    
                    {deleteMessage && (
                      <p className={`text-xs ${
                        deleteMessage.startsWith('✅') ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {deleteMessage}
                      </p>
                    )}
                    
                    {/* Raw Data */}
                    <details className="mt-3">
                      <summary className="text-gray-400 text-xs cursor-pointer hover:text-white">
                        Raw Database Data
                      </summary>
                      <pre className="text-xs overflow-auto whitespace-pre-wrap break-all bg-gray-900 p-2 rounded mt-2">
                        {JSON.stringify(signer, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded p-3">
                    <p className="text-gray-400 text-sm">No signer data found for this address</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Signer"
        message="Are you sure you want to delete this signer? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmClassName="bg-red-600 hover:bg-red-700"
        isLoading={deleting}
      />
    </>
  );
} 