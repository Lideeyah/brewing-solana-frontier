import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { useBrewingProgram } from '../hooks/useBrewingProgram';
import { decodeDescription, shortAddr, JobStatus } from '../data/mockData';

const A   = '#F59E0B';
const A12 = 'rgba(245,158,11,0.12)';
const A20 = 'rgba(245,158,11,0.20)';
const A30 = 'rgba(245,158,11,0.30)';
const EXPLORER_ADDR = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

interface ChainJob {
  jobId: number;
  description: string;
  capability?: string;
  task: string;
  paymentUsdc: number;
  posterAgent: string;
  workerAgent: string | null;
  status: JobStatus;
  verificationScore: number;
  pubkey: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chainToJob(pubkey: PublicKey, acc: any): ChainJob | null {
  try {
    const zeroKey = PublicKey.default.toBase58();
    const workerStr = (acc.workerAgent as PublicKey).toBase58();
    const rawDesc = acc.description as string;
    const { capability, task } = decodeDescription(rawDesc);
    function parseStatus(raw: Record<string, unknown>): JobStatus {
      if ('open' in raw) return 'Open';
      if ('inProgress' in raw) return 'InProgress';
      if ('pendingRelease' in raw) return 'PendingRelease';
      if ('completed' in raw) return 'Completed';
      if ('disputed' in raw) return 'Disputed';
      if ('cancelled' in raw) return 'Cancelled';
      return 'Disputed';
    }
    return {
      jobId: (acc.jobId as BN).toNumber(),
      description: rawDesc,
      capability,
      task,
      paymentUsdc: (acc.paymentAmount as BN).toNumber() / 1_000_000,
      posterAgent: (acc.posterAgent as PublicKey).toBase58(),
      workerAgent: workerStr === zeroKey ? null : workerStr,
      status: parseStatus(acc.status as Record<string, unknown>),
      verificationScore: (acc.verificationScore as number) ?? 0,
      pubkey: pubkey.toBase58(),
    };
  } catch { return null; }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const program = useBrewingProgram();
  const [jobs, setJobs] = useState<ChainJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!program) { setLoading(false); return; }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accs = await (program.account as any).jobAccount.all();
      const parsed = (accs as { publicKey: PublicKey; account: unknown }[])
        .map(a => chainToJob(a.publicKey, a.account))
        .filter((j): j is ChainJob => j !== null);
      setJobs(parsed);
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('Admin fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 20_000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  const stats = useMemo(() => {
    const byStatus = (s: JobStatus) => jobs.filter(j => j.status === s);
    const byCap = jobs.reduce<Record<string, number>>((acc, j) => {
      const c = j.capability ?? 'untagged';
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    const totalUsdc = jobs.reduce((s, j) => s + j.paymentUsdc, 0);
    const settledUsdc = byStatus('Completed').reduce((s, j) => s + j.paymentUsdc, 0);
    const feeUsdc = settledUsdc * 0.025;
    // Unique agents
    const posters = new Set(jobs.map(j => j.posterAgent));
    const workers = new Set(jobs.flatMap(j => j.workerAgent ? [j.workerAgent] : []));
    const allAgents = new Set([...posters, ...workers]);
    // Agent leaderboard
    const workerMap: Record<string, { jobs: number; usdc: number }> = {};
    jobs.filter(j => j.status === 'Completed' && j.workerAgent).forEach(j => {
      const k = j.workerAgent!;
      if (!workerMap[k]) workerMap[k] = { jobs: 0, usdc: 0 };
      workerMap[k].jobs++;
      workerMap[k].usdc += j.paymentUsdc * 0.975;
    });
    const leaderboard = Object.entries(workerMap)
      .sort((a, b) => b[1].jobs - a[1].jobs)
      .slice(0, 5);
    return {
      total: jobs.length,
      open: byStatus('Open').length,
      inProgress: byStatus('InProgress').length,
      pending: byStatus('PendingRelease').length,
      completed: byStatus('Completed').length,
      disputed: byStatus('Disputed').length,
      cancelled: byStatus('Cancelled').length,
      completionRate: jobs.length > 0 ? +((byStatus('Completed').length / jobs.length) * 100).toFixed(1) : 0,
      totalUsdc,
      settledUsdc,
      feeUsdc,
      uniquePosters: posters.size,
      uniqueWorkers: workers.size,
      uniqueAgents: allAgents.size,
      byCap,
      leaderboard,
      avgScore: (() => {
        const scored = jobs.filter(j => j.verificationScore > 0);
        return scored.length > 0 ? (scored.reduce((s, j) => s + j.verificationScore, 0) / scored.length).toFixed(1) : '—';
      })(),
    };
  }, [jobs]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, background: '#111', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky' as const, top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', padding: 0 }}>← Back</button>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
          <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.16em', color: A }}>ADMIN DASHBOARD</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>updated {Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago</span>}
          <button onClick={fetchJobs} style={{ padding: '4px 12px', background: A12, border: `1px solid ${A30}`, borderRadius: 5, color: A, fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }}>↻ Refresh</button>
          <button onClick={() => navigate('/app')} style={{ padding: '4px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }}>App →</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {loading && (
          <div style={{ textAlign: 'center' as const, padding: 60, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading chain data…</div>
        )}

        {!loading && (
          <>
            {/* ── Key metrics ── */}
            <Section label="OVERVIEW">
              <Grid cols={4}>
                <Metric label="Total Jobs"      value={stats.total}           />
                <Metric label="USDC Settled"    value={`$${stats.settledUsdc.toFixed(2)}`} accent />
                <Metric label="Completion Rate" value={`${stats.completionRate}%`} accent={stats.completionRate >= 80} />
                <Metric label="Protocol Fees"   value={`$${stats.feeUsdc.toFixed(4)}`} />
              </Grid>
            </Section>

            {/* ── Job status breakdown ── */}
            <Section label="JOB STATUS BREAKDOWN">
              <Grid cols={6}>
                {[
                  { label: 'Open',       value: stats.open,       color: A },
                  { label: 'In Progress', value: stats.inProgress, color: A },
                  { label: 'Pending',    value: stats.pending,    color: A },
                  { label: 'Completed',  value: stats.completed,  color: '#22c55e' },
                  { label: 'Disputed',   value: stats.disputed,   color: '#ef4444' },
                  { label: 'Cancelled',  value: stats.cancelled,  color: '#6b7280' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, background: '#111' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>{s.label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${stats.total > 0 ? (s.value / stats.total) * 100 : 0}%`, background: s.color, borderRadius: 1, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                ))}
              </Grid>
            </Section>

            {/* ── USDC flow ── */}
            <Section label="USDC FLOW">
              <Grid cols={3}>
                <Metric label="Total Posted (Escrow In)"  value={`$${stats.totalUsdc.toFixed(4)}`}   />
                <Metric label="Settled to Workers (97.5%)" value={`$${(stats.settledUsdc * 0.975).toFixed(4)}`} accent />
                <Metric label="Treasury Fees (2.5%)"      value={`$${stats.feeUsdc.toFixed(4)}`}    />
              </Grid>
            </Section>

            {/* ── By capability ── */}
            <Section label="JOBS BY CAPABILITY">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {Object.entries(stats.byCap).sort((a, b) => b[1] - a[1]).map(([cap, count]) => (
                  <div key={cap} style={{ padding: '10px 16px', border: `1px solid ${A20}`, borderRadius: 6, background: A12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: A }}>{cap}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#fff' }}>{count}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{stats.total > 0 ? `${Math.round((count / stats.total) * 100)}%` : ''}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Agents ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Agent registry */}
              <Section label="AGENT REGISTRY" noMargin>
                <Grid cols={3}>
                  <Metric label="Unique Agents"  value={stats.uniqueAgents}  />
                  <Metric label="Unique Posters" value={stats.uniquePosters} />
                  <Metric label="Unique Workers" value={stats.uniqueWorkers} />
                </Grid>
              </Section>

              {/* Worker leaderboard */}
              <Section label="WORKER LEADERBOARD" noMargin>
                {stats.leaderboard.length === 0 ? (
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.2)', padding: '12px 0' }}>No completed jobs yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                    {stats.leaderboard.map(([addr, d], i) => (
                      <div key={addr} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, background: '#111' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: A, width: 16 }}>#{i + 1}</span>
                        <a href={EXPLORER_ADDR(addr)} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', flex: 1 }}>{shortAddr(addr)}</a>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#fff' }}>{d.jobs} jobs</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: A }}>${d.usdc.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* ── Avg verification score ── */}
            <Section label="QUALITY METRICS">
              <Grid cols={2}>
                <Metric label="Avg Verification Score" value={`${stats.avgScore} / 10`} accent />
                <Metric label="Avg Payment per Job"    value={`$${stats.total > 0 ? (stats.totalUsdc / stats.total).toFixed(2) : '0.00'}`} />
              </Grid>
            </Section>

            {/* ── Full job table ── */}
            <Section label={`ALL JOBS (${jobs.length})`}>
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontFamily: 'monospace', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['ID', 'STATUS', 'CAP', 'TASK', 'PAYMENT', 'SCORE', 'POSTER', 'WORKER', 'EXPLORER'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left' as const, letterSpacing: '0.1em', fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...jobs].sort((a, b) => b.jobId - a.jobId).map(j => {
                      const statusColor = j.status === 'Completed' ? '#22c55e' : j.status === 'Disputed' ? '#ef4444' : j.status === 'Cancelled' ? '#6b7280' : A;
                      return (
                        <tr key={j.pubkey} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)' }}>#{String(j.jobId).padStart(4, '0')}</td>
                          <td style={{ padding: '8px 10px', color: statusColor }}>{j.status}</td>
                          <td style={{ padding: '8px 10px', color: A }}>{j.capability ?? '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.6)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{j.task.slice(0, 60)}{j.task.length > 60 ? '…' : ''}</td>
                          <td style={{ padding: '8px 10px', color: A }}>${j.paymentUsdc.toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', color: j.verificationScore >= 7 ? '#22c55e' : j.verificationScore > 0 ? '#ef4444' : 'rgba(255,255,255,0.2)' }}>{j.verificationScore > 0 ? `${j.verificationScore}/10` : '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)' }}>{shortAddr(j.posterAgent)}</td>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)' }}>{j.workerAgent ? shortAddr(j.workerAgent) : '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <a href={EXPLORER_ADDR(j.pubkey)} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>↗</a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children, noMargin }: { label: string; children: React.ReactNode; noMargin?: boolean }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 16 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
      {children}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, background: '#111' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: accent ? A : '#fff' }}>{value}</div>
    </div>
  );
}
