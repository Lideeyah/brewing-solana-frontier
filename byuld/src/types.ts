export type Persona = "founder" | "developer" | null;
export type Chain = "base" | "ethereum" | "polygon" | "sepolia" | "base-sepolia";
export type BuildMode = "C" | "B" | "A";

export interface Message {
  role: "byuld" | "user";
  content: string;
  timestamp: number;
}

export interface Section {
  id: string;
  title: string;
  status: "locked" | "active" | "complete";
  code: string;
}

export interface SecurityIssue {
  id: string;
  level: "critical" | "warning" | "info";
  name: string;
  explanation: string;
  fix: string;
  acknowledged: boolean;
}

export interface AppState {
  // auth
  email: string;
  walletAddress: string;
  isAuthenticated: boolean;
  // onboarding
  persona: Persona;
  goal: string;
  contractType: string;
  chain: Chain;
  // build
  mode: BuildMode;
  sections: Section[];
  messages: Message[];
  tokensUsed: number;
  tokensLimit: number;
  currentSection: number;
  securityIssues: SecurityIssue[];
  // payment
  byuldFeePaid: boolean;
  gasFunded: boolean;
  // deploy
  contractAddress: string;
  txHash: string;
  deployedAt: number;
}

export type AppAction =
  | { type: "SET_EMAIL"; email: string }
  | { type: "SET_AUTHENTICATED"; walletAddress: string }
  | { type: "SET_PERSONA"; persona: Persona }
  | { type: "SET_GOAL"; goal: string; contractType: string }
  | { type: "SET_CHAIN"; chain: Chain }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_MODE"; mode: BuildMode }
  | { type: "UPDATE_SECTION_CODE"; id: string; code: string }
  | { type: "COMPLETE_SECTION"; id: string }
  | { type: "ADD_TOKENS"; count: number }
  | { type: "SET_SECURITY_ISSUES"; issues: SecurityIssue[] }
  | { type: "ACKNOWLEDGE_ISSUE"; id: string }
  | { type: "SET_BYULD_FEE_PAID" }
  | { type: "SET_GAS_FUNDED" }
  | { type: "SET_DEPLOYED"; contractAddress: string; txHash: string };
