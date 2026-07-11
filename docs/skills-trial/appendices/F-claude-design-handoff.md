# PWA Skills Trial — Appendix F: Claude Design Prompt Handoff

This document contains copy-ready prompt blocks for Claude Design to generate UI mockups and styles matching the PWA Skills Trial.

---

## Prompt 1: Candidate Mission Control Onboarding View
```text
Design a warm, minimalist candidate onboarding screen for the PWA Skills Trial. 
Visual Theme: Apple-like restraint, Linear-style dark/light balance, clean whitespace.

Layout Structure:
- Left Column (430px wide, deep navy gradient background):
  - Brand Logo (Pure Water Automations logo).
  - Title: "Your first week at Pure Water starts here."
  - Masked mascot character sprite named Purii waving.
  - Plain language explanation: 5-7 days, capped at 10 active hours, on real-world simulated tools.
- Right Column (Flexible width, warm off-white background):
  - Minimally styled inputs for Name and Timezone.
  - Horizontal chip toggles for Days Available (Mon-Sun).
  - Chip toggles for Daily Work blocks (Morning, Afternoon, Evening).
  - Rounded card panel containing three acknowledgment check items with clean SVG check toggles.
  - Large button: "Acknowledge & Begin" (disabled state shows a hint about missing choices).

Typography & Tokens:
- Fonts: Sans-serif (Outfit or Inter).
- Colors: Deep navy background (#0d1d5f), sky blue highlights, success green highlights.
```

---

## Prompt 2: Candidate Mission Control Workspace (HUD & Sidebar)
```text
Design the default Candidate Workspace dashboard view for the PWA Skills Trial candidate console.

Layout Components:
1. Left Sidebar (224px wide, clean white background):
   - Pure Water logo header: "Pure Water · Trial".
   - Vertical navigation menu items with clean stroke SVGs: Home, Missions, Messages, Calendar, Progress, Resources.
   - Bottom Profile Card: Displays candidate initials avatar (e.g. "MS"), candidate's name, and current Trust Ladder standing (e.g. "Trusted Contributor") in a sky-blue accent container.
2. Main Content Area (Flexible width, warm neutral background):
   - Top Header (HUD Bar, sticky):
     - Displays "Day 2 of 7" status chip.
     - Displays total active time: "1.5h / 10h" with clock icon.
     - Displays active timer widget: "⏸ 02:40" with pause control.
     - Displays "Ask a person" emergency button.
   - Grid Area:
     - Left Main: Focus Card ("Community Impact Day", Client: Grace Community Center, status badge, estimated time, client request text, and "Continue" button) plus recent message list.
     - Right Sidebar: Calendar widget, Quick Actions button list ("Report a blocker", "Check in now"), and a mascot speech bubble widget representing Purii AI.
```

---

## Prompt 3: Reviewer Evaluation Console
```text
Design a professional Reviewer Evaluation console for PWA recruiters to grade candidates.

Layout Components:
1. Left Column (300px sidebar, white background):
   - Sidebar header: "In the Skills Trial"
   - Candidate List Cards (active list showing name, progress badges, and active minutes): Maria Santos (Active, Day 2), Josh Alvarez (Pending), Grace Obi (Evidence Ready).
2. Central Dashboard (Flexible width):
   - Header: Candidate name ("Maria Santos"), active day, approved steps tally, and alert flags (e.g., "Human escalation used", "2 check-in reminders sent").
   - Left Main Cards:
     - AI Summary: Pattern notes compiled by the system (e.g. "Revision pattern: responded to feedback without defensiveness").
     - Artifact Comparison: Side-by-side textbox panels displaying initial client draft next to resubmitted draft, with changes highlighted.
     - Chronological timeline log.
   - Right Main Cards:
     - Structured Rubric: Dimensions grid displaying weight, evidence tags, AI suggested score badge, and clickable 1-5 button selectors.
     - Final Decision: Rationale textarea and buttons: Pass (Primary), Revision, Waitlist, Close.
```
