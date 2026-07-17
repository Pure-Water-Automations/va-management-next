// Screen 8 — Resources drawer. Static reference cards summarizing the policies a
// candidate leans on during the week (docs 04/05 + appendix E). Reachable in a
// click; no interactivity required.

import { Card } from "./ui";

const RESOURCES: { icon: string; title: string; summary: string; points: string[] }[] = [
  {
    icon: "🤝",
    title: "Reliability & Commitments",
    summary: "The team can absorb almost any delay it knows about in advance. Silence is the only unrecoverable option.",
    points: [
      "If you'll miss a deadline, notify now with a revised ETA — not after.",
      "Share what's done, what's left, and what you'll do differently.",
      "Reliability is measured only inside your declared work windows.",
    ],
  },
  {
    icon: "🗣️",
    title: "Voice & Communication",
    summary: "Warm, clear, and specific. Lead with the business reason, then the ask.",
    points: [
      "Write like a trusted teammate, not a form letter.",
      "Confirm anything ambiguous before it reaches a client.",
      "Mark unconfirmed details as placeholders, e.g. [DATE TBC].",
    ],
  },
  {
    icon: "🔒",
    title: "Confidentiality",
    summary: "Client and donor details are private. Use only what a task needs, and protect the rest.",
    points: [
      "Never forward or resend sensitive attachments.",
      "Flag any accidental data exposure to a person immediately.",
      "When in doubt, ask before you share.",
    ],
  },
  {
    icon: "✦",
    title: "AI Use Policy",
    summary: "We use AI openly — with judgment. Verify before a client sees it, and never paste private data in.",
    points: [
      "Minimum necessary use: paste only what the task requires.",
      "Verify figures, dates, and links AI produces before sending.",
      "Never put client credentials or donor data into outside AI tools.",
    ],
  },
];

export function Resources() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="mc-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Resources</h1>
        <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>
          The handful of policies that keep clients trusting us. Skim them whenever you need a reminder.
        </p>
      </div>

      <div className="mc-grid-2">
        {RESOURCES.map((r) => (
          <Card key={r.title} className="mc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 24 }}>{r.icon}</div>
              <h3 className="mc-display" style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{r.title}</h3>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--mc-ink-2)", margin: 0 }}>{r.summary}</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
              {r.points.map((p, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--mc-ink)" }}>{p}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
