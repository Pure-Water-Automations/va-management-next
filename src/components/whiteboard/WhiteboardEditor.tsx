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
};
type WbLink = { from: string; to: string };
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
  marquee: { x: number; y: number; w: number; h: number } | null; // rubber-band select rect (screen px)
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
  | { k: "title"; title: string };

const STAMP_EMOJIS = ["👍", "🔥", "⭐", "✅", "❗", "❤️", "🎉", "👀", "💡", "❓"];
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

  constructor(props: Props) {
    super(props);
    const doc = props.initialData;
    const els = doc && Array.isArray(doc.elements) && doc.elements.length ? doc.elements : this.blankBoard();
    this.state = {
      elements: els,
      links: doc && Array.isArray(doc.links) ? doc.links : [],
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
      marquee: null,
    };
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
      return; // leave other Cmd/Ctrl combos to the browser
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.state.selected.length) {
      this.onDelete();
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") { this.clearSel(); return; }
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
        links = op.links;
      } else if (op.k === "title") {
        title = op.title;
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
    this.setState({ selected: [], editingId: null, threadId: null });
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
    const node = (e.target as HTMLElement).closest("[data-el-id]") as HTMLElement | null;
    const tool = this.state.tool;
    if (tool === "connector") {
      if (node) {
        const id = node.dataset.elId!;
        if (!this.state.connectFrom) this.setState({ connectFrom: id });
        else if (this.state.connectFrom !== id) {
          const newLinks = this.state.links.concat({ from: this.state.connectFrom, to: id });
          this.pushUndo([], true);
          this.mutate(() => ({ links: newLinks, connectFrom: null, tool: "select" }));
          this.emit({ k: "links", links: newLinks });
        }
      } else {
        this.setState({ connectFrom: null });
      }
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
      let sel: string[];
      if (add) sel = this.state.selected.includes(id) ? this.state.selected.filter((x) => x !== id) : this.state.selected.concat(id);
      else sel = this.state.selected.includes(id) ? this.state.selected : [id];
      const elx = this.el(id);
      if (elx && elx.type === "comment" && !add) {
        this.setState({ selected: sel, threadId: this.state.threadId === id ? null : id, editingId: null });
      } else {
        this.setState({ selected: sel, editingId: null, threadId: null });
      }
      this.beginElDrag(e, sel);
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
    if (el && (el.type === "sticky" || el.type === "text" || el.type === "card")) {
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
    else if (tool === "square") el = { id, type: "rect", x: w.x - 70, y: w.y - 45, w: 140, h: 90, color: "rgba(77,196,232,.16)" };
    else if (tool === "circle") el = { id, type: "circle", x: w.x - 55, y: w.y - 55, w: 110, h: 110, color: "rgba(124,92,191,.16)" };
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

  // Capture contentEditable edits back into the document on blur.
  commitText = (id: string) => (e: React.FocusEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent ?? "";
    const el = this.state.elements.find((x) => x.id === id);
    if (el && el.text === text) { this.setState({ editingId: null }); return; }
    this.pushUndo([id]);
    this.mutate((s) => ({ elements: s.elements.map((x) => (x.id === id ? { ...x, text } : x)), editingId: null }));
    if (el) this.emit({ k: "upsert", el: { ...el, text } });
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
  setColor = (c: string) => () => {
    const ids = this.state.selected;
    const changed = this.state.elements.filter((el) => ids.includes(el.id) && el.type === "sticky").map((el) => ({ ...el, color: c }));
    if (!changed.length) return;
    this.pushUndo(changed.map((e) => e.id));
    this.mutate((s) => ({ elements: s.elements.map((el) => (ids.includes(el.id) && el.type === "sticky" ? { ...el, color: c } : el)) }));
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
    const ids = [...this.state.selected];
    if (!ids.length) return;
    this.pushUndo(ids, true);
    this.mutate((s) => {
      const del = new Set(ids);
      return {
        elements: s.elements.filter((e) => !del.has(e.id)),
        links: s.links.filter((l) => !del.has(l.from) && !del.has(l.to)),
        selected: [],
        threadId: null,
      };
    });
    this.emit({ k: "delete", ids });
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
      ["comment", "comment", "Comment", true],
    ];

    // links (curved connectors)
    const linkPaths = s.links
      .map((l) => {
        const a = this.el(l.from),
          b = this.el(l.to);
        if (!a || !b) return "";
        const ax = a.x + (a.w || 36) / 2,
          ay = a.y + (a.h || 36) / 2,
          bx = b.x + (b.w || 36) / 2,
          by = b.y + (b.h || 36) / 2;
        const mx = (ax + bx) / 2,
          my = (ay + by) / 2 - 30;
        return `M${ax} ${ay} Q${mx} ${my} ${bx} ${by}`;
      })
      .filter(Boolean);

    // selection context bar position
    let contextStyle: React.CSSProperties = { display: "none" };
    const hasSelection = s.selected.length > 0 && !s.convertOpen;
    if (hasSelection) {
      const els = s.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
      let minx = 1e9,
        miny = 1e9,
        maxx = -1e9;
      els.forEach((e) => {
        const w = e.w || (e.type === "stamp" || e.type === "comment" ? 36 : 120);
        minx = Math.min(minx, e.x);
        miny = Math.min(miny, e.y);
        maxx = Math.max(maxx, e.x + w);
      });
      const top = miny * s.zoom + s.pan.y - 50;
      const cx = ((minx + maxx) / 2) * s.zoom + s.pan.x;
      contextStyle = { left: Math.max(8, cx - 150), top: Math.max(6, top) };
    }
    const selEls = s.selected.map((id) => this.el(id)).filter(Boolean) as WbEl[];
    const hasFrame = selEls.some((e) => e.type === "frame");
    const convertible = selEls.some((e) => e.type === "sticky" || e.type === "card") || hasFrame;
    const convertLabel = hasFrame
      ? "Convert to tasks"
      : s.selected.length > 1
        ? "Convert " + s.selected.length + " to tasks"
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
    const showBox = !!single && RESIZABLE.has(single.type) && !s.editingId && s.tool === "select" && !s.convertOpen;
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
          onMouseMove={(e) => this.sendCursor(e.clientX, e.clientY)}
        >
          <div className="wb-world" style={{ transform: `translate(${s.pan.x}px,${s.pan.y}px) scale(${s.zoom})` }}>
            <svg className="wb-links" width="2400" height="1500" viewBox="0 0 2400 1500">
              <defs>
                <marker id="wbarrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M1 1L8 4.5 1 8z" fill="var(--color-navy-300)" />
                </marker>
              </defs>
              {linkPaths.map((d, i) => (
                <path key={i} className="wb-link-path" d={d} markerEnd="url(#wbarrow)" />
              ))}
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

            {/* shapes */}
            {s.elements
              .filter((e) => e.type === "rect" || e.type === "circle")
              .map((e) => (
                <div
                  key={e.id}
                  className={"wb-el wb-shape" + (selSet.has(e.id) ? " sel" : "")}
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h, background: e.color, borderRadius: e.type === "circle" ? "50%" : 10 }}
                  data-el-id={e.id}
                />
              ))}

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
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w, height: e.h, background: e.color }}
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
                  style={{ ...this.rot(e), left: e.x, top: e.y, width: e.w || 220, fontSize: e.size || 18, fontWeight: e.weight || 700 }}
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
          {thread && (
            <div className="wb-thread" style={threadStyle}>
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
                    <div className="ct">{thread.text}</div>
                  </div>
                </div>
              </div>
              <div className="cm-in">
                <input className="wb-inp" style={{ height: 34 }} placeholder="Reply…" />
                <button className="btn btn-secondary btn-sm" style={{ height: 34 }}>
                  Send
                </button>
              </div>
            </div>
          )}

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
          </div>

          {toolHint && (
            <div className="wb-hint">
              <Icon d="M12 8v5 M12 16h.01 M12 3a9 9 0 100 18 9 9 0 000-18z" w={15} />
              {toolHint}
            </div>
          )}
        </div>

        {/* marquee rubber-band (viewport-fixed) */}
        {s.marquee && (
          <div
            className="wb-marquee"
            style={{ position: "fixed", left: s.marquee.x, top: s.marquee.y, width: s.marquee.w, height: s.marquee.h }}
          />
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
