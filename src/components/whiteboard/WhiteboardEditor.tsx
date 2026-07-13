"use client";

import React from "react";
import { useRouter } from "next/navigation";
import "./whiteboard.css";

// ── Types ────────────────────────────────────────────────────────────────
export type WbAssignee = { id: string; name: string | null; email: string };

type ElType = "sticky" | "frame" | "card" | "text" | "rect" | "circle" | "stamp" | "comment" | "image";
type WbEl = {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  title?: string;
  tint?: "sky" | "navy";
  size?: number;
  weight?: number;
  muted?: boolean;
  emoji?: string;
  count?: number;
  author?: string;
  assignee?: string;
  priority?: string;
  due?: string;
  frameId?: string;
  imgKey?: string; // R2 object key for an uploaded image
  uploading?: boolean; // image element mid-upload
  rotation?: number; // degrees, rotate around center
  locked?: boolean; // can't move/resize until unlocked
  groupId?: string; // members of the same group select/move together
  // shape/text styling (Wave 2)
  shapeType?: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  radius?: number;
  label?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  align?: "left" | "center" | "right";
  mentions?: string[]; // user ids @mentioned in a comment's latest reply
};
type ConnectorType = "straight" | "elbow" | "curved";
type ConnectorCap = "none" | "arrow" | "openArrow" | "circle" | "diamond";
type WbLinkLabel = { text: string; t: number };
type WbLink = {
  id?: string; // optional only for boards saved before connector IDs were introduced
  from: string;
  to: string;
  connectorType?: ConnectorType;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  startCap?: ConnectorCap;
  endCap?: ConnectorCap;
  labels?: WbLinkLabel[];
};
export type WbDoc = { elements: WbEl[]; links: WbLink[] };

type ConvRow = { srcId: string; title: string; assignedToId: string; due: string; priority: string; include: boolean };

type Props = {
  boardId: string;
  projectId: string;
  projectName: string;
  initialTitle: string;
  initialData: WbDoc | null;
  assignees: WbAssignee[];
  currentUserName: string;
  currentUserId: string;
  navigate: (url: string) => void;
};
type State = {
  elements: WbEl[];
  links: WbLink[];
  title: string;
  tool: string;
  selected: string[];
  editingId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  panning: boolean;
  connectFrom: string | null;
  threadId: string | null;
  shareOpen: boolean;
  convertOpen: boolean;
  convTasks: ConvRow[];
  converting: boolean;
  saveState: "idle" | "saving" | "saved";
  presenceUsers: BoardUser[];
  remoteCursors: Record<string, RemoteCursor>;
  connId: string | null;
  stampEmoji: string;
  shapeType: string; // pending shape type for the square tool's shape picker
  marquee: { x: number; y: number; w: number; h: number } | null; // rubber-band select rect (screen px)
  menu: { x: number; y: number } | null; // right-click context menu (screen px)
  searchOpen: boolean; // on-board search overlay (Cmd/Ctrl+F) — view-only, never persisted
  searchQuery: string;
  reactionEmoji: string;
  reactions: { id: string; emoji: string; x: number; y: number }[]; // ephemeral, never persisted
  replyText: string;
  mentionOpen: boolean;
  mentionQuery: string;
  mentionIndex: number;
};

// Undo/redo entry: the BEFORE snapshot of the touched elements (null = element didn't
// exist → undo removes it) plus optional links snapshot. Applied as ops, so undo is
// per-user and collab-safe (it never wholesale-replaces the shared doc).
type UndoEntry = { els: { id: string; el: WbEl | null }[]; links?: WbLink[] };

type DragState = {
  mode: "pan" | "el" | "resize" | "rotate" | "marquee";
  sx: number;
  sy: number;
  px?: number;
  py?: number;
  snap?: { id: string; x: number; y: number }[];
  moved?: boolean;
  elId?: string;
  nx?: number;
  ny?: number;
  box?: { x: number; y: number; w: number; h: number; rot: number };
  center?: { x: number; y: number };
  startAngle?: number;
  startRot?: number;
  mx?: number;
  my?: number;
  addTo?: string[];
  undoIds?: string[];
};

type BoardUser = { userId: string; name: string; color: string };
type RemoteCursor = { userId: string; name: string; color: string; x: number; y: number };
// Live-collaboration op shapes broadcast over /live and applied by peers.
type LiveOp =
  | { k: "upsert"; el: WbEl }
  | { k: "upsertMany"; els: WbEl[] }
  | { k: "delete"; ids: string[] }
  | { k: "links"; links: WbLink[] }
  | { k: "title"; title: string }
  | { k: "order"; ids: string[] }
  | { k: "reaction"; emoji: string; x: number; y: number };

const STAMP_EMOJIS = ["👍", "🔥", "⭐", "✅", "❗", "❤️", "🎉", "👀", "💡", "❓"];
// Shape types offered by the square-tool picker; each is rendered as a parametric SVG path.
const SHAPE_TYPES = ["rectangle", "roundRect", "ellipse", "triangle", "diamond", "parallelogram", "hexagon", "star", "cylinder", "cloud"];
const LINK_SELECTION_PREFIX = "link:";

