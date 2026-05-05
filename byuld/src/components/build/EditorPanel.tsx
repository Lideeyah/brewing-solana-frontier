import { C, F, R } from "../../tokens";
import { useApp } from "../../context/AppContext";
import MonacoEditor from "@monaco-editor/react";

interface Props {
  onCodeChange?: (code: string) => void;
  onLineHover?: (line: number) => void;
}

export default function EditorPanel({ onCodeChange }: Props) {
  const { state, dispatch } = useApp();
  const currentSec = state.sections[state.currentSection];

  const handleChange = (value: string | undefined) => {
    const code = value ?? "";
    if (currentSec) {
      dispatch({ type: "UPDATE_SECTION_CODE", id: currentSec.id, code });
    }
    onCodeChange?.(code);
  };

  // Build full view of contract from all sections
  const fullCode = state.sections.map(s => {
    if (s.status === "complete") return s.code;
    if (s.status === "active") return s.code || `// TODO: ${s.title}\n`;
    return `// [Locked] ${s.title}`;
  }).join("\n\n");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
      {/* Editor header */}
      <div style={{
        padding: "8px 16px",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["#FF5F57", "#FFBD2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono, letterSpacing: "0.06em" }}>
          {state.contractType ? `${state.contractType.toLowerCase()}.sol` : "contract.sol"}
        </span>
        <div style={{ flex: 1 }} />
        {currentSec && (
          <span style={{
            fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 600,
            padding: "2px 8px", background: `${C.purple}15`, borderRadius: R.full,
          }}>
            ✎ {currentSec.title}
          </span>
        )}
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          height="100%"
          defaultLanguage="sol"
          theme="vs-dark"
          value={fullCode}
          onChange={handleChange}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: "line",
            lineNumbers: "on",
            glyphMargin: false,
            folding: true,
            wordWrap: "on",
            tabSize: 4,
            automaticLayout: true,
            scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
          }}
          beforeMount={monaco => {
            // Register Solidity language alias
            monaco.languages.register({ id: "sol" });
            monaco.editor.defineTheme("byuld-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment",  foreground: "5A6580", fontStyle: "italic" },
                { token: "keyword",  foreground: "9B7FF5" },
                { token: "string",   foreground: "00D4AA" },
                { token: "number",   foreground: "F5A623" },
              ],
              colors: {
                "editor.background": C.bg,
                "editor.foreground": "#C5CDE0",
                "editor.lineHighlightBackground": "#111B33",
                "editorLineNumber.foreground": "#2a3d5e",
                "editorLineNumber.activeForeground": "#5A6580",
                "editor.selectionBackground": "#7B5CF033",
                "editorCursor.foreground": C.purple,
              },
            });
            monaco.editor.setTheme("byuld-dark");
          }}
        />
      </div>
    </div>
  );
}
