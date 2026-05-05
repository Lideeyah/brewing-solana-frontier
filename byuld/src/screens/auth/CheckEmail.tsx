import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";

export default function CheckEmail() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [countdown, setCountdown] = useState(60);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleResend = () => {
    setCountdown(60);
    setResent(true);
    setTimeout(() => setResent(false), 3000);
  };

  // Demo: clicking the button simulates magic link click
  const handleMockVerify = () => {
    const mockAddress = "0x3f8A" + Math.random().toString(16).slice(2, 8).toUpperCase() + "…8a2e";
    dispatch({ type: "SET_AUTHENTICATED", walletAddress: mockAddress });
    navigate("/onboarding/persona");
  };

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px", textAlign: "center" }}>
        <div style={{ marginBottom: "32px" }}>
          <Logo size="md" />
        </div>

        {/* Email icon */}
        <div style={{
          width: "72px", height: "72px", borderRadius: "18px",
          background: `${C.purple}18`, border: `1px solid ${C.purple}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 28px", fontSize: "32px",
        }}>
          ✉
        </div>

        <h2 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "12px" }}>
          Check your inbox
        </h2>
        <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, marginBottom: "32px" }}>
          We sent a magic link to{" "}
          <strong style={{ color: C.white }}>{state.email || "your email"}</strong>.{" "}
          Click it to sign in.
        </p>

        {resent && (
          <div style={{
            padding: "10px 16px", borderRadius: "8px",
            background: `${C.mint}12`, border: `1px solid ${C.mint}33`,
            fontSize: "13px", color: C.mint, fontFamily: F.body, marginBottom: "16px",
          }}>
            ✓ New link sent!
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Demo button — simulates clicking the magic link */}
          <Button fullWidth onClick={handleMockVerify} variant="mint">
            ✓ I clicked the link (demo)
          </Button>

          <button
            onClick={handleResend}
            disabled={countdown > 0}
            style={{
              background: "none", border: "none", cursor: countdown > 0 ? "not-allowed" : "pointer",
              color: countdown > 0 ? C.textMute : C.purple, fontFamily: F.body, fontSize: "13px",
              padding: "8px",
            }}
          >
            {countdown > 0 ? `Resend link in ${countdown}s` : "Resend link"}
          </button>

          <button
            onClick={() => navigate("/auth")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.textMute, fontFamily: F.body, fontSize: "12px",
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    </div>
  );
}
