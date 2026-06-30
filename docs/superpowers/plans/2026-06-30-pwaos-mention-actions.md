# PW OS Mention Action Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `testing-review-request` and two-phase `tutorial-video-*` classifications to the `claude:` Notion mention system so PW OS testers can trigger automated fix+deploy or tutorial video production from a Notion comment.

**Architecture:** Extend `scan_mentions.cjs` to support multiple @mention targets in replies (commenter + Justin always); update `check-pwaos-tests` Step 0c and `daily-notion-mention-fixes` Step 2 with three new routing paths; the `testing-review-request` path re-uses the existing check-pwaos-tests fix machinery, the tutorial paths delegate to `tutorial-studio`.

**Tech Stack:** Node.js CJS (`@notionhq/client` v2.3.0 via `~/SecondBrain/tools/notion-mirror/node_modules/`), Notion Comments API, `scan_mentions.cjs`, `scan_pwaos_tests.cjs`, `tutorial-studio` skill, `youtube-upload` tool.

---

## File Map

| Action | File |
|---|---|
| Modify | `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs` |
| Modify | `~/.claude/skills/check-pwaos-tests/SKILL.md` *(hardlinked — edit either copy)* |
| Modify | `~/.claude/scheduled-tasks/daily-notion-mention-fixes/SKILL.md` |
| Modify | `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md` *(symlinked from `~/.claude/skills/notion-claude-mentions/SKILL.md`)* |

---

## Task 1: Resolve Justin's Notion user ID

**Files:** Modify `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs`

- [ ] **Step 1.1: Look up the user ID**

```bash
cd ~/SecondBrain/tools/notion-mirror && node -e "
require('dotenv').config();
const {Client} = require('./node_modules/@notionhq/client');
const n = new Client({auth: process.env.NOTION_TOKEN});
n.users.me().then(u => console.log('ID:', u.id, 'Name:', u.name));
"
```

Copy the `ID:` value from the output — it looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

- [ ] **Step 1.2: Add the constant to scan_mentions.cjs**

Open `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs`.

After line 22 (`const COMPONENTS_DB = "ca702e21d5b5491b98df34ed1bbb7182";`), add:

```js
const JUSTIN_NOTION_USER_ID = "<paste-id-from-step-1.1>";
```

- [ ] **Step 1.3: Commit**

```bash
git -C ~/SecondBrain add agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
git -C ~/SecondBrain commit -m "feat(mentions): add Justin Notion user ID constant"
```

---

## Task 2: Extend --reply to accept multiple @mention targets

**Files:** Modify `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs`

The current `--reply` subcommand accepts one optional authorId. Replace the `postReply` function so it accepts any number of authorIds (all args after the reply text).

- [ ] **Step 2.1: Verify the current postReply signature**

The current function (lines ~186–203):
```js
async function postReply() {
  const idx = argv.indexOf("--reply");
  const discussionId = argv[idx + 1];
  const text = argv[idx + 2];
  const authorId = argv[idx + 3]; // optional: user ID to @mention before the reply text
  ...
  if (authorId) {
    richText.push({ type: "mention", mention: { type: "user", user: { id: authorId } } });
    richText.push({ type: "text", text: { content: " " } });
  }
  richText.push({ type: "text", text: { content: text } });
  await notion.comments.create({ discussion_id: discussionId, rich_text: richText });
  console.log("✅ Reply posted to discussion " + discussionId + (authorId ? ` (@mentioned ${authorId})` : ""));
}
```

- [ ] **Step 2.2: Replace postReply with the multi-authorId version**

Replace the entire `postReply` function with:

