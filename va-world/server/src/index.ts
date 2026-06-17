import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import cors from "cors";
import express from "express";
import { config } from "./env";
import { WorldRoom } from "./rooms/WorldRoom";

// Express wraps the HTTP server so the Colyseus matchmaking endpoint accepts
// cross-origin requests from the Vite dev client (different port). In prod the
// client is served from the same Cloudflare hostname, so CORS is a no-op.
const app = express();
app.use(cors({ origin: config.allowedOrigin }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve the built Phaser client (vite build → ../../dist/client) from the same
// origin as the Colyseus endpoint, so a single port/hostname serves both the
// static SPA and the realtime WS. HTTP GETs are handled here by Express; the
// Colyseus matchmaking + room traffic is WebSocket, dispatched by the transport's
// HTTP-`upgrade` listener below — it never flows through Express routing, so the
// `*` SPA fallback can't shadow it. In dev the client runs on Vite (port 5180)
// and this static dir simply doesn't exist yet, which is harmless.
const clientDir = path.resolve(fileURLToPath(import.meta.url), "../../../dist/client");
app.use(express.static(clientDir));
app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("world", WorldRoom);

gameServer
  .listen(config.port)
  .then(() => {
    console.log(`[va-world] Colyseus server listening on ws://localhost:${config.port}`);
  })
  .catch((err) => {
    console.error("[va-world] failed to start Colyseus server:", err);
    process.exit(1);
  });
