# PWA Skills Trial — Phase 3: AI System Architecture

## 1. Multi-Agent Persona Specifications
The AI layer consists of structured prompts representing different organizational roles, ensuring candidates experience a realistic work environment.

```
                  ┌──────────────────────┐
                  │    Human Reviewer    │ (Final Gate & Signature)
                  └──────────▲───────────┘
                             │ (Reviewer Assistant summary)
                  ┌──────────┴───────────┐
                  │     Observer AI      │ (Invisible; logs events)
                  └──────────▲───────────┘
                             │ (Monitors interactions)
   ┌───────────┬─────────────┼────────────┬─────────────┐
   │           │             │            │             │
┌──┴──┐     ┌──┴──┐       ┌──┴──┐      ┌──┴──┐       ┌──┴──┐
│Purii│     │Sarah│       │Emily│      │Micha│       │Agent│
│Coord│     │ PM  │       │ SrVA│      │Clnt │       │Gen  │
└─────┘     └─────┘       └─────┘      └─────┘       └─────┘
```

* **Purii (AI Coordinator):** Warm, structured, helpful. Guides candidate through onboarding, check-ins, and collects availability.
* **Sarah (AI Project Manager):** Professional, task-oriented. Reviews submissions, issues checklist revisions, and handles deadline alignment.
* **Emily (AI Senior VA):** Supportive mentor. Explains standard operating procedures and teaches without doing the work.
* **Michael (AI Client):** Busy and realistic. Simulates stakeholder responses, requests revisions, and changes dates.
* **Observer AI (Invisible):** Monitors interactions and flags objective events (e.g. prompt check-ins, tardiness, questions asked).
* **Reviewer Assistant:** Synthesizes the timeline and evidence graph into a neutral draft summary for human evaluators.

---

## 2. Behavioral Evidence Graph
Rather than assigning arbitrary scores, the system records discrete, contextual observations:

```
Communication
 ├── Clarified ambiguous requirement (Day 2 Sim)
 ├── Proactive blocker report (Day 3 Check-in)
 └── Professional standup handoff (Day 5 Meeting)

Reliability
 ├── Arrived on-time for standup (Day 5)
 ├── Updated ETA before deadline (Day 3)
 └── Unnotified delay (Day 4 Check-in) -> Flagged
```

Every node in this graph links to a timestamp, conversation thread, or artifact submission, providing complete traceability for human auditors.

---

## 3. Escalation and Intervention Rules
AI is strictly bounded and must escalate immediately to a human reviewer (Eunmi/Justin) in the following cases:
1. **Candidate requests human help:** Via the in-app "Ask a person" button or explicit messages.
2. **Special accommodations:** Medical, timezone restrictions, or technical platform errors.
3. **Repeated missed commitments:** Multi-day unresponsiveness.
4. **Integrity concerns:** Falsified artifact links, plagiarism, or inappropriate language.
5. **Conflict or disputes:** Candidate disputes AI feedback.
