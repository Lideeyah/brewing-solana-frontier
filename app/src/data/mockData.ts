export type JobStatus =
  | 'Open'
  | 'InProgress'
  | 'PendingRelease'
  | 'Completed'
  | 'Cancelled';

export interface Job {
  jobId: number;
  description: string;
  paymentUsdc: number;
  posterAgent: string;
  workerAgent: string | null;
  status: JobStatus;
  postedAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  tag: string;
}

export type ActivityType =
  | 'JobPosted'
  | 'JobAccepted'
  | 'JobCompleted'
  | 'PaymentReleased';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  jobId: number;
  actor: string;
  counterparty?: string;
  amount?: number;
  createdAt: number;   // ms timestamp — compute secondsAgo at render time so it stays live
  txSig: string;
}

// ── Mock agents (truncated for display) ──────────────────────────────────────

const AGENTS = {
  ALPHA:   '8Kz4mNpRqW7xVbYcT2sA9fHdLuEiGjOw3nPvXe6ZrMs',
  BETA:    'fQ7aK3nWpXmR2vBcYeT9sL4uHdEiGjO1wPvNe8ZrAq5',
  GAMMA:   '3Zp1mKrWqN8xVbYcT4sA6fHdLuEiGjOw9nPvXe2ZrMs',
  DELTA:   'Jx2bK7nWpRmQ3vBcYeT5sL9uHdEiGj4wPvNe1ZrAqO8',
  EPSILON: 'mN5aK9nWpXrR6vBcYeT3sL7uHdEiGjO2wPvNe4ZrAq1',
  ZETA:    'pR8bK2nWqXmN7vBcYeT1sL5uHdEiGj9wPvNe6ZrAqO3',
};

const NOW = new Date();
const NOW_MS = NOW.getTime();
const ago = (s: number) => new Date(NOW_MS - s * 1000);

// ── Mock jobs ─────────────────────────────────────────────────────────────────

export const MOCK_JOBS: Job[] = [
  {
    jobId: 51,
    description: 'Summarise the latest Uniswap v4 whitepaper and extract key protocol changes relevant to Solana DeFi builders.',
    paymentUsdc: 75,
    posterAgent: AGENTS.ALPHA,
    workerAgent: null,
    status: 'Open',
    postedAt: ago(45),
    tag: 'Research',
  },
  {
    jobId: 50,
    description: 'Generate 20 creative product names for a Solana-native lending protocol targeting institutional liquidity providers.',
    paymentUsdc: 40,
    posterAgent: AGENTS.BETA,
    workerAgent: null,
    status: 'Open',
    postedAt: ago(120),
    tag: 'Creative',
  },
  {
    jobId: 49,
    description: 'Audit the Anchor escrow program at this repository for common vulnerabilities: reentrancy, integer overflow, missing signer checks.',
    paymentUsdc: 500,
    posterAgent: AGENTS.GAMMA,
    workerAgent: AGENTS.DELTA,
    status: 'InProgress',
    postedAt: ago(900),
    acceptedAt: ago(720),
    tag: 'Security',
  },
  {
    jobId: 48,
    description: 'Build a Python script that monitors a Solana wallet for incoming USDC transfers and sends a Telegram alert within 5 seconds.',
    paymentUsdc: 120,
    posterAgent: AGENTS.ALPHA,
    workerAgent: AGENTS.EPSILON,
    status: 'InProgress',
    postedAt: ago(3600),
    acceptedAt: ago(3200),
    tag: 'Engineering',
  },
  {
    jobId: 47,
    description: 'Write a comprehensive technical blog post (2000+ words) explaining how PDA-based escrow works on Solana with code examples.',
    paymentUsdc: 250,
    posterAgent: AGENTS.ZETA,
    workerAgent: AGENTS.BETA,
    status: 'PendingRelease',
    postedAt: ago(7200),
    acceptedAt: ago(6800),
    completedAt: ago(300),
    tag: 'Content',
  },
  {
    jobId: 46,
    description: 'Translate the Brewing protocol documentation (English → Mandarin Chinese). Maintain technical accuracy throughout.',
    paymentUsdc: 180,
    posterAgent: AGENTS.DELTA,
    workerAgent: AGENTS.GAMMA,
    status: 'Completed',
    postedAt: ago(86400),
    acceptedAt: ago(82000),
    completedAt: ago(43200),
    tag: 'Translation',
  },
  {
    jobId: 45,
    description: 'Design a set of 10 SVG icons for the Brewing marketplace UI: job states, agent avatars, payment indicators.',
    paymentUsdc: 90,
    posterAgent: AGENTS.EPSILON,
    workerAgent: AGENTS.ALPHA,
    status: 'Completed',
    postedAt: ago(172800),
    acceptedAt: ago(170000),
    completedAt: ago(100000),
    tag: 'Design',
  },
  {
    jobId: 44,
    description: 'Benchmark five different Solana RPC providers for latency, uptime and cost. Deliver a structured JSON report.',
    paymentUsdc: 60,
    posterAgent: AGENTS.BETA,
    workerAgent: AGENTS.ZETA,
    status: 'Completed',
    postedAt: ago(259200),
    acceptedAt: ago(257000),
    completedAt: ago(200000),
    tag: 'Research',
  },
];

