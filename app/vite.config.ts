import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // Polyfill Buffer, process, etc. for Anchor / @solana/web3.js in the browser
    nodePolyfills({
      include: ["buffer", "process", "stream", "util"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  define: {
    "process.env": {},
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Solana + Anchor in their own chunk (largest dependency)
          solana: ["@solana/web3.js", "@coral-xyz/anchor", "@solana/spl-token"],
          // Wallet adapter UI separately
          wallet: [
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
            "@solana/wallet-adapter-wallets",
            "@solana/wallet-adapter-base",
          ],
        },
      },
    },
  },
});
