import { C, F } from "../../tokens";
import type { BuildMode } from "../../types";

const MODES: Record<BuildMode, { label: string; color: string }> = {
  C: { label: "Scaffold",     color: C.purple },
  B: { label: "Guided",       color: C.purple },
  A: { label: "Live Explain", color: C.mint   },
};

export default function ModeTag({ mode }: { mode: BuildMode }) {
  const m = MODES[mode];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{
        width: "20px", height: "20px", borderRadius: "4px",
        background: m.color + "22",
        border: `1px solid ${m.color}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "10px", fontWeight: 800, color: m.color, fontFamily: F.display }}>{mode}</span>
      </div>
      <span style={{ fontSize: "11px", color: m.color, fontFamily: F.body, fontWeight: 500 }}>{m.label}</span>
    </div>
  );
}
