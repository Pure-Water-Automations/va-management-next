"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Slot = { startIso: string; endIso: string };

/** Public slot picker — fetches open discovery-call times and books one by token. */
export function BookingPicker({
  token,
  fallbackUrl,
  onBooked,
}: {
  token: string;
  fallbackUrl?: string | null;
  onBooked?: (label: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function loadSlots() {
    setSlots(null);
    const d = await fetch("/api/discover/slots").then((r) => r.json()).catch(() => ({ ok: false }));
    setSlots(d.ok ? (d.slots as Slot[]) : []);
  }
  useEffect(() => { void loadSlots(); }, []);

  async function book(startIso: string) {
    setBusy(startIso);
    setErr("");
    const res = await fetch("/api/discover/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, startIso }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error — please try again." }));
    setBusy(null);
    if (!res.ok) {
      setErr(res.error || "Couldn't book that time.");
      if (typeof res.error === "string" && /taken/i.test(res.error)) void loadSlots();
      return;
    }
    onBooked?.(res.result?.label || "");
  }

  if (slots === null) return <div style={hint}>Finding the best open times…</div>;

  if (slots.length === 0) {
    return (
      <div style={hint}>
        We&apos;re fully booked at the moment — we&apos;ll email you to find a time.
        {fallbackUrl ? (
          <>
            {" "}Or <a href={fallbackUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-sky-600)", fontWeight: 700 }}>book here</a>.
          </>
        ) : null}
      </div>
    );
  }

  // Group by local calendar day.
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = new Date(s.startIso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }

  return (
    <div style={{ width: "100%", marginTop: 6 }}>
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 360, overflowY: "auto" }}>
        {[...groups.entries()].map(([day, daySlots]) => (
          <div key={day}>
            <div style={dayLabel}>{day}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {daySlots.map((s) => (
                <button key={s.startIso} onClick={() => book(s.startIso)} disabled={!!busy} style={slotBtn}>
                  {busy === s.startIso ? "…" : new Date(s.startIso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={tz}>Times shown in your local timezone.</div>
    </div>
  );
}

const hint: CSSProperties = { color: "var(--color-text-secondary)", fontSize: "var(--text-md)", marginTop: 10 };
const dayLabel: CSSProperties = { fontWeight: 700, color: "var(--color-navy-900)", fontSize: "var(--text-md)", marginBottom: 8 };
const slotBtn: CSSProperties = { border: "1.5px solid var(--color-sky-300)", borderRadius: 9999, padding: "9px 16px", background: "var(--color-surface)", color: "var(--color-navy-900)", fontWeight: 600, fontSize: "var(--text-md)", cursor: "pointer" };
const errStyle: CSSProperties = { marginBottom: 10, color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", fontWeight: 600 };
const tz: CSSProperties = { marginTop: 12, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" };
