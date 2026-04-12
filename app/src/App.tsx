import React, { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import JobBoard from './components/JobBoard';

import '@solana/wallet-adapter-react-ui/styles.css';

const NETWORK = clusterApiUrl('devnet');

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={NETWORK}>
      <WalletProvider wallets={wallets} autoConnect onError={() => { /* suppress wallet errors */ }}>
        <WalletModalProvider>
          <JobBoard />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