```js
async function postReply() {
  const idx = argv.indexOf("--reply");
  const discussionId = argv[idx + 1];
  const text = argv[idx + 2];
  const authorIds = argv.slice(idx + 3).filter(Boolean); // all remaining args = user IDs to @mention
  if (!discussionId || !text) {
    console.error('Usage: --reply <discussionId> "<text>" [<authorId1> <authorId2> ...]');
    process.exit(1);
  }
  const richText = [];
  for (const id of authorIds) {
    richText.push({ type: "mention", mention: { type: "user", user: { id } } });
    richText.push({ type: "text", text: { content: " " } });
  }
  richText.push({ type: "text", text: { content: text } });
  await notion.comments.create({ discussion_id: discussionId, rich_text: richText });
  console.log(
    "✅ Reply posted to discussion " + discussionId +
    (authorIds.length ? ` (@mentioned: ${authorIds.join(", ")})` : "")
  );
}
```

- [ ] **Step 2.3: Verify backward compatibility**

Single-authorId call (old usage) still works: `argv.slice(idx + 3)` with one element produces `["<id>"]` — the loop runs once, same as before.

Zero-authorId call still works: `argv.slice(idx + 3)` is `[]` — loop doesn't run, richText has only the text node — same as before.

- [ ] **Step 2.4: Smoke test — single authorId (old behaviour)**

Use a real discussion thread from a previous test (the SOP Engine page used in the prior session smoke test, or any page with an active `claude:` thread). Run:

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<a-real-discussionId>" "Multi-authorId test — 1 ID" "<any-real-authorId>"
```

Expected output: `✅ Reply posted to discussion <id> (@mentioned: <authorId>)`

- [ ] **Step 2.5: Smoke test — two authorIds (new behaviour)**

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<same-discussionId>" "Multi-authorId test — 2 IDs" "<real-authorId>" "$JUSTIN_NOTION_USER_ID"
```

*(Replace `$JUSTIN_NOTION_USER_ID` with the literal UUID from Task 1.)*

Expected: `✅ Reply posted to discussion <id> (@mentioned: <authorId>, <justin-id>)`

Open the Notion thread to confirm both users are @mentioned in the comment.

- [ ] **Step 2.6: Delete the two test comments**

Open the Notion page and delete the two smoke-test replies you just posted so they don't mark the thread as ADDRESSED permanently.

- [ ] **Step 2.7: Commit**

```bash
git -C ~/SecondBrain add agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
git -C ~/SecondBrain commit -m "feat(mentions): extend --reply to accept multiple @mention authorIds"
```

---

## Task 3: Update check-pwaos-tests SKILL.md — Step 0c

**Files:** Modify `~/.claude/skills/check-pwaos-tests/SKILL.md`  
*(This file is hardlinked to `~/SecondBrain/agents/agent-instructions/skills/check-pwaos-tests/SKILL.md` — editing either updates both.)*

- [ ] **Step 3.1: Replace the Step 0c section**

Find the `### Step 0c — claude: mentions on PW OS pages` section (currently ends just before `## Step 1`). Replace the entire section with:

