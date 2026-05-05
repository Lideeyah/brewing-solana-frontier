import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Divider from "../../components/ui/Divider";
import { useApp } from "../../context/AppContext";

type Tab = "signup" | "login";

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default function SignUp() {
  const navigate = useNavigate();
  const { dispatch } = useApp();
  const [tab, setTab]       = useState<Tab>("signup");
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const valid = isValidEmail(email);

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");
    dispatch({ type: "SET_EMAIL", email });
    // Simulate magic link send
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    navigate("/check-email");
  };

  const handleMetaMask = async () => {
    // Mock MetaMask connect — in production, use Privy SDK
    const mockAddress = "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    dispatch({ type: "SET_AUTHENTICATED", walletAddress: mockAddress });
    navigate("/onboarding/persona");
  };

  const showMetaMask = tab === "signup"; // shown for both but prominently on signup

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      {/* Back */}
      <div style={{ position: "absolute", top: "24px", left: "32px" }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontFamily: F.body, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
        >
          ← Back
        </button>
      </div>

      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginTop: "12px" }}>
            {tab === "signup" ? "Create your account — it's free." : "Welcome back."}
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: "0",
          background: C.surface2, borderRadius: R.md, padding: "3px",
          marginBottom: "28px",
        }}>
          {([["signup", "Sign Up"], ["login", "Log In"]] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setError(""); }} style={{
              flex: 1, padding: "8px 16px", fontFamily: F.body, fontSize: "13px", fontWeight: 600,
              background: tab === id ? C.surface : "transparent",
              color: tab === id ? C.white : C.textMute,
              border: tab === id ? `1px solid ${C.border}` : "1px solid transparent",
              borderRadius: "6px", cursor: "pointer", transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            error={error}
            autoFocus
          />

          <Button fullWidth onClick={handleSubmit} disabled={!valid || loading}>
            {loading ? "Sending magic link…" : "Send magic link"}
          </Button>

          {showMetaMask && (
            <>
              <Divider label="or" />
              <button
                onClick={handleMetaMask}
                style={{
                  width: "100%", padding: "10px 20px",
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: R.md,
                  color: C.textSec, fontFamily: F.body, fontSize: "14px", fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21.315 5.1L13.41 11.07l1.47-3.465L21.315 5.1z" fill="#E2761B" />
                  <path d="M2.685 5.1l7.845 6.03-1.395-3.525L2.685 5.1z" fill="#E4761B" />
                </svg>
                Connect MetaMask
              </button>
            </>
          )}

          <p style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textAlign: "center", lineHeight: 1.5 }}>
            By continuing you agree to Byuld's{" "}
            <span style={{ color: C.purple, cursor: "pointer" }}>Terms of Service</span>
            {" "}and{" "}
            <span style={{ color: C.purple, cursor: "pointer" }}>Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
