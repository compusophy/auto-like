import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, base } from 'wagmi/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';

// Create config with ONLY Farcaster mini app connector
export const config = createConfig({
  chains: [mainnet, sepolia, base],
  connectors: [
    farcasterMiniApp(),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [base.id]: http(),
  },
  // Disable storage to prevent IndexedDB usage
  storage: null,
}); 