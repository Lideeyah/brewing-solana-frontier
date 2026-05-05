import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { C, F, R } from "../../tokens";
import ChatBubble from "../ui/ChatBubble";
import Spinner from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import type { Message } from "../../types";

interface Props {
  onSend?: (msg: string) => Promise<void>;
  loading?: boolean;
}

export default function ChatPanel({ onSend, loading }: Props) {
  const { state } = useApp();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    await onSend?.(trimmed);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: C.bg,
      borderLeft: `1px solid ${C.border}`,
    }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {state.messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6 }}>
              Byuld is reading your goal and preparing your scaffold.
            </div>
          </div>
        )}
        {state.messages.map((msg: Message, i) => (
          <ChatBubble key={i} role={msg.role} animate={i === state.messages.length - 1}>
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          </ChatBubble>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 0 4px 4px" }}>
            <Spinner size={14} />
            <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>Byuld is thinking…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px", borderTop: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Byuld anything… (Enter to send)"
            rows={1}
            style={{
              flex: 1,
              padding: "9px 12px",
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              color: C.textPri,
              fontFamily: F.body,
              fontSize: "13px",
              outline: "none",
              resize: "none",
              lineHeight: 1.5,
              maxHeight: "100px",
              overflowY: "auto",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              padding: "9px 14px",
              background: input.trim() && !loading ? C.purple : C.surface2,
              border: "none",
              borderRadius: R.md,
              color: input.trim() && !loading ? "#fff" : C.textMute,
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontSize: "13px",
              fontFamily: F.body,
              fontWeight: 600,
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div style={{ marginTop: "6px", fontSize: "10px", color: C.textMute, fontFamily: F.body }}>
          Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
