# Design: PW OS Mention Action Flows
**Date:** 2026-06-30  
**Extends:** `2026-06-29-notion-claude-mentions-design.md`

## Overview

Adds two new action-driven `claude:` mention classifications to the existing PW OS mention system: a **testing-review-request** that triggers the full `check-pwaos-tests` fix→deploy flow, and a two-phase **tutorial-video** flow that writes a grounded Notion script then renders and uploads a finished video to YouTube.

Both run automatically on both surfaces:
- **`check-pwaos-tests` Step 0c** — when Justin explicitly runs the skill
- **`daily-notion-mention-fixes`** (8am scheduled) — fully automatic overnight

---

## New Classifications

Added to the existing classification table (the prior system already handled `bug`, `question`, `feedback`, `unclear`):

| Classification | Trigger text (on PW OS page) | Surface |
|---|---|---|
| `testing-review-request` | "take a look at my testing results", "check my test results", "look at the testing page", "review what I tested" — any phrase meaning "look at my testing and fix what's broken" | Both surfaces |
| `tutorial-video-request` | "ready for a tutorial video", "make a tutorial video", "tutorial video for this one", "create a tutorial for this" | Both surfaces |
| `tutorial-video-approval` | "run tutorial", "approved, run", "run the video" + component page already has a `🎬 Tutorial — ` child page | Both surfaces |

**Scope guard:** all three new classifications only apply when the page is a PW OS component page or child page (in the `--scope pwaos` set). Non-PW-OS pages that say similar things fall through to `bug`/`question`/`unclear`.

---

## Testing-Review-Request Flow

**What it does:** treats the mention as a request to run `check-pwaos-tests` for that specific component — scan the testing page, fix failures, deploy to dev, reply.

### Steps

1. **Find component** — walk the page's parent chain until a card in the Components DB (`ca702e21d5b5491b98df34ed1bbb7182`) is reached. Get the `repo` property.
   - No `repo` → post reply: "I found your comment but couldn't locate the repo for this component. Could you tag the component card?" Stop.

2. **Scan that component's testing page** — run `check-pwaos-tests` Step 0 scoped to just this component. Find the `🧪 Testing — X` page, read the failure table.
   - No failures → post reply: "@[tester] @Justin — No failures found on the testing page — looks like it's already passing! — Claude (date)" Stop.

3. **Run Steps 1–5 of check-pwaos-tests** for the found failures:
   - Step 1: triage (reproducible bug → FIX; needs-clarification → skip)
   - Step 2: branch `pwaos-fix/YYYY-MM-DD-<component>` in worktree, apply fix
   - Step 3: verify (typecheck → test → build → local repro confirmation)
   - Step 4: deploy to IONOS dev (`74.208.40.108`, `*.pwasecondbrain.uk`) — NEVER Hostinger
   - Step 5: mark rows `🔧 Fixed … awaiting retest` via `--mark-fixed`

4. **Post Notion reply** to the original `claude:` thread (replaces the WhatsApp ping for this flow):

```
@[tester] @Justin — Fixed and deployed to dev.
[One-line summary: e.g. "The Save button was missing a validation check — fixed."]
Please check at https://[app-dev-url].
Fix is on branch pwaos-fix/YYYY-MM-DD-[component] (not merged to main).
Reply here if anything looks off and I'll revert it. — Claude (YYYY-MM-DD)
```

### Hard Stops (same as check-pwaos-tests)

Secrets / `.env` / money / auth / destructive DB migrations → blocked; post reply noting the block and surfacing it in the daily report. Never auto-fix.

### Revertability

The fix stays on a named branch, never merged to main. To revert:
1. `git -C <repo> checkout main && ./deploy.sh` — redeploys from main
2. `git -C <repo> branch -D pwaos-fix/...` — removes the branch

The Notion reply explicitly names the branch so Justin can find it.

### Dev URL Mapping

| Repo | Dev URL |
|---|---|
| `va-management-next` | `https://dev-team.pwasecondbrain.uk` |
| Other apps | Their `*.pwasecondbrain.uk` hostname from the app's AGENTS.md |

---

## Tutorial Video Flow (Two-Phase)

### Phase 1 — Script (`tutorial-video-request`)

**Trigger:** "ready for a tutorial video" / "make a tutorial video" / "tutorial video for this one" on a PW OS component page.

**Steps:**

1. Find the component card in the Components DB (same parent-chain walk).
   - No component found → reply "Couldn't find a component card for this page."
