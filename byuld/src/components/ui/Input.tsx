import { useState, InputHTMLAttributes } from "react";
import { C, F, R } from "../../tokens";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export default function Input({ label, hint, error, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "13px", fontWeight: 500, color: C.textSec, fontFamily: F.body }}>
          {label}
        </label>
      )}
      <input
        {...rest}
        onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
        style={{
          padding: "10px 14px",
          background: C.surface2,
          border: `1px solid ${error ? C.danger : focused ? C.purple : C.border}`,
          borderRadius: R.md,
          color: C.textPri,
          fontFamily: F.body,
          fontSize: "14px",
          outline: "none",
          transition: "border-color 0.15s",
          width: "100%",
          ...rest.style,
        }}
      />
      {error && <span style={{ fontSize: "12px", color: C.danger, fontFamily: F.body }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{hint}</span>}
    </div>
  );
}
