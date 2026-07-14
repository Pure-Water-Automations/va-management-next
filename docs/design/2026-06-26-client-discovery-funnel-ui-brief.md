# Claude Design handoff — client discovery funnel UI

**Paste this whole doc into Claude Design.** It is self-contained: it describes
every screen, its content, states, and the exact brand system to match. You do
not need the codebase to design these — but the visual tokens below are the real
ones from the live app, so please honor them precisely.

---

## 1. What we're building (context)

Pure Water Automations (PWA, "Pure Water Assistants") places trained virtual
assistants with **pastors and ministry leaders** so they can reclaim time spent
on admin. We're building the front of the client-acquisition funnel: a person
discovers PWA on the marketing site, fills out a short form, books a free
discovery call, and the sales team works them through a pipeline to becoming a
client.

There are **two audiences**, and the UI splits accordingly:

- **Public / lead-facing** (a pastor, on their phone, who has never seen our
  software): the discovery form, the call booker, the confirmation, and a
  self-serve "manage my booking" page. Warm, calm, trustworthy, zero jargon.
- **Internal / sales reps** (PWA staff, on desktop): a pipeline console where
  they see scored leads, booked calls, and move deals forward.

Design **both sets of screens**. Mobile-first for the public ones; desktop-first
for the internal ones.

---

## 2. Brand & design system (match exactly)

This UI must look like it belongs in the existing PWA console.

**Colors**
- Primary brand (navy): `#132272`. Scale: 800 `#1a278a`, 700 `#22359e`,
  100 `#d5daf4`, 50 `#eef0fa`.
- Accent (sky): `#4DC4E8`. Scale: 500 `#2ab0d8`, 300 `#6dd5f0`, 100 `#c4eef9`,
  50 `#e7f8fd`.
- Neutrals: page bg `#f5f5f7`, surface/cards `#ffffff`, border `#d2d2d7`,
  subtle border `#e8e8ed`, text primary `#1d1d1f`, text secondary `#6e6e73`,
  text tertiary `#98989d`.
- Semantic: success `#30c97a` (light `#d4f5e2`), warning `#ffb340`
  (light `#fff3d4`), error `#f04c4c` (light `#fde8e8`), info `#4dc4e8`
  (light `#dff0fc`).
- The internal app shell uses a **navy gradient sidebar**:
  `linear-gradient(168deg, #1a278a 0%, #132272 62%, #0f1c5e 100%)` with white
  text. Public pages do NOT use the sidebar — they're standalone, centered,
  on the light `#f5f5f7` background.

**Typography**
- Display / headings: **Outfit** (300–900). Body: **DM Sans**. Data/mono:
  JetBrains Mono.
- Headings are confident but friendly; body is clean and readable.

**Shape & feel**
- Buttons: **pill** (`border-radius: 9999px`). Primary = navy fill, white text.
  Secondary = white fill, navy text, hairline border. Accent CTAs may use sky.
- Cards: `border-radius: 24px`, white, soft shadow, generous padding.
- Inputs: `border-radius: 12px`. Status chips/badges: pill. Category tags: 8px.
- Aesthetic: Apple-clean, lots of whitespace, flat (no heavy gradients except
  the sidebar), a light "water/flow" feeling. Optional subtle frosted-glass
  surfaces (`rgba(255,255,255,0.72)`) are on-brand. No clutter.

**Tone of copy** (public): outcome-focused, never "hours/assistants/labor."
Speak to reclaiming ministry time and removing admin overwhelm. Reassuring,
human, light.

---

## 3. PUBLIC screens (mobile-first)

### 3.1 Discovery form — `/discover`

The lead-capture form. Goal: low-friction, feels like a 2-minute conversation,
not an application. **Design as a multi-step wizard** (one question group per
step, progress indicator), with a single-scroll fallback layout also shown.

Steps / fields:
1. **About you** — full name; ministry / organization name; role (dropdown:
   Lead Pastor, Associate Pastor, Ministry Director, Administrator, Other);
   email; phone (optional).
2. **Where it hurts** — "What's eating most of your time right now?"
   (multi-select chips: Admin & email, Scheduling, Bookkeeping, Social media,
   Data entry, Event coordination, Member follow-up, Other). Free-text "tell us
   more" optional.
3. **Scale** — "Roughly how many hours a week disappear into admin?" (slider or
   banded choice: <5, 5–10, 10–20, 20+). "When do you want relief?" (ASAP,
   1–3 months, just exploring).
4. **Anything else** — optional free text; "How did you hear about us?"
   (dropdown).

States to design: default, focused field, validation error (inline, red
`#f04c4c`), step transition, final "Submitting…" loading, and **success**
(see 3.2 — success should flow directly into booking).

