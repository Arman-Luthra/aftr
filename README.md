<div align="center">

<img src="docs/hero.png" alt="aftr" width="880" />

# aftr

### Puppeteer for After Effects

Use After Effects with Claude Code to make production-ready videos.

[![CI](https://github.com/Arman-Luthra/aftr/actions/workflows/ci.yml/badge.svg)](https://github.com/Arman-Luthra/aftr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
[![npm](https://img.shields.io/npm/v/aftr.svg)](https://www.npmjs.com/package/aftr)
[![PyPI](https://img.shields.io/pypi/v/aftr.svg)](https://pypi.org/project/aftr/)
[![Docker](https://img.shields.io/badge/ghcr.io-aftr-2496ED?logo=docker&logoColor=white)](https://github.com/Arman-Luthra/aftr/pkgs/container/aftr)

</div>

A Node controller sends JSON commands over a WebSocket to a CEP panel inside AE, which runs them as ExtendScript and returns JSON. On top sits an autonomous, spec-driven pipeline that builds clips and self-corrects them by rendering, reviewing, and revising. Everything is driven programmatically over the socket, with no manual After Effects work.

---

## Install

| Method | Command |
|---|---|
| npm (global CLI) | `npm install -g aftr`, then `aftr controller` |
| npx (no install) | `npx aftr controller` |
| pip (Python launcher) | `pip install aftr`, then `aftr controller` (needs Node 18+) |
| Docker | `docker run --rm -p 8787:8787 ghcr.io/arman-luthra/aftr` |
| From source | clone this repo (below) |

The npm, npx, and Docker paths run the controller, MCP server (`aftr mcp`), and simulator (`aftr sim`). Deploying the CEP panel into After Effects is done from a clone (`npm run deploy:panel`), since it self-signs and installs the extension. The pip package is a thin launcher that forwards to the npm CLI through `npx`.

---

## Get started in 60 seconds

```bash
git clone https://github.com/Arman-Luthra/aftr.git
cd aftr
npm install

# 1) prove it's healthy with NO After Effects (headless simulator + tests)
npm run build:jsx && npm test

# 2) install the panel into AE (self-signs + deploys on Windows and macOS)
npm run deploy:panel        # then quit and relaunch AE, Window > Extensions > aftr

# 3) start the bridge + open the UI
npm run controller          # http://127.0.0.1:8787
```

Then drive it from the UI, REST, WebSocket, or as a library:

```bash
node examples/flaming-title.mjs "ON FIRE"
```

Requires After Effects 2024 to 2026, Node 18+, and `ffmpeg` on your `PATH`. Full Windows and macOS setup is in [section 4](#4-full-setup-with-real-after-effects).

---

## Use After Effects with Claude Code

Every command is exposed as an MCP tool, so Claude Code drives a live After Effects by calling tools. The loop is three steps.

1. Start the bridge and open the panel in AE:
   ```bash
   npm run controller          # http://127.0.0.1:8787
   # in AE: Window > Extensions > aftr  (the status dot turns green)
   ```
2. Register aftr as an MCP server in Claude Code:
   ```bash
   claude mcp add aftr -- node /ABSOLUTE/PATH/aftr/controller/src/mcp.js
   ```
3. Ask in plain language. Claude Code calls `ae_status` first, then builds and renders:
   > Create a 1080p 5-second comp, add a centered title "LAUNCH" with fire behind it, animate it with blurFade, then render it to mp4.

Claude Code reads the full command set with `ae_list_commands` and can run anything through `ae_command`. The tool catalog and remote-hosting setup (drive a teammate's AE over a tunnel) are in [section 6](#6-driving-the-bridge).

---

## Features

| Capability | What it does |
|---|---|
| ~100 commands | Comps, layers, keyframes with easing, expressions, effects (by matchName or display name, including deeply nested params and third-party plugins), masks, layer styles, text animators, render. |
| Discovery | `listFonts`, `listInstalledEffects` (returns matchNames), `findEffectMatchName`, `listPlugins`, `getEnvironment`. Find what's installed instead of guessing. |
| One-call VFX | `fireEffect`, `smokeEffect`, `glitchEffect`, `neonGlow`, `cinematicGrade`, and a friendly `applyLumetri` grade. |
| Text animation | Four Animate-panel presets (`wordReveal`, `charScale`, `bunchRotate`, `blurFade`) plus a full range-selector builder. |
| Autonomous pipeline | Declarative segment specs realize, render, get a visual review, take a structured delta, re-render, and concat. It self-corrects. |
| MCP server | Drive AE from Claude Desktop, Claude Code, or any MCP client. Every command is a tool (`npm run mcp`). |
| Fast and batched | `batch` runs N edits in one round-trip and one undo (sub-200 ms for 20 ops). Non-blocking `aerender` streams progress events, with a parallel render engine. |
| Testable without AE | A headless simulator runs the real JSX against a mock DOM. 96 tests plus e2e, CI on Node 18, 20, and 22. |
| Cross-platform | Windows and macOS, one-command sign and deploy. |

---

## How it works

```
┌──────────────────────────────────────────────┐
│  Controller (Node + ws + Express + web UI)     │  <- you / the UI / an agent drive this
│   • hosts a WebSocket server (panel + agents)  │
│   • REST surface + interactive UI              │
│   • the HLD orchestrator (agentic loop)        │
└───────────────┬────────────────────────────────┘
                │  WebSocket (JSON request/response/event envelopes)
┌───────────────▼────────────────────────────────┐
│  CEP panel (inside After Effects)               │  ┐
│   • WebSocket CLIENT, dials the controller      │  │  build once,
│   • routes commands to the JSX dispatch layer   │  │  identical on Win & Mac
│   • spawns aerender for non-blocking renders    │  │
└───────────────┬────────────────────────────────┘  │
                │  evalScript (string in / JSON string out)
┌───────────────▼────────────────────────────────┐  │
│  JSX command layer (host.jsx + commands/*.jsx)  │  │
│   • dispatch(command, paramsJson) -> JSON       │  │
│   • ~90 commands: layers, keyframes, effects,   │  │
│     text animators, masks, VFX presets, render  │  │
└───────────────┬────────────────────────────────┘  ┘
                │  AE scripting DOM (app.project, comps, layers)
┌───────────────▼────────────────────────────────┐
│  After Effects                                  │
└──────────────────────────────────────────────────┘
```

---

## Table of contents

1. [What you can do with it](#1-what-you-can-do-with-it)
2. [Prerequisites](#2-prerequisites)
3. [Quick start, no AE needed (the simulator)](#3-quick-start-no-ae-needed-the-simulator)
4. [Full setup with real After Effects](#4-full-setup-with-real-after-effects)
   - [Windows](#41-windows)
   - [macOS](#42-macos)
5. [Run order](#5-run-order)
6. [Driving the bridge](#6-driving-the-bridge)
7. [Command vocabulary](#7-command-vocabulary)
8. [VFX and text presets](#8-vfx-and-text-presets)
9. [The orchestrator (autonomous pipeline)](#9-the-orchestrator-autonomous-pipeline)
10. [Configuration](#10-configuration)
11. [Dev workflow (hot reload + signing)](#11-dev-workflow-hot-reload--signing)
12. [Architecture](#12-architecture)
13. [Project structure](#13-project-structure)
14. [Testing](#14-testing)
15. [Troubleshooting](#15-troubleshooting)
16. [Cross-platform notes](#16-cross-platform-notes)

---

## 1. What you can do with it

Control AE from code: create comps and layers (solids, text, shapes, nulls, cameras, lights, adjustment, footage), set any transform or effect property, add keyframes with easing, write expressions, and parent, trim, move, or duplicate layers, all over a socket.

Add any effect by matchName and drive any of its parameters, even deeply nested ones, animated via keyframes or expressions.

Animate text with four ready-made Animate-panel styles (`wordReveal`, `charScale`, `bunchRotate`, `blurFade`) plus a full text-animator builder (Based On, Shape, Ease High to Low, keyframed Offset and Start).

Reach for one-call VFX presets: `fireEffect` (realistic fire), `smokeEffect`, `glitchEffect`, `neonGlow`, `cinematicGrade`, and a friendly `applyLumetri` grade.

Batch and introspect: run many edits in one round-trip and one undo (`batch`), then read back layer or comp state (`getLayerDetails`, `getProperty`).

Render without blocking: `render` spawns `aerender` and streams `progress` and `renderComplete` events, so AE stays responsive.

Run the autonomous pipeline: describe a video as JSON segments, and the orchestrator realizes each one (`applySpec`), renders it scoped, reviews it visually, applies a structured spec delta if it's wrong, re-renders until it passes, then concatenates the result with FFmpeg.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Adobe After Effects | 2024 (24.x), 2025 (25.x), or 2026 (26.x). Licensed and activated. Record your exact version. |
| Node.js 18+ | The controller, simulator, and build scripts are Node (ESM). |
| FFmpeg | Needed by the orchestrator's visual reviewer and final concat. `ffmpeg` must be on your `PATH`. |
| Git | To clone and push. |

Check them:

```bash
node --version      # v18+  (v22 recommended)
ffmpeg -version     # any recent build
```

CEP version maps to AE version: AE 2024 uses CEP 11 (`CSXS.11`); AE 2025 and 2026 use CEP 12 (`CSXS.12`). The panel manifest targets `[24.0,99.9]` and a low required runtime, so it loads on all of them.

---

## 3. Quick start, no AE needed (the simulator)

You can validate the entire architecture (controller-to-bridge protocol, command dispatch, render plumbing) without After Effects, using the headless simulator. It is a Node process that speaks the exact same WebSocket protocol as the real panel and runs the real bundled JSX against a mock AE DOM.

```bash
git clone https://github.com/Arman-Luthra/aftr.git
cd aftr
npm install

# build the JSX bundle once
npm run build:jsx

# run the full headless test suite (unit + simulator + JSX dispatch)
npm test

# end-to-end: controller + simulator round-trip, incl. render events
npm run e2e
```

Or run it interactively:

```bash
# terminal 1: controller (WS server + REST + UI on http://127.0.0.1:8787)
npm run controller

# terminal 2: the simulator (pretends to be the AE panel)
npm run sim

# now open http://127.0.0.1:8787 and click commands, or:
curl -X POST http://127.0.0.1:8787/command \
  -H "Content-Type: application/json" \
  -d '{"command":"createComp","params":{"name":"Main","width":1920,"height":1080}}'
```

This is how `M0`, `M3`, and `M4` (architecture, round-trip, vocabulary) are validated with zero AE. The real panel drops in unchanged for `M1`, `M2`, and `M5`.

---

## 4. Full setup with real After Effects

The panel is a CEP extension. On modern AE (2025+), the old trick of enabling unsigned panels via `PlayerDebugMode` is unreliable: AE ignores it and rejects unsigned extensions with "Signature verification failed." The reliable, supported path is to self-sign and install the panel, which this repo automates with one command:

```bash
npm run deploy:panel
```

`deploy:panel` builds the JSX bundle, creates a self-signed dev certificate (cached in `dist/`), signs `panel/` into a `.zxp`, and unpacks the signed extension into your per-user CEP extensions folder.

It works on both Windows and macOS (the [`zxp-sign-cmd`](https://www.npmjs.com/package/zxp-sign-cmd) tool ships the signer for both). After it runs, fully quit and relaunch After Effects, then open Window > Extensions > aftr.

A signed extension is a snapshot. After you edit panel source, re-run `npm run deploy:panel` (and reopen AE) to make it permanent, or use the hot-reload dev loop (see [section 11](#11-dev-workflow-hot-reload--signing)) while iterating.

### 4.1 Windows

```powershell
# from the repo root
npm install
npm run deploy:panel
# then quit AE, relaunch, Window > Extensions > aftr
```

The signed panel installs to:
```
%APPDATA%\Adobe\CEP\extensions\com.ae-bridge.panel
```

You may also set debug mode for remote DevTools, but it is not required once signed:
`reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f` (use `CSXS.11` for AE 2024).

### 4.2 macOS

```bash
# from the repo root
npm install
npm run deploy:panel
# then quit AE, relaunch, Window > Extensions > aftr
```

The signed panel installs to:
```
~/Library/Application Support/Adobe/CEP/extensions/com.ae-bridge.panel
```

macOS specifics:
- If the signer binary is quarantined by Gatekeeper, clear it once:
  `xattr -dr com.apple.quarantine node_modules/zxp-sign-cmd` (path may vary).
- `aerender` lives at the app root: `/Applications/Adobe After Effects <year>/aerender`. The controller and panel auto-detect it. If your install is non-standard, set `AE_BRIDGE_AERENDER` (see [section 10](#10-configuration)).
- Optional debug mode: `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` (use `CSXS.11` for AE 2024). Not required when signed.

---

## 5. Run order

1. Start the controller (hosts the WS server, REST, and UI on a fixed port):
   ```bash
   npm run controller        # http://127.0.0.1:8787
   ```
2. Launch After Effects.
3. Open the panel: Window > Extensions > aftr. It dials the controller and the status dot goes green (`AE v26.x`).
4. Open the UI at <http://127.0.0.1:8787>: buttons per command, a live event log, and a JSON response viewer.

To run an autonomous demo (see [section 9](#9-the-orchestrator-autonomous-pipeline)): `npm run orchestrate`, `npm run orchestrate:fire`, or `npm run showreel`.

---

## 6. Driving the bridge

There are several equivalent ways to send commands, all using the same JSON envelope.

REST (one-shot):
```bash
curl -X POST http://127.0.0.1:8787/command \
  -H "Content-Type: application/json" \
  -d '{"command":"createComp","params":{"name":"Hello","width":1920,"height":1080,"duration":6,"frameRate":30}}'
```

WebSocket (programmatic, for agents): connect to `ws://127.0.0.1:8787/agent`, send
`{"id":"1","type":"command","command":"ping","params":{}}`, and receive
`{"type":"result","id":"1","ok":true,"result":{...}}`. Panel events (ready, log, progress, renderComplete) are broadcast to every connected agent.

The web UI at `/` renders a control per command (with a JSON-params box for the rich ones), a live log, and the last response.

As a library, the bundled agent client makes scripting simple. See [`examples/`](examples/):

```bash
node examples/flaming-title.mjs "ON FIRE"   # build a flaming title programmatically
node examples/animated-text.mjs             # the four text-animation presets in one batch
```

```js
import { AgentClient } from './controller/src/orchestrator/agentClient.js';
const ae = new AgentClient();
await ae.connect();
const { compId } = await ae.must('createComp', { name: 'Hi', width: 1080, height: 1080, duration: 5, frameRate: 30 });
await ae.must('fireEffect', { compId });
await ae.must('addTextLayer', { compId, text: 'ON FIRE', fontSize: 150, justification: 2, position: [540, 300], name: 't' });
await ae.must('applyTextPreset', { compId, layer: 't', preset: 'blurFade' });
```

### As an MCP server

Drive After Effects from any MCP client (Claude Desktop, Claude Code, and others). The MCP server (`controller/src/mcp.js`) is a thin stdio adapter that forwards each tool call to the running controller, so the AE panel, controller, and your project all behave exactly as above; the client just gets tools.

```bash
# 1) start the bridge and open the AE panel (Window > Extensions > aftr)
npm run controller

# 2a) Claude Code: register the MCP server
claude mcp add aftr -- node /ABSOLUTE/PATH/aftr/controller/src/mcp.js
```

```jsonc
// 2b) Claude Desktop: claude_desktop_config.json
{
  "mcpServers": {
    "aftr": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/aftr/controller/src/mcp.js"],
      "env": { "AE_BRIDGE_URL": "http://127.0.0.1:8787", "AE_MCP_TOOLS": "core" }
    }
  }
}
```

The client then sees:
- `ae_status`: is AE connected? (call this first if anything returns `NO_PANEL`)
- `ae_list_commands`: every command and description
- `ae_command`: run any command (`{ command, params }`), the universal escape hatch
- `ae_createComp`, `ae_addTextLayer`, `ae_deepGlow`, `ae_shadowStudio`, `ae_applySpec`, `ae_render`, and other curated per-command tools

| Env | Default | Meaning |
|---|---|---|
| `AE_BRIDGE_URL` | `http://127.0.0.1:8787` | controller to forward to |
| `AE_MCP_TOOLS` | `core` | `core` is the curated set plus meta tools; `all` exposes every registered command as its own tool |
| `AE_BRIDGE_ALLOW_DEV` | (unset) | `1` to surface dev-only commands |

The MCP server is a client of the controller, so run `npm run controller` (not a second one) to avoid a port clash; the MCP process just needs to reach it.

### Host it for others: video in, render, video out

Run the bridge on your machine and let other people send a video, have your AE render it, and download the result, over HTTP or MCP.

```bash
# bind to your network and require a shared secret (do BOTH before exposing it)
AE_BRIDGE_HOST=0.0.0.0 AE_BRIDGE_TOKEN=your-secret npm run controller
```

| Route | Purpose |
|---|---|
| `GET /studio` | a tiny browser page: pick a file, upload, see and download outputs |
| `POST /media/upload?name=clip.mp4` | send a video (raw body), returns `{ id, file, path, url }` (lands on the host) |
| `POST /media/fetch` `{ url \| dataBase64, name? }` | host pulls a video by URL (easiest for remote callers) |
| `GET /media/list` | list incoming and rendered files, each with a download URL |
| `GET /media/file/<name>` | download a video |
| `POST /media/render` `{ compId, name? }` | render, transcode to H.264 .mp4, returns `{ downloadUrl }`. Waits up to `AE_BRIDGE_RENDER_WAIT_MS` (default 150s); longer renders return `{ pending, jobId }` |
| `GET /media/render/<jobId>` | poll a long render, returns `{ status, downloadUrl }` when done |

Renders are tracked as jobs, so a long render never blows the MCP client's ~180s call timeout, and every output is transcoded to a universally playable H.264 `.mp4` (via ffmpeg, auto-detected or set with `AE_BRIDGE_FFMPEG`).

```bash
# send a clip, then (after building a comp from it) render and fetch the result:
curl -X POST --data-binary @in.mp4 -H "Content-Type: application/octet-stream" \
  "http://HOST:8787/media/upload?name=in.mp4&token=your-secret"
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer your-secret" \
  -d '{"compId":3,"name":"out.mp4"}' http://HOST:8787/media/render
#   returns { "downloadUrl": "/media/file/out.mp4" }
```

Expose it to the internet with a tunnel (no router config):

```bash
cloudflared tunnel --url http://localhost:8787      # or: ngrok http 8787
```

Remote MCP works two ways. The controller also serves MCP over HTTP at `POST /mcp` (Streamable HTTP), so the tunnel URL is a pluggable MCP link:

```bash
# (a) direct HTTP MCP: paste the URL into any MCP client
claude mcp add --transport http aftr https://your-tunnel.example/mcp \
  --header "Authorization: Bearer your-secret"
```
```jsonc
// (b) stdio adapter pointed at the tunnel
{ "mcpServers": { "aftr": {
  "command": "node", "args": ["/path/aftr/controller/src/mcp.js"],
  "env": { "AE_BRIDGE_URL": "https://your-tunnel.example", "AE_BRIDGE_TOKEN": "your-secret" }
}}}
```

Remote callers get the video tools too: `ae_upload_video` (`{ url }`, host fetches it), `ae_media_info`, `ae_media_list`, `ae_render_and_download` (`{ compId }`, returns a download URL or `{ pending, jobId }` for long renders), and `ae_render_result` (`{ jobId }` to poll).

This exposes programmatic control of your After Effects. Always set `AE_BRIDGE_TOKEN` before binding to `0.0.0.0` or tunneling. With a token set, `/command`, `/media/*`, `/mcp`, and the `/bridge` and `/agent` WebSockets all require it (the local AE panel is exempted as a direct-loopback connection). Only share the token with people you trust.

Onboarding teammates? Hand them [docs/TEAM-GUIDE.md](docs/TEAM-GUIDE.md), a no-repo-needed guide to connecting, the tool catalog, and copy-paste recipes (including URL to rendered video in two calls).

### Message contract

```jsonc
// request  (controller to panel)
{ "id": "uuid", "type": "command", "command": "createComp", "params": { ... } }
// result   (panel to controller)
{ "id": "uuid", "type": "result", "ok": true,  "result": { ... } }
{ "id": "uuid", "type": "result", "ok": false, "error": "width must be a positive integer" }
// event    (panel to controller, unsolicited)
{ "type": "event", "event": "ready",    "data": { "ae": "26.3", "project": "Untitled" } }
{ "type": "event", "event": "progress", "data": { "jobId": "r1", "percent": 42 } }
```

---

## 7. Command vocabulary

~90 commands, grouped. List them live at `GET /api/commands`. Highlights:

Project and comp:
`ping`, `getProjectInfo`, `getAppInfo`, `listComps`, `createComp`, `setCompSettings`, `addCompMarker`, `duplicateComp`, `setActiveComp`, `setCompTime`, `getCompTime`, `setWorkArea`, `clearComp`, `createFolder`, `moveToFolder`, `renameItem`, `deleteItem`, `setProxy`, `getProjectItems`, `saveProject`.

Layers:
`addSolid`, `addTextLayer`, `addNull`, `addAdjustmentLayer`, `addCamera`, `addLight`, `addShape`, `addPathShape` (custom bezier paths), `addFootageLayer`, `setLayerProperty`, `setParent`, `trimLayer`, `moveLayer`, `duplicateLayer`, `deleteLayer`, `getLayers`, `setBlendMode`, `setTrackMatte`, `setLayerFlag`, `addLayerMarker`, `setTimeStretch`, `enableTimeRemap`, `replaceSource`, `alignLayer`, `sequenceLayers`.

Animation:
`setKeyframe`, `setKeyframes` (bulk + ease), `setEase`, `setInterpolation`, `removeKeyframes`, `setExpression`, `removeExpression`, `enableExpression`.

Effects:
`addEffect` (by matchName), `setEffectParam`, `listEffects`, `addExpressionControl`. Any nested effect param is reachable via a property path through `setLayerProperty` or `setExpression`, for example `["ADBE Effect Parade","FN","ADBE Fractal Noise-0012"]`.

Text:
`setTextDocument`, `addTextAnimator` (full Animate-panel range selector), `applyTextPreset`.

Masks and styles:
`addMask`, `addRectMask`, `setMaskProperty`, `addLayerStyle`, `setLayerStyleEnabled`.

Footage and render:
`importFootage`, `compFromFootage`, `render` (non-blocking aerender, scoped `startFrame` and `endFrame`), `addToRenderQueue`, `listRenderQueue`, `setOutputModule`, `clearRenderQueue`.

Grading and VFX presets:
`applyLumetri`, `lumetriParams`, `cinematicGrade`, `fireEffect`, `smokeEffect`, `glitchEffect`, `neonGlow`.

Discovery (read-only):
`listFonts` (postScriptName authoritative, family and style derived), `listInstalledEffects` (best-effort, probes a known set, returns `{name, matchName}`), `findEffectMatchName` (resolve a display name to a matchName), `listPlugins` (best-effort, scans `.aex` and `.plugin` install dirs), `getEnvironment` (AE version, OS, ExtendScript, font count, memory, GPU). Use these to discover the matchNames that `addEffect` needs.

App and orchestration:
`executeMenuCommand` (run any AE menu item by name or id), `findMenuCommand`, `undo`, `redo`, `purge`, `getSelection`, `keystroke` (best-effort OS keys), `batch`, `applySpec`, `removeLayersByPrefix`.

`runJSX` (raw ExtendScript) exists as a dev-only escape hatch, gated behind `AE_BRIDGE_ALLOW_DEV=1`.

---

## 8. VFX and text presets

Realistic fire, one call:
```json
{ "command": "fireEffect", "params": { "compId": 1, "center": [960,660], "size": 1.0, "embers": true } }
```
Builds an animated Fractal-Noise flame plus Turbulent Displace, CC Toner colorize, rising embers, ambient glow, and a Glow adjustment, masked into a flame shape.

Other presets:
```json
{ "command": "smokeEffect",    "params": { "compId": 1, "size": 1.1, "color": [0.7,0.7,0.8] } }
{ "command": "glitchEffect",   "params": { "compId": 1, "layer": "title", "amount": 50, "shake": 18 } }
{ "command": "neonGlow",       "params": { "compId": 1, "layer": "title", "radius": 28 } }
{ "command": "cinematicGrade", "params": { "compId": 1, "layer": "footage", "warm": true } }
{ "command": "applyLumetri",   "params": { "compId": 1, "layer": "footage",
    "settings": { "saturation": 140, "contrast": 20, "temperature": 12, "vibrance": 25 } } }
```

Pro text styles, one call:
```json
{ "command": "applyTextPreset", "params": { "compId": 1, "layer": "title", "preset": "blurFade" } }
```
`preset` is one of `wordReveal`, `charScale`, `bunchRotate`, `blurFade`. For full control use `addTextAnimator` (properties plus advanced range selector plus keyframed Offset and Start with ease modes).

---

## 9. The orchestrator (autonomous pipeline)

Describe a video as a manifest (segments with time or frame ranges) plus per-segment specs (declarative treatments). The orchestrator, a client of the bridge over `/agent`, runs the loop:

```
spec -> applySpec (realize) -> scoped aerender (render) -> visual review (FFmpeg) ->
        structured delta (revise) -> re-render -> pass -> FFmpeg concat (assemble)
```

A spec is a list of treatments:

```jsonc
{
  "segment_id": 0,
  "intent": "A flaming title",
  "treatments": [
    { "type": "fire",  "center": [960,660], "size": 1.0 },
    { "type": "title", "text": "ON FIRE", "fontSize": 150, "fillColor": [1,0.95,0.8],
      "justification": 2, "position": [960,300], "animator": "blurFade",
      "grade": { "warm": true }, "glitch": { "amount": 40 }, "neon": { "radius": 25 },
      "effects": [ { "effect": "Glow", "params": { "Glow Radius": 40 } }, { "effect": "Tint" } ] }
  ]
}
```

Supported treatment types: `fire`, `smoke`, `title` (with `animator`, `grade`, `glitch`, and `neon` modifiers), `color_grade`, `procedural_motion`, `responsive_box`, `transition`. Every segment is idempotent: re-running wipes and rebuilds its `seg{id}_*` layers, so state never drifts.

Effects by display name: any treatment may carry an `effects: [{ effect, params }]` array (and `color_grade` takes a single `effect`). Write the display name you'd pick from the Effect menu, like `"Glow"` or `"Lumetri Color"`, and the executor resolves it to the matchName (`ADBE Glo2`, `ADBE Lumetri`) for you, validating that it's installed first. Authors never touch matchNames; discover what's available with [`listInstalledEffects`](#7-command-vocabulary) (which caches per session, so repeated probes are free).

Third-party plugins: two installed-effect wrappers ship friendly params (resolved to the plugin's stable matchNames under the hood, because plugins like these reuse internal param names):

| Command / spec modifier | Plugin | Friendly params |
|---|---|---|
| `deepGlow` | Deep Glow 2 (Plugin Everything, `PEDG2`) | `radius, exposure, threshold, glowMode, color, colorOuter, tintStrength` |
| `shadowStudio` | Shadow Studio 3 (Plugin Everything, `PESS3`) | `lightDirection, shadowLength, lightRadius, softness, color, opacityStart, opacityEnd, samples` |

```jsonc
{ "type": "title", "text": "NEON",
  "deepGlow":     { "radius": 200, "exposure": 1.2, "color": [1, 0.4, 0.1] },
  "shadowStudio": { "lightDirection": 120, "shadowLength": 300 } }
```

Wiring any other plugin is one call: `introspectEffect { name: "Your Plugin" }` adds it to a throwaway layer and dumps the full parameter tree (each param's `name`, `matchName`, value type, and default). Copy the matchNames into a map and you're done. Both wrappers above were built this way; pass raw `params: { "PEDG2-0017": 250 }` to reach anything not in the friendly map. Re-run `introspectEffect` after a plugin version bump in case matchNames shift.

Reviewers are pluggable (`controller/src/orchestrator/reviewers.js`):
- `brightnessReviewer` (default): an FFmpeg `signalstats` check that the segment actually rendered visible content; if it's blank it emits a structured delta.
- `claudeReviewer`: a slot that judges intent with a vision model; set `ANTHROPIC_API_KEY` to enable.

Demos:
```bash
npm run orchestrate        # 2 segments; one is intentionally broken and self-corrects
npm run orchestrate:fire   # "a fiery title card" plus a self-correcting segment
npm run showreel           # 4-VFX parallel showreel (fire / smoke / glitch / neon)
```

Parallel rendering: `runPipelineParallel` builds all segments fast (sequential edits plus one save), then renders pending segments concurrently in rounds, revising only failures. `aerender` already multi-frame-renders across all cores, so high concurrency oversubscribes a single machine. The default is `concurrency: 2`; raise it only across multiple machines or for short, startup-bound renders.

---

## 10. Configuration

Root `config.json` is the single source of truth for the endpoint (only the panel's `wsUrl` changes when moving to the cloud):

```jsonc
{ "host": "127.0.0.1", "port": 8787, "wsPath": "/bridge", "agentPath": "/agent",
  "commandTimeoutMs": 30000, "reconnect": { "initialDelayMs": 500, "maxDelayMs": 10000, "factor": 1.8 } }
```

Environment overrides:

| Env var | Default | Purpose |
|---|---|---|
| `AE_BRIDGE_HOST` | `127.0.0.1` | Bind address |
| `AE_BRIDGE_PORT` | `8787` | Port |
| `AE_BRIDGE_TIMEOUT_MS` | `30000` | Command timeout |
| `AE_BRIDGE_ALLOW_DEV` | `0` | Enable `runJSX` (`1` to allow) |
| `AE_BRIDGE_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `AE_BRIDGE_AERENDER` | auto-detect | Full path to `aerender` if auto-detection fails |
| `ANTHROPIC_API_KEY` | (unset) | Enables the vision-model reviewer in the orchestrator |

The panel reads `panel/config.json` for its `wsUrl` (falls back to `ws://127.0.0.1:8787/bridge`).

---

## 11. Dev workflow (hot reload + signing)

Edit JSX and hot-reload without reopening AE: `node tools/hot.mjs` rebuilds the bundle and evals it into the running panel via the CEF DevTools protocol (it never touches the signed file, so the signature stays valid). It requires the panel open and the `.debug` remote-debug port available.

Make it permanent: `npm run deploy:panel` re-signs and redeploys (then quit and reopen AE).

Inspect the panel live: with the `.debug` file present, open the CEF DevTools at the port in `panel/.debug`.

The bundled JSX must be ASCII, because `$.evalFile` mis-decodes BOM-less UTF-8. The bundler sanitizes non-ASCII, and the panel loader reads the file as explicit UTF-8 and `eval()`s it.

---

## 12. Architecture

Controller (`controller/`): Express plus `ws`. `aeClient.js` tracks the single panel socket and provides `sendCommand()` (a Promise that is id-correlated, has a timeout, rejects on disconnect, and always resolves to a uniform `{ok,...}` shape). `agentHub.js` relays commands from agents and the UI and broadcasts panel events. `server.js` path-routes `/bridge` (panel) versus `/agent` (clients). `orchestrator/` holds the agentic pipeline.

Panel (`panel/`): a hand-rolled CEP extension. `index.html` loads Adobe's real `CSInterface.js`, `bridge.js` (evalScript-to-Promise plus bundle loader), `render.js` (non-blocking aerender), `keystroke.js`, and `main.js` (WS client with reconnect and backoff). `CSXS/manifest.xml` enables Node and targets AEFT. The JSX lives in `panel/jsx/` and is bundled to `bundle.jsx`.

JSX layer (`panel/jsx/`): `host.jsx` (dispatch plus `AEB.*` helpers plus a JSON polyfill) and `commands/*.jsx` (one file per group). ES3 only.

Shared (`shared/`): the wire protocol plus command registry, consumed by the controller and simulator (single source of truth).

Simulator (`simulator/`): runs the real bundled JSX in a Node `vm` against a mock AE DOM, so the architecture is testable without AE.

The panel is the load-bearing, build-once part, identical locally and (later) in the cloud. The controller is a swappable front end.

---

## 13. Project structure

```
aftr/
├── README.md
├── package.json              # workspaces + scripts
├── config.json               # endpoint config
├── controller/
│   ├── src/
│   │   ├── server.js          # WS server + Express + static UI
│   │   ├── aeClient.js        # panel socket + sendCommand (id-correlated, timeout)
│   │   ├── agentHub.js        # agent/UI relay + event broadcast
│   │   ├── protocol.js, commands.js, log.js
│   │   └── orchestrator/      # agentClient, reviewers, engine, demos
│   ├── ui/                    # interactive control panel (index.html, ui.js, styles.css)
│   └── test/                  # aeClient, agentHub, e2e
├── panel/                     # the CEP extension (the bridge)
│   ├── CSXS/manifest.xml
│   ├── index.html, .debug, config.json
│   ├── src/                   # csInterface.js (real Adobe lib), bridge.js, render.js, keystroke.js, main.js
│   ├── jsx/                   # json2.js, host.jsx, commands/*.jsx  (bundle.jsx is generated)
│   ├── build/                 # bundle-jsx.js, sign-and-deploy.mjs
│   └── tools/sendkeys.ps1
├── shared/src/                # protocol.js, commands.js, validate.js, config.js
└── simulator/src/             # index.js, mockAeDom.js, jsxRunner.js, render.js
```

---

## 14. Testing

```bash
npm test     # unit (protocol/commands) + simulator (JSX dispatch on mock DOM) + controller
npm run e2e  # controller + simulator full round-trip, incl. render progress/complete events + output file
```

The headless suite proves the protocol, id-correlation, timeout and disconnect handling, command validation, and the full JSX command set against the mock AE DOM, with no After Effects required.

| Milestone | Validated by |
|---|---|
| M0 panel loads | Panel appears under Window > Extensions (signed); simulator validates the connection |
| M1 read path | `getProjectInfo` returns the real project |
| M2 write path | `createComp` creates a comp, confirmed via `listComps` |
| M3 round-trip | controller to WS to bridge to JSX to result to REST (e2e) |
| M4 vocabulary | all commands validated both sides; errors surface as `{ok:false,error}` |
| M5 render | non-blocking `aerender`; `progress` and `renderComplete` events; real output file |

---

## 15. Troubleshooting

"Signature verification failed" or the panel won't appear under Window > Extensions.
Modern AE ignores `PlayerDebugMode`. Run `npm run deploy:panel` (signs and installs), then fully quit and relaunch AE. CEP reads signatures at startup, so a restart is required after (re)deploying.

The panel connects but every command returns "EvalScript error."
The panel must use the real Adobe `CSInterface.js` (already vendored at `panel/src/csInterface.js`). A stub or missing lib makes `evalScript` always fail. Also ensure `npm run build:jsx` ran so `panel/jsx/bundle.jsx` exists.

The JSX bundle fails to load.
`$.evalFile` mis-decodes BOM-less UTF-8. The bundler emits ASCII and the loader reads UTF-8 then `eval()`s, so keep your source ASCII (the bundler sanitizes anyway). ExtendScript is ES3: no `let`, `const`, or arrow functions, and no chained ternaries `a?b:c?d:e`, so use `if/else`.

`render` says aerender not found.
Set `AE_BRIDGE_AERENDER` to the full path. Windows: `…\Support Files\aerender.exe`. macOS: `/Applications/Adobe After Effects <year>/aerender`.

`render` errors "No comp was found".
`aerender` reads the saved `.aep`. Save first (`saveProject` with a path), since a fresh "Untitled" project has nothing on disk.

Orchestrator or agent commands time out.
Make sure the controller is running and the panel is connected (`GET /api/status`). Agent replies are correlated by your sent `id`.

Keystroke does nothing.
OS keystroke injection is best-effort (Windows foreground-lock blocks background `SendKeys`). Use `executeMenuCommand` for any menu or shortcut action; it's a direct scripting call and always works.

Modal dialogs freeze the bridge.
Avoid JSX that opens a dialog (or `alert()`); it blocks `evalScript`.

---

## 16. Cross-platform notes

| | Windows | macOS |
|---|---|---|
| CEP extensions folder | `%APPDATA%\Adobe\CEP\extensions` | `~/Library/Application Support/Adobe/CEP/extensions` |
| `aerender` location | `…\Support Files\aerender.exe` | `/Applications/Adobe After Effects <year>/aerender` |
| Signing tool | provided by `zxp-sign-cmd` | provided by `zxp-sign-cmd` (clear quarantine if needed) |
| Keystroke layer | .NET `SendKeys` (`panel/tools/sendkeys.ps1`) | `osascript` System Events |
| Optional debug mode | `HKCU\Software\Adobe\CSXS.12` `PlayerDebugMode=1` | `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` |

`deploy:panel`, the controller, the simulator, the bundler, and the orchestrator are all cross-platform Node. The CEP panel itself is identical on both, so build once and run anywhere AE runs.

---

## License

MIT. Use it, fork it, ship it.
