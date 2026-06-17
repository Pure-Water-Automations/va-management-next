"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type Task = {
  id: string;
  kind: string;
  task: string;
  skill: string | null;
  estMinutes: number | null;
  instructions: string | null;
  instructionsLink: string | null;
  sortOrder: number;
  active: boolean;
};
type Draft = { id?: string; kind: string; task: string; skill: string; estMinutes: string; instructions: string; instructionsLink: string; sortOrder: string };

const KINDS = ["read", "video", "quiz", "task", "submit"];
const KIND_ICON: Record<string, string> = { read: "📖", video: "▶", quiz: "📝", task: "✅", submit: "📤" };

const blank = (sortOrder: number): Draft => ({ kind: "task", task: "", skill: "", estMinutes: "20", instructions: "", instructionsLink: "", sortOrder: String(sortOrder) });
const toDraft = (t: Task): Draft => ({ id: t.id, kind: t.kind, task: t.task, skill: t.skill ?? "", estMinutes: t.estMinutes != null ? String(t.estMinutes) : "", instructions: t.instructions ?? "", instructionsLink: t.instructionsLink ?? "", sortOrder: String(t.sortOrder) });

export function TrainingTaskManager({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");

  async function run(key: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    const res = await postAction(path, body);
    setBusy("");
    if (!res.ok) { window.alert(res.error ?? "Failed"); return false; }
    router.refresh();
    return true;
  }

  async function save(d: Draft) {
    if (!d.task.trim()) { window.alert("Title is required."); return; }
    const ok = await run("save", "/api/recruitment/tasks/save", {
      id: d.id, kind: d.kind, task: d.task, skill: d.skill || undefined,
      estMinutes: d.estMinutes ? Number(d.estMinutes) : undefined,
      instructions: d.instructions || undefined, instructionsLink: d.instructionsLink || undefined,
      sortOrder: d.sortOrder ? Number(d.sortOrder) : undefined,
    });
    if (ok) setEditing(null);
  }

  return (
    <>
      <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-sky-400)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="small">{tasks.length === 0 ? "No items yet." : "Reset to the official 10-hour module"} — loads the readings, 8 video tutorials, the quiz, the 5 tasks, and the submission. {tasks.length > 0 && "Items with no candidate progress are replaced."}</span>
          <Button size="sm" variant="primary" loading={busy === "seed"} onClick={() => run("seed", "/api/recruitment/tasks/seed", { reset: tasks.length > 0 })}>
            {tasks.length === 0 ? "Load the 10-hour module" : "Reload module"}
          </Button>
        </div>
      </Card>

      <Card padding={0} style={{ overflow: "hidden", marginBottom: 16 }}>
        {tasks.length === 0 ? (
          <div style={{ padding: 18, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No items.</div>
        ) : tasks.map((t) => (
          <div key={t.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 18px" }}>
              <div>
                <span style={{ fontWeight: 600 }}>{t.sortOrder}. {KIND_ICON[t.kind] ?? ""} {t.task}</span>{" "}
                {t.skill && <Badge variant="default">{t.skill}</Badge>}{" "}
                <span className="small">{t.estMinutes ? `~${t.estMinutes}m` : ""}</span>
                {!t.active && <Badge variant="warning">inactive</Badge>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(editing?.id === t.id ? null : toDraft(t))}>{editing?.id === t.id ? "Close" : "Edit"}</Button>
                <Button size="sm" variant="ghost" loading={busy === "t-" + t.id} onClick={() => run("t-" + t.id, "/api/recruitment/tasks/toggle", { id: t.id, active: !t.active })}>{t.active ? "Off" : "On"}</Button>
                <Button size="sm" variant="ghost" loading={busy === "d-" + t.id} onClick={() => run("d-" + t.id, "/api/recruitment/tasks/delete", { id: t.id })}>Delete</Button>
              </div>
            </div>
            {editing?.id === t.id && <Editor draft={editing} setDraft={setEditing} onSave={save} busy={busy === "save"} />}
          </div>
        ))}
      </Card>

      {editing && !editing.id ? (
        <Card><Editor draft={editing} setDraft={setEditing} onSave={save} busy={busy === "save"} /></Card>
      ) : (
        <Button variant="secondary" onClick={() => setEditing(blank(tasks.length + 1))}>+ Add an item</Button>
      )}
    </>
  );
}

function Editor({ draft, setDraft, onSave, busy }: { draft: Draft; setDraft: (d: Draft | null) => void; onSave: (d: Draft) => void; busy: boolean }) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <div style={{ padding: "12px 18px 18px", background: "var(--color-bg-secondary)", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select style={{ ...inp, width: 110 }} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input style={{ ...inp, flex: 2, minWidth: 200 }} placeholder="Title" value={draft.task} onChange={(e) => set({ task: e.target.value })} />
        <input style={{ ...inp, width: 130 }} placeholder="Skill" value={draft.skill} onChange={(e) => set({ skill: e.target.value })} />
        <input style={{ ...inp, width: 80 }} type="number" placeholder="Min" value={draft.estMinutes} onChange={(e) => set({ estMinutes: e.target.value })} />
        <input style={{ ...inp, width: 75 }} type="number" placeholder="Order" value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
      </div>
      <textarea style={{ ...inp, minHeight: 80 }} placeholder="Instructions / content shown to the candidate" value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      <input style={inp} placeholder="Link (video / quiz / form URL — optional)" value={draft.instructionsLink} onChange={(e) => set({ instructionsLink: e.target.value })} />
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" variant="primary" loading={busy} onClick={() => onSave(draft)}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "8px 10px", font: "inherit", fontSize: "var(--text-sm)", background: "var(--color-surface)" };
