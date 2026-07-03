"use client";

import { useState, type CSSProperties } from "react";
import { BookingPicker } from "../../discover/BookingPicker";

type Booking = {
  orgName: string;
  contactName: string | null;
  status: string | null;
  videoUrl: string | null;
  callAtIso: string | null;
  callAtLabel: string | null;
} | null;

export function ManageBookingClient({ token, booking }: { token: string; booking: Booking }) {
  const [rescheduling, setRescheduling] = useState(false);
  const [label, setLabel] = useState<string | null>(booking?.callAtLabel ?? null);
  const [status, setStatus] = useState<string | null>(booking?.status ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!booking) {
    return (
      <div style={page}>
        <div style={card}>
          <h1 style={h1}>This link isn&apos;t valid</h1>
          <p style={p}>The booking link is invalid or has expired. You can start over from the discovery page.</p>
          <a href="/discover" style={{ ...btn, textDecoration: "none" }}>Go to /discover</a>
        </div>
      </div>
    );
  }

  const cancelled = status === "cancelled";
  const booked = !!label && !cancelled;

  async function cancel() {
    if (!window.confirm("Cancel this discovery call?")) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/discover/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, action: "cancel" }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error — please try again." }));
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Couldn't cancel."); return; }
    setLabel(null);
    setStatus("cancelled");
    setRescheduling(false);
  }

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ fontSize: 40 }}>🌊</div>
        <h1 style={h1}>Your discovery call</h1>
        <p style={p}>{booking.orgName}{booking.contactName ? ` · ${booking.contactName}` : ""}</p>

        {booked && !rescheduling && (
          <>
            <div style={callBox}>
              <div style={{ fontWeight: 700, color: "var(--color-navy-900)", fontSize: "var(--text-lg)" }}>{label}</div>
              {booking.videoUrl && (
                <a href={booking.videoUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-sky-600)", fontWeight: 700 }}>Join link</a>
              )}
            </div>
            {err && <div style={errStyle}>{err}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setRescheduling(true)} disabled={busy} style={btn}>Reschedule</button>
              <button onClick={cancel} disabled={busy} style={btnGhost}>Cancel call</button>
            </div>
          </>
        )}

        {(rescheduling || !booked) && !cancelled && (
          <>
            <p style={{ ...p, marginTop: 8 }}>{booked ? "Pick a new time:" : "Pick a time for your free 30-minute call:"}</p>
            <BookingPicker token={token} onBooked={(l) => { setLabel(l || "your selected time"); setStatus("scheduled"); setRescheduling(false); }} />
            {rescheduling && <button onClick={() => setRescheduling(false)} style={{ ...btnGhost, marginTop: 12 }}>Keep my current time</button>}
          </>
        )}

        {cancelled && (
          <>
            <p style={p}>This call is cancelled. Pick a new time whenever you&apos;re ready:</p>
            <BookingPicker token={token} onBooked={(l) => { setLabel(l || "your selected time"); setStatus("scheduled"); }} />
          </>
        )}
      </div>
    </div>
  );
}

const page: CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(180deg, var(--color-sky-50), var(--color-bg-secondary))" };
const card: CSSProperties = { width: "100%", maxWidth: 560, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-lg)", padding: "36px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" };
const h1: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", color: "var(--color-navy-900)", margin: "8px 0 4px", fontWeight: 700 };
const p: CSSProperties = { color: "var(--color-text-secondary)", fontSize: "var(--text-md)", margin: 0 };
const callBox: CSSProperties = { marginTop: 16, padding: "16px 20px", borderRadius: 16, background: "var(--color-sky-50)", border: "1px solid var(--color-sky-200)", display: "flex", flexDirection: "column", gap: 6, alignItems: "center", width: "100%" };
const btn: CSSProperties = { border: "none", borderRadius: 9999, padding: "11px 22px", background: "var(--color-navy-900, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-md)", cursor: "pointer" };
const btnGhost: CSSProperties = { border: "1.5px solid var(--color-border)", borderRadius: 9999, padding: "11px 22px", background: "var(--color-surface)", color: "var(--color-navy-900)", fontWeight: 600, fontSize: "var(--text-md)", cursor: "pointer" };
const errStyle: CSSProperties = { marginTop: 12, color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", fontWeight: 600 };
