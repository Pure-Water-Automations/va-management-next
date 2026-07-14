# create-testing-page Anywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `create-testing-page` from PW-OS-only to any page in the workspace — PW OS keeps its existing separate-child-page mechanism unchanged; every other page gets a "🧪 Testing" section appended directly onto it (no page-creation tool exists), with functions derived from page content and, if linked, the app's repo docs.

**Architecture:** Pure instruction-layer change to the two consumer skill files (`daily-notion-mention-fixes/SKILL.md`, `notion-claude-mentions/SKILL.md`) — no scanner code changes, since `scan_mentions.cjs` already scans workspace-wide. `check-pwaos-tests/SKILL.md` is untouched: it scans with `--scope pwaos` and structurally never sees a non-PW-OS page, so its own copy of the create-testing-page procedure doesn't need the new branch.

**Tech Stack:** Markdown skill instructions; Notion MCP tools (`notion_append_block_children` for the new any-page branch, unchanged tools for the PW-OS branch).

---

### Task 1: Update `daily-notion-mention-fixes/SKILL.md` — classification, explanatory text, and Step 2e

**Files:**
- Modify: `/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md`

- [ ] **Step 1: Update the classification table row**

Old:
```markdown
| `create-testing-page` | "create a testing page", "make a testing page", "set up testing", "add a testing page" | **PW OS pages only** → create `🧪 Testing —` Notion page (see Step 2e) |
```

New:
```markdown
| `create-testing-page` | "create a testing page", "make a testing page", "set up testing", "add a testing page" | **Any page** (except the exclusion list) — mechanism differs by scope: PW OS gets a separate child page, anywhere else gets an appended section (see Step 2e) |
```

- [ ] **Step 2: Update the "four PW OS-only classifications" paragraph and add the new explanatory sentence**

Old:
```markdown
The four PW OS-only classifications (`testing-review-request`, `tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`) apply only when the mention appears on a page in the PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) or its subtree. Non-PW-OS pages with these phrases → classify as `unclear` and draft a reply.

`page-edit-request` is the one classification that isn't PW-OS-gated — it applies to any page in the workspace. See Step 2f for the exclusion list, the safe-edit whitelist, and the author check that determines whether it executes live or drafts instead.
```

New:
```markdown
The three PW OS-only classifications (`testing-review-request`, `tutorial-video-request`, `tutorial-video-approval`) apply only when the mention appears on a page in the PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) or its subtree. Non-PW-OS pages with these phrases → classify as `unclear` and draft a reply.

`page-edit-request` and `create-testing-page` are not PW-OS-gated — both apply to any page in the workspace (except the exclusion list). See Step 2f for `page-edit-request`'s safe-edit whitelist and author check. `create-testing-page` (Step 2e) has no author check — it executes for anyone who asks, on any non-excluded page — but its mechanism depends on scope: a separate child page on PW OS, an appended section everywhere else.
```

- [ ] **Step 3: Replace Step 2e entirely**

Old:
```markdown
### Step 2e — create-testing-page (PW OS only)

Follow `check-pwaos-tests` SKILL.md `Step 0c → create-testing-page flow`:
1. Find component card (parent-chain walk).
2. Check for existing `🧪 Testing —` child page via `mcp__notion__notion_retrieve_block_children`. Exists → reply with link and stop.
3. Read DONE Functions from the component card.
4. Create `🧪 Testing — [component]` Notion page under the component (`mcp__notion__notion_create_pages` + `mcp__notion__notion_append_block_children`). Table: `Function | What should happen | Result`. Pre-populate rows from DONE Functions. If no DONE Functions: one placeholder row with `Function` = "(add your functions here)", `Result` left blank.
5. Post Notion reply with testing page link + both @mentions (commenter + `JUSTIN_NOTION_USER_ID`).
No code deployment occurs in this flow.
```

