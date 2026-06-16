import { createServer } from "node:http";
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
