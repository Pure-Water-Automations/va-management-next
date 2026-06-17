/**
 * Manage the 10-hour training-module catalog (the editable checklist candidates
 * work through in the timer). Items have a kind — read | video | quiz | task |
 * submit — mirroring the official module: read Modules 1–3, watch the 8 video
 * tutorials, take the quiz, do the practical tasks, and submit a Loom.
 */
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";

const QUIZ_URL = "https://purewaterautomations.getformly.com/f/qLFt8d";
const SUBMIT_URL = "https://docs.google.com/forms/d/e/1FAIpQLSerrnTVxRCBHJTLIcmiiDLzXstyE7xh56XnVRNgEVQvTnkMKQ/viewform";

type ModuleItem = {
  kind: string;
  task: string;
  skill?: string;
  estMinutes: number;
  sortOrder: number;
  instructions: string;
  instructionsLink?: string;
};

export const TRAINING_MODULE: ModuleItem[] = [
  // ── Read: Modules 1–3 (content embedded so candidates don't need Notion) ──
  {
    kind: "read",
    task: "Read · Module 1: Understand Our Mission",
    skill: "Mission",
    estMinutes: 12,
    sortOrder: 1,
    instructions:
      "Pure Water Assistants supports ministries and organizations with administrative help so clients can stay focused on their purpose — we reclaim ministry time by handling admin tasks.\n\nCORE VALUES:\n1. Integrity — transparent, honest, reliable service.\n2. Service — meaningful, efficient support of each client's mission.\n3. Excellence — high standards in communication and execution.\n4. Collaboration — teamwork with clients and each other.\n5. Faith — a faith-driven approach aligned with True Mother Hak Ja Han Moon's teachings.\n\nVISION: ministries focus on their calling, empowered by reliable virtual support that reduces distraction and burnout.\n\nYOUR ROLE AS A VA: support clients' daily operations — scheduling, communication, social media, document creation. Organize and track tasks; communicate effectively; support admin needs.\n\nRemember: “You are the hope of São Tomé. Because of you, Pure Water São Tomé can achieve the Kingdom of Heaven on Earth that our Heavenly Parent desires.” – True Mother Hak Ja Han Moon",
  },
  {
    kind: "read",
    task: "Read · Module 2: Master Core Tools",
    skill: "Tools",
    estMinutes: 10,
    sortOrder: 2,
    instructions:
      "Get familiar with the essential tools you'll use daily as a VA:\n\n• Notion — task & project management (boards: To Do / In Progress / Completed; SOPs & docs)\n• ChatGPT — research & writing (draft emails, posts, newsletters; generate ideas)\n• Google Workspace — Docs / Sheets / Drive / Calendar for creation, sharing, scheduling\n• Desklog.io — time tracking & reports\n• WhatsApp — quick client communication, sharing files & links\n• Canva — graphic design (social posts, flyers, marketing)\n• Loom — video messaging & reporting (end-of-day reports, walkthroughs)\n\nGoal: use all core tools confidently to deliver efficient, high-quality work.",
  },
  {
    kind: "read",
    task: "Read · Module 3: Learn VA Basics",
    skill: "VA Basics",
    estMinutes: 12,
    sortOrder: 3,
    instructions:
      "Build a strong foundation in core VA skills.\n\nCORE RESPONSIBILITIES: task management (scheduling, prioritizing, deadlines); communication (professional emails, calendar, timely updates); document creation & management; social-media support.\n\nCOMMUNICATION BASICS: be clear & concise; professional (spelling/grammar); responsive (acknowledge + give an ETA).\nExample — Subject: Meeting Follow-Up — “Hi [Client], thank you for your message. I've reviewed the materials and will begin the next steps right away. You can expect a detailed update by [date/time]. Best regards, [Your Name].”\n\nTIME MANAGEMENT: set priorities; use task lists; track time (Desklog).\n\nREPORTING: a daily Loom should cover tasks completed, updates/changes, and items needing client attention.\n\nMaster: task management, communication, document creation, time management, social-media support.",
  },

  // ── Watch: Module 4 — the 8 video tutorials ──
  { kind: "video", task: "Watch · Executive Virtual Assistant (free course)", skill: "VA fundamentals", estMinutes: 45, sortOrder: 10, instructions: "Watch the first 45 minutes. Intro to being a Virtual Executive Assistant: responsibilities, skills, tools, client types, and how to book clients. (A short knowledge check follows in the quiz.)", instructionsLink: "https://youtu.be/YUrMGJeY0eo" },
  { kind: "video", task: "Watch · Notion Masterclass — build a task manager", skill: "Notion", estMinutes: 60, sortOrder: 11, instructions: "Watch the full hour. Build a master tasks database and use linked views, properties, relations, filters, and templates.", instructionsLink: "https://www.youtube.com/watch?v=32dLXdB4ozs" },
  { kind: "video", task: "Watch · ChatGPT Tutorial 2025 — beginner to pro", skill: "ChatGPT", estMinutes: 60, sortOrder: 12, instructions: "Watch the full hour. Setup, prompting frameworks, and advanced features (browsing, vision, data analysis, image generation, voice).", instructionsLink: "https://youtu.be/zqVtHYFYQY8" },
  { kind: "video", task: "Watch · Google Drive for Beginners (Docs/Sheets/Forms/Slides)", skill: "Google Workspace", estMinutes: 60, sortOrder: 13, instructions: "Watch the full hour covering Drive, Docs, Sheets, Forms, and Slides.", instructionsLink: "https://youtu.be/h9UrHBzw0H8" },
  { kind: "video", task: "Watch · Canva Tutorial (2025)", skill: "Design", estMinutes: 60, sortOrder: 14, instructions: "Watch the full hour. Designing social posts, flyers, and marketing materials in Canva.", instructionsLink: "https://youtu.be/CSlQtvLRhVk" },
  { kind: "video", task: "Watch · Google Calendar for Virtual Assistants", skill: "Scheduling", estMinutes: 30, sortOrder: 15, instructions: "Managing a client's calendar: templates, avoiding conflicts, time zones, and time-blocking.", instructionsLink: "https://www.youtube.com/watch?v=5Et7W1o7oWA" },
  { kind: "video", task: "Watch · How to install Desklog (time tracking)", skill: "Desklog", estMinutes: 15, sortOrder: 16, instructions: "Install Desklog so you can track time — you'll use it on the job.", instructionsLink: "https://youtu.be/nH6FZ07YTgc" },
  { kind: "video", task: "Watch · Notion Projects — getting started (playlist)", skill: "Notion", estMinutes: 30, sortOrder: 17, instructions: "Work through the getting-started playlist for Notion Projects.", instructionsLink: "https://youtube.com/playlist?list=PLzaYMdbJMZW3DeRQ_uxdl4DFHFumE_D9Q" },

  // ── Quiz ──
  { kind: "quiz", task: "Take the knowledge quiz", skill: "Knowledge check", estMinutes: 15, sortOrder: 20, instructions: "Answer the multiple-choice knowledge check based on the modules and videos above.", instructionsLink: QUIZ_URL },

  // ── Practical tasks ──
  { kind: "task", task: "Task · Draft a customer reply", skill: "Communication", estMinutes: 15, sortOrder: 30, instructions: "A customer writes: “Hi, I ordered 2 weeks ago and still have no tracking — can you help?” Write a warm, professional reply that acknowledges the concern, sets expectations, and gives a clear next step. Then write a short 2-sentence follow-up you'd send 3 days later." },
  { kind: "task", task: "Task · Research & summarize a tool", skill: "Research", estMinutes: 20, sortOrder: 31, instructions: "Pick a tool a VA team might use. Spend ~20 min researching it, then deliver 5 concise bullet points on what it does and 1 short recommendation on whether we should use it and why." },
  { kind: "task", task: "Task · Write social media copy", skill: "Marketing", estMinutes: 20, sortOrder: 32, instructions: "Write 3 social-media captions and 1 short post (3–4 sentences) on a clean-water or virtual-assistant theme. Make them engaging, friendly, and benefit-focused." },
  { kind: "task", task: "Task · Organize a messy list in a spreadsheet", skill: "Data", estMinutes: 25, sortOrder: 33, instructions: "Create a Google Sheet with ~10 made-up rows of contacts or tasks, then clean it into proper columns (Name, Email, Status, Date), sort it, and add a summary count at the bottom. Share a view-access link." },
  { kind: "task", task: "Task · Design a simple graphic", skill: "Design", estMinutes: 30, sortOrder: 34, instructions: "Using Canva (free) or any tool, create one clean, readable branded graphic — for example a quote post or a “We're hiring VAs” announcement. Share a link to it." },

  // ── Submit ──
  { kind: "submit", task: "Submit your result + 2–3 min Loom walkthrough", skill: "Submission", estMinutes: 20, sortOrder: 40, instructions: "Submit your assignment results and record a short 2–3 minute Loom walking through what you did. Use the submission form.", instructionsLink: SUBMIT_URL },
];

