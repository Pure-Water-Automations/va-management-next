import { DEFAULT_AVATAR_COLOR, normalizeColor } from "../world/avatars";

// Bridges non-media overlay state (chat, directory, avatar color) between the
// Phaser scene / Colyseus layer and the React overlay (via useSyncExternalStore).

export type ChatMsg = { from: string; vaId: string; text: string; ts: number };
export type RosterEntry = { vaId: string; name: string; tier: string; status: string };
export type OnlinePlayer = {
  sessionId: string;
  vaId: string;
  name: string;
  tier: string;
  color: string;
  isSelf: boolean;
};

/** Imperative actions the scene wires up once joined. */
export type OverlayActions = {
  sendChat: (text: string) => void;
  setColor: (color: string) => void;
  teleportTo: (sessionId: string) => void;
};

export type OverlayState = {
  chat: ChatMsg[];
  roster: RosterEntry[];
  online: OnlinePlayer[];
  myColor: string;
};

let state: OverlayState = { chat: [], roster: [], online: [], myColor: DEFAULT_AVATAR_COLOR };
let actions: OverlayActions | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const overlayBridge = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): OverlayState {
    return state;
  },
  bindActions(a: OverlayActions): void {
    actions = a;
  },
  getActions(): OverlayActions | null {
    return actions;
  },
  addChat(msg: ChatMsg): void {
    state = { ...state, chat: [...state.chat.slice(-99), msg] };
    emit();
  },
  setRoster(roster: RosterEntry[]): void {
    state = { ...state, roster };
    emit();
  },
  setOnline(online: OnlinePlayer[]): void {
    state = { ...state, online };
    emit();
  },
  setMyColor(color: string): void {
    state = { ...state, myColor: normalizeColor(color) };
    emit();
  },
};
