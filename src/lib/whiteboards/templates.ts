// Whiteboard starter templates — pre-seeded frame/sticky layouts for common
// facilitation formats (kickoff, retro, brainstorm, prioritization, problem-solving,
// product scoping). Chosen for PWA's use cases: client onboarding, workflow fixes,
// product planning (VA Manager / Ministry OS), and recurring-work retros.
//
// Grounded in standard facilitation frameworks (AJ&Smart / facilitator.com). Shared
// by the create action (seeds the board `data`) and the client picker (metadata).

type El = {
  id: string;
  type: "frame" | "sticky" | "text" | "rect";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color?: string;
  title?: string;
  tint?: "sky" | "navy";
  size?: number;
  weight?: number;
  muted?: boolean;
  frameId?: string;
};
type Doc = { title: string; elements: El[]; links: { from: string; to: string }[] };

const NOTE = ["#FFE8A3", "#C4EEF9", "#CFF3E0", "#FBD5E0", "#D5DAF4"];

// Build a horizontal set of titled column-frames, each pre-filled with faint prompt
// stickies. cols[i] = { heading, prompts[] }. Tints alternate sky/navy.
function columns(
  title: string,
  cols: { heading: string; prompts: string[] }[],
  opts?: { colW?: number; noteColorByCol?: boolean },
): Doc {
  const colW = opts?.colW ?? 300;
  const gap = 40;
  const x0 = 60;
  const yFrame = 150;
  const noteW = colW - 48;
  const noteH = 104;
  const els: El[] = [{ id: "title", type: "text", x: x0, y: 64, w: 900, h: 40, text: title, size: 27, weight: 700 }];
  cols.forEach((c, ci) => {
    const fx = x0 + ci * (colW + gap);
    const fh = 96 + c.prompts.length * (noteH + 22);
    els.push({ id: `f${ci}`, type: "frame", x: fx, y: yFrame, w: colW, h: fh, title: c.heading, tint: ci % 2 === 0 ? "sky" : "navy" });
    c.prompts.forEach((p, pi) => {
      els.push({
        id: `s${ci}_${pi}`,
        type: "sticky",
        x: fx + 24,
        y: yFrame + 64 + pi * (noteH + 22),
        w: noteW,
        h: noteH,
        text: p,
        color: opts?.noteColorByCol ? NOTE[ci % NOTE.length] : NOTE[(ci + pi) % NOTE.length],
        frameId: `f${ci}`,
      });
    });
  });
  return { title, elements: els, links: [] };
}

// Impact/Effort 2×2 prioritization grid with axis labels.
function impactEffort(): Doc {
  const title = "Impact / Effort Matrix";
  const cell = 340;
  const gap = 20;
  const x0 = 200;
  const y0 = 150;
  const quads: { t: string; sub: string; tint: "sky" | "navy"; note: string }[] = [
    { t: "Quick Wins", sub: "High impact · Low effort", tint: "sky", note: "Do these first" },
    { t: "Big Bets", sub: "High impact · High effort", tint: "navy", note: "Plan & resource" },
    { t: "Fill-ins", sub: "Low impact · Low effort", tint: "navy", note: "Do if spare time" },
    { t: "Time Sinks", sub: "Low impact · High effort", tint: "sky", note: "Avoid / defer" },
  ];
  const els: El[] = [
    { id: "title", type: "text", x: x0, y: 60, w: 900, h: 40, text: title, size: 27, weight: 700 },
    { id: "axY", type: "text", x: x0 - 150, y: y0 + cell - 10, w: 260, h: 30, text: "IMPACT  ↑", size: 13, weight: 700, muted: true },
    { id: "axX", type: "text", x: x0 + cell + gap - 40, y: y0 + cell * 2 + gap + 16, w: 260, h: 30, text: "EFFORT  →", size: 13, weight: 700, muted: true },
  ];
  quads.forEach((q, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const fx = x0 + col * (cell + gap);
    const fy = y0 + row * (cell + gap);
    els.push({ id: `q${i}`, type: "frame", x: fx, y: fy, w: cell, h: cell, title: q.t, tint: q.tint });
    els.push({ id: `qs${i}`, type: "text", x: fx + 20, y: fy + 34, w: cell - 40, h: 24, text: q.sub, size: 12, weight: 600, muted: true });
    els.push({ id: `qn${i}`, type: "sticky", x: fx + 24, y: fy + 74, w: cell - 60, h: 104, text: q.note, color: NOTE[i % NOTE.length], frameId: `q${i}` });
  });
  return { title, elements: els, links: [] };
}

