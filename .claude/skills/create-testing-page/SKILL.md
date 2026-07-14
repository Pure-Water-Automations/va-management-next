---
name: create-testing-page
description: Create a usability testing page for a Pure Water OS component in Notion. Use when asked to build a test plan, testing checklist, or testing page for a component. Reads the component's Notion page, checks which Functions are Done vs not, reads the linked GitHub repo to understand actual behaviour, then creates a child page titled "🧪 Testing — [component name]" under the component page.
---

# create-testing-page

Creates a structured usability-test page as a **child of a Pure Water OS component page** in Notion.
Uses the Notion MCP to read and write, and the GitHub MCP to read the repo.
No driver script — both MCPs are the tools.

---

## Process

### 1. Read the component page

```
mcp__Notion__notion-fetch  id="<component page URL or ID>"
```

From the result collect:
- The page title (component name)
- The `Functions` property — array of page URLs
- The `GitHub repo` property — the repo URL
- The page ID (used later as `parent`)

### 2. Get the Functions database schema

The `Functions` property links to individual function pages, but the component
also has an **inline Functions database**. Find it two ways:

a. The page content contains a `<database>` tag — fetch that URL:
   ```
   mcp__Notion__notion-fetch  id="<database URL from content>"
   ```
   This returns the data source URL in the form `collection://<uuid>`.

b. Or use the Functions property page URLs directly — fetch one to see its `Done` checkbox.

### 3. Query which functions are Done

```
mcp__Notion__notion-query-data-sources
  data_source_urls: ["collection://<uuid>"]
  query: >
    SELECT "Function", "Done", "Order"
    FROM "collection://<uuid>"
    WHERE "Component" LIKE '%<component-page-id>%'
    ORDER BY "Order" ASC
```

Split results into **DONE** (Done = `__YES__`) and **NOT DONE** (Done = `__NO__` or null).

### 4. Read the GitHub repo

```
mcp__github__get_file_contents  owner="<org>"  repo="<repo>"  path="/"
mcp__github__get_file_contents  owner="<org>"  repo="<repo>"  path="src/app"
```

For each DONE function, read the relevant route page(s) to understand what actually
happens when a user tries it. Focus on `src/app/(app)/` routes and public routes
(`/apply`, `/sign`, etc.). Read enough to write a one-sentence "what should happen"
for each row — no guessing.

### 5. Create the child page

```
mcp__Notion__notion-create-pages
  parent: { type: "page_id", page_id: "<component-page-id>" }
  pages:
    - icon: "🧪"
      properties:
        title: "🧪 Testing — <Component Name>"
      content: "<markdown — see template below>"
```

**Important:** `parent` is a top-level argument to `notion-create-pages`, NOT
inside the `pages` array — putting it inside causes an `unrecognized_keys` error.

---

## Page content template

Use standard markdown — Notion renders `| col | col |` as a real table.

```markdown
## Setup

| | |
|---|---|
| **URL** | <live URL of the app> |
| **Login** | <how to get in — Google OAuth, allow-list, etc.> |
| **Role needed** | <which role sees all features> |
| **Test data** | <what's already seeded / what the tester needs to create> |

---

## Function checklist

<N> functions are **DONE**. <M> are not ready to test yet (listed at the bottom).

| Function | What should happen when you try it | Result |
|---|---|---|
| **1. <Function name>** | <one sentence from reading the code — exact route/UI action + expected outcome> | |
| **2. ...** | ... | |

### Not ready to test yet

- **<Function name>** — <why: not built, no UI, infrastructure-only, confirm with Justin>

---

## Overall questions

1. **Does it work?** — Did the app behave as expected, or were there broken screens / errors?
2. **Does it look good?** — Does the design feel clean and easy to read?
3. **Is it easy to use?** — Could you figure out where to go and what to do without help?
4. **One change?** — If you could change one thing, what would it be?

---

*Tested by: _______________   Date: _______________*
```

---

## Rules for the checklist rows

- **Only describe what's in the code.** Do not invent features.
- One sentence per row. Start with an action verb: "Open…", "Go to…", "Fill in…"
- If a step requires an admin or specific role, say so inline.
- If a function has no in-app UI (e.g. a background worker, infrastructure cutover),
  mark it "Not ready to test yet" and explain why.
- If a URL or piece of test data is unknown, write "confirm with Justin" rather than guessing.

---

## Gotchas

**`parent` must be top-level, not inside `pages`.**
This call errors with `unrecognized_keys`:
```json
{ "pages": [{ "parent": {...}, "content": "..." }] }   ← WRONG
```
Correct shape:
```json
{ "parent": {...}, "pages": [{ "content": "..." }] }   ← RIGHT
```

**Functions database is a linked/synced source, not the component's own database.**
The `Functions` property on a component page contains links to individual pages in
a *shared* Functions database (Pure Water OS — Functions). To query it, fetch the
inline database embedded in the page content — its `<data-source url>` gives the
`collection://` ID to use in the SQL query.

**The `Component` column is a relation stored as a JSON array of page URLs.**
Filter with `WHERE "Component" LIKE '%<page-id>%'` (the ID without dashes works).
