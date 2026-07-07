import type { Block } from "@/lib/services/blocks";
import { olNumbers } from "@/lib/services/blocks";

/**
 * Server-rendered read-only projection of a hub page (client portal Overview,
 * published Library docs). No editing affordances, no client JS — "always the
 * current version, no exported PDFs, no stale links".
 */
export function ReadOnlyBlocks({ blocks }: { blocks: Block[] }) {
  const nums = olNumbers(blocks);
  return (
    <div>
      {blocks.map((b) => {
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
                  fontSize: "var(--text-sm)",
                  lineHeight: 1.55,
                  color: "var(--color-navy-800, #182a80)",
                }}
              >
                <span style={{ flex: "none" }}>💧</span>
                <span>{b.text}</span>
              </div>
            );
          case "h2":
            return (
              <h3 key={b.id} style={{ fontWeight: 600, fontSize: "var(--text-lg)", margin: "14px 0 4px", color: "var(--color-navy-900, #0f1c5e)" }}>
                {b.text}
              </h3>
            );
          case "todo":
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "3px 0", fontSize: "var(--text-sm)" }}>
                <span
                  style={{
                    flex: "none",
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    border: `1.5px solid ${b.done ? "var(--color-sky-500, #2eb4dd)" : "var(--color-border)"}`,
                    background: b.done ? "var(--color-sky-500, #2eb4dd)" : "transparent",
                    color: "#fff",
                    fontSize: 10,
                    lineHeight: "14px",
                    textAlign: "center",
                  }}
                >
                  {b.done ? "✓" : ""}
                </span>
                <span style={{ textDecoration: b.done ? "line-through" : "none", color: b.done ? "var(--color-text-tertiary)" : "inherit" }}>
                  {b.text}
                </span>
              </div>
            );
          case "ul":
            return (
              <div key={b.id} style={{ display: "flex", gap: 9, padding: "3px 0", fontSize: "var(--text-sm)" }}>
                <span style={{ flex: "none", width: 16, textAlign: "center", color: "var(--color-sky-600, #1d9cc7)" }}>•</span>
                <span>{b.text}</span>
              </div>
            );
          case "ol":
            return (
              <div key={b.id} style={{ display: "flex", gap: 9, padding: "3px 0", fontSize: "var(--text-sm)" }}>
                <span style={{ flex: "none", minWidth: 16, textAlign: "right", color: "var(--color-sky-600, #1d9cc7)", fontWeight: 600 }}>
                  {nums[b.id] ?? 1}.
                </span>
                <span>{b.text}</span>
              </div>
            );
          case "code":
            return (
              <pre
                key={b.id}
                style={{
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: 12,
                  background: "var(--color-bg-secondary)",
                  padding: "12px 14px",
                  margin: "6px 0",
                  fontFamily: "var(--font-mono, ui-monospace, Menlo, monospace)",
                  fontSize: "var(--text-xs)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  color: "var(--color-navy-900, #0f1c5e)",
                }}
              >
                {b.text}
              </pre>
            );
          case "chip":
            // Internal references (tasks/SOPs) don't leak into the portal as links.
            return (
              <span
                key={b.id}
                style={{
                  display: "inline-flex",
                  margin: "4px 0",
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-sky-100, #c9edf8)",
                  background: "var(--color-sky-50, #f0fafd)",
                  color: "var(--color-sky-700, #177a9c)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                }}
              >
                {b.text}
              </span>
            );
          default:
            return (
              <p key={b.id} style={{ margin: "6px 0", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}
