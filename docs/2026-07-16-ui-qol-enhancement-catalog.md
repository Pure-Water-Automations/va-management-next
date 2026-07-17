# UI + QOL Enhancement Catalog — VA Console (2026-07-16)

From a haiku fan-out (6 read-only agents, one per screen domain) grounded in the actual components, seeded by this session's end-to-end walkthroughs of the sales funnel and Skills Trial. ~70 raw ideas → deduped + ranked here. Effort S/M/L, priority H/M/L. Nothing built — this is the menu.

---

## Cross-cutting themes (appeared in 3+ screens — highest leverage)

These recur everywhere; building them once as shared patterns pays off across the app.

1. **Draft save + resume (localStorage)** — H · public `/discover` funnel, public `/apply` form, and the trial Mission Control all lose in-progress work on a closed tab. A shared "autosave to localStorage + 'resume your draft?' banner" pattern. Biggest single abandonment fix on the two public funnels. `DiscoverClient.tsx:25`, `ApplyClient.tsx:35`, `MissionDetail.tsx:59`.
2. **Search / filter / sort + bulk actions** — H · every list screen wants it: sales board (agreement-status quick-filter), follow-ups (search + bulk snooze/done), templates (full-text search), recruitment pipeline (sort by date/score, filter by timezone/skill, bulk stage move), trial queue (status/escalation filters). One reusable toolbar + multi-select pattern.
3. **At-a-glance status signals (badges/dots)** — H · stale-deal age badge, closing-progress dots on cards, client hours-nearing-ceiling amber chip, referral/FFWPU badges on candidate cards, thin-evidence ⚠️ on rubric rows, gate verdict badge. All "see it without opening the drawer."
4. **Mobile layout pass** — M · multi-select grid collapse (`/discover`), touch-target sizes + vertical button stacks (`/apply`), sticky timer while scrolling (trial). The public funnels are where prospects/applicants actually are — mobile conversion.
5. **Timezone clarity** — H · both the discovery booking picker and the trial timer trust the browser TZ silently; an explicit "your timezone" confirm prevents no-shows and confusion. `BookingPicker.tsx:67`.

---

## Quick wins (S effort · High priority — ship first)

| Screen | Enhancement | File:line |
|---|---|---|
| Sales board | Agreement-status quick-filter chips (Awaiting signature / payment / Won) | `SalesBoard.tsx:165` |
| Client accounts | Hours-nearing-ceiling amber chip on the row (≥80%) — upgrade signal without opening drawer | `ClientAccountsClient.tsx:177` |
| Follow-ups | Search-by-title box across all buckets | `FollowUpsClient.tsx:41` |
| Recruitment | Referral-source + FFWPU-affiliation badges on candidate cards (surface the new fields) | `recruitment/page.tsx:88` |
| Booking | Crisp slot time format ("1:30 PM", not "1:30:00 PM") | `BookingPicker.tsx:77` |
| Trial candidate | Timer "⏸ paused · time not counting" trust state | `MissionDetail.tsx:228` |
| Trial candidate | Active-time budget "2.3 / 10h used · 7.7 left" + bar | `MissionDetail.tsx:225` |
| Trial candidate | Deadline countdown badge ("Due tomorrow" not "Day 5") | `Home.tsx:72` |
| Trial recruiter | Partial-scoring pass-bar preview ("if you score the rest 3 → below bar") | `ReviewPanel.tsx:52` |

---

## By screen (ranked within each)

### Sales pipeline board + deal drawer
- **H** Agreement-status quick-filter chips (S) · `SalesBoard.tsx:165`
- **H** Stale-deal age badge ("⏱ 40d" when stuck 30d+; needs `updatedAt` or falls back to `discoveryCallAt`) (M) · `SalesBoard.tsx:312`
- **M** Closing-progress mini-dots on the card (●○○ sent → ●●● paid) (M) · `SalesBoard.tsx:339`
- **M** Bulk-select + batch stage move (Cmd-click cards, drag together) (M) · `SalesBoard.tsx:104,147`
- **M** Empty-column prompt ("No deals here") for new reps (S) · `SalesBoard.tsx:193`
- **M** "Change recipient" on agreement resend (S) · `AgreementPreviewModal.tsx:111`
- **M** Validate contact email *before* loading the agreement preview (skip wasted fetch) (S) · `AgreementPreviewModal.tsx:59`
- **L** "Deal won 🎉" celebration toast on convert (M) · `SalesBoard.tsx:108`
- **L** Duplicate-deal button (clone into New-lead form) (S) · `SalesBoard.tsx:579`

### Public /discover funnel + booking
- **H** Autosave answers + "resume draft" (M) · `DiscoverClient.tsx:25`
- **H** "Fully booked" → email waitlist + "we release slots daily" (M) · `BookingPicker.tsx:48`
- **H** Explicit timezone selector above slots (M) · `BookingPicker.tsx:67`
- **H** Post-booking reassurance/next-steps copy (join link 24h before, how to reschedule) (S) · `DiscoverClient.tsx:208`
- **H** Mobile multi-select grid (3/2/1 col responsive) (S) · `DiscoverClient.tsx:427`
- **M** Required-field error highlight + shake (not just text below) (M) · `DiscoverClient.tsx:54`
- **M** Back/edit an earlier answer without losing later ones (M) · `DiscoverClient.tsx:312`
- **M** Loading skeleton on slot fetch (M) · `BookingPicker.tsx:45`
- **S** Crisp slot time format (S) · `BookingPicker.tsx:77`

