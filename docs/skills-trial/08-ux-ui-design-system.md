# PWA Skills Trial — Phase 8: UX/UI Design System & Claude Design Handoff

This document defines the interface standards, screen layouts, and component behavior for the PWA Skills Trial. It is designed to allow Claude Design or a frontend engineer to build the user interface directly without inventing core interaction flows.

---

## 1. Visual Direction & Style Guide
We adhere to a **Mission Control** visual system. The experience should feel like an active, premium workplace rather than an academic learning environment.

* **Design References:** Linear, Notion, Apple, and Arc Browser.
* **Layout Structure:**
  * **Sidebar Navigation:** Fixed 224px sidebar for the candidate. Includes branding, links to Home, Missions, Messages, Calendar, Progress, and Resources. Bottom displays initials avatar and current Responsibility Ladder standing (e.g. "Trusted Contributor").
  * **Header (HUD):** Sticky top bar containing day tracker chip (e.g. "Day 2 of 7"), total active time accumulator (e.g. "1.5h / 10h"), active timer control with pause button, and an "Ask a person" emergency escalation button.
  * **Calm Aesthetics:** Rounded card containers (18px), soft elevation box-shadows, subtle border colors (`--color-border-subtle`), and a color palette rooted in deep navy (`#0d1d5f`), sky blue, clean success green, and warm neutrals.
* **Anti-Gamification:** Avoid points, leveling coins, cartoon badges, or countdown progress rings. Express progress through qualitative **trust ladders** and evidence verification.

---

## 2. Screen Specifications (Candidate-Facing)

### Screen 1: Welcome and AI Disclosure
* **Purpose:** Introduce the work simulation and establish boundaries.
* **Primary Question:** *"What is this trial, and how will I be evaluated?"*
* **Layout:** Two-column split layout. Left side: Navy gradient block explaining the trial guidelines, a waving Purii character sprite, and clear AI disclosures. Right side: Timezone and availability onboarding forms.
* **Microcopy:** *"This is a work simulation, not an exam: 5–7 days, capped at 10 active hours... Every hiring decision is made by a human."*
* **Visual Prompt:** `"A split onboarding screen with a deep navy gradient column on the left showing an AI mascot character next to a friendly welcome text, and a minimalist white input form column on the right for entering name, timezone, and calendar days, styled like Notion."`

### Screen 2: Availability and Work-Window Setup
* **Purpose:** Gather candidate timezone and declared work blocks.
* **Layout:** Segmented pill selectors (`.skc`) for calendar days (Mon-Sun) and work blocks (Morning, Afternoon, Evening).
* **Key Interactions:** Toggling active days adds them to a list. Acknowledging three checkboxes (Terms, AI disclosure, confidentiality) enables the "Acknowledge & Begin" button.
* **Data Requirements:** `daysActive: String[]`, `blockActive: String`, `timezone: String`.

### Screen 3: Mission Control Home
* **Purpose:** Unified daily hub showing immediate responsibilities.
* **Layout:** Left column: Active Focus Card and Recent Messages feed. Right column: Upcoming Calendar events, Quick Actions drawer, and Purii's status speech box.
* **Key Components:**
  * **Focus Card:** Highlighted active step with status chip, client name, estimated effort, and primary CTA button.
  * **Standup Chip:** Dynamic indicator of standup status (Needs Confirmation -> Confirmed -> Attended).
  * **Purii Speech Bubble:** Contextual coach messages depending on trial progress (e.g., reminding about check-in).

### Screen 4: Project Overview (Missions List)
* **Purpose:** Chronological view of all required missions.
* **Layout:** 3-column card grid. Each card displays: Kind Label (e.g., ORIENTATION), Status badge, Title, Client, Effort, Due Day, and a short story snippet.
* **Interactions:** Clicking a card opens the Step Detail view.

### Screen 5: Mission Detail View
* **Purpose:** Working screen for individual steps.
* **Layout:** Top: Breadcrumb navigation, title, effort metadata, and status badge. Left side: Scenario body, contextual brief, and submission inputs. Right side: active step timer and step instructions.

### Screen 6: Messages & Check-In Panel
* **Purpose:** Conversational feed showing threads with Purii (AI), Emily (AI), and direct human messages.
* **Layout:** Slack-style vertical thread.
* **Check-In Form:** Four simple questions (Completed, Next, Blocked, ETA changes) displayed when a check-in window opens.

### Screen 7: Calendar Weekly View
* **Purpose:** Weekly timeline mapping daily expectations.
* **Layout:** 7-column calendar grid showing scheduled check-in windows, live standups, and deadline grace periods.

### Screen 8: Resources (SOP Reference Drawer)
* **Purpose:** SOP manuals and voice guides reachable in a click.
* **Layout:** Clean cards summarizing reliability policies, voice guidelines, and confidentiality standards.

### Screen 9: Submission and Evidence Upload
* **Purpose:** Native input fields appropriate to step context (Sim uses textarea boxes for client messages and drafts; Branch uses link inputs and a walkthrough explanation textarea).

### Screen 10: Revision Request & Feedback Card
* **Purpose:** Present Sarah's/Purii's feedback when a step is marked "Needs Revision".
* **Layout:** Warm yellow card highlighting: Observation, Impact, Suggestion, and Encouragement. Includes a required "Revision plan and ETA" input field before resubmission.

### Screen 11: Progress & Trust Growth Dashboard
* **Purpose:** Visualize growth and candidate standing.
* **Layout:** Left card: Trust progress bars across 5 dimensions (Client Trust, Communication, Ownership, Reliability, Initiative). Right card: Responsibility Ladder steps.

### Screen 12: Final Walkthrough & Reflection
* **Purpose:** Complete the reflection step.
* **Layout:** Grid showing questions about key choices made, what to improve with more time, and what was learned.

### Screen 13: Trial Completion / Awaiting Review State
* **Purpose:** Reassurance screen showing completed work package.
* **Layout:** Home focus card replaced by a large green banner indicating the evidence package has been compiled and is awaiting human reviewer signature.

### Screen 14: Blocker & Escalation Modals
* **Purpose:** Modals for reporting blockers or sending messages directly to human team leads.

---

## 3. Screen Specifications (Reviewer-Facing)

### Screen 1: Gate-Review Queue
* **Purpose:** Reviewers browse active candidate submissions.
* **Layout:** Left sidebar list of candidates with initials avatar, active day, approved counts, and dynamic trust standing labels.

### Screen 2: Candidate Evidence Summary
* **Purpose:** Candidate evaluation dashboard.
* **Layout:** Top bar: Candidate name, timeline status, and active flags (e.g. Blocker reported, 2 reminders sent).

### Screen 3: Project Replay Timeline
* **Purpose:** Chronological log of all events.
* **Layout:** Scrolling log of candidate starts, saves, submissions, check-ins, reminders, and reschedules with actor badges (Candidate, AI, System, Human).

### Screen 4: Competency Evidence Explorer
* **Purpose:** Clickable panel mapping events directly to competencies.

### Screen 5: Artifact Comparison View
* **Purpose:** Side-by-side comparison of initial submission vs revised submission, highlighting changes made after feedback.

### Screen 6: Structured Rubric Panel
* **Purpose:** Reviewers grade the candidate.
* **Layout:** 7-column dimension grid showing weight, evidence text, AI-suggested score (badge), and clickable buttons to input the final human score (1-5).

### Screen 7: Final Decision Panel
* **Purpose:** Human registers final verdict.
* **Layout:** Rationale textarea input (required) and action buttons: Pass, Revision, Waitlist, Close. Error list displays if criteria are unmet.
