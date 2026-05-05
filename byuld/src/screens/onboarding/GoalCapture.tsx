import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Textarea from "../../components/ui/Textarea";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import type { Chain } from "../../types";
import Spinner from "../../components/ui/Spinner";

const EXAMPLES = [
  "A certificate NFT for my online course",
  "A token for my community",
  "A simple payment contract",
  "An access-pass NFT for my event",
  "A loyalty points token for my app",
];

const CHAINS: { id: Chain; label: string; note?: string }[] = [
  { id: "base",         label: "Base",            note: "Recommended · Low gas, fast" },
  { id: "ethereum",     label: "Ethereum Mainnet", note: "Highest stakes · High gas" },
  { id: "polygon",      label: "Polygon",          note: "Low gas alternative" },
  { id: "sepolia",      label: "Sepolia Testnet",  note: "Free · For learning" },
  { id: "base-sepolia", label: "Base Sepolia",     note: "Free · Base testnet" },
];

function detectContractType(goal: string): string {
  const g = goal.toLowerCase();
  if (g.includes("certificate") || g.includes("nft") || g.includes("access") || g.includes("ticket")) return "ERC-721";
  if (g.includes("token") || g.includes("coin") || g.includes("currency") || g.includes("points")) return "ERC-20";
  if (g.includes("payment") || g.includes("escrow") || g.includes("pay")) return "Payment Contract";
  if (g.includes("dao") || g.includes("vote") || g.includes("governance")) return "DAO";
  if (g.includes("multi") || g.includes("edition")) return "ERC-1155";
  return "";
}

export default function GoalCapture() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [goal, setGoal] = useState("");
  const [chain, setChain] = useState<Chain>("base");
  const [showExamples, setShowExamples] = useState(false);
  const [loading, setLoading] = useState(false);

  const canContinue = goal.trim().length >= 10;

  const handleContinue = async () => {
    if (!canContinue || loading) return;
    setLoading(true);
    const contractType = detectContractType(goal);
    await new Promise(r => setTimeout(r, 1500));
    dispatch({ type: "SET_GOAL", goal: goal.trim(), contractType });
    dispatch({ type: "SET_CHAIN", chain });
    setLoading(false);
    if (!contractType) {
      navigate("/onboarding/clarify");
    } else {
      navigate("/build");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "540px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={["You", "Wallet", "Goal", "Build"]} current={2} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            What do you want to build?
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            Don't worry about technical language. Just tell us what it does.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
          <Textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder={`e.g. "${EXAMPLES[0]}"`}
            maxChars={500}
            style={{ minHeight: "110px" }}
            autoFocus
          />

          {/* Examples */}
          <button
            onClick={() => setShowExamples(!showExamples)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.purple, fontFamily: F.body, fontSize: "12px",
              textAlign: "left", padding: "0",
            }}
          >
            {showExamples ? "Hide" : "Not sure? See example projects ▾"}
          </button>

          {showExamples && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: R.md, overflow: "hidden",
            }}>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setGoal(ex); setShowExamples(false); }}
                  style={{
                    width: "100%", padding: "11px 16px", textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderBottom: i < EXAMPLES.length - 1 ? `1px solid ${C.border}` : "none",
                    color: C.textSec, fontFamily: F.body, fontSize: "13px",
                    cursor: "pointer", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {/* Chain */}
          <div>
            <label style={{ fontSize: "13px", fontWeight: 500, color: C.textSec, fontFamily: F.body, display: "block", marginBottom: "8px" }}>
              Where do you want to deploy?
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {CHAINS.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setChain(ch.id)}
                  style={{
                    padding: "10px 14px", textAlign: "left", cursor: "pointer",
                    background: chain === ch.id ? `${C.purple}12` : C.surface2,
                    border: `1px solid ${chain === ch.id ? C.purple : C.border}`,
                    borderRadius: R.md, display: "flex", alignItems: "center", gap: "12px",
                    transition: "all 0.12s",
                    outline: "none",
                  }}
                >
                  <div style={{
                    width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${chain === ch.id ? C.purple : C.border}`,
                    background: chain === ch.id ? C.purple : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}>
                    {chain === ch.id && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: chain === ch.id ? C.white : C.textSec, fontFamily: F.body }}>{ch.label}</span>
                  {ch.note && <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginLeft: "auto" }}>{ch.note}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button
          fullWidth size="lg"
          disabled={!canContinue || loading}
          onClick={handleContinue}
          style={{ gap: "10px" }}
        >
          {loading ? <><Spinner size={16} color="#fff" /> Byuld is reading your goal…</> : "Start Building"}
        </Button>
      </div>
    </div>
  );
}
