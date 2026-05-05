import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import SecurityAlert from "../../components/ui/SecurityAlert";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";
import type { SecurityIssue } from "../../types";
import Logo from "../../components/layout/Logo";

type ReviewPhase = "scanning-slither" | "scanning-ai" | "done";

const MOCK_FINAL_ISSUES: SecurityIssue[] = [
  {
    id: "f-1",
    level: "warning",
    name: "Integer overflow possible in counter",
    explanation: "Your token counter uses uint256 which can't realistically overflow, but best practice is to use OpenZeppelin's Counters library for clarity.",
    fix: "import '@openzeppelin/contracts/utils/Counters.sol'; using Counters for Counters.Counter;",
    acknowledged: false,
  },
];

export default function FinalReview() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<ReviewPhase>("scanning-slither");
  const [issues, setIssues] = useState<SecurityIssue[]>([]);

  useEffect(() => {
    const run = async () => {
      await sleep(2000);
      setPhase("scanning-ai");
      await sleep(2000);
      setPhase("done");
      setIssues(MOCK_FINAL_ISSUES);
      dispatch({ type: "SET_SECURITY_ISSUES", issues: MOCK_FINAL_ISSUES });
    };
    run();
  }, []);

  const criticals = issues.filter(i => i.level === "critical");
  const warnings  = issues.filter(i => i.level === "warning");
  const allAcked  = warnings.every(i => i.acknowledged) && criticals.length === 0;
  const [localAck, setLocalAck] = useState<Set<string>>(new Set());

  const ack = (id: string) => {
    setLocalAck(prev => new Set([...prev, id]));
    dispatch({ type: "ACKNOWLEDGE_ISSUE", id });
  };

  const allResolved = phase === "done" && criticals.length === 0 && warnings.every(i => localAck.has(i.id));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Top */}
      <div style={{ padding: "16px 32px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "16px" }}>
        <Logo size="sm" />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>Final Security Review</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", maxWidth: "640px", margin: "0 auto", width: "100%" }}>
        {/* Scanning states */}
        {phase !== "done" && (
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.purple}18`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "28px" }}>
                🔒
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>
                Your contract is written. Well done.
              </h2>
              <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>Running final checks now.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "360px", margin: "0 auto" }}>
              {[
                { label: "Running Slither security scan…", active: phase === "scanning-slither", done: phase !== "scanning-slither" },
                { label: "Running AI contextual review…",  active: phase === "scanning-ai",     done: false },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
                  {step.done
                    ? <span style={{ color: C.mint, fontSize: "14px" }}>✓</span>
                    : step.active
                    ? <Spinner size={14} />
                    : <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: `2px solid ${C.border}` }} />
                  }
                  <span style={{ fontSize: "13px", color: step.active ? C.white : step.done ? C.mint : C.textMute, fontFamily: F.body }}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {phase === "done" && (
          <div style={{ width: "100%" }} className="fade-in">
            {/* Summary */}
            <div style={{
              padding: "20px 24px", marginBottom: "24px",
              background: criticals.length > 0 ? "rgba(255,90,90,0.08)" : warnings.length > 0 ? "rgba(245,166,35,0.08)" : "rgba(0,212,170,0.08)",
              border: `1px solid ${criticals.length > 0 ? C.danger : warnings.length > 0 ? C.warn : C.mint}33`,
              borderLeft: `3px solid ${criticals.length > 0 ? C.danger : warnings.length > 0 ? C.warn : C.mint}`,
              borderRadius: R.lg,
              display: "flex", alignItems: "center", gap: "16px",
            }}>
              <span style={{ fontSize: "28px" }}>{criticals.length > 0 ? "🔴" : warnings.length > 0 ? "🟡" : "🟢"}</span>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: C.white, fontFamily: F.body, marginBottom: "3px" }}>
                  {criticals.length > 0
                    ? `${criticals.length} critical issue${criticals.length > 1 ? "s" : ""} found — must fix`
                    : warnings.length > 0
                    ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""} — review and acknowledge`
                    : "No issues found. Contract is clean."}
                </div>
                <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
                  Slither + AI review · {issues.length} findings
                </div>
              </div>
            </div>

            {/* Issues */}
            {issues.map(issue => (
              <div key={issue.id} style={{ marginBottom: "10px" }}>
                <SecurityAlert
                  level={issue.level === "critical" ? "danger" : issue.level === "warning" ? "warn" : "info"}
                  title={issue.name}
                  body={
                    <div>
                      <div style={{ marginBottom: "8px" }}>{issue.explanation}</div>
                      <div style={{ fontFamily: F.mono, fontSize: "11px", color: C.mint, padding: "6px 10px", background: `${C.mint}0A`, borderRadius: "4px" }}>
                        Fix: {issue.fix}
                      </div>
                      {!localAck.has(issue.id) && issue.level !== "critical" && (
                        <button
                          onClick={() => ack(issue.id)}
                          style={{
                            marginTop: "10px", padding: "5px 12px",
                            background: "none", border: `1px solid ${C.warn}44`,
                            borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer",
                          }}
                        >
                          I understand this risk
                        </button>
                      )}
                      {localAck.has(issue.id) && (
                        <div style={{ marginTop: "8px", fontSize: "11px", color: C.mint }}>✓ Acknowledged</div>
                      )}
                    </div>
                  }
                />
              </div>
            ))}

            {/* No issues */}
            {issues.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>✓</div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: C.mint, fontFamily: F.body }}>Contract is clean. Ready for deployment.</div>
              </div>
            )}

            <div style={{ marginTop: "28px" }}>
              <Button
                fullWidth size="lg"
                variant={allResolved ? "mint" : "ghost"}
                disabled={!allResolved}
                onClick={() => navigate("/consent/part1")}
              >
                {allResolved ? "Ready to Deploy →" : criticals.length > 0 ? "Fix critical issues to continue" : "Acknowledge all warnings to continue"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
