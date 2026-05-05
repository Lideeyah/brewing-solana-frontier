import { ReactNode, CSSProperties } from "react";
import { C, R } from "../../tokens";

interface Props {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
  onClick?: () => void;
  selected?: boolean;
}

export default function Card({ children, accent, style, onClick, selected }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface,
        border: `1px solid ${selected ? C.purple : C.border}`,
        borderRadius: R.lg,
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        overflow: "hidden",
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? `0 0 0 1px ${C.purple}44` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
