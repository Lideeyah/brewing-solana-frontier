import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  MOCK_JOBS,
  MOCK_ACTIVITY,
  MOCK_STATS,
  LIVE_POOL,
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
} from '../data/mockData';

// ── Accent constant (single source of truth) ──────────────────────────────────
const A = '#F59E0B';
const A12 = 'rgba(245,158,11,0.12)';
const A20 = 'rgba(245,158,11,0.20)';
const A30 = 'rgba(245,158,11,0.30)';

const DEMO_JOB_OPEN: Job = {
  jobId: DEMO_JOB_ID,
  description: 'Analyse sentiment across the top 50 DeFi influencer accounts on X. Return structured JSON signal (bullish/bearish/neutral + confidence %) for SOL/USDC. Required within 60 seconds.',
  paymentUsdc: 0.10,
  posterAgent: DEMO_POSTER,
  workerAgent: null,
  status: 'Open',
  postedAt: new Date(),
  tag: 'AI · Trading',
};

// ── Root ──────────────────────────────────────────────────────────────────────

export default function JobBoard() {
  const [filter, setFilter]             = useState<'All' | JobStatus>('All');
  const [selectedJob, setSelectedJob]   = useState<Job | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [jobs, setJobs]                 = useState<Job[]>(MOCK_JOBS);
  const [feedEvents, setFeedEvents]     = useState<ActivityEvent[]>(MOCK_ACTIVITY);
  const [tick, setTick]                 = useState(0);
  const [demoStep, setDemoStep]         = useState(0);
  const [demoBusy, setDemoBusy]         = useState(false);
  const liveIdx                         = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const pushEvent = useCallback((ev: ActivityEvent) => {
    setFeedEvents(prev => [ev, ...prev.slice(0, 14)]);
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const go = () => {
      t = setTimeout(() => {
        const tpl = LIVE_POOL[liveIdx.current % LIVE_POOL.length];
        liveIdx.current++;
        pushEvent({ ...tpl, id: `live-${Date.now()}`, secondsAgo: 0 });
        go();
      }, 5000 + Math.random() * 6000);
    };
    go();
    return () => clearTimeout(t);
  }, [pushEvent]);

  function runDemo() {
    if (demoBusy) return;
    setDemoBusy(true);
    setFilter('All');
    setSelectedJob(null);
    setShowPostForm(false);
    setJobs(prev => prev.filter(j => j.jobId !== DEMO_JOB_ID));

    setDemoStep(1);
    setJobs(prev => [DEMO_JOB_OPEN, ...prev]);
    pushEvent({ id: `d-post-${Date.now()}`, type: 'JobPosted', jobId: DEMO_JOB_ID, actor: DEMO_POSTER, amount: 0.10, secondsAgo: 0, txSig: 'DmXp1KrT3nWqN8xVbYcA4sL6uHdLuEiGjOw9Pv2e' });

    setTimeout(() => {
      setDemoStep(2);
      setJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'InProgress' as JobStatus, workerAgent: DEMO_WORKER, acceptedAt: new Date() } : j));
      pushEvent({ id: `d-acc-${Date.now()}`, type: 'JobAccepted', jobId: DEMO_JOB_ID, actor: DEMO_WORKER, secondsAgo: 0, txSig: 'DmYq2LsU4oXrO9yWcZdB5tM7vIeGjPx1Qw3f' });

      setTimeout(() => {
        setDemoStep(3);
        setJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'PendingRelease' as JobStatus, completedAt: new Date() } : j));
        pushEvent({ id: `d-cmp-${Date.now()}`, type: 'JobCompleted', jobId: DEMO_JOB_ID, actor: DEMO_WORKER, secondsAgo: 0, txSig: 'DmZr3MtV5pYsP0zXdAeC6uN8wJfHkQy2Rx4g' });

        setTimeout(() => {
          setDemoStep(4);
          setJobs(prev => prev.map(j => j.jobId === DEMO_JOB_ID ? { ...j, status: 'Completed' as JobStatus } : j));
          pushEvent({ id: `d-rel-${Date.now()}`, type: 'PaymentReleased', jobId: DEMO_JOB_ID, actor: DEMO_POSTER, counterparty: DEMO_WORKER, amount: 0.10, secondsAgo: 0, txSig: 'DmAs4NuW6qZtQ1aYeBfD7vO9xKgIlRz3Sy5h' });

          setTimeout(() => {
            setDemoStep(5);
            setTimeout(() => { setDemoStep(0); setDemoBusy(false); }, 3000);
          }, 2500);
        }, 2500);
      }, 2500);
    }, 2500);
  }

  const filtered = filter === 'All' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <div style={s.shell}>
      <Header onPost={() => { setShowPostForm(v => !v); setSelectedJob(null); }} onDemo={runDemo} demoBusy={demoBusy} demoStep={demoStep} />
      <StatsBar />
      <div style={s.body}>
        <div style={s.leftCol}>
          <FilterBar active={filter} onChange={f => { setFilter(f); setSelectedJob(null); }} jobs={jobs} />
          {showPostForm && <PostJobForm onClose={() => setShowPostForm(false)} />}
          <div style={s.jobList}>
            {filtered.map(job => (
              <JobCard key={job.jobId} job={job} selected={selectedJob?.jobId === job.jobId} isDemo={job.jobId === DEMO_JOB_ID && demoBusy}
                onClick={() => setSelectedJob(j => j?.jobId === job.jobId ? null : job)} />
            ))}
          </div>
        </div>
        <div style={s.rightCol}>
          {demoStep > 0 && <DemoConsole step={demoStep} />}
          {!demoStep && selectedJob && <JobDetail job={selectedJob} onClose={() => setSelectedJob(null)} />}
          <ActivityPanel events={feedEvents} compact={demoStep > 0} />
        </div>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

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

