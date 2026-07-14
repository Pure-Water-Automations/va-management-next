# Tutorial Script Generator

Generate a tutorial video script for a feature or view in this codebase and create it as a Notion task assigned to a team member.

## Usage

```
/tutorial-script <feature> [assignee]
```

- `<feature>` — The feature or view to write a script for (e.g. "VA view", "HR dashboard", "task detail page")
- `[assignee]` — Optional. Name of the team member to assign the Notion task to (default: Eunmi)

## Steps

1. **Explore the codebase** to understand the feature:
   - Find all relevant page components, routes, and actions under `src/app/(app)/`
   - Note every screen, tab, form, button, and data point the user interacts with
   - Understand the user role required to access the feature

2. **Fetch the script template** from Notion:
   - URL: `https://www.notion.so/Tutorial-Video-Script-Template-366063b66bf181c89234d83e1314f97c`
   - Use `mcp__Notion__notion-fetch` to retrieve it
   - Follow the exact section structure from the template

3. **Look up the assignee** in Notion:
   - Use `mcp__Notion__notion-get-users` to list workspace users
   - Match by first name (case-insensitive) to get the user ID

4. **Write the script** following the template structure:
   - **Project** — project name, intended audience, estimated length (8–12 min), related web app, version
   - **Prerequisites** — account/role needed, app URL, demo account requirements, what NOT to show
   - **Video Goal** — bullet list of what the viewer can do after watching
   - **Script** — all 7 PARTS with `🎥 ON SCREEN:` and `🗣️ NARRATION:` blocks for each step:
     - PART 1 — OPENING
     - PART 2 — WHAT THIS TOOL DOES
     - PART 3 — BEFORE YOU START
     - PART 4 — MAIN WORKFLOW (one sub-section per major screen/flow)
     - PART 5 — CONFIRM RESULTS
     - PART 6 — COMMON ISSUES (at least 3 real issues a new user would hit)
     - PART 7 — WRAP UP
   - **Safety Notes** — no real user data, use demo account, blur sensitive fields
   - **Video Creation Task Notes** — checklist for the recorder (script link, app URL, audience, length, account, avoid list, deadline)

   Write narration as complete, conversational sentences. Each ON SCREEN direction should be specific about what to click, scroll to, or demonstrate.

5. **Create the Notion task** in the Northeast Tasks database:
   - Data source ID: `26a063b6-6bf1-82a6-b114-870456455cc2`
   - Use `mcp__Notion__notion-create-pages`
   - Properties:
     - `Task name`: `Record Tutorial Video — <Feature Name>`
     - `Assignee`: JSON array with the resolved user ID
     - `Status`: `Not started`
     - `Priority`: `Medium`
     - `Summary`: One sentence describing what to record
   - `content`: The full script in Notion-flavored Markdown

6. **Report back** with:
   - The Notion task URL
   - Assignee name confirmed
   - Estimated video length
   - A one-line summary of what the script covers