### Sales sub-screens (follow-ups / clients / templates)
- **H** Bulk snooze/done on follow-ups (M) · `FollowUpsClient.tsx:41`
- **H** Search follow-ups by title (S) · `FollowUpsClient.tsx:41`
- **H** Hours-ceiling alert chip on client rows (S) · `ClientAccountsClient.tsx:177`
- **H** Template variable auto-fill (`{{clientName}}` etc.) on copy from a client context (M) · `TemplatesClient.tsx:36`
- **H** "Send from template" tab in the client drawer — pick → auto-fill → one-click log (M) · `ClientAccountsClient.tsx:310`
- **M** Custom snooze (1/3/7/14d/date) instead of fixed 7 (S) · `FollowUpsClient.tsx:139`
- **M** Template full-text search (title/purpose/body) (M) · `TemplatesClient.tsx:25`
- **M** Check-in cadence auto-suggest by health (good 30d / watch 7d) (S) · `ClientAccountsClient.tsx:299`
- **M** Quick-log button on each client row (M) · `ClientAccountsClient.tsx:184`
- **M** Client-drawer deep-link with `?preset=checkin|note` (S) · `ClientAccountsClient.tsx:70`

### Skills Trial — candidate (Mission Control)
- **H** Timer-paused trust state (S) · `MissionDetail.tsx:228`
- **H** Active-time budget visible + bar (S) · `MissionDetail.tsx:225`
- **H** Deadline countdown badge (S) · `Home.tsx:72`
- **M** Post-submit auto-nav to next focus (S) · `MissionDetail.tsx:124`
- **M** Revision clarity: map each feedback line → the field to fix (M) · `MissionDetail.tsx:189`
- **M** Sticky timer on mobile while scrolling fields (S) · `MissionDetail.tsx:172`
- **M** Draft auto-save "Saved ✓" pill (M) · `MissionDetail.tsx:59`
- **M** Blocker-reported reassurance ("team's on it, ~1h") (S)
- **M** Preview locked upcoming missions (read-ahead) (M) · `Missions.tsx:20`
- **L** Milestone celebrations (50/75/100%) (S) · `Home.tsx` / `Progress.tsx:84`

### Skills Trial — recruiter review console
- **H** Queue ownership + staleness columns + "Pick this" claim (S) · `TrialQueue.tsx:60`
- **H** Evidence-count click-to-filter (rubric row → timeline + competency filtered to that dimension) (M) · `ReviewPanel.tsx:138`
- **H** Live evidence highlight on score hover/select (M) · `ReviewPanel.tsx:146`
- **H** Partial-scoring pass-bar preview (S) · `ReviewPanel.tsx:52`
- **M** Keyboard 1–5 scoring on focused rubric row (M) · `ReviewPanel.tsx:115`
- **M** Queue status/escalation filter buttons (M) · `TrialQueue.tsx:36`
- **M** Inline escalation quick-reply in the header (M) · `ConsoleHeader.tsx:79`
- **M** Thin-evidence ⚠️ warning on rows with ≤1 event (S) · `ReviewPanel.tsx:130`
- **M** Per-dimension "what evidence drove this?" note (M) · `ReviewPanel.tsx:118`
- **L** Decision-confidence slider (Clear/Borderline/Difficult) (S) · `ReviewPanel.tsx:215`

### Recruitment pipeline + /apply
- **H** Apply-form draft save/resume (S) · `ApplyClient.tsx:35`
- **H** Apply-form mobile pass (48px targets, padding, vertical buttons) (M) · `ApplyClient.tsx:282`
- **H** Referral + FFWPU badges on candidate cards (S) · `recruitment/page.tsx:88`
- **H** Pipeline sort + filter sticky header (date/score/name; timezone/skill) (M) · `recruitment/page.tsx:46`
- **H** Candidate bulk-select + move stage (L) · `recruitment/page.tsx:76`
- **M** Resume-link accessibility check on blur (public/not-public) (M) · `ApplyClient.tsx:212`
- **M** Duplicate-application detector (by email, with dates) (S) · `recruitment/page.tsx:30`
- **M** Gate quick verdict badge (High fit / Mixed / Concerns) (S) · `gate/page.tsx:104`
- **L** Resume-link type badge (Drive/Dropbox) in ApplicationDetails (S) · `ApplicationDetails.tsx:24`
- **L** "(optional)" tag on non-required apply questions (S) · `ApplyClient.tsx:122`

---

## Suggested first bundle ("faster day + higher conversion")

Ship the cross-cutting **draft save/resume** (public funnels first) + the **quick-wins table** above in one pass — they're all S-effort, high-daily-value, and touch distinct files (parallelizable). Then the search/filter/bulk theme as a second bundle. Everything is design-system-native (reuses existing `Chip`/`Drawer`/`ui.tsx` atoms); no new deps.

> Verification note: these are read-only agent proposals — file:line anchors were reported by the agents and should be re-confirmed against current code before implementing (a couple may have drifted).
