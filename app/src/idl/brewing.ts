/**
 * Auto-generated IDL type — replace this file with the output of
 * `anchor build && cat target/idl/brewing.json` once the program compiles.
 *
 * The shape below mirrors the on-chain program exactly so the frontend can
 * be wired up before the first build.
 */
export type Brewing = {
  address: string;
  metadata: { name: "brewing"; version: "0.1.0"; spec: "0.1.0" };
  instructions: [
    {
      name: "postJob";
      discriminator: number[];
      accounts: [
        { name: "job"; writable: true; pda: object },
        { name: "escrowTokenAccount"; writable: true; pda: object },
        { name: "posterTokenAccount"; writable: true },
        { name: "usdcMint" },
        { name: "posterAgent"; writable: true; signer: true },
        { name: "tokenProgram" },
        { name: "systemProgram" },
        { name: "rent" }
      ];
      args: [
        { name: "jobId"; type: "u64" },
        { name: "description"; type: "string" },
        { name: "paymentAmount"; type: "u64" }
      ];
    },
    {
      name: "acceptJob";
      discriminator: number[];
      accounts: [
        { name: "job"; writable: true; pda: object },
        { name: "workerAgent"; signer: true }
      ];
      args: [{ name: "jobId"; type: "u64" }];
    },
    {
      name: "completeJob";
      discriminator: number[];
      accounts: [
        { name: "job"; writable: true; pda: object },
        { name: "workerAgent"; signer: true }
      ];
      args: [{ name: "jobId"; type: "u64" }];
    },
    {
      name: "releasePayment";
      discriminator: number[];
      accounts: [
        { name: "job"; writable: true; pda: object },
        { name: "escrowTokenAccount"; writable: true; pda: object },
        { name: "workerTokenAccount"; writable: true },
        { name: "posterAgent"; writable: true; signer: true },
        { name: "tokenProgram" }
      ];
      args: [{ name: "jobId"; type: "u64" }];
    }
  ];
  accounts: [
    {
      name: "jobAccount";
      discriminator: number[];
    }
  ];
  types: [
    {
      name: "jobAccount";
      type: {
        kind: "struct";
        fields: [
          { name: "jobId"; type: "u64" },
          { name: "description"; type: "string" },
          { name: "paymentAmount"; type: "u64" },
          { name: "posterAgent"; type: "pubkey" },
          { name: "workerAgent"; type: "pubkey" },
          { name: "status"; type: { defined: { name: "jobStatus" } } },
          { name: "bump"; type: "u8" },
          { name: "escrowBump"; type: "u8" }
        ];
      };
    },
    {
      name: "jobStatus";
      type: {
        kind: "enum";
        variants: [
          { name: "Open" },
          { name: "InProgress" },
          { name: "PendingRelease" },
          { name: "Completed" },
          { name: "Cancelled" }
        ];
      };
    }
  ];
  errors: [
    { code: 6000; name: "DescriptionTooLong" },
    { code: 6001; name: "ZeroPayment" },
    { code: 6002; name: "JobNotOpen" },
    { code: 6003; name: "JobNotInProgress" },
    { code: 6004; name: "PaymentNotPending" },
    { code: 6005; name: "UnauthorizedWorker" },
    { code: 6006; name: "UnauthorizedPoster" },
    { code: 6007; name: "PosterCannotWork" }
  ];
};
