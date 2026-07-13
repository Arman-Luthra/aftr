# aftr Team Guide

Drive a real **After Effects** instance from your MCP client (Claude Code, Claude
Desktop, claude.ai). One teammate hosts AE + the bridge; everyone else connects
by URL and builds/renders comps with plain tool calls — including **sending a
video in and getting a rendered video back**.

> You don't install After Effects. You don't need the repo. You need the **MCP
> URL + token** from whoever is hosting (the "host").

---

## 1. Connect

Ask the host for two things:

- **MCP URL** — e.g. `https://<host-tunnel>/mcp`
- **Token** — a shared secret

**Claude Code:**
```bash
claude mcp add --transport http aftr https://<host-tunnel>/mcp \
  --header "Authorization: Bearer <TOKEN>" \
  --header "ngrok-skip-browser-warning: 1"
```

**Claude Desktop / claude.ai** → add a custom connector by URL, with the same two
headers.

Then in chat: **"call ae_status"**. You should see `connected: true` and an AE
version. If not, see [Troubleshooting](#6-troubleshooting).

---

## 2. The 10-second mental model

```
your MCP client ──tool call──▶ bridge ──socket──▶ After Effects (on the host)
                              ◀── JSON result ◀──
```

- Everything is a **comp** (composition) made of **layers**. You build by id.
- `createComp` → `compId`. Most tools take that `compId`.
- Rendering produces a downloadable **H.264 .mp4**.
- It's **one shared AE**. Name your layers/comps with a prefix so teammates don't
  collide (e.g. `aria_intro`, `sam_promo`).

---

## 3. Tool catalog

**Start here**
| Tool | What |
|---|---|
| `ae_status` | Is AE connected? Call first. |
| `ae_list_commands` | Every command + its params. |
| `ae_command` | Run **any** command: `{ command, params }` — the escape hatch. |

**Build**
`ae_createComp`, `ae_addTextLayer`, `ae_addSolid`, `ae_addShape`, `ae_addNull`,
`ae_setLayerProperty`, `ae_setKeyframes`, `ae_setExpression`, `ae_addEffect`,
`ae_applyLumetri`, `ae_applySpec` (declarative multi-layer build).

**Look** `ae_getProjectInfo`, `ae_listComps`, `ae_getLayers`, `ae_getLayerDetails`.

**Effects & plugins** `ae_deepGlow` (Deep Glow 2), `ae_shadowStudio` (Shadow
Studio 3), `ae_listInstalledEffects`, `ae_introspectEffect` (dump any effect's
params), `ae_listFonts`.

**Text animation** `ae_applyTextStyle` (4 styles × 8 eases), `ae_applyTextPreset`.

**Video in / out**
| Tool | What |
|---|---|
| `ae_upload_video` | Send a video. `{ url }` (host downloads it) or `{ dataBase64 }`. Add `makeComp:true` to also build a comp sized to it → returns `comp.compId`. |
| `ae_render_and_download` | Render a comp → **H.264 .mp4** download URL. `{ compId, name? }`. |
| `ae_render_result` | Poll a long render: `{ jobId }`. |
| `ae_media_list` | List uploaded + rendered files. |
| `ae_media_info` | URLs/curl for uploading by hand. |

---

## 4. Recipes

### A. A glowing title, rendered

> "Create a 1080p 3s comp, add a centered title 'LAUNCH' with deep glow, then
> ae_render_and_download it."

The model will roughly do:
```jsonc
ae_createComp { "name":"aria_launch", "width":1920, "height":1080, "duration":3, "frameRate":30 }
ae_applySpec  { "compId": <id>, "segmentId":0, "spec": { "treatments": [
  { "type":"title", "text":"LAUNCH", "fontSize":180, "justification":2,
    "position":[960,540], "deepGlow": { "radius":200, "color":[1,0.6,0.1] } } ] } }
ae_render_and_download { "compId": <id>, "name":"launch.mp4" }
```
→ you get a `downloadUrl`.

### B. Video in → render → video out (one upload call)

> "ae_upload_video that clip URL with makeComp, then render it."

```jsonc
ae_upload_video { "url":"https://.../clip.mp4", "makeComp":true, "compName":"sam_clip" }
//   -> { "comp": { "compId": 42, "footage": { "width":1920, "height":1080, "duration":5.7 } } }
ae_render_and_download { "compId": 42, "name":"out.mp4" }
//   -> { "downloadUrl": "https://<host>/media/file/out.play.mp4" }
```
That's **URL → rendered video in two calls.** (Want a title or effect over the
footage? Add an `ae_applySpec` between the two.)

### C. Long render (don't let it "time out")

Renders return within ~150s. A **longer** one returns `{ pending, jobId }` —
that is **not** a failure. Poll it:
```jsonc
ae_render_and_download { "compId": 42 }     // -> { "pending":true, "jobId":"render_42_..." }
ae_render_result { "jobId":"render_42_..." } // repeat until "status":"done" -> downloadUrl
```

---

## 5. Downloading the result

`downloadUrl` is a normal HTTPS link on the host. If the host set a token, append
it: `…/media/file/out.play.mp4?token=<TOKEN>`. Open it in a browser, or
`curl -O`. There's also a browser page at `https://<host>/studio?token=<TOKEN>` to
upload/download by clicking.

---

## 6. Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `NO_PANEL` / `connected:false` | AE or its bridge panel isn't running on the host. Ping the host. |
| `401 unauthorized` | Missing/wrong token — re-check the `Authorization: Bearer` header. |
| `{ pending, jobId }` | Long render still going — poll `ae_render_result`, not an error. |
| `.mp4 won't play` | Shouldn't happen — output is H.264/yuv420p. Re-fetch; tell the host if it persists. |
| `effect not installed` | That effect/plugin isn't on the host. `ae_listInstalledEffects` to see what is. |
| Tool not found | You're on the curated set. Use `ae_command` + `ae_list_commands` for anything. |

---

## 7. Etiquette (shared AE)

- **Prefix** your comp/layer names with your handle — one project, many people.
- Don't delete comps you didn't make.
- Big uploads land on the host's disk; clean up with the host when done.
- The token controls the host's After Effects **and** file upload/download — treat
  it like a password, don't paste it in public channels.

---

*Hosting this yourself? See the "Host it for others" section of the
[README](../README.md#host-it-for-others-video-in-render-video-out).*
