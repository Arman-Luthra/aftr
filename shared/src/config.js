// config.js — Node-only config loader. Reads the repo-root config.json and
// applies environment overrides. Kept out of the package barrel (it uses fs)
// so non-Node consumers never pull it in. Import via '@aftr/shared/config'.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// shared/src -> repo root is two levels up.
const ROOT = resolve(__dirname, '..', '..');

let _cache = null;

export function loadConfig() {
  if (_cache) return _cache;
  const path = resolve(ROOT, 'config.json');
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to read config.json at ${path}: ${e.message}`);
  }
  const cfg = {
    host: process.env.AE_BRIDGE_HOST || raw.host || '127.0.0.1',
    port: Number(process.env.AE_BRIDGE_PORT || raw.port || 8787),
    wsPath: raw.wsPath || '/bridge',
    agentPath: raw.agentPath || '/agent',
    httpPath: raw.httpPath || '/',
    commandTimeoutMs: Number(
      process.env.AE_BRIDGE_TIMEOUT_MS || raw.commandTimeoutMs || 30000,
    ),
    allowDev: process.env.AE_BRIDGE_ALLOW_DEV === '1' || raw.allowDev === true,
    // Optional shared-secret for remote hosting. When set, the media + command
    // REST routes require it (Bearer header or ?token=). Leave null for local.
    token: process.env.AE_BRIDGE_TOKEN || raw.token || null,
    // Public base URL when hosted behind a tunnel (e.g. https://x.trycloudflare.com).
    // Used to hand out absolute, clickable media/download links. Null = relative.
    publicUrl: process.env.AE_BRIDGE_PUBLIC_URL || raw.publicUrl || null,
    // How long a synchronous render call waits before handing back a jobId to
    // poll (keep under MCP clients' ~180s call timeout). 0 = wait indefinitely.
    renderWaitMs: Number(process.env.AE_BRIDGE_RENDER_WAIT_MS || raw.renderWaitMs || 150000),
    // ffmpeg for transcoding renders to web-friendly H.264 .mp4 (null = auto-detect).
    ffmpeg: process.env.AE_BRIDGE_FFMPEG || raw.ffmpeg || null,
    reconnect: {
      initialDelayMs: raw.reconnect?.initialDelayMs ?? 500,
      maxDelayMs: raw.reconnect?.maxDelayMs ?? 10000,
      factor: raw.reconnect?.factor ?? 1.8,
    },
    root: ROOT,
  };
  cfg.wsUrl = `ws://${cfg.host}:${cfg.port}${cfg.wsPath}`;
  cfg.agentUrl = `ws://${cfg.host}:${cfg.port}${cfg.agentPath}`;
  _cache = cfg;
  return cfg;
}
