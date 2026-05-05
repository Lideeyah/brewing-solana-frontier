import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { useApp } from "../context/AppContext";

const CHAIN_EXPLORER: Record<string, string> = {
  base:         "https://basescan.org/address/",
  ethereum:     "https://etherscan.io/address/",
  polygon:      "https://polygonscan.com/address/",
  sepolia:      "https://sepolia.etherscan.io/address/",
  "base-sepolia":"https://sepolia.basescan.org/address/",
};

export default function Success() {
  const navigate = useNavigate();
  const { state } = useApp();
  const [copied, setCopied] = useState(false);

  const explorerUrl = CHAIN_EXPLORER[state.chain] + state.contractAddress;
  const date = new Date(state.deployedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const copy = () => {
    navigator.clipboard?.writeText(state.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "540px" }} className="fade-in">
        {/* Confetti bar */}
        <div style={{
          height: "4px", borderRadius: "2px", marginBottom: "48px",
          background: `linear-gradient(90deg, ${C.purple}, ${C.mint}, ${C.purple})`,
        }} />

        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="lg" />
          <div style={{
            display: "inline-block", padding: "6px 18px", marginTop: "24px",
            background: `${C.mint}15`, border: `1px solid ${C.mint}44`,
            borderRadius: R.full, fontSize: "12px", color: C.mint, fontFamily: F.body, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            ✓ Contract deployed
          </div>
          <h1 style={{
            fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 800, fontFamily: F.display,
            color: C.white, letterSpacing: "-0.02em", lineHeight: 1.05, marginTop: "20px",
          }}>
            You did it.
          </h1>
          <p style={{ fontSize: "15px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65, marginTop: "12px" }}>
            Your smart contract is live on{" "}
            <strong style={{ color: C.white }}>{state.chain.charAt(0).toUpperCase() + state.chain.slice(1)}</strong>.
          </p>
        </div>

        {/* Contract address */}
        <div style={{
          padding: "20px 22px", background: C.surface,
          border: `1px solid ${C.mint}44`, borderLeft: `3px solid ${C.mint}`,
          borderRadius: R.lg, marginBottom: "16px",
        }}>
          <div style={{ fontSize: "11px", color: C.mint, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
            Contract address
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <code style={{ fontFamily: F.mono, fontSize: "13px", color: C.textSec, flex: 1, wordBreak: "break-all" }}>
              {state.contractAddress}
            </code>
            <button
              onClick={copy}
              style={{
                flexShrink: 0, padding: "5px 12px", background: "none",
                border: `1px solid ${copied ? C.mint : C.border}`,
                borderRadius: R.md, color: copied ? C.mint : C.textMute,
                fontFamily: F.body, fontSize: "12px", cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Summary card */}
        <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
            <Badge variant="purple">{state.contractType}</Badge>
            <Badge variant="mint">Deployed</Badge>
            <Badge variant="muted">{state.chain}</Badge>
          </div>
          {[
            ["Built",  state.goal.slice(0, 60) + (state.goal.length > 60 ? "…" : "")],
            ["Date",   date],
            ["Chain",  state.chain.charAt(0).toUpperCase() + state.chain.slice(1)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{k}</span>
              <span style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 500, maxWidth: "300px", textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            <Button fullWidth variant="secondary">
              View on block explorer ↗
            </Button>
          </a>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <Button variant="ghost" onClick={() => navigate("/onboarding/goal")}>
              Build something else
            </Button>
            <Button variant="ghost" onClick={() => {
              const text = `I just deployed my first smart contract on ${state.chain} with @byuld_xyz 🚀\n\nContract: ${state.contractAddress.slice(0, 10)}…`;
              navigator.clipboard?.writeText(text);
            }}>
              Copy share link
            </Button>
          </div>
        </div>

        {/* Upgrade nudge for users */}
        <div style={{
          marginTop: "28px", padding: "16px 20px",
          background: `${C.purple}0A`, border: `1px solid ${C.purple}22`,
          borderRadius: R.lg, textAlign: "center",
        }}>
          <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, marginBottom: "10px", lineHeight: 1.5 }}>
            Save this project and all future builds. 500 tokens/day. Advanced contracts.
          </div>
          <Button size="sm" onClick={() => navigate("/payment")}>
            Upgrade to subscription — $20/mo
          </Button>
        </div>
      </div>
    </div>
  );
}
