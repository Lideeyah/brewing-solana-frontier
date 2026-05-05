import { C, F } from "../../tokens";

export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 28 : size === "lg" ? 48 : 36;
  const fs  = size === "sm" ? 14 : size === "lg" ? 24 : 18;
  const wordFs = size === "sm" ? 16 : size === "lg" ? 28 : 20;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "sm" ? "8px" : "12px" }}>
      <div style={{
        width: dim, height: dim, background: C.purple, borderRadius: "10px",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: fs, fontWeight: 800, color: "#fff", fontFamily: F.display }}>Y</span>
      </div>
      <span style={{ fontSize: wordFs, fontWeight: 800, fontFamily: F.display, color: C.white, letterSpacing: "-0.02em" }}>
        BYULD
      </span>
    </div>
  );
}