```markdown
### Step 0c — claude: mentions on PW OS pages

```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json
```

Read `mentions` where `status === "NEEDS_REPLY"`. Classify each by intent and route:

| Mention content | Classification | Route |
|---|---|---|
| Bug/failure description | `bug` | FIX path — same as table failures; requires `repo` on the component card |
| Question about behavior | `question` | Answer inline via `--reply` |
| "take a look at my testing results", "check my test results", "look at the testing page", "review what I tested" — any phrase meaning "review my testing and fix what's broken" | `testing-review-request` | **Testing-Review-Request flow** (below) |
| "ready for a tutorial video", "make a tutorial video", "tutorial video for this one", "create a tutorial for this" | `tutorial-video-request` | **Tutorial Phase 1** (below) |
| "run tutorial", "approved, run", "run the video" AND component page has a `🎬 Tutorial — ` child page | `tutorial-video-approval` | **Tutorial Phase 2** (below) |
| Vague/unclear | `unclear` | needs-clarification — post a clarifying question |

All replies pass both the commenter's `authorId` and `JUSTIN_NOTION_USER_ID` so both get notified:
```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<discussionId>" "<text>" "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
```

`ADDRESSED` threads (thread.length > 1) are not re-surfaced. `NEEDS_REPLY` threads with no resolvable `repo` → needs-info.

---

#### Testing-Review-Request flow

1. **Find the component card** — walk the page's parent chain to find the card in the Components DB (`ca702e21d5b5491b98df34ed1bbb7182`). Get `repo`.
   - No `repo` → reply: "@[tester] @Justin — Couldn't locate the repo for this component. Could you link the component card? — Claude (YYYY-MM-DD)" Stop.

2. **Scan that component's testing page** — run `node ~/.claude/skills/check-pwaos-tests/scan_pwaos_tests.cjs --json`, find the component by matching its `cardId` or page title. Read its `failures` array.
   - No testing page found, or no failures → reply: "@[tester] @Justin — No failures found on the testing page — looks like it's already passing! — Claude (YYYY-MM-DD)" Stop.

3. **Run check-pwaos-tests Steps 1–5** for those failures (triage → fix on branch `pwaos-fix/YYYY-MM-DD-<component>` → verify → deploy to IONOS dev → `--mark-fixed`). All hard stops apply.

4. **Post reply** (replaces the WhatsApp tester ping for this flow):
   ```bash
   node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Fixed and deployed to dev. [one-line summary of what changed]. Please check at https://[app-dev-url]. Fix is on branch pwaos-fix/YYYY-MM-DD-[component] (not merged to main — easy to revert). Reply here if anything looks off. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```
   Dev URL map: `va-management-next` → `https://dev-team.pwasecondbrain.uk` · other apps → their `*.pwasecondbrain.uk` from that app's AGENTS.md.

**Hard stops** (same as check-pwaos-tests main flow): secrets / `.env` / money / auth / destructive DB migrations → blocked; post reply noting the block.

---

#### Tutorial Phase 1 — Script (`tutorial-video-request`)

1. Find the component card (same parent-chain walk). No component → reply and stop.
2. Check for DONE Functions on the component.
   - None → reply: "@[tester] @Justin — No DONE Functions found on this component — the script can't be grounded yet. Mark at least one function Done and try again. — Claude (YYYY-MM-DD)" Stop.
3. Run `tutorial-studio` Phases A–B: ground in DONE Functions + code, write `🎬 Tutorial — [component]` Notion child page under the component.
4. Post reply:
   ```bash
   node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Script drafted — review here: [Notion script page link]. When it looks good, reply 'claude: run tutorial' on this page to kick off the render. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```

---

#### Tutorial Phase 2 — Render + Upload (`tutorial-video-approval`)

1. Find the `🎬 Tutorial — [component]` child page: call `notion.blocks.children.list` on the component page, find the child page whose title starts with `🎬 Tutorial —`.
2. Run `tutorial-studio` Phase C+ to render the 1080p MP4.
3. Upload unlisted to YouTube:
   ```bash
   node ~/SecondBrain/tools/youtube-upload/upload.mjs final.mp4 \
     --title "[Component] — Tutorial" --privacy unlisted
   ```
   - Exit code 2 (auth not configured) → deliver the MP4 locally and note the one-time auth step; do NOT post a dead link.
4. Post reply:
   ```bash
   node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Video uploaded to YouTube (unlisted): [YouTube link]. Set it to public when ready. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```
   - Render failure → reply: "Render failed — try '/tutorial-studio' manually or reply 'claude: run tutorial' again tomorrow."
```

- [ ] **Step 3.2: Verify both hardlinked copies updated**

```bash
diff ~/.claude/skills/check-pwaos-tests/SKILL.md \
     ~/SecondBrain/agents/agent-instructions/skills/check-pwaos-tests/SKILL.md
```

Expected: no output (files are identical — they are hardlinked).

- [ ] **Step 3.3: Confirm the new section is present**

```bash
grep -n "testing-review-request\|tutorial-video-request\|tutorial-video-approval" \
  ~/.claude/skills/check-pwaos-tests/SKILL.md
