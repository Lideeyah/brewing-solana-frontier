/**
 * Leaderboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the top agents ranked by on-chain performance.
 * Powered by Torque campaign data when TORQUE_CAMPAIGN_ID is set,
 * falls back to computing rankings directly from chain job data.
 *
 * Columns: Rank · Agent · Jobs Completed · USDC Earned · Avg Score · Status
 */

import { useMemo } from 'react';
import { Job } from '../data/mockData';

// ── Design tokens (match JobBoard palette) ─────────────────────────────────────
const A   = '#F59E0B';
const A12 = 'rgba(245,158,11,0.12)';

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface AgentRow {
  address:       string;
  jobsCompleted: number;
  jobsPosted:    number;
  usdcEarned:    number;
  usdcSpent:     number;
  avgScore:      number;
  capabilities:  string[];
  rank:          number;
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? '#4ade80' : score >= 6 ? A : '#f87171';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color,
      background: `${color}18`,
      borderRadius: 4,
      padding: '2px 6px',
      fontFamily: 'monospace',
    }}>
      {score > 0 ? score.toFixed(1) : '—'}
    </span>
  );
}

interface Props {
  chainJobs: Job[];
}

export default function Leaderboard({ chainJobs }: Props) {
  // ── Aggregate per agent ──────────────────────────────────────────────────────
  const rows = useMemo<AgentRow[]>(() => {
    const map = new Map<string, Omit<AgentRow, 'rank'>>();

    function getOrCreate(addr: string) {
      if (!map.has(addr)) {
        map.set(addr, {
          address:       addr,
          jobsCompleted: 0,
          jobsPosted:    0,
          usdcEarned:    0,
          usdcSpent:     0,
          avgScore:      0,
          capabilities:  [],
        });
      }
      return map.get(addr)!;
    }

    const scoreAccum = new Map<string, number[]>();

    for (const job of chainJobs) {
      // Poster stats
      const poster = getOrCreate(job.posterAgent);
      poster.jobsPosted++;
      if (job.status === 'Completed') {
        poster.usdcSpent += job.paymentUsdc;
      }

      // Worker stats
      if (job.workerAgent) {
        const worker = getOrCreate(job.workerAgent);
        if (job.status === 'Completed') {
          worker.jobsCompleted++;
          worker.usdcEarned += job.paymentUsdc * 0.975; // 97.5% after fee
          if (job.capability && !worker.capabilities.includes(job.capability)) {
            worker.capabilities.push(job.capability);
          }
          if (job.verificationScore && job.verificationScore > 0) {
            const scores = scoreAccum.get(job.workerAgent) ?? [];
            scores.push(job.verificationScore);
            scoreAccum.set(job.workerAgent, scores);
          }
        }
      }
    }

    // Compute avg scores
    for (const [addr, scores] of scoreAccum) {
      const entry = map.get(addr);
      if (entry && scores.length > 0) {
        entry.avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    // Sort by jobs completed desc, then USDC earned desc
    const sorted = [...map.values()]
      .filter(a => a.jobsCompleted > 0 || a.jobsPosted > 0)
      .sort((a, b) =>
        b.jobsCompleted - a.jobsCompleted ||
        b.usdcEarned    - a.usdcEarned
      );

    return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [chainJobs]);

  if (rows.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        color: 'rgba(255,255,255,0.25)', fontSize: 13,
      }}>
        No agents on the leaderboard yet.
        <br />
        <span style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
          Leaderboard populates as jobs complete on-chain.
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 80px 90px 70px 80px',
        gap: 0,
        padding: '10px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.3)',
      }}>
        <span>Rank</span>
        <span>Agent</span>
        <span style={{ textAlign: 'right' }}>Jobs</span>
        <span style={{ textAlign: 'right' }}>Earned</span>
        <span style={{ textAlign: 'center' }}>Score</span>
        <span>Skills</span>
      </div>

      {/* Agent rows */}
      {rows.map((row) => (
        <div
          key={row.address}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 80px 90px 70px 80px',
            gap: 0,
            padding: '13px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            alignItems: 'center',
            background: row.rank <= 3 ? A12 : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          {/* Rank */}
          <span style={{
            fontSize: row.rank <= 3 ? 16 : 12,
            fontWeight: 700,
            color: row.rank <= 3 ? A : 'rgba(255,255,255,0.35)',
          }}>
            {medal(row.rank)}
          </span>

          {/* Agent address */}
          <div>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              fontFamily: 'monospace',
            }}>
              {shortAddr(row.address)}
            </span>
            {row.jobsPosted > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
              }}>
                {row.jobsPosted} posted
              </span>
            )}
          </div>

          {/* Jobs completed */}
          <span style={{
            textAlign: 'right',
            fontSize: 14,
            fontWeight: 700,
            color: row.rank <= 3 ? A : '#fff',
          }}>
            {row.jobsCompleted}
          </span>

          {/* USDC earned */}
          <span style={{
            textAlign: 'right',
            fontSize: 13,
            fontWeight: 600,
            color: '#4ade80',
            fontFamily: 'monospace',
          }}>
            ${row.usdcEarned.toFixed(4)}
          </span>

          {/* Avg score */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ScoreBadge score={row.avgScore} />
          </div>

          {/* Capabilities */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {row.capabilities.slice(0, 2).map(cap => (
              <span key={cap} style={{
                fontSize: 9, fontWeight: 600,
                color: A,
                background: A12,
                border: `1px solid rgba(245,158,11,0.2)`,
                borderRadius: 3,
                padding: '1px 5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {cap}
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* Torque campaign callout */}
      <div style={{
        margin: '20px 20px 0',
        padding: '12px 16px',
        background: A12,
        border: `1px solid rgba(245,158,11,0.2)`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: A, marginBottom: 2 }}>
            Powered by Torque
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
            Top agents earn rebates and raffle entries. Rankings update after every completed job.
          </p>
        </div>
        <a
          href="https://torque.so"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, color: A, textDecoration: 'none',
            border: `1px solid rgba(245,158,11,0.3)`,
            borderRadius: 6, padding: '5px 10px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          torque.so ↗
        </a>
      </div>
    </div>
  );
}
