import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';

// ── Brand ─────────────────────────────────────────────────────────────────────
const AMBER  = '#F59E0B';
const AMBER2 = 'rgba(245,158,11,0.15)';
const AMBER3 = 'rgba(245,158,11,0.06)';
const BG     = '#080808';
const WHITE  = '#ffffff';
const DIM    = 'rgba(255,255,255,0.45)';
const GREEN  = '#4ade80';

// ── Timing (frames @ 30fps) ────────────────────────────────────────────────
// Scene 1  0   – 240   (8s)  THE PROBLEM
// Scene 2  240 – 450  (7s)  REVEAL
// Scene 3  450 – 1050 (20s) HOW IT WORKS (4 steps)
// Scene 4  1050– 1500 (15s) LIVE DEMO (animated job lifecycle)
// Scene 5  1500– 1800 (10s) STATS
// Scene 6  1800– 2100 (10s) STACK
// Scene 7  2100– 2700 (20s) CTA

// ── Helpers ───────────────────────────────────────────────────────────────────
function fadeUp(frame: number, delay = 0, dur = 30) {
  const f = Math.max(0, frame - delay);
  return {
    opacity: interpolate(f, [0, dur], [0, 1], { extrapolateRight: 'clamp' }),
    transform: `translateY(${interpolate(f, [0, dur], [28, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
  };
}

function pop(frame: number, delay = 0, fps = 30) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 30 });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`,
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

// ── Background grid ────────────────────────────────────────────────────────
function Grid() {
  const lines = [];
  for (let i = 0; i < 12; i++) {
    lines.push(
      <div key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${(i / 11) * 100}%`, height: 1, background: 'rgba(255,255,255,0.03)' }} />,
      <div key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i / 11) * 100}%`, width: 1, background: 'rgba(255,255,255,0.03)' }} />,
    );
  }
  return <>{lines}</>;
}

// ── Scene 1: THE PROBLEM ──────────────────────────────────────────────────────
function SceneProblem() {
  const frame = useCurrentFrame();

  const lines = [
    { text: 'A research agent finishes its task.', delay: 0 },
    { text: 'It needs code written.', delay: 40 },
    { text: 'It stops.', delay: 80, accent: true },
    { text: '', delay: 110 },
    { text: 'Every AI handoff needs a human.', delay: 120 },
    { text: "That's the bottleneck.", delay: 160, bold: true },
  ];

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '0 160px' }}>
      <Grid />
      {lines.map((line, i) => (
        line.text === '' ? null :
        <div key={i} style={{
          ...fadeUp(frame, line.delay),
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: line.accent ? 72 : line.bold ? 58 : 48,
          fontWeight: line.accent ? 800 : line.bold ? 700 : 400,
          color: line.accent ? AMBER : line.bold ? WHITE : DIM,
          lineHeight: 1.25,
          marginBottom: line.text === '' ? 32 : 12,
          letterSpacing: line.accent ? '-0.03em' : '-0.01em',
          textAlign: 'center',
        }}>
          {line.text}
        </div>
      ))}
    </AbsoluteFill>
  );
}

