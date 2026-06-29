# Notion @claude Mentions Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `notion-claude-mentions` skill that scans Notion for `@claude:` comments, replies inline, and is composable into `check-pwaos-tests` as Step 0c.

**Architecture:** A new standalone skill (`scan_mentions.cjs` + `SKILL.md`) lives at the canonical SecondBrain skills path and is symlinked into `~/.claude/skills/`. The scanner is called directly by `check-pwaos-tests` with `--scope pwaos` for the embedded use case, and by the standalone skill with `--scope recent` for workspace-wide use.

**Tech Stack:** Node.js (CJS), `@notionhq/client` v2.3.0 (via notion-mirror's node_modules), dotenv. No new dependencies.

---

## File Map

| Action | Path |
|---|---|
| Create | `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs` |
| Create | `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md` |
| Create | `~/.claude/skills/notion-claude-mentions` → symlink to canonical |
| Modify | `~/SecondBrain/agents/agent-instructions/SKILLS.md` |
| Modify | `~/.claude/skills/check-pwaos-tests/SKILL.md` |
| Modify | `~/SecondBrain/agents/agent-instructions/skills/check-pwaos-tests/SKILL.md` |

---

## Task 1: Create `scan_mentions.cjs` — core scanner

**Files:**
- Create: `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs`

- [ ] **Step 1: Create the canonical skill directory**

```bash
mkdir -p ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions
```

- [ ] **Step 2: Verify the Notion token is accessible via notion-mirror .env**

```bash
node -e "
  const path = require('path');
  const NM = path.join(process.env.HOME, 'SecondBrain/tools/notion-mirror');
  require(path.join(NM, 'node_modules/dotenv')).config({ path: path.join(NM, '.env') });
  console.log('NOTION_TOKEN set:', !!process.env.NOTION_TOKEN);
"
```

Expected: `NOTION_TOKEN set: true`

- [ ] **Step 3: Write `scan_mentions.cjs`**

Create `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs`:

```js
#!/usr/bin/env node
/*
 * scan_mentions.cjs — scanner for @claude: comments in Notion.
 *
 *   node scan_mentions.cjs              human-readable summary
 *   node scan_mentions.cjs --json       machine JSON for consuming skills
 *
 * Subcommands:
 *   --reply <discussionId> "<text>"     post a reply to a discussion thread
 *
 * Scope:
 *   --scope recent  (default)  pages edited in last 7 days, via Notion search
 *   --scope pwaos              PW OS Components DB + child pages
 *   --since Nd                 override recency window (default 7d)
 */
const path = require("path");
const ROOT = path.join(process.env.HOME, "SecondBrain");
const NM = path.join(ROOT, "tools/notion-mirror");
require(path.join(NM, "node_modules/dotenv")).config({ path: path.join(NM, ".env") });
const { Client } = require(path.join(NM, "node_modules/@notionhq/client"));

const COMPONENTS_DB = "ca702e21d5b5491b98df34ed1bbb7182";
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ── arg parsing ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const SCOPE = argv.includes("--scope") ? argv[argv.indexOf("--scope") + 1] : "recent";
const SINCE_STR = argv.includes("--since") ? argv[argv.indexOf("--since") + 1] : "7d";

function parseSince(str) {
  const m = (str || "7d").match(/^(\d+)([dh])$/);
  if (!m) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const n = parseInt(m[1]);
  const ms = m[2] === "h" ? 3_600_000 : 86_400_000;
  return new Date(Date.now() - n * ms);
}
const SINCE_DATE = parseSince(SINCE_STR);

// ── helpers ───────────────────────────────────────────────────────────────────
const rt = (arr) => (arr || []).map((t) => t.plain_text).join("").trim();

function pageTitle(page) {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p && p.type === "title" && Array.isArray(p.title)) {
      const t = p.title.map((x) => x.plain_text).join("").trim();
      if (t) return t;
    }
  }
  if (page.child_page) return page.child_page.title || "";
  return page.id;
}

async function listAll(block_id) {
  const out = []; let cursor;
  do {
    const r = await notion.blocks.children.list({ block_id, start_cursor: cursor, page_size: 100 });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function queryAll(database_id) {
  const out = []; let cursor;
  do {
    const r = await notion.databases.query({ database_id, start_cursor: cursor, page_size: 100 });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function listComments(block_id) {
  const out = []; let cursor;
  do {
    const r = await notion.comments.list({ block_id, start_cursor: cursor, page_size: 100 });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function pageExcerpt(pageId) {
  try {
    const blocks = await listAll(pageId);
    const parts = [];
    for (const b of blocks.slice(0, 20)) {
      const inner = b[b.type];
      if (inner && Array.isArray(inner.rich_text)) {
        const t = rt(inner.rich_text);
        if (t) parts.push(t);
      }
      if (parts.join("\n").length >= 600) break;
    }
    return parts.join("\n").slice(0, 600);
  } catch (_) {
    return "";
  }
}

// ── scan one page for @claude: comments ──────────────────────────────────────
async function scanPage(page) {
  const pageId = page.id;
  const title = pageTitle(page);
  const url = page.url || "";

  let comments;
  try {
    comments = await listComments(pageId);
  } catch (_) {
    return [];
  }
  if (!comments.length) return [];

  // Group comments by discussion_id
  const threads = new Map();
  for (const c of comments) {
    if (!threads.has(c.discussion_id)) threads.set(c.discussion_id, []);
    threads.get(c.discussion_id).push(c);
  }

  const mentions = [];
  for (const [discussionId, thread] of threads) {
    thread.sort((a, b) => (a.created_time || "").localeCompare(b.created_time || ""));
    const first = thread[0];
    const text = rt(first.rich_text);
    if (!/^@claude:/i.test(text)) continue;

    const question = text.replace(/^@claude:\s*/i, "").trim();
    const author = first.created_by?.name || first.created_by?.id || "unknown";
    const status = thread.length > 1 ? "ADDRESSED" : "NEEDS_REPLY";
    const excerpt = status === "NEEDS_REPLY" ? await pageExcerpt(pageId) : "";

    mentions.push({
      pageId, pageTitle: title, pageUrl: url,
      discussionId, commentId: first.id,
      author, question,
      createdAt: first.created_time,
      pageExcerpt: excerpt,
      status,
    });
  }
  return mentions;
}

// ── collect pages by scope ────────────────────────────────────────────────────
async function collectPages() {
  if (SCOPE === "pwaos") {
    const components = await queryAll(COMPONENTS_DB);
    const pages = [...components];
    for (const comp of components) {
      const kids = await listAll(comp.id);
      for (const k of kids.filter((b) => b.type === "child_page")) {
        try {
          pages.push(await notion.pages.retrieve({ page_id: k.id }));
        } catch (_) {}
      }
    }
    return pages;
  }

  // recent: Notion search API sorted by last_edited_time
  const out = []; let cursor;
  do {
    const r = await notion.search({
      filter: { value: "page", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 50,
      start_cursor: cursor,
    });
    let done = false;
    for (const p of r.results) {
      if (new Date(p.last_edited_time) < SINCE_DATE) { done = true; break; }
      out.push(p);
    }
    cursor = (r.has_more && !done && out.length < 50) ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

// ── --reply subcommand ────────────────────────────────────────────────────────
async function postReply() {
  const idx = argv.indexOf("--reply");
  const discussionId = argv[idx + 1];
  const text = argv[idx + 2];
  if (!discussionId || !text) {
    console.error('Usage: --reply <discussionId> "<text>"');
    process.exit(1);
  }
  await notion.comments.create({
    discussion_id: discussionId,
    rich_text: [{ type: "text", text: { content: text } }],
  });
  console.log("✅ Reply posted to discussion " + discussionId);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (argv.includes("--reply")) { await postReply(); return; }

  const pages = await collectPages();
  const allMentions = [];
  for (const page of pages) {
    allMentions.push(...(await scanPage(page)));
  }
  allMentions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const needReply = allMentions.filter((m) => m.status === "NEEDS_REPLY");
  const addressed = allMentions.filter((m) => m.status === "ADDRESSED");

  if (JSON_OUT) {
    console.log(JSON.stringify({
      scannedAt: new Date().toISOString(),
      scope: SCOPE,
      since: SINCE_STR,
      pagesScanned: pages.length,
      mentionsTotal: allMentions.length,
      mentionsNeedingReply: needReply.length,
      mentions: allMentions,
    }, null, 2));
    return;
  }

  console.log(
    `Notion @claude mention scan — ${pages.length} pages scanned, ` +
    `${needReply.length} need a reply, ${addressed.length} already addressed.\n`
  );
  for (const m of needReply) {
    console.log(`📬 ${m.pageTitle}`);
    console.log(`   by ${m.author} — "${m.question.slice(0, 100)}"`);
    console.log(`   ${m.pageUrl}\n`);
  }
  for (const m of addressed) {
    console.log(`✅ ${m.pageTitle} — "${m.question.slice(0, 60)}…" (addressed)`);
  }
  if (!allMentions.length) console.log("No @claude: mentions found.");
})().catch((e) => {
  console.error("SCAN FAILED:", e.status || "", e.code || "", e.message);
  process.exit(1);
});
```

- [ ] **Step 4: Smoke-test — scan with no expected results (verify it runs without crashing)**

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
```

Expected output (no @claude: comments exist yet): `Notion @claude mention scan — N pages scanned, 0 need a reply, 0 already addressed.`

If it errors, check: `NOTION_TOKEN set: true` from Step 2, and that `@notionhq/client` v2.3.0 has `notion.comments.list` (verify: `node -e "const {Client}=require(process.env.HOME+'/SecondBrain/tools/notion-mirror/node_modules/@notionhq/client'); console.log(typeof new Client({auth:'x'}).comments.list)"` → should print `function`).

- [ ] **Step 5: Smoke-test — add a real @claude: comment on any Notion page, then re-run**

Go to any page in your Notion workspace, add a page comment: `@claude: test mention — please ignore`. Then run:

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs --json | head -40
```

Expected: JSON with `mentionsNeedingReply: 1` and the `mentions` array containing your test comment.

- [ ] **Step 6: Smoke-test — verify --reply posts to the thread**

Copy the `discussionId` from the JSON output in Step 5. Run:

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<discussionId-from-step-5>" "✅ Test reply — this is working. — Claude (2026-06-29)"
```

Expected: `✅ Reply posted to discussion <id>`. Check the Notion page — the comment thread should now have a reply. Re-run the scan to confirm the thread is now `ADDRESSED`:

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
```

Expected: `0 need a reply, 1 already addressed.`

- [ ] **Step 7: Commit**

```bash
cd ~/SecondBrain
git add agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
git commit -m "feat(mentions): add scan_mentions.cjs — @claude comment scanner"
```

---

## Task 2: Write `SKILL.md` for standalone mode

**Files:**
- Create: `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

Create `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md`:

````markdown
# Notion @claude Mentions

Scans Notion for `@claude:` page comments and replies inline. People comment
`@claude: <question>` on any Notion page; this skill finds those threads and
posts a direct answer back into the same thread.

## When to use

Run `/notion-claude-mentions` to batch-process all pending `@claude:` mentions
in pages edited in the last 7 days. Use `--since 14d` to widen the window.

This skill is also embedded in `check-pwaos-tests` as Step 0c — it handles
mentions on PW OS pages as part of that skill's triage flow. When invoked from
there, mentions are routed into triage rather than auto-replied.

## Scanner path

```
~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs
```

---

## Step 1 — Scan

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs --json
```

Report to Justin: "X mentions need a reply, Y already addressed."
If 0 need a reply → stop.

---

## Step 2 — For each NEEDS_REPLY mention

Work through `mentions` where `status === "NEEDS_REPLY"` one at a time.

**2a. Read context**

Use `pageExcerpt` from the scan output. If it is under 100 characters, or the
question clearly needs broader page context, read the full page:

```
notion_read_page with pageId from the mention
```

**2b. Classify the mention**

- **Answerable question** — "does X work like Y?", "what should I enter here?"
- **Bug/issue report** — "X is broken", "the button doesn't respond"
- **Feedback/polish** — "this label is confusing", "could this be clearer?"
- **Unclear** — intent cannot be determined without more information

**2c. Draft a reply** (1–3 sentences, direct and internal in tone)

| Classification | Reply approach |
|---|---|
| Answerable question | Answer it directly |
| Bug report | Acknowledge + note it's been logged for the next fix cycle |
| Feedback/polish | Acknowledge + note it's been recorded |
| Unclear | Ask the one clarifying question needed to proceed |

Sign all replies: `— Claude (YYYY-MM-DD)`

**Hard stop before posting:** if the mention touches secrets, money, auth, or
a deploy decision → surface to Justin for review instead of auto-replying.

**2d. Post the reply**

```bash
node ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs \
  --reply "<discussionId>" "<your reply text>"
```

---

## Step 3 — Report

Summarize at the end:
- **Replied:** [page title] — [one-line of what was said]
- **Escalated to Justin:** [page title] — [why it was escalated]
- **Already addressed:** [count]

---

## Composability note

`check-pwaos-tests` calls this scanner directly with `--scope pwaos --json` in
its Step 0c. The mentions array is passed into Step 1 triage. No auto-reply
happens in that flow — the triage step decides the response.
````

- [ ] **Step 2: Commit**

```bash
cd ~/SecondBrain
git add agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
git commit -m "feat(mentions): add notion-claude-mentions SKILL.md"
```

---

## Task 3: Register skill + create symlink

**Files:**
- Modify: `~/SecondBrain/agents/agent-instructions/SKILLS.md`
- Create: `~/.claude/skills/notion-claude-mentions` (symlink)

- [ ] **Step 1: Add entry to SKILLS.md**

Open `~/SecondBrain/agents/agent-instructions/SKILLS.md`. Find the `## Registered Skills` section and append this entry after the last existing skill entry:

```yaml
- Skill: Notion @claude Mentions
  Path: @/Users/justinokamoto/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md
  Trigger: @claude mention in Notion, respond to Notion comment, scan Notion for Claude mentions, batch-reply to Notion questions
  Works in: Claude, Codex
  Use first: Run scan_mentions.cjs --json to find unresolved @claude: comments before any Notion MCP comment reads.
```

- [ ] **Step 2: Create the ~/.claude/skills symlink**

```bash
ln -s ~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions \
      ~/.claude/skills/notion-claude-mentions
```

Verify:

```bash
ls -la ~/.claude/skills/notion-claude-mentions
```

Expected: a symlink pointing to the SecondBrain canonical path.

- [ ] **Step 3: Commit**

```bash
cd ~/SecondBrain
git add agents/agent-instructions/SKILLS.md
git commit -m "feat(mentions): register notion-claude-mentions in SKILLS.md"
```

---

## Task 4: Update `check-pwaos-tests` SKILL.md — add Step 0c + update Step 6

**Files:**
- Modify: `~/.claude/skills/check-pwaos-tests/SKILL.md`
- Modify: `~/SecondBrain/agents/agent-instructions/skills/check-pwaos-tests/SKILL.md`

Both files are independent copies (not symlinked). Apply the same edits to both.

- [ ] **Step 1: Insert Step 0c after the Step 0b section**

In each file, find the paragraph that ends Step 0b (ends with `...so the item is simply closed.`). Insert the following block immediately after it (before `## Step 1`):

```markdown
### Step 0c — @claude mentions on PW OS pages

```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json
```

Read `mentions` where `status === "NEEDS_REPLY"`. Route each through the **Step 1
triage** below (same classification logic, same fix/needs-info/not-a-bug paths):

| Mention content | Triage route |
|---|---|
| Bug/failure description | FIX path — same as table failures; requires a `repo` on the component card |
| Question about behavior | Answer inline — post reply via `--reply <discussionId> "<answer>"` |
| Vague/unclear | needs-clarification — post a clarifying question as the reply |

After resolving: post a reply via `--reply`. The reply IS the resolution marker —
no `--mark-fixed` equivalent needed. The scanner will classify the thread `ADDRESSED`
on the next run.

`ADDRESSED` threads (already have a reply) are not re-surfaced. `NEEDS_REPLY` threads
with no resolvable `repo` → needs-info ("which component?").
```

- [ ] **Step 2: Update Step 6 to include mentions in the summary**

In each file, find the Step 6 summary line that reads:

```
Summarize per component: shipped (what was fixed + deployed-to-IONOS + health-ok) · blocked (secrets/money/Hostinger/destructive — with reason) · needs-clarification (the drafted question) · not-a-bug (proposed wording fix) · verify_failed / deploy_failed (with evidence). Note which testing rows are now awaiting retest and which pings were sent vs await approval.
```

Append to that sentence: ` · mentions replied (page title + one-line of what was answered) · mentions escalated to Justin (page title + reason)`

- [ ] **Step 3: Update the Reference table**

In each file, find the Reference table at the bottom. Add a row:

```
| Mentions scanner | `~/.claude/skills/notion-claude-mentions/scan_mentions.cjs` — `--json`; `--scope pwaos`; `--reply <discussionId> "<text>"` |
```

- [ ] **Step 4: Commit both files**

```bash
# ~/.claude copy
cd ~/.claude
git add skills/check-pwaos-tests/SKILL.md
git commit -m "feat(mentions): add Step 0c @claude mentions to check-pwaos-tests"

# SecondBrain copy
cd ~/SecondBrain
git add agents/agent-instructions/skills/check-pwaos-tests/SKILL.md
git commit -m "feat(mentions): add Step 0c @claude mentions to check-pwaos-tests"
```

---

## Task 5: End-to-end smoke test

- [ ] **Step 1: Verify standalone skill is discoverable**

```bash
ls ~/.claude/skills/notion-claude-mentions/
```

Expected: `SKILL.md  scan_mentions.cjs`

- [ ] **Step 2: Verify embedded mode (pwaos scope) runs without errors**

```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('scope:', d.scope, '| pages:', d.pagesScanned, '| mentions:', d.mentionsTotal)"
```

Expected: `scope: pwaos | pages: N | mentions: M` (no crash, valid JSON)

- [ ] **Step 3: Leave a test @claude: comment on a PW OS component page**

In Notion, open any PW OS component card. Add a page comment: `@claude: end-to-end test — does this scanner work?`

- [ ] **Step 4: Run embedded scope and confirm it picks up the comment**

```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json | \
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.mentions.filter(m=>m.status==='NEEDS_REPLY').forEach(m=>console.log(m.pageTitle,'—',m.question))"
```

Expected: prints the test comment question.

- [ ] **Step 5: Clean up — delete the test comment from Notion**

Go back to the Notion page and delete the test comment thread. No commit needed.