export type WhiteboardTemplate = { id: string; name: string; emoji: string; description: string; build: () => Doc };

export const WHITEBOARD_TEMPLATES: WhiteboardTemplate[] = [
  {
    id: "blank",
    name: "Blank board",
    emoji: "◻️",
    description: "Start from scratch.",
    build: () => ({ title: "Untitled board", elements: [], links: [] }),
  },
  {
    id: "kickoff",
    name: "Project Kick-off",
    emoji: "🚀",
    description: "Align a new project or client onboarding — goals, scope, owners, risks.",
    build: () =>
      columns("Project Kick-off", [
        { heading: "Goals", prompts: ["What does “done” look like?"] },
        { heading: "In scope", prompts: ["What we WILL do"] },
        { heading: "Out of scope", prompts: ["What we won’t do (yet)"] },
        { heading: "Owners", prompts: ["Who owns what?"] },
        { heading: "Milestones", prompts: ["Key dates & phases"] },
        { heading: "Risks", prompts: ["What could go wrong?"] },
      ]),
  },
  {
    id: "retro",
    name: "Retrospective",
    emoji: "🔄",
    description: "Start / Stop / Continue review of a sprint, event, or workflow.",
    build: () =>
      columns(
        "Retrospective — Start / Stop / Continue",
        [
          { heading: "Start", prompts: ["What should we START doing?"] },
          { heading: "Stop", prompts: ["What should we STOP doing?"] },
          { heading: "Continue", prompts: ["What’s working — keep it up?"] },
          { heading: "Action items", prompts: ["Convert these to tasks →"] },
        ],
        { colW: 320, noteColorByCol: true },
      ),
  },
  {
    id: "brainstorm",
    name: "Brainstorm & Vote",
    emoji: "💡",
    description: "Diverge then converge — dump ideas, cluster, dot-vote the best.",
    build: () =>
      columns("Brainstorm & Vote", [
        { heading: "1 · Ideas", prompts: ["Dump every idea — no filtering", "One idea per note"] },
        { heading: "2 · Themes", prompts: ["Cluster related ideas"] },
        { heading: "3 · Top picks", prompts: ["Dot-vote the best 3", "Convert winners to tasks →"] },
      ]),
  },
  {
    id: "prioritize",
    name: "Impact / Effort Matrix",
    emoji: "🎯",
    description: "Prioritize ideas or tasks by impact vs. effort (2×2).",
    build: impactEffort,
  },
  {
    id: "problem",
    name: "Problem-Solving (HMW)",
    emoji: "🧩",
    description: "Frame a problem, find root causes, reframe as “How Might We”, solve.",
    build: () =>
      columns("Problem-Solving", [
        { heading: "The problem", prompts: ["What’s actually wrong?"] },
        { heading: "Root causes", prompts: ["Why does it happen? (5 Whys)"] },
        { heading: "How Might We…", prompts: ["Reframe as an opportunity"] },
        { heading: "Ideas", prompts: ["Possible fixes"] },
        { heading: "Next steps", prompts: ["Convert to tasks →"] },
      ]),
  },
  {
    id: "scoping",
    name: "Product Strategy Scoping",
    emoji: "🧭",
    description: "Scope a product/feature — vision, users, problems, bets, non-goals.",
    build: () =>
      columns("Product Strategy Scoping", [
        { heading: "Vision", prompts: ["Where are we headed?"] },
        { heading: "Target users", prompts: ["Who is this for?"] },
        { heading: "Problems", prompts: ["What pain are we solving?"] },
        { heading: "Solution bets", prompts: ["How might we solve it?"] },
        { heading: "Non-goals", prompts: ["Explicitly NOT doing"] },
        { heading: "Success metrics", prompts: ["How we’ll know it worked"] },
      ]),
  },
];

export function buildTemplate(id: string): Doc {
  const t = WHITEBOARD_TEMPLATES.find((x) => x.id === id) ?? WHITEBOARD_TEMPLATES[0];
  return t.build();
}
