# Connect the VA Console to ChatGPT

This lets you create and manage projects & tasks in the VA Management Console straight from ChatGPT — "make a project for Client X", "assign this task to Aira", "what's on the marketing project". Everything you do is recorded in the console as **you**.

**Endpoint:** `https://team.purewaterautomations.com/api/mcp/delegate`

---

## Before you start

1. **You need ChatGPT Plus, Pro, or Business.** Custom connectors aren't available on the free plan.
2. **Your console account must be able to delegate.** Managers (HR Manager / People Ops / Team Lead) always can. VAs can if their tier has delegation turned on (Tier 3 / Tier 4 by default). If your account can't delegate, the connection still works but the tools will say "not authorized" — ask an admin to enable it.
3. **Turn on Developer Mode** (one time): ChatGPT → **Settings → Connectors → Advanced → Developer mode** (on Business plans an admin enables it under workspace settings).

---

## Setup (recommended: log in, no token to copy)

1. In ChatGPT, open **Settings → Connectors → Create / Add custom connector** (the "New App" dialog).
2. Fill in:
   - **Name:** `VA Console`
   - **Server URL:** `https://team.purewaterautomations.com/api/mcp/delegate`
   - **Authentication:** **OAuth**
3. Check **"I understand and want to continue"**, then **Create**.
4. ChatGPT opens a login window. **Sign in with your Google account** (the one tied to your VA Console login).
5. On the **"Connect VA Console?"** screen, click **Allow access**.

Done. ChatGPT now shows the connector's tools. Test it: ask *"list my VA projects."*

---

## Alternative: connect with a token

Use this if OAuth gives you trouble, or for a shared/service connector.

1. An admin mints a token: VA Console → **Admin → Delegation MCP** (`/admin/mcp-tokens`) → pick the person → **Mint token** → copy the `vam_…` value (shown **once**).
2. In the ChatGPT "New App" dialog:
   - **Server URL:** `https://team.purewaterautomations.com/api/mcp/delegate`
   - **Authentication:** **Access token / API key**
   - **Header scheme:** **Bearer**
   - **Token:** paste the `vam_…` value
3. Check the box, **Create**.

The token acts as whoever it was minted for. Treat it like a password; an admin can revoke it on the same page if it leaks.

---

## What you can do with it

`list_projects`, `create_project`, `list_tasks`, `create_task`, `get_task`, `update_task_status`, `update_task`, `reassign_task`, `add_task_comment`, `list_assignees` — and more depending on your role. It cannot touch deals, payroll, or client agreements from this endpoint.

## Troubleshooting

- **"Couldn't register…"** — make sure the URL is exactly `https://team.purewaterautomations.com/api/mcp/delegate` (no trailing slash) and Developer Mode is on. Try again.
- **Tools return "not authorized"** — your account doesn't have delegation authority yet. Ask an admin to enable your tier's delegation on the Compensation Roles screen.
- **Nothing happens / can't sign in** — you must sign in with the Google account that matches your VA Console account.
