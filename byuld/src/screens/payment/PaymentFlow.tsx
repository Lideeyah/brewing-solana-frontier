import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";

type PayStep = "summary" | "stripe" | "moonpay" | "deploying" | "done";

const DEPLOY_STAGES = [
  { id: "sign",    label: "Signing transaction…",        sub: "Your wallet authorises the deployment" },
  { id: "submit",  label: "Submitting to network…",      sub: "Broadcasting to the blockchain" },
  { id: "confirm", label: "Waiting for confirmation…",   sub: "Usually 15–60 seconds on Base" },
];

function genAddress() {
  return "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}
function genTx() {
  return "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

const CHAIN_FEE: Record<string, number> = {
  base: 0.80, ethereum: 4.50, polygon: 0.20, sepolia: 0, "base-sepolia": 0,
};
const BYULD_FEE = 6; // standard

export default function PaymentFlow() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<PayStep>("summary");
  const [cardNum, setCardNum] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [loading, setLoading] = useState(false);
  const [deployStage, setDeployStage] = useState(0);
  const [txHash, setTxHash] = useState("");
  const gasFee = CHAIN_FEE[state.chain] ?? 0.80;
  const isTestnet = state.chain.includes("sepolia");

  // ── Summary ──────────────────────────────────────────────────────────────
  if (step === "summary") {
    return (
      <Shell title="Ready to Deploy">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Contract card */}
          <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Contract summary</div>
            {[
              ["Type",  state.contractType],
              ["Chain", state.chain.charAt(0).toUpperCase() + state.chain.slice(1)],
              ["Goal",  state.goal.slice(0, 60) + (state.goal.length > 60 ? "…" : "")],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>{k}</span>
                <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Fee breakdown */}
          <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Fee breakdown</div>
            {[
              { label: "Byuld security review",  amount: `$${BYULD_FEE}`,            note: "Paid to Byuld · Card" },
              { label: "Estimated gas",           amount: isTestnet ? "Free" : `≈ $${gasFee.toFixed(2)}`, note: "Paid to network · ETH" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body }}>{row.label}</div>
                  <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>{row.note}</div>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.mono }}>{row.amount}</div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: C.white, fontFamily: F.body }}>Total (estimate)</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: C.white, fontFamily: F.mono }}>{isTestnet ? "Free" : `≈ $${(BYULD_FEE + gasFee).toFixed(2)}`}</span>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5 }}>
            You'll complete two quick payment steps: first the Byuld review fee by card, then fund your wallet for gas.
          </div>

          <Button fullWidth size="lg" onClick={() => setStep(isTestnet ? "moonpay" : "stripe")}>
            {isTestnet ? "Deploy to Testnet (Free) →" : `Deploy to ${state.chain} →`}
          </Button>
        </div>
      </Shell>
    );
  }

  // ── Stripe ───────────────────────────────────────────────────────────────
  if (step === "stripe") {
    const cardValid = cardNum.replace(/\s/g, "").length >= 16 && expiry.length >= 5 && cvc.length >= 3;
    const pay = async () => {
      setLoading(true);
      await sleep(1800);
      setLoading(false);
      dispatch({ type: "SET_BYULD_FEE_PAID" });
      setStep("moonpay");
    };
    return (
      <Shell title={`Pay Byuld Review Fee — $${BYULD_FEE}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <StripeField label="Card number" value={cardNum} onChange={v => setCardNum(v.replace(/\D/g, "").replace(/(\d{4})/g, "$1 ").trim().slice(0, 19))} placeholder="4242 4242 4242 4242" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <StripeField label="Expiry" value={expiry} onChange={v => setExpiry(v.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5))} placeholder="MM/YY" />
            <StripeField label="CVC" value={cvc} onChange={v => setCvc(v.replace(/\D/g, "").slice(0, 4))} placeholder="123" />
          </div>
          <Button fullWidth size="lg" disabled={!cardValid || loading} onClick={pay}>
            {loading ? <><Spinner size={16} color="#fff" /> Processing…</> : `Pay $${BYULD_FEE}`}
          </Button>
          <button onClick={() => setStep("summary")} style={{ background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>← Go back</button>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🔒</span> Secured by Stripe · Nigerian cards via Paystack
          </div>
        </div>
      </Shell>
    );
  }

  // ── MoonPay ──────────────────────────────────────────────────────────────
  if (step === "moonpay") {
    const fund = async () => {
      setLoading(true);
      await sleep(2200);
      setLoading(false);
      dispatch({ type: "SET_GAS_FUNDED" });
      setStep("deploying");
      runDeploy();
    };
    return (
      <Shell title={isTestnet ? "Fund Wallet for Gas" : `Fund Wallet — ≈ $${(gasFee * 1.2).toFixed(2)} ETH`}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ padding: "14px 16px", background: `${C.purple}0A`, border: `1px solid ${C.purple}22`, borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            To put your contract on the blockchain, you need to pay a small fee to the network. This is called <strong style={{ color: C.white }}>gas</strong>. It goes to the network, not to Byuld.
          </div>
          <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount needed</div>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.mono, color: C.white }}>{isTestnet ? "Free" : `≈ $${(gasFee * 1.2).toFixed(2)}`}</div>
            {!isTestnet && <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "3px" }}>Includes 20% buffer for gas price variance</div>}
          </div>
          <Button fullWidth size="lg" onClick={fund} disabled={loading}>
            {loading ? <><Spinner size={16} color={C.bg} /> ETH arriving in wallet…</> : isTestnet ? "Deploy to Testnet →" : "Fund wallet & deploy →"}
          </Button>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🔒</span> Powered by MoonPay · ETH sent directly to your wallet
          </div>
        </div>
      </Shell>
    );
  }

  // ── Deploying ─────────────────────────────────────────────────────────────
  if (step === "deploying") {
    return (
      <Shell title="Deploying your contract…">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {DEPLOY_STAGES.map((stage, i) => {
            const done   = i < deployStage;
            const active = i === deployStage;
            return (
              <div key={stage.id} style={{
                padding: "14px 18px", background: C.surface,
                border: `1px solid ${done ? C.mint + "44" : active ? C.purple + "44" : C.border}`,
                borderRadius: R.md, display: "flex", gap: "14px", alignItems: "center",
                opacity: !done && !active ? 0.4 : 1, transition: "all 0.3s",
              }}>
                <div style={{ flexShrink: 0 }}>
                  {done ? <span style={{ color: C.mint, fontSize: "16px" }}>✓</span>
                        : active ? <Spinner size={16} color={C.purple} />
                        : <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${C.border}` }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: done ? C.mint : active ? C.white : C.textMute, fontFamily: F.body }}>{stage.label}</div>
                  <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>{stage.sub}</div>
                </div>
              </div>
            );
          })}
          {txHash && (
            <div style={{ marginTop: "8px", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "4px" }}>TX Hash (live)</div>
              <div style={{ fontFamily: F.mono, fontSize: "11px", color: C.purple, wordBreak: "break-all" }}>{txHash.slice(0, 42)}…</div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  return null;

  async function runDeploy() {
    await sleep(800);
    const tx = genTx();
    setTxHash(tx);
    setDeployStage(1);
    await sleep(1500);
    setDeployStage(2);
    await sleep(2500);
    const addr = genAddress();
    dispatch({ type: "SET_DEPLOYED", contractAddress: addr, txHash: tx });
    navigate("/success");
  }
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px" }}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function StripeField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 500 }}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding: "10px 13px", background: C.surface2,
          border: `1px solid ${focused ? C.purple : C.border}`,
          borderRadius: R.md, color: C.textPri, fontFamily: F.mono, fontSize: "14px",
          outline: "none", transition: "border-color 0.15s", width: "100%",
        }}
      />
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
