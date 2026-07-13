// server.js — the controller process.
//
// Hosts:
//   - a WebSocket server with two paths:
//       /bridge  -> the AE panel (the bridge) connects here as a client
//       /agent   -> programmatic clients + the web UI connect here
//   - a REST surface (/api/*, POST /command) that internally calls sendCommand
//   - the static interactive UI at /
//
// Topology note: the controller is the SERVER; the panel dials OUT to it. In
// cloud, only the panel's target URL changes — this process is unmodified.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';

import { loadConfig } from '../../shared/src/config.js';
import { commandList } from '../../shared/src/commands.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AeClient } from './aeClient.js';
import { AgentHub } from './agentHub.js';
import { mountMedia } from './media.js';
import { createAeMcpServer } from './mcpServer.js';
import { makeLogger } from './log.js';

const log = makeLogger('server');
const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();

const aeClient = new AeClient({
  commandTimeoutMs: cfg.commandTimeoutMs,
  allowDev: cfg.allowDev,
});
const agentHub = new AgentHub(aeClient, { allowDev: cfg.allowDev });

// Recent panel events ring buffer (lifecycle/log/progress) for debugging.
const recentEvents = [];
aeClient.on('event', (env) => {
  recentEvents.push({ at: new Date().toISOString(), ...env });
  if (recentEvents.length > 100) recentEvents.shift();
});

// ---------------------------------------------------------------------------
// HTTP / REST
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/status', (_req, res) =>
  res.json({
    ok: true,
    status: aeClient.status,
    agents: agentHub.clientCount,
    config: { wsUrl: cfg.wsUrl, allowDev: cfg.allowDev, commandTimeoutMs: cfg.commandTimeoutMs },
  }),
);

app.get('/api/commands', (_req, res) =>
  res.json({ ok: true, commands: commandList({ includeDev: cfg.allowDev }) }),
);

app.get('/api/events', (_req, res) =>
  res.json({ ok: true, events: recentEvents }),
);

// Shared-secret gate (only enforced when cfg.token is set — for remote hosting).
function requireToken(req, res, next) {
  if (!cfg.token) return next();
  const h = req.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (tok === cfg.token) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized — supply Authorization: Bearer <token> or ?token=' });
}

// Video in / video out + studio page (for remote hosting).
const media = mountMedia(app, { aeClient, cfg });

// ---------------------------------------------------------------------------
// MCP over HTTP (Streamable HTTP, stateless) at POST /mcp — the pluggable URL
// remote MCP clients connect to. Same tool surface as the stdio server, but
// this backend talks to aeClient + media directly (no extra hop).
// ---------------------------------------------------------------------------
const mcpBackend = {
  execute: (command, params) => aeClient.sendCommand(command, params || {}, { allowDev: cfg.allowDev }),
  status: async () => ({ ok: true, status: aeClient.status, agents: agentHub.clientCount, config: { allowDev: cfg.allowDev, commandTimeoutMs: cfg.commandTimeoutMs } }),
  mediaInfo: async () => media.info(),
  mediaList: async () => media.list(),
  mediaFetch: async (args) => media.fetchVideo(args),
  mediaRender: async (args) => { const r = await media.render(args); delete r.httpStatus; return r; },
  renderResult: async (jobId) => media.renderResult(jobId),
};
app.post('/mcp', requireToken, async (req, res) => {
  try {
    const server = createAeMcpServer({ mode: process.env.AE_MCP_TOOLS || 'core', allowDev: cfg.allowDev, backend: mcpBackend });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    log.error('MCP /mcp request failed', e.message);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null });
  }
});
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'MCP endpoint — use POST (stateless Streamable HTTP).' }));

