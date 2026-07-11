// Seeds the PWA Skills Trial program versions + the V2 launch mission pack
// (docs/skills-trial/appendices/E-launch-mission-pack.md). Idempotent:
// versions are upserted by versionNumber, templates by (version, key) — an
// admin-edited template is only updated, never duplicated. Safe to re-run.
//
// Version 1 = the legacy checklist era (no MissionTemplates; existing tenhr
// candidates map here so the old TrackClient UI keeps rendering for them).
// Version 2 = the simulated work week.
//
// Run: npm run seed:skills-trial

import { db } from "@/lib/db";

type TemplateSeed = {
  sortOrder: number;
  key: string;
  title: string;
  kind: string;
  kindLabel: string;
  estMinutes: number;
  dayDue: number;
  clientName: string;
  story: string;
  deliverableText: string;
  instructionsText: string;
  contentJson?: unknown;
};

const V2_TEMPLATES: TemplateSeed[] = [
  {
    sortOrder: 1,
    key: "welcome",
    title: "Welcome to Pure Water",
    kind: "learn",
    kindLabel: "ORIENTATION",
    estMinutes: 30,
    dayDue: 1,
    clientName: "PWA Team",
    story:
      "Before you touch client work, meet the people it serves: pastors and ministry leaders drowning in admin. Every task you take has a congregation behind it.",
    deliverableText: "Complete the orientation reading and the scenario check.",
    instructionsText:
      "Pure Water Automations supports pastors and ministry leaders by removing administrative burden through documented workflows and light automation. We expect VAs to execute reliably today, and search for workflow improvements tomorrow (Systems Scout). Read the orientation, then answer the scenario question.",
    contentJson: {
      scenario: {
        question:
          "A client's weekly newsletter takes 3 hours because submissions arrive in 4 different formats. You're asked to produce this week's issue. What's the PWA move?",
        options: [
          {
            id: "A",
            text: "Produce it well, then note the intake problem and suggest a single submission form.",
            correct: true,
          },
          {
            id: "B",
            text: "Build an automation to parse all 4 formats before doing the newsletter.",
            correct: false,
          },
          {
            id: "C",
            text: "Just produce it — process improvement isn't the VA's job.",
            correct: false,
          },
        ],
        feedbackCorrect:
          "Exactly — execute reliably first, then scout the system. Simplify before automating.",
        feedbackIncorrect:
          "Not quite. Reliable delivery comes first, and simplifying beats automating — but noticing the pattern IS part of the job.",
      },
    },
  },
  {
    sortOrder: 2,
    key: "sandbox",
    title: "Sandbox Console Practice",
    kind: "tour",
    kindLabel: "ORIENTATION",
    estMinutes: 45,
    dayDue: 1,
    clientName: "PWA Team",
    story:
      "The VA Manager is where the whole team lives. The habits you build in this sandbox are the habits clients feel as reliability.",
    deliverableText:
      "Complete one full task lifecycle in the sandbox: status → comment → evidence link → submit.",
    instructionsText:
      'Practice executing a task lifecycle in the sandbox: 1) Set status to "In Progress". 2) Post a comment: "Starting now — will flag anything unclear @teamlead". 3) Attach an evidence URL (any link works in the sandbox). 4) Click "Submit for review".',
    contentJson: {
      checklist: [
        'Set status to "In Progress"',
        "Post a starting comment",
        "Attach an evidence URL",
        'Click "Submit for review"',
      ],
    },
  },
  {
    sortOrder: 3,
    key: "promises",
    title: "How We Keep Promises",
    kind: "learn",
    kindLabel: "ORIENTATION",
    estMinutes: 45,
    dayDue: 1,
    clientName: "PWA Team",
    story:
      "A client once nearly walked away — not over a mistake, but over silence. Learn the communication pattern that keeps trust.",
    deliverableText: "Complete the reliability reading and the scenario check.",
    instructionsText:
      "Orientation on reliability protocols: communication channels, ETAs, and blocker-reporting practices. Early notice with a plan protects the relationship. Read, then answer the scenario question.",
    contentJson: {
      scenario: {
        question:
          "It's 2 hours before a deliverable is due and you realize you'll miss it by half a day. What do you do?",
        options: [
          {
            id: "A",
            text: "Say nothing and push to finish as fast as possible — it's close.",
            correct: false,
          },
          {
            id: "B",
            text: "Notify now with a revised ETA, what's done so far, and what you'll do differently.",
            correct: true,
          },
          {
            id: "C",
            text: "Submit what you have without comment so something is on time.",
            correct: false,
          },
        ],
        feedbackCorrect:
          "Right. Early notice with a plan protects the relationship — that's the whole game.",
        feedbackIncorrect:
          "The team can absorb almost any delay it knows about in advance. Silence is the only unrecoverable option.",
      },
    },
  },
  {
    sortOrder: 4,
    key: "ai-safety",
    title: "AI and Safety Guidelines",
    kind: "learn",
    kindLabel: "ORIENTATION",
    estMinutes: 45,
    dayDue: 1,
    clientName: "PWA Team",
    story:
      "We use AI openly here. Learn what never goes into an AI tool — and what always gets verified before a client sees it.",
    deliverableText: "Complete the AI-safety reading and the scenario check.",
    instructionsText:
      "Guidance on acceptable AI use: verify figures and links, disclose AI drafts, and never paste client credentials or private donor details into AI tools. Read, then answer the scenario question.",
    contentJson: {
      scenario: {
        question:
          "A mock client's email accidentally includes a spreadsheet of donor names and amounts. Your task only needs the event date from that email. What do you do?",
        options: [
          {
            id: "A",
            text: "Use the date, and paste the email into AI to summarize the rest — it saves time.",
            correct: false,
          },
          {
            id: "B",
            text: "Use the date, don't forward or paste the attachment anywhere, and flag the exposure to the team.",
            correct: true,
          },
          {
            id: "C",
            text: "Delete the email and ask the client to resend everything.",
            correct: false,
          },
        ],
        feedbackCorrect:
          "Correct — minimum necessary use, no propagation, and a human flag. That's security by design.",
        feedbackIncorrect:
          "Careful — sensitive data never goes into AI tools or gets resent. Use only what the task needs and alert a person.",
      },
    },
  },
  {
    sortOrder: 5,
    key: "sim",
    title: "Client Sim — Community Impact Day",
    kind: "sim",
    kindLabel: "CLIENT WORK",
    estMinutes: 105,
    dayDue: 2,
    clientName: "Grace Community Center",
    story:
      "Tomorrow's newsletter reaches hundreds of families. The request is messy — a conflicting date, a missing link, an urgent ask. Exactly like real life.",
    deliverableText:
      "A clarifying message to the client and an announcement draft, plus a task status handoff.",
    instructionsText:
      "Review the kickoff brief, identify anything that needs client confirmation before publishing, draft a clarifying message and the announcement, and hand off the task status properly.",
    contentJson: {
      clientBrief:
        "Please announce our Community Impact Day. It is Saturday, August 12 from 10:00 a.m. to 2:00 p.m. at the community center. The flyer says August 21, but I think the flyer might be old. We need this in the newsletter and calendar today. Registration is required. Please make it sound exciting and send it out as soon as possible.",
      // Hidden evaluation targets — never exposed through the candidate API.
      hiddenTargets: [
        "Identifies the flyer date conflict (August 21 vs August 12)",
        "Asks client to confirm the date and provide the missing registration link before finalizing",
        "Flags unconfirmed dates in the draft as placeholders (e.g. [DATE TBC])",
        'Transitions status to "Blocked — awaiting client" and submits a handoff note',
      ],
      checklist: [
        "I checked all dates against every source in the brief",
        "I listed the questions the client must answer before this can ship",
        "My draft marks unconfirmed details as placeholders",
        "I wrote a status handoff for the team",
      ],
    },
  },
  {
    sortOrder: 6,
    key: "branch",
    title: "Specialization Challenge",
    kind: "branch",
    kindLabel: "CLIENT WORK",
    estMinutes: 120,
    dayDue: 3,
    clientName: "Assigned track",
    story:
      "Time to go deep on your track. Same client world, specialized craft — this is the work you'd actually be hired to do.",
    deliverableText: "The deliverable for your assigned specialization track brief.",
    instructionsText:
      "Complete the brief for your assigned specialization track (Communications, Project Coordination, or Grant Research). Your recruiter selected the track on your profile.",
    contentJson: {
      tracks: {
        comms: {
          label: "Communications / Newsletter",
          brief:
            "Draft the June Ministry newsletter using the 5 rough calendar submissions provided. Edit the layout, cross-verify dates, flag the missing speaker time, and draft the email for client approval.",
        },
        coordination: {
          label: "Project Coordination",
          brief:
            "Convert the raw, messy planning notes into a structured task hierarchy in the console: tasks, subtasks, mock owners, milestones, and a status brief. Flag resource bottlenecks.",
        },
        research: {
          label: "Grant & Nonprofit Research",
          brief:
            "Research three specific mock grant programs for a youth community clinic in the provided directory. Cross-check eligibility rules, document funding amounts and deadlines, list your assumptions, and write a summary brief.",
        },
      },
    },
  },
  {
    sortOrder: 7,
    key: "sop",
    title: "Thursday Newsletter SOP",
    kind: "sop",
    kindLabel: "SYSTEMS",
    estMinutes: 75,
    dayDue: 5,
    clientName: "PWA Operations",
    story:
      "Eunmi runs this from memory every week. Document it so anyone could — and spot one improvement. Nobody asked you to make it better. That's the point.",
    deliverableText:
      "A structured SOP (Purpose, Inputs, Steps, Exceptions, DoD) plus one improvement opportunity.",
    instructionsText:
      "Watch the process walkthrough, then document the Thursday newsletter process as a numbered SOP. Fields: Purpose & Trigger, Inputs & Owners, Numbered Steps, Exceptions, Definition of Done, and one Improvement Opportunity.",
    contentJson: {
      sopFields: [
        "Purpose & Trigger",
        "Inputs & Owners",
        "Numbered Steps",
        "Exceptions",
        "Definition of Done",
        "Improvement Opportunity",
      ],
    },
  },
  {
    sortOrder: 8,
    key: "standup",
    title: "Team Standup Meeting",
    kind: "meet",
    kindLabel: "TEAM",
    estMinutes: 30,
    dayDue: 5,
    clientName: "PWA Team",
    story:
      "Fifteen minutes with the team. Come prepared with a concise update — or reschedule responsibly. Both build trust.",
    deliverableText:
      "Confirmed attendance at the standup with a prepared Done / Next / Blocked update.",
    instructionsText:
      "Confirm your standup slot from the offered time (or use the one-time reschedule path responsibly). Arrive prepared with a concise update: what's Done, what's Next, what's Blocked. Post your formal status handoff afterward.",
  },
  {
    sortOrder: 9,
    key: "reflect",
    title: "Walkthrough & Reflection",
    kind: "reflect",
    kindLabel: "REFLECTION",
    estMinutes: 60,
    dayDue: 6,
    clientName: "PWA Team",
    story:
      "The work is done. Now show us how you think — walk through your decisions and what you learned about how PWA works.",
    deliverableText: "Written (or recorded) answers to the three reflection questions.",
    instructionsText:
      "Answer the three reflection questions honestly and specifically. Reference concrete moments from your week.",
    contentJson: {
      questions: [
        "Walk us through your client simulation — key choices and why.",
        "What would you do differently with more time?",
        "What did you learn about how PWA works?",
      ],
    },
  },
];

