// Project Replay Timeline (doc 08 §3 Screen 3): the full chronological event
// log, grouped by trial day, with actor badges and event-type glyphs. Each row
// carries an `id` anchor so the Competency Explorer can deep-link to it.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { actorVariant, eventGlyph, eventTitle } from "./event-format";
import type { TimelineEntry } from "./view-types";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  const days = [...new Set(entries.map((e) => e.day))].sort((a, b) => a - b);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 12 }}>
        Project replay timeline
      </div>

      {entries.length === 0 ? (
        <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
          No events logged yet.
        </div>
      ) : (
        days.map((day) => (
          <div key={day} style={{ marginBottom: 18 }}>
            <div style={{ position: "sticky", top: 0, fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--color-navy-800)", marginBottom: 8 }}>
              Day {day}
            </div>
            <div style={{ borderLeft: "2px solid var(--color-border-subtle)", paddingLeft: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {entries
                .filter((e) => e.day === day)
                .map((e) => (
                  <div
                    key={e.id}
                    id={`ev-${e.id}`}
                    style={{ display: "flex", gap: 10, alignItems: "flex-start", scrollMarginTop: 80 }}
                  >
                    <span style={{ fontSize: "var(--text-md)", lineHeight: 1.3, width: 22, flexShrink: 0 }} aria-hidden>
                      {eventGlyph(e.type)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{eventTitle(e.type)}</span>
                        <Badge variant={actorVariant(e.actor)} size="sm">{e.actor}</Badge>
                        <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{fmtTime(e.timestamp)}</span>
                      </div>
                      {e.label && (
                        <div className="small" style={{ color: "var(--color-text-secondary)", marginTop: 2, wordBreak: "break-word" }}>
                          {e.label}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
