# aftr (Python launcher)

Puppeteer for After Effects. Use AE with Claude Code to make production-ready videos.

aftr is a Node.js tool. This package is a thin launcher that forwards to the npm-published `aftr-studio` CLI through `npx`, so `pip install aftr-studio` gives you the `aftr` command without a separate npm install.

```bash
pip install aftr-studio

aftr controller   # start the controller (WebSocket + REST + web UI)
aftr mcp          # start the stdio MCP server for Claude Code / Desktop
aftr sim          # start the headless After Effects simulator
```

Requires Node.js 18+ on your PATH. Driving a real After Effects also needs the CEP panel, deployed from the repo with `npm run deploy:panel`.

Full docs: https://github.com/Arman-Luthra/aftr
