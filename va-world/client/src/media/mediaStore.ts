import type { Track } from "livekit-client";

// Minimal observable store bridging the LiveKit layer and the React overlay
// (consumed via React's useSyncExternalStore).

export type Tile = {
  identity: string;
  name: string;
  track: Track;
  isLocal: boolean;
};

export type MediaState = {
  available: boolean;
  connected: boolean;
  micOn: boolean;
  camOn: boolean;
  /** Whether the current zone permits publishing (false = listen-only audience). */
  canPublish: boolean;
  /** Human label for the current zone ("Open floor", "Meeting Room", …). */
  zoneLabel: string;
  tiles: Tile[];
};

let state: MediaState = {
  available: false,
  connected: false,
  micOn: false,
  camOn: false,
  canPublish: true,
  zoneLabel: "",
  tiles: [],
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const mediaStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): MediaState {
    return state;
  },
  set(patch: Partial<MediaState>): void {
    state = { ...state, ...patch };
    emit();
  },
  upsertTile(tile: Tile): void {
    state = { ...state, tiles: [...state.tiles.filter((t) => t.identity !== tile.identity), tile] };
    emit();
  },
  removeTile(identity: string): void {
    state = { ...state, tiles: state.tiles.filter((t) => t.identity !== identity) };
    emit();
  },
};