// Old boards have positional {from,to} links. Give those deterministic IDs on load so
// they can participate in selection/restyling without changing their visual defaults.
function legacyLinkId(link: WbLink, index: number): string {
  const key = `${link.from}\u0000${link.to}\u0000${index}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `l_legacy_${(hash >>> 0).toString(36)}_${index}`;
}
function linkId(link: WbLink, index: number): string {
  return link.id || legacyLinkId(link, index);
}
function normalizeLinks(links: WbLink[]): WbLink[] {
  return links.map((link, index) => (link.id ? link : { ...link, id: legacyLinkId(link, index) }));
}
function linkSelectionId(id: string): string {
  return LINK_SELECTION_PREFIX + id;
}
function selectedLinkId(selectionId: string): string | null {
  return selectionId.startsWith(LINK_SELECTION_PREFIX) ? selectionId.slice(LINK_SELECTION_PREFIX.length) : null;
}
// Minimap drawing-area size (px), inside its own padded card — see .wb-minimap-inner.
const MM_W = 176, MM_H = 120;
// World→minimap projection for a layout computed by getMinimapLayout().
function mmPoint(l: { minx: number; miny: number; scale: number; offX: number; offY: number }, wx: number, wy: number) {
  return { x: (wx - l.minx) * l.scale + l.offX, y: (wy - l.miny) * l.scale + l.offY };
}

// Which selected elements a given style control targets.
const isShapeEl = (e: WbEl) => e.type === "rect" || e.type === "circle";
const isTextEl = (e: WbEl) => e.type === "text" || e.type === "sticky" || e.type === "rect" || e.type === "circle";

// Normalize a color for a native <input type="color"> (needs #rrggbb); legacy rgba() fills fall back.
function toHex(c?: string, fallback = "#4DC4E8"): string {
  if (!c) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return fallback;
}
// Rounded-rect path (r=0 → sharp corners); one <path> so every shape shares the same element type.
function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  if (r <= 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}
// Ellipse as a two-arc path (keeps everything a <path> so styling props spread onto one element type).
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
}
const AVCOL = [
  "var(--color-navy-800)",
  "var(--color-sky-500)",
  "#5b8def",
  "#7c5cbf",
  "#2fa37a",
  "#c2772f",
  "#b5495b",
];
const P: Record<string, string> = {
  cursor: "M5 3l14 6-6 2-2 6z",
  sticky: "M5 4h14v10l-5 5H5z M19 14h-5v5",
  type: "M5 6.5V5h14v1.5 M12 5v14 M9.5 19h5",
  square: "M4 5h16v14H4z",
  circle: "M12 3a9 9 0 100 18 9 9 0 000-18z",
  frame: "M7 3v18 M17 3v18 M3 7h18 M3 17h18",
  conn: "M6 18.5a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z M18 9.5a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z M8 15l8-6",
  card: "M4 5h16v14H4z M7.5 9.5h9 M7.5 13h6",
  image: "M4 5h16v14H4z M8.5 11a1.6 1.6 0 100-3.2A1.6 1.6 0 008.5 11z M4 16l5-4 4 3 3-2 4 3",
  smile: "M12 3a9 9 0 100 18 9 9 0 000-18z M9 10h.01 M15 10h.01 M8.5 14.5c1 1.2 5.5 1.2 7 0",
  comment: "M4 5h16v10H9l-4 4V5z",
  check: "M9 11l3 3L22 4 M21 12v7a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h11",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
};

function Icon({ d, w }: { d: string; w?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" style={w ? { width: w, height: w } : undefined}>
      {d.split(" M").map((seg, i) => (
        <path key={i} d={(i === 0 ? seg : "M" + seg)} />
      ))}
    </svg>
  );
}

class WhiteboardCanvas extends React.Component<Props, State> {
  canvasEl: HTMLDivElement | null = null;
  drag: DragState | null = null;
  replyInputRef: React.RefObject<HTMLInputElement | null>;
  _mm?: (e: MouseEvent) => void;
  _mu?: () => void;
  saveTimer: ReturnType<typeof setTimeout> | null = null;
  es: EventSource | null = null;
  lastCursorSent = 0;
  lastDragEmit = 0;
  titleEmitTimer: ReturnType<typeof setTimeout> | null = null;
  _wheel?: (e: WheelEvent) => void;
  _kd?: (e: KeyboardEvent) => void;
  _ku?: (e: KeyboardEvent) => void;
  spaceDown = false;
  fileInput: HTMLInputElement | null = null;
  clipboard: WbEl[] = [];
  undoStack: UndoEntry[] = [];
  redoStack: UndoEntry[] = [];
  minimapEl: HTMLDivElement | null = null;
  mmDragging = false;
  searchInputEl: HTMLInputElement | null = null;

  constructor(props: Props) {
    super(props);
    const doc = props.initialData;
    const els = doc && Array.isArray(doc.elements) && doc.elements.length ? doc.elements : this.blankBoard();
    this.state = {
      elements: els,
      links: doc && Array.isArray(doc.links) ? normalizeLinks(doc.links) : [],
      title: props.initialTitle,
      tool: "select",
      selected: [],
      editingId: null,
      zoom: 0.72,
      pan: { x: 80, y: 60 },
      panning: false,
      connectFrom: null,
      threadId: null,
      shareOpen: false,
      convertOpen: false,
      convTasks: [],
      converting: false,
      saveState: "idle",
      presenceUsers: [],
      remoteCursors: {},
      connId: null,
      stampEmoji: "👍",
      shapeType: "rectangle",
      marquee: null,
      menu: null,
      searchOpen: false,
      searchQuery: "",
      reactionEmoji: "👍",
      reactions: [],
      replyText: "",
      mentionOpen: false,
      mentionQuery: "",
      mentionIndex: 0,
    };
    this.replyInputRef = React.createRef<HTMLInputElement>();
  }

  // A fresh board starts truly empty; the empty-state hint is a non-interactive
  // overlay (see render), not a placeholder element that could be selected/converted.
  blankBoard(): WbEl[] {
    return [];
  }

  // ── lifecycle ────────────────────────────────────────────────────────
  componentDidMount() {
    this._mm = (e: MouseEvent) => this.onWinMove(e);
    this._mu = () => this.onWinUp();
    window.addEventListener("mousemove", this._mm);
    window.addEventListener("mouseup", this._mu);
    // Keyboard nav (arrows pan, +/-/0 zoom) + space-to-pan, like Miro. Ignored while
    // typing in an input / contentEditable so it never hijacks text entry.
    this._kd = (e: KeyboardEvent) => this.onKeyDown(e);
    this._ku = (e: KeyboardEvent) => {
      if (e.code === "Space") this.spaceDown = false;
    };
    window.addEventListener("keydown", this._kd);
    window.addEventListener("keyup", this._ku);
    setTimeout(() => this.fitView(), 0);
    this.connectLive();
  }
  componentWillUnmount() {
    if (this._mm) window.removeEventListener("mousemove", this._mm);
    if (this._mu) window.removeEventListener("mouseup", this._mu);
    if (this._kd) window.removeEventListener("keydown", this._kd);
    if (this._ku) window.removeEventListener("keyup", this._ku);
    if (this.canvasEl && this._wheel) this.canvasEl.removeEventListener("wheel", this._wheel);
    window.removeEventListener("mousemove", this.onMinimapMove);
    window.removeEventListener("mouseup", this.onMinimapUp);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.titleEmitTimer) clearTimeout(this.titleEmitTimer);
    if (this.es) this.es.close();
  }

  isTyping(): boolean {
    const a = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    if (!a) return false;
    const tag = a.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || a.isContentEditable;
  }
  onKeyDown(e: KeyboardEvent) {
    // Bold/Italic apply to the whole selected text/label element — allowed while editing
    // that SAME canvas element's own contentEditable (preventDefault stops the browser's
    // execCommand from also firing), but must never hijack Cmd+B/I typed into an unrelated
    // field (board-title rename, comment reply, Convert-to-tasks modal, share invite…).
    if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B" || e.key === "i" || e.key === "I")) {
      const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      const editingOwnElement = !!active && active.isContentEditable && !!active.closest("[data-el-id]");
      if (!this.isTyping() || editingOwnElement) {
        const hasText = this.state.selected.some((id) => { const el = this.el(id); return !!el && isTextEl(el); });
        if (hasText) { this.toggleTextStyle(e.key.toLowerCase() === "b" ? "bold" : "italic"); e.preventDefault(); return; }
      }
    }
    if (this.isTyping()) return;
    if (e.code === "Space") {
      this.spaceDown = true;
      e.preventDefault();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { this.undo(); e.preventDefault(); return; }
      if ((k === "z" && e.shiftKey) || k === "y") { this.redo(); e.preventDefault(); return; }
      if (k === "c") { this.copySelection(); e.preventDefault(); return; }
      if (k === "x") { this.cutSelection(); e.preventDefault(); return; }
      if (k === "v") { this.pasteClipboard(); e.preventDefault(); return; }
      if (k === "d") { this.onDuplicate(); e.preventDefault(); return; }
      if (k === "a") { this.selectAll(); e.preventDefault(); return; }
      if (k === "g") { if (e.shiftKey) this.ungroupSelection(); else this.groupSelection(); e.preventDefault(); return; }
      if (k === "f") { this.openSearch(); e.preventDefault(); return; }
      return; // leave other Cmd/Ctrl combos to the browser
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.state.selected.length) {
      this.onDelete();
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") { this.clearSel(); this.setState({ menu: null }); return; }
    // Single-key tool hotkeys (Miro-style), when not typing.
    const toolKeys: Record<string, string> = { v: "select", s: "sticky", n: "sticky", t: "text", r: "square", o: "circle", f: "frame", l: "connector", c: "comment" };
    if (toolKeys[e.key]) { this.setTool(toolKeys[e.key])(); e.preventDefault(); return; }
    if (e.key === "i") { this.openImagePicker(); e.preventDefault(); return; }
    const step = e.shiftKey ? 200 : 70;
    switch (e.key) {
      case "ArrowLeft": this.setState((s) => ({ pan: { x: s.pan.x + step, y: s.pan.y } })); e.preventDefault(); break;
      case "ArrowRight": this.setState((s) => ({ pan: { x: s.pan.x - step, y: s.pan.y } })); e.preventDefault(); break;
      case "ArrowUp": this.setState((s) => ({ pan: { x: s.pan.x, y: s.pan.y + step } })); e.preventDefault(); break;
      case "ArrowDown": this.setState((s) => ({ pan: { x: s.pan.x, y: s.pan.y - step } })); e.preventDefault(); break;
      case "+": case "=": this.zoomIn(); e.preventDefault(); break;
      case "-": case "_": this.zoomOut(); e.preventDefault(); break;
      case "0": this.fitView(); e.preventDefault(); break;
      default: break;
    }
  }
  // Trackpad/mouse wheel: two-finger scroll pans; ctrl/⌘+scroll (and pinch, which the
  // browser reports as ctrl+wheel) zooms toward the cursor — the Miro/Figma convention.
  onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      this.zoomAt(factor, e.clientX, e.clientY);
    } else {
      this.setState((s) => ({ pan: { x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY } }));
    }
  }
  zoomAt(factor: number, clientX: number, clientY: number) {
    if (!this.canvasEl) return;
    const r = this.canvasEl.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    const z = this.state.zoom;
    const nz = Math.min(2.5, Math.max(0.2, z * factor));
    const wx = (cx - this.state.pan.x) / z, wy = (cy - this.state.pan.y) / z;
    this.setState({ zoom: nz, pan: { x: cx - wx * nz, y: cy - wy * nz } });
  }

  // ── live collaboration ───────────────────────────────────────────────
  connectLive() {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/hr/whiteboards/${this.props.boardId}/stream`);
    this.es = es;
    es.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.handleLiveEvent(msg);
    };
    // EventSource auto-reconnects on error; nothing to do here but swallow it.
    es.onerror = () => {};
  }
  handleLiveEvent(msg: Record<string, unknown>) {
    switch (msg.t) {
      case "hello":
        this.setState({ connId: (msg as { connId?: string }).connId ?? null });
        break;
      case "presence":
        this.setState({ presenceUsers: (msg.users as BoardUser[]) || [] });
        break;
      case "op":
        this.applyRemoteOp(msg.op as LiveOp);
        break;
      case "cursor": {
        const c = msg as unknown as RemoteCursor & { connId: string };
        this.setState((s) => ({ remoteCursors: { ...s.remoteCursors, [c.connId]: { userId: c.userId, name: c.name, color: c.color, x: c.x, y: c.y } } }));
        break;
      }
      case "leave": {
        const connId = (msg as { connId?: string }).connId;
        if (connId)
          this.setState((s) => {
            const next = { ...s.remoteCursors };
            delete next[connId];
            return { remoteCursors: next };
          });
        break;
      }
    }
  }
  // POST an op to peers. Fire-and-forget; identity is attached server-side from the session.
  emit(op: LiveOp) {
    if (!this.state.connId) return;
    fetch(`/api/hr/whiteboards/${this.props.boardId}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connId: this.state.connId, kind: "op", op }),
    }).catch(() => {});
  }
  // Apply a peer's op to local state WITHOUT re-emitting (no echo loop). Also schedules
  // an autosave so the receiver persists too — resilient if the origin disconnects.
  applyRemoteOp(op: LiveOp) {
    if (op.k === "reaction") {
      this.triggerLocalReaction(op.emoji, op.x, op.y);
      return;
    }
    this.setState((s) => {
      let elements = s.elements;
      let links = s.links;
      let title = s.title;
      if (op.k === "upsert") {
        elements = s.elements.some((e) => e.id === op.el.id)
          ? s.elements.map((e) => (e.id === op.el.id ? op.el : e))
          : s.elements.concat(op.el);
      } else if (op.k === "upsertMany") {
        const map = new Map(op.els.map((e) => [e.id, e]));
        const seen = new Set<string>();
        elements = s.elements.map((e) => {
          const u = map.get(e.id);
          if (u) { seen.add(e.id); return u; }
          return e;
        });
        for (const e of op.els) if (!seen.has(e.id)) elements = elements.concat(e);
      } else if (op.k === "delete") {
        const del = new Set(op.ids);
        elements = s.elements.filter((e) => !del.has(e.id));
        links = s.links.filter((l) => !del.has(l.from) && !del.has(l.to));
      } else if (op.k === "links") {
        links = normalizeLinks(op.links);
      } else if (op.k === "title") {
        title = op.title;
      } else if (op.k === "order") {
        const pos = new Map(op.ids.map((id, i) => [id, i]));
        elements = [...s.elements].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
      }
      return { elements, links, title };
    }, () => this.scheduleSave());
  }
  // Cursor position (world coords), throttled to ~15/sec.
  sendCursor(clientX: number, clientY: number) {
    if (!this.state.connId) return;
    const now = Date.now();
    if (now - this.lastCursorSent < 60) return;
    this.lastCursorSent = now;
    const w = this.toWorld(clientX, clientY);
    fetch(`/api/hr/whiteboards/${this.props.boardId}/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connId: this.state.connId, kind: "cursor", x: w.x, y: w.y }),
    }).catch(() => {});
  }

  setCanvasRef = (el: HTMLDivElement | null) => {
    // Wheel must be a non-passive native listener so we can preventDefault (React's
    // onWheel is passive and can't stop the page/scroll from moving).
    if (this.canvasEl && this._wheel) this.canvasEl.removeEventListener("wheel", this._wheel);
    this.canvasEl = el;
    if (el) {
      this._wheel = (e: WheelEvent) => this.onWheel(e);
      el.addEventListener("wheel", this._wheel, { passive: false });
    }
  };

  // ── persistence ──────────────────────────────────────────────────────
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.setState({ saveState: "saving" });
    this.saveTimer = setTimeout(() => this.doSave(), 800);
  }
  async doSave() {
    try {
      await fetch(`/api/hr/whiteboards/${this.props.boardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: this.state.title,
          data: { elements: this.state.elements, links: this.state.links },
        }),
      });
      this.setState({ saveState: "saved" });
    } catch {
      this.setState({ saveState: "idle" });
    }
  }
  // Wrap setState so any change that mutates the document triggers an autosave.
  mutate(updater: (s: State) => Partial<State>) {
    this.setState(
      (s) => updater(s) as State,
      () => this.scheduleSave(),
    );
  }

  // ── undo / redo (per-user, op-based) ─────────────────────────────────
  snapshotEls(ids: string[]): { id: string; el: WbEl | null }[] {
    return ids.map((id) => {
      const e = this.el(id);
      return { id, el: e ? { ...e } : null };
    });
  }
  commitUndo(entry: UndoEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = [];
  }
  // Capture the BEFORE state of `ids` (call right before a mutating action). Clears
  // the redo stack. `includeLinks` also snapshots links (for connector add/delete).
  pushUndo(ids: string[], includeLinks = false) {
    const entry: UndoEntry = { els: this.snapshotEls(ids) };
    if (includeLinks) entry.links = this.state.links.map((l) => ({ ...l }));
    this.commitUndo(entry);
  }
  // Apply an entry (restore the snapshot) and return the inverse entry (current state
  // of those ids) for the opposite stack. Emits ops so peers stay in sync.
  applyUndoEntry(entry: UndoEntry): UndoEntry {
    const inverse: UndoEntry = {
      els: entry.els.map((e) => {
        const cur = this.el(e.id);
        return { id: e.id, el: cur ? { ...cur } : null };
      }),
    };
    if (entry.links) inverse.links = this.state.links.map((l) => ({ ...l }));

    this.setState(
      (s) => {
        let elements = [...s.elements];
        for (const e of entry.els) {
          const idx = elements.findIndex((x) => x.id === e.id);
          if (e.el === null) {
            if (idx >= 0) elements.splice(idx, 1);
          } else if (idx >= 0) {
            elements[idx] = e.el;
          } else {
            elements = elements.concat(e.el);
          }
        }
        const links = entry.links ? entry.links : s.links;
        return { elements, links, selected: [], editingId: null };
      },
      () => this.scheduleSave(),
    );

    // Broadcast the restored/removed elements to peers.
    for (const e of entry.els) {
      if (e.el === null) this.emit({ k: "delete", ids: [e.id] });
      else this.emit({ k: "upsert", el: e.el });
    }
    if (entry.links) this.emit({ k: "links", links: entry.links });
    return inverse;
  }
  undo = () => {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(this.applyUndoEntry(entry));
  };
  redo = () => {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(this.applyUndoEntry(entry));
  };

  // ── clipboard ────────────────────────────────────────────────────────
  copySelection() {
    const els = this.state.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    if (els.length) this.clipboard = els.map((e) => ({ ...e }));
  }
  pasteClipboard() {
    if (!this.clipboard.length) return;
    // Offset the batch and give fresh ids; paste near the viewport center.
    const suffix = Date.now().toString(36).slice(-4);
    const added: WbEl[] = this.clipboard.map((e, i) => ({
      ...e,
      id: `p_${suffix}_${i}`,
      x: e.x + 28,
      y: e.y + 28,
      frameId: undefined,
      uploading: false,
    }));
    this.pushUndo(added.map((a) => a.id));
    this.mutate((s) => ({ elements: s.elements.concat(added), selected: added.map((a) => a.id) }));
    if (added.length) this.emit({ k: "upsertMany", els: added });
  }
  cutSelection() {
    this.copySelection();
    this.onDelete();
  }
  selectAll() {
    this.setState({ selected: this.state.elements.map((e) => e.id), editingId: null });
  }

  // ── helpers ──────────────────────────────────────────────────────────
  el(id: string) {
    return this.state.elements.find((e) => e.id === id);
  }
  initials(n?: string | null) {
    const p = (n || "?").trim().split(/\s+/);
    return p.length > 1 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0] || "?").slice(0, 2).toUpperCase();
  }
  avColor(n?: string | null) {
    let h = 0;
    const s = n || "?";
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVCOL[h % AVCOL.length];
  }
  avStyle(n: string | null | undefined, size?: number): React.CSSProperties {
    const z = size || 24;
    return { width: z, height: z, fontSize: Math.round(z * 0.4), background: this.avColor(n) };
  }
  rot(e: WbEl): React.CSSProperties {
    return e.rotation ? { transform: `rotate(${e.rotation}deg)` } : {};
  }
  guessPri(t?: string) {
    const s = (t || "").toLowerCase();
    if (/kickoff|intake|urgent|call/.test(s)) return "High";
    if (/\?$/.test((t || "").trim())) return "Low";
    return "Medium";
  }
  fmtDue(d?: string) {
    if (!d) return "No date";
    const p = d.split("-");
    const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return m[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10);
  }
  dueFor(i: number) {
    const base = 14 + i * 2;
    const day = base > 31 ? base - 31 : base;
    const mo = base > 31 ? "08" : "07";
    return "2026-" + mo + "-" + (day < 10 ? "0" : "") + day;
  }
  toWorld(cx: number, cy: number) {
    const el = this.canvasEl;
    if (!el) return { x: cx, y: cy };
    const r = el.getBoundingClientRect();
    return { x: (cx - r.left - this.state.pan.x) / this.state.zoom, y: (cy - r.top - this.state.pan.y) / this.state.zoom };
  }
  fitView() {
    const c = this.canvasEl;
    if (!c || !this.state.elements.length) return;
    const r = c.getBoundingClientRect();
    let minx = 1e9,
      miny = 1e9,
      maxx = -1e9,
      maxy = -1e9;
    this.state.elements.forEach((e) => {
      const w = e.w || 40,
        h = e.h || 40;
      minx = Math.min(minx, e.x);
      miny = Math.min(miny, e.y);
      maxx = Math.max(maxx, e.x + w);
      maxy = Math.max(maxy, e.y + h);
    });
    const pad = 70;
    const cw = maxx - minx + pad * 2,
      ch = maxy - miny + pad * 2;
    const z = Math.max(0.3, Math.min(1.05, Math.min(r.width / cw, r.height / ch)));
    this.setState({ zoom: z, pan: { x: r.width / 2 - ((minx + maxx) / 2) * z, y: r.height / 2 - ((miny + maxy) / 2) * z } });
  }

  // ── nav / chrome ─────────────────────────────────────────────────────
  exitBoard = () => this.props.navigate(`/hr/projects/${this.props.projectId}`);
  toggleShare = () => this.setState((s) => ({ shareOpen: !s.shareOpen }));
  stop = (e: React.MouseEvent) => e.stopPropagation();
  onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    this.setState({ title });
    if (this.titleEmitTimer) clearTimeout(this.titleEmitTimer);
    this.titleEmitTimer = setTimeout(() => {
      this.emit({ k: "title", title });
      this.scheduleSave();
    }, 300);
  };
  onTitleBlur = () => {
    if (!this.state.title.trim()) this.setState({ title: "Untitled board" });
  };

  // ── tools ────────────────────────────────────────────────────────────
  setTool = (t: string) => () => this.setState({ tool: t, connectFrom: null });
  clearSel() {
    this.setState({ selected: [], editingId: null, threadId: null, replyText: "", mentionOpen: false, mentionQuery: "" });
  }
  onCanvasDown = (e: React.MouseEvent) => {
    if (this.state.shareOpen) this.setState({ shareOpen: false });
    // Hold Space (or middle-mouse) to pan even when starting over an element — Miro-style.
    if (this.spaceDown || e.button === 1) {
      this.drag = { mode: "pan", sx: e.clientX, sy: e.clientY, px: this.state.pan.x, py: this.state.pan.y };
      this.setState({ panning: true });
      e.preventDefault();
      return;
    }
    const target = e.target as Element;
    const node = target.closest("[data-el-id]") as HTMLElement | null;
    const linkNode = target.closest("[data-link-id]") as SVGElement | null;
    const tool = this.state.tool;
    // Connector hit paths remain selectable from any active tool. Link selections share
    // `selected` via a namespaced ID, so all existing element-only helpers keep working.
    if (linkNode) {
      const id = linkNode.getAttribute("data-link-id");
      if (!id) return;
      const selectionId = linkSelectionId(id);
      const selected = e.shiftKey
        ? this.state.selected.includes(selectionId)
          ? this.state.selected.filter((x) => x !== selectionId)
          : this.state.selected.concat(selectionId)
        : [selectionId];
      this.setState({ selected, editingId: null, threadId: null, connectFrom: null, tool: "select" });
      e.preventDefault();
      return;
    }
    if (tool === "connector") {
      if (node) {
        const id = node.dataset.elId!;
        if (!this.state.connectFrom) this.setState({ connectFrom: id });
        else if (this.state.connectFrom !== id) {
          const newLink: WbLink = {
            id: `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            from: this.state.connectFrom,
            to: id,
            connectorType: "curved",
            stroke: "#7180B5",
            strokeWidth: 2.2,
            strokeStyle: "solid",
            startCap: "none",
            endCap: "arrow",
          };
          const newLinks = this.state.links.concat(newLink);
          this.pushUndo([], true);
          this.mutate(() => ({ links: newLinks, connectFrom: null, tool: "select", selected: [linkSelectionId(newLink.id!)] }));
          this.emit({ k: "links", links: newLinks });
        }
      } else {
        this.setState({ connectFrom: null });
      }
      return;
    }
    if (tool === "reaction") {
      const w = this.toWorld(e.clientX, e.clientY);
      const emoji = this.state.reactionEmoji || "👍";
      this.triggerLocalReaction(emoji, w.x, w.y);
      this.emit({ k: "reaction", emoji, x: w.x, y: w.y });
      return;
    }
    if (tool !== "select") {
      const w = this.toWorld(e.clientX, e.clientY);
      this.createAt(tool, w);
      return;
    }
    if (node) {
      const id = node.dataset.elId!;
      if (this.state.editingId === id) return;
      const add = e.shiftKey;
      const group = this.withGroup(id); // clicking a grouped element selects the whole group
      let sel: string[];
      if (add) sel = this.state.selected.includes(id) ? this.state.selected.filter((x) => !group.includes(x)) : Array.from(new Set([...this.state.selected, ...group]));
      else sel = group.every((g) => this.state.selected.includes(g)) ? this.state.selected : group;
      const elx = this.el(id);
      if (elx && elx.type === "comment" && !add) {
        this.setState({ selected: sel, threadId: this.state.threadId === id ? null : id, editingId: null, replyText: "", mentionOpen: false, mentionQuery: "" });
      } else {
        this.setState({ selected: sel, editingId: null, threadId: null, replyText: "", mentionOpen: false, mentionQuery: "" });
      }
      // Locked elements select (so you can unlock) but don't drag.
      if (!sel.some((sid) => this.el(sid)?.locked)) this.beginElDrag(e, sel);
    } else {
      // Empty canvas + Select tool → rubber-band marquee select (Figma/Miro trackpad
      // style). Pan is available via Space+drag, middle-mouse, wheel, or arrows.
      if (!e.shiftKey) this.clearSel();
      this.drag = { mode: "marquee", sx: e.clientX, sy: e.clientY, mx: e.clientX, my: e.clientY, addTo: e.shiftKey ? [...this.state.selected] : [] };
      this.setState({ shareOpen: false });
    }
  };
  beginElDrag(e: React.MouseEvent, sel: string[]) {
    const ids = new Set(sel);
    this.state.elements.forEach((el) => {
      if (el.frameId && ids.has(el.frameId)) ids.add(el.id);
    });
    const idList = [...ids];
    const snap = this.state.elements.filter((el) => ids.has(el.id)).map((el) => ({ id: el.id, x: el.x, y: el.y }));
    this.drag = { mode: "el", sx: e.clientX, sy: e.clientY, snap, undoIds: idList };
  }
  onCanvasDblClick = (e: React.MouseEvent) => {
    const node = (e.target as HTMLElement).closest("[data-el-id]") as HTMLElement | null;
    if (!node) return;
    const id = node.dataset.elId!;
    const el = this.el(id);
    if (el && (el.type === "sticky" || el.type === "text" || el.type === "card" || el.type === "rect" || el.type === "circle")) {
      this.setState({ editingId: id, selected: [id] });
    }
  };
  onWinMove(e: MouseEvent) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.sx,
      dy = e.clientY - this.drag.sy;
    if (this.drag.mode === "pan") {
      this.setState({ pan: { x: (this.drag.px || 0) + dx, y: (this.drag.py || 0) + dy } });
    } else if (this.drag.mode === "marquee") {
      this.drag.moved = true;
      const x = Math.min(this.drag.mx!, e.clientX);
      const y = Math.min(this.drag.my!, e.clientY);
      const w = Math.abs(e.clientX - this.drag.mx!);
      const h = Math.abs(e.clientY - this.drag.my!);
      const hit = this.marqueeHits({ x, y, w, h });
      const sel = Array.from(new Set([...(this.drag.addTo || []), ...hit]));
      this.setState({ marquee: { x, y, w, h }, selected: sel });
    } else if (this.drag.mode === "resize") {
      this.drag.moved = true;
      const p = this.toWorld(e.clientX, e.clientY);
      const el = this.el(this.drag.elId!);
      if (!el) return;
      const box = this.resizeBox(this.drag, p, el.type, e.shiftKey);
      this.setState(
        (st) => ({ elements: st.elements.map((x) => (x.id === el.id ? { ...x, ...box } : x)) }),
        () => this.throttleEmitEl(el.id),
      );
    } else if (this.drag.mode === "rotate") {
      this.drag.moved = true;
      const elId = this.drag.elId!;
      const p = this.toWorld(e.clientX, e.clientY);
      let ang = (Math.atan2(p.y - this.drag.center!.y, p.x - this.drag.center!.x) * 180) / Math.PI;
      ang = (this.drag.startRot || 0) + (ang - this.drag.startAngle!);
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      const rot = Math.round(ang);
      this.setState(
        (st) => ({ elements: st.elements.map((x) => (x.id === elId ? { ...x, rotation: rot } : x)) }),
        () => this.throttleEmitEl(elId),
      );
    } else if (this.drag.mode === "el") {
      if (!this.drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      this.drag.moved = true;
      const z = this.state.zoom;
      const map: Record<string, { x: number; y: number }> = {};
      this.drag.snap!.forEach((s) => {
        map[s.id] = { x: s.x + dx / z, y: s.y + dy / z };
      });
      this.setState(
        (st) => ({ elements: st.elements.map((el) => (map[el.id] ? { ...el, x: map[el.id].x, y: map[el.id].y } : el)) }),
        () => {
          const now = Date.now();
          if (now - this.lastDragEmit < 50) return;
          this.lastDragEmit = now;
          const moving = this.state.elements.filter((el) => map[el.id]);
          if (moving.length) this.emit({ k: "upsertMany", els: moving });
        },
      );
    }
  }
  throttleEmitEl(id: string) {
    const now = Date.now();
    if (now - this.lastDragEmit < 50) return;
    this.lastDragEmit = now;
    const el = this.el(id);
    if (el) this.emit({ k: "upsert", el });
  }
  onWinUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === "pan") this.setState({ panning: false });
    if (d.mode === "marquee") {
      this.setState({ marquee: null });
      return;
    }
    if ((d.mode === "resize" || d.mode === "rotate") && d.moved && d.elId) {
      const before = d.box
        ? [{ id: d.elId, el: { ...(this.el(d.elId) as WbEl), x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h, rotation: d.startRot ?? this.el(d.elId)?.rotation } }]
        : this.snapshotEls([d.elId]);
      // For rotate, restore rotation; for resize, restore box. Use the captured start box.
      if (d.mode === "rotate" && d.box) before[0].el = { ...(this.el(d.elId) as WbEl), rotation: d.startRot };
      this.commitUndo({ els: before });
      const el = this.el(d.elId);
      if (el) this.emit({ k: "upsert", el });
      this.scheduleSave();
      return;
    }
    if (d.mode === "el" && d.moved && d.snap) {
      // Undo restores pre-drag positions (only x,y changed during a move).
      const before = d.snap.map((s) => {
        const cur = this.el(s.id);
        return { id: s.id, el: cur ? { ...cur, x: s.x, y: s.y } : null };
      });
      this.commitUndo({ els: before });
      const finalEls = this.state.elements.filter((el) => d.snap!.some((s) => s.id === el.id));
      if (finalEls.length) this.emit({ k: "upsertMany", els: finalEls });
      this.scheduleSave();
    }
  }

  // ── resize / rotate transform math ───────────────────────────────────
  // Which handles a type exposes: images = 4 corners (aspect-locked), text = E/W only, else 8.
  handleSet(type: string): { nx: number; ny: number }[] {
    if (type === "image") return [{ nx: -1, ny: -1 }, { nx: 1, ny: -1 }, { nx: 1, ny: 1 }, { nx: -1, ny: 1 }];
    if (type === "text") return [{ nx: -1, ny: 0 }, { nx: 1, ny: 0 }];
    return [
      { nx: -1, ny: -1 }, { nx: 0, ny: -1 }, { nx: 1, ny: -1 }, { nx: 1, ny: 0 },
      { nx: 1, ny: 1 }, { nx: 0, ny: 1 }, { nx: -1, ny: 1 }, { nx: -1, ny: 0 },
    ];
  }
  minSize(type: string): { w: number; h: number } {
    if (type === "text") return { w: 40, h: 24 };
    if (type === "frame") return { w: 120, h: 100 };
    if (type === "sticky") return { w: 60, h: 60 };
    return { w: 24, h: 24 };
  }
  startResize = (nx: number, ny: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const id = this.state.selected[0];
    const el = this.el(id);
    if (!el) return;
    this.drag = {
      mode: "resize", sx: e.clientX, sy: e.clientY, elId: id, nx, ny,
      box: { x: el.x, y: el.y, w: el.w || 40, h: el.h || 40, rot: el.rotation || 0 },
    };
  };
  startRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const id = this.state.selected[0];
    const el = this.el(id);
    if (!el) return;
    const cx = el.x + (el.w || 40) / 2, cy = el.y + (el.h || 40) / 2;
    const p = this.toWorld(e.clientX, e.clientY);
    this.drag = {
      mode: "rotate", sx: e.clientX, sy: e.clientY, elId: id,
      center: { x: cx, y: cy },
      startAngle: (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI,
      startRot: el.rotation || 0,
      box: { x: el.x, y: el.y, w: el.w || 40, h: el.h || 40, rot: el.rotation || 0 },
    };
  };
  // Compute a new {x,y,w,h} for a resize drag, correct for the element's rotation.
  resizeBox(d: DragState, p: { x: number; y: number }, type: string, shift: boolean) {
    const b = d.box!;
    const nx = d.nx!, ny = d.ny!;
    const th = (b.rot * Math.PI) / 180;
    const ux = Math.cos(th), uy = Math.sin(th); // local +x in world
    const vx = -Math.sin(th), vy = Math.cos(th); // local +y in world
    const c0x = b.x + b.w / 2, c0y = b.y + b.h / 2;
    const cX = nx !== 0, cY = ny !== 0;
    const flx = cX ? -nx * (b.w / 2) : 0, fly = cY ? -ny * (b.h / 2) : 0; // fixed point (local)
    const fwx = c0x + flx * ux + fly * vx, fwy = c0y + flx * uy + fly * vy; // fixed (world)
    const du = (p.x - fwx) * ux + (p.y - fwy) * uy;
    const dv = (p.x - fwx) * vx + (p.y - fwy) * vy;
    const min = this.minSize(type);
    let w = cX ? Math.max(min.w, Math.abs(du)) : b.w;
    let h = cY ? Math.max(min.h, Math.abs(dv)) : b.h;
    const lock = type === "image" || (shift && (type === "rect" || type === "circle"));
    if (lock && cX && cY) {
      const asp = b.w / b.h;
      if (w / b.w > h / b.h) h = w / asp;
      else w = h * asp;
    }
    const ccx = fwx + (cX ? nx * (w / 2) * ux : 0) + (cY ? ny * (h / 2) * vx : 0);
    const ccy = fwy + (cX ? nx * (w / 2) * uy : 0) + (cY ? ny * (h / 2) * vy : 0);
    return { x: ccx - w / 2, y: ccy - h / 2, w, h };
  }
  // Elements whose bounding boxes intersect the marquee rect (screen px → world).
  marqueeHits(rect: { x: number; y: number; w: number; h: number }): string[] {
    const a = this.toWorld(rect.x, rect.y);
    const b = this.toWorld(rect.x + rect.w, rect.y + rect.h);
    const rx0 = Math.min(a.x, b.x), ry0 = Math.min(a.y, b.y), rx1 = Math.max(a.x, b.x), ry1 = Math.max(a.y, b.y);
    return this.state.elements
      .filter((e) => {
        const ex1 = e.x + (e.w || 36), ey1 = e.y + (e.h || 36);
        return e.x < rx1 && ex1 > rx0 && e.y < ry1 && ey1 > ry0;
      })
      .map((e) => e.id);
  }
  createAt(tool: string, w: { x: number; y: number }) {
    const id = tool[0] + "_" + Date.now().toString(36);
    let el: WbEl | null = null;
    if (tool === "sticky") el = { id, type: "sticky", x: w.x - 86, y: w.y - 59, w: 172, h: 118, text: "New idea", color: "#FFE8A3" };
    else if (tool === "text") el = { id, type: "text", x: w.x - 40, y: w.y - 14, w: 200, h: 30, text: "Text", size: 18, weight: 600 };
    else if (tool === "square") el = { id, type: "rect", x: w.x - 70, y: w.y - 45, w: 140, h: 90, shapeType: this.state.shapeType, fill: "#4DC4E8", fillOpacity: 0.16, stroke: "#4DC4E8", strokeWidth: 2, strokeStyle: "solid", radius: this.state.shapeType === "roundRect" ? 14 : 0 };
    else if (tool === "circle") el = { id, type: "circle", x: w.x - 55, y: w.y - 55, w: 110, h: 110, shapeType: "ellipse", fill: "#7C5CBF", fillOpacity: 0.16, stroke: "#7C5CBF", strokeWidth: 2, strokeStyle: "solid" };
    else if (tool === "frame") el = { id, type: "frame", x: w.x - 160, y: w.y - 120, w: 320, h: 240, title: "New frame", tint: "navy" };
    else if (tool === "card") el = { id, type: "card", x: w.x - 116, y: w.y - 75, w: 232, h: 150, text: "New task", assignee: "Unassigned", priority: "Medium", due: "" };
    else if (tool === "image") el = { id, type: "image", x: w.x - 115, y: w.y - 75, w: 230, h: 150, text: "screenshot.png" };
    else if (tool === "stamp") el = { id, type: "stamp", x: w.x - 18, y: w.y - 18, emoji: this.state.stampEmoji };
    else if (tool === "comment") el = { id, type: "comment", x: w.x - 17, y: w.y - 17, count: 1, author: "You", text: "New comment" };
    if (!el) return;
    const editing = tool === "sticky" || tool === "text";
    this.pushUndo([id]);
    this.mutate((s) => ({
      elements: s.elements.concat(el!),
      tool: "select",
      selected: [id],
      editingId: editing ? id : null,
      threadId: tool === "comment" ? id : null,
    }));
    this.emit({ k: "upsert", el });
  }

  // ── arrange: z-order, lock, group, align/distribute, zoom-to-selection ─
  reorderSelection(mode: "front" | "back" | "forward" | "backward") {
    const sel = new Set(this.state.selected);
    if (!sel.size) return;
    this.mutate((s) => {
      let elements = [...s.elements];
      if (mode === "front") elements = [...elements.filter((e) => !sel.has(e.id)), ...elements.filter((e) => sel.has(e.id))];
      else if (mode === "back") elements = [...elements.filter((e) => sel.has(e.id)), ...elements.filter((e) => !sel.has(e.id))];
      else {
        const idxs = elements.map((e, i) => (sel.has(e.id) ? i : -1)).filter((i) => i >= 0);
        if (mode === "forward") {
          for (let j = idxs.length - 1; j >= 0; j--) {
            const i = idxs[j];
            if (i < elements.length - 1 && !sel.has(elements[i + 1].id)) [elements[i], elements[i + 1]] = [elements[i + 1], elements[i]];
          }
        } else {
          for (const i of idxs) if (i > 0 && !sel.has(elements[i - 1].id)) [elements[i], elements[i - 1]] = [elements[i - 1], elements[i]];
        }
      }
      return { elements };
    });
    setTimeout(() => this.emit({ k: "order", ids: this.state.elements.map((e) => e.id) }), 0);
    this.setState({ menu: null });
  }
  toggleLock = () => {
    const ids = this.state.selected;
    if (!ids.length) return;
    const locked = ids.some((id) => !this.el(id)?.locked); // lock all if any unlocked, else unlock
    this.pushUndo(ids);
    const changed = this.state.elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, locked }));
    this.mutate((s) => ({ elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, locked } : e)), menu: null }));
    this.emit({ k: "upsertMany", els: changed });
  };
  groupSelection = () => {
    const ids = this.state.selected;
    if (ids.length < 2) return;
    const gid = "g_" + Date.now().toString(36);
    this.pushUndo(ids);
    const changed = this.state.elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, groupId: gid }));
    this.mutate((s) => ({ elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, groupId: gid } : e)), menu: null }));
    this.emit({ k: "upsertMany", els: changed });
  };
  ungroupSelection = () => {
    const ids = this.state.selected;
    if (!ids.length) return;
    this.pushUndo(ids);
    const changed = this.state.elements.filter((e) => ids.includes(e.id)).map((e) => ({ ...e, groupId: undefined }));
    this.mutate((s) => ({ elements: s.elements.map((e) => (ids.includes(e.id) ? { ...e, groupId: undefined } : e)), menu: null }));
    this.emit({ k: "upsertMany", els: changed });
  };
  alignSelection = (edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const els = this.state.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    if (els.length < 2) return;
    const minx = Math.min(...els.map((e) => e.x)), maxr = Math.max(...els.map((e) => e.x + (e.w || 0)));
    const miny = Math.min(...els.map((e) => e.y)), maxb = Math.max(...els.map((e) => e.y + (e.h || 0)));
    const cx = (minx + maxr) / 2, cy = (miny + maxb) / 2;
    this.pushUndo(this.state.selected);
    const changed = els.map((e) => {
      const w = e.w || 0, h = e.h || 0;
      let x = e.x, y = e.y;
      if (edge === "left") x = minx; else if (edge === "right") x = maxr - w; else if (edge === "hcenter") x = cx - w / 2;
      else if (edge === "top") y = miny; else if (edge === "bottom") y = maxb - h; else if (edge === "vcenter") y = cy - h / 2;
      return { ...e, x, y };
    });
    this.mutate((s) => ({ elements: s.elements.map((e) => changed.find((c) => c.id === e.id) || e), menu: null }));
    this.emit({ k: "upsertMany", els: changed });
  };
  distributeSelection = (axis: "h" | "v") => {
    const els = this.state.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    if (els.length < 3) return;
    const sorted = [...els].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
    const start = axis === "h" ? sorted[0].x : sorted[0].y;
    const end = axis === "h" ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
    const gap = (end - start) / (sorted.length - 1);
    this.pushUndo(this.state.selected);
    const changed = sorted.map((e, i) => (axis === "h" ? { ...e, x: start + gap * i } : { ...e, y: start + gap * i }));
    this.mutate((s) => ({ elements: s.elements.map((e) => changed.find((c) => c.id === e.id) || e), menu: null }));
    this.emit({ k: "upsertMany", els: changed });
  };
  zoomToSelection = () => {
    const els = this.state.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    const c = this.canvasEl;
    if (!els.length || !c) return this.fitView();
    const r = c.getBoundingClientRect();
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    els.forEach((e) => {
      const w = e.w || 40, h = e.h || 40;
      minx = Math.min(minx, e.x); miny = Math.min(miny, e.y); maxx = Math.max(maxx, e.x + w); maxy = Math.max(maxy, e.y + h);
    });
    const pad = 90, cw = maxx - minx + pad * 2, ch = maxy - miny + pad * 2;
    const z = Math.max(0.2, Math.min(2.5, Math.min(r.width / cw, r.height / ch)));
    this.setState({ zoom: z, pan: { x: r.width / 2 - ((minx + maxx) / 2) * z, y: r.height / 2 - ((miny + maxy) / 2) * z }, menu: null });
  };
  // Expand a clicked id to its whole group (for group-aware selection).
  withGroup(id: string): string[] {
    const g = this.el(id)?.groupId;
    if (!g) return [id];
    return this.state.elements.filter((e) => e.groupId === g).map((e) => e.id);
  }
  onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const node = (e.target as HTMLElement).closest("[data-el-id]") as HTMLElement | null;
    if (node) {
      const id = node.dataset.elId!;
      if (!this.state.selected.includes(id)) this.setState({ selected: this.withGroup(id) });
    }
    this.setState({ menu: { x: e.clientX, y: e.clientY } });
  };
  closeMenu = () => this.setState({ menu: null });

  // ── image upload ─────────────────────────────────────────────────────
  openImagePicker = () => {
    this.setState({ tool: "select" });
    this.fileInput?.click();
  };
  onImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose an image file.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      window.alert("Image is too large (max 12 MB).");
      return;
    }
    // Size the element to the image's aspect (read locally before upload).
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const maxW = 340;
      const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
      const w = Math.max(120, Math.round((img.naturalWidth || maxW) * scale));
      const h = Math.max(90, Math.round((img.naturalHeight || 200) * scale));
      URL.revokeObjectURL(url);
      const c = this.canvasEl?.getBoundingClientRect();
      const center = c ? this.toWorld(c.left + c.width / 2, c.top + c.height / 2) : { x: 400, y: 300 };
      const id = "img_" + Date.now().toString(36);
      const el: WbEl = { id, type: "image", x: center.x - w / 2, y: center.y - h / 2, w, h, text: file.name, uploading: true };
      this.mutate((s) => ({ elements: s.elements.concat(el), selected: [id], tool: "select" }));
      this.uploadImage(id, file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert("Could not read that image.");
    };
    img.src = url;
  };
  uploadImage = async (id: string, file: File) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/hr/whiteboards/${this.props.boardId}/image`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "upload failed");
      const key: string = json.key;
      this.mutate((s) => ({ elements: s.elements.map((e) => (e.id === id ? { ...e, imgKey: key, uploading: false } : e)) }));
      const updated = this.state.elements.find((e) => e.id === id);
      if (updated) this.emit({ k: "upsert", el: { ...updated, imgKey: key, uploading: false } });
    } catch (err) {
      window.alert("Image upload failed: " + (err instanceof Error ? err.message : "unknown error"));
      // Drop the failed placeholder so the board isn't left with a broken image.
      this.mutate((s) => ({ elements: s.elements.filter((e) => e.id !== id), selected: [] }));
      this.emit({ k: "delete", ids: [id] });
    }
  };
  imageSrc(el: WbEl): string {
    return `/api/hr/whiteboards/${this.props.boardId}/image?key=${encodeURIComponent(el.imgKey!)}`;
  }

  // Capture contentEditable edits back into the document on blur. `field` is "text" for
  // stickies/text, "label" for the centered text-in-shape label.
  commitText = (id: string, field: "text" | "label" = "text") => (e: React.FocusEvent<HTMLDivElement>) => {
    const value = e.currentTarget.textContent ?? "";
    const el = this.state.elements.find((x) => x.id === id);
    if (el && (el[field] ?? "") === value) { this.setState({ editingId: null }); return; }
    this.pushUndo([id]);
    const patch = (x: WbEl): WbEl => (field === "label" ? { ...x, label: value } : { ...x, text: value });
    this.mutate((s) => ({ elements: s.elements.map((x) => (x.id === id ? patch(x) : x)), editingId: null }));
    if (el) this.emit({ k: "upsert", el: patch(el) });
  };
  // Pick a stamp emoji: if a stamp is selected, recolor it (+broadcast); otherwise
  // set the pending emoji and arm the stamp tool for the next canvas click.
  setStamp = (emoji: string) => () => {
    const sel = this.state.selected.length === 1 ? this.el(this.state.selected[0]) : null;
    if (sel && sel.type === "stamp") {
      const updated = { ...sel, emoji };
      this.pushUndo([sel.id]);
      this.mutate((s) => ({ elements: s.elements.map((e) => (e.id === sel.id ? updated : e)), stampEmoji: emoji }));
      this.emit({ k: "upsert", el: updated });
    } else {
      this.setState({ stampEmoji: emoji, tool: "stamp" });
    }
  };
  // ── reactions (ephemeral — never persisted, bypasses pushUndo/mutate entirely) ──────
  triggerLocalReaction(emoji: string, x: number, y: number) {
    const id = Math.random().toString(36).slice(2, 9);
    this.setState((s) => ({
      reactions: (s.reactions || []).concat({ id, emoji, x, y }),
    }));
    setTimeout(() => {
      this.setState((s) => ({
        reactions: (s.reactions || []).filter((r) => r.id !== id),
      }));
    }, 1500);
  }
  setReaction = (emoji: string) => () => {
    this.setState({ reactionEmoji: emoji, tool: "reaction" });
  };

  // ── @mentions in comment replies ─────────────────────────────────────
  handleReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const selStart = e.target.selectionStart || 0;
    const match = value.slice(0, selStart).match(/\B@(\w*)$/);
    if (match) {
      this.setState({
        replyText: value,
        mentionOpen: true,
        mentionQuery: match[1],
        mentionIndex: 0,
      });
    } else {
      this.setState({
        replyText: value,
        mentionOpen: false,
        mentionQuery: "",
      });
    }
  };
  handleReplyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const s = this.state;
    if (s.mentionOpen) {
      const query = (s.mentionQuery || "").toLowerCase();
      const candidates = this.props.assignees.filter((u) => {
        const name = (u.name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(query) || email.includes(query);
      });
      if (candidates.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.setState({ mentionIndex: (s.mentionIndex + 1) % candidates.length });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.setState({ mentionIndex: (s.mentionIndex - 1 + candidates.length) % candidates.length });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          this.selectMention(candidates[s.mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.setState({ mentionOpen: false });
          return;
        }
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      this.sendReply();
    }
  };
  selectMention = (u: WbAssignee) => {
    const input = this.replyInputRef.current;
    if (!input) return;
    const value = this.state.replyText;
    const selStart = input.selectionStart || 0;
    const match = value.slice(0, selStart).match(/\B@(\w*)$/);
    if (!match) return;
    const startIndex = selStart - match[0].length;
    const textBefore = value.slice(0, startIndex);
    const textAfter = value.slice(selStart);
    const inserted = `@${u.name || u.email} `;
    const newText = textBefore + inserted + textAfter;
    this.setState(
      {
        replyText: newText,
        mentionOpen: false,
        mentionQuery: "",
      },
      () => {
        input.focus();
        const newCursorPos = startIndex + inserted.length;
        input.setSelectionRange(newCursorPos, newCursorPos);
      },
    );
  };
  // Append the reply to the comment's text and record any @mentioned user ids — a normal
  // document mutation, so it follows pushUndo -> mutate -> emit like every other one.
  sendReply = () => {
    const replyText = this.state.replyText.trim();
    if (!replyText) return;
    const commentId = this.state.threadId;
    if (!commentId) return;
    const comment = this.el(commentId);
    if (!comment) return;
    const mentionedIds: string[] = [];
    this.props.assignees.forEach((u) => {
      const name = u.name || u.email;
      if (replyText.includes(`@${name}`)) {
        mentionedIds.push(u.id);
      }
    });
    const updatedComment = {
      ...comment,
      text: comment.text + "\n" + this.props.currentUserName + ": " + replyText,
      count: (comment.count || 1) + 1,
      mentions: Array.from(new Set([...(comment.mentions || []), ...mentionedIds])),
    };
    this.pushUndo([comment.id]);
    this.mutate((s) => ({
      elements: s.elements.map((e) => (e.id === comment.id ? updatedComment : e)),
      replyText: "",
      mentionOpen: false,
      mentionQuery: "",
    }));
    this.emit({ k: "upsert", el: updatedComment });
  };
  // Pick a shape type: if a shape is selected, restyle it (+broadcast); otherwise arm the
  // square tool with the pending shape for the next canvas click. Mirrors setStamp.
  setShape = (st: string) => () => {
    const shapeEls = this.state.selected.map((id) => this.el(id)).filter((e): e is WbEl => !!e && isShapeEl(e));
    if (shapeEls.length) {
      const changed = shapeEls.map((e) => ({ ...e, shapeType: st, ...(st === "roundRect" && !e.radius ? { radius: 14 } : {}) }));
      this.pushUndo(changed.map((e) => e.id));
      const m = new Map(changed.map((c) => [c.id, c] as const));
      this.mutate((s) => ({ elements: s.elements.map((e) => m.get(e.id) || e), shapeType: st }));
      this.emit({ k: "upsertMany", els: changed });
    } else {
      this.setState({ shapeType: st, tool: "square" });
    }
  };
  // Parametric SVG geometry for a shape element, rendered inside a box-filling <svg>.
  // Everything resolves to <path> so fill/stroke props spread onto a single element type.
  shapeGeom(e: WbEl): React.ReactNode {
    const w = e.w || 140, h = e.h || 90;
    const stroke = e.stroke || "none";
    const sw = stroke === "none" ? 0 : (e.strokeWidth ?? 2);
    const i = sw / 2, W = Math.max(0, w - sw), H = Math.max(0, h - sw);
    const fill = e.fill || e.color || "#4DC4E8";
    const fo = e.fillOpacity ?? 1;
    const u = Math.max(1, sw);
    const dash = e.strokeStyle === "dashed" ? `${u * 2.6} ${u * 2}` : e.strokeStyle === "dotted" ? `${u * 0.1} ${u * 1.9}` : undefined;
    const cap: "round" | "butt" = e.strokeStyle === "dotted" ? "round" : "butt";
    const gp: React.SVGProps<SVGPathElement> = { fill, fillOpacity: fo, stroke, strokeWidth: sw, strokeDasharray: dash, strokeLinecap: cap, strokeLinejoin: "round" };
    const type = e.shapeType || (e.type === "circle" ? "ellipse" : "rectangle");
    const poly = (ps: number[][]) => "M" + ps.map(([nx, ny]) => `${i + nx * W},${i + ny * H}`).join(" L ") + " Z";
    let d = "";
    switch (type) {
      case "ellipse": d = ellipsePath(w / 2, h / 2, W / 2, H / 2); break;
      case "triangle": d = poly([[0.5, 0], [1, 1], [0, 1]]); break;
      case "diamond": d = poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]); break;
      case "parallelogram": d = poly([[0.28, 0], [1, 0], [0.72, 1], [0, 1]]); break;
      case "hexagon": d = poly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]); break;
      case "star": {
        const cx = w / 2, cy = h / 2, rx = W / 2, ry = H / 2, inr = 0.4;
        const p: string[] = [];
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const r = k % 2 === 0 ? 1 : inr; p.push(`${cx + Math.cos(a) * rx * r},${cy + Math.sin(a) * ry * r}`); }
        d = "M" + p.join(" L ") + " Z";
        break;
      }
      case "cylinder": {
        const rx = W / 2, ey = Math.min(H * 0.16, W * 0.28), cx = w / 2, top = i + ey, bot = i + H - ey;
        const body = `M${i},${top} A${rx},${ey} 0 0 1 ${i + W},${top} L${i + W},${bot} A${rx},${ey} 0 0 1 ${i},${bot} Z`;
        return (<>
          <path d={body} {...gp} />
          <path d={ellipsePath(cx, top, rx, ey)} {...gp} />
        </>);
      }
      case "cloud": {
        const X = (n: number) => i + n * W, Y = (n: number) => i + n * H;
        d = `M ${X(0.20)} ${Y(0.90)} C ${X(0.03)} ${Y(0.90)} ${X(0.02)} ${Y(0.60)} ${X(0.17)} ${Y(0.56)} C ${X(0.10)} ${Y(0.33)} ${X(0.35)} ${Y(0.22)} ${X(0.45)} ${Y(0.37)} C ${X(0.50)} ${Y(0.11)} ${X(0.81)} ${Y(0.14)} ${X(0.80)} ${Y(0.40)} C ${X(0.99)} ${Y(0.35)} ${X(1.00)} ${Y(0.69)} ${X(0.85)} ${Y(0.70)} C ${X(0.94)} ${Y(0.90)} ${X(0.66)} ${Y(0.95)} ${X(0.59)} ${Y(0.85)} C ${X(0.53)} ${Y(0.98)} ${X(0.28)} ${Y(0.98)} ${X(0.20)} ${Y(0.90)} Z`;
        break;
      }
      case "roundRect": d = roundRectPath(i, i, W, H, e.radius ?? 14); break;
      case "rectangle":
      // Boards saved before shape styling existed have no `shapeType` at all — keep their
      // original hardcoded 10px corner. New rectangles (shapeType explicitly set by
      // createAt) honor `radius` as-is, including an explicit 0 for sharp corners.
      default: d = roundRectPath(i, i, W, H, e.radius ?? (e.shapeType ? 0 : 10)); break;
    }
    return <path d={d} {...gp} />;
  }
  // Where the ray from an element's center toward (tx,ty) exits its bounding box, plus a
  // small gap so the connector line/arrowhead never overlaps the shape itself.
  boundaryPoint(el: WbEl, cx: number, cy: number, tx: number, ty: number): { x: number; y: number } {
    const hw = (el.w || 36) / 2, hh = (el.h || 36) / 2;
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const tX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
    const tY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
    const t = Math.min(tX, tY);
    const gap = 4 / Math.max(1e-6, Math.hypot(dx, dy)); // ~4px world-space clearance
    const tt = Math.max(0, t - gap);
    return { x: cx + dx * tt, y: cy + dy * tt };
  }
  linkMarker(id: string, cap: ConnectorCap, color: string): React.ReactNode {
    if (cap === "none") return null;
    let shape: React.ReactNode;
    if (cap === "arrow") shape = <path d="M1 1 L9 5 L1 9 Z" fill={color} />;
    else if (cap === "openArrow") shape = <path d="M1 1 L9 5 L1 9" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />;
    else if (cap === "circle") shape = <circle cx="5" cy="5" r="2.7" fill={color} />;
    else shape = <path d="M1 5 L5 1 L9 5 L5 9 Z" fill={color} />;
    return (
      <marker
        id={id}
        markerUnits="strokeWidth"
        markerWidth="4.5"
        markerHeight="4.5"
        refX={cap === "arrow" || cap === "openArrow" ? 8.5 : 5}
        refY="5"
        viewBox="0 0 10 10"
        orient="auto-start-reverse"
        style={{ overflow: "visible" }}
      >
        {shape}
      </marker>
    );
  }
  // Apply a style patch to every selected element matched by `match` — the canonical
  // pushUndo → mutate → emit sequence, so undo + live-collab stay correct.
  applyStyle(patch: Partial<WbEl>, match: (e: WbEl) => boolean) {
    const ids = this.state.selected;
    const changed = this.state.elements.filter((e) => ids.includes(e.id) && match(e)).map((e) => ({ ...e, ...patch }));
    if (!changed.length) return;
    this.pushUndo(changed.map((e) => e.id));
    const m = new Map(changed.map((c) => [c.id, c] as const));
    this.mutate((s) => ({ elements: s.elements.map((e) => m.get(e.id) || e) }));
    this.emit({ k: "upsertMany", els: changed });
  }
  // Restyle selected connectors using the same whole-links op used by creation and
  // deletion. This exact pushUndo → mutate → emit ordering is required for collab-safe undo.
  // `targetIds` lets a caller (e.g. commitLinkLabel) target a specific connector it
  // already captured, instead of re-deriving from `selected` — selection may have moved
  // on to a different connector by the time an async event like onBlur fires.
  applyLinkStyle(patch: Partial<WbLink>, targetIds?: string[]) {
    const ids = new Set(targetIds ?? this.state.selected.map(selectedLinkId).filter((id): id is string => !!id));
    if (!ids.size) return;
    let changed = false;
    const newLinks = this.state.links.map((link, index) => {
      const id = linkId(link, index);
      if (!ids.has(id)) return link;
      changed = true;
      return { ...link, id, ...patch };
    });
    if (!changed) return;
    this.pushUndo([], true);
    this.mutate(() => ({ links: newLinks }));
    this.emit({ k: "links", links: newLinks });
  }
  commitLinkLabel = (id: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value.trim();
    const index = this.state.links.findIndex((link, i) => linkId(link, i) === id);
    if (index < 0) return;
    const link = this.state.links[index];
    if ((link.labels?.[0]?.text || "") === value) return;
    this.applyLinkStyle({ labels: value ? [{ text: value, t: 0.5 }] : [] }, [id]);
  };
  // Toggle bold/italic across the selected text/label elements (on unless all are already on).
  toggleTextStyle(prop: "bold" | "italic") {
    const ids = this.state.selected;
    const targets = this.state.elements.filter((e) => ids.includes(e.id) && isTextEl(e));
    if (!targets.length) return;
    const on = !targets.every((e) => !!e[prop]);
    this.applyStyle(prop === "bold" ? { bold: on } : { italic: on }, isTextEl);
  }
  // Quick color swatch (top selection bar). Stickies use `color`; shapes render via
  // `fill` (see shapeGeom) so they need that field set instead, or the swatch would
  // silently no-op on anything but a sticky.
  setColor = (c: string) => () => {
    const ids = this.state.selected;
    const patchFor = (el: WbEl): WbEl | null => {
      if (el.type === "sticky") return { ...el, color: c };
      if (isShapeEl(el)) return { ...el, fill: c };
      return null;
    };
    const changed = this.state.elements
      .filter((el) => ids.includes(el.id))
      .map((el) => patchFor(el))
      .filter((el): el is WbEl => el !== null);
    if (!changed.length) return;
    this.pushUndo(changed.map((e) => e.id));
    const m = new Map(changed.map((c) => [c.id, c] as const));
    this.mutate((s) => ({ elements: s.elements.map((el) => m.get(el.id) || el) }));
    this.emit({ k: "upsertMany", els: changed });
  };
  onDuplicate = () => {
    const add: WbEl[] = [];
    this.state.selected.forEach((id) => {
      const el = this.state.elements.find((x) => x.id === id);
      if (el) add.push({ ...el, id: el.id + "_c" + Date.now().toString(36).slice(-3), x: el.x + 34, y: el.y + 34, frameId: undefined });
    });
    if (!add.length) return;
    this.pushUndo(add.map((a) => a.id));
    this.mutate((s) => ({ elements: s.elements.concat(add), selected: add.map((a) => a.id) }));
    this.emit({ k: "upsertMany", els: add });
  };
  onDelete = () => {
    if (!this.state.selected.length) return;
    const elementIds = this.state.selected.filter((id) => !!this.el(id));
    const delElements = new Set(elementIds);
    const delLinks = new Set(this.state.selected.map(selectedLinkId).filter((id): id is string => !!id));
    const newLinks = this.state.links.filter((link, index) => {
      return !delLinks.has(linkId(link, index)) && !delElements.has(link.from) && !delElements.has(link.to);
    });
    const linksChanged = newLinks.length !== this.state.links.length;
    if (!elementIds.length && !linksChanged) return;
    if (elementIds.length) this.pushUndo(elementIds, true);
    else this.pushUndo([], true);
    this.mutate((s) => ({
      elements: s.elements.filter((e) => !delElements.has(e.id)),
      links: newLinks,
      selected: [],
      threadId: null,
    }));
    if (elementIds.length) this.emit({ k: "delete", ids: elementIds });
    if (linksChanged) this.emit({ k: "links", links: newLinks });
  };
  zoomBy(f: number) {
    if (!this.canvasEl) return;
    const r = this.canvasEl.getBoundingClientRect();
    const cx = r.width / 2,
      cy = r.height / 2;
    const z = this.state.zoom;
    const nz = Math.min(2, Math.max(0.25, z * f));
    const wx = (cx - this.state.pan.x) / z,
      wy = (cy - this.state.pan.y) / z;
    this.setState({ zoom: nz, pan: { x: cx - wx * nz, y: cy - wy * nz } });
  }
  zoomIn = () => this.zoomBy(1.2);
  zoomOut = () => this.zoomBy(1 / 1.2);
  zoomFit = () => this.fitView();
  // 100% preset: reset zoom without moving the world point currently at the viewport center.
  zoomReset100 = () => {
    if (!this.canvasEl) return;
    const r = this.canvasEl.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const z = this.state.zoom;
    const wx = (cx - this.state.pan.x) / z, wy = (cy - this.state.pan.y) / z;
    this.setState({ zoom: 1, pan: { x: cx - wx, y: cy - wy } });
  };

  // ── minimap (view-only overview; click/drag pans the main canvas, never touches the doc) ──
  getMinimapLayout() {
    const els = this.state.elements;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    els.forEach((e) => {
      const w = e.w || 40, h = e.h || 40;
      minx = Math.min(minx, e.x); miny = Math.min(miny, e.y);
      maxx = Math.max(maxx, e.x + w); maxy = Math.max(maxy, e.y + h);
    });
    const c = this.canvasEl;
    const cw = c ? c.getBoundingClientRect().width : 800;
    const ch = c ? c.getBoundingClientRect().height : 500;
    const vx = -this.state.pan.x / this.state.zoom, vy = -this.state.pan.y / this.state.zoom;
    const vw = cw / this.state.zoom, vh = ch / this.state.zoom;
    if (!els.length) { minx = vx; miny = vy; maxx = vx + vw; maxy = vy + vh; }
    // Union with the current viewport so the viewport rect is always at least partly visible.
    minx = Math.min(minx, vx); miny = Math.min(miny, vy);
    maxx = Math.max(maxx, vx + vw); maxy = Math.max(maxy, vy + vh);
    const pad = 60;
    minx -= pad; miny -= pad; maxx += pad; maxy += pad;
    const bw = Math.max(1, maxx - minx), bh = Math.max(1, maxy - miny);
    const scale = Math.min(MM_W / bw, MM_H / bh);
    return { minx, miny, scale, offX: (MM_W - bw * scale) / 2, offY: (MM_H - bh * scale) / 2, vx, vy, vw, vh };
  }
  minimapPanTo(clientX: number, clientY: number) {
    if (!this.minimapEl || !this.canvasEl) return;
    const l = this.getMinimapLayout();
    const r = this.minimapEl.getBoundingClientRect();
    const wx = (clientX - r.left - l.offX) / l.scale + l.minx;
    const wy = (clientY - r.top - l.offY) / l.scale + l.miny;
    const c = this.canvasEl.getBoundingClientRect();
    const z = this.state.zoom;
    this.setState({ pan: { x: c.width / 2 - wx * z, y: c.height / 2 - wy * z } });
  }
  onMinimapDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.mmDragging = true;
    this.minimapPanTo(e.clientX, e.clientY);
    window.addEventListener("mousemove", this.onMinimapMove);
    window.addEventListener("mouseup", this.onMinimapUp);
  };
  onMinimapMove = (e: MouseEvent) => {
    if (this.mmDragging) this.minimapPanTo(e.clientX, e.clientY);
  };
  onMinimapUp = () => {
    this.mmDragging = false;
    window.removeEventListener("mousemove", this.onMinimapMove);
    window.removeEventListener("mouseup", this.onMinimapUp);
  };

  // ── on-board search (Cmd/Ctrl+F) — view-only ephemeral state, never mutates data.elements/links ──
  openSearch = () => {
    this.setState({ searchOpen: true });
    setTimeout(() => this.searchInputEl?.focus(), 0);
  };
  closeSearch = () => this.setState({ searchOpen: false, searchQuery: "" });
  onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ searchQuery: e.target.value });
  getSearchMatches(query: string): WbEl[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.state.elements.filter((e) => {
      const hay = [e.text, e.label, e.title].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  // Fly-to for a single element — same fit-to-bbox math as zoomToSelection, adapted for one id.
  flyToElement = (id: string) => {
    const el = this.el(id);
    const c = this.canvasEl;
    if (!el || !c) return;
    const r = c.getBoundingClientRect();
    const w = el.w || 40, h = el.h || 40;
    const minx = el.x, miny = el.y, maxx = el.x + w, maxy = el.y + h;
    const pad = 90, cw = maxx - minx + pad * 2, ch = maxy - miny + pad * 2;
    const z = Math.max(0.2, Math.min(2.5, Math.min(r.width / cw, r.height / ch)));
    this.setState({ zoom: z, pan: { x: r.width / 2 - ((minx + maxx) / 2) * z, y: r.height / 2 - ((miny + maxy) / 2) * z } });
  };
  onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { this.closeSearch(); e.preventDefault(); return; }
    if (e.key === "Enter") {
      const first = this.getSearchMatches(this.state.searchQuery)[0];
      if (first) this.flyToElement(first.id);
      e.preventDefault();
    }
  };

  // ── convert to tasks ─────────────────────────────────────────────────
  defaultAssignee(name?: string): string {
    const a = this.props.assignees;
    if (name && name !== "Unassigned") {
      const match = a.find((x) => (x.name ?? x.email).toLowerCase() === name.toLowerCase());
      if (match) return match.id;
    }
    return a[0]?.id ?? "";
  }
  onConvert = () => {
    const sel = this.state.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    const frame = sel.find((e) => e.type === "frame");
    let items: WbEl[];
    if (frame) items = this.state.elements.filter((e) => e.frameId === frame.id && (e.type === "sticky" || e.type === "card"));
    else items = sel.filter((e) => e.type === "sticky" || e.type === "card");
    if (!items.length) return;
    const tasks: ConvRow[] = items.map((k, i) => ({
      srcId: k.id,
      title: (k.text || "Untitled").replace(/\?$/, ""),
      assignedToId: this.defaultAssignee(k.assignee),
      due: k.due || this.dueFor(i),
      priority: k.priority || this.guessPri(k.text),
      include: true,
    }));
    this.setState({ convertOpen: true, convTasks: tasks });
  };
  closeConvert = () => this.setState({ convertOpen: false });
  updConv(i: number, field: keyof ConvRow, val: string | boolean) {
    this.setState((s) => ({ convTasks: s.convTasks.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)) }));
  }
  confirmConvert = async () => {
    const inc = this.state.convTasks.filter((t) => t.include && t.title.trim() && t.assignedToId);
    if (!inc.length) {
      window.alert("Select at least one task and give each an assignee.");
      return;
    }
    this.setState({ converting: true });
    try {
      const res = await fetch(`/api/hr/whiteboards/${this.props.boardId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: inc.map((t) => ({ title: t.title.trim(), assignedToId: t.assignedToId, dueDate: t.due, priority: t.priority })),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        window.alert(json.error ?? "Failed to convert");
        this.setState({ converting: false });
        return;
      }
      this.props.navigate(`/hr/projects/${this.props.projectId}?converted=${json.result.count}`);
    } catch {
      window.alert("Failed to convert");
      this.setState({ converting: false });
    }
  };

  priTag(p?: string): React.CSSProperties {
    if (p === "High") return { background: "var(--color-error-light)", color: "var(--color-error-dark)" };
    if (p === "Medium") return { background: "var(--color-warning-light)", color: "var(--color-warning-dark)" };
    return { background: "var(--color-neutral-100)", color: "var(--color-neutral-700)" };
  }

  render() {
    const s = this.state;
    const selSet = new Set(s.selected);
    // On-board search: derived each render from ephemeral view state, never stored on elements.
    const searchMatches = s.searchOpen ? this.getSearchMatches(s.searchQuery) : [];
    const searching = s.searchOpen && s.searchQuery.trim().length > 0;
    const toolDefs: [string, string, string, boolean?][] = [
      ["select", "cursor", "Select · V"],
      ["sticky", "sticky", "Sticky note · S"],
      ["text", "type", "Text · T"],
      ["square", "square", "Shape", true],
      ["frame", "frame", "Frame · F"],
      ["connector", "conn", "Connector · C"],
      ["card", "card", "Task card"],
      ["image", "image", "Image"],
      ["stamp", "smile", "Stamp"],
      ["reaction", "heart", "Reaction"],
      ["comment", "comment", "Comment", true],
    ];

    // Connector geometry. Missing connectorType intentionally falls back to the exact
    // quadratic path old boards used, including its raised midpoint.
    const linkRenders: {
      link: WbLink;
      id: string;
      index: number;
      d: string;
      ax: number;
      ay: number;
      bx: number;
      by: number;
    }[] = [];
    s.links.forEach((link, index) => {
      const a = this.el(link.from), b = this.el(link.to);
      if (!a || !b) return;
      const acx = a.x + (a.w || 36) / 2, acy = a.y + (a.h || 36) / 2;
      const bcx = b.x + (b.w || 36) / 2, bcy = b.y + (b.h || 36) / 2;
      // Clip each endpoint to its element's boundary (not the center) so the line and its
      // arrowhead land just outside the shape instead of being hidden underneath it.
      const aPt = this.boundaryPoint(a, acx, acy, bcx, bcy);
      const bPt = this.boundaryPoint(b, bcx, bcy, acx, acy);
      const ax = aPt.x, ay = aPt.y, bx = bPt.x, by = bPt.y;
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - 30;
      const type = link.connectorType || "curved";
      const d = type === "straight"
        ? `M${ax} ${ay} L${bx} ${by}`
        : type === "elbow"
          ? `M${ax} ${ay} L${mx} ${ay} L${mx} ${by} L${bx} ${by}`
          : `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`;
      linkRenders.push({ link, id: linkId(link, index), index, d, ax, ay, bx, by });
    });

    // selection context bar position + style toolbar (stacked just above it)
    let contextStyle: React.CSSProperties = { display: "none" };
    let styleBarStyle: React.CSSProperties = { display: "none" };
    let connectorBarStyle: React.CSSProperties = { display: "none" };
    const selEls = s.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    const hasSelection = selEls.length > 0 && !s.convertOpen;
    if (hasSelection) {
      let minx = 1e9,
        miny = 1e9,
        maxx = -1e9;
      selEls.forEach((e) => {
        const w = e.w || (e.type === "stamp" || e.type === "comment" ? 36 : 120);
        minx = Math.min(minx, e.x);
        miny = Math.min(miny, e.y);
        maxx = Math.max(maxx, e.x + w);
      });
      const top = miny * s.zoom + s.pan.y - 50;
      const cx = ((minx + maxx) / 2) * s.zoom + s.pan.x;
      contextStyle = { left: Math.max(8, cx - 150), top: Math.max(6, top) };
      styleBarStyle = { left: Math.max(8, cx - 190), top: Math.max(6, top - 46) };
    }
    const selectedLinkRenders = linkRenders.filter((item) => selSet.has(linkSelectionId(item.id)));
    const selectedConnector = s.selected.length === 1 && selectedLinkRenders.length === 1 ? selectedLinkRenders[0] : null;
    if (selectedConnector) {
      const cx = ((selectedConnector.ax + selectedConnector.bx) / 2) * s.zoom + s.pan.x;
      const cy = ((selectedConnector.ay + selectedConnector.by) / 2) * s.zoom + s.pan.y;
      connectorBarStyle = { left: Math.max(8, cx - 340), top: Math.max(6, cy - 58) };
    }
    // Contextual style toolbar: shows for selected shapes / text / stickies.
    const styleEls = selEls.filter((e) => e.type === "rect" || e.type === "circle" || e.type === "text" || e.type === "sticky");
    const shapeStyleEls = styleEls.filter(isShapeEl);
    const showStyleBar = styleEls.length > 0 && !s.convertOpen && s.tool === "select" && !s.editingId;
    const rep = styleEls[0];
    const repShape = shapeStyleEls[0];
    const rectLike = !!repShape && (!repShape.shapeType || repShape.shapeType === "rectangle" || repShape.shapeType === "roundRect");
    const hasFrame = selEls.some((e) => e.type === "frame");
    const convertible = selEls.some((e) => e.type === "sticky" || e.type === "card") || hasFrame;
    const convertLabel = hasFrame
      ? "Convert to tasks"
      : selEls.length > 1
        ? "Convert " + selEls.length + " to tasks"
        : "Convert to task";
    const swatches = ["#FFE8A3", "#C4EEF9", "#CFF3E0", "#FBD5E0", "#D5DAF4"];

    // comment thread popover
    let thread: WbEl | null = null,
      threadStyle: React.CSSProperties = { display: "none" };
    if (s.threadId) {
      const c = this.el(s.threadId);
      if (c) {
        thread = c;
        threadStyle = { left: c.x * s.zoom + s.pan.x + 30, top: c.y * s.zoom + s.pan.y };
      }
    }

    const includedCount = s.convTasks.filter((t) => t.include).length;
    const saveLabel = s.saveState === "saving" ? "Saving…" : s.saveState === "saved" ? "Saved" : "";
    // Presence: the live roster (includes me once connected); fall back to just me pre-connect.
    const presenceAvatars: BoardUser[] =
      s.presenceUsers.length > 0
        ? s.presenceUsers
        : [{ userId: this.props.currentUserId, name: this.props.currentUserName, color: this.avColor(this.props.currentUserName) }];
    // Single-selection transform box (resize + rotate handles), in canvas-screen space.
    const RESIZABLE = new Set(["rect", "circle", "image", "text", "sticky", "card", "frame"]);
    const single = s.selected.length === 1 ? this.el(s.selected[0]) : null;
    const showBox = !!single && RESIZABLE.has(single.type) && !single.locked && !s.editingId && s.tool === "select" && !s.convertOpen;
    // Peer cursors positioned in screen space via the current pan/zoom.
    const remoteCursorList = Object.entries(s.remoteCursors).map(([connId, c]) => ({
      connId,
      name: c.name,
      color: c.color,
      left: c.x * s.zoom + s.pan.x,
      top: c.y * s.zoom + s.pan.y,
    }));
    const toolHint = s.connectFrom
      ? "Click another element to connect →"
      : s.tool !== "select" && s.tool !== "connector"
        ? "Click on the canvas to place"
        : null;

    return (
      <div className="wb-root">
        {/* top bar */}
        <div className="wb-bar">
          <button className="wb-back" onClick={this.exitBoard} title="Back to project">
            <Icon d="M14 6l-6 6 6 6" w={18} />
          </button>
          <div className="bf-crumb">
            <span className="bf-c0" onClick={this.exitBoard}>
              {this.props.projectName}
            </span>
            <span className="bf-sep">/</span>
            <span className="wb-live" />
            <input
              className="bf-name"
              value={s.title}
              onChange={this.onTitleChange}
              onBlur={this.onTitleBlur}
              spellCheck={false}
              aria-label="Board title"
            />
          </div>
          <div className="wb-spacer" />
          {saveLabel && <span className="wb-saved">{saveLabel}</span>}
          <div className="wb-presence">
            {presenceAvatars.map((u) => (
              <span
                key={u.userId}
                className="avatar"
                style={{ ...this.avStyle(u.name, 30), background: u.color }}
                title={u.name + (u.userId === this.props.currentUserId ? " (you)" : "")}
              >
                {this.initials(u.name)}
              </span>
            ))}
          </div>
          <div className="wb-share">
            <button className="btn btn-ghost btn-sm" style={{ height: 36 }} onClick={this.toggleShare}>
              <Icon d="M6 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18 6.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M18 22a2.5 2.5 0 100-5 2.5 2.5 0 000 5z M8 11l8-4.2 M8 13l8 4.2" />
              Share
            </button>
            {s.shareOpen && (
              <div className="wb-pop">
                <h4>Share this board</h4>
                <div className="small" style={{ fontSize: 12 }}>
                  Members of this project can view and edit it.
                </div>
                <div className="wb-invite">
                  <input className="wb-inp" placeholder="Invite by email…" />
                  <button className="btn btn-secondary btn-sm" style={{ height: 38 }}>
                    Invite
                  </button>
                </div>
                {this.props.assignees.slice(0, 5).map((m) => (
                  <div className="wb-mem" key={m.id}>
                    <span className="avatar" style={this.avStyle(m.name ?? m.email, 30)}>
                      {this.initials(m.name ?? m.email)}
                    </span>
                    <div>
                      <div className="mn">{m.name ?? m.email}</div>
                      <div className="mr">{m.email}</div>
                    </div>
                    <span className="wb-acc">Editor</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            style={{ height: 36 }}
            onClick={this.onConvert}
            disabled={!convertible}
            title={convertible ? "" : "Select sticky notes or a frame first"}
          >
            <Icon d="M9 11l3 3L22 4 M21 12v7a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h11" />
            Convert to tasks
          </button>
        </div>

        {/* canvas */}
        <div
          className={"wb-canvas bg-dots" + (s.panning ? " panning" : "")}
          style={{ backgroundSize: `${24 * s.zoom}px ${24 * s.zoom}px`, backgroundPosition: `${s.pan.x}px ${s.pan.y}px` }}
          ref={this.setCanvasRef}
          onMouseDown={this.onCanvasDown}
          onDoubleClick={this.onCanvasDblClick}
          onContextMenu={this.onContextMenu}
          onMouseMove={(e) => this.sendCursor(e.clientX, e.clientY)}
        >
          {/* search highlight/dim — pure CSS overlay via data-el-id, no per-element JSX touched */}
          {searching && (
            <style>{
              `.wb-canvas [data-el-id]{opacity:.32;filter:saturate(.55);transition:opacity .15s ease,filter .15s ease;}` +
              (searchMatches.length
                ? `${searchMatches.map((e) => `.wb-canvas [data-el-id="${e.id}"]`).join(",")}{opacity:1;filter:none;outline:2.5px solid var(--color-warning);outline-offset:3px;z-index:5;}`
                : "")
            }</style>
          )}
          <div className="wb-world" style={{ transform: `translate(${s.pan.x}px,${s.pan.y}px) scale(${s.zoom})` }}>
            <svg className="wb-links" width="2400" height="1500" viewBox="0 0 2400 1500">
              <defs>
                {linkRenders.map(({ link, index }) => {
                  const color = link.stroke || "var(--color-navy-300)";
                  const startCap = link.startCap || "none";
                  const endCap = link.endCap || "arrow";
                  return (
                    <React.Fragment key={`markers_${index}`}>
                      {this.linkMarker(`wb-link-marker-${index}-start`, startCap, color)}
                      {this.linkMarker(`wb-link-marker-${index}-end`, endCap, color)}
                    </React.Fragment>
                  );
                })}
              </defs>
              {linkRenders.map(({ link, id, index, d }) => {
                const stroke = link.stroke || "var(--color-navy-300)";
                const strokeWidth = link.strokeWidth ?? 2.2;
                const unit = Math.max(1, strokeWidth);
                const dash = link.strokeStyle === "dashed"
                  ? `${unit * 2.8} ${unit * 2}`
                  : link.strokeStyle === "dotted"
                    ? `${unit * 0.1} ${unit * 2}`
                    : undefined;
                const selected = selSet.has(linkSelectionId(id));
                const pathId = `wb-link-path-${index}`;
                const startCap = link.startCap || "none";
                const endCap = link.endCap || "arrow";
                return (
                  <g key={id}>
                    {selected && <path className="wb-link-selection" d={d} />}
                    <path
                      id={pathId}
                      className="wb-link-path"
                      d={d}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dash}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerStart={startCap !== "none" ? `url(#wb-link-marker-${index}-start)` : undefined}
                      markerEnd={endCap !== "none" ? `url(#wb-link-marker-${index}-end)` : undefined}
                    />
                    <path className="wb-link-hit" d={d} data-link-id={id} />
                    {(link.labels || []).map((label, labelIndex) => (
                      <text key={`${id}_label_${labelIndex}`} className="wb-link-label" data-link-id={id}>
                        <textPath href={`#${pathId}`} startOffset={`${Math.max(0, Math.min(1, label.t)) * 100}%`} textAnchor="middle">
                          {label.text}
                        </textPath>
                      </text>
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* frames */}
            {s.elements
              .filter((e) => e.type === "frame")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-frame tint-" + (e.tint || "navy") + (selSet.has(e.id) ? " sel" : "") + (s.connectFrom === e.id ? " armed" : "")}
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h }}
                  data-el-id={e.id}
                >
                  <span className="wb-frame-tab" data-el-id={e.id}>
                    {e.title}
                  </span>
                </div>
              ))}

            {/* shapes — parametric SVG driven by shapeType, with an optional centered label */}
            {s.elements
              .filter((e) => e.type === "rect" || e.type === "circle")
              .map((e) => {
                const editing = s.editingId === e.id;
                const lbl = e.label ?? "";
                return (
                  <div
                    key={e.id}
                    className={"wb-el wb-shape" + (selSet.has(e.id) ? " sel" : "") + (s.connectFrom === e.id ? " armed" : "")}
                    style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h }}
                    data-el-id={e.id}
                  >
                    <svg
                      className="wb-shape-svg"
                      width={e.w}
                      height={e.h}
                      viewBox={`0 0 ${e.w || 140} ${e.h || 90}`}
                      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
                    >
                      {this.shapeGeom(e)}
                    </svg>
                    {(editing || lbl) && (
                      <div
                        className={"wb-shape-label" + (editing ? " editing" : "")}
                        style={{
                          fontSize: e.fontSize || 15,
                          fontWeight: e.bold ? 800 : 600,
                          fontStyle: e.italic ? "italic" : "normal",
                          color: e.textColor || "var(--color-navy-900)",
                          textAlign: e.align || "center",
                          justifyContent: e.align === "left" ? "flex-start" : e.align === "right" ? "flex-end" : "center",
                        }}
                        contentEditable={editing}
                        suppressContentEditableWarning
                        spellCheck={false}
                        ref={editing ? (n) => { if (n && document.activeElement !== n) n.focus(); } : undefined}
                        onBlur={editing ? this.commitText(e.id, "label") : undefined}
                      >
                        {lbl}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* images */}
            {s.elements
              .filter((e) => e.type === "image")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-image" + (selSet.has(e.id) ? " sel" : "")}
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h }}
                  data-el-id={e.id}
                >
                  {e.imgKey ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={this.imageSrc(e)}
                      alt={e.text || "image"}
                      draggable={false}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
                    />
                  ) : (
                    <div className="wb-image-ph">
                      {e.uploading ? (
                        <>
                          <span className="wb-spin" />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>Uploading…</span>
                        </>
                      ) : (
                        <>
                          <Icon d="M4 5h16v14H4z M8 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M4 16l5-4 4 3 3-2 4 3" w={26} />
                          <span style={{ fontSize: 11, fontWeight: 600 }}>Image</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}

            {/* stickies */}
            {s.elements
              .filter((e) => e.type === "sticky")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-sticky" + (selSet.has(e.id) ? " sel" : "") + (s.connectFrom === e.id ? " armed" : "")}
                  style={{
                    ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h, background: e.color,
                    fontSize: e.fontSize || undefined,
                    fontWeight: e.bold ? 800 : undefined,
                    fontStyle: e.italic ? "italic" : undefined,
                    color: e.textColor || undefined,
                    textAlign: e.align || undefined,
                  }}
                  data-el-id={e.id}
                  contentEditable={s.editingId === e.id}
                  suppressContentEditableWarning
                  spellCheck={false}
                  onBlur={s.editingId === e.id ? this.commitText(e.id) : undefined}
                >
                  {e.text}
                </div>
              ))}

            {/* cards */}
            {s.elements
              .filter((e) => e.type === "card")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-card" + (selSet.has(e.id) ? " sel" : "")}
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w }}
                  data-el-id={e.id}
                >
                  <div className="wb-card-t">{e.text}</div>
                  <div className="wb-card-row">
                    <span className="avatar" style={this.avStyle(e.assignee, 22)}>
                      {this.initials(e.assignee)}
                    </span>
                    <span className="small" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                      {e.assignee || "Unassigned"}
                    </span>
                  </div>
                  <div className="wb-card-row" style={{ justifyContent: "space-between" }}>
                    <span className="wb-card-tag" style={{ background: "var(--color-sky-50)", color: "var(--color-sky-700)" }}>
                      {e.due ? this.fmtDue(e.due) : "No date"}
                    </span>
                    <span className="wb-card-tag" style={this.priTag(e.priority)}>
                      {e.priority || "Medium"}
                    </span>
                  </div>
                </div>
              ))}

            {/* texts */}
            {s.elements
              .filter((e) => e.type === "text")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-text" + (e.muted ? " muted" : "") + (selSet.has(e.id) ? " sel" : "")}
                  style={{
                    ...this.rot(e), left: e.x, top: e.y, width: e.w || 220,
                    fontSize: e.fontSize || e.size || 18,
                    fontWeight: e.bold ? 800 : e.weight || 700,
                    fontStyle: e.italic ? "italic" : undefined,
                    color: e.textColor || undefined,
                    textAlign: e.align || undefined,
                  }}
                  data-el-id={e.id}
                  contentEditable={s.editingId === e.id}
                  suppressContentEditableWarning
                  spellCheck={false}
                  onBlur={s.editingId === e.id ? this.commitText(e.id) : undefined}
                >
                  {e.text}
                </div>
              ))}

            {/* stamps */}
            {s.elements
              .filter((e) => e.type === "stamp")
              .map((e) => (
                <div key={e.id} className={"wb-el wb-stamp" + (selSet.has(e.id) ? " sel" : "")} style={{ ...this.rot(e), left: e.x, top: e.y }} data-el-id={e.id}>
                  {e.emoji}
                </div>
              ))}

            {/* comments */}
            {s.elements
              .filter((e) => e.type === "comment")
              .map((e) => (
                <div key={e.id} className={"wb-el wb-comment" + (selSet.has(e.id) ? " sel" : "")} style={{ ...this.rot(e), left: e.x, top: e.y }} data-el-id={e.id}>
                  {e.count}
                </div>
              ))}

            {/* ephemeral reactions — never persisted, self-remove after their animation */}
            {(s.reactions || []).map((r) => (
              <div key={r.id} className="wb-floating-reaction" style={{ left: r.x, top: r.y }}>
                {r.emoji}
              </div>
            ))}
          </div>

          {/* stamp emoji palette — appears with the stamp tool or a selected stamp */}
          {(s.tool === "stamp" || (s.selected.length === 1 && this.el(s.selected[0])?.type === "stamp")) && (
            <div className="wb-stamp-palette">
              {STAMP_EMOJIS.map((em) => (
                <button
                  key={em}
                  className={"wb-stamp-opt" + (s.stampEmoji === em ? " on" : "")}
                  onClick={this.setStamp(em)}
                  title={"Stamp " + em}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* reaction emoji palette — appears with the reaction tool */}
          {s.tool === "reaction" && (
            <div className="wb-stamp-palette">
              {["👍", "🔥", "⭐", "🎉", "❤️", "👏", "😮", "😂", "💡", "❓"].map((em) => (
                <button
                  key={em}
                  className={"wb-stamp-opt" + (s.reactionEmoji === em ? " on" : "")}
                  onClick={this.setReaction(em)}
                  title={"Reaction " + em}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {/* shape picker palette — appears with the square tool or a selected shape */}
          {(s.tool === "square" || (s.tool === "select" && shapeStyleEls.length > 0)) && (() => {
            // Highlight the SELECTED shape's actual type when one is selected; otherwise
            // the pending type armed on the square tool.
            const activeType = repShape ? repShape.shapeType || (repShape.type === "circle" ? "ellipse" : "rectangle") : s.shapeType;
            return (
            <div className="wb-shape-palette">
              {SHAPE_TYPES.map((st) => (
                <button
                  key={st}
                  className={"wb-shape-opt" + (activeType === st ? " on" : "")}
                  onClick={this.setShape(st)}
                  title={st}
                >
                  <svg viewBox="0 0 24 20" width="24" height="20">
                    {this.shapeGeom({ id: "m", type: "rect", x: 0, y: 0, w: 24, h: 20, shapeType: st, fill: "var(--color-sky-100)", fillOpacity: 1, stroke: "var(--color-navy-500)", strokeWidth: 1.5, strokeStyle: "solid" })}
                  </svg>
                </button>
              ))}
            </div>
            );
          })()}

          {/* selected connector style toolbar */}
          {selectedConnector && (
            <div className="wb-stylebar wb-link-stylebar" style={connectorBarStyle} onMouseDown={this.stop}>
              <select
                className="wb-sb-sel"
                title="Connector type"
                value={selectedConnector.link.connectorType || "curved"}
                onChange={(e) => this.applyLinkStyle({ connectorType: e.target.value as ConnectorType })}
              >
                <option value="straight">Straight</option>
                <option value="elbow">Elbow</option>
                <option value="curved">Curved</option>
              </select>
              <label className="wb-sb-swatch" title="Line color">
                <span className="wb-sb-chip ring" style={{ borderColor: toHex(selectedConnector.link.stroke, "#7180B5") }} />
                <input type="color" value={toHex(selectedConnector.link.stroke, "#7180B5")} onChange={(e) => this.applyLinkStyle({ stroke: e.target.value })} />
              </label>
              <select
                className="wb-sb-sel"
                title="Line width"
                value={selectedConnector.link.strokeWidth ?? 2.2}
                onChange={(e) => this.applyLinkStyle({ strokeWidth: parseFloat(e.target.value) })}
              >
                {[1, 2, 2.2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>
              <select
                className="wb-sb-sel"
                title="Line style"
                value={selectedConnector.link.strokeStyle || "solid"}
                onChange={(e) => this.applyLinkStyle({ strokeStyle: e.target.value as WbLink["strokeStyle"] })}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <div className="wb-sb-sep" />
              <select
                className="wb-sb-sel"
                title="Start arrowhead"
                aria-label="Start arrowhead"
                value={selectedConnector.link.startCap || "none"}
                onChange={(e) => this.applyLinkStyle({ startCap: e.target.value as ConnectorCap })}
              >
                <option value="none">Start: none</option>
                <option value="arrow">Start: arrow</option>
                <option value="openArrow">Start: open</option>
                <option value="circle">Start: circle</option>
                <option value="diamond">Start: diamond</option>
              </select>
              <select
                className="wb-sb-sel"
                title="End arrowhead"
                aria-label="End arrowhead"
                value={selectedConnector.link.endCap || "arrow"}
                onChange={(e) => this.applyLinkStyle({ endCap: e.target.value as ConnectorCap })}
              >
                <option value="none">End: none</option>
                <option value="arrow">End: arrow</option>
                <option value="openArrow">End: open</option>
                <option value="circle">End: circle</option>
                <option value="diamond">End: diamond</option>
              </select>
              <input
                key={`${selectedConnector.id}_${selectedConnector.link.labels?.[0]?.text || ""}`}
                className="wb-link-label-input"
                defaultValue={selectedConnector.link.labels?.[0]?.text || ""}
                placeholder="Label"
                aria-label="Connector label"
                title="Connector label"
                onBlur={this.commitLinkLabel(selectedConnector.id)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              <button className="wb-sb-btn wb-sb-danger" title="Delete connector" aria-label="Delete connector" onClick={this.onDelete}>
                <Icon d="M4 7h16 M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2 M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
              </button>
            </div>
          )}

          {/* contextual style toolbar (fill / border / radius + font controls) */}
          {showStyleBar && (
            <div className="wb-stylebar" style={styleBarStyle} onMouseDown={this.stop}>
              {shapeStyleEls.length > 0 && (
                <>
                  <label className="wb-sb-swatch" title="Fill color">
                    <span className="wb-sb-chip" style={{ background: toHex(repShape.fill || repShape.color) }} />
                    <input type="color" value={toHex(repShape.fill || repShape.color)} onChange={(e) => this.applyStyle({ fill: e.target.value }, isShapeEl)} />
                  </label>
                  <input
                    className="wb-sb-range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={repShape.fillOpacity ?? 1}
                    title="Fill opacity"
                    onChange={(e) => this.applyStyle({ fillOpacity: parseFloat(e.target.value) }, isShapeEl)}
                  />
                  <div className="wb-sb-sep" />
                  <label className="wb-sb-swatch" title="Border color">
                    <span className="wb-sb-chip ring" style={{ background: toHex(repShape.stroke, "#132272") }} />
                    <input type="color" value={toHex(repShape.stroke, "#132272")} onChange={(e) => this.applyStyle({ stroke: e.target.value, strokeWidth: repShape.strokeWidth ?? 2 }, isShapeEl)} />
                  </label>
                  <select
                    className="wb-sb-sel"
                    title="Border width"
                    value={repShape.strokeWidth ?? 0}
                    onChange={(e) => this.applyStyle({ strokeWidth: parseInt(e.target.value, 10), stroke: repShape.stroke || "#132272" }, isShapeEl)}
                  >
                    {[0, 1, 2, 3, 4, 6, 8].map((n) => (
                      <option key={n} value={n}>{n}px</option>
                    ))}
                  </select>
                  <select
                    className="wb-sb-sel"
                    title="Border style"
                    value={repShape.strokeStyle || "solid"}
                    onChange={(e) => this.applyStyle({ strokeStyle: e.target.value as "solid" | "dashed" | "dotted", stroke: repShape.stroke || "#132272", strokeWidth: repShape.strokeWidth ?? 2 }, isShapeEl)}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                  {rectLike && (
                    <input
                      className="wb-sb-range"
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={repShape.radius || 0}
                      title="Corner radius"
                      onChange={(e) => this.applyStyle({ radius: parseInt(e.target.value, 10) }, isShapeEl)}
                    />
                  )}
                  <div className="wb-sb-sep" />
                </>
              )}
              <select
                className="wb-sb-sel"
                title="Font size"
                value={rep.fontSize || (rep.type === "text" ? rep.size || 18 : 15)}
                onChange={(e) => this.applyStyle({ fontSize: parseInt(e.target.value, 10) }, isTextEl)}
              >
                {[12, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button className={"wb-sb-btn" + (rep.bold ? " on" : "")} title="Bold · ⌘B" style={{ fontWeight: 800 }} onClick={() => this.toggleTextStyle("bold")}>B</button>
              <button className={"wb-sb-btn" + (rep.italic ? " on" : "")} title="Italic · ⌘I" style={{ fontStyle: "italic", fontFamily: "var(--font-display)" }} onClick={() => this.toggleTextStyle("italic")}>I</button>
              <label className="wb-sb-swatch" title="Text color">
                <span className="wb-sb-chip" style={{ background: toHex(rep.textColor, "#132272") }} />
                <input type="color" value={toHex(rep.textColor, "#132272")} onChange={(e) => this.applyStyle({ textColor: e.target.value }, isTextEl)} />
              </label>
              <div className="wb-sb-sep" />
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  className={"wb-sb-btn" + ((rep.align || "left") === a ? " on" : "")}
                  title={"Align " + a}
                  onClick={() => this.applyStyle({ align: a }, isTextEl)}
                >
                  <Icon
                    d={a === "left" ? "M4 6h16 M4 10h10 M4 14h16 M4 18h10" : a === "center" ? "M4 6h16 M7 10h10 M4 14h16 M7 18h10" : "M4 6h16 M10 10h10 M4 14h16 M10 18h10"}
                    w={15}
                  />
                </button>
              ))}
            </div>
          )}

          {/* selection transform box: resize + rotate handles */}
          {showBox && (() => {
            const e = single!;
            const w = (e.w || 40) * s.zoom, h = (e.h || 40) * s.zoom;
            const cx = (e.x + (e.w || 40) / 2) * s.zoom + s.pan.x;
            const cy = (e.y + (e.h || 40) / 2) * s.zoom + s.pan.y;
            return (
              <div
                className="wb-tbox"
                style={{ left: cx, top: cy, width: w, height: h, transform: `translate(-50%,-50%) rotate(${e.rotation || 0}deg)` }}
              >
                <div className="wb-rotate" onMouseDown={this.startRotate} title="Rotate" />
                {this.handleSet(e.type).map((hd) => {
                  const cursor =
                    hd.nx && hd.ny ? (hd.nx * hd.ny > 0 ? "nwse-resize" : "nesw-resize") : hd.nx ? "ew-resize" : "ns-resize";
                  return (
                    <div
                      key={`${hd.nx}_${hd.ny}`}
                      className="wb-handle"
                      style={{ left: `${50 + hd.nx * 50}%`, top: `${50 + hd.ny * 50}%`, cursor }}
                      onMouseDown={this.startResize(hd.nx, hd.ny)}
                    />
                  );
                })}
              </div>
            );
          })()}

          {/* peer cursors (live collaboration) */}
          {remoteCursorList.length > 0 && (
            <div className="wb-cursors">
              {remoteCursorList.map((c) => (
                <div key={c.connId} className="wb-cursor" style={{ transform: `translate(${c.left}px, ${c.top}px)` }}>
                  <svg width="20" height="22" viewBox="0 0 20 22" fill={c.color} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.3))" }}>
                    <path d="M2 2l6 16 2.5-6.5L17 9z" />
                  </svg>
                  <span className="wb-cur-label" style={{ background: c.color }}>
                    {c.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* empty-state hint (non-interactive) */}
          {s.elements.length === 0 && (
            <div className="wb-empty">
              <Icon d="M4 4h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z M8 20l4-4 4 4 M8.5 8.5h3 M8.5 11.5h6" />
              <h3>Blank canvas</h3>
              <p>Pick a tool on the left — sticky notes, frames, connectors — then Convert to tasks.</p>
            </div>
          )}

          {/* toolbar */}
          <div className="wb-toolbar">
            {toolDefs.map((t) => (
              <React.Fragment key={t[0]}>
                <button
                  className={s.tool === t[0] ? "wb-tool on" : "wb-tool"}
                  onClick={t[0] === "image" ? this.openImagePicker : this.setTool(t[0])}
                >
                  <Icon d={P[t[1]]} />
                  <span className="wb-tip">{t[2]}</span>
                </button>
                {t[3] && <div className="wb-tool-sep" />}
              </React.Fragment>
            ))}
          </div>

          {/* hidden file input for image upload */}
          <input
            ref={(el) => {
              this.fileInput = el;
            }}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            style={{ display: "none" }}
            onChange={this.onImageFile}
          />

          {/* selection context bar */}
          {hasSelection && (
            <div className="wb-context" style={contextStyle}>
              {convertible && (
                <>
                  <button className="wb-ctx-btn go" onClick={this.onConvert}>
                    <Icon d="M9 11l3 3L22 4 M21 12v7a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h11" />
                    {convertLabel}
                  </button>
                  <div className="wb-ctx-sep" />
                </>
              )}
              {swatches.map((c) => (
                <span key={c} className="wb-dot" style={{ background: c }} onClick={this.setColor(c)} />
              ))}
              <div className="wb-ctx-sep" />
              <button className="wb-ctx-btn" onClick={this.onDuplicate} title="Duplicate">
                <Icon d="M9 9h10v10H9z M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
              </button>
              <button className="wb-ctx-btn" onClick={this.onDelete} title="Delete">
                <Icon d="M4 7h16 M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2 M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
              </button>
            </div>
          )}

          {/* comment thread */}
          {thread && (() => {
            const query = (s.mentionQuery || "").toLowerCase();
            const candidates = this.props.assignees.filter((u) => {
              const name = (u.name || "").toLowerCase();
              const email = (u.email || "").toLowerCase();
              return name.includes(query) || email.includes(query);
            });
            const showPicker = s.mentionOpen && candidates.length > 0;
            return (
              <div className="wb-thread" style={threadStyle}>
                {showPicker && (
                  <div className="wb-mention-picker">
                    {candidates.map((u, i) => (
                      <div
                        key={u.id}
                        className={"wb-mention-item" + (s.mentionIndex === i ? " active" : "")}
                        onClick={() => this.selectMention(u)}
                        onMouseEnter={() => this.setState({ mentionIndex: i })}
                      >
                        <span className="avatar" style={this.avStyle(u.name ?? u.email, 20)}>
                          {this.initials(u.name ?? u.email)}
                        </span>
                        <span className="mn">{u.name || u.email}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="wb-thread-b">
                  <div className="cr">
                    <span className="avatar" style={this.avStyle(thread.author, 28)}>
                      {this.initials(thread.author)}
                    </span>
                    <div>
                      <span className="cn">{thread.author}</span>{" "}
                      <span className="mr" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                        now
                      </span>
                      <div className="ct" style={{ whiteSpace: "pre-wrap" }}>{thread.text}</div>
                    </div>
                  </div>
                </div>
                <div className="cm-in">
                  <input
                    ref={this.replyInputRef}
                    className="wb-inp"
                    style={{ height: 34 }}
                    placeholder="Reply…"
                    value={s.replyText || ""}
                    onChange={this.handleReplyChange}
                    onKeyDown={this.handleReplyKeyDown}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ height: 34 }} onClick={this.sendReply}>
                    Send
                  </button>
                </div>
              </div>
            );
          })()}

          {/* zoom */}
          <div className="wb-zoom">
            <button className="wb-zbtn" onClick={this.zoomOut}>
              −
            </button>
            <span className="wb-zval">{Math.round(s.zoom * 100) + "%"}</span>
            <button className="wb-zbtn" onClick={this.zoomIn}>
              +
            </button>
            <button className="wb-zbtn" onClick={this.zoomFit} title="Fit">
              <Icon d="M4 9V5a1 1 0 011-1h4 M20 9V5a1 1 0 00-1-1h-4 M4 15v4a1 1 0 001 1h4 M20 15v4a1 1 0 01-1 1h-4" w={15} />
            </button>
            <div className="wb-zoom-sep" />
            <button className="wb-zbtn wb-zbtn-100" onClick={this.zoomReset100} title="Zoom to 100%">
              100%
            </button>
          </div>

          {/* minimap — overview of all elements + draggable viewport rect; click/drag to pan */}
          {(() => {
            const l = this.getMinimapLayout();
            const vp = mmPoint(l, l.vx, l.vy);
            return (
              <div className="wb-minimap">
                <div className="wb-minimap-inner" ref={(el) => { this.minimapEl = el; }} onMouseDown={this.onMinimapDown}>
                  {s.elements.map((e) => {
                    const w = e.w || 40, h = e.h || 40;
                    const p = mmPoint(l, e.x, e.y);
                    return (
                      <div
                        key={e.id}
                        className={"wb-minimap-el" + (e.type === "frame" ? " frame" : "")}
                        style={{ left: p.x, top: p.y, width: Math.max(2, w * l.scale), height: Math.max(2, h * l.scale) }}
                      />
                    );
                  })}
                  <div
                    className="wb-minimap-viewport"
                    style={{ left: vp.x, top: vp.y, width: Math.max(4, l.vw * l.scale), height: Math.max(4, l.vh * l.scale) }}
                  />
                </div>
              </div>
            );
          })()}

          {toolHint && (
            <div className="wb-hint">
              <Icon d="M12 8v5 M12 16h.01 M12 3a9 9 0 100 18 9 9 0 000-18z" w={15} />
              {toolHint}
            </div>
          )}
        </div>

        {/* on-board search (Cmd/Ctrl+F) — view-only overlay, never persisted */}
        {s.searchOpen && (
          <div className="wb-search" onMouseDown={this.stop}>
            <div className="wb-search-row">
              <Icon d="M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.3-4.3" w={15} />
              <input
                ref={(el) => { this.searchInputEl = el; }}
                className="wb-search-inp"
                autoFocus
                placeholder="Search the board…"
                value={s.searchQuery}
                onChange={this.onSearchChange}
                onKeyDown={this.onSearchKeyDown}
              />
              {s.searchQuery.trim() && (
                <span className="wb-search-count">
                  {searchMatches.length} match{searchMatches.length === 1 ? "" : "es"}
                </span>
              )}
              <button className="wb-search-close" onClick={this.closeSearch} title="Close (Esc)">
                <Icon d="M6 6l12 12 M18 6L6 18" w={13} />
              </button>
            </div>
            {searchMatches.length > 0 && (
              <div className="wb-search-results">
                {searchMatches.slice(0, 8).map((e) => (
                  <div key={e.id} className="wb-search-result" onMouseDown={(ev) => { ev.preventDefault(); this.flyToElement(e.id); }}>
                    {(e.label || e.title || e.text || e.type).slice(0, 60)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* marquee rubber-band (viewport-fixed) */}
        {s.marquee && (
          <div
            className="wb-marquee"
            style={{ position: "fixed", left: s.marquee.x, top: s.marquee.y, width: s.marquee.w, height: s.marquee.h }}
          />
        )}

        {/* right-click context menu */}
        {s.menu && (
          <>
            <div className="wb-menu-backdrop" onMouseDown={this.closeMenu} onContextMenu={(e) => { e.preventDefault(); this.closeMenu(); }} />
            <div className="wb-menu" style={{ left: Math.min(s.menu.x, window.innerWidth - 210), top: Math.min(s.menu.y, window.innerHeight - 380) }}>
              {(() => {
                const n = s.selected.length;
                const anyLocked = s.selected.some((id) => this.el(id)?.locked);
                const inGroup = s.selected.some((id) => this.el(id)?.groupId);
                const item = (label: string, onClick: () => void, danger?: boolean) => (
                  <div key={label} className={"wb-menu-item" + (danger ? " danger" : "")} onMouseDown={(e) => { e.preventDefault(); onClick(); }}>
                    {label}
                  </div>
                );
                const sep = (k: string) => <div key={k} className="wb-menu-sep" />;
                if (n === 0) {
                  return [
                    this.clipboard.length ? item("Paste", () => { this.pasteClipboard(); this.closeMenu(); }) : null,
                    item("Select all", () => { this.selectAll(); this.closeMenu(); }),
                    item("Fit to content", () => { this.fitView(); this.closeMenu(); }),
                  ];
                }
                // A selection made up entirely of connectors: element-only actions (copy,
                // duplicate, lock, group, align, reorder, zoom-to-selection) either no-op or
                // are meaningless for a link, so show just what actually applies. Connector
                // styling itself is already covered by the dedicated connector toolbar.
                const connectorOnly = s.selected.length > 0 && s.selected.every((id) => !!selectedLinkId(id));
                if (connectorOnly) {
                  return [item("Delete", () => { this.onDelete(); this.closeMenu(); }, true)];
                }
                return [
                  item("Copy", () => { this.copySelection(); this.closeMenu(); }),
                  item("Duplicate", () => { this.onDuplicate(); this.closeMenu(); }),
                  this.clipboard.length ? item("Paste", () => { this.pasteClipboard(); this.closeMenu(); }) : null,
                  sep("s1"),
                  item("Bring to front", () => this.reorderSelection("front")),
                  item("Bring forward", () => this.reorderSelection("forward")),
                  item("Send backward", () => this.reorderSelection("backward")),
                  item("Send to back", () => this.reorderSelection("back")),
                  sep("s2"),
                  item(anyLocked ? "Unlock" : "Lock", () => this.toggleLock()),
                  n >= 2 ? item("Group", () => this.groupSelection()) : null,
                  inGroup ? item("Ungroup", () => this.ungroupSelection()) : null,
                  item("Zoom to selection", () => this.zoomToSelection()),
                  n >= 2 ? sep("s3") : null,
                  n >= 2 ? item("Align left", () => this.alignSelection("left")) : null,
                  n >= 2 ? item("Align center", () => this.alignSelection("hcenter")) : null,
                  n >= 2 ? item("Align right", () => this.alignSelection("right")) : null,
                  n >= 2 ? item("Align top", () => this.alignSelection("top")) : null,
                  n >= 2 ? item("Align middle", () => this.alignSelection("vcenter")) : null,
                  n >= 2 ? item("Align bottom", () => this.alignSelection("bottom")) : null,
                  n >= 3 ? item("Distribute horizontally", () => this.distributeSelection("h")) : null,
                  n >= 3 ? item("Distribute vertically", () => this.distributeSelection("v")) : null,
                  sep("s4"),
                  item("Delete", () => { this.onDelete(); this.closeMenu(); }, true),
                ];
              })()}
            </div>
          </>
        )}

        {/* convert modal */}
        {s.convertOpen && (
          <div className="wb-overlay" onMouseDown={this.closeConvert}>
            <div className="wb-modal" onMouseDown={this.stop}>
              <div className="wb-mhead">
                <div className="wb-micon">
                  <Icon d="M9 11l3 3L22 4 M21 12v7a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h11" />
                </div>
                <div>
                  <h3 className="wb-mtitle">Convert to tasks</h3>
                  <div className="wb-msub">Selected notes become tasks — assign, schedule, and they land in this project&apos;s task list.</div>
                </div>
                <button className="wb-mclose" onClick={this.closeConvert}>
                  <Icon d="M6 6l12 12 M18 6L6 18" w={16} />
                </button>
              </div>
              <div className="wb-mbody">
                <div className="conv-target">
                  <Icon d="M3 6a1 1 0 011-1h4.5l2 2H20a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
                  Adding to <b>{this.props.projectName}</b>
                </div>
                <div className="wb-seclabel">
                  Tasks<span className="wb-tcount">{includedCount} selected</span>
                </div>
                {s.convTasks.map((t, i) => (
                  <div key={t.srcId} className={"conv-row " + (t.include ? "on" : "off")}>
                    <div className={"conv-check " + (t.include ? "ck" : "")} onClick={() => this.updConv(i, "include", !t.include)}>
                      <Icon d="M5 12l5 5 9-10" />
                    </div>
                    <div>
                      <input className="conv-title" value={t.title} onChange={(e) => this.updConv(i, "title", e.target.value)} />
                      <div className="conv-meta">
                        <div className="conv-mini">
                          <label>Assignee</label>
                          <select className="conv-s" value={t.assignedToId} onChange={(e) => this.updConv(i, "assignedToId", e.target.value)}>
                            <option value="">Unassigned</option>
                            {this.props.assignees.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name ?? a.email}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="conv-mini">
                          <label>Due</label>
                          <input className="conv-s" type="date" value={t.due} onChange={(e) => this.updConv(i, "due", e.target.value)} />
                        </div>
                        <div className="conv-mini">
                          <label>Priority</label>
                          <select className="conv-s" value={t.priority} onChange={(e) => this.updConv(i, "priority", e.target.value)}>
                            <option>Low</option>
                            <option>Medium</option>
                            <option>High</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="wb-mfoot">
                <span className="fnote">
                  <Icon d="M6 9a6 6 0 1112 0c0 4 2 5 2 6H4c0-1 2-2 2-6z M10 20a2 2 0 004 0" w={14} />
                  Assignees will be notified by email + WhatsApp
                </span>
                <div className="wb-spacer" />
                <button className="btn btn-ghost" onClick={this.closeConvert}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={this.confirmConvert} disabled={s.converting}>
                  {s.converting ? "Adding…" : "Add " + includedCount + (includedCount === 1 ? " task" : " tasks")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export function WhiteboardEditor(props: Omit<Props, "navigate">) {
  const router = useRouter();
  return <WhiteboardCanvas {...props} navigate={(url) => router.push(url)} />;
}
