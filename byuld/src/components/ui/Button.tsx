import { useState, ReactNode, CSSProperties } from "react";
import { C, F, R } from "../../tokens";

type Variant = "primary" | "secondary" | "ghost" | "mint" | "danger";
type Size = "sm" | "md" | "lg";

interface Props {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}

const VARIANTS: Record<Variant, { bg: string; color: string; border: string; hover: string }> = {
  primary:   { bg: C.purple,   color: "#fff",       border: "none",                          hover: C.purpleL },
  secondary: { bg: "transparent", color: C.purple,  border: `1px solid ${C.purple}`,         hover: C.surface2 },
  ghost:     { bg: "transparent", color: C.textSec, border: `1px solid ${C.border}`,         hover: C.surface },
  danger:    { bg: C.danger,   color: "#fff",       border: "none",                          hover: "#ff3a3a" },
  mint:      { bg: C.mint,     color: C.bg,         border: "none",                          hover: C.mintD },
};

const SIZES: Record<Size, { padding: string; fontSize: string }> = {
  sm: { padding: "8px 14px",  fontSize: "12px" },
  md: { padding: "10px 20px", fontSize: "14px" },
  lg: { padding: "13px 28px", fontSize: "15px" },
};

export default function Button({ variant = "primary", size = "md", children, onClick, disabled, fullWidth, style }: Props) {
  const [hov, setHov] = useState(false);
  const v = VARIANTS[variant];
  const s = SIZES[size];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: F.body,
        fontWeight: 600,
        letterSpacing: "0.01em",
        background: hov && !disabled ? v.hover : v.bg,
        color: v.color,
        border: v.border,
        borderRadius: R.md,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.15s ease",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
