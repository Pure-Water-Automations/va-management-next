import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom";

const PORT = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});
gameServer.define("world", WorldRoom);

gameServer
  .listen(PORT)
  .then(() => {
    console.log(`[va-world] Colyseus server listening on ws://localhost:${PORT}`);
  })
  .catch((err) => {
    console.error("[va-world] failed to start Colyseus server:", err);
    process.exit(1);
  });
