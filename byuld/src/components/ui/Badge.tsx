import { ReactNode } from "react";
import { C, F, R } from "../../tokens";

type Variant = "purple" | "mint" | "muted" | "warn" | "danger";

const VARS: Record<Variant, { bg: string; color: string; border: string }> = {
  purple: { bg: "rgba(123,92,240,0.15)", color: C.purple,   border: C.purple },
  mint:   { bg: "rgba(0,212,170,0.12)",  color: C.mint,     border: C.mint },
  muted:  { bg: "rgba(90,101,128,0.15)", color: C.textMute, border: C.border },
  warn:   { bg: "rgba(245,166,35,0.12)", color: C.warn,     border: C.warn },
  danger: { bg: "rgba(255,90,90,0.12)",  color: C.danger,   border: C.danger },
};

export default function Badge({ variant = "purple", children }: { variant?: Variant; children: ReactNode }) {
  const v = VARS[variant];
  return (
    <span style={{
      padding: "3px 10px",
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.05em",
      fontFamily: F.body,
      textTransform: "uppercase",
      background: v.bg,
      color: v.color,
      border: `1px solid ${v.border}44`,
      borderRadius: R.full,
      display: "inline-block",
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}
