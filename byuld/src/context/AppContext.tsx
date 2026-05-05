import { createContext, useContext, useReducer, ReactNode } from "react";
import type { AppState, AppAction, Persona, Chain, BuildMode, Message, Section, SecurityIssue } from "../types";

const INITIAL_SECTIONS: Section[] = [
  { id: "imports",   title: "Imports & Pragma",      status: "active",  code: "" },
  { id: "contract",  title: "Contract Declaration",  status: "locked",  code: "" },
  { id: "state",     title: "State Variables",       status: "locked",  code: "" },
  { id: "functions", title: "Core Functions",        status: "locked",  code: "" },
  { id: "security",  title: "Access Control",        status: "locked",  code: "" },
];

const INITIAL: AppState = {
  email: "",
  walletAddress: "",
  isAuthenticated: false,
  persona: null,
  goal: "",
  contractType: "",
  chain: "base",
  mode: "C",
  sections: INITIAL_SECTIONS,
  messages: [],
  tokensUsed: 0,
  tokensLimit: 50,
  currentSection: 0,
  securityIssues: [],
  byuldFeePaid: false,
  gasFunded: false,
  contractAddress: "",
  txHash: "",
  deployedAt: 0,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_EMAIL":
      return { ...state, email: action.email };
    case "SET_AUTHENTICATED":
      return { ...state, isAuthenticated: true, walletAddress: action.walletAddress };
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_GOAL":
      return { ...state, goal: action.goal, contractType: action.contractType };
    case "SET_CHAIN":
      return { ...state, chain: action.chain };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "UPDATE_SECTION_CODE": {
      const sections = state.sections.map(s =>
        s.id === action.id ? { ...s, code: action.code } : s
      );
      return { ...state, sections };
    }
    case "COMPLETE_SECTION": {
      const sections = state.sections.map((s, i) => {
        if (s.id === action.id) return { ...s, status: "complete" as const };
        const idx = state.sections.findIndex(x => x.id === action.id);
        if (i === idx + 1) return { ...s, status: "active" as const };
        return s;
      });
      const next = state.currentSection + 1;
      return { ...state, sections, currentSection: Math.min(next, sections.length - 1) };
    }
    case "ADD_TOKENS":
      return { ...state, tokensUsed: Math.min(state.tokensUsed + action.count, state.tokensLimit) };
    case "SET_SECURITY_ISSUES":
      return { ...state, securityIssues: action.issues };
    case "ACKNOWLEDGE_ISSUE": {
      const securityIssues = state.securityIssues.map(i =>
        i.id === action.id ? { ...i, acknowledged: true } : i
      );
      return { ...state, securityIssues };
    }
    case "SET_BYULD_FEE_PAID":
      return { ...state, byuldFeePaid: true };
    case "SET_GAS_FUNDED":
      return { ...state, gasFunded: true };
    case "SET_DEPLOYED":
      return { ...state, contractAddress: action.contractAddress, txHash: action.txHash, deployedAt: Date.now() };
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
