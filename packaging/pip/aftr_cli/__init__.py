"""aftr, a Python launcher for the aftr CLI.

aftr is a Node.js tool: a controller plus a CEP panel that drives Adobe After
Effects, with an MCP server on top. This package does not reimplement it. It
forwards to the npm-published `aftr-studio` CLI through `npx`, so `pip install aftr-studio`
gives you the `aftr` command without a separate npm step.

Requirements: Node.js 18+ on PATH. Driving a real After Effects also needs the
CEP panel, which is deployed from the repo (`npm run deploy:panel`).

Usage:
    aftr controller   # start the controller (WS + REST + UI)
    aftr mcp          # start the stdio MCP server
    aftr sim          # start the headless simulator
"""
from __future__ import annotations

import shutil
import subprocess
import sys

__version__ = "0.1.0"

# Pin the npm package to this launcher's version so the two move together.
NPM_SPEC = "aftr-studio@0.1.0"


def main() -> int:
    npx = shutil.which("npx")
    if npx is None:
        message = (
            "aftr needs Node.js 18+ (with npx) on your PATH.\n"
            "Install it from https://nodejs.org, then run aftr again.\n"
        )
        if shutil.which("node") is not None:
            message += "Found node but not npx. Update npm: npm install -g npm\n"
        sys.stderr.write(message)
        return 127

    cmd = [npx, "--yes", NPM_SPEC, *sys.argv[1:]]
    try:
        return subprocess.call(cmd)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
