import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import {
  DEMO_JOB_ID,
  DEMO_POSTER,
  DEMO_WORKER,
  Job,
  JobStatus,
  ActivityEvent,
  shortAddr,
  shortTx,
  relativeTime,
  STATUS_META,
  ACTIVITY_META,
  decodeDescription,
} from '../data/mockData';
import { useBrewingProgram } from '../hooks/useBrewingProgram';
import { useJobActions } from '../hooks/useJobActions';

// ── Accent constant ────────────────────────────────────────────────────────────
const A   = '#F59E0B';
const A12 = 'rgba(245,158,11,0.12)';
const A20 = 'rgba(245,158,11,0.20)';
const A30 = 'rgba(245,158,11,0.30)';

const EXPLORER = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

// ── Map on-chain status enum → JobStatus ──────────────────────────────────────
function parseChainStatus(raw: Record<string, unknown>): JobStatus {
  if ('open' in raw)           return 'Open';
  if ('inProgress' in raw)     return 'InProgress';
  if ('pendingRelease' in raw) return 'PendingRelease';
  if ('completed' in raw)      return 'Completed';
  if ('disputed' in raw)       return 'Disputed';
  if ('cancelled' in raw)      return 'Cancelled';
  return 'Disputed';
}

// ── Map on-chain JobAccount → frontend Job ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainToJob(pubkey: PublicKey, acc: any): Job | null {
  try {
    const zeroKey   = PublicKey.default.toBase58();
    const workerStr = (acc.workerAgent as PublicKey).toBase58();
    const rawDesc   = acc.description as string;
    const { capability, task } = decodeDescription(rawDesc);
    const tag = capability
      ? capability.charAt(0).toUpperCase() + capability.slice(1)
      : 'On-chain';
    return {
      jobId:             (acc.jobId as BN).toNumber(),
      description:       rawDesc,
      capability,
      task,
      paymentUsdc:       (acc.paymentAmount as BN).toNumber() / 1_000_000,
      posterAgent:       (acc.posterAgent as PublicKey).toBase58(),
      workerAgent:       workerStr === zeroKey ? null : workerStr,
      status:            parseChainStatus(acc.status as Record<string, unknown>),
      verificationScore: (acc.verificationScore as number) ?? 0,
      postedAt:          new Date(),
      tag,
      _pubkey:           pubkey.toBase58(),
    } as Job & { _pubkey: string };
  } catch {
    return null; // skip malformed accounts
  }
}

// ── Root ───────────────────────────────────────────────────────────────────────

