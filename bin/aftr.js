#!/usr/bin/env node
// aftr CLI: launch the controller, the MCP server, or the headless simulator.
// Usage: aftr [controller|mcp|sim] [args...]   (defaults to controller)

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGETS = {
  controller: 'controller/src/server.js',
  mcp: 'controller/src/mcp.js',
  sim: 'simulator/src/index.js',
  simulator: 'simulator/src/index.js',
};

const cmd = process.argv[2] ?? 'controller';
const rest = process.argv.slice(3);

if (cmd === '-h' || cmd === '--help' || !TARGETS[cmd]) {
  const unknown = cmd && !TARGETS[cmd] && cmd !== '-h' && cmd !== '--help';
  const out = unknown ? console.error : console.log;
  out(`aftr <command>

  controller   start the controller: WS server, REST, and web UI   [default]
  mcp          start the stdio MCP server (for Claude Code / Desktop)
  sim          start the headless After Effects simulator

Docs: https://github.com/Arman-Luthra/aftr`);
  process.exit(unknown ? 1 : 0);
}

const child = spawn(process.execPath, [resolve(ROOT, TARGETS[cmd]), ...rest], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
