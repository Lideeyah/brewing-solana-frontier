import { C, F } from "../../tokens";

export default function Divider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "8px 0" }}>
      <div style={{ flex: 1, height: "1px", background: C.border }} />
      {label && <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, whiteSpace: "nowrap" }}>{label}</span>}
      <div style={{ flex: 1, height: "1px", background: C.border }} />
    </div>
  );
}
