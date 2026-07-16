# Sales Pipeline: Stage Transitions

> The definitive answer to "how does a deal move through the funnel, and when does that happen automatically vs. by hand?" Written for the sales team (Aira, reps) and for anyone touching the pipeline code.

## How it actually works today (the one-paragraph answer)

A deal's Kanban column **is** `Deal.stage` — nothing is derived or computed. Automatic moves happen only at the **edges** of the funnel:

- a lead submits the `/discover` form → **new** (re-submitting from `nurture`/`no_show` re-opens them → back to **new**);
- the lead books a discovery call → **discovery_scheduled**;
- a rep saves call notes (or marks the call complete) → **discovery_completed**;
- a rep sends the client agreement → **proposal_sent** *(new — see fixed bugs below)*;
- the lead cancels the call → back to **new**;
- the agreement is signed **and** the first payment is received → **won** (auto-convert to a client).

Everything **in the middle** — `proposal_needed`, `negotiation`, `verbal_yes`, `nurture`, `lost` — moves **only** by a rep dragging the card or picking from the stage dropdown. That's on purpose: those steps are rep judgment, not something the system can infer.

A separate free-text field, `Deal.discoveryCallStatus` (the 📅 call chip: `scheduled` / `completed` / `no_show` / `cancelled`), tracks the call independently of the stage and used to be able to drift from it. The reconciliation fix below keeps the two in sync.

## Full transition table

| From stage | To stage | Trigger | Auto / Manual | Where in code |
|---|---|---|---|---|
| *(none)* | `new` | Lead submits the `/discover` form (brand-new lead) | **Automatic** | `src/lib/actions/discovery.ts:85` (`submitDiscoveryLead`) |
| `nurture`, `no_show` | `new` | A dropped lead re-submits the `/discover` form | **Automatic** | `src/lib/actions/discovery.ts:76` (`REENGAGE_STAGES` reset) |
| `new` | `discovery_scheduled` | Lead books a discovery call from their booking link | **Automatic** | `src/lib/actions/discovery-booking.ts:223` (`bookDiscoveryCall`) |
| `discovery_scheduled` | `discovery_completed` | Rep saves the call notes (saving implies the call happened) | **Automatic** | `src/lib/actions/discovery-notes.ts:45` (`saveDiscoveryNotes`) |
| `discovery_scheduled` | `discovery_completed` | Rep marks the call "completed" without notes | **Automatic** | `src/lib/actions/discovery-notes.ts:72` (`setCallStatus`) |
| `discovery_scheduled` | `no_show` | Rep marks the call a no-show | **Automatic** | `src/lib/actions/discovery-notes.ts:71` (`setCallStatus`) |
| `discovery_scheduled` | `new` | Lead cancels the booked call | **Automatic** | `src/lib/actions/discovery-booking.ts:325` (`cancelDiscoveryCall`) |
| `new`, `discovery_scheduled`, `discovery_completed`, `proposal_needed`, `nurture`, `no_show` | `proposal_sent` | Rep sends the client agreement | **Automatic** *(new)* | `src/lib/sales/agreement.ts:118` (`sendClientAgreement` → `setDealStage`) |
| *any pre-win* | `won` | Agreement signed **and** first payment received (auto-convert) | **Automatic** | `src/lib/sales/deal.ts:166` & `:200` (`convertDealToClient`, entered via `maybeConvertDeal` `deal.ts:264`) |
| *(none)* | `proposal_needed` | An upgrade deal is created from a Client Account | **Automatic** | `src/app/api/sales/console/route.ts:129` |
| *any* | `proposal_needed`, `negotiation`, `verbal_yes`, `nurture`, `lost`, … | Rep drags the Kanban card or picks a stage from the dropdown | **Manual** | `setDealStage` `src/lib/sales/deal.ts:94`, via `src/app/api/hr/sales/route.ts:37` |
| *any* | `won` | Rep manually picks "Won" in the dropdown | **Manual** | `setDealStage` `src/lib/sales/deal.ts:94` |

### Call-chip reconciliation (a side effect, not a stage move)

`setDealStage` also keeps the 📅 `discoveryCallStatus` chip honest (`src/lib/sales/deal.ts`, `reconcileCallStatusForStage`):

- moving to a stage past discovery (`proposal_needed`, `proposal_sent`, `negotiation`, `verbal_yes`, `won`) while the chip still says `scheduled` → chip becomes `completed`;
- moving back to `new` with a `scheduled` chip whose call time has already passed → chip is cleared.

## By design vs. fixed bugs

### By design (manual on purpose)

The middle of the funnel is deliberately manual. `proposal_needed`, `negotiation`, `verbal_yes`, `nurture`, and `lost` all require a rep to move the card, because only the rep knows whether a proposal still needs drafting, whether a negotiation is live, or whether a lead has gone cold. The system does **not** guess these.

### Fixed by this work

1. **`proposal_sent` is now automatic.** Sending the client agreement *is* the proposal going out, so the card now advances to `proposal_sent` automatically — a deal no longer sits in `discovery_completed` while its agreement is live. Guarded so a resend never drags a deal **backward** from `negotiation`/`verbal_yes`/`won` (`shouldAdvanceToProposalSent`, `src/lib/sales/agreement.ts`).
2. **Won-via-conversion now syncs to Notion** like the manual dropdown path always did. `convertDealToClient` previously used a direct `db.deal.update({stage:"won"})` that skipped the Notion mirror; it now calls `syncDealToNotion` (best-effort) after both the upgrade and the normal win (`src/lib/sales/deal.ts:166` & `:200`).
3. **The 📅 call chip no longer drifts from the stage.** No more "won deal with a `scheduled` chip" artifact — see call-chip reconciliation above (`src/lib/sales/deal.ts`).
4. **`setCallStatus` guards `scheduled`.** The backend used to let a call be re-marked `scheduled` on, say, a `proposal_sent` deal, resurrecting a stale chip. It's now only allowed at `new`/`discovery_scheduled`/`nurture`/`no_show` (`canMarkCallScheduled`, `src/lib/actions/discovery-notes.ts`). No UI did this, but the API shouldn't allow it.

## Dead fields (flagged, not built)

`Deal.reviewNeeded` and `Deal.reviewApproved` (the schema's intended "Team Lead special-deal gate") are referenced by **nothing** in `src/`. The gate was never implemented. Leaving the fields in place but unused for now — wire them up or drop them when the sales-SOP question ("do special deals need Team Lead sign-off before send?") is settled. Do not assume they do anything today.
