"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeDescription = encodeDescription;
exports.decodeDescription = decodeDescription;
// ── Capability encoding helpers ───────────────────────────────────────────────
const CAP_PREFIX = /^\[cap:([^\]]+)\]\s*/;
/**
 * Encode a capability tag into a job description string.
 */
function encodeDescription(task, capability) {
    if (!capability)
        return task;
    return `[cap:${capability}] ${task}`;
}
/**
 * Decode a capability tag from a raw on-chain description.
 */
function decodeDescription(raw) {
    const match = raw.match(CAP_PREFIX);
    if (match) {
        return { capability: match[1], task: raw.replace(CAP_PREFIX, "") };
    }
    return { task: raw };
}
//# sourceMappingURL=types.js.map