New:
```markdown
### Step 2e — create-testing-page (any page, mechanism depends on scope)

1. **Check the exclusion list first**, regardless of where the page lives. If the page (or its parent database) matches any of the following, draft a reply instead — do not create or append anything:
   - Any database or page under "Northeast Scoreboard," or otherwise tracking member finance/blessing-point data
   - "PWA-HR DOCS" or other personnel/HR pages
   - Any Notion mirror of QuickBooks/financial data
   - Any page whose title or parent database name contains "payroll," "salary," "compensation," or "agreement"
2. **Determine scope:** is the page in the PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) or its subtree?

**PW OS branch (unchanged from before):**
   Follow `check-pwaos-tests` SKILL.md `Step 0c → create-testing-page flow`:
   a. Find component card (parent-chain walk).
   b. Check for existing `🧪 Testing —` child page via `mcp__notion__notion_retrieve_block_children`. Exists → reply with link and stop.
   c. Read DONE Functions from the component card.
   d. Create `🧪 Testing — [component]` Notion page under the component (`mcp__notion__notion_create_pages` + `mcp__notion__notion_append_block_children`). Table: `Function | What should happen | Result`. Pre-populate rows from DONE Functions. If no DONE Functions: one placeholder row with `Function` = "(add your functions here)", `Result` left blank.
   e. Post Notion reply with testing page link + both @mentions (commenter + `JUSTIN_NOTION_USER_ID`).

**Any-other-page branch (new):**
   a. Read the page's own content (`notion_read_page` or `mcp__notion__notion_retrieve_block_children`). Check for an existing heading starting with "🧪 Testing —". Exists → reply with a pointer to it and stop. No duplicate sections.
   b. Derive testable functions from whatever grounding actually exists:
      - The page's own description/content — what it says is live, shipped, or in beta.
      - If the page links to a GitHub repo (a URL property, or a repo path mentioned in the text), read that repo's README/AGENTS.md for a more authoritative "what's actually built" signal.
      - Use whichever of these exists; don't require both.
   c. **Not enough to go on** (no repo, and the page's own content is too thin or vague to name specific functions) → don't fabricate a table. Draft a reply asking what should be tracked, same as the needs-info pattern used elsewhere in this skill.
   d. Otherwise, append a section directly onto the page via `mcp__notion__notion_append_block_children`:
      - A `divider` block
      - A `heading_2`: "🧪 Testing — [page name]"
      - A short `paragraph` noting this was built by the automated flow and what it's grounded in (page content, and/or the linked repo)
      - A `table` block: `Function | What should happen | Result`, one row per derived function, `Result` left blank
   e. Post Notion reply with a pointer to the new section + both @mentions (commenter + `JUSTIN_NOTION_USER_ID`).

No code deployment occurs in either branch.
```

- [ ] **Step 4: Update the Constraints section's create-testing-page sentence**

Old (within the existing hard-constraint bullet):
```markdown
The `create-testing-page` flow also executes live (creates a Notion page + posts a reply) but involves no code deployment.
```

New:
```markdown
The `create-testing-page` flow also executes live on any non-excluded page (creates a separate child page on PW OS, or appends a testing section directly to the page anywhere else, then posts a reply) but involves no code deployment either way.
```

- [ ] **Step 5: Verify**

```bash
grep -c "create-testing-page" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
grep -n "Step 2e" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
grep -n "PW OS-only classifications" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
```
Expected: the first command returns `5` (same total as before the edit — the term appears in the same five places, just with updated surrounding text: the table row, the new explanatory sentence, the Step 2e heading, the "Step 0c → create-testing-page flow" reference inside the PW-OS branch, and the constraints sentence). The second command's output line should read `### Step 2e — create-testing-page (any page, mechanism depends on scope)`, not "(PW OS only)". The third command's output should read "three PW OS-only classifications", not "four".

- [ ] **Step 6: Commit**