// Convenience REST endpoint: POST /command { command, params } -> result.
app.post('/command', requireToken, async (req, res) => {
  const { command, params } = req.body || {};
  if (typeof command !== 'string') {
    return res.status(400).json({ ok: false, error: 'body.command (string) is required' });
  }
  const result = await aeClient.sendCommand(command, params || {}, { allowDev: cfg.allowDev });
  // Map transport-level failures to 5xx/409 so REST clients can react; AE-level
  // ok:false (validation/host error) returns 200 with the result body.
  if (!result.ok && result.code === 'NO_PANEL') return res.status(409).json(result);
  return res.json(result);
});

// Static interactive UI.
app.use('/', express.static(resolve(__dirname, '..', 'ui')));

// ---------------------------------------------------------------------------
// WebSocket — path-routed: /bridge (panel) vs /agent (clients/UI)
// ---------------------------------------------------------------------------
const httpServer = http.createServer(app);
const wssPanel = new WebSocketServer({ noServer: true });
const wssAgent = new WebSocketServer({ noServer: true });

wssPanel.on('connection', (ws, req) => {
  aeClient.attach(ws, { remote: req.socket.remoteAddress });
});
wssAgent.on('connection', (ws) => {
  agentHub.add(ws);
});

// WebSocket auth for /bridge + /agent. When a token is configured, a connection
// must present it (?token= or Authorization: Bearer) — EXCEPT a direct loopback
// connection with no proxy headers, which is the local AE panel (so it keeps
// working without a redeploy). Anything arriving through a tunnel carries
// x-forwarded-* and therefore must authenticate. Closes the fake-panel hole.
function wsAuthOk(req, url) {
  if (!cfg.token) return true;
  const tok = url.searchParams.get('token')
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (tok === cfg.token) return true;
  const viaProxy = req.headers['x-forwarded-for'] || req.headers['x-forwarded-proto'] || req.headers['x-forwarded-host'];
  const remote = req.socket.remoteAddress || '';
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  return !viaProxy && loopback;
}

httpServer.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    socket.destroy();
    return;
  }
  const pathname = url.pathname;
  if (pathname !== cfg.wsPath && pathname !== cfg.agentPath) {
    socket.destroy();
    return;
  }
  if (!wsAuthOk(req, url)) {
    log.warn(`Rejected unauthorized WS upgrade to ${pathname} from ${req.socket.remoteAddress}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  if (pathname === cfg.wsPath) {
    wssPanel.handleUpgrade(req, socket, head, (ws) => wssPanel.emit('connection', ws, req));
  } else {
    wssAgent.handleUpgrade(req, socket, head, (ws) => wssAgent.emit('connection', ws, req));
  }
});

httpServer.listen(cfg.port, cfg.host, () => {
  log.info(`Controller listening on http://${cfg.host}:${cfg.port}`);
  log.info(`  UI:          http://${cfg.host}:${cfg.port}/`);
  log.info(`  Panel WS:    ${cfg.wsUrl}   (the AE panel dials this)`);
  log.info(`  Agent WS:    ${cfg.agentUrl}`);
  log.info(`  REST:        POST http://${cfg.host}:${cfg.port}/command`);
  log.info(`  MCP (HTTP):  POST http://${cfg.host}:${cfg.port}/mcp   (pluggable MCP URL)`);
  log.info(`  Studio:      http://${cfg.host}:${cfg.port}/studio   (send/receive video)`);
  log.info(`  Media:       POST /media/upload · GET /media/list · GET /media/file/:name · POST /media/render`);
  if (cfg.host === '0.0.0.0') log.info('  Bound to 0.0.0.0 — reachable on your LAN / via a tunnel.');
  if (cfg.token) log.info('  Auth: ON (token required on /command + /media/*).');
  else if (cfg.host === '0.0.0.0') log.warn('  Auth: OFF but bound publicly — set AE_BRIDGE_TOKEN before exposing to the internet.');
  if (cfg.allowDev) log.warn('DEV MODE: runJSX and dev commands are ENABLED.');
});

// Graceful shutdown so timers/sockets don't dangle in tests or Ctrl-C.
function shutdown(signal) {
  log.info(`Received ${signal}, shutting down...`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { app, httpServer, aeClient, agentHub, cfg };
