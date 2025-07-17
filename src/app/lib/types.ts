// Shared types for the application
export interface Signer {
  privateKey: string;
  publicKey: string;
  token: string;
  isPending: boolean;
  isValidated: boolean;
  createdAt: number;
  fid?: string; // The actual Farcaster FID of the user
  ethAddress: string; // The wallet address used as the key
} 