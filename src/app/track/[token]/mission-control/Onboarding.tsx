// Screen 1 + 2 — Welcome / AI disclosure + availability setup. Split layout:
// navy gradient intro on the left, onboarding form on the right. Three
// acknowledgment checks gate the "Acknowledge & Begin" button.

import { useMemo, useState } from "react";
import type { AcknowledgeRequest, DeclaredBlock } from "@/lib/trial/types";
import { AiBadge } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS: DeclaredBlock[] = ["Morning", "Afternoon", "Evening"];

const ACKS = [
  {
    key: "terms",
    label: "I understand this is a paid-style work simulation, not an exam",
    detail: "5–7 days, capped at 10 active hours. Work at your own pace within your declared windows.",
  },
  {
    key: "ai",
    label: "I understand Purii, Sarah, Emily and Michael are AI teammates",
    detail: "They schedule, assign, and give feedback — but every hiring decision is made by a human.",
  },
  {
    key: "confidentiality",
    label: "I'll treat all client details as confidential",
    detail: "Never paste private donor or client data into outside AI tools. Flag anything sensitive to a person.",
  },
] as const;

export function Onboarding({
  defaultName,
  defaultTimezone,
  onSubmit,
  submitting,
  error,
}: {
  defaultName: string | null;
  defaultTimezone: string | null;
  onSubmit: (body: AcknowledgeRequest) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [timezone, setTimezone] = useState(defaultTimezone ?? "");
  const [days, setDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [block, setBlock] = useState<DeclaredBlock>("Morning");
  const [acks, setAcks] = useState<Record<string, boolean>>({});

  const allAcked = ACKS.every((a) => acks[a.key]);
  const ready = name.trim().length > 1 && timezone.trim().length > 0 && days.length > 0 && allAcked;

  const missingHint = useMemo(() => {
    if (!name.trim()) return "Add your name to begin";
    if (!timezone.trim()) return "Add your timezone to begin";
    if (days.length === 0) return "Pick at least one available day";
    if (!allAcked) return "Check all three acknowledgments to begin";
    return null;
  }, [name, timezone, days, allAcked]);

  function toggleDay(d: string) {
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <div className="mc-root" style={{ display: "grid", placeItems: "center", padding: "clamp(0px, 3vw, 32px)" }}>
      <div
        className="mc-onb mc-card"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 430px) minmax(0, 1fr)",
          width: "100%",
          maxWidth: 940,
          overflow: "hidden",
        }}
      >
        {/* Left — navy gradient intro */}
        <div
          className="mc-onb-left"
          style={{
            background: "linear-gradient(165deg, #0d1d5f 0%, #16277a 60%, #1d3196 100%)",
            color: "#fff",
            padding: "36px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mc-brand-mark" style={{ background: "rgba(255,255,255,.14)" }}>PW</div>
            <div style={{ fontWeight: 700, letterSpacing: ".01em" }}>Pure Water · Trial</div>
          </div>

          <img src="/purii/waving.png" alt="Purii, your AI coordinator, waving hello"
            style={{ height: 96, objectFit: "contain", alignSelf: "flex-start" }} />

          <h1 className="mc-display" style={{ fontSize: 27, lineHeight: 1.15, fontWeight: 800, margin: 0 }}>
            Your first week at Pure Water starts here.
          </h1>

          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#d5ddf7", margin: 0 }}>
            This is a work simulation, not an exam: <strong style={{ color: "#fff" }}>5–7 days, capped
            at 10 active hours</strong>, on real-world simulated tools. You&apos;ll meet the team, help a
            client, and show us how you work.
          </p>

          <div style={{
            background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 14, padding: 14, fontSize: 13.5, lineHeight: 1.55, color: "#cfe8ff",
          }}>
            <div style={{ marginBottom: 6 }}><AiBadge /> <strong style={{ color: "#fff", marginLeft: 4 }}>Meet your AI teammates</strong></div>
            Purii coordinates, Sarah reviews your work, Emily answers questions, and Michael plays the
            client. They&apos;re disclosed AI — helpful, but not the judge. <strong style={{ color: "#fff" }}>Every
            hiring decision is made by a human.</strong> You can reach a real person any time.
          </div>
        </div>

        {/* Right — onboarding form */}
        <div style={{ background: "var(--mc-surface)", padding: "34px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <h2 className="mc-display" style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Let&apos;s set up your week</h2>
            <p style={{ fontSize: 13.5, color: "var(--mc-ink-2)", margin: 0 }}>
              We only measure reliability inside the windows you choose — so timezones never count against you.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label className="mc-label" htmlFor="mc-name">Your name</label>
              <input id="mc-name" className="mc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Santos" />
            </div>
            <div>
              <label className="mc-label" htmlFor="mc-tz">Timezone</label>
              <input id="mc-tz" className="mc-input" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="GMT+8 — Manila" />
            </div>
          </div>

          <div>
            <label className="mc-label">Days you&apos;ll be available</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {DAYS.map((d) => (
                <button key={d} type="button" className="mc-toggle" data-on={days.includes(d)} onClick={() => toggleDay(d)}>{d}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="mc-label">Your usual work block</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {BLOCKS.map((b) => (
                <button key={b} type="button" className="mc-toggle" data-on={block === b} onClick={() => setBlock(b)}>{b}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ACKS.map((a) => (
              <label key={a.key} style={{
                display: "flex", gap: 11, alignItems: "flex-start", padding: 12,
                border: `1px solid ${acks[a.key] ? "var(--mc-sky)" : "var(--mc-border)"}`,
                borderRadius: 14, cursor: "pointer", transition: "border-color .15s",
                background: acks[a.key] ? "rgba(77,196,232,.06)" : "transparent",
              }}>
                <input type="checkbox" checked={!!acks[a.key]} style={{ marginTop: 2, width: 17, height: 17, accentColor: "#0d1d5f" }}
                  onChange={(e) => setAcks((s) => ({ ...s, [a.key]: e.target.checked }))} />
                <span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{a.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--mc-ink-2)", marginTop: 2, lineHeight: 1.5 }}>{a.detail}</span>
                </span>
              </label>
            ))}
          </div>

          {error && (
            <div style={{ background: "#fde8e8", color: "#a01a1a", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>{error}</div>
          )}

          <div>
            <button
              className="mc-btn mc-btn-primary"
              style={{ width: "100%" }}
              disabled={!ready || submitting}
              onClick={() => onSubmit({ name: name.trim(), timezone: timezone.trim(), declaredDays: days, declaredBlock: block })}
            >
              {submitting ? "Setting up…" : "Acknowledge & Begin"}
            </button>
            {!ready && missingHint && (
              <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--mc-ink-3)", margin: "9px 0 0" }}>{missingHint}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
