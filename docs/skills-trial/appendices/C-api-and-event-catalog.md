# PWA Skills Trial — Appendix C: API & Event Catalog

This document defines the HTTP API endpoints and JSON payloads for candidate operations and reviewer actions.

---

## 1. Candidate API Endpoints

### 1. Onboarding Acknowledgment
* **Endpoint:** `POST /api/trials/acknowledge`
* **Headers:** `Authorization: Bearer <magic-link-token>`
* **Request Payload:**
  ```json
  {
    "name": "Maria Santos",
    "timezone": "GMT+8 — Manila",
    "declaredDays": ["Mon", "Tue", "Wed", "Thu"],
    "declaredBlock": "Morning"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "ok": true,
    "currentStage": "tenhr_in_progress",
    "nextStepId": "mission"
  }
  ```

### 2. Start Timer for Step
* **Endpoint:** `POST /api/trials/step/start`
* **Headers:** `Authorization: Bearer <magic-link-token>`
* **Request Payload:**
  ```json
  {
    "stepId": "sim"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "ok": true,
    "status": "IN_PROGRESS",
    "startedAt": "2026-07-11T12:00:00.000Z"
  }
  ```

### 3. Submit Step Deliverable
* **Endpoint:** `POST /api/trials/step/submit`
* **Headers:** `Authorization: Bearer <magic-link-token>`
* **Request Payload:**
  ```json
  {
    "stepId": "sim",
    "submittedText1": "Hi! Could you please confirm if the event date is August 12 or August 21? Also, please share the registration link.",
    "submittedText2": "Join us for Community Impact Day on Saturday, August 12 [DATE TBC] at the Grace Community Center...",
    "submittedLink": "https://docs.google.com/document/d/1_abc123/edit",
    "checklistChecks": [true, true, true, true]
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "ok": true,
    "status": "SUBMITTED",
    "evaluationProposed": {
      "needsRevision": true,
      "feedback": {
        "obs": "Draft states August 12 but date conflict is unflagged.",
        "impact": "Could cause scheduling confusion.",
        "sugg": "Make date conflict clear in draft.",
        "enc": "You write very well; adjust this date detail and resubmit."
      }
    }
  }
  ```

### 4. Send Check-In Reply
* **Endpoint:** `POST /api/trials/message/reply`
* **Request Payload:**
  ```json
  {
    "type": "checkin",
    "answers": {
      "a": "Completed Sandbox task.",
      "b": "Starting Client Sim.",
      "c": "None.",
      "d": "No changes, on track."
    }
  }
  ```

### 5. Report Blocker or Escalate to Human
* **Endpoint:** `POST /api/trials/escalate`
* **Request Payload:**
  ```json
  {
    "type": "blocker", // blocker | human_help
    "messageText": "Fictional client folder doesn't have the calendar template file."
  }
  ```

---

## 2. Reviewer API Endpoints

### 1. Submit Gate Decision
* **Endpoint:** `POST /api/trials/review`
* **Headers:** Cookie Session (NextAuth admin/recruiter permission required)
* **Request Payload:**
  ```json
  {
    "candidateId": "cuid_123",
    "decision": "pass", // pass | revision | waitlist | close
    "rationale": "Maria followed all accuracy policies, handled feedback with excellent revisions, and reported blockers early.",
    "rubricScores": {
      "rel": 5,
      "comm": 4,
      "acc": 4,
      "own": 5,
      "sys": 4,
      "scout": 4,
      "spec": 4
    }
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "ok": true,
    "newStage": "tenhr_pass"
  }
  ```
