# Notion @claude Mentions Skill — Design Spec

**Date:** 2026-06-29  
**Status:** Approved  

---

## Overview

A composable skill that scans Notion for `@claude:` comments, responds to them inline, and can be embedded in other skills (starting with `check-pwaos-tests`) to surface mentions as a triage input.

---

## Architecture

Two files, one canonical location:

```
~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/
  SKILL.md          — agent-driving skill (standalone mode)
  scan_mentions.cjs — CLI scanner (shared by both modes)
```

Symlinked into `~/.claude/skills/notion-claude-mentions/` per the shared-skills convention.

### Two modes, one scanner

| Mode | Invoked by | Scope | Output |
|---|---|---|---|
| Standalone | `/notion-claude-mentions` skill | `--scope recent` (default) | Agent reads mentions, replies inline in Notion |
| Embedded | `check-pwaos-tests` Step 0c | `--scope pwaos` | JSON handed to that skill's triage flow |

### Resolution detection

No separate "mark resolved" step. A thread is `ADDRESSED` if the `@claude:` comment has any subsequent reply in the same Notion discussion thread. When Claude posts a reply, that reply IS the resolution marker. Future scans see the reply and skip the thread automatically.

---

## Scanner (`scan_mentions.cjs`)

### CLI interface

```
node scan_mentions.cjs [--json] [--scope recent|pwaos] [--since Nd] [--reply <discussionId> "<text>"]
```

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Machine-readable output for consuming skills |
| `--scope recent` | ✓ | Notion search API, sorted by `last_edited_time`, last 7 days, top 50 pages |
| `--scope pwaos` | — | PW OS Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) + each component's child pages |
| `--since Nd` | `7d` | Override recency window for `--scope recent` |
| `--reply <discussionId> "<text>"` | — | Post a reply to a discussion thread |

### Comment scanning strategy

For each page in scope, calls `GET /v1/comments?block_id=<pageId>`. Groups results by `discussion_id`. Finds threads where the earliest comment contains `@claude:` (case-insensitive).

- Thread has no subsequent reply → `NEEDS_REPLY`
- Thread has ≥1 subsequent reply → `ADDRESSED` (skipped)

Block-level inline comments (on specific blocks within the page) are deferred — accessible via a future `--deep` flag. Page-level comments cover the primary use case.

### JSON output shape (per mention)

```json
{
  "pageId": "...",
  "pageTitle": "...",
  "pageUrl": "...",
  "discussionId": "...",
  "author": "Riza",
  "question": "should this button save immediately or wait for submit?",
  "createdAt": "2026-06-28T10:00:00.000Z",
  "pageExcerpt": "...first 600 chars of page content for context...",
  "status": "NEEDS_REPLY"
}
```

### Top-level JSON envelope

```json
{
  "scannedAt": "...",
  "scope": "recent",
  "pagesScanned": 42,
  "mentionsTotal": 5,
  "mentionsNeedingReply": 3,
  "mentions": [...]
}
```

---

## Standalone SKILL.md — agent flow

Steps when `/notion-claude-mentions` is invoked:

1. **Scan** — run `scan_mentions.cjs --json`, report count (`X mentions need a reply, Y already addressed`)
2. **For each `NEEDS_REPLY` mention:**
   - Read `pageExcerpt` for context; call `notion_read_page` if more context is needed
   - Classify: **answerable question** · **bug/issue report** · **feedback/polish** · **unclear**
   - Draft a reply (1–3 sentences, direct and brief)
   - **Auto-post** via `--reply <discussionId> "<text>"` — no Justin gate required (internal Notion workspace)
   - **Exception:** if the mention touches secrets, money, auth, or a deploy decision → surface to Justin instead of auto-replying
3. **Report** — list what was replied to, what was escalated to Justin, what was already addressed

**Reply tone:** direct and brief. Sign replies with `— Claude (<date>)` so authorship is clear.

---

## `check-pwaos-tests` integration — Step 0c

Inserted between current Step 0b (free-form reports) and Step 1 (triage).

### Step 0c — @claude mentions on PW OS pages

```bash
node ~/.claude/skills/notion-claude-mentions/scan_mentions.cjs --scope pwaos --json
```

Results are routed into the existing Step 1 triage — no new triage logic, just a new input source:

| Mention type | Triage route |
|---|---|
| Bug/failure description | FIX path — same as table failures; needs a `repo` from the component card |
| Question about behavior | Answer inline — post reply via `--reply`, no deploy needed |
| Vague/unclear | needs-clarification — post a clarifying question as the reply |

After resolving, the reply IS the resolution marker. No `--mark-fixed` equivalent needed. The scanner classifies the thread `ADDRESSED` on the next run.

### Changes to `check-pwaos-tests` SKILL.md

- Add Step 0c paragraph under Step 0 (after Step 0b)
- Add a "mentions" row to the Step 6 report summary

---

## Implementation order

1. `scan_mentions.cjs` — core scanner + `--reply` subcommand
2. `notion-claude-mentions` SKILL.md — standalone agent flow
3. Register skill in `~/SecondBrain/agents/agent-instructions/SKILLS.md` and symlink canonical folder to `~/.claude/skills/notion-claude-mentions`
4. Update `check-pwaos-tests` SKILL.md — add Step 0c + Step 6 mention row
5. Smoke-test standalone mode against a real `@claude:` comment
6. Smoke-test embedded mode via `check-pwaos-tests` scan

---

## Constraints and non-goals

- **Read scope:** page-level comments only for MVP; block-level inline comments deferred to `--deep` flag
- **No Notion bot user** — replies post as the integration's service account (the same token used by `scan_pwaos_tests.cjs`)
- **No auto-fix from mentions** — bug mentions in `check-pwaos-tests` flow enter triage; they don't bypass the triage gate
- **Not a real-time webhook** — batch scan on skill invocation only; no push notifications
