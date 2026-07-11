# PWA Skills Trial — Decision Log

This file tracks the status, rationale, and implementation impact of key product and architectural decisions for the PWA Skills Trial.

| ID | Decision | Status | Rationale | Source | Implementation Impact |
|---|---|---|---|---|---|
| **DEC-001** | Rename **10-Hour Training** to **PWA Skills Trial** in candidate-facing language. | **Approved** | Positioning as a professional work simulation, not a classroom course. | Master Plan | Update copy across candidate tracker views and email templates. |
| **DEC-002** | Postgres is the source of truth; Google Sheet is kept only as a read-only mirror. | **Approved** | Avoid write-lock conflicts, improve read latency, and modernize database operations. | AGENTS.md / Schema | Use `SyncRun` and sheet-mirror workers to dump Postgres state to sheets periodically. |
| **DEC-003** | Run across 5–7 calendar days, with a hard cap at 10 hours of active candidate effort. | **Approved** | Simulates a realistic first week of work without causing candidate burnout. | Master Plan | Single active timer on the step detail page; total minutes logged. |
| **DEC-004** | AI (Purii) coordinates and reviews completeness; humans make every final decision. | **Approved** | Prevents AI hallucination from causing unfair automated rejections. | Master Plan | Gate final reviewer decisions behind mandatory human signatures in the reviewer console. |
| **DEC-005** | Remove external Notion and Desklog tools from active curriculum operations. | **Approved** | Consolidates all execution inside the native VA Manager projects and tasks model. | AGENTS.md | Replace old notions in the seed data with native VA Manager walkthrough instructions. |
| **DEC-006** | Use `google/gemini-2.5-flash-lite` via OpenRouter as default pilot model. | **Proposed default** | High context window, cost-efficient, and fast structured output capability. | Tech PRD | Set `OPENROUTER_TRANSCRIPT_MODEL` default; allow environment overrides. |
| **DEC-007** | Qualitative candidate trust progression; quantitative rubric hidden from candidates. | **Proposed default** | Avoids gamified pressure (XP, coins). Candidate sees growing trust labels; reviewer sees 1-5 rubric. | UI Prototype | Candidate Sidebar shows Client Trust level (e.g. "Trusted Contributor"); Reviewer sees rubric scores. |
| **DEC-008** | Booking standups via external calendar links instead of native OAuth calendar sync. | **Proposed default** | Reduces authentication complexity. Admins set a global `standup_booking_url` in settings. | Tech PRD | Admin page contains scheduling link; candidate clicks to schedule. |

---

*Note: For decisions marked **Proposed default**, Justin's approval is assumed via plan confirmation unless overridden in subsequent check-ins.*
