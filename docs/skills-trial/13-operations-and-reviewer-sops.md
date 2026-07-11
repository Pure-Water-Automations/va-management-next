# PWA Skills Trial — Phase 13: Operations & Reviewer SOPs

This document outlines standard operating procedures (SOPs) for the PWA recruitment team to manage the Skills Trial.

---

## 1. Candidate Intake & Invitation Flow

### Step 1: Pre-Trial Review
* Eunmi / Recruiter reviews application screening scores and interview results.
* Gated by the pre-trial gate in `GET /recruitment/gate`. Eunmi clicks "Approve for Skills Trial".
* **System Action:** Generates `trainingAccessToken` and updates candidate stage to `tenhr_in_progress`. Sends automated invitation email via Workspace Gmail.

### Step 2: Specialization Track Selection
* Recruiter selects the primary branch based on applicant background (Communications, Coordination, or Research) in the candidate profile page.

### Step 3: Accommodation Handling
* If a candidate requests accommodation (sickness, tech issues), the reviewer clicks "Mark Active Accommodations" on the candidate gate review.
* **System Action:** Pauses automated check-in reminder triggers. Excludes related latency events from reliability scoring suggestions.

---

## 2. Evidence Assessment Guidelines

### Reviewing Sim Revisions
* Do not just grade the final submission.
* Open the **Artifact Comparison View** to see what the candidate submitted *initially* versus their *revised* draft after Purii's feedback.
* **Verify:** Did they address the specific feedback? Was their revision plan clear? Did they write a respectful revision note?

### Inspecting Timelines & Logs
* Review the event log for "unnotified delay" flags.
* Check if blocker reports were submitted *before* deadlines or check-in windows.
* Check if magic link files (SOP Google docs) are accessible or if they submitted placeholders (critical concern).

---

## 3. Registering the Final Verdict
When a candidate finishes all 9 missions and check-ins:
1. Reviewer opens `GET /recruitment/gate`.
2. Inspects compiled evidence packet and AI-suggested rubric scores.
3. Reviewer clicks and sets their final scores (1-5) on the 7 dimensions.
4. **Mandatory Action:** Reviewer writes a brief, evidence-based rationale summarizing candidate strengths, developmental needs, and suggested specialization track.
5. Selects final decision button:
   * **Pass:** Moves candidate stage to `tenhr_pass`. Enables the "Send Contract" button.
   * **Needs Revision:** Returns a custom feedback request. Candidate remains in `tenhr_in_progress`.
   * **Waitlist:** Moves stage to `decision`, setting decision to `waitlist`.
   * **Decline (Close):** Moves stage to `closed`, setting decision to `reject`.
