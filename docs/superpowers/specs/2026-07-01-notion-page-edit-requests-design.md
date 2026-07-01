# Notion Page-Edit Requests — Design

## Goal

Extend the existing `claude:` mention pipeline — currently PW-OS-scoped for any live action — so Justin can ask for small, concrete edits to **any** of his Notion pages (e.g. "claude: add the link to ministry OS to this page") and have safe, reversible edits applied automatically within the existing 30-minute automated cycle. Anything ambiguous, destructive, or requested by someone other than Justin gets staged as a draft for his review instead, exactly like the system already does for general questions today.

## Background

- `scan_mentions.cjs --scope recent` (the default, used by the automated `daily-notion-mention-fixes` routine) already scans all recently-edited pages workspace-wide, not just PW OS. Detection is already broad — nothing to change there.
- Classification currently has 8 routes: `bug`, `question`, `feedback`, `unclear` (draft-only, any page) plus 4 PW-OS-only live-action routes (`testing-review-request`, `tutorial-video-request`, `tutorial-video-approval`, `create-testing-page`).
- None of the 8 existing routes performs a live edit to arbitrary page content. This design adds exactly one new route: `page-edit-request`.

## New classification: `page-edit-request`

Trigger: the comment names one concrete, small edit to make to the page it's on — "add the link to X," "add a checklist item for Y," "add a row for Z," "check off this box," "tag this with W." Distinct from `question`/`feedback` (which ask about or comment on the page without requesting a specific edit) and from `bug` (which reports broken code/behavior, not a content edit).

On a PW-OS page, the 4 existing special routes are still checked first; `page-edit-request` is the fallback there too, if none of those trigger phrases match.

## Scope: which pages

Any page in the workspace is eligible, **except** pages under an exclusion list, checked before any live edit is attempted. Proposed starting list (confirm/edit before this ships):

- Any database or page under "Northeast Scoreboard," or otherwise tracking member finance/blessing-point data
- "PWA-HR DOCS" and other personnel/HR pages
- Any Notion mirror of QuickBooks/financial data, if one exists
- Any page whose title or parent database name contains "payroll," "salary," "compensation," or "agreement"

Excluded pages still get scanned and can still receive a `page-edit-request` classification — it just always resolves to draft-only there, regardless of who commented.

## Safety: which edits execute live vs. draft-only

A whitelist of safe, additive, reversible edit types may execute live:

- Add a link/URL (inline text, a bookmark block, or a URL-type property)
- Add a bullet or to-do item to an existing list
- Add a row to an existing table or database (inferring property values from the comment/page context)
- Check/tick an existing checkbox, or set a value on an existing single/multi-select property
- Append a note (already covered by the existing reply mechanism)

Everything else stays draft-only — a description of the proposed edit is staged in the review packet, per the existing Step 4/5 convention. This explicitly includes:

- Deleting or replacing existing content
- Rewriting or restructuring a section
- Changing a database's schema (adding/removing properties)
- Moving or deleting pages
- Editing any property whose name matches a sensitive-value heuristic (`/points|score|balance|amount|\$|payment/i`) — a defense-in-depth backstop independent of the exclusion list above, since a sensitive property can appear on a page nobody thought to exclude yet

**Why this is safe despite being judgment-driven, not code-enforced:** the whitelist itself is bounded to additive-only operations. Even if the model misjudges whether a specific request "counts" as one of the five safe patterns, the worst case is an unwanted addition (a stray link, an extra row) — never data loss, never a rewrite, never a structural change — because those categories are excluded from the whitelist entirely, not just discouraged.

## Safety: who can trigger a live edit

- If the commenter's `authorId` is Justin's (`18cd872b-594c-8133-bc0b-0002af1e69cd`) **and** the request matches the safe whitelist **and** the page isn't excluded → execute live, then reply confirming what was added.
- Otherwise (different commenter, OR request doesn't match the whitelist, OR page is excluded) → draft-only, staged in the review packet like `question`/`feedback` today, with a reply noting a draft is pending Justin's review.

## Mechanics

- No changes to `scan_mentions.cjs`'s scan step (already workspace-wide). The `--reply` mechanism is reused unchanged.
- New Step 2f in `daily-notion-mention-fixes/SKILL.md`:
  1. Check the exclusion list for the page.
  2. Match the request against the safe-edit whitelist.
  3. Check `authorId` against `JUSTIN_NOTION_USER_ID`.
  4. All three pass → apply the edit via the appropriate Notion MCP tool (`notion_append_block_children` for content, `notion_update_page_properties` for property/database-row edits), then post a confirmation reply describing what changed.
  5. Otherwise → draft the proposed edit + reply text, stage in the packet (Step 5), do not apply.
- Every live edit (not just drafts) is logged in the daily packet for after-the-fact audit, matching how the PW-OS action flows already report what they did.
- `notion-claude-mentions/SKILL.md` (the on-demand skill Justin runs himself) gets the same new classification for parity — lower-stakes there since Justin is watching in real time, but the behavior stays consistent either way.

## Testing

- Post a test comment as Justin's own account — "claude: add a link to https://example.com to this page" — on a safe, non-excluded test page. Confirm: classified `page-edit-request`, matches the whitelist, executes live, confirmation reply posts.
- Post a comment requesting a non-whitelisted edit ("claude: delete the second paragraph"). Confirm it drafts instead of executing.
- Post a comment on an excluded-list page requesting a whitelisted edit, as Justin. Confirm it still drafts (exclusion overrides author check).
- Reasoning-check only (can't fully live-test without a second real Notion account): a whitelisted request from a different `authorId` on a non-PW-OS page routes to draft-only per the skill instructions.

## Out of scope

- Not extending the 4 PW-OS-specific action flows (deploy, tutorial, testing-page) to non-PW-OS pages — those stay PW-OS-only, unchanged.
- Not giving the model open-ended/unrestricted Notion write access — every live edit must match the whitelist.
- Not building tooling to manage the exclusion list — it's a short, hand-maintained list in the skill file, edited the same way other constants in this system already are (e.g. `COMPONENTS_DB`).
