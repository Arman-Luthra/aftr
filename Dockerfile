# aftr controller + MCP server + headless simulator.
#
# The CEP panel needs a real After Effects host to connect over the socket, so it
# is not part of this image. What runs here is everything that is headless: the
# controller (WS + REST + UI), the stdio/HTTP MCP server, and the AE simulator
# used for AE-free validation. Point the panel (or a tunnel) at this container.

FROM node:22-slim

# ffmpeg backs the orchestrator's visual reviewer and the final concat/transcode.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps against the lockfile first so this layer caches across code edits.
# --ignore-scripts skips the zxp signer's postinstall binary download (panel-only).
COPY package.json package-lock.json ./
COPY controller/package.json ./controller/package.json
COPY shared/package.json ./shared/package.json
COPY simulator/package.json ./simulator/package.json
RUN npm ci --ignore-scripts

COPY . .

# Build the JSX bundle the simulator runs against.
RUN npm run build:jsx

# Bind to all interfaces so the container is reachable; set a token when exposing.
ENV AE_BRIDGE_HOST=0.0.0.0 \
    AE_BRIDGE_PORT=8787
EXPOSE 8787

# Default to the controller. Override to run the MCP server or simulator, e.g.:
#   docker run --rm -it aftr node controller/src/mcp.js
#   docker run --rm -it aftr node simulator/src/index.js
CMD ["node", "controller/src/server.js"]