```

Expected: three matches, one for each new classification.

- [ ] **Step 3.4: Commit**

```bash
git -C ~/SecondBrain add agents/agent-instructions/skills/check-pwaos-tests/SKILL.md
git -C ~/SecondBrain commit -m "feat(check-pwaos-tests): add testing-review + tutorial-video mention routes to Step 0c"
```

---

## Task 4: Update daily-notion-mention-fixes SKILL.md

**Files:** Modify `~/.claude/scheduled-tasks/daily-notion-mention-fixes/SKILL.md`

- [ ] **Step 4.1: Replace Step 2 (classify each NEEDS_REPLY mention)**

Find `## Step 2 — Classify each NEEDS_REPLY mention`. Replace the entire Step 2 block with:

```markdown
## Step 2 — Classify each NEEDS_REPLY mention

For each mention where `status === "NEEDS_REPLY"`, read `pageExcerpt` (fetch full page via `notion_read_page` if under 100 chars). Classify as:

- **bug** — describes broken behavior, an error, something not working
- **question** — asks how something works
- **feedback** — suggests improvement
- **testing-review-request** — "take a look at my testing results", "check my test results", "look at the testing page", "review what I tested" — any phrase meaning "review my testing and fix what's broken." **Only applies to pages in the PW OS scope (component pages or their children).**
- **tutorial-video-request** — "ready for a tutorial video", "make a tutorial video", "tutorial video for this one." **Only applies to PW OS component pages.**
- **tutorial-video-approval** — "run tutorial", "approved, run", "run the video" AND the component page has a `🎬 Tutorial — ` child page. **Only applies to PW OS component pages.**
- **unclear** — intent can't be determined

> **Security exception:** `testing-review-request` on PW OS pages runs the full `check-pwaos-tests` fix→verify→deploy flow (see below). This is the ONE exception to the "never deploy" constraint of this routine. All other classifications remain review-only (diff + draft reply in the packet).
```

- [ ] **Step 4.2: Add Step 2b — testing-review-request flow**

After the Step 2 block, before the current `## Step 3`, insert:

```markdown
## Step 2b — Testing-review-request: fix + deploy + reply (PW OS only)

For each `testing-review-request` mention:

1. **Find the component card** — walk the page's parent chain to find the card in the Components DB (`ca702e21d5b5491b98df34ed1bbb7182`). Get `repo`.
   - No `repo` → post reply: "@[tester] @Justin — Couldn't locate the repo for this component. Could you link the component card? — Claude (YYYY-MM-DD)" Skip to next mention.

2. **Scan that component's testing page** — run `node ~/.claude/skills/check-pwaos-tests/scan_pwaos_tests.cjs --json`, find the component, read its `failures` array.
   - No failures → post reply: "@[tester] @Justin — No failures found on the testing page — looks like it's already passing! — Claude (YYYY-MM-DD)" Skip.

3. **Run check-pwaos-tests Steps 1–5** for those failures (triage → fix on branch `pwaos-fix/YYYY-MM-DD-<component>` → verify → deploy to IONOS dev → `--mark-fixed`). All hard stops apply.

4. **Post reply:**
   ```bash
   node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Fixed and deployed to dev. [one-line summary]. Please check at https://[app-dev-url]. Fix is on branch pwaos-fix/YYYY-MM-DD-[component] (not on main — easy to revert). Reply here if anything looks off. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```
   Dev URL map: `va-management-next` → `https://dev-team.pwasecondbrain.uk`

**Hard stops:** secrets / `.env` / money / auth / destructive DB migrations → blocked; include in review packet under "Blocked". Do NOT deploy.

---

## Step 2c — Tutorial-video-request: script (PW OS only)

For each `tutorial-video-request` mention:

