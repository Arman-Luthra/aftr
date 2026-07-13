// aeClient.js — tracks the single connected AE panel (the bridge) and provides
// sendCommand(): a Promise, correlated by envelope id, with a timeout, that
// resolves to a uniform result shape. Transport problems (no panel, timeout,
// disconnect) never throw — they resolve to { ok:false, error, code } so every
// caller (REST, agent WS, UI) handles one shape.

import { EventEmitter } from 'node:events';
import {
  buildRequest,
  parseEnvelope,
  serialize,
  ENVELOPE_TYPES,
} from '../../shared/src/protocol.js';
import { validateCommand } from '../../shared/src/commands.js';
import { makeLogger } from './log.js';

const log = makeLogger('aeClient');

export class AeClient extends EventEmitter {
  /**
   * @param {object} opts - { commandTimeoutMs, allowDev }
   */
  constructor(opts = {}) {
    super();
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 30000;
    this.allowDev = !!opts.allowDev;
    /** @type {import('ws').WebSocket|null} */
    this._ws = null;
    this._pending = new Map(); // id -> { resolve, timer, command, sentAt }
    this._status = {
      connected: false,
      ae: null,
      project: null,
      since: null,
      remote: null,
    };
  }

  get status() {
    return { ...this._status, pending: this._pending.size };
  }

  isConnected() {
    return this._ws !== null && this._ws.readyState === 1; // OPEN
  }

  /**
   * Register a freshly connected panel socket as the active AE client.
   * If one is already connected, the old one is dropped (single-AE assumption).
   */
  attach(ws, meta = {}) {
    if (this._ws && this._ws !== ws) {
      log.warn('A new panel connected; replacing the previous one.');
      try {
        this._ws.close(4000, 'Replaced by a newer panel connection');
      } catch {
        /* ignore */
      }
      this._failAllPending('Panel replaced by a new connection', 'REPLACED');
    }

    this._ws = ws;
    this._status = {
      connected: true,
      ae: null,
      project: null,
      since: new Date().toISOString(),
      remote: meta.remote ?? null,
    };
    log.info(`Panel connected${meta.remote ? ' from ' + meta.remote : ''}`);

    ws.on('message', (data) => this._onMessage(data));
    ws.on('close', (code, reason) => this._onClose(ws, code, reason));
    ws.on('error', (err) => log.warn(`Panel socket error: ${err.message}`));

    this.emit('status', this.status);
  }

  _onClose(ws, code, reason) {
    if (ws !== this._ws) return; // a replaced/stale socket closing
    this._ws = null;
    this._status = { ...this._status, connected: false };
    const why = reason?.toString?.() || '';
    log.info(`Panel disconnected (code ${code})${why ? ': ' + why : ''}`);
    this._failAllPending('Panel disconnected before responding', 'DISCONNECTED');
    this.emit('status', this.status);
  }

  _failAllPending(message, code) {
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: message, code, id, command: entry.command });
    }
    this._pending.clear();
  }

  _onMessage(data) {
    const raw = data.toString();
    const parsed = parseEnvelope(raw);
    if (!parsed.ok) {
      log.warn(`Dropping malformed message from panel: ${parsed.error}`);
      return;
    }
    const env = parsed.envelope;

    if (env.type === ENVELOPE_TYPES.RESULT) {
      const entry = this._pending.get(env.id);
      if (!entry) {
        log.debug(`Result for unknown/expired id ${env.id} (late or duplicate)`);
        return;
      }
      clearTimeout(entry.timer);
      this._pending.delete(env.id);
      entry.resolve(
        env.ok
          ? { ok: true, result: env.result, id: env.id, command: entry.command }
          : { ok: false, error: env.error, id: env.id, command: entry.command },
      );
      return;
    }

    if (env.type === ENVELOPE_TYPES.EVENT) {
      // Capture lifecycle info from the panel for /api/status.
      if (env.event === 'ready' && env.data) {
        this._status = {
          ...this._status,
          ae: env.data.ae ?? this._status.ae,
          project: env.data.project ?? this._status.project,
        };
        this.emit('status', this.status);
      }
      this.emit('event', env);
      return;
    }

    log.debug(`Ignoring unexpected ${env.type} envelope from panel`);
  }

  /**
   * Send a command to the panel. Always resolves (never rejects) to one of:
   *   { ok:true, result }                     // AE executed
   *   { ok:false, error, code? }              // validation / transport / AE error
   * @param {string} command
   * @param {object} params
   * @param {object} opts - { timeoutMs, allowDev }
   */
  sendCommand(command, params = {}, opts = {}) {
    const allowDev = opts.allowDev ?? this.allowDev;
    const check = validateCommand(command, params, { allowDev });
    if (!check.ok) {
      return Promise.resolve({ ok: false, error: check.error, code: 'INVALID' });
    }

    if (!this.isConnected()) {
      return Promise.resolve({
        ok: false,
        error: 'No AE panel connected to the controller',
        code: 'NO_PANEL',
      });
    }

    const req = buildRequest(command, check.params);
    const timeoutMs = opts.timeoutMs ?? this.commandTimeoutMs;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this._pending.has(req.id)) {
          this._pending.delete(req.id);
          resolve({
            ok: false,
            error: `Command "${command}" timed out after ${timeoutMs}ms`,
            code: 'TIMEOUT',
            id: req.id,
          });
        }
      }, timeoutMs);
      // Don't let a pending timer keep the process alive on shutdown.
      if (typeof timer.unref === 'function') timer.unref();

      this._pending.set(req.id, { resolve, timer, command, sentAt: Date.now() });

      try {
        this._ws.send(serialize(req));
      } catch (e) {
        clearTimeout(timer);
        this._pending.delete(req.id);
        resolve({
          ok: false,
          error: `Failed to send to panel: ${e.message}`,
          code: 'SEND_FAILED',
        });
      }
    });
  }
}
