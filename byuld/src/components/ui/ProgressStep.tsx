import { C, F } from "../../tokens";

interface Props { steps: string[]; current: number; }

export default function ProgressStep({ steps, current }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {steps.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        const last   = i === steps.length - 1;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: last ? "none" : 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: done ? C.mint : active ? C.purple : C.surface2,
                border: `2px solid ${done ? C.mint : active ? C.purple : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
                flexShrink: 0,
              }}>
                {done
                  ? <span style={{ fontSize: "12px", color: C.bg }}>✓</span>
                  : <span style={{ fontSize: "11px", fontWeight: 700, color: active ? C.white : C.textMute, fontFamily: F.display }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: "10px", color: active ? C.white : C.textMute, fontFamily: F.body, whiteSpace: "nowrap" }}>
                {step}
              </span>
            </div>
            {!last && (
              <div style={{
                flex: 1, height: "2px",
                background: done ? C.mint : C.border,
                margin: "0 4px",
                marginBottom: "18px",
                transition: "background 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