/**
 * Seed the full module. With `reset`, first removes any catalog items that have
 * no candidate progress (safe), so re-seeding cleanly replaces the defaults.
 */
export async function seedTrainingModule(actorEmail: string, opts: { reset?: boolean } = {}) {
  if (opts.reset) {
    const orphans = await db.trainingAssignment.findMany({ where: { progress: { none: {} } }, select: { id: true } });
    if (orphans.length) await db.trainingAssignment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  }
  const count = await db.trainingAssignment.count();
  if (count > 0 && !opts.reset) return { ok: true, created: 0, note: "Catalog already has items." };

  await db.trainingAssignment.createMany({
    data: TRAINING_MODULE.map((m) => ({
      kind: m.kind,
      task: m.task,
      skill: m.skill ?? null,
      estMinutes: m.estMinutes,
      sortOrder: m.sortOrder,
      instructions: m.instructions,
      instructionsLink: m.instructionsLink ?? null,
      active: true,
    })),
  });
  await logActivity({ source: "recruitment", eventType: "training_module_seeded", summary: `Loaded the 10-hour training module (${TRAINING_MODULE.length} items) by ${actorEmail}` });
  return { ok: true, created: TRAINING_MODULE.length };
}

export type SaveTrainingTaskInput = {
  id?: string;
  kind?: string;
  task: string;
  skill?: string;
  estMinutes?: number;
  instructions?: string;
  instructionsLink?: string;
  sortOrder?: number;
  active?: boolean;
};

