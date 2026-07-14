# create-testing-page Anywhere — Design

## Goal

Extend the `create-testing-page` classification so it works on any Notion page, not just PW OS components — the concrete need surfaced when Justin commented "create a testing page for this one" on Ask True Parents (a Projects DB page, not a PW OS component) and the system correctly, but unhelpfully, drafted a reply instead of building one.

## Background

- Today, `create-testing-page` is one of four "PW-OS-only" classifications in `daily-notion-mention-fixes/SKILL.md`. On a non-PW-OS page, the same trigger phrase falls through to `unclear` and only drafts a reply.
- The existing PW-OS flow (`daily-notion-mention-fixes` Step 2e) creates a **separate child page** titled "🧪 Testing — [component]", using the component's `Functions` relation property to know which functions are DONE.
- **No Notion tool is available to create a standalone child page** (confirmed by testing — only database items, whole databases, and comments can be created directly). This is a hard mechanism constraint, not a design preference: the any-page version has to append content to the existing page instead of creating a new one.
- Pages outside PW OS have no `Functions`-relation property to query, so "what's testable" has to be derived from the page's own content and, if linked, the app's repo docs — not looked up structurally.

## Scope decision (confirmed with Justin)

- **Only `create-testing-page` is being expanded.** The other three PW-OS-only flows — `testing-review-request` (fix→verify→deploy) and the two tutorial-video flows — stay PW-OS-gated. `testing-review-request` in particular means auto-fixing and deploying code for whatever repo is linked; extending that to any page in the workspace is a materially bigger trust decision than an additive testing checklist, and is deliberately out of scope here.
- **No author check.** `create-testing-page` executes for anyone who asks, on any non-excluded page, matching the existing PW-OS behavior (which also has no author check today). This differs from `page-edit-request`, which is gated to Justin's own account — that's an intentional difference, not an inconsistency: `page-edit-request` covers open-ended edits to arbitrary existing content, while `create-testing-page` only ever appends one clearly-scoped, always-additive section.

## Classification change

`create-testing-page`'s trigger phrases are unchanged: "create a testing page," "make a testing page," "set up testing," "add a testing page." What changes is the action, which now branches on where the page lives:

1. **Excluded page** (same exclusion list as `page-edit-request`: Northeast Scoreboard / member finance-or-points pages, PWA-HR DOCS, QuickBooks Notion mirrors, anything titled/parented with "payroll," "salary," "compensation," or "agreement") → draft-only, no exceptions, regardless of who asked.
2. **PW OS Components DB or subtree** → existing flow, byte-for-byte unchanged (separate child page, `Functions`-relation lookup).
3. **Anywhere else** → the new flow below.

## New any-page flow

1. Check the page's own content (not a separate child page — there isn't one) for an existing heading starting with "🧪 Testing —". Found → reply with a pointer to it, stop. No duplicate sections.
2. Derive testable functions from whatever grounding actually exists:
   - The page's own description/content (what it says is live, shipped, or in beta).
   - If the page links to a GitHub repo, that repo's README/AGENTS.md for a more authoritative "what's actually built" signal — this is exactly how the Ask True Parents testing section was built manually: the Notion page said what was live, and the repo's AGENTS.md confirmed and filled in detail (semantic search, Google-gated AI Ask mode, World Religions comparison, FAQ widget, feature requests, admin dashboard).
   - Use whichever of these exists; don't require both. A page with no repo but a clear description is still gradeable.
3. **Not enough to go on** (no repo, and the page's own content is too thin or vague to name specific functions) → don't fabricate a table. Draft a reply asking what should be tracked, consistent with the existing "needs-info" pattern used elsewhere in this skill.
4. Otherwise, append a section directly onto the page via `mcp__notion__notion_append_block_children`:
   - A divider
   - A `heading_2`: "🧪 Testing — [page name]"
   - A short paragraph noting this was built by the automated flow and what it's grounded in (page content, and/or the linked repo)
   - A `Function | What should happen | Result` table, one row per derived function, `Result` left blank for the tester to fill in
5. Reply with a pointer to the new section and both @mentions (commenter + `JUSTIN_NOTION_USER_ID`), same as every other flow in this skill.

## Mechanics

- Lives entirely in `daily-notion-mention-fixes/SKILL.md`'s existing Step 2e, which gets retitled (dropping "PW OS only" from its header) and restructured into the three-way branch above. The existing PW-OS sub-steps move under branch 2, unchanged.
- `notion-claude-mentions/SKILL.md` gets the same update for parity, same as the `page-edit-request` work.
- The "four PW-OS-only classifications" callout paragraph in both files becomes "three" (`testing-review-request`, `tutorial-video-request`, `tutorial-video-approval`), since `create-testing-page` no longer belongs in that group.
- No scanner changes (`scan_mentions.cjs` already scans workspace-wide).

## Testing

- Re-verify the existing PW-OS flow is untouched: trigger `create-testing-page` on a PW-OS component that doesn't already have a testing child page, confirm it still creates a separate child page exactly as before.
- Trigger on a non-PW-OS page with a linked repo and real content (a fresh one — Ask True Parents already has its testing section now) — confirm functions are derived from both the page and the repo, and the section is appended correctly with no duplicate.
- Trigger a second time on the same page — confirm it detects the existing "🧪 Testing —" heading and replies with a pointer instead of duplicating.
- Trigger on a thin page with no repo and minimal content — confirm it drafts a request for clarification instead of fabricating a table.
- Trigger on an excluded-list page — confirm it drafts regardless of content quality (exclusion is checked first, before any grounding attempt).

## Out of scope

- `testing-review-request` and the two tutorial-video flows remain PW-OS-only — not touched by this change.
- No author/identity gating for `create-testing-page` — intentionally matches existing behavior.
- Not retrofitting PW-OS's own create-testing-page mechanism to use append-to-page — its separate-child-page structure is a real dependency of `check-pwaos-tests`' `testing-review-request` flow and isn't broken, so it isn't touched.
