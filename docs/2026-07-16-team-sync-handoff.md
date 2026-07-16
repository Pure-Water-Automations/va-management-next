# Handoff — Jul 16 2026 team sync → code work

Source: weekly Justin/Eunmi/Aira sync (Zoom recording), summarized via `/video-to-summary`. Full summary in chat history this session. This doc = just the code-actionable items, for picking up in the main dev session.

## Context
Skills Trial (recruit.pwasecondbrain.uk) got live-demoed and **greenlit** as the 10-hour-training replacement. Discovery Funnel + Sales Console (discovery.pwasecondbrain.uk) got walked through live and got a feedback list. Bookkeeping AI system is a new project, not started.

## 1. Recruitment form — add 4 fields
Aira's feedback while reviewing applications:
- [ ] "Are you affiliated with Family Federation?" field (was hard to infer org affiliation from current form)
- [ ] "How did you hear about us / who referred you?" field
- [ ] Inline note reminding applicants their Google Drive portfolio link must be set to accessible (several submitted links weren't)
- [ ] Capture/display application submission date

## 2. Skills Trial — decision made, no code change needed yet
Greenlit to replace the 10-hour training for **new** applicants. In-flight 10-hour trainees keep finishing the old path — don't force-migrate them. (Ties to `SKILLS_TRIAL_V2` flag / branch per existing memory.)

## 3. Discovery Funnel + Sales Console feedback (discovery.pwasecondbrain.uk)
- [ ] Outbound emails currently send from Justin's personal address — rebrand sender (e.g. `admin@purewaterautomations...`) so new clients recognize it's PWA
- [ ] Swap Google Meet → Zoom for discovery-call scheduling links
- [ ] Lead-stage transition logic (New → Discovery scheduled → Discovery completed) is unclear even to Justin — audit/document how a lead actually advances between Kanban columns
- [ ] Negotiation calculator: sales-call tool where a VA enters client numbers and gets an AI-suggested ideal profit-margin midpoint (based on business margin data) — new feature, not started
- [ ] Intake form: add file/doc attachment support (client case: pastor attached his own scope-of-work doc)
- [ ] Intake form: add a scheduling/availability field
- [ ] General email polish pass on the transactional emails in the funnel
- [ ] Agreement → Stripe payment → auto-create-client is still manual past "confirm" — full automation not built

## 4. AI-Assisted Bookkeeping & Client Profitability — new project, Eunmi owns
Not started. Notion doc "AI-Assisted Bookkeeping & Client Profitability System" has the plan (ask Justin/Eunmi for the link if picking this up). Scope as discussed:
- Clean up duplicate/messy vendor, customer, account records in QuickBooks
- Clear rules for how every transaction gets labeled
- Rules for splitting VA time between client work and internal work
- AI-suggested labels with a required human review step
- Money screens/reports surfaced inside the VA Console
- Corrections sent back to QuickBooks only once the process has proven reliable
- **Explicitly out of v1 scope:** AI posting entries on its own, replacing QuickBooks as system of record, tax/legal judgment calls
- Aira wants: hours worked → client → project → payroll rate → income/expense unified in one view (currently she manually splits hours per client, e.g. Leigh vs Ayug under one client)
- Natural tie-in: Justin's in-progress internal time-tracking tool (DeskLog replacement) could auto-feed this instead of/alongside QuickBooks

## Not code — FYI only
- Referral incentive program (numbers TBD, Justin sending written proposal async) — no code yet, will need a referral-code + bonus-hours mechanism eventually if approved
- Justin unavailable next week (travel) — Philip may cover bug-fix/unblocking support, possibly via a short Claude Code prompting how-to video
