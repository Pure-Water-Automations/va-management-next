# Notion Page-Edit Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `page-edit-request` classification to the `claude:` mention pipeline so a whitelisted set of safe, additive Notion edits ("add this link," "add a row," "check this box") can be applied live to any page — not just PW OS — when Justin himself asks, with everything else (wrong author, non-whitelisted edit, or an excluded page) falling back to the existing draft-for-review flow.

**Architecture:** Pure instruction-layer change — no code in `scan_mentions.cjs` needs to change, since it already scans all recently-edited pages workspace-wide. The new logic (exclusion list, safe-edit whitelist, author check) is added as a new step in the two consumer skill files: `daily-notion-mention-fixes/SKILL.md` (the automated 30-min routine) and `notion-claude-mentions/SKILL.md` (the on-demand skill Justin runs himself).

**Tech Stack:** Markdown skill instructions (no new code); Notion MCP tools (`notion_append_block_children`, `notion_update_page_properties`) for the actual live edits; existing `scan_mentions.cjs` / `--reply` mechanism, unchanged.

---

### Task 1: Add the `page-edit-request` classification row and Step 2f to `daily-notion-mention-fixes/SKILL.md`

**Files:**
- Modify: `/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md`

- [ ] **Step 1: Add the new classification table row**

In the classification table (currently lines 20–29), add a new row right after the `create-testing-page` row (the last of the four PW-OS-only rows) and before the closing paragraph. The table should read:

```markdown
| Classification | Trigger text | Action |
|---|---|---|
| `bug` | describes broken behavior, an error, something not working | Bug fix diff (Step 3) |
| `question` | asks how something works or should behave | Draft reply (Step 4) |
| `feedback` | suggests an improvement or notes confusion | Draft reply (Step 4) |
| `unclear` | intent can't be determined | Draft reply (Step 4) |
| `testing-review-request` | "take a look at my testing results", "check my test results", "look at the testing page", "review what I tested" — any phrase meaning "look at my testing and fix what's broken" | **PW OS pages only** — run full `check-pwaos-tests` fix→verify→deploy flow (see Step 2b) |
| `tutorial-video-request` | "ready for a tutorial video", "make a tutorial video", "tutorial video for this one", "create a tutorial for this" | **PW OS pages only** — run Tutorial Phase 1: write Notion script page (see Step 2c) |
| `tutorial-video-approval` | "run tutorial", "approved, run", "run the video" AND component page has a `🎬 Tutorial — ` child page | **PW OS pages only** — run Tutorial Phase 2: render + upload (see Step 2d) |
| `create-testing-page` | "create a testing page", "make a testing page", "set up testing", "add a testing page" | **PW OS pages only** → create `🧪 Testing —` Notion page (see Step 2e) |
| `page-edit-request` | names one concrete, small edit to make to the page — "add the link to X", "add a row for Y", "check off this box", "tag this with Z" | **Any page** (except the exclusion list) — apply live if from Justin and on the safe-edit whitelist, otherwise draft (see Step 2f) |
```

- [ ] **Step 2: Add the explanatory paragraph for the new classification**

Immediately after the existing paragraph that begins "The four PW OS-only classifications..." (currently line 31), add:

```markdown
`page-edit-request` is the one classification that isn't PW-OS-gated — it applies to any page in the workspace. See Step 2f for the exclusion list, the safe-edit whitelist, and the author check that determines whether it executes live or drafts instead.
```

- [ ] **Step 3: Add Step 2f**

Immediately after the existing Step 2e section (which ends at "No code deployment occurs in this flow." right before "## Step 3 — Bug mentions..."), insert a new section:

```markdown
### Step 2f — page-edit-request (any page)

1. **Check the exclusion list.** If the page (or its parent database) matches any of the following, skip to step 4 and treat it as draft-only, regardless of who commented:
   - Any database or page under "Northeast Scoreboard," or otherwise tracking member finance/blessing-point data
   - "PWA-HR DOCS" or other personnel/HR pages
   - Any Notion mirror of QuickBooks/financial data
   - Any page whose title or parent database name contains "payroll," "salary," "compensation," or "agreement"
2. **Match the request against the safe-edit whitelist.** Only these count as safe:
   - Add a link/URL (inline text, a bookmark block, or a URL-type property)
   - Add a bullet or to-do item to an existing list
   - Add a row to an existing table or database (infer property values from the comment/page context)
   - Check/tick an existing checkbox, or set a value on an existing single/multi-select property
   - Append a note (the reply itself already does this)

   Anything else — deleting/replacing content, rewriting a section, changing a database schema, moving/deleting pages, or editing any property whose name matches `/points|score|balance|amount|\$|payment/i` — is **not on the whitelist**, regardless of how it's phrased.
3. **Check the author.** Compare the mention's `authorId` to `JUSTIN_NOTION_USER_ID` (`18cd872b-594c-8133-bc0b-0002af1e69cd`).
4. **Decide:**
   - Exclusion list matched, OR request not on the whitelist, OR author isn't Justin → **draft-only**. Draft the proposed edit description + reply text exactly like Step 4, and note in the reply that a draft is staged for Justin's review.
   - None of the above (not excluded, on the whitelist, and from Justin) → **execute live**: apply the edit using `mcp__notion__notion_append_block_children` (for content — links, bullets, to-dos) or `mcp__notion__notion_update_page_properties` (for property/database-row edits), then post a reply describing exactly what was added, with the commenter's authorId as an @mention so Justin gets the Notion notification on the thread.
5. **Log the outcome** (live edit or draft) in the daily packet (Step 5) either way, so there's an audit trail even for edits that executed without prior review.
```