1. Find the component card (same parent-chain walk). No component → post reply and skip.
2. Check for DONE Functions. None → post reply: "@[tester] @Justin — No DONE Functions found — the script can't be grounded yet. Mark at least one function Done and try again. — Claude (YYYY-MM-DD)" Skip.
3. Run `tutorial-studio` Phases A–B (ground script, write `🎬 Tutorial — [component]` Notion page).
4. Post reply:
   ```bash
   node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Script drafted — review here: [Notion page link]. When it looks good, reply 'claude: run tutorial' on this page to kick off the render. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```

---

## Step 2d — Tutorial-video-approval: render + upload (PW OS only)

For each `tutorial-video-approval` mention:

1. Find the `🎬 Tutorial — [component]` child page: call `notion.blocks.children.list` on the component page, find the child page whose title starts with `🎬 Tutorial —`.
2. Run `tutorial-studio` Phase C+ (render MP4 from the Notion script).
3. Upload unlisted to YouTube:
   ```bash
   node ~/SecondBrain/tools/youtube-upload/upload.mjs final.mp4 \
     --title "[Component] — Tutorial" --privacy unlisted
   ```
   Exit code 2 (auth not configured) → deliver MP4 locally, note setup step in packet.
4. Post reply:
   ```bash
   node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
     --reply "<discussionId>" \
     "Video uploaded (unlisted): [YouTube link]. Set it to public when ready. — Claude (YYYY-MM-DD)" \
     "<commenterAuthorId>" "JUSTIN_NOTION_USER_ID"
   ```
   Render failure → reply: "Render failed — try '/tutorial-studio' manually or reply 'claude: run tutorial' again."
```

- [ ] **Step 4.3: Update Step 5 (review packet format) to mention new exception**

Find the packet header format block under `## Step 5`. Update the `Scanned:` summary line to:

```markdown
Scanned: N mentions | Bug fixes: X | Testing-review fixes: Y | Tutorial scripts: Z | Tutorial renders: W | Draft replies: A | Blocked: B | Needs-info: C
```

- [ ] **Step 4.4: Update the Constraints section**

Find `## Constraints (non-negotiable)`. Add one line after the existing `Do NOT commit, push, or deploy anything` line:

```markdown
- **Exception:** `testing-review-request` mentions on PW OS component pages run the full check-pwaos-tests fix→verify→deploy flow. All other mention types remain review-only.
```

- [ ] **Step 4.5: Verify the file**

```bash
grep -n "testing-review-request\|tutorial-video-request\|tutorial-video-approval\|Exception" \
  ~/.claude/scheduled-tasks/daily-notion-mention-fixes/SKILL.md
```

Expected: at least five matches across the new sections.

- [ ] **Step 4.6: Commit**

```bash
git -C ~/code/apps/va-management-next add -f ~/.claude/scheduled-tasks/daily-notion-mention-fixes/SKILL.md 2>/dev/null || true
```

