# PWA Skills Trial — Phase 12: Analytics, Evidence & Calibration

This document details the event taxonomy, structured evaluation rubric, scoring suggestions, and long-term performance calibration standards.

---

## 1. Event Log Taxonomy
The system logs every significant action as an immutable event in the `TrialEvent` table:

| Event Type | Actor | Data Captured |
|---|---|---|
| `TRIAL_ACKNOWLEDGED` | Candidate | Declared days, timezone, usual work block. |
| `CHECKIN_REQUESTED` | System | Time check-in opened. |
| `CHECKIN_SUBMITTED` | Candidate | Text answers (Completed, Next, Blocked, ETA). |
| `CHECKIN_REMINDED` | AI | Number of reminders sent before response. |
| `STEP_STARTED` | Candidate | Step ID, server-side timestamp. |
| `STEP_TIMED_OUT` | System | Automatic timer pause after 6 hours. |
| `STEP_SUBMITTED` | Candidate | Step ID, attachment links, textbox values. |
| `REVISION_REQUESTED` | AI | Feedback JSON criteria, step ID. |
| `REVISION_SUBMITTED` | Candidate | Revision plan, updated text/links. |
| `STANDUP_CONFIRMED` | Candidate | Day 5 meeting time confirmed. |
| `STANDUP_RESCHEDULED` | Candidate | Responsible reschedule requested before standup. |
| `STANDUP_ATTENDED` | Candidate | Time joined standup window (on time vs late). |
| `HUMAN_ESCALATED` | Candidate | Text query, pauses AI tracking score indicators. |

---

## 2. Structured Rubric & Weights
Reviewer AI computes proposed scores (1 to 5), but the human reviewer inputs the final values. The rubric weights are:

```
                  ┌─────────────────────────────────────────┐
                  │          Total Score (100%)             │
                  └────────────────────┬────────────────────┘
                                       │
     ┌───────────────┬─────────────────┼───────────────┬───────────────┐
┌────┴────┐     ┌────┴────┐       ┌────┴────┐     ┌────┴────┐     ┌────┴────┐
│Reliabil │     │Communic │       │Accuracy │     │Ownership│     │SystemSc │
│  20%    │     │  20%    │       │  20%    │     │  15%    │     │  10%    │
└─────────┘     └─────────┘       └─────────┘     └─────────┘     └─────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                     ┌────┴────┐               ┌────┴────┐
                                     │Console  │               │Special  │
                                     │  10%    │               │   5%    │
                                     └─────────┘               └─────────┘
```

1. **Reliability & Commitments (20%):** Evaluates whether check-ins arrived inside declared windows without reminders, and whether meeting times were confirmed or responsibly rescheduled.
2. **Communication & Escalation (20%):** Evaluates clarifying questions (dates, links) and blocker reports before deadlines.
3. **Instructions & Accuracy (20%):** Evaluates whether submissions met acceptance criteria and addressed initial feedback conflicts.
4. **Ownership & Recovery (15%):** Evaluates resubmission execution and revision plan quality.
5. **VA Manager Console Discipline (10%):** Evaluates proper transition of task statuses (IP, Completed), timers, and comments.
6. **Systems Scout / SOP writing (10%):** Evaluates SOP clarity, bottleneck detection, and simplification proposals.
7. **Specialization Branch Signal (5%):** Evaluates candidate alignment with the selected technical track.

---

## 3. Decision Rules
* **Minimum Threshold:** Pass requires a total score of **75+ out of 100**, AND a score of **3 or higher** on the four core dimensions (Reliability, Communication, Accuracy, Ownership).
* **AI Proposal Mode:** The AI suggested score acts as a guide. Reviewers must click button scores (1-5) and write an evidence-based rationale before submitting.

---

## 4. Calibration & Long-Term Validation
To verify that trial evaluations correlate with success on the job:
* **30-Day Calibration:** Compare trial scores against the hired VA's 30-day supervisor evaluations (`Evaluation` table).
* **90-Day Retention:** Track whether hired VAs with high reliability scores in the trial remain active and client-trusted at 90 days.