2. Check for DONE Functions on the component. None → reply: "@[tester] @Justin — No DONE Functions found on this component — the script can't be grounded yet. Mark at least one function Done and try again. — Claude (date)"
3. Run `tutorial-studio` Phases A–B:
   - Ground the script in the component's DONE Functions + code
   - Write the `🎬 Tutorial — [component]` Notion child page under the component
4. Post reply in the original thread:

```
@[tester] @Justin — Script drafted — review here: [Notion script page link].
When it looks good, reply `claude: run tutorial` on this page to kick off the render. — Claude (YYYY-MM-DD)
```

This reply marks the Phase 1 thread as ADDRESSED (thread.length > 1), so it won't be re-processed.

---

### Phase 2 — Render + Upload (`tutorial-video-approval`)

**Trigger:** mention text matches "run tutorial" / "approved, run" / "run the video" AND the component page has a `🎬 Tutorial — ` child page (confirmed by calling `notion.blocks.children.list` on the component page and checking for a child page whose title starts with `🎬 Tutorial —`).

**Steps:**

1. Find the `🎬 Tutorial — [component]` Notion script page.
2. Run `tutorial-studio` Phase C+ — render the video from the Notion script → 1080p MP4.
3. Upload to YouTube (unlisted) via the `youtube-upload` tool:
   ```bash
   node ~/SecondBrain/tools/youtube-upload/upload.mjs final.mp4 \
     --title "[Component] — Tutorial" --privacy unlisted
   ```
   - YouTube auth not configured (exit code 2) → deliver the MP4 locally and note the one-time setup step; do not post a dead link.
4. Post reply:

```
@Justin @[commenter] — Video uploaded to YouTube (unlisted): [YouTube link].
Set it to public when ready. — Claude (YYYY-MM-DD)
```

**Gate:** unlisted uploads do not require Justin's explicit approval (per `app-tutorial-video` skill: "routine unlisted re-uploads of internal tutorials are fine once authorized"). Making a video public remains a manual step.

**Render failure:** post reply "Render failed — try `/tutorial-studio` manually or reply `claude: run tutorial` again tomorrow."

---

## Scanner Extension: Multiple @Mentions

The `--reply` subcommand in `scan_mentions.cjs` currently accepts one optional `authorId` for @mention. It is extended to accept multiple:

```bash
node scan_mentions.cjs --reply "<discussionId>" "<text>" <authorId1> [<authorId2> ...]
```

`JUSTIN_NOTION_USER_ID` is stored as a constant in `scan_mentions.cjs` (resolved once via `notion.users.me()` during setup). All three new reply types pass both the commenter's `authorId` and `JUSTIN_NOTION_USER_ID`.

---

## Daily Routine Security Model Change

The `daily-notion-mention-fixes` SKILL.md currently has a hard constraint: "Do NOT commit, push, or deploy anything." This is relaxed with a targeted exception:

> **Exception:** `testing-review-request` mentions on PW OS component pages — and only those — run the full `check-pwaos-tests` fix→verify→deploy flow. All other mention types remain review-only (diff + draft reply in the packet, no deployment).

The `tutorial-video-*` flows produce a Notion page + a YouTube unlisted video — no code deployment — so they do not require a security model change.

---

## Files Changed

| File | Change |
|---|---|
| `~/.claude/skills/check-pwaos-tests/SKILL.md` (+ SecondBrain hardlink) | Add `testing-review-request`, `tutorial-video-request`, `tutorial-video-approval` to Step 0c routing table; describe fix flow + reply |
| `~/.claude/scheduled-tasks/daily-notion-mention-fixes/SKILL.md` | Add three new classifications to Step 2; add targeted deploy exception for `testing-review-request`; add tutorial phases |
| `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/scan_mentions.cjs` | Extend `--reply` to accept multiple authorIds; add `JUSTIN_NOTION_USER_ID` constant |
| `~/SecondBrain/agents/agent-instructions/skills/notion-claude-mentions/SKILL.md` (+ symlink) | Update composability note to mention the new action flows |

No changes to `scan_pwaos_tests.cjs` — the fix flow drives it via the existing `--json` interface.

---

## Constraints Summary (non-negotiable)

- Deploy ONLY to IONOS dev (`74.208.40.108`, `*.pwasecondbrain.uk`). NEVER Hostinger / public production.
- Fix branch is never merged to main. Name format: `pwaos-fix/YYYY-MM-DD-<component>`.
- Verify must be green before deploy. Fail → needs-info, not deploy.
- Hard stops: secrets / `.env` / money / auth / destructive DB migrations → blocked, surfaced, never auto-fixed.
- YouTube uploads are always unlisted. Making a video public is a manual step.
- `JUSTIN_NOTION_USER_ID` is included in every reply (Phase 1, Phase 2, testing-review).
