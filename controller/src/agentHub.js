// agentHub.js — manages programmatic clients and the web UI. They connect over
// WebSocket (the agent path), send command envelopes, and receive results plus
// a live broadcast of every panel event and connection-status change.
//
// This is the "swappable front end" surface: an automated agent and the bundled
// UI are just two clients of the same protocol.

import { EventEmitter } from 'node:events';
import { parseEnvelope, serialize, newId } from '../../shared/src/protocol.js';
import { makeLogger } from './log.js';

const log = makeLogger('agentHub');

export class AgentHub extends EventEmitter {
  /**
   * @param {import('./aeClient.js').AeClient} aeClient
   * @param {object} opts - { allowDev }
   */
  constructor(aeClient, opts = {}) {
    super();
    this.aeClient = aeClient;
    this.allowDev = !!opts.allowDev;
    this._clients = new Set();

    // Fan panel events + status changes out to every connected agent/UI.
    aeClient.on('event', (env) => this.broadcast(env));
    aeClient.on('status', (status) =>
      this.broadcast({ type: 'status', data: status }),
    );
  }

  add(ws, meta = {}) {
    this._clients.add(ws);
    log.info(`Agent/UI client connected (${this._clients.size} total)`);

    // Greet with a snapshot so the UI can render immediately.
    this._sendTo(ws, { type: 'status', data: this.aeClient.status });

    ws.on('message', (data) => this._onMessage(ws, data));
    ws.on('close', () => {
      this._clients.delete(ws);
      log.info(`Agent/UI client disconnected (${this._clients.size} total)`);
    });
    ws.on('error', (err) => log.debug(`Agent socket error: ${err.message}`));
  }

  async _onMessage(ws, data) {
    const parsed = parseEnvelope(data.toString());
    if (!parsed.ok) {
      this._sendTo(ws, {
        type: 'result',
        ok: false,
        error: `Bad envelope: ${parsed.error}`,
        code: 'BAD_ENVELOPE',
      });
      return;
    }
    const env = parsed.envelope;

    if (env.type !== 'command') {
      // Agents may only issue commands; ignore other inbound types quietly.
      log.debug(`Ignoring inbound ${env.type} from agent`);
      return;
    }

    const id = env.id ?? newId('agent');
    const result = await this.aeClient.sendCommand(env.command, env.params, {
      allowDev: this.allowDev,
    });
    // Reply with the AGENT'S id (result carries aeClient's internal id, so it
    // must not override — place id AFTER the spread).
    this._sendTo(ws, { type: 'result', command: env.command, ...result, id });
  }

  broadcast(envelope) {
    const msg = serialize(envelope);
    for (const ws of this._clients) {
      if (ws.readyState === 1) {
        try {
          ws.send(msg);
        } catch (e) {
          log.debug(`broadcast send failed: ${e.message}`);
        }
      }
    }
  }

  _sendTo(ws, envelope) {
    if (ws.readyState === 1) {
      try {
        ws.send(serialize(envelope));
      } catch (e) {
        log.debug(`send failed: ${e.message}`);
      }
    }
  }

  get clientCount() {
    return this._clients.size;
  }
}
