import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Textarea from "../../components/ui/Textarea";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import Spinner from "../../components/ui/Spinner";

function evaluateSummary(summary: string, contractType: string): { pass: boolean; feedback: string } {
  const s = summary.toLowerCase();
  const hasWho  = s.includes("owner") || s.includes("only") || s.includes("control") || s.includes("i ") || s.includes("me ") || s.includes("admin");
  const hasWhat = s.includes("mint") || s.includes("token") || s.includes("nft") || s.includes("certif") || s.includes("deploy") || s.includes("contract");
  if (summary.length < 50) return { pass: false, feedback: "Your description is too short. Describe what the contract does and who controls it." };
  if (!hasWhat) return { pass: false, feedback: "You didn't describe what the contract actually does. Mention what it creates or manages." };
  if (!hasWho) return { pass: false, feedback: "You didn't mention who controls this contract. Who can mint? Who is the owner?" };
  return { pass: true, feedback: "" };
}

export default function ConsentPart1() {
  const navigate = useNavigate();
  const { state } = useApp();
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async () => {
    if (summary.trim().length < 10 || loading) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);

    const result = evaluateSummary(summary, state.contractType);
    if (result.pass) {
      navigate("/consent/part2");
    } else {
      setFeedback(result.feedback);
      setAttempts(a => a + 1);
      if (attempts >= 2) setShowHelp(true);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "540px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "28px", marginBottom: "8px" }}>
            <ProgressStep steps={["Summary", "Confirm"]} current={0} />
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px", marginBottom: "8px" }}>
            Before you deploy, tell us what you've built.
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            In your own words — no technical jargon needed.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Textarea
            label="Describe what your contract does, in plain English."
            value={summary}
            onChange={e => { setSummary(e.target.value); setFeedback(""); }}
            placeholder="e.g. This contract lets me issue certificates as NFTs to students who complete my course. Only I can mint them. They can't be transferred."
            maxChars={500}
            style={{ minHeight: "140px" }}
            hint="Minimum 50 characters. Byuld will check this for accuracy."
          />

          {feedback && (
            <div style={{
              padding: "12px 16px", background: "rgba(255,90,90,0.08)",
              border: `1px solid ${C.danger}22`, borderLeft: `3px solid ${C.danger}`,
              borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55,
            }}>
              <span style={{ color: C.danger, fontWeight: 600 }}>Byuld: </span>{feedback}
            </div>
          )}

          {showHelp && (
            <div style={{
              padding: "14px 16px", background: `${C.purple}0A`,
              border: `1px solid ${C.purple}22`, borderLeft: `3px solid ${C.purple}`,
              borderRadius: R.md,
            }}>
              <div style={{ fontSize: "12px", color: C.purple, fontWeight: 600, fontFamily: F.body, marginBottom: "8px" }}>Byuld suggests including:</div>
              {[
                `What the contract creates or manages (${state.contractType})`,
                "Who has permission to take actions (owner, anyone, etc.)",
                "Whether tokens or items are transferable or permanent",
              ].map((hint, i) => (
                <div key={i} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, display: "flex", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ color: C.purple }}>→</span>{hint}
                </div>
              ))}
            </div>
          )}

          <Button fullWidth size="lg" onClick={handleSubmit} disabled={summary.trim().length < 10 || loading}>
            {loading ? <><Spinner size={16} color="#fff" /> Byuld is checking this…</> : "Submit for review"}
          </Button>

          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textAlign: "center" }}>
            Step 1 of 2 · This step cannot be skipped
          </div>
        </div>
      </div>
    </div>
  );
}
