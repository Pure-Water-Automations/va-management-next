# Whiteboard — Miro-parity build HANDOFF

Continue building Miro-parity controls into the project **Whiteboard** feature. This
doc is self-contained: it has what's done, what remains (with implementation-ready
specs), the exact build/verify/deploy loop, and the gotchas. Work on branch
**`integration/hub-whiteboard`**.

## Where everything lives
- Editor (all canvas logic + rendering): `src/components/whiteboard/WhiteboardEditor.tsx`
  (a React **class** component `WhiteboardCanvas`, wrapped by `WhiteboardEditor` for the router).
- Styles: `src/components/whiteboard/whiteboard.css` (scoped under `.wb-root`).
- Templates: `src/lib/whiteboards/templates.ts`. Realtime hub: `src/lib/realtime/boardHub.ts`.
- Board route: `src/app/(app)/hr/projects/[id]/board/[boardId]/page.tsx`.
- APIs under `src/app/api/hr/whiteboards/[boardId]/` (route=save, convert, live, stream, image)
  and `.../projects/[id]/whiteboards/` (create). Model: `ProjectWhiteboard` (JSON `data` = `{elements, links}`).

## Element + op model (already in place)
- `WbEl` type has: id, type (sticky|frame|card|text|rect|circle|stamp|comment|image),
  x, y, w, h, text, color, title, tint, size, weight, muted, emoji, count, author, assignee,
  priority, due, frameId, imgKey, uploading, **rotation**, **locked**, **groupId**, and
  **styling fields already declared but NOT yet rendered/edited**: shapeType, fill, fillOpacity,
  stroke, strokeWidth, strokeStyle, radius, label, fontSize, bold, italic, textColor, align.
- Live ops (`LiveOp`): upsert, upsertMany, delete, links, title, order. Broadcast via `this.emit(op)`;
  applied from peers via `applyRemoteOp`. **Any new document mutation must (a) `pushUndo(ids)` first,
  (b) `mutate(...)` state, (c) `emit(...)` to peers** — follow the existing actions exactly.
- Undo/redo: `pushUndo(ids, includeLinks?)` captures BEFORE state; `undo()/redo()` replay as ops
  (per-user, collab-safe). Gesture undos (drag/resize/rotate) commit in `onWinUp`.

## DONE (shipped, live on dev-projects)
1. Persisted whiteboard + Convert-to-tasks (real Tasks via createTask, email/WhatsApp).
2. Live collaboration (SSE + POST hub): element sync, presence avatars, peer cursors.
3. Templates (6, with "How to run this" instruction frames) + stamp emoji palette + real image upload (R2).
4. Miro-style pan/zoom: wheel pans, ctrl/⌘+wheel zoom-to-cursor, arrows, +/-/0, Space+drag.
5. **Interaction essentials:** resize (8-handle box, per-type: images aspect-locked, text width-only,
   shapes/sticky/card/frame free, Shift-locks-aspect on shapes; correct under rotation via local-space
   math in `resizeBox`), rotate (handle above box, 15° Shift-snap), undo/redo, keyboard clipboard
   (Cmd+C/X/V/D, Cmd+A, Delete, Esc), marquee select, text wrapping.
6. **Arrange & control:** z-order (front/forward/backward/back via `order` op), lock, group/ungroup
   (Cmd+G/Shift+G), align (6) + distribute (h/v), zoom-to-selection, single-key tool hotkeys
   (V/N/S/T/R/O/F/L/C/I), right-click context menu (`onContextMenu` → `s.menu`).

## REMAINING — build these waves, ship each (build → verify → deploy) before the next

### Wave A — Styling (P0/P1, biggest value) — do FIRST
- **Render shapes as SVG** (currently rect/circle are plain divs). Add a `shapeType` renderer
  producing parametric SVG paths for: rectangle, roundRect, ellipse, triangle, diamond,
  parallelogram, hexagon, star, cylinder, cloud. Apply `fill`, `fillOpacity`, `stroke`,
  `strokeWidth`, `strokeStyle` (solid/dashed/dotted → strokeDasharray), `radius` (rect corner).
  Keep the existing rect/circle working (map type rect→rectangle, circle→ellipse).
- **Shape picker**: clicking the shape (square) tool opens a small palette of shape types
  (like the stamp palette pattern already in the code) that sets the pending shape type.
- **Text-in-shape**: every shape gets an optional editable `label` (double-click to edit,
  centered, wraps — reuse the contentEditable + `commitText` pattern).
- **Contextual style toolbar**: when a shape/text/sticky is selected, show a light toolbar
  (above the selection, like Miro) with: fill swatch + opacity slider, border color/width/style,
  corner-radius (rect only), and for text/labels: font size, Bold, Italic, text color, align.
  Wire Cmd+B/I/U for text. New props already exist on `WbEl`.
