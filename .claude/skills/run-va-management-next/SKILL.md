---
name: run-va-management-next
description: Run, start, launch, screenshot, smoke-test, or verify the va-management-next Next.js web app locally. Use when asked to start the app, check a route works, or confirm a change behaves correctly in the running server.
---

# run-va-management-next

Next.js 15 + Postgres web app (VA management console). Runs on port **3032**.
The driver is `smoke.sh` — a curl-based route checker. It starts the dev server
if needed and hits every major route. For interactive inspection, open
`http://localhost:3032/hr` after starting the server; `DEV_AUTH_EMAIL` in `.env`
bypasses OAuth so no real login is required.

---

## Prerequisites

PostgreSQL 16 must be running:

```bash
sudo pg_ctlcluster 16 main start 2>/dev/null || true
sudo -u postgres psql -c "SELECT 1;" > /dev/null 2>&1 && echo "pg ok"
```

Node 22 is the runtime (already present in this container).

---

## One-time setup (clean machine)

Run these in order from the repo root:

```bash
# 1. Create DB + user
sudo -u postgres psql -c "CREATE USER va_console WITH PASSWORD 'devpassword';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE va_console OWNER va_console;" 2>/dev/null || true

# 2. Install npm deps (skip postinstall — Prisma engine download fails via postinstall)
npm install --ignore-scripts

# 3. Download Prisma engine binaries directly via curl
#    (Prisma's fetch-engine hits the CDN with Node's https module which gets ECONNRESET
#     in this container; curl via the env proxy works fine.)
ENGINE_VERSION="605197351a3c8bdd595af2d2a9bc3025bca48ea2"
PLATFORM="debian-openssl-3.0.x"
ENGINE_DIR="node_modules/@prisma/engines"
curl -sS "https://binaries.prisma.sh/all_commits/${ENGINE_VERSION}/${PLATFORM}/libquery_engine.so.node.gz" \
  | gunzip > "${ENGINE_DIR}/libquery_engine-${PLATFORM}.so.node"
chmod +x "${ENGINE_DIR}/libquery_engine-${PLATFORM}.so.node"
curl -sS "https://binaries.prisma.sh/all_commits/${ENGINE_VERSION}/${PLATFORM}/schema-engine.gz" \
  | gunzip > "${ENGINE_DIR}/schema-engine-${PLATFORM}"
chmod +x "${ENGINE_DIR}/schema-engine-${PLATFORM}"

# 4. Generate Prisma client
export PRISMA_QUERY_ENGINE_LIBRARY="$(pwd)/${ENGINE_DIR}/libquery_engine-${PLATFORM}.so.node"
export PRISMA_SCHEMA_ENGINE_BINARY="$(pwd)/${ENGINE_DIR}/schema-engine-${PLATFORM}"
npx prisma generate

# 5. Write .env
cat > .env << 'EOF'
DATABASE_URL="postgresql://va_console:devpassword@localhost:5432/va_console"
APP_BASE_URL="http://localhost:3032"
DEV_AUTH_EMAIL="okamotomiak@gmail.com"
NEXTAUTH_SECRET="dev-secret-not-for-production-change-this"
NEXTAUTH_URL="http://localhost:3032"
GOOGLE_SERVICE_ACCOUNT_JSON=""
GOOGLE_SERVICE_ACCOUNT_FILE=""
SOURCE_SHEET_ID=""
MIRROR_SHEET_ID=""
APPLICATION_RESPONSES_SHEET_ID=""
APPLICATION_RESPONSES_TAB="Form Responses 1"
EXTERNAL_APP_SECRET=""
GOOGLE_WORKSPACE_TOKEN_FILE=""
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
EOF

# 6. Migrate + seed
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 7. Make dev user an admin (so all console views are accessible)
sudo -u postgres psql va_console -c \
  "UPDATE \"User\" SET \"isAdmin\" = true WHERE email = 'okamotomiak@gmail.com';"
```

After this the setup is permanent for the container — subsequent runs only need the server start.

---

## Run (agent path)

```bash
bash .claude/skills/run-va-management-next/smoke.sh
```

The script:
1. Starts the dev server (`npm run dev` on port 3032) if not already running
2. Hits every major route with curl and prints `PASS`/`FAIL`
3. Exits 0 if all pass

Key routes and expected responses:

| Route | Expected |
|---|---|
| `GET /` | 307 → `/hr` |
| `GET /hr` | 200 (HR dashboard, seeded admin) |
| `GET /va` | 200 (VA console) |
| `GET /payroll` | 200 |
| `GET /recruitment` | 200 |
| `GET /apply` | 200 (public — no login) |
| `GET /login` | 200 |
| `GET /api/health` | 200 `{"ok":true}` |

---

## Run (human / interactive path)

```bash
export PRISMA_QUERY_ENGINE_LIBRARY="$(pwd)/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
npm run dev
```

Then open `http://localhost:3032`. The `DEV_AUTH_EMAIL` bypass logs you in as
`okamotomiak@gmail.com` (admin/HR_MANAGER) automatically — no Google OAuth needed.
Press `Ctrl-C` to stop.

---

## Test suite

```bash
export PRISMA_QUERY_ENGINE_LIBRARY="$(pwd)/node_modules/@prisma/engines/libquery_engine-debian-openssl-3.0.x.so.node"
npm test
```

---

## Gotchas

**Prisma engine download fails during `npm install`.**
The `@prisma/engines` postinstall script uses Node's native `https` module, which gets
`ECONNRESET` against binaries.prisma.sh in this container. `curl` (which uses the
`HTTPS_PROXY` env var) works fine. Always install with `--ignore-scripts`, then
download the two binaries with curl as shown in step 3 above.

**Prisma CDN returns 404 for HEAD requests, 200 for GET.**
Early diagnosis attempts using `curl -I` showed 404 and led to thinking the version
hash was wrong. The files are real — use `curl` (not `curl -I`) to verify or fetch.

**`NEXTAUTH_SECRET` is required even in dev.**
The env schema validates it strictly. Without it the app renders a 500 on every
route. Add it to `.env` before starting the server.

**`isAdmin` is not set by the seed.**
`prisma/seed.ts` creates `okamotomiak@gmail.com` as `HR_MANAGER` with `isAdmin=false`.
Without the `UPDATE` in step 7, the admin bar and view-switcher won't appear, and
several routes redirect or show limited data.

**`PRISMA_QUERY_ENGINE_LIBRARY` must be set at runtime too.**
It's needed for `prisma generate`, `prisma migrate deploy`, and `npm run dev`.
The simplest approach is `export` it in the shell before running any of these.

---

## Troubleshooting

**`ZodError: NEXTAUTH_SECRET Required`** — add `NEXTAUTH_SECRET` to `.env`.

**`Error: No active VA Management account for <email>`** — the `DEV_AUTH_EMAIL`
in `.env` doesn't match any row in the `User` table. Re-run `npx tsx prisma/seed.ts`.

**`Cannot find module '.prisma/client/default'`** — Prisma client not generated.
Run `npx prisma generate` (with `PRISMA_QUERY_ENGINE_LIBRARY` exported).

**`ECONNRESET` from Prisma postinstall** — expected; use `--ignore-scripts` and
download the binaries with curl as documented above.

**Port 3032 already in use** — `kill $(lsof -ti:3032)`.