```bash
cd /Users/justinokamoto/SecondBrain
git add agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md
git commit -m "feat(notion-mentions): expand create-testing-page beyond PW OS"
```

---

### Task 2: Update `notion-claude-mentions/SKILL.md` — parity for the interactive skill

**Files:**
- Modify: `/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md`

- [ ] **Step 1: Add the new classification bullet**

Old:
```markdown
**2b. Classify the mention**

- **Answerable question** — "does X work like Y?", "what should I enter here?"
- **Bug/issue report** — "X is broken", "the button doesn't respond"
- **Feedback/polish** — "this label is confusing", "could this be clearer?"
- **Page-edit request** — names one concrete, small edit to make ("add the link to X", "add a row for Y", "check this box")
- **Unclear** — intent cannot be determined without more information
```

New:
```markdown
**2b. Classify the mention**

- **Answerable question** — "does X work like Y?", "what should I enter here?"
- **Bug/issue report** — "X is broken", "the button doesn't respond"
- **Feedback/polish** — "this label is confusing", "could this be clearer?"
- **Page-edit request** — names one concrete, small edit to make ("add the link to X", "add a row for Y", "check this box")
- **Create-testing-page request** — "create a testing page", "make a testing page", "set up testing", "add a testing page"
- **Unclear** — intent cannot be determined without more information
```

- [ ] **Step 2: Add a row to the reply-approach table**

Old:
```markdown
| Classification | Reply approach |
|---|---|
| Answerable question | Answer it directly |
| Bug report | Acknowledge + note it's been logged for the next fix cycle |
| Feedback/polish | Acknowledge + note it's been recorded |
| Page-edit request | Check against the safe-edit whitelist and exclusion list below, then apply directly or ask first |
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
| Create-testing-page request | Check the exclusion list below; if not excluded, PW OS pages get a separate child page, any other page gets an appended testing section |
| Unclear | Ask the one clarifying question needed to proceed |
```

- [ ] **Step 3: Add the create-testing-page sub-section**

Immediately after the existing "Page-edit requests — safe-edit whitelist" sub-section (and before "Sign all replies: `— Claude (YYYY-MM-DD)`"), add:

```markdown
**Create-testing-page requests — exclusion list**

Same exclusion list as page-edit-request above: Northeast Scoreboard / member finance-or-points pages, PWA-HR DOCS, QuickBooks Notion mirrors, anything titled or parented with "payroll," "salary," "compensation," or "agreement." On an excluded page, draft a reply instead — don't create or append anything.

Not excluded → check scope: PW OS Components DB or subtree gets the existing separate-child-page flow (find the component card, check for an existing `🧪 Testing —` child page, pull DONE Functions, create the page). Any other page gets a "🧪 Testing —" section appended directly onto the page instead (no separate page — there's no tool available to create one), with functions derived from the page's own content and, if linked, its GitHub repo's README/AGENTS.md. Not enough context to derive functions → draft a reply asking what to track rather than guessing. No author check either way — this executes for anyone who asks, same as PW OS's existing behavior. Full step-by-step is in `daily-notion-mention-fixes` SKILL.md Step 2e.
```

- [ ] **Step 4: Update the composability note**

Old:
```markdown
`check-pwaos-tests` calls this scanner with `--scope pwaos --json` in Step 0c.
Mentions are classified into eight routes: `bug`, `question`, `testing-review-request`,
`tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`, `page-edit-request`,
or `unclear`. `page-edit-request` is the only one of these that isn't PW-OS-gated — it applies
to any page in the workspace, subject to its own safe-edit whitelist and exclusion list.

`daily-notion-mention-fixes` also uses this scanner (without `--scope`) for the
30-minute automated routine. The `testing-review-request` route on PW OS pages is the
ONE exception to the routine's no-deploy rule — it runs the full
`check-pwaos-tests` fix→deploy flow. Tutorial video routes produce a Notion page
and YouTube upload — no code deployment. `page-edit-request` executes live only for
whitelisted edits from Justin's own account, on a non-excluded page — everything else
in that flow drafts instead.
```

