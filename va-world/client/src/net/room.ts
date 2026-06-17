import { Client, type Room } from "colyseus.js";
import { normalizeColor } from "../world/avatars";

/** WS endpoint: build-time override, else same host on the server port (dev). */
function endpoint(): string {
  const fromEnv = import.meta.env.VITE_WORLD_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.hostname}:2567`;
}

/** Dev-only identity selector: `?email=` in the page URL. */
function devEmail(): string | undefined {
  const value = new URLSearchParams(window.location.search).get("email");
  return value ?? undefined;
}

/** Remembered avatar color from a previous session (validated). */
function savedColor(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("va-world-color");
  } catch {
    /* ignore storage failures */
  }
  return normalizeColor(stored);
}

export async function joinWorld(): Promise<Room> {
  const client = new Client(endpoint());
  return client.joinOrCreate("world", { email: devEmail(), color: savedColor() });
}
