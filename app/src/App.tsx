import { useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import JobBoard from './components/JobBoard';
import LandingPage from './components/LandingPage';
import AdminDashboard from './components/AdminDashboard';

import '@solana/wallet-adapter-react-ui/styles.css';

const NETWORK = 'https://devnet.helius-rpc.com/?api-key=a061166a-9840-4130-9319-39a8efd7b0cf';

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
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          {/* Landing page — no wallet context needed */}
          <Route path="/" element={<LandingPage />} />

          {/* App + Admin — wrapped in wallet providers */}
          <Route path="/app" element={
            <ConnectionProvider endpoint={NETWORK}>
              <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
                <WalletModalProvider>
                  <ErrorBoundary>
                    <JobBoard />
                  </ErrorBoundary>
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          } />
          <Route path="/admin" element={
            <ConnectionProvider endpoint={NETWORK}>
              <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
                <WalletModalProvider>
                  <ErrorBoundary>
                    <AdminDashboard />
                  </ErrorBoundary>
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          } />

          {/* Catch-all — redirect old / links that go directly to app */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
