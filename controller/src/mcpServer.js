// mcpServer.js — shared MCP tool surface for the aftr.
//
// One place defines the tools; two transports use it:
//   - controller/src/mcp.js  (stdio)  — backend forwards to the controller's REST
//   - controller/src/server.js (/mcp HTTP) — backend calls aeClient + media directly
//
// A `backend` supplies the four verbs the tools need: execute (run a command),
// status, and the three media operations. Keeping the tool list + dispatch here
// means the stdio and HTTP servers can never drift apart.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { commandList } from '../../shared/src/commands.js';

// Curated default so the tool list stays manageable; AE_MCP_TOOLS=all exposes
// every registered command. Everything is reachable via ae_command regardless.
const CORE = new Set([
  'ping', 'getProjectInfo', 'listComps', 'createComp', 'addSolid', 'addTextLayer',
  'addNull', 'addShape', 'addAdjustmentLayer', 'setLayerProperty', 'trimLayer',
  'setKeyframes', 'setExpression', 'addEffect', 'setEffectParam', 'applyLumetri',
  'deepGlow', 'shadowStudio', 'applyTextStyle', 'applyTextPreset', 'applySpec',
  'render', 'saveProject', 'getLayerDetails', 'getLayers', 'listFonts',
  'listInstalledEffects', 'introspectEffect', 'importFootage', 'addFootageLayer',
]);

const META_TOOLS = [
  { name: 'ae_status', description: 'aftr health: is the After Effects panel connected? Returns { status, agents, config }. Call this first if other tools report NO_PANEL.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'ae_list_commands', description: 'List every aftr command with its description and required params. Use to discover what ae_command can run.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'ae_command', description: 'Execute ANY aftr command by name (universal escape hatch). Params follow each command\'s documented shape; see ae_list_commands.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, params: { type: 'object' } }, required: ['command'], additionalProperties: false } },
  { name: 'ae_media_info', description: 'How to send a video TO the host and get rendered video back: upload URL + curl, the browser studio page, list/download URLs.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'ae_upload_video', description: 'Send a video to the host so AE can use it — the EASY way for remote callers: pass a public { url } (host downloads it) or small { dataBase64 }. With makeComp:true it also imports the footage and builds a comp sized to it, returning { comp:{ compId } } ready to render — so it is URL -> renderable comp in ONE call.', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'a public video URL the host will fetch' }, dataBase64: { type: 'string', description: 'base64 video bytes (for small clips)' }, name: { type: 'string' }, makeComp: { type: 'boolean', description: 'also import + place into a new comp matching the footage; returns comp.compId' }, compName: { type: 'string' } }, additionalProperties: false } },
  { name: 'ae_media_list', description: 'List uploaded (incoming) videos and rendered (output) videos, each with a download URL.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'ae_render_and_download', description: 'Render a comp to a web-friendly H.264 .mp4 and return a download URL. Waits up to ~150s; for LONGER renders it returns { pending, jobId } — then call ae_render_result with that jobId to get the link. { compId, name?, startFrame?, endFrame?, timeoutMs? }', inputSchema: { type: 'object', properties: { compId: { type: 'number' }, name: { type: 'string' }, startFrame: { type: 'number' }, endFrame: { type: 'number' }, timeoutMs: { type: 'number' } }, required: ['compId'], additionalProperties: false } },
  { name: 'ae_render_result', description: 'Poll a render started by ae_render_and_download. Returns status (rendering|transcoding|done|failed) and, when done, the download URL. { jobId }', inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false } },
];

export function buildTools({ mode = 'core', allowDev = false } = {}) {
  const allCmds = commandList({ includeDev: allowDev });
  const exposed = mode === 'all' ? allCmds : allCmds.filter((c) => CORE.has(c.name));
  const tools = [
    ...META_TOOLS,
    ...exposed.map((c) => ({ name: 'ae_' + c.name, description: c.description, inputSchema: { type: 'object', additionalProperties: true } })),
  ];
  return { tools, allCmds };
}

const asText = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
const asError = (m) => ({ content: [{ type: 'text', text: m }], isError: true });

// backend: { execute(command, params), status(), mediaInfo(), mediaList(),
//            mediaRender(args), errorHint?(err) }
export function createAeMcpServer({ mode = 'core', allowDev = false, backend }) {
  const { tools, allCmds } = buildTools({ mode, allowDev });
  const server = new Server({ name: 'aftr', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      if (name === 'ae_status') return asText(await backend.status());
      if (name === 'ae_list_commands') return asText({ ok: true, count: allCmds.length, commands: allCmds });
      if (name === 'ae_media_info') return asText(await backend.mediaInfo());
      if (name === 'ae_media_list') return asText(await backend.mediaList());
      if (name === 'ae_upload_video') {
        const r = await backend.mediaFetch(args);
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok };
      }
      if (name === 'ae_render_and_download') {
        const r = await backend.mediaRender(args);
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok };
      }
      if (name === 'ae_render_result') {
        const r = await backend.renderResult(args.jobId);
        return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], isError: !r.ok };
      }
      let command;
      let params;
      if (name === 'ae_command') {
        command = args.command;
        params = args.params || {};
        if (!command) return asError('ae_command requires a "command" field');
      } else if (name.startsWith('ae_')) {
        command = name.slice(3);
        params = args;
      } else {
        return asError(`unknown tool: ${name}`);
      }
      const result = await backend.execute(command, params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    } catch (e) {
      return asError(backend.errorHint ? backend.errorHint(e) : String(e && e.message ? e.message : e));
    }
  });

  return server;
}