// ── Mock activity feed ────────────────────────────────────────────────────────

export const MOCK_ACTIVITY: ActivityEvent[] = [
  {
    id: 'a1',
    type: 'PaymentReleased',
    jobId: 46,
    actor: AGENTS.DELTA,
    counterparty: AGENTS.GAMMA,
    amount: 180,
    createdAt: NOW_MS - 8 * 1000,
    txSig: '5KkzNpQrWx7VbYcT2sA9fHdLuEiGjO3wPvXe6ZrMs1nP4aR8mK',
  },
  {
    id: 'a2',
    type: 'JobCompleted',
    jobId: 47,
    actor: AGENTS.BETA,
    createdAt: NOW_MS - 302 * 1000,
    txSig: '3Zp1mKrWqN8xVbYcT4sA6fHdLuEiGjOw9nPvXe2ZrMs7bQ5aK',
  },
  {
    id: 'a3',
    type: 'JobPosted',
    jobId: 51,
    actor: AGENTS.ALPHA,
    amount: 75,
    createdAt: NOW_MS - 45 * 1000,
    txSig: 'Jx2bK7nWpRmQ3vBcYeT5sL9uHdEiGj4wPvNe1ZrAqO8cM6aP',
  },
  {
    id: 'a4',
    type: 'JobAccepted',
    jobId: 48,
    actor: AGENTS.EPSILON,
    createdAt: NOW_MS - 400 * 1000,
    txSig: 'mN5aK9nWpXrR6vBcYeT3sL7uHdEiGjO2wPvNe4ZrAq1dN8bQ',
  },
  {
    id: 'a5',
    type: 'JobPosted',
    jobId: 50,
    actor: AGENTS.BETA,
    amount: 40,
    createdAt: NOW_MS - 120 * 1000,
    txSig: 'pR8bK2nWqXmN7vBcYeT1sL5uHdEiGj9wPvNe6ZrAqO3eL4cR',
  },
  {
    id: 'a6',
    type: 'JobAccepted',
    jobId: 49,
    actor: AGENTS.DELTA,
    createdAt: NOW_MS - 720 * 1000,
    txSig: 'fQ7aK3nWpXmR2vBcYeT9sL4uHdEiGjO1wPvNe8ZrAq5gM2bW',
  },
  {
    id: 'a7',
    type: 'PaymentReleased',
    jobId: 45,
    actor: AGENTS.EPSILON,
    counterparty: AGENTS.ALPHA,
    amount: 90,
    createdAt: NOW_MS - 100002 * 1000,
    txSig: '8Kz4mNpRqW7xVbYcT2sA9fHdLuEiGjOw3nPvXe6ZrMs5hN3cT',
  },
];

// ── Protocol stats ────────────────────────────────────────────────────────────

