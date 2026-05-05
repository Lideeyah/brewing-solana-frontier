import { C, F, R } from "../../tokens";
import Logo from "./Logo";
import ModeTag from "../ui/ModeTag";
import TokenMeter from "../ui/TokenMeter";
import { useApp } from "../../context/AppContext";

const CHAIN_LABELS: Record<string, string> = {
  base: "Base",
  ethereum: "Ethereum",
  polygon: "Polygon",
  sepolia: "Sepolia",
  "base-sepolia": "Base Sepolia",
};

export default function BuildTopBar() {
  const { state } = useApp();
  const sessionName = state.goal.length > 40 ? state.goal.slice(0, 40) + "…" : state.goal;

  return (
    <div style={{
      height: "52px",
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: "16px",
      flexShrink: 0,
    }}>
      <Logo size="sm" />

      <div style={{ width: "1px", height: "20px", background: C.border }} />

      <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sessionName || "New Build"}
      </span>

      <ModeTag mode={state.mode} />

      <div style={{ width: "140px" }}>
        <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
      </div>

      <div style={{
        padding: "3px 10px",
        background: "rgba(0,212,170,0.1)",
        border: `1px solid ${C.mint}33`,
        borderRadius: R.full,
        fontSize: "11px",
        color: C.mint,
        fontFamily: F.mono,
        whiteSpace: "nowrap",
      }}>
        {CHAIN_LABELS[state.chain] || state.chain}
      </div>
    </div>
  );
}
