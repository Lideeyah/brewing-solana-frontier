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
import Leaderboard from './Leaderboard';

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
  // Enhanced demo state — driven by SSE events from /api/demo-run
  const [demoTxSigs, setDemoTxSigs] = useState<{
    p1Post?: string; p1Accept?: string; p1Submit?: string; p1Release?: string;
    p2Post?: string; p2Accept?: string; p2Dispute?: string; p2Reclaim?: string;
  }>({});
  const [demoScore, setDemoScore]           = useState<number | null>(null);
  const [demoJobIds, setDemoJobIds]         = useState<{ p1?: number; p2?: number }>({});
  const demoPosterAddrRef                   = React.useRef<string | null>(null);
  const demoWorkerAddrRef                   = React.useRef<string | null>(null);
  const [rightTab, setRightTab]             = useState<'activity' | 'leaderboard'>('activity');

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
    const completed  = chainJobs.filter(j => j.status === 'Completed');
    const inProgress = chainJobs.filter(j => j.status === 'InProgress');
    const open       = chainJobs.filter(j => j.status === 'Open');
    const agents = new Set([
      ...chainJobs.map(j => j.posterAgent),
      ...chainJobs.flatMap(j => j.workerAgent ? [j.workerAgent] : []),
    ]);
    // Accumulate in micro-USDC (integers) to avoid floating-point drift
    const totalMicro     = chainJobs.reduce((s, j) => s + Math.round(j.paymentUsdc * 1_000_000), 0);
    const settledMicro   = completed.reduce((s, j)  => s + Math.round(j.paymentUsdc * 1_000_000), 0);
    const totalUsdc      = totalMicro   / 1_000_000;
    const usdcSettled    = settledMicro / 1_000_000;
    return {
      totalJobs:  chainJobs.length,
      openJobs:   open.length,
      activeJobs: inProgress.length,
      usdcSettled,
      // Total USDC that has flowed through the system (all statuses)
      usdcVolume: totalUsdc,
      activeAgents: agents.size,
      // Keep two decimal places so $0.10 shows correctly, not 0
      avgPayment: chainJobs.length > 0
        ? +(totalUsdc / chainJobs.length).toFixed(2)
        : 0,
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

  // ── Demo flow — two-phase SSE stream, falls back to mock ────────────────
  async function runDemo() {
    if (demoBusy) return;
    setDemoBusy(true);
    setDemoStep(0);
    setDemoTxSigs({});
    setDemoScore(null);
    setDemoJobIds({});
    demoPosterAddrRef.current = null;
    demoWorkerAddrRef.current = null;
    setDemoChainJobId(null);
    setDemoTaskInfo({ task: 'Analyse the top 3 Solana DeFi protocols by TVL and identify the highest yield opportunity for a $1,000 position', payment: 0.10 });
    demoCompletedRef.current = false;
    setFilter('All');
    setSelectedJob(null);
    setShowPostForm(false);

    try {
      const res = await fetch('/api/demo-run', { method: 'POST' });
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(5).trim()) as {
              event: string; phase?: 1 | 2;
              jobId?: number; txSig?: string; score?: number;
              payment?: number; poster?: string; worker?: string; message?: string;
            };

            switch (ev.event) {
              case 'phase_start':
                if (ev.phase === 1) setDemoStep(1);
                break;

              case 'posted':
                if (ev.phase === 1) {
                  if (ev.poster) demoPosterAddrRef.current = ev.poster;
                  if (ev.jobId != null) setDemoJobIds(j => ({ ...j, p1: ev.jobId }));
                  if (ev.txSig) setDemoTxSigs(s => ({ ...s, p1Post: ev.txSig }));
                  setDemoStep(2);
                  pushEvent({ id: `dr-post-${Date.now()}`, type: 'JobPosted',
                    jobId: ev.jobId ?? 0, actor: ev.poster ?? 'poster',
                    amount: ev.payment ?? 0.10, createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                } else {
                  if (ev.jobId != null) setDemoJobIds(j => ({ ...j, p2: ev.jobId }));
                  if (ev.txSig) setDemoTxSigs(s => ({ ...s, p2Post: ev.txSig }));
                  setDemoStep(7);
                  pushEvent({ id: `dr-post2-${Date.now()}`, type: 'JobPosted',
                    jobId: ev.jobId ?? 0, actor: ev.poster ?? 'poster',
                    amount: ev.payment ?? 0.10, createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                }
                break;

              case 'accepted':
                if (ev.phase === 1) {
                  if (ev.worker) demoWorkerAddrRef.current = ev.worker;
                  if (ev.txSig) setDemoTxSigs(s => ({ ...s, p1Accept: ev.txSig }));
                  setDemoStep(3);
                  pushEvent({ id: `dr-acc-${Date.now()}`, type: 'JobAccepted',
                    jobId: ev.jobId ?? 0, actor: ev.worker ?? 'worker',
                    createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                } else {
                  if (ev.txSig) setDemoTxSigs(s => ({ ...s, p2Accept: ev.txSig }));
                  setDemoStep(8);
                  pushEvent({ id: `dr-acc2-${Date.now()}`, type: 'JobAccepted',
                    jobId: ev.jobId ?? 0, actor: ev.worker ?? 'worker',
                    createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                }
                break;

              case 'submitted':
                if (ev.txSig) setDemoTxSigs(s => ({ ...s, p1Submit: ev.txSig }));
                if (ev.score != null) setDemoScore(ev.score);
                setDemoStep(4);
                pushEvent({ id: `dr-sub-${Date.now()}`, type: 'JobCompleted',
                  jobId: ev.jobId ?? 0, actor: 'worker',
                  createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                break;

              case 'released':
                if (ev.txSig) setDemoTxSigs(s => ({ ...s, p1Release: ev.txSig }));
                setDemoStep(6);
                pushEvent({ id: `dr-rel-${Date.now()}`, type: 'PaymentReleased',
                  jobId: ev.jobId ?? 0, actor: 'poster',
                  amount: (ev.payment ?? 0.10) * 0.975,
                  createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                break;

              case 'disputed':
                if (ev.txSig) setDemoTxSigs(s => ({ ...s, p2Dispute: ev.txSig }));
                setDemoStep(9);
                pushEvent({ id: `dr-dis-${Date.now()}`, type: 'JobDisputed',
                  jobId: ev.jobId ?? 0, actor: 'worker',
                  verificationScore: ev.score,
                  createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                break;

              case 'reclaimed':
                if (ev.txSig) setDemoTxSigs(s => ({ ...s, p2Reclaim: ev.txSig }));
                setDemoStep(10);
                pushEvent({ id: `dr-can-${Date.now()}`, type: 'JobCancelled',
                  jobId: ev.jobId ?? 0, actor: 'poster',
                  createdAt: Date.now(), txSig: ev.txSig ?? 'demo' });
                break;

              case 'demo_complete':
                setDemoStep(11);
                setTimeout(() => {
                  setDemoStep(0);
                  setDemoBusy(false);
                  setDemoTxSigs({});
                  setDemoScore(null);
                  setDemoJobIds({});
                  setDemoTaskInfo(null);
                  demoCompletedRef.current = false;
                  fetchChainJobs();
                }, 6_000);
                break;

              case 'error':
                console.error('[demo] server error:', ev.message);
                setDemoStep(0);
                setDemoBusy(false);
                break;
            }
          } catch { /* skip malformed SSE frame */ }
        }
      }
    } catch (e) {
      console.warn('[demo] SSE unavailable, using mock:', e);
      setDemoBusy(false);
      setDemoStep(0);
      setDemoTaskInfo(null);
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
          {demoStep > 0 && (
            <DemoConsole
              step={demoStep}
              task={demoTaskInfo?.task}
              payment={demoTaskInfo?.payment}
              txSigs={demoTxSigs}
              score={demoScore}
              jobIds={demoJobIds}
            />
          )}
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
          {/* Right-panel tab switcher — hidden during demo */}
          {!demoStep && (
            <div style={{
              display: 'flex', gap: 0,
              borderBottom: '1px solid var(--border)',
              padding: '0 20px',
            }}>
              {(['activity', 'leaderboard'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 14px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                    color: rightTab === tab ? A : 'rgba(255,255,255,0.3)',
                    borderBottom: `2px solid ${rightTab === tab ? A : 'transparent'}`,
                    marginBottom: -1,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {tab === 'activity' ? 'Activity' : '🏆 Leaderboard'}
                </button>
              ))}
            </div>
          )}
          {rightTab === 'activity' || demoStep > 0
            ? <ActivityPanel events={feedEvents} compact={demoStep > 0} />
            : <Leaderboard chainJobs={chainJobs} />
          }
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
          {demoStep === 0  && '▶ Run Demo'}
          {demoStep >= 1 && demoStep <= 5  && <><Spinner /> Phase 1…</>}
          {demoStep === 6  && <><Spinner /> Phase 2 Starting…</>}
          {demoStep >= 7 && demoStep <= 10 && <><Spinner /> Phase 2…</>}
          {demoStep === 11 && '✓ Complete'}
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
  usdcVolume: number;
  activeAgents: number;
  avgPayment: number;
  successRate: number;
};

function StatsBar({ stats, chainCount, lastUpdated }: { stats: StatsShape; chainCount: number; lastUpdated: Date | null }) {
  // Total USDC volume (all jobs, all statuses) — the headline traction number
  const volumeDisplay = stats.usdcVolume >= 1000
    ? `$${(stats.usdcVolume / 1000).toFixed(1)}k`
    : `$${stats.usdcVolume.toFixed(2)}`;

  // USDC paid out to workers (Completed jobs only)
  const settledDisplay = stats.usdcSettled >= 1000
    ? `$${(stats.usdcSettled / 1000).toFixed(1)}k`
    : `$${stats.usdcSettled.toFixed(2)}`;

  // Average payment per job — previously broken (Math.round made it 0)
  const avgDisplay = `$${stats.avgPayment.toFixed(2)}`;

  const updatedAgo = lastUpdated
    ? (() => {
        const s = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
        return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
      })()
    : null;

  return (
    <div style={s.statsBar}>
      {/* ── Headline traction metrics ── */}
      <Stat label="Total Jobs"      value={stats.totalJobs.toLocaleString()} />
      <StatDiv />
      <Stat label="USDC Volume"     value={volumeDisplay} accent />
      <StatDiv />
      <Stat label="USDC Settled"    value={settledDisplay} accent={stats.usdcSettled > 0} />
      <StatDiv />
      <Stat label="Avg Payment"     value={avgDisplay} />
      <StatDiv />
      <Stat label="Unique Agents"   value={stats.activeAgents.toString()} />
      <StatDiv />
      <Stat label="Completion Rate" value={`${stats.successRate}%`} accent={stats.successRate >= 50} />
      <StatDiv />
      {/* ── Operational pulse ── */}
      <Stat label="Open Now"        value={stats.openJobs.toString()} />
      <StatDiv />
      <Stat label="On-chain"        value={chainCount.toString()} accent={chainCount > 0} />

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

// ── Demo console — two-phase: happy path + adversarial ────────────────────────

type DemoTxSigs = {
  p1Post?: string; p1Accept?: string; p1Submit?: string; p1Release?: string;
  p2Post?: string; p2Accept?: string; p2Dispute?: string; p2Reclaim?: string;
};

function DemoConsole({ step, task, payment, txSigs, score, jobIds }: {
  step: number;
  task?: string;
  payment?: number;
  txSigs: DemoTxSigs;
  score: number | null;
  jobIds: { p1?: number; p2?: number };
}) {
  const amt    = (payment ?? 0.10).toFixed(2);
  const paidAmt = ((payment ?? 0.10) * 0.975).toFixed(4);

  // Phase 1 progress: step 1→5 maps to 0→100%
  const p1Pct = step >= 6  ? 100 : step >= 1 ? Math.round(((step - 1) / 4) * 100) : 0;
  // Phase 2 progress: step 7→10 maps to 0→100%
  const p2Pct = step >= 11 ? 100 : step >= 7 ? Math.round(((step - 7) / 3) * 100) : 0;

  const subtitle = task ? (task.length > 54 ? task.slice(0, 54) + '…' : task) : `DeFi Analysis · ${amt} USDC`;

  // Phase 1 step definitions
  const p1Steps = [
    { id: 1, label: 'Job Posted',        detail: `${amt} USDC locked in escrow`,                         sig: txSigs.p1Post    },
    { id: 2, label: 'Agent Accepted',    detail: 'Worker committed on-chain',                            sig: txSigs.p1Accept  },
    { id: 3, label: 'Claude Working',    detail: 'Analysing Solana DeFi protocols…',                     sig: undefined        },
    { id: 4, label: 'Work Verified',     detail: score != null ? `Score: ${score}/10 · passed threshold (≥7)` : 'Verified by Claude', sig: txSigs.p1Submit  },
    { id: 5, label: 'Payment Released',  detail: `${paidAmt} USDC → worker (97.5% after fee)`,          sig: txSigs.p1Release },
  ] as const;

  // Phase 2 step definitions
  const p2Steps = [
    { id: 7,  label: 'Job Posted',        detail: `${amt} USDC locked in escrow`,                        sig: txSigs.p2Post,   red: false },
    { id: 8,  label: 'Agent Accepted',    detail: 'Worker accepts the job',                              sig: txSigs.p2Accept, red: false },
    { id: 9,  label: '⚠ Work Disputed',   detail: 'Score: 3/10 · below threshold · payment withheld',   sig: txSigs.p2Dispute, red: true },
    { id: 10, label: 'Escrow Reclaimed',  detail: `${amt} USDC returned to poster in full`,              sig: txSigs.p2Reclaim, red: false },
  ] as const;

  return (
    <div style={{ ...s.demoConsole, maxHeight: 520, overflowY: 'auto' as const }}>
      {/* Header */}
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>LIVE DEMO</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
          letterSpacing: '0.06em', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const }}>
          {subtitle}
        </span>
      </div>

      {/* ── Phase 1: Happy Path ── */}
      <div style={{ padding: '8px 18px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', fontWeight: 600,
            color: step >= 6 ? '#22c55e' : A,
          }}>
            PHASE 1 — HAPPY PATH{step >= 6 ? '  ✓' : ''}
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {p1Steps.map(ps => (
          <DemoStepRow
            key={ps.id}
            state={step > ps.id || step >= 6 ? 'done' : step === ps.id ? 'active' : 'pending'}
            label={ps.label}
            detail={ps.detail}
            sig={ps.sig}
            red={false}
          />
        ))}

        {/* Phase 1 progress bar */}
        <div style={{ marginTop: 6, marginBottom: 2 }}>
          <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', width: `${p1Pct}%`, background: step >= 6 ? '#22c55e' : A,
              borderRadius: 1, transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* Phase 1 complete — Explorer link */}
        {step >= 6 && txSigs.p1Release && (
          <a href={EXPLORER(txSigs.p1Release)} target="_blank" rel="noreferrer"
            style={{ display: 'block', textAlign: 'right' as const, fontFamily: 'var(--font-mono)',
              fontSize: 10, color: '#22c55e', textDecoration: 'none', letterSpacing: '0.06em',
              marginBottom: 4 }}>
            View release tx on Explorer ↗
          </a>
        )}
      </div>

      {/* ── Phase 2: Adversarial Case (shown from step 6 onward) ── */}
      {step >= 6 && (
        <div style={{ padding: '8px 18px 6px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', fontWeight: 600,
              color: step >= 11 ? '#22c55e' : '#ef4444',
            }}>
              PHASE 2 — ADVERSARIAL CASE{step >= 11 ? '  ✓' : ''}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {p2Steps.map(ps => (
            <DemoStepRow
              key={ps.id}
              state={step > ps.id ? 'done' : step === ps.id ? 'active' : 'pending'}
              label={ps.label}
              detail={ps.detail}
              sig={ps.sig}
              red={ps.red}
            />
          ))}

          {/* Locked escrow banner — visible only while disputed, before reclaim */}
          {step === 9 && (
            <div style={{
              margin: '6px 0 4px', padding: '6px 12px',
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13 }}>🔒</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ef4444',
                letterSpacing: '0.08em', flex: 1 }}>
                ESCROW LOCKED · {amt} USDC WITHHELD
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(239,68,68,0.6)',
                padding: '2px 7px', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3,
                display: 'flex', alignItems: 'center', gap: 4, letterSpacing: '0.06em',
              }}>
                <Spinner size={7} /> RECLAIMING
              </span>
            </div>
          )}

          {/* Phase 2 progress bar */}
          <div style={{ marginTop: 6, marginBottom: 2 }}>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${p2Pct}%`,
                background: step >= 11 ? '#22c55e' : '#ef4444',
                borderRadius: 1, transition: 'width 0.6s ease' }} />
            </div>
          </div>

          {/* Phase 2 complete — Explorer link */}
          {step >= 10 && txSigs.p2Reclaim && (
            <a href={EXPLORER(txSigs.p2Reclaim)} target="_blank" rel="noreferrer"
              style={{ display: 'block', textAlign: 'right' as const, fontFamily: 'var(--font-mono)',
                fontSize: 10, color: A, textDecoration: 'none', letterSpacing: '0.06em',
                marginBottom: 4 }}>
              View reclaim tx on Explorer ↗
            </a>
          )}
        </div>
      )}

      {/* ── Final banner ── */}
      {step === 11 && (
        <div style={{
          margin: '0 18px 12px', padding: '8px 14px',
          background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 6, textAlign: 'center' as const,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#22c55e',
            letterSpacing: '0.14em', fontWeight: 600 }}>
            ✓ PROTOCOL VERIFIED ON-CHAIN
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)',
            letterSpacing: '0.06em', marginTop: 3 }}>
            happy path + adversarial case — both proven
          </div>
          {(jobIds.p1 || jobIds.p2) && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--border-mid)',
              marginTop: 4, letterSpacing: '0.04em' }}>
              Job #{jobIds.p1} · Job #{jobIds.p2}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Demo step row ──────────────────────────────────────────────────────────────

function DemoStepRow({ state, label, detail, sig, red }: {
  state: 'done' | 'active' | 'pending';
  label: string;
  detail: string;
  sig?: string;
  red: boolean;
}) {
  // If active AND we have a result sig (non-Claude steps), render as done immediately
  const effective = state === 'active' && sig !== undefined && !red ? 'done' : state;
  const accentCol = red ? '#ef4444' : A;
  const borderCol = red ? 'rgba(239,68,68,0.3)' : A30;
  const bgCol     = red ? 'rgba(239,68,68,0.1)' : A12;

  const icon =
    effective === 'done'   ? '✓' :
    effective === 'active' && red ? '⚠' :
    effective === 'active' ? <Spinner size={8} /> :
    null;

  const textColor =
    effective === 'pending' ? 'var(--text-muted)' :
    red ? '#ef4444' : 'var(--text-primary)';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0' }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
        background: effective !== 'pending' ? bgCol : 'transparent',
        border: `1px solid ${effective === 'pending' ? 'var(--border)' : borderCol}`,
        color: effective === 'pending' ? 'var(--text-muted)' : accentCol,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: textColor, letterSpacing: '0.01em' }}>
          {label}
        </div>
        {effective !== 'pending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const,
            marginTop: 1 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {detail}
            </span>
            {sig && (
              <a href={EXPLORER(sig)} target="_blank" rel="noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: red ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)',
                  textDecoration: 'none', whiteSpace: 'nowrap' as const,
                  borderBottom: `1px dotted ${red ? 'rgba(239,68,68,0.3)' : 'var(--border-mid)'}`,
                }}>
                {sig.slice(0, 8)}… ↗
              </a>
            )}
          </div>
        )}
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

// ── Task complexity pricing ────────────────────────────────────────────────────
// Scores the task text on a set of signals and maps to a per-capability price tier.
// No API call — runs locally on every keystroke.
const PRICE_TIERS: Record<string, [number, number, number]> = {
  research: [0.05, 0.10, 0.20],
  trading:  [0.10, 0.15, 0.25],
  coding:   [0.15, 0.20, 0.30],
  writing:  [0.05, 0.10, 0.15],
};

function scoreTask(task: string): number {
  const t = task.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean);
  let score = 0;

  // Word count — lower bands so concise-but-complex tasks aren't penalised
  if (words.length > 20)  score += 1;
  if (words.length > 50)  score += 1;
  if (words.length > 100) score += 1;

  // Numbered sub-requirements — each is a distinct deliverable
  const numberedSteps = (task.match(/\(\d+\)|\b\d+[.)]\s/g) ?? []).length;
  score += Math.min(numberedSteps, 4);

  // Deliverable verbs — things the agent must explicitly produce
  const deliverables = ['write','return','build','calculate','produce','generate',
    'implement','create','design','output','compare','evaluate','specify','include'];
  score += Math.min(deliverables.filter(k => t.includes(k)).length, 3);

  // Constraint keywords — each adds reasoning surface area
  const constraints = ['must','should','ensure','validate','handle','without',
    'only if','at least','no more than','never','always'];
  score += Math.min(constraints.filter(k => t.includes(k)).length, 3);

  // Numerical comparison breadth — "top 5 protocols", "3 scenarios"
  const numerals = (task.match(/\b(top\s*\d+|\d+\s*(protocol|scenario|option|token|case|step|exchange|wallet|validator)s?)\b/gi) ?? []).length;
  score += Math.min(numerals, 3);

  // High-signal output formats
  if (t.includes('test') || t.includes('mocha') || t.includes('chai')) score += 2;
  if (t.includes('table') || t.includes('comparison table'))            score += 1;
  if (t.includes('end-to-end') || t.includes('step-by-step'))          score += 1;

  return score;
}

type PriceTier = 'Simple' | 'Standard' | 'Complex';

function estimatePrice(task: string, capability: string): { price: number; tier: PriceTier } {
  const score = scoreTask(task);
  const [low, mid, high] = PRICE_TIERS[capability] ?? [0.10, 0.15, 0.20];
  if (score <= 2)  return { price: low,  tier: 'Simple'   };
  if (score <= 7)  return { price: mid,  tier: 'Standard' };
  return                  { price: high, tier: 'Complex'  };
}

const TIER_COLOR: Record<PriceTier, string> = {
  Simple:   'var(--text-muted)',
  Standard: '#F59E0B',
  Complex:  '#EF4444',
};

const CAPABILITIES = ['research', 'trading', 'coding', 'writing'] as const;
type Capability = typeof CAPABILITIES[number];

function PostJobForm({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: (sig: string) => void;
  onError: (msg: string) => void;
}) {
  const { publicKey } = useWallet();
  const { postJob } = useJobActions();
  const [capability, setCapability] = useState<Capability>('research');
  const [task, setTask]   = useState('');
  const [jobId, setJobId] = useState(() => String(Math.floor(Date.now() / 1000) % 100000));
  const [busy, setBusy]   = useState(false);

  // Recalculate on every keystroke — returns Simple tier defaults for very short input
  const { price, tier } = task.trim().length > 20
    ? estimatePrice(task.trim(), capability)
    : { price: PRICE_TIERS[capability][0], tier: 'Simple' as PriceTier };

  const tierCol = TIER_COLOR[tier];

  async function handleSubmit() {
    if (!publicKey)    { onError('Connect your wallet first'); return; }
    if (!task.trim())  { onError('Description is required'); return; }
    const id = parseInt(jobId);
    if (!id || id <= 0) { onError('Enter a valid Job ID'); return; }

    setBusy(true);
    try {
      // Encode capability tag so workers can filter by type
      const description = `[cap:${capability}] ${task.trim()}`;
      const sig = await postJob(id, description, price);
      onSuccess(sig);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
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

      {/* Job ID */}
      <div style={{ marginBottom: 10 }}>
        <label style={s.formLabel}>JOB ID</label>
        <input style={s.formInput} type="number" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="e.g. 52" />
      </div>

      {/* Capability selector */}
      <div style={{ marginBottom: 10 }}>
        <label style={s.formLabel}>CAPABILITY</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {CAPABILITIES.map(cap => (
            <button
              key={cap}
              onClick={() => setCapability(cap)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 10,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4,
                border: capability === cap
                  ? '1px solid rgba(245,158,11,0.6)'
                  : '1px solid var(--border-mid)',
                background: capability === cap
                  ? 'rgba(245,158,11,0.08)'
                  : 'var(--bg-input)',
                color: capability === cap ? '#F59E0B' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {cap}
            </button>
          ))}
        </div>
      </div>

      {/* Task description */}
      <div style={{ marginBottom: 10 }}>
        <label style={s.formLabel}>DESCRIPTION <span style={{ opacity: 0.4 }}>(max 512)</span></label>
        <textarea
          style={{ ...s.formInput, height: 88, resize: 'vertical' } as React.CSSProperties}
          value={task} onChange={e => setTask(e.target.value)} maxLength={512}
          placeholder="Describe the task for the worker agent…"
        />
      </div>

      {/* Calculated price — locked for Complex, informational for others */}
      <div style={{ marginBottom: 12 }}>
        <label style={s.formLabel}>
          PRICE
          <span style={{ marginLeft: 6, color: tierCol, fontSize: 9, letterSpacing: '0.12em' }}>
            {tier === 'Complex'  ? '⬥ COMPLEX · LOCKED BY SYSTEM' :
             tier === 'Standard' ? '⬥ STANDARD'                    :
                                   '⬥ SIMPLE'}
          </span>
        </label>
        <div style={{
          ...s.formInput,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          pointerEvents: 'none', userSelect: 'none',
          border: `1px solid ${
            tier === 'Complex'  ? 'rgba(239,68,68,0.4)'    :
            tier === 'Standard' ? 'rgba(245,158,11,0.3)'   :
                                  'var(--border-mid)'
          }`,
          background: tier === 'Complex' ? 'rgba(239,68,68,0.05)' : 'var(--bg-input)',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: tierCol }}>
            {price.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400 }}>USDC</span>
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {tier === 'Complex' ? 'SET BY SYSTEM' : 'AUTO-CALCULATED'}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 12, letterSpacing: '0.02em' }}>
        {publicKey ? 'USDC locked in escrow on-chain immediately.' : '⚠ Connect wallet to post a job.'}
      </div>
      <button
        disabled={busy || !publicKey}
        onClick={handleSubmit}
        style={{ ...s.accentBtn, width: '100%', padding: '9px 0', justifyContent: 'center', opacity: (!publicKey || busy) ? 0.6 : 1 }}
      >
        {busy ? <><Spinner /> Confirming…</> : `Post Job · ${price.toFixed(2)} USDC`}
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