- Spec details: see `docs/whiteboard-research/` if present, else the 3 research reports summarized in
  the memory file `whiteboard-projects-feature.md`. Shape styling model + connector model are speced there.

### Wave B — Connectors (P0/P1)
- `connectorType` on links: **straight | elbow | curved** (3 path generators; default curved which exists).
- Endpoint arrowheads (`startCap`/`endCap`: none/arrow/openArrow/circle/diamond via SVG markers, sized to strokeWidth).
- Line style/color/width on connectors; **connector labels** (text at t∈[0,1] along the path).
- Anchor points on shapes + drag-from-edge to connect; waypoints (draggable bend points).
- Make connectors selectable (so the style toolbar can target them). This needs a small model change
  (links currently `{from,to}` only) — extend to carry the style fields.

### Wave C — View & collaboration (P1)
- Zoom presets (100% / fit) on the zoom control; **minimap** (bottom-right overview + draggable viewport rect);
  **on-board search** (Cmd+F: index element text, highlight+dim matches, fly-to via zoom-to-selection).
- Collab extras on the existing realtime channel: **@mentions** in comment threads (+ notify),
  ephemeral **reactions** (emoji broadcast), optional "bring everyone to me"/follow (broadcast viewport).

### P2 — DEFER unless the team asks (research flagged these low-value for our use case)
Grouping done. Remaining P2: presentation mode / frames-as-slides, voting, timer, tables, mind-map,
kanban, pen/drawing. Each is a large standalone build — **do not build speculatively**; confirm need first.

## Build / verify / deploy loop (follow exactly)
1. Edit → `rm -rf .next && npm run build` (must compile clean; `npx tsc --noEmit` too).
2. **Local verify against a HUB-schema DB** (prod dev DB is `va_console_hub` — different schema than `va_console`):
   ```
   psql -d postgres -c "DROP DATABASE IF EXISTS va_console_hub_local;"
   psql -d postgres -c "CREATE DATABASE va_console_hub_local OWNER va_console;"
   DATABASE_URL="postgresql://va_console:devpassword@localhost:5432/va_console_hub_local" npx prisma db push --skip-generate
   # seed a user (okamotomiak@gmail.com, isAdmin) + project + ProjectWhiteboard with data, then:
   DATABASE_URL="postgresql://va_console:devpassword@localhost:5432/va_console_hub_local" npx next dev -p 3060
   ```
   Drive the board with the browser MCP. **Gotcha:** the `computer` click tool uses VIEWPORT coords
   (1280×720), NOT the 800×450 screenshot — get real positions via `getBoundingClientRect()` in
   `javascript_tool`, or dispatch real MouseEvents. React setState is async, so select in one call,
   act in the next. When done: kill port 3060, `DROP DATABASE va_console_hub_local`.
3. **Deploy to dev-projects** (manual — `deploy.sh` only covers the dev-team box):
   ```
   REF=integration/hub-whiteboard; SHA=$(git rev-parse --short $REF); TMP=$(mktemp -d)
   git archive $REF | tar -x -C "$TMP"
   rsync -az --delete --exclude node_modules/ --exclude .next/ --exclude .git/ --exclude va-world/ \
     "$TMP/" root@74.208.40.108:/app/SecondBrain/va-projects-console/current/
   ssh root@74.208.40.108 "echo '$SHA' > /app/SecondBrain/va-projects-console/current/DEPLOYED_VERSION"
   ssh root@74.208.40.108 "cd /app/SecondBrain/va-projects-console/current && set -a && . ../shared/.env.production && set +a && npm run build && systemctl restart va-projects-web && sleep 3 && systemctl is-active va-projects-web && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8801/api/health"
   ```
   Live at https://dev-projects.pwasecondbrain.uk/hr/projects (behind Cloudflare Access → public curl returns 307, that's fine). R2 is already configured on that box.

## Gotchas (learned the hard way)
- **Never wholesale-replace the shared doc** in undo or ops — it clobbers peers. Keep the per-id op model.
- Any `setState` callback that fires after a mouseup must **capture ids/els first** (`this.drag` is null post-mouseup → crash). See the rotate handler.
- Add `...this.rot(e)` to any NEW element style so rotation applies; the transform box lives in
  canvas-screen space (`worldX*zoom + pan.x`) and rotates via CSS.
- The two branches diverged: `integration/hub-whiteboard` (deployed, ROLE-based auth: `canManageTasks(role)`,
  `user.isAdmin`, `action(h,{allow})`). The newer `pwaos-fix/testing-bugs-2026-07-11` is CAPS-based
  (`user.caps.manageTasks`, `action(h,{allowUser})`). **Open TODO after testing:** back-port the whole
  whiteboard to the caps branch (swap role guards → caps) so it rides into `main`.
- One known nit to fix when convenient: undo/redo clears selection (Miro keeps it).
