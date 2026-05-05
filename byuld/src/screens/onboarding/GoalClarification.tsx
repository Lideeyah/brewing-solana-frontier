import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";

const CONTRACT_OPTIONS = [
  { value: "ERC-721",           label: "A unique digital item (NFT)",           sub: "One-of-a-kind certificates, passes, artwork" },
  { value: "ERC-20",            label: "A currency or points system",            sub: "Community tokens, loyalty points, governance" },
  { value: "Payment Contract",  label: "A payment or escrow agreement",          sub: "Hold funds, release on conditions" },
  { value: "DAO",               label: "A voting or governance system",           sub: "Community decisions, proposals, voting" },
  { value: "ERC-1155",          label: "Multiple item types in one contract",     sub: "Collections, editions, mixed assets" },
];

export default function GoalClarification() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [selected, setSelected] = useState("");

  const handleContinue = () => {
    if (!selected) return;
    dispatch({ type: "SET_GOAL", goal: state.goal, contractType: selected });
    navigate("/build");
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Logo size="md" />
          <div style={{
            display: "inline-block", padding: "5px 14px", marginTop: "28px",
            background: `${C.purple}15`, border: `1px solid ${C.purple}33`,
            borderRadius: R.full, fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 600,
          }}>
            One quick question
          </div>
          <div style={{
            marginTop: "20px", padding: "16px 20px",
            background: C.surface2, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.purple}`, borderRadius: R.md, textAlign: "left",
          }}>
            <div style={{ fontSize: "10px", color: C.purple, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>BYULD</div>
            <div style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
              I want to make sure I build exactly what you need. Which of these best describes what you're building?
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
          {CONTRACT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              style={{
                padding: "16px 18px", textAlign: "left", cursor: "pointer",
                background: selected === opt.value ? `${C.purple}12` : C.surface,
                border: `1px solid ${selected === opt.value ? C.purple : C.border}`,
                borderRadius: R.md, display: "flex", flexDirection: "column", gap: "3px",
                transition: "all 0.12s", outline: "none",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: 600, color: selected === opt.value ? C.white : C.textSec, fontFamily: F.body }}>
                {opt.label}
              </span>
              <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{opt.sub}</span>
            </button>
          ))}
        </div>

        <Button fullWidth size="lg" disabled={!selected} onClick={handleContinue}>
          Let's build this
        </Button>
      </div>
    </div>
  );
}