function Spinner() {
  return <span style={{ display: 'inline-block', width: 10, height: 10, border: `1.5px solid ${A30}`, borderTopColor: A, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

function StatsBar() {
  const st = MOCK_STATS;
  return (
    <div style={s.statsBar}>
      <Stat label="Total Jobs"    value={st.totalJobs.toLocaleString()} />
      <StatDiv />
      <Stat label="USDC Settled"  value={`$${(st.usdcSettled / 1000).toFixed(1)}k`} accent />
      <StatDiv />
      <Stat label="Active Agents" value={st.activeAgents.toString()} />
      <StatDiv />
      <Stat label="Open"          value={st.openJobs.toString()} />
      <StatDiv />
      <Stat label="In Progress"   value={st.activeJobs.toString()} />
      <StatDiv />
      <Stat label="Avg Payment"   value={`$${st.avgPayment}`} />
      <StatDiv />
      <Stat label="Success Rate"  value={`${st.successRate}%`} />
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
const FILTERS: FilterOption[] = ['All', 'Open', 'InProgress', 'PendingRelease', 'Completed'];
const FILTER_LABELS: Record<FilterOption, string> = { All: 'All', Open: 'Open', InProgress: 'In Progress', PendingRelease: 'Pending', Completed: 'Completed', Cancelled: 'Cancelled' };

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

function JobCard({ job, selected, isDemo, onClick }: { job: Job; selected: boolean; isDemo: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ ...s.jobCard, ...(selected ? s.jobCardSelected : {}), ...(isDemo ? s.jobCardDemo : {}) }}>
      <div style={s.jobCardTop}>
        <div style={s.jobIdRow}>
          <span style={s.jobId}>#{String(job.jobId).padStart(4, '0')}</span>
          <span style={s.tag}>{job.tag}</span>
          {isDemo && <span style={s.demoPill}>demo</span>}
        </div>
        <StatusDot status={job.status} />
      </div>
      <p style={s.jobDesc}>{job.description}</p>
      <div style={s.jobCardBottom}>
        <div style={s.agentRow}>
          <span style={s.agentAddr}>{shortAddr(job.posterAgent)}</span>
          {job.workerAgent && <><span style={s.agentArrow}>→</span><span style={s.agentAddr}>{shortAddr(job.workerAgent)}</span></>}
        </div>
        <div style={s.payment}>
          <span style={s.paymentAmt}>{job.paymentUsdc}</span>
          <span style={s.paymentUnit}>USDC</span>
        </div>
      </div>
    </div>
  );
}

// ── Status dot — minimal, amber only ──────────────────────────────────────────

function StatusDot({ status, large }: { status: JobStatus; large?: boolean }) {
  const meta = STATUS_META[status];
  const showDot = meta.dotOpacity > 0;
  const isActive = status === 'Open' || status === 'InProgress';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {showDot && (
        <span style={{
          width: large ? 7 : 5, height: large ? 7 : 5, borderRadius: '50%', flexShrink: 0,
          background: A, opacity: meta.dotOpacity,
          animation: isActive ? 'pulse-dot 2s ease-in-out infinite' : undefined,
        }} />
      )}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
        color: showDot ? 'var(--text-secondary)' : 'var(--text-muted)',
      }}>
        {meta.label}
      </span>
    </div>
  );
}

