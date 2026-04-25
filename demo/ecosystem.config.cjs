/**
 * Brewing — pm2 Ecosystem Config
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs all four Brewing daemons as background processes that:
 *   - survive closing the terminal
 *   - restart automatically after any crash (with exponential backoff)
 *   - can be set to start on system boot with `pm2 startup`
 *
 * Commands (run from project root or demo/):
 *   npm run pm2:start    — launch all four agents in the background
 *   npm run pm2:stop     — gracefully stop all agents
 *   npm run pm2:restart  — rolling restart without downtime
 *   npm run pm2:logs     — stream live logs from all agents
 *   npm run pm2:status   — show CPU/memory/uptime per process
 *   npm run pm2:save     — persist process list across reboots
 *
 * To auto-start on system boot (one-time setup):
 *   pm2 startup          — prints a sudo command to run
 *   npm run pm2:save     — freeze current process list
 */

const path = require("path");

// ── Root of the monorepo (one level up from demo/) ───────────────────────────
const root = path.resolve(__dirname, "..");

const COMMON = {
  cwd:          root,
  autorestart:  true,
  watch:        false,                  // never restart on file changes
  restart_delay: 10_000,               // wait 10 s before each restart
  exp_backoff_restart_delay: 100,      // exponential backoff up to ~15 s
  max_restarts: 200,                   // treat agents as permanent services
  log_date_format: "YYYY-MM-DD HH:mm:ss",
};

module.exports = {
  apps: [
    {
      ...COMMON,
      name:   "brewing-poster",
      script: "npm",
      args:   "run poster",
    },
    {
      ...COMMON,
      name:   "brewing-research",
      script: "npm",
      args:   "run worker",
    },
    {
      ...COMMON,
      name:   "brewing-trading",
      script: "npm",
      args:   "run worker:trading",
    },
    {
      ...COMMON,
      name:   "brewing-coding",
      script: "npm",
      args:   "run worker:coding",
    },
  ],
};