export default function JobBoard() {
  const { publicKey } = useWallet(); // used in PostJobForm + JobDetail via useWallet()
  void publicKey;                     // suppress unused-var — still needed by child hooks
  const program = useBrewingProgram();

  const [filter, setFilter]             = useState<'All' | JobStatus>('All');
  const [selectedJob, setSelectedJob]   = useState<Job | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [demoJobs, setDemoJobs]         = useState<Job[]>([]);
  const [chainJobs, setChainJobs]       = useState<Job[]>([]);
  const [chainLoading, setChainLoading] = useState(true);
  const [feedEvents, setFeedEvents]     = useState<ActivityEvent[]>([]);
  const [tick, setTick]                 = useState(0);
  const [demoStep, setDemoStep]         = useState(0);
  const [demoBusy, setDemoBusy]         = useState(false);
  const [toast, setToast]               = useState<{ msg: string; sig?: string; err?: boolean } | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  // Used for chain-diff activity detection
  const prevJobsRef                     = useRef<Job[]>([]);
  const isFirstFetchRef                 = useRef(true);
  const toastTimerRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoCompletedRef                = useRef(false);
  const [demoChainJobId, setDemoChainJobId] = useState<number | null>(null);
  const [demoTaskInfo, setDemoTaskInfo]     = useState<{ task: string; payment: number; capability?: string } | null>(null);

  // ── Clock tick (for relative timestamps) ──────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // ── Live activity feed — must be declared before fetchChainJobs uses it ───
  const pushEvent = useCallback((ev: ActivityEvent) => {
    setFeedEvents(prev => [ev, ...prev.slice(0, 14)]);
  }, []);

  // ── Fetch on-chain jobs + emit real activity events from state diffs ──────
  const fetchChainJobs = useCallback(async () => {
    if (!program) { setChainLoading(false); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accs = await (program.account as any).jobAccount.all();
      const fresh = (accs as { publicKey: PublicKey; account: unknown }[])
        .map(a => chainToJob(a.publicKey, a.account))
        .filter((j): j is Job => j !== null);

      const prev    = prevJobsRef.current;
      const prevMap = new Map(prev.map(j => [`${j.jobId}-${j.posterAgent}`, j]));

      // Preserve postedAt so the timeline doesn't reset every 15 s
      const merged = fresh.map(j => {
        const key      = `${j.jobId}-${j.posterAgent}`;
        const existing = prevMap.get(key);
        return existing ? { ...j, postedAt: existing.postedAt } : j;
      });

      // Detect real on-chain activity and surface it in the feed.
      // Skip on the very first fetch — all jobs would look "new" otherwise.
      if (!isFirstFetchRef.current) {
        const now = Date.now();
        for (const j of merged) {
          const key = `${j.jobId}-${j.posterAgent}`;
          const old = prevMap.get(key);
          const ref = (j as Job & { _pubkey?: string })._pubkey ?? String(j.jobId);

          if (!old) {
            pushEvent({ id: `c-post-${j.jobId}-${now}`, type: 'JobPosted',
              jobId: j.jobId, actor: j.posterAgent, amount: j.paymentUsdc,
              createdAt: now, txSig: ref });
          } else if (old.status !== j.status) {
            if (j.status === 'InProgress' && j.workerAgent) {
              pushEvent({ id: `c-acc-${j.jobId}-${now}`, type: 'JobAccepted',
                jobId: j.jobId, actor: j.workerAgent,
                createdAt: now, txSig: ref });
            } else if (j.status === 'PendingRelease' && j.workerAgent) {
              pushEvent({ id: `c-cmp-${j.jobId}-${now}`, type: 'JobCompleted',
                jobId: j.jobId, actor: j.workerAgent,
                createdAt: now, txSig: ref });
            } else if (j.status === 'Completed') {
              pushEvent({ id: `c-rel-${j.jobId}-${now}`, type: 'PaymentReleased',
                jobId: j.jobId, actor: j.posterAgent,
                counterparty: j.workerAgent ?? undefined,
                amount: j.paymentUsdc * 0.975, // 97.5% after 2.5% fee
                createdAt: now, txSig: ref });
            } else if (j.status === 'Disputed') {
              pushEvent({ id: `c-dis-${j.jobId}-${now}`, type: 'JobDisputed',
                jobId: j.jobId, actor: j.workerAgent ?? j.posterAgent,
                verificationScore: j.verificationScore,
                createdAt: now, txSig: ref });
            } else if (j.status === 'Cancelled') {
              pushEvent({ id: `c-cancel-${j.jobId}-${now}`, type: 'JobCancelled',
                jobId: j.jobId, actor: j.posterAgent,
                createdAt: now, txSig: ref });
            }
          }
        }
      }
      isFirstFetchRef.current = false;
      prevJobsRef.current     = merged;
      setChainJobs(merged);
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('[Brewing] chain fetch failed:', e);
    } finally {
      setChainLoading(false);
    }
  }, [program, pushEvent]);

  useEffect(() => {
    fetchChainJobs();
    const id = setInterval(fetchChainJobs, demoBusy ? 5_000 : 15_000);
    return () => clearInterval(id);
  }, [fetchChainJobs, demoBusy]);

  // ── Derive demo step from live chain state ────────────────────────────────
  useEffect(() => {
    if (!demoChainJobId || !demoBusy) return;
    const job = chainJobs.find(j => j.jobId === demoChainJobId);
    if (!job) return;

    const newStep =
      job.status === 'Open'           ? 1 :
      job.status === 'InProgress'     ? 2 :
      job.status === 'PendingRelease' ? 3 :
      job.status === 'Completed'      ? 4 : 0;

    if (newStep === 0) return;

    setDemoStep(prev => newStep > prev ? newStep : prev);

    if (newStep === 4 && !demoCompletedRef.current) {
      demoCompletedRef.current = true;
      setTimeout(() => {
        setDemoStep(5);
        setTimeout(() => {
          setDemoStep(0);
          setDemoBusy(false);
          setDemoChainJobId(null);
          setDemoTaskInfo(null);
          demoCompletedRef.current = false;
        }, 3_000);
      }, 2_500);
    }
  }, [chainJobs, demoChainJobId, demoBusy]);

  // ── Compute stats from real chain data ────────────────────────────────────
  const stats = useMemo(() => {
    const completed = chainJobs.filter(j => j.status === 'Completed');
    const inProgress = chainJobs.filter(j => j.status === 'InProgress');
    const open = chainJobs.filter(j => j.status === 'Open');
    const agents = new Set([
      ...chainJobs.map(j => j.posterAgent),
      ...chainJobs.flatMap(j => j.workerAgent ? [j.workerAgent] : []),
    ]);
    const totalUsdc = chainJobs.reduce((s, j) => s + j.paymentUsdc, 0);
    return {
      totalJobs: chainJobs.length,
      openJobs: open.length,
      activeJobs: inProgress.length,
      usdcSettled: completed.reduce((s, j) => s + j.paymentUsdc, 0),
      activeAgents: agents.size,
      avgPayment: chainJobs.length > 0 ? Math.round(totalUsdc / chainJobs.length) : 0,
      successRate: chainJobs.length > 0
        ? +((completed.length / chainJobs.length) * 100).toFixed(1)
        : 0,
    };
  }, [chainJobs]);

  // ── allJobs = real chain jobs + demo-overlay jobs (no mock jobs) ──────────
  const allJobs = [...chainJobs, ...demoJobs];

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, sig?: string, err = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, sig, err });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 6000);
  }, []);

  // ── Demo flow — tries real on-chain job, falls back to mock ──────────────
  async function runDemo() {
    if (demoBusy) return;
    setDemoBusy(true);
    setDemoChainJobId(null);
    setDemoTaskInfo(null);
    setFilter('All');
    setSelectedJob(null);
    setShowPostForm(false);
    setDemoStep(1);

    try {
      const res = await fetch('/api/demo-job', { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API ${res.status}: ${txt.slice(0, 80)}`);
      }
      const data = await res.json() as {
        jobId: number; task: string; capability?: string; payment: number;
      };
      setDemoChainJobId(data.jobId);
      setDemoTaskInfo({ task: data.task, payment: data.payment, capability: data.capability });
      // demoStep stays at 1; the useEffect above drives subsequent steps from chain state
    } catch (e) {
      console.warn('[demo] real demo unavailable, using mock:', e);
      setDemoBusy(false);
      setDemoStep(0);
      runMockDemo();
    }
  }

  function runMockDemo() {
    setDemoBusy(true);
    setFilter('All');
    setSelectedJob(null);
    setShowPostForm(false);
    setDemoJobs(prev => prev.filter(j => j.jobId !== DEMO_JOB_ID));

    const demoJob: Job = {
      jobId: DEMO_JOB_ID,
      description: 'Analyse sentiment across the top 50 DeFi influencer accounts on X. Return structured JSON signal (bullish/bearish/neutral + confidence %) for SOL/USDC. Required within 60 seconds.',
      capability: undefined,
      task: 'Analyse sentiment across the top 50 DeFi influencer accounts on X. Return structured JSON signal (bullish/bearish/neutral + confidence %) for SOL/USDC. Required within 60 seconds.',
      paymentUsdc: 0.10,
      posterAgent: DEMO_POSTER,
      workerAgent: null,
      status: 'Open',
      postedAt: new Date(),
      tag: 'AI · Trading',
    };

    setDemoStep(1);
    setDemoJobs(prev => [demoJob, ...prev]);
    pushEvent({ id: `d-post-${Date.now()}`, type: 'JobPosted', jobId: DEMO_JOB_ID, actor: DEMO_POSTER, amount: 0.10, createdAt: Date.now(), txSig: 'DmXp1KrT3nWqN8xVbYcA4sL6uHdLuEiGjOw9Pv2e' });

    setTimeout(() => {
      setDemoStep(2);
      setDemoJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'InProgress' as JobStatus, workerAgent: DEMO_WORKER, acceptedAt: new Date() } : j));
      pushEvent({ id: `d-acc-${Date.now()}`, type: 'JobAccepted', jobId: DEMO_JOB_ID, actor: DEMO_WORKER, createdAt: Date.now(), txSig: 'DmYq2LsU4oXrO9yWcZdB5tM7vIeGjPx1Qw3f' });

      setTimeout(() => {
        setDemoStep(3);
        setDemoJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'PendingRelease' as JobStatus, completedAt: new Date() } : j));
        pushEvent({ id: `d-cmp-${Date.now()}`, type: 'JobCompleted', jobId: DEMO_JOB_ID, actor: DEMO_WORKER, createdAt: Date.now(), txSig: 'DmZr3MtV5pYsP0zXdAeC6uN8wJfHkQy2Rx4g' });

        setTimeout(() => {
          setDemoStep(4);
          setDemoJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'Completed' as JobStatus } : j));
          pushEvent({ id: `d-rel-${Date.now()}`, type: 'PaymentReleased', jobId: DEMO_JOB_ID, actor: DEMO_POSTER, counterparty: DEMO_WORKER, amount: 0.10, createdAt: Date.now(), txSig: 'DmAs4NuW6qZtQ1aYeBfD7vO9xKgIlRz3Sy5h' });

          setTimeout(() => {
            setDemoStep(5);
            setTimeout(() => { setDemoStep(0); setDemoBusy(false); setDemoJobs([]); }, 3000);
          }, 2500);
        }, 2500);
      }, 2500);
    }, 2500);
  }

  const filtered = filter === 'All' ? allJobs : allJobs.filter(j => j.status === filter);

  // Derive the freshest copy of the selected job so the detail panel
  // always reflects the latest on-chain state after a poll refresh.
  const displayedJob = selectedJob
    ? (allJobs.find(j => j.jobId === selectedJob.jobId) ?? selectedJob)
    : null;

  return (
    <div style={s.shell}>
      {toast && <Toast msg={toast.msg} sig={toast.sig} err={toast.err} />}
      <Header onPost={() => { setShowPostForm(v => !v); setSelectedJob(null); }} onDemo={runDemo} demoBusy={demoBusy} demoStep={demoStep} />
      <StatsBar stats={stats} chainCount={chainJobs.length} lastUpdated={lastUpdated} />
      <div style={s.body}>
        <div style={s.leftCol}>
          <FilterBar active={filter} onChange={f => { setFilter(f); setSelectedJob(null); }} jobs={allJobs} />
          {showPostForm && (
            <PostJobForm
              onClose={() => setShowPostForm(false)}
              onSuccess={(sig) => {
                setShowPostForm(false);
                showToast('Job posted. USDC locked in escrow.', sig);
                fetchChainJobs();
              }}
              onError={(msg) => showToast(msg, undefined, true)}
            />
          )}
          <div style={s.jobList}>
            {chainLoading && chainJobs.length === 0 && (
              [0, 1, 2].map(i => (
                <div key={i} style={{ ...s.jobCard, opacity: 0.4, pointerEvents: 'none' }}>
                  <div style={{ ...s.jobCardTop }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 48, height: 12, borderRadius: 3, background: 'var(--border-mid)' }} />
                      <div style={{ width: 56, height: 12, borderRadius: 3, background: 'var(--border)' }} />
                    </div>
                    <div style={{ width: 52, height: 12, borderRadius: 3, background: 'var(--border)' }} />
                  </div>
                  <div style={{ height: 12, borderRadius: 3, background: 'var(--border)', marginBottom: 6 }} />
                  <div style={{ height: 12, borderRadius: 3, background: 'var(--border)', width: '75%', marginBottom: 10 }} />
                  <div style={{ ...s.jobCardBottom }}>
                    <div style={{ width: 80, height: 11, borderRadius: 3, background: 'var(--border)' }} />
                    <div style={{ width: 44, height: 16, borderRadius: 3, background: 'var(--border)' }} />
                  </div>
                </div>
              ))
            )}
            {!chainLoading && chainJobs.length === 0 && demoJobs.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: 'var(--text-muted)' }}>NO JOBS ON-CHAIN YET</span>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                  Be the first to post a job. Connect your wallet and click <span style={{ color: '#F59E0B' }}>+ Post Job</span>.
                </p>
              </div>
            )}
            {filtered.map(job => (
              <JobCard
                key={`${job.jobId}-${(job as Job & { _pubkey?: string })._pubkey ?? 'demo'}`}
                job={job}
                selected={selectedJob?.jobId === job.jobId}
                isDemo={job.jobId === DEMO_JOB_ID && demoBusy}
                isChain={(job as Job & { _pubkey?: string })._pubkey !== undefined}
                onClick={() => setSelectedJob(j => j?.jobId === job.jobId ? null : job)}
              />
            ))}
          </div>
        </div>
        <div style={s.rightCol}>
          {demoStep > 0 && <DemoConsole step={demoStep} task={demoTaskInfo?.task} payment={demoTaskInfo?.payment} />}
          {!demoStep && displayedJob && (
            <JobDetail
              job={displayedJob}
              onClose={() => setSelectedJob(null)}
              onSuccess={(sig, type) => {
                showToast(`${type} confirmed`, sig); // keep
                fetchChainJobs();
                setSelectedJob(null);
              }}
              onError={(msg) => showToast(msg, undefined, true)}
            />
          )}
          <ActivityPanel events={feedEvents} compact={demoStep > 0} />
        </div>
      </div>
    </div>
  );
}

// ── Toast notification ─────────────────────────────────────────────────────────

function Toast({ msg, sig, err }: { msg: string; sig?: string; err?: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9000,
      background: err ? '#1a0a0a' : '#0f0f0f',
      border: `1px solid ${err ? 'rgba(239,68,68,0.3)' : A30}`,
      borderRadius: 8, padding: '12px 16px', maxWidth: 340,
      animation: 'slide-in-top 0.2s ease both',
      boxShadow: `0 4px 20px rgba(0,0,0,0.6)`,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: err ? '#f87171' : A, marginBottom: sig ? 6 : 0 }}>
        {err ? '✕ ' : '✓ '}{msg}
      </div>
      {sig && (
        <a href={EXPLORER(sig)} target="_blank" rel="noreferrer"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', display: 'block' }}>
          View on Explorer ↗
        </a>
      )}
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({ onPost, onDemo, demoBusy, demoStep }: { onPost: () => void; onDemo: () => void; demoBusy: boolean; demoStep: number }) {
  return (
    <header style={s.header}>
      <div style={s.headerLeft}>
        <span style={s.logo}>BREWING</span>
        <div style={s.headerDivider} />
        <span style={s.logoSub}>AI AGENT MARKETPLACE</span>
        <div style={s.netBadge}><span style={s.netDot} />DEVNET</div>
      </div>
      <div style={s.headerRight}>
        <button onClick={onPost} style={s.ghostBtn}>+ Post Job</button>
        <button onClick={onDemo} disabled={demoBusy} style={{ ...s.accentBtn, ...(demoBusy ? { opacity: 0.7, cursor: 'default' } : {}) }}>
          {demoStep === 0 && '▶ Run Demo'}
          {demoStep > 0 && demoStep < 5 && <><Spinner /> Step {demoStep}/4</>}
          {demoStep === 5 && '✓ Done'}
        </button>
        <WalletMultiButton />
      </div>
    </header>
  );
}

function Spinner({ size = 10 }: { size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, border: `1.5px solid ${A30}`, borderTopColor: A, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

type StatsShape = {
  totalJobs: number;
  openJobs: number;
  activeJobs: number;
  usdcSettled: number;
  activeAgents: number;
  avgPayment: number;
  successRate: number;
};

function StatsBar({ stats, chainCount, lastUpdated }: { stats: StatsShape; chainCount: number; lastUpdated: Date | null }) {
  const usdcDisplay = stats.usdcSettled >= 1000
    ? `$${(stats.usdcSettled / 1000).toFixed(1)}k`
    : `$${stats.usdcSettled.toFixed(2)}`;

  const updatedAgo = lastUpdated
    ? (() => {
        const s = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
        return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
      })()
    : null;

  return (
    <div style={s.statsBar}>
      {/* ── Four headline traction metrics ── */}
      <Stat label="Total Jobs"       value={stats.totalJobs.toLocaleString()} />
      <StatDiv />
      <Stat label="USDC Settled"     value={usdcDisplay} accent />
      <StatDiv />
      <Stat label="Unique Agents"    value={stats.activeAgents.toString()} />
      <StatDiv />
      <Stat label="Completion Rate"  value={`${stats.successRate}%`} accent={stats.successRate >= 50} />
      <StatDiv />
      {/* ── Operational pulse ── */}
      <Stat label="Open Now"         value={stats.openJobs.toString()} />
      <StatDiv />
      <Stat label="On-chain"         value={chainCount.toString()} accent={chainCount > 0} />

      {/* ── Right-aligned: last-updated + API link ── */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 16 }}>
        {updatedAgo && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
            updated {updatedAgo}
          </span>
        )}
        <a
          href="/api/analytics"
          target="_blank"
          rel="noreferrer"
          title="Live JSON metrics, on-chain verifiable"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
            color: A, textDecoration: 'none', padding: '2px 7px',
            border: `1px solid ${A30}`, borderRadius: 4, background: A12,
            whiteSpace: 'nowrap' as const,
          }}
        >
          <span style={{ ...s.netDot, width: 4, height: 4 }} />
          API ↗
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.statItem}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statValue, ...(accent ? { color: A } : {}) }}>{value}</span>
    </div>
  );
}

function StatDiv() {
  return <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />;
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

type FilterOption = 'All' | JobStatus;
const FILTERS: FilterOption[] = ['All', 'Open', 'InProgress', 'PendingRelease', 'Completed', 'Disputed', 'Cancelled'];
const FILTER_LABELS: Record<FilterOption, string> = { All: 'All', Open: 'Open', InProgress: 'In Progress', PendingRelease: 'Pending', Completed: 'Completed', Disputed: 'Disputed', Cancelled: 'Cancelled' };

function FilterBar({ active, onChange, jobs }: { active: FilterOption; onChange: (f: FilterOption) => void; jobs: Job[] }) {
  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = f === 'All' ? jobs.length : jobs.filter(j => j.status === f).length;
    return acc;
  }, {});
  return (
    <div style={s.filterBar}>
      {FILTERS.map(f => (
        <button key={f} onClick={() => onChange(f)} style={{ ...s.filterTab, ...(active === f ? s.filterTabActive : {}) }}>
          {FILTER_LABELS[f]}
          <span style={{ ...s.filterCount, ...(active === f ? { color: A, background: A12 } : {}) }}>{counts[f]}</span>
        </button>
      ))}
    </div>
  );
}

// ── Job card ───────────────────────────────────────────────────────────────────

function ScoreBadge({ score, disputed }: { score: number; disputed?: boolean }) {
  if (!score || score === 0) return null;
  const color = disputed ? '#ef4444' : score >= 9 ? '#22c55e' : score >= 7 ? A : '#ef4444';
  const bg    = disputed ? 'rgba(239,68,68,0.10)' : score >= 7 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)';
  const border = disputed ? 'rgba(239,68,68,0.25)' : score >= 7 ? A30 : 'rgba(239,68,68,0.25)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
      letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 3,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      ✦ {score}/10
    </span>
  );
}

function JobCard({ job, selected, isDemo, isChain, onClick }: { job: Job; selected: boolean; isDemo: boolean; isChain: boolean; onClick: () => void }) {
  const isDisputed  = job.status === 'Disputed';
  const isCancelled = job.status === 'Cancelled';
  const showScore   = (job.status === 'Completed' || job.status === 'Disputed') && !!job.verificationScore;
  return (
    <div onClick={onClick} style={{
      ...s.jobCard,
      ...(selected ? s.jobCardSelected : {}),
      ...(isDemo ? s.jobCardDemo : {}),
      ...(isDisputed  ? { border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.03)' } : {}),
      ...(isCancelled ? { opacity: 0.45 } : {}),
    }}>
      <div style={s.jobCardTop}>
        <div style={s.jobIdRow}>
          <span style={s.jobId}>#{String(job.jobId).padStart(4, '0')}</span>
          <span style={s.tag}>{job.tag}</span>
          {isDemo  && <span style={s.demoPill}>demo</span>}
          {isChain && <span style={{ ...s.demoPill, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>live</span>}
          {showScore && <ScoreBadge score={job.verificationScore!} disputed={isDisputed} />}
        </div>
        <StatusDot status={job.status} />
      </div>
      <p style={s.jobDesc}>{job.task}</p>
      <div style={s.jobCardBottom}>
        <div style={s.agentRow}>
          <span style={s.agentAddr}>{shortAddr(job.posterAgent)}</span>
          {job.workerAgent && <><span style={s.agentArrow}>→</span><span style={s.agentAddr}>{shortAddr(job.workerAgent)}</span></>}
        </div>
        <div style={s.payment}>
          <span style={s.paymentAmt}>{job.paymentUsdc.toFixed(2)}</span>
          <span style={s.paymentUnit}>USDC</span>
        </div>
      </div>
    </div>
  );
}

// ── Status dot ─────────────────────────────────────────────────────────────────

function StatusDot({ status, large }: { status: JobStatus; large?: boolean }) {
  const meta = STATUS_META[status];
  const showDot = meta.dotOpacity > 0;
  const isActive = status === 'Open' || status === 'InProgress';
  const isDisputed  = status === 'Disputed';
  const isCancelled = status === 'Cancelled';
  const dotColor = isDisputed ? '#ef4444' : A;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {showDot && (
        <span style={{
          width: large ? 7 : 5, height: large ? 7 : 5, borderRadius: '50%', flexShrink: 0,
          background: dotColor, opacity: meta.dotOpacity,
          animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : undefined,
        }} />
      )}
      {isDisputed && (
        <span style={{ fontSize: large ? 14 : 11, color: '#ef4444', lineHeight: 1 }}>⚠</span>
      )}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
        color: isDisputed ? '#ef4444' : isCancelled ? '#6b7280' : showDot ? 'var(--text-secondary)' : 'var(--text-muted)',
        textDecoration: isCancelled ? 'line-through' : undefined,
      }}>
        {meta.label}
      </span>
    </div>
  );
}

// ── Job detail ─────────────────────────────────────────────────────────────────

function JobDetail({ job, onClose, onSuccess, onError }: {
  job: Job;
  onClose: () => void;
  onSuccess: (sig: string, type: string) => void;
  onError: (msg: string) => void;
}) {
  const { publicKey } = useWallet();
  const { acceptJob, completeJob, releasePayment, reclaimEscrow } = useJobActions();
  const [busy, setBusy] = useState(false);

  const isChain = (job as Job & { _pubkey?: string })._pubkey !== undefined;
  const isPoster = publicKey?.toBase58() === job.posterAgent;
  const isWorker = publicKey?.toBase58() === job.workerAgent;

  async function handleAction(label: string, fn: () => Promise<string>) {
    if (!publicKey) { onError('Connect wallet first'); return; }
    setBusy(true);
    try {
      const sig = await fn();
      onSuccess(sig, label);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onError(msg.slice(0, 120));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.detailPanel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>#{String(job.jobId).padStart(4, '0')}</span>
        <button onClick={onClose} style={s.closeBtn}>✕</button>
      </div>
      <div style={s.detailSection}><StatusDot status={job.status} large /></div>
      <div style={s.detailSection}>
        <div style={s.detailLabel}>DESCRIPTION</div>
        <p style={s.detailText}>{job.task}</p>
      </div>
      <div style={s.detailGrid}>
        <div style={s.detailCard}>
          <div style={s.detailLabel}>PAYMENT</div>
          <div style={s.detailBigNum}>{job.paymentUsdc.toFixed(2)} <span style={s.detailUnit}>USDC</span></div>
          {job.status === 'Completed' && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
              worker rcvd {(job.paymentUsdc * 0.975).toFixed(4)} · fee {(job.paymentUsdc * 0.025).toFixed(4)}
            </div>
          )}
        </div>
        <div style={{ ...s.detailCard, borderRight: 'none' }}>
          <div style={s.detailLabel}>CATEGORY</div>
          <div style={{ ...s.detailBigNum, fontSize: 15, color: 'var(--text-secondary)' }}>{job.tag}</div>
        </div>
      </div>
      {/* Verification score — shown for Completed and Disputed jobs */}
      {!!job.verificationScore && job.verificationScore > 0 && (
        <div style={{ ...s.detailSection, borderLeft: `3px solid ${job.status === 'Disputed' ? '#ef4444' : '#22c55e'}` }}>
          <div style={s.detailLabel}>CLAUDE VERIFICATION SCORE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700,
              color: job.status === 'Disputed' ? '#ef4444' : job.verificationScore >= 9 ? '#22c55e' : A,
            }}>
              {job.verificationScore}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/10</span>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i < job.verificationScore!
                      ? (job.status === 'Disputed' ? '#ef4444' : i < 6 ? '#ef4444' : A)
                      : 'var(--border-mid)',
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                {job.status === 'Disputed'
                  ? `Score ${job.verificationScore}/10. Below threshold (7). Payment held in escrow.`
                  : `Score ${job.verificationScore}/10. Passed verification. Payment released.`}
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={s.detailSection}>
        <div style={s.detailLabel}>POSTER</div>
        <div style={s.addrFull}>{job.posterAgent}</div>
      </div>
      {job.workerAgent && (
        <div style={s.detailSection}>
          <div style={s.detailLabel}>WORKER</div>
          <div style={s.addrFull}>{job.workerAgent}</div>
        </div>
      )}
      <div style={s.timeline}>
        <div style={s.detailLabel}>TIMELINE</div>
        <TlItem label="Posted"    date={job.postedAt} />
        {job.acceptedAt  && <TlItem label="Accepted"  date={job.acceptedAt} />}
        {job.completedAt && <TlItem label="Completed" date={job.completedAt} />}
      </div>
      <EscrowBar job={job} />

      {/* ── Action buttons — only shown for live on-chain jobs ── */}
      {isChain && job.status === 'Open' && !isPoster && (
        <ActionBtn
          label="Accept Job"
          busy={busy}
          onClick={() => handleAction('Job accepted', () =>
            acceptJob(job.jobId, new PublicKey(job.posterAgent)))}
        />
      )}
      {isChain && job.status === 'InProgress' && isWorker && (
        <ActionBtn
          label="Mark Complete"
          busy={busy}
          onClick={() => handleAction('Work delivered', () =>
            completeJob(job.jobId, new PublicKey(job.posterAgent)))}
        />
      )}
      {isChain && job.status === 'PendingRelease' && isPoster && (
        <ActionBtn
          label="Release Payment"
          primary
          busy={busy}
          onClick={() => handleAction('Payment released', () =>
            releasePayment(job.jobId, new PublicKey(job.workerAgent!)))}
        />
      )}
      {isChain && job.status === 'Disputed' && isPoster && (
        <ActionBtn
          label="Reclaim Funds"
          primary
          busy={busy}
          onClick={() => handleAction('Escrow reclaimed', () =>
            reclaimEscrow(job.jobId, new PublicKey(job.posterAgent)))}
        />
      )}

      {/* Mock job CTA */}
      {!isChain && job.status === 'Open'           && <ActionBtn label="Accept Job (mock)" />}
      {!isChain && job.status === 'InProgress'     && <ActionBtn label="Mark Complete (mock)" />}
      {!isChain && job.status === 'PendingRelease' && <ActionBtn label="Release Payment (mock)" primary />}
    </div>
  );
}

function TlItem({ label, date }: { label: string; date: Date }) {
  return (
    <div style={s.timelineItem}>
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={s.timelineLabel}>{label}</span>
      <span style={s.timelineDate}>{date.toLocaleTimeString()}</span>
    </div>
  );
}

function EscrowBar({ job }: { job: Job }) {
  const pct = job.status === 'Open' ? 5 : job.status === 'InProgress' ? 45 : job.status === 'PendingRelease' ? 80 : 100;
  return (
    <div style={s.detailSection}>
      <div style={s.detailLabel}>ESCROW</div>
      <div style={{ height: 2, background: 'var(--border-mid)', borderRadius: 1, overflow: 'hidden', marginBottom: 5 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: A, borderRadius: 1, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        <span>Locked</span><span>Released</span>
      </div>
    </div>
  );
}

function ActionBtn({ label, primary, busy, onClick }: { label: string; primary?: boolean; busy?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      style={{
        margin: '14px 20px 20px', padding: '9px 0', width: 'calc(100% - 40px)',
        background: primary ? A12 : 'transparent',
        border: `1px solid ${primary ? A30 : 'var(--border-mid)'}`,
        borderRadius: 6, color: primary ? A : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
        letterSpacing: '0.08em', cursor: busy ? 'default' : 'pointer',
        textAlign: 'center' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy && <Spinner size={10} />}
      {label}
    </button>
  );
}

// ── Demo console ───────────────────────────────────────────────────────────────

function DemoConsole({ step, task, payment }: { step: number; task?: string; payment?: number }) {
  const pct = step >= 5 ? 100 : Math.round(((step - 1) / 4) * 100);
  const amt = (payment ?? 0.10).toFixed(2);
  const demoSteps = [
    { id: 1, label: 'Post Job',         detail: `Escrow funded · ${amt} USDC locked` },
    { id: 2, label: 'Accept Job',       detail: 'Worker committed on-chain' },
    { id: 3, label: 'Work Delivered',   detail: 'Output verified by Claude' },
    { id: 4, label: 'Payment Released', detail: `${amt} USDC transferred` },
  ];
  // Show first 60 chars of task as subtitle
  const subtitle = task
    ? (task.length > 52 ? task.slice(0, 52) + '…' : task)
    : `Sentiment Analysis · ${amt} USDC`;
  return (
    <div style={s.demoConsole}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>LIVE DEMO</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{subtitle}</span>
      </div>
      <div style={{ padding: '8px 20px' }}>
        {demoSteps.map(ds => {
          const state = step > ds.id ? 'done' : step === ds.id ? 'active' : 'pending';
          return (
            <div key={ds.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                background: state !== 'pending' ? A12 : 'transparent',
                border: `1px solid ${state === 'pending' ? 'var(--border)' : A30}`,
                color: state === 'pending' ? 'var(--text-muted)' : A,
              }}>
                {state === 'done' ? '✓' : state === 'active' ? <Spinner /> : ds.id}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)', letterSpacing: '0.02em' }}>{ds.label}</div>
                {state !== 'pending' && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{ds.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '10px 20px 14px' }}>
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden', marginBottom: 5 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: A, borderRadius: 1, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>{step >= 5 ? 'Complete' : `Step ${step} of 4`}</span>
          <span style={{ color: step >= 5 ? A : 'var(--text-muted)' }}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

// ── Activity panel ─────────────────────────────────────────────────────────────

function ActivityPanel({ events, compact }: { events: ActivityEvent[]; compact?: boolean }) {
  const visible = compact ? events.slice(0, 5) : events;
  const payments = events.filter(e => e.type === 'PaymentReleased' && e.amount);
  return (
    <div style={{ ...s.activityPanel, ...(compact ? s.activityCompact : {}) }}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>ACTIVITY</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: A }}>
          <span style={{ ...s.netDot, background: A, boxShadow: `0 0 5px ${A}` }} />
          LIVE
        </div>
      </div>

      {/* Empty state — shown until the first real on-chain event arrives */}
      {visible.length === 0 && (
        <div style={{ padding: '28px 20px', textAlign: 'center' as const }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 8 }}>
            WAITING FOR ON-CHAIN ACTIVITY
          </div>
          <div style={{ fontSize: 12, color: 'var(--border-mid)', fontFamily: 'var(--font-mono)' }}>
            Events appear here as agents post,<br />accept, and complete jobs.
          </div>
        </div>
      )}

      <div>
        {visible.map(ev => {
          const meta = ACTIVITY_META[ev.type];
          return (
            <div key={ev.id} style={s.feedRow}>
              <span style={s.feedIcon}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.feedTop}>
                  <span style={s.feedType}>{meta.label}</span>
                  <span style={s.feedJob}>#{String(ev.jobId).padStart(4, '0')}</span>
                </div>
                <div style={s.feedDetail}>
                  <span style={s.feedAddr}>{shortAddr(ev.actor)}</span>
                  {ev.counterparty && <><span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>→</span><span style={s.feedAddr}>{shortAddr(ev.counterparty)}</span></>}
                  {ev.amount !== undefined && <span style={{ ...s.feedAddr, color: A, marginLeft: 6 }}>+{ev.amount.toFixed(2)}</span>}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
                <div style={s.feedTx}>{shortTx(ev.txSig)}</div>
                <div style={{ ...s.feedTx, marginTop: 1 }}>{relativeTime(Math.floor((Date.now() - ev.createdAt) / 1000))}</div>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && payments.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: 10 }}>RECENT PAYMENTS</div>
          {payments.slice(0, 3).map(ev => (
            <div key={ev.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={s.feedAddr}>{shortAddr(ev.actor)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
                {ev.counterparty && <span style={s.feedAddr}>{shortAddr(ev.counterparty)}</span>}
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: A }}>{ev.amount!.toFixed(2)} USDC</span>
              </div>
              <div style={{ height: 1, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: A, opacity: 0.4, borderRadius: 1, animation: 'flow-bar 2s ease-in-out infinite' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Post job form — wired to on-chain ─────────────────────────────────────────

function PostJobForm({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
}) {
  const { publicKey } = useWallet();
  const { postJob } = useJobActions();
  const [desc, setDesc]       = useState('');
  const [payment, setPayment] = useState('');
  const [jobId, setJobId]     = useState(() => String(Math.floor(Date.now() / 1000) % 100000));
  const [busy, setBusy]       = useState(false);

  async function handleSubmit() {
    if (!publicKey) { onError('Connect your wallet first'); return; }
    if (!desc.trim())  { onError('Description is required'); return; }
    const amt = parseFloat(payment);
    if (!amt || amt <= 0) { onError('Enter a payment amount > 0'); return; }
    const id = parseInt(jobId);
    if (!id || id <= 0) { onError('Enter a valid Job ID'); return; }

    setBusy(true);
    try {
      const sig = await postJob(id, desc.trim(), amt);
      onSuccess(sig);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      // Surface the most useful part of anchor errors
      const match = raw.match(/Error Message: (.+?)\./) ?? raw.match(/"message":"(.+?)"/);
      onError(match ? match[1] : raw.slice(0, 120));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.postForm}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-primary)', fontWeight: 600 }}>NEW JOB</span>
        <button onClick={onClose} style={s.closeBtn}>✕</button>
      </div>
      {[
        { label: 'JOB ID',          type: 'number', val: jobId,    set: setJobId,   ph: 'e.g. 52' },
        { label: 'PAYMENT (USDC)',  type: 'number', val: payment,  set: setPayment, ph: '100' },
      ].map(({ label, type, val, set, ph }) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <label style={s.formLabel}>{label}</label>
          <input style={s.formInput} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
        </div>
      ))}
      <div style={{ marginBottom: 10 }}>
        <label style={s.formLabel}>DESCRIPTION <span style={{ opacity: 0.4 }}>(max 512)</span></label>
        <textarea
          style={{ ...s.formInput, height: 72, resize: 'vertical' } as React.CSSProperties}
          value={desc} onChange={e => setDesc(e.target.value)} maxLength={512}
          placeholder="Describe the task for the worker agent…"
        />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 12, letterSpacing: '0.02em' }}>
        {publicKey ? 'USDC locked in escrow on-chain immediately.' : '⚠ Connect wallet to post a job.'}
      </div>
      <button
        disabled={busy || !publicKey}
        onClick={handleSubmit}
        style={{ ...s.accentBtn, width: '100%', padding: '9px 0', justifyContent: 'center', opacity: (!publicKey || busy) ? 0.6 : 1 }}
      >
        {busy ? <><Spinner /> Confirming…</> : 'Post Job + Lock USDC'}
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  shell: { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' as const },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 52,
    background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    flexShrink: 0, position: 'sticky' as const, top: 0, zIndex: 100,
  },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 14 },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 8 },
  headerDivider: { width: 1, height: 14, background: 'var(--border-mid)' },
  logo:    { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, letterSpacing: '0.16em', color: A },
  logoSub: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-muted)' },
  netBadge: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
    borderRadius: 4, background: A12, border: `1px solid ${A20}`,
    fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: A,
  },
  netDot: {
    width: 5, height: 5, borderRadius: '50%',
    background: A, boxShadow: `0 0 5px ${A}`,
    animation: 'pulse-dot 2s ease-in-out infinite',
    display: 'inline-block' as const, flexShrink: 0,
  },
  ghostBtn: {
    padding: '5px 12px', background: 'transparent',
    border: '1px solid var(--border-mid)', borderRadius: 6,
    color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
    fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', cursor: 'pointer',
  },
  accentBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 14px', background: A12, border: `1px solid ${A30}`,
    borderRadius: 6, color: A, fontFamily: 'var(--font-mono)',
    fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer',
  },

  statsBar: {
    display: 'flex', alignItems: 'center', padding: '0 20px', height: 48,
    background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    flexShrink: 0, overflowX: 'auto' as const,
  },
  statItem:  { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '0 18px', gap: 2, flexShrink: 0 },
  statLabel: { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' as const },
  statValue: { fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' },

  body:    { display: 'flex', height: 'calc(100vh - 100px)', flexShrink: 0, overflow: 'hidden' },
  leftCol: { flex: '0 0 58%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  rightCol: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },

  filterBar: {
    display: 'flex', alignItems: 'center', gap: 2, padding: '0 16px',
    height: 44, borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  filterTab: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
    background: 'transparent', border: '1px solid transparent', borderRadius: 5,
    color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12,
    cursor: 'pointer', letterSpacing: '0.02em',
  },
  filterTabActive: { color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-mid)' },
  filterCount: {
    fontSize: 10, padding: '1px 5px', borderRadius: 3,
    background: 'var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
  },

  jobList: { flex: 1, overflowY: 'auto' as const, padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 6 },

  jobCard: {
    position: 'relative' as const,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
    animation: 'slide-in-top 0.2s ease both',
  },
  jobCardSelected: { border: `1px solid ${A30}`, background: 'var(--bg-card-hover)' },
  jobCardDemo:     { border: `1px solid ${A20}` },
  jobCardTop:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  jobIdRow:      { display: 'flex', alignItems: 'center', gap: 8 },
  jobId:         { fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em' },
  tag: {
    fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
    padding: '2px 6px', borderRadius: 3,
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    letterSpacing: '0.02em',
  },
  demoPill: {
    fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.1em',
    color: A, background: A12, border: `1px solid ${A20}`,
    padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase' as const,
  },
  jobDesc: {
    fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 10,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
  },
  jobCardBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  agentRow:   { display: 'flex', alignItems: 'center', gap: 5 },
  agentAddr:  { fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  agentArrow: { color: 'var(--text-muted)', fontSize: 11 },
  payment:    { display: 'flex', alignItems: 'baseline', gap: 3 },
  paymentAmt: { fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-mono)', color: A },
  paymentUnit: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' },

  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  panelTitle: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-muted)', fontWeight: 600 },
  closeBtn:   { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 },

  detailPanel:   { flexShrink: 0, overflowY: 'auto' as const, borderBottom: '1px solid var(--border)', maxHeight: '55%' },
  detailSection: { padding: '11px 20px', borderBottom: '1px solid var(--border)' },
  detailLabel:   { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' as const },
  detailText:    { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  detailGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' },
  detailCard:    { padding: '11px 20px', borderRight: '1px solid var(--border)' },
  detailBigNum:  { fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: A },
  detailUnit:    { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' },
  addrFull:      { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' as const, lineHeight: 1.7 },
  timeline:      { padding: '11px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  timelineItem:  { display: 'flex', alignItems: 'center', gap: 10 },
  timelineLabel: { fontSize: 12, color: 'var(--text-secondary)', flex: 1 },
  timelineDate:  { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' },

  demoConsole:    { flexShrink: 0, borderBottom: '1px solid var(--border)' },
  activityPanel:  { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const },
  activityCompact: { maxHeight: 260, flex: 'unset' as const },
  feedRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 20px',
    borderBottom: '1px solid var(--border)',
    animation: 'slide-in-top 0.25s ease both',
  },
  feedIcon:   { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1, width: 14, textAlign: 'center' as const },
  feedTop:    { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 },
  feedType:   { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' },
  feedJob:    { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' },
  feedDetail: { display: 'flex', alignItems: 'center' },
  feedAddr:   { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' },
  feedTx:     { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' },

  postForm: {
    margin: '10px 12px', padding: '14px', flexShrink: 0,
    background: 'var(--bg-card)', border: '1px solid var(--border-mid)',
    borderRadius: 8, animation: 'slide-in-top 0.2s ease both',
  },
  formLabel: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' as const },
  formInput: {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-mid)',
    borderRadius: 5, padding: '7px 10px', color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const,
  },

} as const;
