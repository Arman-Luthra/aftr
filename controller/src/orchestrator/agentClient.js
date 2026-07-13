// agentClient.js — a WebSocket client of the controller's /agent endpoint.
// The orchestrator drives After Effects purely through this (the bridge is a
// swappable front end: the orchestrator is "just another agent").

import WebSocket from 'ws';
import { loadConfig } from '../../../shared/src/config.js';

export class AgentClient {
  constructor(url) {
    const cfg = loadConfig();
    this.url = url || cfg.agentUrl;
    this.ws = null;
    this._pending = new Map();
    this._id = 0;
    this._eventHandlers = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => this._onMessage(data));
    });
  }

  onEvent(fn) { this._eventHandlers.push(fn); }

  _onMessage(data) {
    let env;
    try { env = JSON.parse(data.toString()); } catch { return; }
    if (env.type === 'result' && env.id != null && this._pending.has(env.id)) {
      const { resolve } = this._pending.get(env.id);
      this._pending.delete(env.id);
      resolve(env);
    } else if (env.type === 'event') {
      for (const fn of this._eventHandlers) fn(env);
    }
  }

  // Send a command; resolves to { ok, result|error }.
  sendCommand(command, params = {}, timeoutMs = 60000) {
    const id = `orch_${++this._id}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          resolve({ ok: false, error: `orchestrator: command "${command}" timed out` });
        }
      }, timeoutMs);
      timer.unref?.();
      this._pending.set(id, { resolve: (env) => { clearTimeout(timer); resolve(env); } });
      this.ws.send(JSON.stringify({ id, type: 'command', command, params }));
    });
  }

  // Convenience: throw on failure.
  async must(command, params, timeoutMs) {
    const r = await this.sendCommand(command, params, timeoutMs);
    if (!r.ok) throw new Error(`${command} failed: ${r.error}`);
    return r.result;
  }

  close() { try { this.ws?.close(); } catch { /* ignore */ } }
}