*(The scheduled-tasks dir lives outside the va-management-next repo. Commit it to SecondBrain if it's tracked there, otherwise just note the change is saved.)*

Check which repo this file belongs to:

```bash
git -C ~/.claude/scheduled-tasks/daily-notion-mention-fixes rev-parse --show-toplevel 2>/dev/null || echo "not in a git repo"
```

If not in a git repo, the file is still saved to disk — move on.

---

## Task 5: Update notion-claude-mentions SKILL.md — composability note

**Files:** Modify `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md`  
*(Symlinked from `~/.claude/skills/notion-claude-mentions/SKILL.md` — edit the SecondBrain copy.)*

- [ ] **Step 5.1: Replace the composability note at the bottom**

Find the `## Composability note` section. Replace it with:

```markdown
## Composability note

`check-pwaos-tests` calls this scanner directly with `--scope pwaos --json` in its Step 0c. The `daily-notion-mention-fixes` routine (8am scheduled) also calls it with `--scope recent --json`.

**New action routes** (both surfaces):
- `testing-review-request` — triggers the full check-pwaos-tests fix→verify→deploy flow for the mentioned component's testing failures. Reply is auto-posted; no WhatsApp ping.
- `tutorial-video-request` — triggers `tutorial-studio` Phases A–B (Notion script), replies with script link and prompt to approve.
- `tutorial-video-approval` — triggers `tutorial-studio` Phase C+ (render + YouTube unlisted upload), replies with the YouTube link.

All action-flow replies pass both the commenter's `authorId` and `JUSTIN_NOTION_USER_ID` so both parties are @mentioned and notified.

The `--reply` subcommand accepts multiple authorIds:
```bash
node scan_mentions.cjs --reply "<discussionId>" "<text>" <authorId1> [<authorId2> ...]
```
```

- [ ] **Step 5.2: Verify symlink reflects the change**

```bash
diff ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md \
     ~/.claude/skills/notion-claude-mentions/SKILL.md
```

Expected: no output (symlink points to the same file).

- [ ] **Step 5.3: Commit**

```bash
git -C ~/SecondBrain add agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
git -C ~/SecondBrain commit -m "feat(mentions): update composability note with new action routes"
```

---

## Task 6: End-to-end smoke test

Verify the scanner correctly detects and classifies a `testing-review-request` mention before it reaches a real fix cycle.

- [ ] **Step 6.1: Post a test mention on a PW OS component page**

Pick any PW OS component page (not a testing page — the parent component card or a non-testing child page). Add a comment:

```
claude: take a look at my testing results
```

Note the page URL.

- [ ] **Step 6.2: Run the PW OS scanner and confirm it appears**

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --scope pwaos --json | python3 -m json.tool | grep -A 8 "testing results"
```

Expected: the mention appears in the output with `"status": "NEEDS_REPLY"` and the question text containing "take a look at my testing results".

- [ ] **Step 6.3: Verify the reply command with both authorIds**

Using the `discussionId` from the scan output and your own authorId, do a dry-run reply to confirm the multi-authorId path works (post to a test thread, then delete):

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<discussionId-from-scan>" \
  "Smoke test reply with two @mentions — please delete me" \
  "<your-authorId-from-scan>" "JUSTIN_NOTION_USER_ID"
```

Expected: `✅ Reply posted to discussion <id> (@mentioned: <commenterAuthorId>, <justinId>)`

Open the Notion thread: both users should be @mentioned.

- [ ] **Step 6.4: Clean up**

Delete both the test `claude: take a look at my testing results` comment and the smoke-test reply from the Notion page.

- [ ] **Step 6.5: Confirm the full scan still runs cleanly**

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos
```

Expected: output lists pages scanned with no error. Any `NEEDS_REPLY` items are real ones (not the test comment you just deleted).

---

## Self-Review Notes

- **Spec coverage:**
  - Detection logic ✓ (Task 3 + 4 routing tables)
  - testing-review-request fix flow ✓ (Task 3 + 4 Step 2b)
  - Tutorial Phase 1 (script) ✓ (Task 3 + 4 Step 2c)
  - Tutorial Phase 2 (render + upload) ✓ (Task 3 + 4 Step 2d)
  - Multi-@mention reply ✓ (Task 2)
  - JUSTIN_NOTION_USER_ID constant ✓ (Task 1)
  - Daily routine deploy exception ✓ (Task 4.4)
  - Hard stops ✓ (documented in both SKILL.md updates)
  - Revertability (branch naming) ✓ (branch name `pwaos-fix/YYYY-MM-DD-<component>` in both skill updates)
  - YouTube unlisted gate ✓ (stated in both Phase 2 sections)

- **No placeholders:** All code blocks are complete. `JUSTIN_NOTION_USER_ID` is resolved in Task 1 before it's used in Tasks 3–6. `app-dev-url` is resolved dynamically from the component's AGENTS.md at skill runtime (same pattern as check-pwaos-tests deploy step).

- **Type consistency:** `authorIds` (array) in scanner matches `argv.slice(idx + 3)` usage throughout; `discussionId`, `commenterAuthorId`, `JUSTIN_NOTION_USER_ID` naming is consistent across Tasks 2, 3, 4, 5.
