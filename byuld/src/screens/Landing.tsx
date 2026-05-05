import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";

const DEMO_LINES = [
  "// Byuld: This contract issues certificates as NFTs",
  "pragma solidity ^0.8.19;",
  "",
  'import "@openzeppelin/contracts/token/ERC721/ERC721.sol";',
  "",
  "contract CertificateNFT is ERC721 {",
  "    // TODO: Add access control",
  "    mapping(uint256 => address) private _issuedTo;",
  "",
  "    function mint(address to, uint256 tokenId)",
  "        public onlyOwner {",
  "        _mint(to, tokenId);",
  "        _issuedTo[tokenId] = to;",
  "    }",
  "}",
];

const FEATURES = [
  { icon: "◈", title: "Three-mode AI guidance", body: "Scaffold → Write → Explain. Byuld never just gives you the answer." },
  { icon: "⬡", title: "Security by default", body: "Slither + AI review runs before every deployment. Critical issues are a hard stop." },
  { icon: "◉", title: "You own the code", body: "Every line is yours. Byuld explains what you wrote, not what it wrote for you." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [visibleLines, setVisibleLines] = useState(0);
  const [hov, setHov] = useState<number | null>(null);

  useEffect(() => {
    if (visibleLines >= DEMO_LINES.length) return;
    const t = setTimeout(() => setVisibleLines(v => v + 1), visibleLines === 0 ? 800 : 120);
    return () => clearTimeout(t);
  }, [visibleLines]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{
        padding: "0 40px",
        height: "60px",
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${C.border}`,
        gap: "32px",
      }}>
        <Logo size="sm" />
        <div style={{ flex: 1 }} />
        {["How it works", "Pricing"].map(label => (
          <span key={label} style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, cursor: "pointer" }}>{label}</span>
        ))}
        <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px 60px", textAlign: "center" }}>
        {/* Eyebrow */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "4px 14px", marginBottom: "32px",
          background: `${C.purple}18`, border: `1px solid ${C.purple}33`,
          borderRadius: R.full, fontSize: "12px", color: C.purple, fontFamily: F.body, fontWeight: 600,
        }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.purple, display: "inline-block" }} />
          Built for founders who want to understand what they're deploying
        </div>

        <h1 style={{
          fontSize: "clamp(40px, 6vw, 72px)",
          fontWeight: 800,
          fontFamily: F.display,
          color: C.white,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          marginBottom: "24px",
          maxWidth: "800px",
        }}>
          Learn Web3 by{" "}
          <span style={{ color: C.purple }}>building it.</span>
        </h1>

        <p style={{ fontSize: "18px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65, maxWidth: "520px", marginBottom: "40px" }}>
          The AI that teaches you to write smart contracts as you write them. You write the code. Byuld makes sure you understand every line.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", marginBottom: "72px" }}>
          <Button size="lg" onClick={() => navigate("/auth")}>Start Building — It's Free</Button>
          <Button variant="ghost" size="lg" onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}>
            See how it works
          </Button>
        </div>

        {/* Social proof */}
        <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
          Built for Web3 founders · Secured by Slither + AI · Deploy to Base, Ethereum, Polygon
        </div>
      </div>

      {/* Demo */}
      <div id="demo" style={{ padding: "0 40px 100px", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
          border: `1px solid ${C.border}`,
          borderRadius: R.xl,
          overflow: "hidden",
          boxShadow: `0 0 80px ${C.purple}18`,
        }}>
          {/* Editor side */}
          <div style={{ background: C.bg, borderRight: `1px solid ${C.border}` }}>
            <div style={{
              padding: "10px 16px",
              borderBottom: `1px solid ${C.border}`,
              background: C.surface,
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              {["#FF5F57", "#FFBD2E", "#28C840"].map((c, i) => (
                <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.8 }} />
              ))}
              <span style={{ marginLeft: "8px", fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>certificate.sol</span>
            </div>
            <div style={{ padding: "20px", minHeight: "300px" }}>
              {DEMO_LINES.slice(0, visibleLines).map((line, i) => (
                <div key={i} style={{
                  fontFamily: F.mono,
                  fontSize: "12px",
                  lineHeight: "22px",
                  color: line.startsWith("//") ? C.textMute : line.startsWith("pragma") || line.startsWith("import") || line.startsWith("contract") || line.includes("function") || line.includes("mapping") || line.startsWith("}") ? C.purpleL : C.textSec,
                  fontStyle: line.startsWith("//") ? "italic" : undefined,
                  animation: "fadeIn 0.2s ease",
                }}>
                  {line || "\u00A0"}
                </div>
              ))}
              {visibleLines < DEMO_LINES.length && (
                <div style={{ width: "2px", height: "16px", background: C.purple, display: "inline-block", animation: "blink 1s step-end infinite" }} />
              )}
            </div>
          </div>

          {/* Chat side */}
          <div style={{ background: C.surface, display: "flex", flexDirection: "column" }}>
            <div style={{
              padding: "10px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.purple }} />
              <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                BYULD · Mode B — Guided
              </span>
            </div>
            <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { role: "byuld" as const, text: "Should your certificates be transferable (can be sold) or locked to the person who earned them? This affects the contract fundamentally." },
                { role: "user" as const, text: "Locked — they should only belong to the person who completed the course." },
                { role: "byuld" as const, text: "Good choice. That makes this a soulbound token — we'll override the transfer functions to block movement. Write the mint function below." },
              ].map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "byuld" ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "85%",
                    padding: "9px 13px",
                    background: msg.role === "byuld" ? C.surface2 : `${C.purple}20`,
                    border: `1px solid ${msg.role === "byuld" ? C.border : C.purple + "33"}`,
                    borderRadius: msg.role === "byuld" ? "4px 10px 10px 10px" : "10px 4px 10px 10px",
                    fontSize: "12px",
                    color: C.textSec,
                    fontFamily: F.body,
                    lineHeight: 1.55,
                  }}>
                    {msg.role === "byuld" && (
                      <div style={{ fontSize: "9px", color: C.purple, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>BYULD</div>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: "0 40px 100px", maxWidth: "1100px", margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {FEATURES.map((f, i) => (
            <div
              key={i}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov(null)}
              style={{
                padding: "28px 24px",
                background: hov === i ? C.surface : "transparent",
                border: `1px solid ${hov === i ? C.border : "transparent"}`,
                borderRadius: R.xl,
                transition: "all 0.2s",
                cursor: "default",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "16px", color: C.purple }}>{f.icon}</div>
              <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "10px" }}>{f.title}</div>
              <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: "80px 40px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: "36px", fontWeight: 800, fontFamily: F.display, color: C.white, marginBottom: "16px", letterSpacing: "-0.02em" }}>
          Ready to build your first contract?
        </h2>
        <p style={{ fontSize: "15px", color: C.textSec, fontFamily: F.body, marginBottom: "32px" }}>Free to start. No wallet needed upfront.</p>
        <Button size="lg" onClick={() => navigate("/auth")}>Start Building</Button>
      </div>

      {/* Footer */}
      <div style={{ padding: "24px 40px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "16px" }}>
        <Logo size="sm" />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>© 2025 Byuld · Learn Web3 by building it</span>
      </div>
    </div>
  );
}