Header: small PWA wordmark + a one-line reassurance ("Free, no pressure — just a
conversation about getting your time back"). Footer: tiny privacy note.

### 3.2 Book your discovery call — slot picker (public)

Appears right after the form submits (same flow, no login). The lead picks a
time for a free discovery call.

- A friendly heading: "Pick a time that works — we'll bring the coffee ☕"
  (or similar; keep it warm).
- **Calendar/slot UI**: show available days, then open time slots for the
  selected day. Slots come from **multiple sales reps' real availability merged
  together** — the lead just sees open times, NOT which rep. Design the slot
  grid to look clean with 6–12 slots; include a timezone selector (auto-detected,
  editable).
- Each slot is a pill/button; selected state is navy-filled.
- Confirm button: "Confirm my call."
- States: loading availability (skeleton), **no slots available** (graceful:
  "We're fully booked this week — leave it with us and we'll reach out to
  schedule," with the lead already captured), slot-just-taken error
  ("That time was just grabbed — pick another"), confirming.

### 3.3 Booking confirmation (public)

After confirming:
- Big friendly check / success state. "You're booked!" with the date/time,
  timezone, and a note that a calendar invite + video link is on its way to
  their email.
- Secondary actions: "Add to calendar", "Reschedule / cancel" (links to 3.4).
- A short "what to expect on the call" reassurance (3 bullets max).

### 3.4 Manage booking — `/discovery/[token]` (public, magic link)

Reached from the email link. No login.
- Shows their booked call (date/time/timezone).
- Actions: **Reschedule** (re-opens the slot picker from 3.2) and **Cancel**
  (confirmation dialog).
- States: valid booking, already-cancelled, **expired/invalid link**
  (friendly message + a button to start over at `/discover`).

---

## 4. INTERNAL screens (desktop-first, inside the navy-sidebar app shell)

These live inside the existing console shell: collapsible navy gradient sidebar
on the left, light content area on the right. Add a **"Sales"** item to the
sidebar nav (icon + label). Design the content area.

### 4.1 Sales pipeline — `/sales`

The home of the sales rep's day. A **kanban pipeline** is the primary view.

- **Top bar / stats strip**: small stat cards — New leads, Discovery scheduled,
  Proposals out, Won this month, plus a search field and a "stage" / "my deals"
  filter. Optional toggle: Board view ↔ List view.
- **Kanban columns** by deal stage, in order: New → Discovery scheduled →
  Discovery completed → Proposal sent → Negotiation → Verbal yes → Won (and a
  collapsed/secondary area for Lost / Nurture / No-show). Each column has a
  count.
- **Deal card** (the key component — design it carefully):
  - Org name (bold) + contact name.
  - A **lead-score chip**: `Hot` (success green), `Warm` (warning amber),
    `Cold` (neutral gray) — pill, with the numeric score (0–100) beside it.
  - A one-line **AI summary** of the lead (truncated, e.g. "Mid-size church,
    drowning in scheduling, decision-maker, wants relief in 30 days").
  - If a discovery call is booked: a small calendar chip with the date/time and
    a status dot (scheduled / completed / no-show).
  - Account owner avatar (which rep).
  - Subtle hover + drag affordance (cards are draggable between columns).
- States: loading (skeleton cards), empty column, empty board ("No leads yet"),
  a freshly-arrived lead (subtle "new" highlight).

### 4.2 Deal detail (drawer or full page)

Opens when a rep clicks a card. Design as a **right-side drawer** over the board
(preferred) — also acceptable as a full page.

Sections:
- **Header**: org name, contact (name/email/phone), lead-score chip + score,
  stage selector (dropdown or stepper), account owner.
- **AI lead read**: the verdict, score, summary, and a list of **flags**
  (small pill tags, e.g. "budget unclear", "committee decision").
- **Discovery form answers**: the raw intake displayed cleanly (label/value
  pairs grouped by the form's sections).
- **Discovery call**: booked time + status; and a **call-notes capture form** —
  a structured set of fields the rep fills during/after the call: Current
  situation, Pain points, Desired finish line, Cost of inaction, Recommended
  package, Buying signals, Objections, Decision process, Next step, Follow-up
  date. Design this as a clean, scannable form (not a wall of textareas — use
  good grouping, maybe a 2-column layout on desktop).
- **Activity / timeline**: a simple vertical timeline of what's happened
  (submitted, scored, booked, notes saved, stage changes).
- **Actions** (buttons): Send proposal/agreement, Mark stage, Add note.

States: loading, saving notes ("Saved" toast), validation on follow-up date.

### 4.3 Rep availability settings (lower priority — design if time allows)

A simple settings panel where a sales rep sets their bookable windows (e.g.
"Tue/Thu 9–12 ET") and connects/sees their Google Calendar, plus a default
video-call link. Card-based, clean. This feeds the public slot picker (3.2).
Design the multi-rep idea: a list of reps, each with their windows; the public
picker merges them.

---

## 5. Component inventory (reusable — design these as a small kit)

- **Lead-score chip** — Hot / Warm / Cold pill + numeric score. Three color
  states (green / amber / gray).
- **Stage tag** — pill per pipeline stage, with a consistent color mapping.
- **Pipeline deal card** — as specified in 4.1.
- **Stat card** — small number + label for the stats strip.
- **Slot button** — time-slot pill (default / selected / disabled-taken).
- **Wizard progress indicator** — for the public form steps.
- **Empty / loading / error states** — a consistent, friendly pattern across
  all screens (illustrative but minimal, on-brand water motif optional).
- **Success state** — the "you're booked" celebratory but tasteful pattern.

---

## 6. What to deliver

- High-fidelity mockups for: `/discover` (wizard + a key step), the slot picker,
  the booking confirmation, the manage-booking page, the `/sales` kanban, and
  the deal-detail drawer (with the call-notes form). Availability settings if
  time allows.
- Both light public layout and the in-shell internal layout.
- The reusable component kit from section 5.
- Mobile views for all four public screens.

Keep it consistent with the tokens in section 2 — this drops into a live Next.js
app, so fidelity to the navy/sky system, Outfit/DM Sans, pill buttons, and 24px
cards matters more than inventing a new look.