const KINDS = ["read", "video", "quiz", "task", "submit"];

export async function saveTrainingTask(input: SaveTrainingTaskInput, actorEmail: string) {
  const task = (input.task ?? "").trim();
  if (!task) throw new Error("Title is required.");
  const kind = KINDS.includes((input.kind ?? "").trim()) ? (input.kind as string).trim() : "task";
  const data = {
    kind,
    task,
    skill: clean(input.skill),
    estMinutes: Number.isFinite(input.estMinutes) ? Math.max(0, Math.trunc(input.estMinutes as number)) : null,
    instructions: clean(input.instructions),
    instructionsLink: clean(input.instructionsLink),
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder as number) : 0,
    active: input.active ?? true,
  };
  const row = input.id
    ? await db.trainingAssignment.update({ where: { id: input.id }, data })
    : await db.trainingAssignment.create({ data });
  await logActivity({ source: "recruitment", eventType: "training_task_saved", summary: `Training item "${row.task}" saved by ${actorEmail}` });
  return row;
}

export async function setTrainingTaskActive(id: string, active: boolean, actorEmail: string) {
  const row = await db.trainingAssignment.update({ where: { id }, data: { active } });
  await logActivity({ source: "recruitment", eventType: "training_task_toggled", summary: `Training item "${row.task}" ${active ? "activated" : "deactivated"} by ${actorEmail}` });
  return row;
}

export async function deleteTrainingTask(id: string, actorEmail: string) {
  const used = await db.trainingTaskProgress.count({ where: { assignmentId: id } });
  if (used > 0) throw new Error("This item has candidate progress — deactivate it instead of deleting.");
  const row = await db.trainingAssignment.delete({ where: { id } });
  await logActivity({ source: "recruitment", eventType: "training_task_deleted", summary: `Training item "${row.task}" deleted by ${actorEmail}` });
  return { ok: true };
}

function clean(v?: string): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}
