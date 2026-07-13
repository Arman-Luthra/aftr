// index.js — Headless AE simulator entry point.
//
// This process acts as a DROP-IN REPLACEMENT for the real CEP panel:
//   - Connects as a WebSocket CLIENT to the controller at /bridge
//   - Receives command envelopes
//   - Runs them through the REAL bundled JSX code against a mock AE DOM
//   - Returns result envelopes
//   - Emits a "ready" event on connect
//
// The controller cannot tell the difference between this and a real AE panel.
// This is how we validate M0/M3/M4 without After Effects.

import WebSocket from 'ws';
import { loadConfig } from '../../shared/src/config.js';
import { createJsxRunner } from './jsxRunner.js';
import { simulateRender } from './render.js';

const cfg = loadConfig();
const runner = createJsxRunner();

let ws = null;
let reconnectDelay = cfg.reconnect.initialDelayMs;

function log(level, msg) {
  const ts = new Date().toISOString();
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(`${ts} [${level.toUpperCase()}] simulator: ${msg}`);
}

function connect() {
  log('info', `Connecting to controller at ${cfg.wsUrl}…`);

  ws = new WebSocket(cfg.wsUrl);

  ws.on('open', () => {
    reconnectDelay = cfg.reconnect.initialDelayMs;
    log('info', 'Connected to controller');

    // Emit a "ready" event — identical to what the real panel sends.
    sendEnvelope({
      type: 'event',
      event: 'ready',
      data: {
        ae: runner.dom.app.version + ' (simulator)',
        project: 'Untitled',
      },
    });

    log('info', `Commands available: ${runner.commandNames.join(', ')}`);
  });

  ws.on('message', (data) => {
    handleMessage(data.toString());
  });

  ws.on('close', (code, reason) => {
    const why = reason?.toString?.() || '';
    log('info', `Disconnected (code ${code})${why ? ': ' + why : ''}`);
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    log('warn', `Socket error: ${err.message}`);
    // onclose will handle reconnect.
  });
}

function scheduleReconnect() {
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * cfg.reconnect.factor, cfg.reconnect.maxDelayMs);
  log('info', `Reconnecting in ${Math.round(delay)}ms…`);
  setTimeout(connect, delay);
}

function handleMessage(raw) {
  let env;
  try {
    env = JSON.parse(raw);
  } catch (e) {
    log('warn', `Bad JSON from controller: ${raw}`);
    return;
  }

  if (env.type !== 'command') {
    log('debug', `Ignoring non-command envelope: ${env.type}`);
    return;
  }

  log('info', `← ${env.command}` + (env.params ? ' ' + JSON.stringify(env.params) : ''));

  // render is special: non-blocking, driven by the Node layer (here, simulated),
  // not by synchronous JSX dispatch. It responds immediately + streams events.
  if (env.command === 'render') {
    simulateRender(env, runner, sendEnvelope, sendEvent, log);
    return;
  }
  // keystroke is panel-side (OS injection); the simulator just acknowledges it.
  if (env.command === 'keystroke') {
    sendEnvelope({ id: env.id, type: 'result', ok: true, result: { simulated: true, params: env.params || {} } });
    return;
  }
  // listPlugins is panel-side (Node fs); the simulator returns a canned result.
  if (env.command === 'listPlugins') {
    sendEnvelope({
      id: env.id, type: 'result', ok: true,
      result: { count: 2, plugins: [{ name: 'Saber', path: '(sim)/Plug-ins/Saber.aex' }, { name: 'Optical Flares', path: '(sim)/Plug-ins/OpticalFlares.aex' }], bestEffort: true, simulated: true, note: 'simulated' },
    });
    return;
  }

  // Execute through the real JSX dispatch.
  let result;
  try {
    result = runner.dispatch(env.command, env.params || {});
  } catch (e) {
    result = { ok: false, error: `Simulator error: ${e.message}` };
  }

  // Build and send the result envelope.
  const response = {
    id: env.id,
    type: 'result',
    ok: result.ok,
  };
  if (result.ok) {
    response.result = result.result;
  } else {
    response.error = result.error;
  }

  sendEnvelope(response);
  log('info', `→ ${env.command} ${result.ok ? 'ok' : 'ERROR: ' + result.error}`);
}

function sendEnvelope(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendEvent(event, data) {
  sendEnvelope({ type: 'event', event, data: data || {} });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
log('info', 'aftr Simulator starting…');
log('info', `JSX commands loaded: ${runner.commandNames.join(', ')}`);
connect();

// Graceful shutdown
function shutdown(signal) {
  log('info', `Received ${signal}, shutting down…`);
  if (ws) ws.close(1000, 'Simulator shutting down');
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
