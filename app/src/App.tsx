import { useMemo, Component, ErrorInfo, ReactNode } from 'react';
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

// ── Error boundary — catches any React render/effect crash ───────────────────
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, message: err?.message ?? String(err) };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[Brewing ErrorBoundary]', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0a0a0a', color: '#888',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'monospace', gap: 16, padding: 40,
        }}>
          <span style={{ color: '#F59E0B', fontSize: 14, letterSpacing: '0.12em' }}>BREWING</span>
          <p style={{ fontSize: 13, color: '#444', maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
            Something went wrong. Try refreshing the page or disconnecting your wallet.
          </p>
          <code style={{ fontSize: 11, color: '#333', wordBreak: 'break-all' }}>
            {this.state.message}
          </code>
          <button
            onClick={() => { this.setState({ hasError: false, message: '' }); window.location.reload(); }}
            style={{
              marginTop: 8, padding: '7px 18px', background: 'transparent',
              border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6,
              color: '#F59E0B', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Wallet error suppressor ───────────────────────────────────────────────────
function onWalletError(err: Error) {
  // Suppress "User rejected" and connection-refused noise
  const msg = err?.message ?? '';
  if (
    msg.includes('User rejected') ||
    msg.includes('Transaction cancelled') ||
    msg.includes('WalletNotReadyError')
  ) return;
  console.warn('[WalletAdapter]', err);
}

export default function App() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ErrorBoundary>
      <ConnectionProvider endpoint={NETWORK}>
        <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
          <WalletModalProvider>
            {/* Inner boundary: wallet state changes don't blow up the whole shell */}
            <ErrorBoundary>
              <JobBoard />
            </ErrorBoundary>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
}
