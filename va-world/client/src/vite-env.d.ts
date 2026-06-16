/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLD_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
