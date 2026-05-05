import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import TokenMeter from "../components/ui/TokenMeter";
import { useApp } from "../context/AppContext";

const MOCK_PROJECTS = [
  { name: "Certificate NFT",   type: "ERC-721",          chain: "base",     status: "deployed",    date: "Apr 18, 2025" },
  { name: "Community Token",   type: "ERC-20",           chain: "polygon",  status: "in-progress", date: "Apr 22, 2025" },
  { name: "Event Access Pass", type: "ERC-721",          chain: "sepolia",  status: "deployed",    date: "Apr 24, 2025" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { state } = useApp();

  const firstName = state.email.split("@")[0] || "there";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{ height: "56px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 28px", gap: "20px" }}>
        <Logo size="sm" />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "120px" }}>
            <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
          </div>
          <div style={{
            width: "32px", height: "32px", borderRadius: "50%",
            background: `${C.purple}22`, border: `1px solid ${C.purple}33`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", color: C.purple, fontWeight: 700, cursor: "pointer",
          }}>
            {firstName.charAt(0).toUpperCase()}
          </div>
        </div>
      </nav>

      <div style={{ padding: "40px 28px", maxWidth: "900px" }}>
        {/* Welcome */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "40px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "4px" }}>
              Welcome back, {firstName}.
            </h1>
            <p style={{ fontSize: "14px", color: C.textMute, fontFamily: F.body }}>
              {state.tokensLimit - state.tokensUsed} tokens remaining today
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/goal")}>+ New build</Button>
        </div>

        {/* Token card */}
        <div style={{ padding: "18px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "32px", display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginBottom: "8px" }}>Today's token usage</div>
            <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate("/build/tokens")}>
            Upgrade
          </Button>
        </div>

        {/* Projects */}
        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: C.textSec, fontFamily: F.body }}>Your builds</h2>
          <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{MOCK_PROJECTS.length} projects</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {MOCK_PROJECTS.map((p, i) => (
            <div key={i} style={{
              padding: "16px 20px", background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: R.lg,
              display: "flex", alignItems: "center", gap: "16px",
              cursor: "pointer", transition: "border-color 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple + "55")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              onClick={() => p.status === "in-progress" ? navigate("/build") : undefined}
            >
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
                background: p.status === "deployed" ? `${C.mint}12` : `${C.purple}12`,
                border: `1px solid ${p.status === "deployed" ? C.mint + "33" : C.purple + "33"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px",
              }}>
                {p.status === "deployed" ? "✓" : "✎"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "3px" }}>{p.name}</div>
                <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{p.date} · {p.chain}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Badge variant="purple">{p.type}</Badge>
                <Badge variant={p.status === "deployed" ? "mint" : "muted"}>
                  {p.status === "deployed" ? "Deployed" : "In progress"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
