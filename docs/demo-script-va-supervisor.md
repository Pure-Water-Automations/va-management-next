# Pure Water VA Console — Demo Script (VA View + Supervisor View)

**URL:** https://team.pwasecondbrain.uk — log in with your Pure Water Google account
**Test run:** 2026-06-18 · **Go-live:** 2026-06-19 (after wipe)

## Presenter pre-flight
- **Everyone is already provisioned** — all 22 accounts are in Cloudflare Access and have a role, so each VA lands in their own view automatically.
- **Email test mode is ON** — assignment/notification emails redirect to whoever performs the action (not the real VA), so you can assign tasks live without anyone getting a premature "you've been assigned" email. In-app notifications still appear.
- **Beta features** (Enhance, Discover, Recordings) are hidden from everyone but you. Use the **Beta On/Off** toggle in the top bar to hide them entirely while screen-sharing.
- **To demo a VA's screen yourself:** top bar → **View as: VA**, then **as VA: \<name\>** to impersonate any VA.

---

## Part 1 — VA View (what every VA sees)
*Log in as a regular VA, or impersonate one (e.g. Suji or Akane). They land on **My Console**.*

1. **Overview** (`/va`) — their snapshot: tier, hours, what's on their plate.
2. **My Tasks** (`/va/tasks`) — the work assigned to them.
   - Open a task → instructions, links, attached SOPs/trainings, checklist, due date.
   - **Update status:** Not Started → In Progress → Done (now two words).
   - **Comment** on the task (`@` to mention a teammate).
   - **Tick checklist items** as they go.
3. **Available Tasks** (`/hr/tasks/available`) — the open pool of unassigned, non-urgent tasks.
   - Click **Claim this** on one → shows "waiting for a manager to approve your claim."
   - *Point: anyone can grab open work first-come-first-served; a manager confirms.*
4. **Monthly Check-in** (`/va/checkin`) — submit the monthly check-in / self-assessment.
5. **Tier Progress** (`/va/tier`) & **Evaluation** (`/va/evaluation`) — where they stand.
6. **🔔 Notifications** (top right) — assignment, approval, and mention alerts.
7. **Purii** (chat bubble) — e.g. "What tasks do I have due this week?"

**Talking point:** one place for a VA to see their work, pick up open tasks, update status, and check in — no more chasing across sheets and chats.

---

## Part 2 — Supervisor View (Senior VA / Team Lead)
*Log in as Zawadi (Senior VA) or Aira (Team Lead). They get everything a VA has, PLUS a **Delegation** section.*

1. **Delegate a task** — Delegation → **Delegate** (`/hr/tasks/new`):
   - Pick an assignee — **the list is sorted least-busy-first**, with each VA's current open-task count shown. *Point: assign to whoever has bandwidth.*
   - Set strategy, priority, due date, client, links, SOPs → **Assign**. (In test mode the email goes to you, the assigner.)
   - Or tick **"Open to anyone"** → posts it to the **Available pool** instead of assigning it.
2. **Approve a pool claim** — Delegation → Available: a claimed task shows the claimer → **Approve** (assigns it) or **Reject** (reopens it).
3. **Reassign** — open any task → **Reassign** → pick a different VA.
4. **Projects** — Delegation → **Projects** (`/hr/projects`):
   - Create a project, add tasks, watch the progress bar + activity feed.
   - **All Tasks** (`/hr/tasks`) — every task, filter by status / assignee / client.
5. **Workload** (`/hr/workload`) — open-task counts across the team at a glance.
6. **Purii** — "Create a task for Akane to design 5 graphics, due Friday" / "Reassign the QB task to Marc" / "What's my team working on?" — all confirm-gated.

**Talking point:** supervisors delegate, balance load, run projects, and approve pickups from the same console — or just by asking Purii.

---

## After the test (tomorrow, before go-live)
- **Wipe the demo/sample data** (the `[SAMPLE]` projects, test tasks, demo comments) for a clean start.
- **Flip email test mode off** so real assignment emails reach VAs.
- A one-shot wipe script can clear tasks/projects/comments created during testing while leaving the real roster + settings intact.
