#!/usr/bin/env node
// mcp.js — aftr as a STDIO MCP server.
//
// A thin adapter: forwards each tool call to the controller's REST surface
// (POST /command, /media/*). Keeping it a client (not embedding the controller)
// means stdout stays a clean JSON-RPC channel. The tool surface itself lives in
// mcpServer.js, shared with the controller's HTTP /mcp endpoint.
//
// Usage from an MCP client (Claude Desktop / Claude Code):
//   1. start the bridge:    npm run controller   (and open the AE panel)
//   2. point the client at: node controller/src/mcp.js
//
// Env: AE_BRIDGE_URL (default http://127.0.0.1:8787), AE_BRIDGE_TOKEN,
//      AE_MCP_TOOLS (core|all), AE_BRIDGE_ALLOW_DEV=1.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAeMcpServer } from './mcpServer.js';

const BASE = (process.env.AE_BRIDGE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const TOKEN = process.env.AE_BRIDGE_TOKEN || null;
const ALLOW_DEV = process.env.AE_BRIDGE_ALLOW_DEV === '1';
const MODE = (process.env.AE_MCP_TOOLS || 'core').toLowerCase();
const authHeaders = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};
const absUrl = (p) => (p && p.startsWith('/') ? BASE + p : p);

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: authHeaders });
  return r.json();
}

// Backend: forward everything to the controller over HTTP.
const backend = {
  execute: (command, params) => post('/command', { command, params }),
  status: () => get('/api/status'),
  mediaInfo: async () => {
    const tq = TOKEN ? '?token=YOUR_TOKEN' : '';
    const amp = TOKEN ? '&token=YOUR_TOKEN' : '';
    return {
      ok: true,
      studio: `${BASE}/studio${tq}`,
      upload: {
        url: `${BASE}/media/upload?name=clip.mp4${amp}`,
        method: 'POST',
        body: 'raw video bytes (Content-Type: application/octet-stream)',
        curl: `curl -X POST --data-binary @clip.mp4 -H "Content-Type: application/octet-stream" "${BASE}/media/upload?name=clip.mp4${amp}"`,
      },
      list: `${BASE}/media/list${tq}`,
      download: `${BASE}/media/file/<name>${tq}`,
      note: 'Uploaded files land on the host; import them with importFootage (path is in the upload response), build/animate, then ae_render_and_download.',
    };
  },
  mediaList: async () => {
    const r = await get('/media/list');
    if (r && r.ok) for (const f of [...(r.incoming || []), ...(r.outputs || [])]) f.url = absUrl(f.url);
    return r;
  },
  mediaFetch: async (args) => {
    const r = await post('/media/fetch', args);
    if (r && r.url) r.url = absUrl(r.url);
    return r;
  },
  mediaRender: async (args) => {
    const r = await post('/media/render', args);
    if (r && r.downloadUrl) r.downloadUrl = absUrl(r.downloadUrl);
    return r;
  },
  renderResult: async (jobId) => {
    const r = await get('/media/render/' + encodeURIComponent(jobId));
    if (r && r.downloadUrl) r.downloadUrl = absUrl(r.downloadUrl);
    return r;
  },
  errorHint: (e) => `aftr controller unreachable at ${BASE} — start it with "npm run controller" and open the AE panel. (${e.message})`,
};

const server = createAeMcpServer({ mode: MODE, allowDev: ALLOW_DEV, backend });
await server.connect(new StdioServerTransport());
console.error(`[aftr-mcp] ready (stdio, ${MODE}), forwarding to ${BASE}`);