- [ ] **Step 4: Verify the file reads correctly**

Run: `grep -n "page-edit-request" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md`
Expected: 3 matches — the table row, the explanatory paragraph, and the Step 2f heading.

- [ ] **Step 5: Commit**

```bash
cd /Users/justinokamoto/SecondBrain
git add agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
git commit -m "feat(notion-mentions): add page-edit-request classification + Step 2f"
```

(If `/Users/justinokamoto/SecondBrain` is not a git repo, skip the commit — SecondBrain may be managed outside git. Check with `git -C /Users/justinokamoto/SecondBrain status` first; if it errors with "not a git repository," skip this step and move on.)

---

### Task 2: Update the Constraints and Reference sections of `daily-notion-mention-fixes/SKILL.md`

**Files:**
- Modify: `/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md`

- [ ] **Step 1: Update the hard-constraint bullet**

Replace the existing third bullet under `## Constraints (non-negotiable)`:

Old:
```markdown
- **Hard constraint:** Do NOT commit, push, or deploy anything — **except** `testing-review-request` mentions on PW OS component pages, which are the ONE explicit exception: run the full `check-pwaos-tests` fix→verify→deploy flow (deploy to IONOS dev only, never Hostinger). The `create-testing-page` flow also executes live (creates a Notion page + posts a reply) but involves no code deployment. All other mention types remain review-only.
```

New:
```markdown
- **Hard constraint:** Do NOT commit, push, or deploy anything — **except** `testing-review-request` mentions on PW OS component pages, which are the ONE explicit exception: run the full `check-pwaos-tests` fix→verify→deploy flow (deploy to IONOS dev only, never Hostinger). The `create-testing-page` flow also executes live (creates a Notion page + posts a reply) but involves no code deployment. `page-edit-request` (Step 2f) also executes live, but ONLY for whitelisted, additive edits (links, bullets, table/database rows, checkboxes, select values) from Justin's own Notion account, on a page not on the exclusion list — everything else in that flow drafts instead of applying. All other mention types remain review-only.
- `page-edit-request` never executes live for deletions, rewrites, schema changes, page moves, or any property matching a points/score/balance/amount/payment pattern — those always draft, even from Justin, even off the exclusion list.
```

- [ ] **Step 2: Update the Reference section**

Replace the existing Reference line:

Old:
```markdown
`JUSTIN_NOTION_USER_ID` = `18cd872b-594c-8133-bc0b-0002af1e69cd` (Justin's Notion user ID — used for @mentions in all claude: reply flows)
```

New:
```markdown
`JUSTIN_NOTION_USER_ID` = `18cd872b-594c-8133-bc0b-0002af1e69cd` (Justin's Notion user ID — used for @mentions in all claude: reply flows, and as the live-edit author check in Step 2f)
```

- [ ] **Step 3: Verify**

Run these two checks separately (a combined pattern is harder to eyeball correctly):

```bash
grep -c "page-edit-request" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
grep -c "JUSTIN_NOTION_USER_ID" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
```
Expected: `5` for the first (table row, explanatory paragraph, Step 2f heading, and the two constraint bullets from this task) and `2` for the second (the Step 2f author-check line, and the Reference line).

- [ ] **Step 4: Commit**

```bash
cd /Users/justinokamoto/SecondBrain
git add agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
git commit -m "docs(notion-mentions): document page-edit-request in constraints + reference"
```

