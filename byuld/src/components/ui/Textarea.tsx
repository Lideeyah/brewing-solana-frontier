import { useState, TextareaHTMLAttributes } from "react";
import { C, F, R } from "../../tokens";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  maxChars?: number;
}

export default function Textarea({ label, hint, error, maxChars, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const len = String(rest.value ?? "").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label style={{ fontSize: "13px", fontWeight: 500, color: C.textSec, fontFamily: F.body }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <textarea
          {...rest}
          onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
          maxLength={maxChars}
          style={{
            padding: "12px 14px",
            background: C.surface2,
            border: `1px solid ${error ? C.danger : focused ? C.purple : C.border}`,
            borderRadius: R.md,
            color: C.textPri,
            fontFamily: F.body,
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.15s",
            width: "100%",
            resize: "vertical",
            lineHeight: 1.6,
            ...rest.style,
          }}
        />
        {maxChars && (
          <span style={{
            position: "absolute", bottom: "10px", right: "12px",
            fontSize: "11px", color: len > maxChars * 0.9 ? C.warn : C.textMute,
            fontFamily: F.body, pointerEvents: "none",
          }}>
            {len}/{maxChars}
          </span>
        )}
      </div>
      {error && <span style={{ fontSize: "12px", color: C.danger, fontFamily: F.body }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{hint}</span>}
    </div>
  );
}
