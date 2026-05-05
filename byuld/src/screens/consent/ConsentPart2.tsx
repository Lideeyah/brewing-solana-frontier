import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";

function getDecisions(contractType: string): { decision: string; meaning: string; consequence: string }[] {
  const base = [
    {
      decision: "You are the contract owner",
      meaning: "Only your wallet address can call restricted functions",
      consequence: "If you lose access to your wallet, you lose control of this contract permanently",
    },
    {
      decision: `${contractType} standard`,
      meaning: `This contract follows the ${contractType} specification — it is compatible with all ${contractType} tools and marketplaces`,
      consequence: "Changing the standard after deployment would require a new contract",
    },
  ];

  if (contractType === "ERC-721") {
    base.push({
      decision: "Non-transferable (soulbound)",
      meaning: "Tokens issued by this contract cannot be moved from the recipient's wallet",
      consequence: "This is enforced at the contract level and cannot be changed after deployment",
    });
  }
  if (contractType === "ERC-20") {
    base.push({
      decision: "Fixed total supply",
      meaning: "No more tokens can be minted beyond what is defined in the contract",
      consequence: "The supply is permanent and immutable after deployment",
    });
  }
  return base;
}

export default function ConsentPart2() {
  const navigate = useNavigate();
  const { state } = useApp();
  const decisions = getDecisions(state.contractType);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState(false);

  const allChecked = checked.size === decisions.length;

  const toggle = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
    setHighlight(false);
  };

  const handleDeploy = () => {
    if (!allChecked) { setHighlight(true); return; }
    navigate("/payment");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "28px", marginBottom: "8px" }}>
            <ProgressStep steps={["Summary", "Confirm"]} current={1} />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px", marginBottom: "8px" }}>
            Confirm your decisions.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            These are the most important choices you made. Confirm each one.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {decisions.map((d, i) => {
            const isChecked = checked.has(i);
            const needsAttention = highlight && !isChecked;
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                style={{
                  padding: "18px 20px", textAlign: "left", cursor: "pointer",
                  background: isChecked ? `${C.mint}0A` : C.surface,
                  border: `1px solid ${needsAttention ? C.danger : isChecked ? C.mint + "44" : C.border}`,
                  borderRadius: R.lg, display: "flex", gap: "16px", alignItems: "flex-start",
                  outline: "none", transition: "all 0.15s",
                  animation: needsAttention ? "pulse 1s ease-in-out" : undefined,
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: "20px", height: "20px", borderRadius: "5px", flexShrink: 0, marginTop: "2px",
                  border: `2px solid ${isChecked ? C.mint : needsAttention ? C.danger : C.border}`,
                  background: isChecked ? C.mint : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {isChecked && <span style={{ color: C.bg, fontSize: "11px", fontWeight: 700 }}>✓</span>}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: isChecked ? C.white : C.textSec, fontFamily: F.body, marginBottom: "5px" }}>
                    {d.decision}
                  </div>
                  <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5, marginBottom: "6px" }}>
                    {d.meaning}
                  </div>
                  <div style={{
                    fontSize: "11px", fontFamily: F.body, lineHeight: 1.4,
                    color: C.warn, display: "flex", gap: "6px", alignItems: "flex-start",
                  }}>
                    <span>⚠</span>
                    <span>{d.consequence}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {highlight && !allChecked && (
          <div style={{ fontSize: "12px", color: C.danger, fontFamily: F.body, textAlign: "center", marginBottom: "12px" }}>
            Please confirm all decisions before continuing.
          </div>
        )}

        <Button fullWidth size="lg" variant={allChecked ? "mint" : "ghost"} onClick={handleDeploy}>
          {allChecked ? "All confirmed — Continue to payment →" : "Tick all boxes above to continue"}
        </Button>

        <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textAlign: "center", marginTop: "12px" }}>
          Step 2 of 2 · Deployment is irreversible once confirmed
        </div>
      </div>
    </div>
  );
}
