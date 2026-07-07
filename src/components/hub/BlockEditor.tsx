"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import {
  olNumbers,
  parseSlashInput,
  toggleTodo,
  updateBlockText,
  type Block,
  type BlockKind,
} from "@/lib/services/blocks";

function uid(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const AUTOSAVE_MS = 800;

/**
 * The OS Hub doc editor: one input/textarea per block (no contentEditable),
 * a "/" slash menu on the new-block line, debounced whole-doc autosave with
 * optimistic version locking (a conflict = alert + refresh, never a silent
 * clobber). Backspace in an empty block removes it.
 */
export function BlockEditor({
  pageId,
  title,
  initialBlocks,
  version: initialVersion,
  canEdit,
  projectId,
  meId,
  sharing,
  canShare,
}: {
  pageId: string;
  title: string;
  initialBlocks: Block[];
  version: number;
  canEdit: boolean;
  projectId: string | null;
  meId: string;
  sharing: { published: boolean; clientVisible: boolean };
  canShare: boolean;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [newText, setNewText] = useState("");
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "error">("clean");
  const [puriiOpen, setPuriiOpen] = useState(false);
  const [puriiBusy, setPuriiBusy] = useState<string | null>(null);
  const versionRef = useRef(initialVersion);
  const blocksRef = useRef(blocks);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  blocksRef.current = blocks;

  // Fresh page navigation (?page= changes) remounts via key from the parent,
  // so initialBlocks/version staying stale across pages isn't a concern here.

  function scheduleSave() {
    setSaveState("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }

  async function save() {
    if (inFlight.current) {
      scheduleSave(); // a save is running; try again after
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    const res = await postAction("/api/hr/pages/save", {
      pageId,
      blocks: blocksRef.current,
      version: versionRef.current,
    });
    inFlight.current = false;
    if (!res.ok) {
      setSaveState("error");
      window.alert(res.error ?? "Save failed");
      if (String(res.error).includes("changed since")) router.refresh();
      return;
    }
    versionRef.current = (res.result as { version: number }).version;
    setSaveState("clean");
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function edit(id: string, text: string) {
    setBlocks((b) => updateBlockText(b, id, text));
    scheduleSave();
  }

  function toggle(id: string) {
    setBlocks((b) => toggleTodo(b, id));
    scheduleSave();
  }

  function removeIfEmpty(e: React.KeyboardEvent, b: Block) {
    if (e.key === "Backspace" && b.text === "") {
      e.preventDefault();
      setBlocks((prev) => prev.filter((x) => x.id !== b.id));
      scheduleSave();
    }
  }

  function append(kind: BlockKind, text: string, ref?: Block["ref"]) {
    const block: Block = { id: uid(), kind, text };
    if (kind === "todo") block.done = false;
    if (ref) block.ref = ref;
    setBlocks((prev) => [...prev, block]);
    scheduleSave();
  }

  const slash = parseSlashInput(newText);

  // Purii page commands: the API returns proposed blocks; they land in local
  // state (single writer) so the user can immediately edit or delete them.
  async function runPurii(command: "summarize" | "checklist" | "related") {
    setPuriiOpen(false);
    setPuriiBusy(
      command === "summarize" ? "Summarizing…" : command === "checklist" ? "Drafting checklist…" : "Searching the Library…",
    );
    const res = await postAction("/api/hr/pages/purii", { pageId, command });
    setPuriiBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Purii failed");
      return;
    }
    const { position, blocks: proposed, note } = res.result as {
      position: "prepend" | "append";
      blocks: Omit<Block, "id">[];
      note?: string;
    };
    if (!proposed.length) {
      if (note) window.alert(note);
      return;
    }
    const made = proposed.map((b) => ({ ...b, id: uid() }) as Block);
    setBlocks((prev) => (position === "prepend" ? [...made, ...prev] : [...prev, ...made]));
    scheduleSave();
  }

  async function runCommand(kind: BlockKind | "task" | "purii", text: string) {
    setNewText("");
    if (kind === "purii") {
      setPuriiOpen(true);
      return;
    }
    if (kind === "task") {
      const taskTitle = text || window.prompt("Task title?")?.trim();
      if (!taskTitle) return;
      const res = await postAction("/api/hr/tasks", {
        title: taskTitle,
        assignedToId: meId,
        strategy: "Create",
        ...(projectId ? { projectId } : {}),
      });
      if (!res.ok) {
        window.alert(res.error ?? "Task creation failed");
        return;
      }
      const task = res.result as { id: string; title: string };
      append("chip", `Task: ${task.title}`, { type: "task", id: task.id });
      return;
    }
    append(kind, text);
  }

  function onNewKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const input = newText.trim();
    if (!input) return;
    if (slash && slash.matches.length > 0) {
      void runCommand(slash.matches[0].kind, slash.text);
      return;
    }
    setNewText("");
    append("p", input);
  }

  async function toggleShare() {
    const field = projectId ? "clientVisible" : "published";
    const res = await postAction("/api/hr/pages/share", {
      pageId,
      [field]: !(projectId ? sharing.clientVisible : sharing.published),
    });
    if (!res.ok) {
      window.alert(res.error ?? "Failed to change sharing");
      return;
    }
    router.refresh();
  }

  const baseText: React.CSSProperties = {
    flex: 1,
    width: "100%",
    border: "none",
    background: "transparent",
    font: "inherit",
    fontSize: "var(--text-base)",
    lineHeight: 1.6,
    color: "var(--color-text-primary)",
    padding: "3px 0",
    resize: "none",
  };

  const shared = projectId ? sharing.clientVisible : sharing.published;
  const nums = olNumbers(blocks);

  const renderBlock = (b: Block) => {
    const common = { disabled: !canEdit };
    switch (b.kind) {
      case "callout":
        return (
          <div
            key={b.id}
            style={{
              background: "linear-gradient(150deg,#eef0fa 0%,#e7f8fd 100%)",
              border: "1px solid var(--color-sky-100, #c9edf8)",
              borderRadius: 16,
              padding: "14px 18px",
              margin: "6px 0",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ flex: "none", marginTop: 1 }}>💧</span>
            <textarea
              {...common}
              rows={Math.max(2, Math.ceil(b.text.length / 70))}
              value={b.text}
              onChange={(e) => edit(b.id, e.target.value)}
              onKeyDown={(e) => removeIfEmpty(e, b)}
              style={{ ...baseText, color: "var(--color-navy-800, #182a80)" }}
            />
          </div>
        );
      case "h2":
        return (
          <input
            key={b.id}
            {...common}
            value={b.text}
            onChange={(e) => edit(b.id, e.target.value)}
            onKeyDown={(e) => removeIfEmpty(e, b)}
            style={{ ...baseText, fontWeight: 600, fontSize: "var(--text-lg)", padding: "12px 0 2px", color: "var(--color-navy-900, #0f1c5e)" }}
          />
        );
      case "todo":
        return (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <button
              onClick={() => canEdit && toggle(b.id)}
              aria-label={b.done ? "Mark not done" : "Mark done"}
              style={{
                flex: "none",
                width: 18,
                height: 18,
                borderRadius: 5,
                border: `1.5px solid ${b.done ? "var(--color-sky-500, #2eb4dd)" : "var(--color-border)"}`,
                background: b.done ? "var(--color-sky-500, #2eb4dd)" : "transparent",
                cursor: canEdit ? "pointer" : "default",
                color: "#fff",
                fontSize: 11,
                lineHeight: 1,
                padding: 0,
              }}
            >
              {b.done ? "✓" : ""}
            </button>
            <input
              {...common}
              value={b.text}
              onChange={(e) => edit(b.id, e.target.value)}
              onKeyDown={(e) => removeIfEmpty(e, b)}
              style={{
                ...baseText,
                color: b.done ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                textDecoration: b.done ? "line-through" : "none",
              }}
            />
          </div>
        );
      case "ul":
        return (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ flex: "none", width: 18, textAlign: "center", color: "var(--color-sky-600, #1d9cc7)", fontSize: 16 }}>•</span>
            <input {...common} value={b.text} onChange={(e) => edit(b.id, e.target.value)} onKeyDown={(e) => removeIfEmpty(e, b)} style={baseText} />
          </div>
        );
      case "ol":
        return (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ flex: "none", minWidth: 18, textAlign: "right", color: "var(--color-sky-600, #1d9cc7)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
              {nums[b.id] ?? 1}.
            </span>
            <input {...common} value={b.text} onChange={(e) => edit(b.id, e.target.value)} onKeyDown={(e) => removeIfEmpty(e, b)} style={baseText} />
          </div>
        );
      case "code":
        return (
          <textarea
            key={b.id}
            {...common}
            spellCheck={false}
            rows={Math.max(2, b.text.split("\n").length)}
            value={b.text}
            onChange={(e) => edit(b.id, e.target.value)}
            onKeyDown={(e) => removeIfEmpty(e, b)}
            style={{
              width: "100%",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 12,
              background: "var(--color-bg-secondary)",
              padding: "12px 14px",
              margin: "4px 0",
              fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
              fontSize: "var(--text-sm)",
              lineHeight: 1.6,
              color: "var(--color-navy-900, #0f1c5e)",
              resize: "vertical",
            }}
          />
        );
      case "chip":
        return (
          <a
            key={b.id}
            href={
              b.ref?.type === "task"
                ? `/hr/tasks/${b.ref.id}`
                : b.ref?.type === "sop"
                  ? `/hr/library?page=${b.ref.id}`
                  : b.ref?.type === "video"
                    ? `/recordings/${b.ref.id}`
                    : undefined
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              margin: "4px 0",
              padding: "5px 13px",
              borderRadius: 999,
              border: "1px solid var(--color-sky-100, #c9edf8)",
              background: "var(--color-sky-50, #f0fafd)",
              color: "var(--color-sky-700, #177a9c)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textDecoration: "none",
              width: "fit-content",
            }}
          >
            {b.text} ↗
          </a>
        );
      default: // p
        return (
          <textarea
            key={b.id}
            {...common}
            rows={Math.max(1, Math.ceil(b.text.length / 90))}
            value={b.text}
            onChange={(e) => edit(b.id, e.target.value)}
            onKeyDown={(e) => removeIfEmpty(e, b)}
            style={baseText}
          />
        );
    }
  };

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: 24,
        boxShadow: "var(--shadow-sm)",
        padding: "30px 34px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ fontWeight: 600, fontSize: "var(--text-xl)", margin: 0, color: "var(--color-navy-900, #0f1c5e)" }}>
          {title}
        </h2>
        {canShare && (
          <button
            onClick={() => void toggleShare()}
            title={projectId ? "Show this page as the client portal Overview" : "Publish read-only to the client portal"}
            style={{
              height: 20,
              padding: "0 9px",
              borderRadius: 999,
              border: `1px solid ${shared ? "rgba(48,201,122,.35)" : "var(--color-border)"}`,
              background: shared ? "var(--color-success-light, #e6f9ef)" : "transparent",
              color: shared ? "var(--color-success-dark, #1d7a4c)" : "var(--color-text-tertiary)",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {shared ? (projectId ? "Client-visible" : "Published") : "Private"}
          </button>
        )}
        {canEdit && (
          <span style={{ marginLeft: "auto", position: "relative", display: "inline-flex", alignItems: "center", gap: 10 }}>
            {puriiBusy ? (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-sky-700, #177a9c)", fontWeight: 600 }}>
                ✨ {puriiBusy}
              </span>
            ) : (
              <button
                onClick={() => setPuriiOpen((v) => !v)}
                title="Purii page commands"
                style={{
                  height: 26,
                  padding: "0 11px",
                  borderRadius: 999,
                  border: "1px solid var(--color-sky-100, #c9edf8)",
                  background: "var(--color-sky-50, #f0fafd)",
                  color: "var(--color-sky-700, #177a9c)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ✨ Purii
              </button>
            )}
            {puriiOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 32,
                  right: 0,
                  zIndex: 45,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 14,
                  boxShadow: "var(--shadow-lg)",
                  padding: 6,
                  width: 230,
                }}
              >
                {(
                  [
                    ["summarize", "Summarize this page"],
                    ["checklist", "Draft a checklist"],
                    ["related", "Find related SOPs"],
                  ] as const
                ).map(([cmd, label]) => (
                  <button
                    key={cmd}
                    onClick={() => void runPurii(cmd)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      borderRadius: 9,
                      background: "none",
                      cursor: "pointer",
                      fontSize: "var(--text-sm)",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {label}
                  </button>
                ))}
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", padding: "6px 10px 4px" }}>
                  Inserts blocks you can edit or delete.
                </div>
              </div>
            )}
          </span>
        )}
        <span style={{ marginLeft: canEdit ? 0 : "auto", fontSize: "var(--text-xs)", color: saveState === "error" ? "var(--color-danger, #d33)" : "var(--color-text-tertiary)" }}>
          {saveState === "clean" && "Saved"}
          {saveState === "dirty" && "…"}
          {saveState === "saving" && "Saving…"}
          {saveState === "error" && "Save failed"}
        </span>
      </div>

      {blocks.map(renderBlock)}

      {canEdit && (
        <div style={{ position: "relative", marginTop: 10 }}>
          <input
            placeholder="Write something, or type / for commands…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={onNewKeyDown}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px dashed var(--color-border-subtle)",
              background: "transparent",
              font: "inherit",
              fontSize: "var(--text-base)",
              color: "var(--color-text-primary)",
              padding: "8px 0 2px",
            }}
          />
          {slash && slash.matches.length > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: 38,
                left: 0,
                zIndex: 40,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 16,
                boxShadow: "var(--shadow-lg)",
                padding: 8,
                width: 280,
              }}
            >
              {slash.matches.map((c) => (
                <button
                  key={c.command}
                  onClick={() => void runCommand(c.kind, slash.text)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 11px",
                    border: "none",
                    borderRadius: 10,
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: "var(--color-sky-50, #f0fafd)",
                      border: "1px solid var(--color-sky-100, #c9edf8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}
                  >
                    {c.icon}
                  </span>
                  <span>
                    <span style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-navy-900, #0f1c5e)" }}>
                      /{c.command} — {c.label}
                    </span>
                    <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{c.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
