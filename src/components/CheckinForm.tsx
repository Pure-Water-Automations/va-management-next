"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { hourLabel } from "@/lib/services/availability";

function targetLabel(targetHoursWeekly: number | null | undefined) {
  return `${targetHoursWeekly ?? 0}h/week`;
}

const HOUR_OPTIONS = Array.from({ length: 48 }, (_, i) => i / 2);

export function CheckinForm({
  defaults,
}: {
  defaults: {
    targetHoursWeekly?: number | null;
    availabilityNotes?: string | null;
    availabilityStartHourEst?: number | null;
    availabilityEndHourEst?: number | null;
  };
}) {
  const router = useRouter();
  const [target, setTarget] = useState(String(defaults.targetHoursWeekly ?? ""));
  const [availability, setAvailability] = useState(defaults.availabilityNotes ?? "");
  const [startHour, setStartHour] = useState(String(defaults.availabilityStartHourEst ?? ""));
  const [endHour, setEndHour] = useState(String(defaults.availabilityEndHourEst ?? ""));
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    const res = await postAction("/api/va/check-in", {
      targetHoursWeekly: target ? Number(target) : undefined,
      availabilityNotes: availability,
      availabilityStartHourEst: startHour !== "" ? Number(startHour) : undefined,
      availabilityEndHourEst: endHour !== "" ? Number(endHour) : undefined,
      capacityFlag: capacity || undefined,
      notes,
    });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Submit failed");
      return;
    }
    setDone(true);
    router.refresh();
  }

  const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 };
  const label: React.CSSProperties = { fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", fontWeight: 700 };
  const input: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "10px 12px", font: "inherit", background: "var(--color-surface)" };

  if (done) {
    return <div style={{ padding: 16, color: "var(--color-success-dark)", background: "var(--color-success-light)", borderRadius: "var(--radius-lg)" }}>Thanks — your check-in was recorded.</div>;
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <div style={field}>
        <label style={label}>Target hours / week</label>
        <div className="small" style={{ marginBottom: 2 }}>
          Current target: <strong style={{ color: "var(--color-text-primary)" }}>{targetLabel(defaults.targetHoursWeekly)}</strong>
        </div>
        <input style={input} type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 20" aria-label="Target hours per week" />
      </div>
      <div style={field}>
        <label style={label}>Typical availability (EST)</label>
        <div className="small" style={{ marginBottom: 2 }}>So HR knows who's usually online for urgent/rush work.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select style={input} value={startHour} onChange={(e) => setStartHour(e.target.value)} aria-label="Availability start (EST)">
            <option value="">Start</option>
            {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{hourLabel(h)} EST</option>)}
          </select>
          <span className="small">to</span>
          <select style={input} value={endHour} onChange={(e) => setEndHour(e.target.value)} aria-label="Availability end (EST)">
            <option value="">End</option>
            {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{hourLabel(h)} EST</option>)}
          </select>
        </div>
      </div>
      <div style={field}>
        <label style={label}>Availability notes</label>
        <textarea style={{ ...input, minHeight: 70 }} value={availability} onChange={(e) => setAvailability(e.target.value)} />
      </div>
      <div style={field}>
        <label style={label}>Capacity</label>
        <select style={input} value={capacity} onChange={(e) => setCapacity(e.target.value)}>
          <option value="">Feeling balanced</option>
          <option value="overburdened">Overburdened — too much work</option>
          <option value="underutilized">Underutilized — I have capacity</option>
        </select>
      </div>
      <div style={field}>
        <label style={label}>Anything else?</label>
        <textarea style={{ ...input, minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button onClick={submit} loading={loading} disabled={loading} variant="primary">Submit check-in</Button>
    </div>
  );
}
