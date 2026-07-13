// mcp.test.js — the MCP server starts, handshakes, and lists tools over stdio.
//
// Spawns controller/src/mcp.js and speaks JSON-RPC to it. This does NOT need the
// controller or AE running — tools/list is derived from the static command
// registry — so it is CI-safe. (Live tool calls are exercised against a real
// controller + AE panel during bring-up.)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(__dirname, '..', 'src', 'mcp.js');

describe('MCP server (stdio)', () => {
  let child;
  let buf = '';
  const pending = new Map();
  let nextId = 1;

  function rpc(method, params) {
    const id = nextId++;
    return new Promise((res, rej) => {
      pending.set(id, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      setTimeout(() => rej(new Error(`timeout waiting for ${method}`)), 8000).unref();
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  before(() => {
    child = spawn(process.execPath, [MCP], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, AE_MCP_TOOLS: 'core' },
    });
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      }
    });
  });

  after(() => { if (child) child.kill(); });

  it('initializes and identifies as aftr with a tools capability', async () => {
    const init = await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    assert.ok(init.result, 'initialize returned a result');
    assert.equal(init.result.serverInfo.name, 'aftr');
    assert.ok(init.result.capabilities.tools, 'advertises tools capability');
    notify('notifications/initialized', {});
  });

  it('lists namespaced tools incl. meta + core commands', async () => {
    const list = await rpc('tools/list', {});
    const names = list.result.tools.map((t) => t.name);
    for (const n of ['ae_status', 'ae_command', 'ae_list_commands', 'ae_createComp', 'ae_deepGlow']) {
      assert.ok(names.includes(n), `${n} present`);
    }
    assert.ok(names.every((n) => n.startsWith('ae_')), 'all tools namespaced ae_*');
    assert.ok(list.result.tools.length >= 20, `expected >=20 tools, got ${list.result.tools.length}`);
  });
});
