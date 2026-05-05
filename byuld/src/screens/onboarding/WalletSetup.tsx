import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";

const FACTS = [
  { icon: "◉", text: "Your wallet address is public — it's like a username on the blockchain." },
  { icon: "◈", text: "You'll need a small amount of ETH to deploy. Byuld walks you through getting it when the time comes." },
  { icon: "⬡", text: "Byuld keeps your wallet secure. You can export it later if you want full control." },
];

export default function WalletSetup() {
  const navigate = useNavigate();
  const { state } = useApp();
  const [expanded, setExpanded] = useState(false);

  const isFounder = state.persona === "founder";
  const addr = state.walletAddress || "0x3f8A…8a2e";
  const short = addr.length > 14 ? addr.slice(0, 6) + "…" + addr.slice(-4) : addr;

  const handleContinue = () => navigate("/onboarding/goal");

  if (!isFounder) {
    // Developer flow — MetaMask already connected
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "40px 20px",
      }}>
        <div style={{ width: "100%", maxWidth: "480px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <Logo size="md" />
            <div style={{ marginTop: "32px", marginBottom: "12px" }}>
              <ProgressStep steps={["You", "Wallet", "Goal", "Build"]} current={1} />
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
              Wallet connected.
            </h1>
          </div>

          <div style={{
            padding: "20px 24px", background: C.surface, border: `1px solid ${C.mint}33`,
            borderLeft: `3px solid ${C.mint}`, borderRadius: R.lg, marginBottom: "24px",
          }}>
            <div style={{ fontSize: "11px", color: C.mint, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>Connected Wallet</div>
            <div style={{ fontFamily: F.mono, fontSize: "14px", color: C.textSec }}>{short}</div>
          </div>

          <Button fullWidth size="lg" onClick={handleContinue}>Got it, let's build</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={["You", "Wallet", "Goal", "Build"]} current={1} />
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "6px 14px", marginTop: "28px",
            background: `${C.mint}12`, border: `1px solid ${C.mint}33`,
            borderRadius: R.full, fontSize: "12px", color: C.mint, fontFamily: F.body, fontWeight: 600,
          }}>
            <span style={{ fontSize: "14px" }}>✓</span> Wallet ready
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "20px", marginBottom: "8px" }}>
            Your Web3 wallet is ready.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65, maxWidth: "360px", margin: "0 auto" }}>
            A wallet is like a digital identity for blockchain. It's how you sign and deploy what you build. Yours is already set up — no seed phrases or downloads needed.
          </p>
        </div>

        {/* Address card */}
        <div style={{
          padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: R.lg, marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: R.lg, flexShrink: 0,
            background: `${C.purple}20`, border: `1px solid ${C.purple}33`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px", color: C.purple,
          }}>◉</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "3px" }}>Your wallet address</div>
            <div style={{ fontFamily: F.mono, fontSize: "13px", color: C.textSec }}>{short}</div>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(addr)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.textMute, fontSize: "12px", fontFamily: F.body, padding: "4px 8px" }}
          >
            Copy
          </button>
        </div>

        {/* Expandable */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%", padding: "12px 16px",
            background: expanded ? C.surface : "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: R.md,
            color: C.textSec, fontFamily: F.body, fontSize: "13px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: expanded ? "0" : "20px",
            borderBottomLeftRadius: expanded ? "0" : R.md,
            borderBottomRightRadius: expanded ? "0" : R.md,
            transition: "all 0.15s",
          }}
        >
          What do I need to know?
          <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: "12px" }}>▾</span>
        </button>

        {expanded && (
          <div style={{
            border: `1px solid ${C.border}`, borderTop: "none",
            borderBottomLeftRadius: R.md, borderBottomRightRadius: R.md,
            overflow: "hidden", marginBottom: "20px",
          }}>
            {FACTS.map((f, i) => (
              <div key={i} style={{
                padding: "14px 16px", display: "flex", gap: "12px", alignItems: "flex-start",
                borderBottom: i < FACTS.length - 1 ? `1px solid ${C.border}` : "none",
                background: C.surface,
              }}>
                <span style={{ color: C.purple, flexShrink: 0, fontSize: "16px" }}>{f.icon}</span>
                <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55 }}>{f.text}</span>
              </div>
            ))}
          </div>
        )}

        <Button fullWidth size="lg" onClick={handleContinue}>Got it, let's build</Button>
      </div>
    </div>
  );
}