// ── Job detail ─────────────────────────────────────────────────────────────────

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  return (
    <div style={s.detailPanel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>#{String(job.jobId).padStart(4, '0')}</span>
        <button onClick={onClose} style={s.closeBtn}>✕</button>
      </div>
      <div style={s.detailSection}>
        <StatusDot status={job.status} large />
      </div>
      <div style={s.detailSection}>
        <div style={s.detailLabel}>DESCRIPTION</div>
        <p style={s.detailText}>{job.description}</p>
      </div>
      <div style={s.detailGrid}>
        <div style={s.detailCard}>
          <div style={s.detailLabel}>PAYMENT</div>
          <div style={s.detailBigNum}>{job.paymentUsdc} <span style={s.detailUnit}>USDC</span></div>
        </div>
        <div style={{ ...s.detailCard, borderRight: 'none' }}>
          <div style={s.detailLabel}>CATEGORY</div>
          <div style={{ ...s.detailBigNum, fontSize: 15, color: 'var(--text-secondary)' }}>{job.tag}</div>
        </div>
      </div>
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
      {job.status === 'Open'           && <ActionBtn label="Accept Job" />}
      {job.status === 'InProgress'     && <ActionBtn label="Mark Complete" />}
      {job.status === 'PendingRelease' && <ActionBtn label="Release Payment" primary />}
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

function ActionBtn({ label, primary }: { label: string; primary?: boolean }) {
  return (
    <button style={{
      margin: '14px 20px 20px', padding: '9px 0', width: 'calc(100% - 40px)',
      background: primary ? A12 : 'transparent',
      border: `1px solid ${primary ? A30 : 'var(--border-mid)'}`,
      borderRadius: 6, color: primary ? A : 'var(--text-secondary)',
      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
      letterSpacing: '0.08em', cursor: 'pointer', textAlign: 'center' as const,
    }}>{label}</button>
  );
}

// ── Demo console ───────────────────────────────────────────────────────────────

const DEMO_STEPS = [
  { id: 1, label: 'Post Job',         detail: 'Escrow funded · 0.10 USDC locked' },
  { id: 2, label: 'Accept Job',       detail: 'Worker committed on-chain' },
  { id: 3, label: 'Work Delivered',   detail: 'JSON signal submitted' },
  { id: 4, label: 'Payment Released', detail: '0.10 USDC transferred' },
];

function DemoConsole({ step }: { step: number }) {
  const pct = step >= 5 ? 100 : Math.round(((step - 1) / 4) * 100);
  return (
    <div style={s.demoConsole}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>DEMO</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Sentiment Analysis · 0.10 USDC</span>
      </div>
      <div style={{ padding: '8px 20px' }}>
        {DEMO_STEPS.map(ds => {
          const state = step > ds.id ? 'done' : step === ds.id ? 'active' : 'pending';
          return (
            <div key={ds.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                background: state === 'done' ? A12 : state === 'active' ? A12 : 'transparent',
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
  return (
    <div style={{ ...s.activityPanel, ...(compact ? s.activityCompact : {}) }}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>ACTIVITY</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: A }}>
          <span style={{ ...s.netDot, background: A, boxShadow: `0 0 5px ${A}` }} />
          LIVE
        </div>
      </div>
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
                  {ev.amount !== undefined && <span style={{ ...s.feedAddr, color: A, marginLeft: 6 }}>+{ev.amount}</span>}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
                <div style={s.feedTx}>{shortTx(ev.txSig)}</div>
                <div style={{ ...s.feedTx, marginTop: 1 }}>{relativeTime(ev.secondsAgo)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && events.filter(e => e.type === 'PaymentReleased').length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: 10 }}>RECENT PAYMENTS</div>
          {events.filter(e => e.type === 'PaymentReleased' && e.amount).slice(0, 3).map(ev => (
            <div key={ev.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={s.feedAddr}>{shortAddr(ev.actor)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>
                <span style={s.feedAddr}>{shortAddr(ev.counterparty ?? '')}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: A }}>{ev.amount} USDC</span>
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

// ── Post job form ──────────────────────────────────────────────────────────────

function PostJobForm({ onClose }: { onClose: () => void }) {
  const [desc, setDesc]     = useState('');
  const [payment, setPayment] = useState('');
  const [jobId, setJobId]   = useState('52');
  return (
    <div style={s.postForm}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', color: 'var(--text-primary)', fontWeight: 600 }}>NEW JOB</span>
        <button onClick={onClose} style={s.closeBtn}>✕</button>
      </div>
      {[
        { label: 'JOB ID', type: 'number', val: jobId, set: setJobId, ph: '52' },
        { label: 'PAYMENT (USDC)', type: 'number', val: payment, set: setPayment, ph: '100' },
      ].map(({ label, type, val, set, ph }) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <label style={s.formLabel}>{label}</label>
          <input style={s.formInput} type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph} />
        </div>
      ))}
      <div style={{ marginBottom: 10 }}>
        <label style={s.formLabel}>DESCRIPTION <span style={{ opacity: 0.4 }}>(max 512)</span></label>
        <textarea style={{ ...s.formInput, height: 72, resize: 'vertical' } as React.CSSProperties}
          value={desc} onChange={e => setDesc(e.target.value)} maxLength={512} placeholder="Describe the task for the worker agent…" />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 12, letterSpacing: '0.02em' }}>
        USDC locked in escrow on-chain immediately.
      </div>
      <button style={{ ...s.accentBtn, width: '100%', padding: '9px 0', justifyContent: 'center' }}>
        Post Job + Lock USDC
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = {
  shell: { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },

  // Header
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 52,
    background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    flexShrink: 0, position: 'sticky' as const, top: 0, zIndex: 100,
  },
  headerLeft:    { display: 'flex', alignItems: 'center', gap: 14 },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 8 },
  headerDivider: { width: 1, height: 14, background: 'var(--border-mid)' },
  logo: {
    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15,
    letterSpacing: '0.16em', color: A,
  },
  logoSub: {
    fontFamily: 'var(--font-mono)', fontSize: 10,
    letterSpacing: '0.14em', color: 'var(--text-muted)',
  },
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

  // Stats bar
  statsBar: {
    display: 'flex', alignItems: 'center', padding: '0 20px', height: 48,
    background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    flexShrink: 0, overflowX: 'auto' as const,
  },
  statItem:  { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '0 18px', gap: 2, flexShrink: 0 },
  statLabel: { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' as const },
  statValue: { fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' },

  // Layout
  body:    { display: 'flex', flex: 1, overflow: 'hidden' },
  leftCol: { flex: '0 0 58%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
  rightCol: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },

  // Filter bar
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
  filterTabActive: {
    color: 'var(--text-primary)', background: 'transparent', border: '1px solid var(--border-mid)',
  },
  filterCount: {
    fontSize: 10, padding: '1px 5px', borderRadius: 3,
    background: 'var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },

  // Job list
  jobList: { flex: 1, overflowY: 'auto' as const, padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 6 },

  // Job card
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
  paymentUnit:{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.08em' },

  // Right panel shared
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  panelTitle: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-muted)', fontWeight: 600 },
  closeBtn:   { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 },

  // Job detail
  detailPanel: { flexShrink: 0, overflowY: 'auto' as const, borderBottom: '1px solid var(--border)', maxHeight: '55%' },
  detailSection: { padding: '11px 20px', borderBottom: '1px solid var(--border)' },
  detailLabel: { fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' as const },
  detailText:  { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  detailGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' },
  detailCard:  { padding: '11px 20px', borderRight: '1px solid var(--border)' },
  detailBigNum: { fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: A },
  detailUnit:  { fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' },
  addrFull:    { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' as const, lineHeight: 1.7 },
  timeline:    { padding: '11px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  timelineItem: { display: 'flex', alignItems: 'center', gap: 10 },
  timelineLabel: { fontSize: 12, color: 'var(--text-secondary)', flex: 1 },
  timelineDate: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' },

  // Demo console
  demoConsole: { flexShrink: 0, borderBottom: '1px solid var(--border)' },

  // Activity panel
  activityPanel: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const },
  activityCompact: { maxHeight: 260, flex: 'unset' as const },
  feedRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 20px',
    borderBottom: '1px solid var(--border)',
    animation: 'slide-in-top 0.25s ease both',
  },
  feedIcon: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1, width: 14, textAlign: 'center' as const },
  feedTop:  { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 },
  feedType: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em' },
  feedJob:  { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' },
  feedDetail: { display: 'flex', alignItems: 'center' },
  feedAddr: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' },
  feedTx:   { fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' },

  // Post form
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
