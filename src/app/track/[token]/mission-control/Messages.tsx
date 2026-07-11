// Screen 6 — Messages & check-in. Slack-style threads grouped by actorType
// (Purii / Sarah / Emily / Michael / Human). AI actors carry an "✦ AI" badge and
// a disclosure line. A four-question daily check-in form posts type=checkin; the
// free composer posts type=chat to the active thread.

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CheckinAnswers,
  TrialActorType,
  TrialMessageView,
  TrialMessagesResponse,
} from "@/lib/trial/types";
import { api, fetchMessages } from "./lib";
import { AiBadge, Card, Icon } from "./ui";

const ACTOR_META: Record<TrialActorType, { name: string; role: string; ai: boolean }> = {
  Purii: { name: "Purii", role: "Coordinator", ai: true },
  Sarah: { name: "Sarah", role: "Project Manager", ai: true },
  Emily: { name: "Emily", role: "Senior VA", ai: true },
  Michael: { name: "Michael", role: "Client", ai: true },
  Human: { name: "Pure Water Team", role: "Human reviewer", ai: false },
};

const ORDER: TrialActorType[] = ["Purii", "Sarah", "Emily", "Michael", "Human"];

export function Messages({ token }: { token: string }) {
  const [data, setData] = useState<TrialMessagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TrialActorType>("Purii");
  const [showCheckin, setShowCheckin] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchMessages(token);
    if (!res.ok) { setError(res.error); return; }
    setError(null);
    setData(res);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const threads = useMemo(() => {
    const byActor = new Map<TrialActorType, TrialMessageView[]>();
    for (const c of data?.conversations ?? []) {
      const cur = byActor.get(c.actorType) ?? [];
      byActor.set(c.actorType, [...cur, ...c.messages]);
    }
    return ORDER.map((actor) => ({
      actor,
      messages: (byActor.get(actor) ?? []).slice().sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
    }));
  }, [data]);

  const activeThread = threads.find((t) => t.actor === active) ?? { actor: active, messages: [] };

  async function sendChat(text: string) {
    if (!text.trim()) return;
    setSending(true);
    const res = await api.messageReply(token, { type: "chat", actorType: active, text: text.trim() });
    setSending(false);
    if (res.ok) await load();
    else setError(res.error);
  }

  async function sendCheckin(answers: CheckinAnswers) {
    setSending(true);
    const res = await api.messageReply(token, { type: "checkin", answers });
    setSending(false);
    if (res.ok) { setShowCheckin(false); setActive("Purii"); await load(); }
    else setError(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="mc-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Messages</h1>
          <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>Your threads with the team. AI teammates are labelled.</p>
        </div>
        <button className="mc-btn mc-btn-sky" onClick={() => setShowCheckin((v) => !v)}>
          <Icon path="M9 11l3 3 8-8" size={15} /> Daily check-in
        </button>
      </div>

      {error && <div style={{ background: "#fde8e8", color: "#a01a1a", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>{error}</div>}

      {showCheckin && <CheckinForm onSubmit={sendCheckin} sending={sending} onCancel={() => setShowCheckin(false)} />}

      {/* Thread selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {threads.map((t) => {
          const m = ACTOR_META[t.actor];
          return (
            <button key={t.actor} className="mc-toggle" data-on={active === t.actor} onClick={() => setActive(t.actor)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span>{m.name}</span>
              {m.ai && <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.75 }}>✦AI</span>}
              {t.messages.length > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{t.messages.length}</span>}
            </button>
          );
        })}
      </div>

      {/* Active conversation */}
      <Card className="mc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <ThreadHeader actor={active} />
        <div style={{ display: "flex", flexDirection: "column", padding: "16px 2px", minHeight: 220, maxHeight: 460, overflowY: "auto" }}>
          {activeThread.messages.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--mc-ink-3)", fontSize: 14 }}>
              <img src="/purii/smile.png" alt="" style={{ height: 56, objectFit: "contain", opacity: 0.85 }} />
              <p style={{ margin: "6px 0 0" }}>No messages here yet. Say hello or ask a question.</p>
            </div>
          ) : (
            activeThread.messages.map((m) => <Bubble key={m.id} m={m} />)
          )}
        </div>
        <Composer actor={active} onSend={sendChat} sending={sending} />
      </Card>
    </div>
  );
}

function ThreadHeader({ actor }: { actor: TrialActorType }) {
  const m = ACTOR_META[actor];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: "1px solid var(--mc-border-subtle)" }}>
      <div className="mc-avatar" style={{ width: 34, height: 34, flex: "0 0 34px" }}>{m.name.slice(0, 2).toUpperCase()}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}>
          {m.name}{m.ai && <AiBadge />}
        </div>
        <div style={{ fontSize: 12, color: "var(--mc-ink-3)" }}>
          {m.role}{m.ai ? " · AI teammate — a human makes every hiring decision" : " · reach a real person any time"}
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: TrialMessageView }) {
  const mine = m.from === "me";
  return (
    <div className={`mc-msg${mine ? " mc-msg-mine" : ""}`}>
      {!mine && <div className="mc-avatar" style={{ width: 28, height: 28, flex: "0 0 28px", fontSize: 10 }}>{m.from.slice(0, 2).toUpperCase()}</div>}
      <div className="mc-bubble">
        {m.tag && !mine && <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--mc-sky-ink)", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>{m.tag}</div>}
        <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
      </div>
    </div>
  );
}

function Composer({ actor, onSend, sending }: { actor: TrialActorType; onSend: (t: string) => void; sending: boolean }) {
  const [text, setText] = useState("");
  function submit() {
    if (!text.trim() || sending) return;
    onSend(text);
    setText("");
  }
  return (
    <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid var(--mc-border-subtle)" }}>
      <input
        className="mc-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={`Message ${ACTOR_META[actor].name}…`}
      />
      <button className="mc-btn mc-btn-primary" disabled={!text.trim() || sending} onClick={submit}>
        <Icon path="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" size={15} />
      </button>
    </div>
  );
}

function CheckinForm({ onSubmit, sending, onCancel }: { onSubmit: (a: CheckinAnswers) => void; sending: boolean; onCancel: () => void }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [c, setC] = useState(""); const [d, setD] = useState("");
  const ready = a.trim() && b.trim();
  const rows: [string, string, string, (v: string) => void][] = [
    ["Completed", a, "What did you get done?", setA],
    ["Next", b, "What's next?", setB],
    ["Blocked", c, "Anything in your way? (optional)", setC],
    ["ETA changes", d, "Any timing changes to flag? (optional)", setD],
  ];
  return (
    <Card className="mc-card-pad" style={{ borderColor: "var(--mc-sky)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <img src="/purii/pointing.png" alt="" style={{ height: 40, objectFit: "contain" }} />
        <div>
          <h3 className="mc-display" style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Daily check-in</h3>
          <p style={{ fontSize: 12.5, color: "var(--mc-ink-2)", margin: 0 }}>A quick status so the team always knows where things stand.</p>
        </div>
      </div>
      <div className="mc-grid-2">
        {rows.map(([label, val, ph, set]) => (
          <div key={label}>
            <label className="mc-label">{label}</label>
            <textarea className="mc-textarea" style={{ minHeight: 64 }} value={val} onChange={(e) => set(e.target.value)} placeholder={ph} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="mc-btn mc-btn-primary" disabled={!ready || sending} onClick={() => onSubmit({ a: a.trim(), b: b.trim(), c: c.trim(), d: d.trim() })}>
          {sending ? "Sending…" : "Send check-in"}
        </button>
        <button className="mc-btn mc-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}
