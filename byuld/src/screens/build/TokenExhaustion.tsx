import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";

const OPTIONS = [
  {
    id: "wait",
    icon: "◷",
    title: "Wait until tomorrow",
    sub: "Your build is saved. Tokens reset at midnight UTC.",
    action: "Continue tomorrow (free)",
    variant: "ghost" as const,
  },
  {
    id: "subscribe",
    icon: "◈",
    title: "Upgrade to subscription",
    sub: "$20/month · 500 tokens/day · Saved projects",
    action: "Upgrade — $20/mo",
    variant: "primary" as const,
    highlight: true,
  },
  {
    id: "topup",
    icon: "⊕",
    title: "Buy tokens now",
    sub: "50 tokens for $5 · One-time · Added instantly",
    action: "Buy 50 tokens — $5",
    variant: "secondary" as const,
  },
];

export default function TokenExhaustion() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [chosen, setChosen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const diffMs = midnight.getTime() - Date.now();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);

  const handleChoose = async (id: string) => {
    setChosen(id);
    setLoading(true);
    await new Promise(r => setTimeout(r, 1400));
    setLoading(false);
    if (id === "wait") {
      navigate("/build");
    } else {
      // Mock purchase — reset tokens
      dispatch({ type: "ADD_TOKENS", count: id === "subscribe" ? -state.tokensUsed + 500 : 50 });
      navigate("/build");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{
            display: "inline-block", padding: "5px 14px", marginTop: "28px",
            background: "rgba(245,166,35,0.12)", border: `1px solid ${C.warn}33`,
            borderRadius: R.full, fontSize: "11px", color: C.warn, fontFamily: F.body, fontWeight: 600,
          }}>
            Daily limit reached
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "20px", marginBottom: "8px" }}>
            You've used today's tokens.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            Your build is saved. Pick up right where you left off.
          </p>
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginTop: "8px" }}>
            Resets in {h}h {m}m
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {OPTIONS.map(opt => (
            <div key={opt.id} style={{
              padding: "20px 22px",
              background: opt.highlight ? `${C.purple}12` : C.surface,
              border: `1px solid ${opt.highlight ? C.purple : C.border}`,
              borderRadius: R.lg,
              display: "flex", gap: "16px", alignItems: "flex-start",
            }}>
              <span style={{ fontSize: "24px", color: opt.highlight ? C.purple : C.textMute, flexShrink: 0, marginTop: "2px" }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "3px" }}>{opt.title}</div>
                <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5, marginBottom: "12px" }}>{opt.sub}</div>
                <Button
                  variant={opt.variant}
                  size="sm"
                  onClick={() => handleChoose(opt.id)}
                  disabled={loading && chosen !== opt.id}
                >
                  {loading && chosen === opt.id ? "Processing…" : opt.action}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