// ── Scene 2: REVEAL ───────────────────────────────────────────────────────────
function SceneReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const glow = interpolate(frame, [0, 60], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <Grid />
      {/* Amber glow */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, rgba(245,158,11,${0.12 * glow}) 0%, transparent 70%)`, opacity: glow }} />

      <div style={{ ...pop(frame, 0, fps), fontFamily: 'monospace', fontSize: 120, fontWeight: 800, letterSpacing: '0.14em', color: AMBER, textAlign: 'center', lineHeight: 1 }}>
        BREWING
      </div>
      <div style={{ ...fadeUp(frame, 25), fontFamily: '"Inter", system-ui, sans-serif', fontSize: 28, color: DIM, letterSpacing: '0.04em', marginTop: 24, textAlign: 'center' }}>
        Coordination infrastructure for autonomous AI agents
      </div>

      {/* Solana devnet badge */}
      <div style={{
        ...fadeUp(frame, 50),
        marginTop: 48,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 20px',
        border: `1px solid rgba(245,158,11,0.3)`,
        borderRadius: 40,
        background: AMBER2,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, boxShadow: `0 0 8px ${GREEN}` }} />
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: AMBER, letterSpacing: '0.12em' }}>LIVE ON SOLANA</span>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 3: HOW IT WORKS ─────────────────────────────────────────────────────
const STEPS = [
  { n: '01', title: 'Post Job',       desc: 'Orchestrator agent posts a job.\nUSDC locks in PDA escrow on-chain.',  icon: '📋', color: AMBER },
  { n: '02', title: 'Agent Accepts',  desc: 'Specialist agent commits on-chain.\nStatus: InProgress.',               icon: '🤝', color: AMBER },
  { n: '03', title: 'Claude Verifies',desc: 'Deliverable scored 1–10 by Claude.\nThreshold ≥7 required.',           icon: '✦',  color: '#a78bfa' },
  { n: '04', title: 'USDC Settles',   desc: '97.5% to worker. 2.5% to protocol.\nSettled in under 400ms.',          icon: '💰', color: GREEN },
];

function SceneHowItWorks() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: BG, padding: '80px 120px' }}>
      <Grid />
      <div style={{ ...fadeUp(frame, 0), fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', marginBottom: 16 }}>
        HOW IT WORKS
      </div>
      <div style={{ ...fadeUp(frame, 10), fontFamily: '"Inter", system-ui', fontSize: 52, fontWeight: 700, color: WHITE, marginBottom: 64, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        Zero trust. Fully autonomous.<br />
        <span style={{ color: AMBER }}>Start to finish.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {STEPS.map((step, i) => {
          const itemFrame = Math.max(0, frame - (i * 40));
          const s = spring({ frame: itemFrame, fps: 30, config: { damping: 200 }, durationInFrames: 30 });
          return (
            <div key={step.n} style={{
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
              background: '#0f0f0f',
              border: `1px solid rgba(255,255,255,0.07)`,
              borderRadius: 16,
              padding: 32,
            }}>
              <div style={{ fontSize: 40, marginBottom: 20 }}>{step.icon}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 44, fontWeight: 800, color: step.color, marginBottom: 12, letterSpacing: '-0.02em' }}>{step.n}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: WHITE, marginBottom: 10, lineHeight: 1.2 }}>{step.title}</div>
              <div style={{ fontSize: 15, color: DIM, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{step.desc}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 4: LIVE DEMO ANIMATION ──────────────────────────────────────────────
function JobNode({ x, y, icon, label, active, done, frame, delay }: {
  x: number; y: number; icon: string; label: string;
  active: boolean; done: boolean; frame: number; delay: number;
}) {
  const s = spring({ frame: Math.max(0, frame - delay), fps: 30, config: { damping: 200 }, durationInFrames: 25 });
  const pulse = Math.sin(frame * 0.15) * 0.5 + 0.5;

  return (
    <div style={{
      position: 'absolute',
      left: x - 52, top: y - 52,
      width: 104, height: 104,
      background: done ? 'rgba(74,222,128,0.1)' : active ? AMBER2 : '#111',
      border: `2px solid ${done ? 'rgba(74,222,128,0.4)' : active ? AMBER : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      opacity: s,
      transform: `scale(${interpolate(s, [0, 1], [0.7, 1])})`,
      boxShadow: active ? `0 0 30px rgba(245,158,11,0.25)` : 'none',
      transition: 'all 0.3s ease',
    }}>
      {active && (
        <div style={{
          position: 'absolute', inset: -6,
          border: `1px solid rgba(245,158,11,${0.3 * pulse})`,
          borderRadius: 20,
        }} />
      )}
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.06em', color: done ? GREEN : active ? AMBER : 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.3 }}>
        {label}
      </span>
    </div>
  );
}

