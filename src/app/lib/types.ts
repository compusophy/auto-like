// Shared types for the application
export interface Signer {
  address: string;
  fid: string;
  privateKey: string;
  isValidated: boolean;
  isPending: boolean;
  createdAt: number;
  updatedAt: number;
  token?: string;
}

export interface SignerData {
  address: string;
  fid: string;
  privateKey: string;
}

export interface UnfollowResult {
  targetFid: number;
  username?: string;
  displayName?: string;
  success: boolean;
  hash?: string;
  error?: string;
}

export interface UnfollowedAccount {
  fid: number;
  username?: string;
  displayName?: string;
  unfollowedAt: number;
}

export interface BackupResult {
  message: string;
  count: number;
  csvData: string;
  accounts: any[];
} 