import { defineConfig } from "vite";

// The client lives in client/. Keep its build output isolated from the server.
export default defineConfig({
  root: "client",
  server: {
    port: 5180,
    host: true,
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