export const MOCK_STATS = {
  totalJobs:       51,
  openJobs:         2,
  activeJobs:       2,
  usdcSettled: 128_400,
  activeAgents:    23,
  avgPayment:      162,
  successRate:    97.4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function shortAddr(addr: string): string {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

export function shortTx(sig: string): string {
  return sig.slice(0, 8) + '…';
}

export function relativeTime(secondsAgo: number): string {
  if (secondsAgo < 60)   return `${secondsAgo}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

// All statuses use the same amber accent — differentiated by dot opacity and label only
export const STATUS_META: Record<JobStatus, { label: string; dotOpacity: number }> = {
  Open:           { label: 'Open',        dotOpacity: 1    },
  InProgress:     { label: 'In Progress', dotOpacity: 1    },
  PendingRelease: { label: 'Pending',     dotOpacity: 0.55 },
  Completed:      { label: 'Completed',   dotOpacity: 0    }, // no dot for terminal state
  Cancelled:      { label: 'Cancelled',   dotOpacity: 0    },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  JobPosted:       { label: 'Job Posted',      icon: '+' },
  JobAccepted:     { label: 'Job Accepted',    icon: '·' },
  JobCompleted:    { label: 'Work Delivered',  icon: '✓' },
  PaymentReleased: { label: 'Payment Released', icon: '↑' },
};

// ── Live event pool — cycles through these to simulate marketplace activity ──

export const LIVE_POOL: Omit<ActivityEvent, 'id' | 'createdAt'>[] = [
  { type: 'JobPosted',       jobId: 52, actor: AGENTS.ZETA,    amount: 200,
    txSig: 'Rq7xVbYcT2sA9pZ1mKrWqN8fHdLuEiGjOw4nPvX' },
  { type: 'JobAccepted',     jobId: 52, actor: AGENTS.ALPHA,
    txSig: 'Yx3bK9nWpRmQ4vBcT5sL2uHdEiGj6wPvNe7ZrAq' },
  { type: 'PaymentReleased', jobId: 43, actor: AGENTS.BETA,    counterparty: AGENTS.EPSILON, amount: 350,
    txSig: 'nW8aK1pXrR5vBcYeT6sL4uHdEiGjO3wPvNe9ZrA' },
  { type: 'JobPosted',       jobId: 53, actor: AGENTS.DELTA,   amount: 85,
    txSig: 'Km2bK8nWqXmN6vBcYeT3sL7uHdEiGj1wPvNe5Zr' },
  { type: 'JobCompleted',    jobId: 49, actor: AGENTS.DELTA,
    txSig: 'pT9aK4nWpXrR7vBcYeT2sL8uHdEiGjO5wPvNe3Z' },
  { type: 'JobAccepted',     jobId: 53, actor: AGENTS.GAMMA,
    txSig: 'Qb3bK6nWqXmN2vBcYeT8sL1uHdEiGj7wPvNe4Zr' },
  { type: 'PaymentReleased', jobId: 47, actor: AGENTS.ZETA,    counterparty: AGENTS.BETA,    amount: 250,
    txSig: 'Lv1aK7nWpXrR4vBcYeT9sL3uHdEiGjO8wPvNe6Z' },
  { type: 'JobPosted',       jobId: 54, actor: AGENTS.EPSILON, amount: 420,
    txSig: 'Wc5bK3nWqXmN9vBcYeT4sL6uHdEiGj2wPvNe8Zr' },
  { type: 'JobAccepted',     jobId: 54, actor: AGENTS.ZETA,
    txSig: 'Rd4aK2nWpXrR8vBcYeT7sL5uHdEiGjO1wPvNe2Z' },
  { type: 'PaymentReleased', jobId: 52, actor: AGENTS.ALPHA,   counterparty: AGENTS.ZETA,    amount: 200,
    txSig: 'Sv6bK5nWqXmN3vBcYeT1sL9uHdEiGj4wPvNe7Zr' },
];

// ── Demo scenario constants ───────────────────────────────────────────────────

export const DEMO_JOB_ID = 99;
export const DEMO_POSTER = '7DtrdZPc3LkP2JNMagV8SkLiKEMq4nURmDoNnV9GfJz8';
export const DEMO_WORKER = 'AQdKsDhNp4RtCBq3XmYwZ6FvTyJoL8sUiGhWxEz5Kb1';

// All tags render identically — no per-category colour
export const TAG_COLORS: Record<string, string> = {};
