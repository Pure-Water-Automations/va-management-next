# PWA Skills Trial — Appendix B: State Machines

This document contains Mermaid diagrams defining the transitions, triggers, and states of the Skills Trial.

---

## 1. Candidate Journey State Machine

```mermaid
stateDiagram-v2
    [*] --> Applied
    Applied --> Interviewed : Interview Scheduled & Saved
    Interviewed --> PreTrialReview : Recruiter Recommends Trial (invite_tenhr)
    
    state PreTrialReview {
        [*] --> AwaitingReview
        AwaitingReview --> Approved : preTrialGate(approve)
        AwaitingReview --> Declined : preTrialGate(decline)
    }
    
    Declined --> Waitlist : Moved to Waitlist
    Approved --> tenhr_in_progress : Token Generated & Invite Emailed
    
    state tenhr_in_progress {
        [*] --> Day0Onboarding : Magic link accessed
        Day0Onboarding --> ActiveSim : Acknowledge & Setup Availability
        ActiveSim --> CheckinWindowOpen : Triggered by system schedule
        CheckinWindowOpen --> ActiveSim : checkinSubmitted
        ActiveSim --> BlockerReported : candidateFilesBlocker
        BlockerReported --> ActiveSim : Human/AI resolved
        ActiveSim --> StepUnderRevision : feedbackIssued (Needs Revision)
        StepUnderRevision --> ActiveSim : stepResubmitted
        ActiveSim --> EvidenceReady : All 9 steps approved
    }
    
    EvidenceReady --> HumanGateReview : notifyPostTrialReviewPending
    
    state HumanGateReview {
        [*] --> ReviewPending
        ReviewPending --> Passed : gateReview(pass)
        ReviewPending --> RevisionRequested : gateReview(revision)
        ReviewPending --> Waitlisted : gateReview(waitlist)
        ReviewPending --> Rejected : gateReview(fail)
    }
    
    Passed --> ContractSent : markContractSent
    ContractSent --> ContractSigned : markContractSigned -> Provision VA
    ContractSigned --> Onboarding : upsertOnboarding
```

---

## 2. Mission/Step Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> NOT_STARTED
    NOT_STARTED --> IN_PROGRESS : startStep() [Timer starts]
    IN_PROGRESS --> SUBMITTED : submitStep() [Timer pauses, file/link attached]
    SUBMITTED --> APPROVED : approveStep() [Meets criteria, evidence logged]
    SUBMITTED --> NEEDS_REVISION : feedbackIssued() [Sarah PM correction]
    NEEDS_REVISION --> IN_PROGRESS : startStep() [Retry path]
    APPROVED --> [*]
```
