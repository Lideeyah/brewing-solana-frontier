import { ReactNode } from "react";
import { C, F } from "../../tokens";

interface Props {
  role?: "byuld" | "user";
  children: ReactNode;
  animate?: boolean;
}

export default function ChatBubble({ role = "byuld", children, animate }: Props) {
  const isByuld = role === "byuld";
  return (
    <div
      className={animate ? "slide-in" : undefined}
      style={{
        display: "flex",
        justifyContent: isByuld ? "flex-start" : "flex-end",
        marginBottom: "10px",
      }}
    >
      <div style={{
        maxWidth: "88%",
        padding: "10px 14px",
        background: isByuld ? C.surface2 : "rgba(123,92,240,0.15)",
        border: `1px solid ${isByuld ? C.border : C.purple + "33"}`,
        borderRadius: isByuld ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
        fontSize: "13px",
        lineHeight: 1.6,
        color: C.textSec,
        fontFamily: F.body,
      }}>
        {isByuld && (
          <div style={{
            fontSize: "10px", color: C.purple, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px",
            fontFamily: F.body,
          }}>
            BYULD
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
