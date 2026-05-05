export const C = {
  bg:       "#080E1D",
  surface:  "#111B33",
  surface2: "#0E1628",
  border:   "#1E2D4A",
  purple:   "#7B5CF0",
  purpleL:  "#9B7FF5",
  purpleD:  "#5B3FD0",
  mint:     "#00D4AA",
  mintD:    "#00A886",
  white:    "#FFFFFF",
  textPri:  "#FFFFFF",
  textSec:  "#C5CDE0",
  textMute: "#5A6580",
  danger:   "#FF5A5A",
  warn:     "#F5A623",
  success:  "#00D4AA",
} as const;

export const F = {
  display: "'Syne', sans-serif",
  body:    "'DM Sans', sans-serif",
  mono:    "'JetBrains Mono', monospace",
} as const;

export const R = {
  sm:   "4px",
  md:   "8px",
  lg:   "12px",
  xl:   "16px",
  full: "9999px",
} as const;

export const SP = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96] as const;