(Skip if not a git repo, per Task 1 Step 5's note.)

---

### Task 3: Add page-edit-request parity to `notion-claude-mentions/SKILL.md`

**Files:**
- Modify: `/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md`

- [ ] **Step 1: Add the new classification bullet**

In `**2b. Classify the mention**`, add a new bullet before "Unclear":

Old:
```markdown
**2b. Classify the mention**

- **Answerable question** — "does X work like Y?", "what should I enter here?"
- **Bug/issue report** — "X is broken", "the button doesn't respond"
- **Feedback/polish** — "this label is confusing", "could this be clearer?"
- **Unclear** — intent cannot be determined without more information
```

New:
```markdown
**2b. Classify the mention**

- **Answerable question** — "does X work like Y?", "what should I enter here?"
- **Bug/issue report** — "X is broken", "the button doesn't respond"
- **Feedback/polish** — "this label is confusing", "could this be clearer?"
- **Page-edit request** — names one concrete, small edit to make ("add the link to X", "add a row for Y", "check this box")
- **Unclear** — intent cannot be determined without more information
```

- [ ] **Step 2: Add a row to the reply-approach table**

In the table under `**2c. Draft a reply**`, add a new row before "Unclear":

Old:
```markdown
| Classification | Reply approach |
|---|---|
| Answerable question | Answer it directly |
| Bug report | Acknowledge + note it's been logged for the next fix cycle |
| Feedback/polish | Acknowledge + note it's been recorded |
| Unclear | Ask the one clarifying question needed to proceed |
```

New:
```markdown
| Classification | Reply approach |
|---|---|
| Answerable question | Answer it directly |
| Bug report | Acknowledge + note it's been logged for the next fix cycle |
| Feedback/polish | Acknowledge + note it's been recorded |
| Page-edit request | Check against the safe-edit whitelist and exclusion list below, then apply directly or ask first |
| Unclear | Ask the one clarifying question needed to proceed |
```

- [ ] **Step 3: Add the whitelist/exclusion-list sub-section**

Immediately after that table (and before "Sign all replies: `— Claude (YYYY-MM-DD)`"), add:

```markdown
**Page-edit requests — safe-edit whitelist**

Only these count as safe to apply directly: add a link/URL, add a bullet or to-do item, add a row to an existing table/database, check a box or set a select value, append a note. Anything else — deletions, rewrites, schema changes, moving/deleting pages, or editing a property matching `/points|score|balance|amount|\$|payment/i` — is NOT on the whitelist.

Exclusion list (never apply directly here, even if whitelisted): Northeast Scoreboard / member finance-or-points pages, PWA-HR DOCS, QuickBooks Notion mirrors, anything titled or parented with "payroll," "salary," "compensation," or "agreement."

On the whitelist and not excluded → apply the edit via `mcp__notion__notion_append_block_children` (content) or `mcp__notion__notion_update_page_properties` (properties/rows), then reply describing what changed. Off the whitelist, or on an excluded page → don't apply it; ask Justin for the go-ahead first, exactly like an Unclear mention. (You're running this interactively, so you're already the human-in-the-loop check that the automated `daily-notion-mention-fixes` routine gets by matching `authorId` — no separate author check is needed here.)
```

- [ ] **Step 4: Update the composability note**

At the bottom of the file, find:

```markdown
`check-pwaos-tests` calls this scanner with `--scope pwaos --json` in Step 0c.
Mentions are classified into seven routes: `bug`, `question`, `testing-review-request`,
`tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`, or `unclear`.
```

Replace with:

```markdown
`check-pwaos-tests` calls this scanner with `--scope pwaos --json` in Step 0c.
Mentions are classified into eight routes: `bug`, `question`, `testing-review-request`,
`tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`, `page-edit-request`,
or `unclear`. `page-edit-request` is the only one of these that isn't PW-OS-gated — it applies
to any page in the workspace, subject to its own safe-edit whitelist and exclusion list.
```

- [ ] **Step 5: Verify**

Run these two checks separately:

```bash
grep -ci "page-edit" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
grep -c "eight routes" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
```
Expected: `5` for the first (the classify bullet, the table row, the sub-section heading, and the two `page-edit-request` mentions in the composability note) and `1` for the second.

- [ ] **Step 6: Commit**

```bash
cd /Users/justinokamoto/SecondBrain
git add agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
git commit -m "feat(notion-mentions): add page-edit-request parity to the interactive skill"
```

(Skip if not a git repo, per Task 1 Step 5's note.)

---

### Task 4: Sync the updated skill files to the Hostinger box

**Files:** none (deployment step only)

- [ ] **Step 1: Sync notion-claude-mentions**

```bash
rsync -az /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/ \
  root@2.24.121.26:/app/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/
```

- [ ] **Step 2: Sync daily-notion-mention-fixes**

```bash
rsync -az /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/ \
  root@2.24.121.26:/app/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/
```

- [ ] **Step 3: Verify the box has the new content**

```bash
ssh root@2.24.121.26 "grep -c page-edit-request /app/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md"
```
Expected: `5` (matching Task 2 Step 3's verification count on the local copy).

Note: no `provision.sh` re-run is needed — the box's `claude-svc` user already reads these files through the existing `~/SecondBrain → /app/SecondBrain` symlink and the existing `daily-notion-mention-fixes`/`notion-claude-mentions` skill symlinks (set up in the earlier hourly-routine work). This task only updates file contents, not the wiring.

---

### Task 5: Smoke test — whitelisted edit from Justin on a non-excluded page executes live

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Post a test comment as Justin's account**

Using the Notion MCP (`mcp__notion__notion_create_comment`), post a new top-level comment on the SOP Engine page (`372063b6-6bf1-81eb-b8a4-dc708255033e`) — this is the same page used for the earlier mention-scanner smoke tests, so it's already an established, safe test target:

```
claude: add a link to https://example.com to this page
```

Record the returned `discussion_id`.

- [ ] **Step 2: Confirm the mention is detected and classified correctly**

```bash
ssh root@2.24.121.26 "sudo -u claude-svc -H bash -c '
set -a; . \$HOME/.team-claude-routine.env; set +a
export NOTION_TOKEN=\${NOTION_TOKEN:-\$NOTION_API_TOKEN}
node \$HOME/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json
' 2>&1 | grep -A5 'add a link'"
```
Expected: the new comment shows up with `status: NEEDS_REPLY` and `authorId: 18cd872b-594c-8133-bc0b-0002af1e69cd`.

- [ ] **Step 3: Trigger the real routine and confirm live execution**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service && journalctl -u pwaos-mention-scan.service -n 40 --no-pager"
```
Expected: the log shows the mention classified as `page-edit-request`, matched against the whitelist ("add a link" is on it), author check passed (it's Justin's account), and a live edit applied — NOT a draft.

- [ ] **Step 4: Verify the edit actually landed on the page**

Use `mcp__notion__notion_retrieve_block_children` on page `372063b6-6bf1-81eb-b8a4-dc708255033e` and confirm a new block containing `https://example.com` (or a link to it) is present, and that a reply was posted in the test discussion thread confirming the addition.

- [ ] **Step 5: Clean up**

Leave a note for Justin that this test added a link block to the SOP Engine page — same manual-cleanup situation as the earlier test threads on that page (Notion API doesn't support block deletion via these MCP tools either, so removal is a manual step whenever convenient).

---

### Task 6: Smoke test — non-whitelisted edit request drafts instead of executing

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Post a test comment requesting a non-whitelisted edit**

Post a new top-level comment on the same SOP Engine page:

```
claude: delete the second paragraph on this page
```

- [ ] **Step 2: Trigger the routine**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service && journalctl -u pwaos-mention-scan.service -n 40 --no-pager"
```

- [ ] **Step 3: Confirm it drafted rather than executed**

Expected: the log shows the mention classified as `page-edit-request`, but recognized as NOT on the safe-edit whitelist (a deletion), so it drafts a proposed description instead of applying anything. Confirm via `mcp__notion__notion_retrieve_block_children` that no content was actually removed from the page.

---

### Task 7: Smoke test — excluded-page edit request from Justin still drafts

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Identify a page under the exclusion list**

Use `mcp__notion__notion_search` (or the local Notion mirror) to find a page under a database matching one of the exclusion-list categories from Task 1 (e.g., a page under "Northeast Scoreboard" or "PWA-HR DOCS"). Record its page ID.

- [ ] **Step 2: Post a test comment requesting a whitelisted edit on that page**

```
claude: add a link to https://example.com to this page
```

- [ ] **Step 3: Trigger the routine and confirm it drafts, not executes**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service && journalctl -u pwaos-mention-scan.service -n 40 --no-pager"
```
Expected: even though the request matches the whitelist and comes from Justin's account, the exclusion-list check stops it — the log shows a draft, not a live edit. Confirm via `mcp__notion__notion_retrieve_block_children` that the excluded page was not modified.

- [ ] **Step 4: Clean up**

Note any test comment left on the excluded page for Justin's awareness (same manual-cleanup caveat as Task 5).

---

## Self-review notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-01-notion-page-edit-requests-design.md` maps to a task — classification (Task 1), constraints/reference (Task 2), interactive-skill parity (Task 3), deployment (Task 4), and all three safety boundaries from the "Testing" section (Tasks 5–7).
- **No code changes needed:** confirmed against the design's explicit statement that `scan_mentions.cjs` needs no changes — this plan only touches the two SKILL.md files.
- **Consistency check:** `JUSTIN_NOTION_USER_ID` value (`18cd872b-594c-8133-bc0b-0002af1e69cd`) matches what Task 1 of the earlier `pwaos-mention-actions` work already established and fixed workspace-wide — no new ID introduced.
