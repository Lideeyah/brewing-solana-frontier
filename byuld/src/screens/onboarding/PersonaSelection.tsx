import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import type { Persona } from "../../types";
import ProgressStep from "../../components/ui/ProgressStep";

const OPTIONS: { persona: Persona; icon: string; title: string; desc: string }[] = [
  {
    persona: "founder",
    icon: "◈",
    title: "I have a product idea but I'm not a developer",
    desc: "No coding experience needed. Byuld teaches you as you build — plain English, no jargon.",
  },
  {
    persona: "developer",
    icon: "⌨",
    title: "I can code but I'm new to Web3",
    desc: "Map what you already know to blockchain patterns. Skip the basics, focus on what's different.",
  },
];

export default function PersonaSelection() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [selected, setSelected] = useState<Persona>(null);
  const [hov, setHov] = useState<Persona>(null);

  const handleContinue = () => {
    if (!selected) return;
    dispatch({ type: "SET_PERSONA", persona: selected });
    navigate("/onboarding/wallet");
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={["You", "Wallet", "Goal", "Build"]} current={0} />
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px", marginTop: "28px" }}>
            Welcome to Byuld. Let's build something.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            How would you describe yourself?
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
          {OPTIONS.map(opt => {
            const isSelected = selected === opt.persona;
            const isHov = hov === opt.persona;
            return (
              <button
                key={opt.persona}
                onClick={() => setSelected(opt.persona)}
                onMouseEnter={() => setHov(opt.persona)}
                onMouseLeave={() => setHov(null)}
                style={{
                  padding: "24px",
                  background: isSelected ? `${C.purple}12` : isHov ? `${C.surface}` : C.surface,
                  border: `1px solid ${isSelected ? C.purple : isHov ? C.border : C.border}`,
                  borderRadius: R.lg,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  boxShadow: isSelected ? `0 0 0 1px ${C.purple}44` : "none",
                  display: "flex",
                  gap: "20px",
                  alignItems: "flex-start",
                  outline: "none",
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: R.lg, flexShrink: 0,
                  background: isSelected ? `${C.purple}25` : C.surface2,
                  border: `1px solid ${isSelected ? C.purple + "55" : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "22px", color: isSelected ? C.purple : C.textMute,
                  transition: "all 0.15s",
                }}>
                  {opt.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "15px", fontWeight: 600, fontFamily: F.body,
                    color: isSelected ? C.white : C.textSec,
                    marginBottom: "6px", transition: "color 0.15s",
                  }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.55 }}>
                    {opt.desc}
                  </div>
                </div>
                <div style={{
                  width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "2px",
                  border: `2px solid ${isSelected ? C.purple : C.border}`,
                  background: isSelected ? C.purple : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {isSelected && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                </div>
              </button>
            );
          })}
        </div>

        <Button fullWidth size="lg" disabled={!selected} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