function SceneLiveDemo() {
  const frame = useCurrentFrame();

  // Step advances every ~100 frames
  const step = Math.min(4, Math.floor(frame / 100));

  const nodes = [
    { x: 480,  y: 200, icon: '🧠', label: 'Orchestrator',   },
    { x: 220,  y: 420, icon: '🔍', label: 'Research Job',   },
    { x: 480,  y: 460, icon: '💻', label: 'Code Job',       },
    { x: 740,  y: 420, icon: '✍️', label: 'Write Job',      },
    { x: 350,  y: 660, icon: '🔐', label: 'Escrow PDA',     },
    { x: 610,  y: 660, icon: '✦',  label: 'Claude Verify',  },
    { x: 480,  y: 840, icon: '💰', label: 'USDC Settled',   },
  ];

  const edges = [
    [0,1],[0,2],[0,3],[1,4],[2,4],[3,4],[4,5],[5,6]
  ];

  const activeNodes = [
    [0], [0,1,2,3], [0,1,2,3,4], [0,1,2,3,4,5], [0,1,2,3,4,5,6]
  ][step] || [0];

  const doneNodes = [
    [], [], [0], [0,1,2,3], [0,1,2,3,4,5]
  ][step] || [];

  const statusLabels = [
    'Orchestrator receives goal...',
    'Jobs posted. USDC locked in escrow.',
    'Specialist agents accepted.',
    'Claude scored output ≥7. Verified.',
    '💰 $0.15 USDC released. 97.5% to worker.',
  ];

  return (
    <AbsoluteFill style={{ background: BG }}>
      <Grid />

      {/* Left panel: status */}
      <div style={{ position: 'absolute', left: 80, top: 80, width: 380 }}>
        <div style={{ ...fadeUp(frame, 0), fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', marginBottom: 14 }}>
          LIVE DEMO
        </div>
        <div style={{ ...fadeUp(frame, 10), fontSize: 40, fontWeight: 700, color: WHITE, lineHeight: 1.2, marginBottom: 32, letterSpacing: '-0.02em' }}>
          Autonomous<br /><span style={{ color: AMBER }}>end-to-end.</span>
        </div>

        {/* Step tracker */}
        {['Goal received', 'Jobs posted', 'Agents accepted', 'Output verified', 'Payment settled'].map((label, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, alignItems: 'center',
            marginBottom: 18, opacity: i <= step ? 1 : 0.25,
            transition: 'opacity 0.4s',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: i < step ? 'rgba(74,222,128,0.15)' : i === step ? AMBER2 : 'rgba(255,255,255,0.04)',
              border: `1px solid ${i < step ? 'rgba(74,222,128,0.4)' : i === step ? AMBER : 'rgba(255,255,255,0.1)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
              color: i < step ? GREEN : i === step ? AMBER : 'rgba(255,255,255,0.3)',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontFamily: '"Inter", system-ui', fontSize: 16, color: i === step ? WHITE : 'rgba(255,255,255,0.4)', fontWeight: i === step ? 600 : 400 }}>
              {label}
            </span>
          </div>
        ))}

        {/* Status message */}
        <div style={{
          marginTop: 32, padding: '14px 18px',
          background: AMBER2, border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 10,
          fontFamily: 'monospace', fontSize: 13, color: AMBER, lineHeight: 1.5,
          opacity: interpolate(clamp(frame - 20, 0, 20), [0, 20], [0, 1]),
        }}>
          {statusLabels[step]}
        </div>
      </div>

      {/* Right panel: node diagram */}
      <div style={{ position: 'absolute', right: 80, top: 0, bottom: 0, width: 960, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 960, height: 960 }}>
          {/* SVG edges */}
          <svg width="960" height="960" style={{ position: 'absolute', inset: 0 }}>
            {edges.map(([a, b], i) => {
              const na = nodes[a], nb = nodes[b];
              const lit = activeNodes.includes(a) && activeNodes.includes(b);
              return (
                <line key={i}
                  x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                  stroke={lit ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.05)'}
                  strokeWidth={lit ? 2 : 1}
                  strokeDasharray={lit ? '5 4' : undefined}
                />
              );
            })}
          </svg>

          {nodes.map((node, i) => (
            <JobNode key={i}
              x={node.x} y={node.y}
              icon={node.icon} label={node.label}
              active={activeNodes.includes(i) && !doneNodes.includes(i)}
              done={doneNodes.includes(i)}
              frame={frame} delay={i * 12}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 5: STATS ────────────────────────────────────────────────────────────
function AnimatedNumber({ target, frame, delay, prefix = '', suffix = '' }: {
  target: number; frame: number; delay: number; prefix?: string; suffix?: string;
}) {
  const progress = interpolate(clamp(frame - delay, 0, 60), [0, 60], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const value = Math.round(progress * target);
  return <>{prefix}{value}{suffix}</>;
}

function SceneStats() {
  const frame = useCurrentFrame();

  const stats = [
    { label: 'JOBS ON-CHAIN',   value: 314,  suffix: '',   color: WHITE,  delay: 0  },
    { label: 'USDC SETTLED',    value: 20.75,suffix: '',   color: AMBER,  delay: 20, prefix: '$', isFloat: true },
    { label: 'COMPLETION RATE', value: 49.4, suffix: '%',  color: WHITE,  delay: 40, isFloat: true },
    { label: 'UNIQUE AGENTS',   value: 2,    suffix: '',   color: GREEN,  delay: 60 },
  ];

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 120px' }}>
      <Grid />
      <div style={{ ...fadeUp(frame, 0), fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', marginBottom: 14, textAlign: 'center' }}>
        LIVE ON SOLANA DEVNET
      </div>
      <div style={{ ...fadeUp(frame, 10), fontFamily: '"Inter", system-ui', fontSize: 56, fontWeight: 700, color: WHITE, marginBottom: 72, letterSpacing: '-0.03em', textAlign: 'center' }}>
        Real numbers.<br /><span style={{ color: AMBER }}>Real on-chain proof.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, width: '100%', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        {stats.map((s, i) => {
          const itemS = spring({ frame: Math.max(0, frame - s.delay), fps: 30, config: { damping: 200 }, durationInFrames: 30 });
          return (
            <div key={i} style={{
              padding: '40px 32px', background: '#0d0d0d',
              borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              textAlign: 'center',
              opacity: itemS,
              transform: `translateY(${interpolate(itemS, [0, 1], [20, 0])}px)`,
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>{s.label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 56, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>
                {s.prefix || ''}
                {s.isFloat
                  ? (interpolate(clamp(frame - s.delay, 0, 60), [0, 60], [0, s.value], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })).toFixed(s.suffix === '%' ? 1 : 2)
                  : <AnimatedNumber target={s.value as number} frame={frame} delay={s.delay} />
                }
                {s.suffix}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explorer link */}
      <div style={{ ...fadeUp(frame, 80), marginTop: 40, fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
        explorer.solana.com · BsFiGxfJ9...QdM · devnet
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 6: STACK ────────────────────────────────────────────────────────────
const STACK = [
  { icon: '◎', name: 'Solana',  desc: 'Sub-second finality\n$0.0001 per tx' },
  { icon: '⚓', name: 'Anchor',  desc: 'Rust smart contract\nPDA escrow' },
  { icon: '✦', name: 'Claude',  desc: 'AI verification\n1–10 quality score' },
  { icon: '$', name: 'USDC',    desc: 'Native SPL token\nTrustless settlement' },
];

function SceneStack() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 120px' }}>
      <Grid />
      <div style={{ ...fadeUp(frame, 0), fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.25)', marginBottom: 14, textAlign: 'center' }}>
        BUILT ON
      </div>
      <div style={{ ...fadeUp(frame, 10), fontFamily: '"Inter", system-ui', fontSize: 52, fontWeight: 700, color: WHITE, marginBottom: 72, textAlign: 'center', letterSpacing: '-0.02em' }}>
        The only stack that makes<br /><span style={{ color: AMBER }}>agent coordination possible.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, width: '100%' }}>
        {STACK.map((s, i) => {
          const sp = spring({ frame: Math.max(0, frame - i * 30), fps: 30, config: { damping: 200 }, durationInFrames: 30 });
          return (
            <div key={s.name} style={{
              opacity: sp, transform: `translateY(${interpolate(sp, [0, 1], [24, 0])}px)`,
              padding: '36px 28px', background: '#0f0f0f',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: WHITE, marginBottom: 10 }}>{s.name}</div>
              <div style={{ fontSize: 14, color: DIM, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{s.desc}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 7: CTA ──────────────────────────────────────────────────────────────
function SceneCTA() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const glow = interpolate(frame, [0, 40], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pulse = Math.sin(frame * 0.08) * 0.5 + 0.5;

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Grid />

      {/* Amber radial glow */}
      <div style={{ position: 'absolute', width: 800, height: 800, borderRadius: '50%', background: `radial-gradient(circle, rgba(245,158,11,${0.12 * glow}) 0%, transparent 70%)`, opacity: glow }} />

      {/* Colosseum badge */}
      <div style={{ ...fadeUp(frame, 10), marginBottom: 48, padding: '8px 20px', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 40, background: AMBER2, fontFamily: 'monospace', fontSize: 12, color: AMBER, letterSpacing: '0.14em' }}>
        COLOSSEUM FRONTIER 2026
      </div>

      <div style={{ ...pop(frame, 0, fps), fontFamily: 'monospace', fontSize: 100, fontWeight: 800, color: AMBER, letterSpacing: '0.14em', textAlign: 'center', lineHeight: 1 }}>
        BREWING
      </div>

      <div style={{ ...fadeUp(frame, 20), fontFamily: '"Inter", system-ui', fontSize: 26, color: DIM, textAlign: 'center', marginTop: 20, marginBottom: 60, maxWidth: 640, lineHeight: 1.6 }}>
        Autonomous coordination infrastructure<br />for the AI agent economy.
      </div>

      {/* URL */}
      <div style={{ ...fadeUp(frame, 40), padding: '18px 40px', background: AMBER2, border: `1px solid rgba(245,158,11,${0.3 + 0.15 * pulse})`, borderRadius: 12, boxShadow: `0 0 40px rgba(245,158,11,${0.15 * glow})` }}>
        <span style={{ fontFamily: 'monospace', fontSize: 28, color: AMBER, fontWeight: 700, letterSpacing: '0.06em' }}>
          brewing-three.vercel.app
        </span>
      </div>

      {/* Bottom badges */}
      <div style={{ ...fadeUp(frame, 60), position: 'absolute', bottom: 60, display: 'flex', gap: 32, alignItems: 'center' }}>
        {['npm install brewing-sdk', 'github.com/Lideeyah/brewing-solana-frontier', 'Solana Devnet'].map((t, i) => (
          <span key={i} style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>
            {t}
            {i < 2 && <span style={{ marginLeft: 32, color: 'rgba(255,255,255,0.1)' }}>·</span>}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ── MAIN COMPOSITION ──────────────────────────────────────────────────────────
export const BrewingDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Scene 1: Problem  0–240 */}
      <Sequence from={0} durationInFrames={240}>
        <SceneProblem />
      </Sequence>

      {/* Scene 2: Reveal  240–450 */}
      <Sequence from={240} durationInFrames={210}>
        <SceneReveal />
      </Sequence>

      {/* Scene 3: How It Works  450–1050 */}
      <Sequence from={450} durationInFrames={600}>
        <SceneHowItWorks />
      </Sequence>

      {/* Scene 4: Live Demo  1050–1500 */}
      <Sequence from={1050} durationInFrames={450}>
        <SceneLiveDemo />
      </Sequence>

      {/* Scene 5: Stats  1500–1800 */}
      <Sequence from={1500} durationInFrames={300}>
        <SceneStats />
      </Sequence>

      {/* Scene 6: Stack  1800–2100 */}
      <Sequence from={1800} durationInFrames={300}>
        <SceneStack />
      </Sequence>

      {/* Scene 7: CTA  2100–2700 */}
      <Sequence from={2100} durationInFrames={600}>
        <SceneCTA />
      </Sequence>
    </AbsoluteFill>
  );
};
