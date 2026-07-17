// Competency Evidence Explorer (doc 08 §3 Screen 4): groups timeline events
// under the 6 operational competencies (doc 04). Each item anchors back to its
// timeline entry (#ev-<id>) so a reviewer can jump from a competency claim to
// the raw evidence.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { COMPETENCIES, competenciesForEvent, type CompetencyKey } from "./competency-map";
import { eventGlyph, eventTitle } from "./event-format";
import type { TimelineEntry } from "./view-types";

export function CompetencyExplorer({ entries }: { entries: TimelineEntry[] }) {
  const grouped = new Map<CompetencyKey, TimelineEntry[]>();
  for (const c of COMPETENCIES) grouped.set(c.key, []);
  for (const e of entries) {
    for (const key of competenciesForEvent(e.type)) grouped.get(key)?.push(e);
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 12 }}>
        Competency evidence explorer
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {COMPETENCIES.map((c) => {
          const items = grouped.get(c.key) ?? [];
          return (
            <div key={c.key} style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{c.label}</span>
                <Badge variant={items.length > 0 ? "info" : "default"} size="sm">{items.length}</Badge>
              </div>
              {items.length === 0 ? (
                <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No evidence yet.</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {items.map((e) => (
                    <li key={e.id}>
                      <a
                        href={`#ev-${e.id}`}
                        style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: "var(--text-xs)", color: "var(--color-sky-700)", textDecoration: "none" }}
                      >
                        <span aria-hidden>{eventGlyph(e.type)}</span>
                        <span>{eventTitle(e.type)}</span>
                        <span style={{ color: "var(--color-text-tertiary)" }}>· Day {e.day}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
