// IDL type — matches the deployed Anchor 1.0.0 program.
// We use `any` for the Program generic to avoid fighting Anchor's IDL type system
// while keeping full runtime safety via the typed hooks in useJobActions.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Brewing = any;