async function main(): Promise<void> {
  // Version 1 — legacy checklist era (inactive; existing candidates map here).
  await db.trialProgramVersion.upsert({
    where: { versionNumber: 1 },
    update: {},
    create: { versionNumber: 1, name: "V1 Legacy Checklist", active: false },
  });

  // Version 2 — simulated work week.
  const v2 = await db.trialProgramVersion.upsert({
    where: { versionNumber: 2 },
    update: { active: true },
    create: { versionNumber: 2, name: "V2 Simulated Work Week", active: true },
  });

  for (const t of V2_TEMPLATES) {
    const existing = await db.missionTemplate.findFirst({
      where: { programVersionId: v2.id, key: t.key },
    });
    const data = {
      programVersionId: v2.id,
      sortOrder: t.sortOrder,
      key: t.key,
      title: t.title,
      kind: t.kind,
      kindLabel: t.kindLabel,
      estMinutes: t.estMinutes,
      dayDue: t.dayDue,
      clientName: t.clientName,
      story: t.story,
      deliverableText: t.deliverableText,
      instructionsText: t.instructionsText,
      contentJson: (t.contentJson ?? undefined) as never,
    };
    if (existing) {
      await db.missionTemplate.update({ where: { id: existing.id }, data });
    } else {
      await db.missionTemplate.create({ data });
    }
  }

  console.log(
    `Skills Trial seeded: versions 1+2, ${V2_TEMPLATES.length} V2 mission templates.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
