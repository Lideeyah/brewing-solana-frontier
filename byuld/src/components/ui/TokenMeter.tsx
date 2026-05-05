import { C, F } from "../../tokens";

interface Props { used: number; limit: number; }

export default function TokenMeter({ used, limit }: Props) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 80 ? C.danger : pct > 60 ? C.warn : C.mint;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
      <div style={{ flex: 1, height: "3px", background: C.surface2, borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: "2px",
          transition: "width 0.4s ease, background 0.3s",
        }} />
      </div>
      <span style={{
        fontSize: "11px",
        color: pct > 80 ? color : C.textMute,
        fontFamily: F.mono,
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontWeight: pct > 80 ? 600 : 400,
      }}>
        {used}/{limit}
      </span>
    </div>
  );
}