New:
```markdown
`check-pwaos-tests` calls this scanner with `--scope pwaos --json` in Step 0c.
Mentions are classified into eight routes: `bug`, `question`, `testing-review-request`,
`tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`, `page-edit-request`,
or `unclear`. Two of these aren't PW-OS-gated: `page-edit-request` applies to any page,
subject to its own safe-edit whitelist and exclusion list; `create-testing-page` also applies
to any page (subject to the same exclusion list), but its mechanism differs by scope — a
separate child page on PW OS, an appended section everywhere else.

`daily-notion-mention-fixes` also uses this scanner (without `--scope`) for the
30-minute automated routine. The `testing-review-request` route on PW OS pages is the
ONE exception to the routine's no-deploy rule — it runs the full
`check-pwaos-tests` fix→deploy flow. Tutorial video routes produce a Notion page
and YouTube upload — no code deployment. `page-edit-request` executes live only for
whitelisted edits from Justin's own account, on a non-excluded page — everything else
in that flow drafts instead. `create-testing-page` executes live for anyone (no author
check) on any non-excluded page — no code deployment either way.
```

- [ ] **Step 5: Verify**

```bash
grep -c '\*\*Create-testing-page request\*\*' /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
grep -c '| Create-testing-page request |' /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
grep -c "Create-testing-page requests — exclusion list" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
grep -c "mechanism differs by scope" /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
```
Expected: `1` for each of the four checks — the bold-asterisk 2b bullet, the table row, the sub-section heading (checked separately from the bullet since "requests" contains "request" as a substring and would otherwise conflate the two), and the composability note's new sentence.

- [ ] **Step 6: Commit**

```bash
cd /Users/justinokamoto/SecondBrain
git add agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
git commit -m "feat(notion-mentions): create-testing-page parity for the interactive skill"
```

---

### Task 3: Sync both files to the Hostinger box

**Files:** none (deployment step only)

- [ ] **Step 1: Sync both skill files**

```bash
rsync -az /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/ \
  root@2.24.121.26:/app/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/
rsync -az /Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/ \
  root@2.24.121.26:/app/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/
```

- [ ] **Step 2: Verify the box has the new content**

