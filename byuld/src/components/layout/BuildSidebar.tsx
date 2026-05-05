import { C, F, R } from "../../tokens";
import { useApp } from "../../context/AppContext";

export default function BuildSidebar() {
  const { state } = useApp();
  const complete = state.sections.filter(s => s.status === "complete").length;

  return (
    <div style={{
      width: "220px",
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>
          Contract
        </div>
        <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body }}>
          {complete}/{state.sections.length} sections complete
        </div>
        <div style={{ marginTop: "8px", height: "2px", background: C.border, borderRadius: "1px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(complete / state.sections.length) * 100}%`, background: C.mint, borderRadius: "1px", transition: "width 0.4s" }} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {state.sections.map((section, i) => {
          const isActive = section.status === "active";
          const isDone   = section.status === "complete";
          const isLocked = section.status === "locked";
          return (
            <div key={section.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 10px",
              borderRadius: R.md,
              background: isActive ? `${C.purple}18` : "transparent",
              border: isActive ? `1px solid ${C.purple}33` : "1px solid transparent",
              marginBottom: "2px",
              cursor: isDone ? "pointer" : "default",
              transition: "all 0.15s",
              opacity: isLocked ? 0.4 : 1,
            }}>
              <div style={{
                width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                background: isDone ? C.mint : isActive ? C.purple : C.surface2,
                border: `1.5px solid ${isDone ? C.mint : isActive ? C.purple : C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isDone
                  ? <span style={{ fontSize: "10px", color: C.bg }}>✓</span>
                  : <span style={{ fontSize: "9px", fontWeight: 700, color: isActive ? "#fff" : C.textMute, fontFamily: F.display }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: "12px", color: isActive ? C.white : isDone ? C.textSec : C.textMute, fontFamily: F.body, fontWeight: isActive ? 600 : 400 }}>
                {section.title}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>
          {state.contractType || "Smart Contract"}
        </div>
      </div>
    </div>
  );
}