```bash
ssh root@2.24.121.26 "grep -c 'create-testing-page' /app/SecondBrain/agents/agent-instructions/skills/daily-notion-mention-fixes/SKILL.md"
```
Expected: `5` (matching Task 1 Step 5's count on the local copy).

No `provision.sh` re-run needed — `claude-svc` already reads these files through the existing symlinks set up during the hourly-routine work.

---

### Task 4: Smoke test — any-page create-testing-page with real grounding

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Find a suitable test page**

Use `mcp__notion__notion_search` to find a page that is: not in the PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`), not on the exclusion list, has substantive content (ideally a description of live functionality and/or a linked GitHub repo), and does not already have a "🧪 Testing —" section. Confirm zero existing comments via `mcp__notion__notion_retrieve_comments` (so the test comment starts a fresh discussion thread, not one threaded into existing comments).

- [ ] **Step 2: Post the test comment**

```
claude: create a testing page for this one
```
via `mcp__notion__notion_create_comment` with `parent: {page_id: "<the page id>"}`. Record the returned `discussion_id`.

- [ ] **Step 3: Trigger the routine**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service"
```

- [ ] **Step 4: Check the journal**

```bash
ssh root@2.24.121.26 "journalctl -u pwaos-mention-scan.service --since '-2min' --no-pager"
```
Expected: the mention is classified as `create-testing-page`, recognized as NOT a PW-OS page, and the log describes appending a testing section (not creating a separate page).

- [ ] **Step 5: Verify the section actually landed**

Use `mcp__notion__notion_retrieve_block_children` on the test page. Confirm: a `divider`, a `heading_2` reading "🧪 Testing — [page name]", a context paragraph, and a `table` block with a `Function | What should happen | Result` header row plus at least one derived function row are present.

- [ ] **Step 6: Confirm no duplicate on a second trigger**

Post the same test comment again (`claude: create a testing page for this one`) as a fresh top-level comment on the same page, trigger the service again, and confirm via the journal/reply that it detected the existing "🧪 Testing —" heading and replied with a pointer instead of appending a second section. Verify via `notion_retrieve_block_children` that only one testing section exists on the page.

---

### Task 5: Smoke test — thin/no-repo page drafts instead of fabricating

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Find or identify a thin test page**

Find a non-PW-OS, non-excluded page with minimal content (a mostly-empty page, or one with just a title and no real description) and no linked GitHub repo. Confirm zero existing comments.

- [ ] **Step 2: Post the test comment**

```
claude: create a testing page for this one
```

- [ ] **Step 3: Trigger the routine and check the outcome**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service"
ssh root@2.24.121.26 "journalctl -u pwaos-mention-scan.service --since '-2min' --no-pager"
```
Expected: the mention is classified as `create-testing-page`, but the routine recognizes there isn't enough grounding to derive functions, and drafts a reply asking what to track — it does NOT append a fabricated table. Confirm via `notion_retrieve_block_children` that no "🧪 Testing —" section was added to the page.

---

### Task 6: Smoke test — excluded-list page drafts regardless of content quality

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Find an excluded-list page**

Find a page matching one of the exclusion categories (Northeast Scoreboard/finance-points, PWA-HR DOCS, QuickBooks mirror, or payroll/salary/compensation/agreement-titled) that also has substantive content (so a false negative — the exclusion failing to fire — would otherwise have enough grounding to succeed). Confirm zero existing comments.

- [ ] **Step 2: Post the test comment**

```
claude: create a testing page for this one
```

- [ ] **Step 3: Trigger the routine and check the outcome**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service"
ssh root@2.24.121.26 "journalctl -u pwaos-mention-scan.service --since '-2min' --no-pager"
```
Expected: the log explicitly cites the exclusion list as the reason for drafting, even though the page has enough content to otherwise succeed. Confirm via `notion_retrieve_block_children` that nothing was appended.

---

### Task 7: Regression check — PW OS branch is unchanged

**Files:** none (manual verification against live Notion)

- [ ] **Step 1: Find a PW OS component without an existing testing page**

Query the PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) for a component that does not yet have a `🧪 Testing —` child page. Confirm zero existing comments on that component's page.

- [ ] **Step 2: Post the test comment**

```
claude: create a testing page for this one
```

- [ ] **Step 3: Trigger the routine and check the outcome**

```bash
ssh root@2.24.121.26 "systemctl start pwaos-mention-scan.service"
ssh root@2.24.121.26 "journalctl -u pwaos-mention-scan.service --since '-2min' --no-pager"
```
Expected: behavior identical to before this change — a **separate child page** titled "🧪 Testing — [component]" is created under the component, populated from its `Functions` relation property (not appended inline to the component's own page). Confirm via `mcp__notion__notion_retrieve_block_children` on the component page that a new `child_page` block (not a `heading_2` + `table`) was added.

---

## Self-review notes

- **Spec coverage:** the exclusion-list check (spec section "Scope decision"), the PW-OS-unchanged branch, the any-page append branch, the not-enough-context fallback, and the no-author-check decision each map to a task (1, 2, and the four smoke tests 4–7).
- **No changes to `check-pwaos-tests/SKILL.md`:** confirmed against the design — it scans with `--scope pwaos` and structurally never encounters a non-PW-OS page, so its own copy of the create-testing-page procedure doesn't need the new branch.
- **Consistency check:** the exclusion list wording is copy-identical to the one already shipped for `page-edit-request` in both files — no new list was invented, avoiding drift between the two.
