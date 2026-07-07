/**
 * GET /api/zoom/panel — the in-meeting Zoom App panel (Phase 2).
 *
 * Served as a self-contained HTML document from a route handler (NOT a page
 * route) deliberately: the console's page routes sit behind Cloudflare Access +
 * NextAuth, which the Zoom client's embedded browser can never satisfy, while
 * /api/* is already reachable (same pass-through the Stripe/Zoom webhooks use).
 * Auth here is Zoom's own: the encrypted X-Zoom-App-Context header → we mint a
 * meeting-scoped HMAC token the panel JS uses for /api/zoom/panel/* calls.
 *
 * Ships the OWASP headers Zoom's Marketplace review checks (CSP allows only
 * ourselves + appssdk.zoom.us; no frame-ancestors — Zoom embeds this page).
 */
import { db } from "@/lib/db";
import { capsForUser } from "@/lib/auth/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import { zoomOauthConfigured } from "@/lib/zoom/oauth";
import { decryptZoomAppContext, mintPanelToken } from "@/lib/zoom/panel-auth";
import { assignableUsers, panelSecret } from "@/lib/zoom/panel-server";

export const dynamic = "force-dynamic";

const SECURITY_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'unsafe-inline' https://appssdk.zoom.us",
    "style-src 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store",
};

const BASE_CSS = `
  :root { --bg:#f6f7f9; --card:#fff; --text:#17202a; --muted:#68727d; --border:#e3e6ea;
          --accent:#0e72ed; --ok:#1a7f37; --warn:#b45309; --err:#b42318; --chip:#eef1f4; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#111417; --card:#1b2025; --text:#e8ebee; --muted:#9aa4ae; --border:#2c343c;
            --accent:#4da3ff; --ok:#3fb950; --warn:#d29922; --err:#f85149; --chip:#262d34; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:12px; background:var(--bg); color:var(--text);
         font:13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  h1 { font-size:15px; margin:0 0 2px; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 10px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:10px; }
  .pill { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11px; background:var(--chip); color:var(--muted); margin-right:6px; }
  .pill.ok { color:var(--ok); } .pill.warn { color:var(--warn); } .pill.err { color:var(--err); } .pill.accent { color:var(--accent); }
  .quote { color:var(--muted); font-style:italic; font-size:12px; margin:4px 0; }
  .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px; }
  button { font:inherit; border-radius:7px; border:1px solid var(--border); background:var(--chip); color:var(--text); padding:4px 10px; cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  select, input[type=date], input[type=text] { font:inherit; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:7px; padding:3px 6px; max-width:150px; }
  #status { font-size:12px; color:var(--muted); min-height:16px; margin-bottom:8px; }
  .item-title { font-weight:600; font-size:13px; }
  .done { opacity:.55; }
  .center { text-align:center; padding:40px 16px; color:var(--muted); }
  a { color:var(--accent); }
`;

function infoPage(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${BASE_CSS}</style></head>
<body><div class="center"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status, headers: SECURITY_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const secret = panelSecret();
  if (!secret || !zoomOauthConfigured()) {
    return infoPage(
      "Zoom app not configured",
      "ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET aren’t set on this environment yet.",
      503,
    );
  }

  const ctxHeader = request.headers.get("x-zoom-app-context");
  if (!ctxHeader) {
    return infoPage(
      "Open this inside Zoom",
      "This is the VA Management live-capture panel. Add it as the Zoom App Home URL " +
        "in the Marketplace and open it from a Zoom meeting — apps → your app.",
    );
  }
  const ctx = decryptZoomAppContext(ctxHeader, secret);
  if (!ctx?.uid) {
    return infoPage("Session expired", "The Zoom app context couldn’t be verified — close and reopen the app.", 401);
  }
  if (!ctx.mid) {
    return infoPage("Join a meeting first", "Open this panel from inside a meeting to see live proposed tasks.");
  }

  // Map the opener: Zoom uid → ZoomConnection (created at OAuth install) → console user.
  let viewerName = "Guest";
  let reviewer = false;
  let canConfirm = false;
  let userId: string | undefined;
  const conn = await db.zoomConnection.findUnique({ where: { zoomUserId: ctx.uid } });
  if (conn?.userId) {
    const u = await db.user.findUnique({ where: { id: conn.userId }, include: { va: true } });
    if (u && u.active) {
      const caps = await capsForUser(u);
      reviewer = caps.reviewMeetingActions;
      canConfirm = reviewer && (await canUserDelegateTasks(u.id, u.role));
      viewerName = u.name ?? u.email;
      userId = u.id;
    }
  }

  const token = mintPanelToken({ uid: ctx.uid, mid: ctx.mid, userId, name: viewerName }, secret);
  const assignees = canConfirm ? await assignableUsers() : [];
  const config = {
    token,
    meetingUuid: ctx.mid,
    viewer: { name: viewerName, reviewer, canConfirm, mapped: !!userId },
    assignees,
  };
  // <-escape so user-controlled strings can never close the script tag.
  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live Task Capture</title>
<style>${BASE_CSS}</style>
<script src="https://appssdk.zoom.us/sdk.min.js"></script>
</head><body>
<h1>Live Task Capture</h1>
<p class="sub" id="who"></p>
<div id="status"></div>
<div class="card" id="capture-card">
  <div class="row" style="margin-top:0">
    <span id="session-pill" class="pill">waiting</span>
    <span id="session-meta" style="font-size:12px;color:var(--muted)"></span>
    <span style="flex:1"></span>
    <button class="primary" id="startBtn">▶ Start live capture</button>
  </div>
</div>
<div id="items"></div>
<script>
(function () {
  var P = ${configJson};
  var edits = {}; // itemId -> {assigneeId, dueDate}
  var sdkReady = false;

  function $(s) { return document.querySelector(s); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function setStatus(msg) { $("#status").textContent = msg || ""; }

  $("#who").textContent = P.viewer.mapped
    ? P.viewer.name + (P.viewer.canConfirm ? " · reviewer (can confirm)" : P.viewer.reviewer ? " · reviewer" : " · team")
    : "Guest — you can endorse items; a reviewer turns them into tasks.";

  // ── Zoom SDK ────────────────────────────────────────────────────────────
  function initZoom() {
    if (typeof zoomSdk === "undefined") { setStatus("Not running inside Zoom — read-only preview."); return; }
    zoomSdk.config({
      capabilities: ["getMeetingContext", "getMeetingUUID", "getMeetingParticipants", "onParticipantChange", "startRTMS", "stopRTMS"],
    }).then(function () {
      sdkReady = true;
      zoomSdk.getMeetingContext().then(function (ctx) {
        if (ctx && ctx.meetingTopic) postJSON("roster", { topic: ctx.meetingTopic }).catch(function () {});
      }).catch(function () {});
      pushRoster();
      try { zoomSdk.onParticipantChange(function () { pushRoster(); }); } catch (e) {}
    }).catch(function (e) {
      setStatus("Zoom SDK unavailable: " + ((e && e.message) || e));
    });
  }
  function pushRoster() {
    if (!sdkReady) return;
    zoomSdk.getMeetingParticipants().then(function (res) {
      var list = (res && (res.participants || res)) || [];
      var names = [];
      for (var i = 0; i < list.length; i++) {
        var n = list[i] && (list[i].screenName || list[i].name);
        if (n) names.push({ name: n });
      }
      if (names.length) postJSON("roster", { participants: names }).catch(function () {});
    }).catch(function () { /* participants API is host/co-host only — fine */ });
  }
  $("#startBtn").addEventListener("click", function () {
    var btn = $("#startBtn"); btn.disabled = true;
    var call = !sdkReady
      ? Promise.reject(new Error("Zoom SDK unavailable"))
      : (typeof zoomSdk.startRTMS === "function" ? zoomSdk.startRTMS() : zoomSdk.callZoomApi("startRTMS"));
    Promise.resolve(call).then(function () {
      setStatus("Live capture starting — items appear as real commitments are made.");
    }).catch(function (e) {
      var code = e && (e.code || e.errorCode);
      if (String(code) === "40316") {
        setStatus("Zoom refused startRTMS (40316: app not Marketplace-verified). For dev testing, enable RTMS auto-start in the app settings instead.");
      } else {
        setStatus("Could not start live capture: " + ((e && e.message) || code || e));
      }
      btn.disabled = false;
    });
  });

  // ── API ─────────────────────────────────────────────────────────────────
  function postJSON(path, body) {
    return fetch("/api/zoom/panel/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + P.token },
      body: JSON.stringify(body || {}),
    }).then(function (res) { return res.json().catch(function () { return { ok: false, error: "bad response" }; }); })
      .then(function (data) { if (!data.ok) throw new Error(data.error || "request failed"); return data; });
  }

  // ── Live items via SSE ──────────────────────────────────────────────────
  var es = new EventSource("/api/zoom/panel/items?token=" + encodeURIComponent(P.token));
  es.addEventListener("snapshot", function (ev) {
    try { render(JSON.parse(ev.data)); } catch (e) {}
  });
  es.addEventListener("bye", function () { es.close(); setStatus("Live session closed."); });
  es.onerror = function () { setStatus("Reconnecting…"); };

  function confPill(c) {
    if (typeof c !== "number") return "";
    var pct = Math.round(c * 100) + "%";
    var cls = c >= 0.8 ? "ok" : c >= 0.65 ? "warn" : "";
    return '<span class="pill ' + cls + '">' + pct + " sure</span>";
  }
  function votesLabel(votes) {
    var up = 0, down = 0;
    (votes || []).forEach(function (v) { if (v && v.vote === "up") up++; else if (v && v.vote === "down") down++; });
    return (up || down) ? '<span class="pill">👍 ' + up + " · 👎 " + down + "</span>" : "";
  }

  function render(snap) {
    var pillEl = $("#session-pill");
    var st = (snap.session && snap.session.status) || "waiting";
    pillEl.textContent = st === "LIVE" ? "● LIVE" : st.toLowerCase();
    pillEl.className = "pill " + (st === "LIVE" ? "ok" : st === "FAILED" ? "err" : "");
    var stats = (snap.session && snap.session.stats) || null;
    $("#session-meta").textContent = stats ? stats.segments + " segments · " + stats.itemsProposed + " proposed" : "";
    if (st === "LIVE" || st === "PROCESSED") { $("#startBtn").style.display = "none"; }

    var items = snap.items || [];
    var host = $("#items");
    if (!items.length) {
      host.innerHTML = '<div class="center">No proposed items yet.<br>They appear here as the conversation produces real follow-ups.</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var resolved = it.status !== "PENDING";
      html += '<div class="card' + (resolved ? " done" : "") + '" data-id="' + esc(it.id) + '">';
      html += '<div class="item-title">' + esc(it.title) + "</div>";
      html += '<div style="margin-top:3px">'
        + '<span class="pill accent">' + esc(it.kind || "task") + "</span>"
        + confPill(it.confidence)
        + (it.status === "CONFIRMED" ? '<span class="pill ok">✓ task created</span>' : "")
        + (it.status === "SKIPPED" ? '<span class="pill">skipped</span>' : "")
        + votesLabel(it.liveVotes)
        + "</div>";
      if (it.evidenceQuote) html += '<div class="quote">“' + esc(it.evidenceQuote) + "”</div>";
      if (it.description) html += '<div style="font-size:12px;color:var(--muted)">' + esc(it.description) + "</div>";
      var meta = [];
      if (it.suggestedAssignee) meta.push("suggested: " + esc(it.suggestedAssignee));
      if (it.clientContext) meta.push(esc(it.clientContext));
      if (meta.length) html += '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + meta.join(" · ") + "</div>";

      if (!resolved) {
        html += '<div class="row">';
        if (P.viewer.canConfirm) {
          var edit = edits[it.id] || {};
          html += '<select data-role="assignee"><option value="">Assignee…</option>';
          for (var a = 0; a < P.assignees.length; a++) {
            var as = P.assignees[a];
            var sel = edit.assigneeId ? edit.assigneeId === as.id : matchName(it.suggestedAssignee, as);
            html += '<option value="' + esc(as.id) + '"' + (sel ? " selected" : "") + ">" + esc(as.name || as.email) + "</option>";
          }
          html += "</select>";
          html += '<input type="date" data-role="due" value="' + esc(edit.dueDate || it.suggestedDueDate || "") + '">';
          html += '<button class="primary" data-role="confirm">✓ Confirm</button>';
        }
        if (P.viewer.reviewer) {
          html += '<button data-role="skip">✕ Skip</button>';
        } else {
          html += '<button data-role="vote-up">👍 Looks right</button><button data-role="vote-down">👎 Not a task</button>';
        }
        html += "</div>";
      }
      html += "</div>";
    }
    host.innerHTML = html;
  }
  function matchName(suggested, assignee) {
    if (!suggested) return false;
    var s = String(suggested).toLowerCase(), n = String(assignee.name || "").toLowerCase();
    return !!n && (n === s || n.indexOf(s) > -1 || s.indexOf(n) > -1);
  }

  document.addEventListener("change", function (ev) {
    var card = ev.target.closest && ev.target.closest("[data-id]");
    if (!card) return;
    var id = card.getAttribute("data-id");
    edits[id] = edits[id] || {};
    if (ev.target.getAttribute("data-role") === "assignee") edits[id].assigneeId = ev.target.value;
    if (ev.target.getAttribute("data-role") === "due") edits[id].dueDate = ev.target.value;
  });
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("button[data-role]");
    if (!btn) return;
    var card = btn.closest("[data-id]");
    if (!card) return;
    var id = card.getAttribute("data-id");
    var role = btn.getAttribute("data-role");
    btn.disabled = true;
    var p;
    if (role === "confirm") {
      var sel = card.querySelector('[data-role="assignee"]');
      var due = card.querySelector('[data-role="due"]');
      if (!sel || !sel.value) { setStatus("Pick an assignee first."); btn.disabled = false; return; }
      p = postJSON("confirm", { itemId: id, assigneeId: sel.value, dueDate: (due && due.value) || undefined });
    } else if (role === "skip") {
      p = postJSON("skip", { itemId: id });
    } else if (role === "vote-up" || role === "vote-down") {
      p = postJSON("vote", { itemId: id, vote: role === "vote-up" ? "up" : "down" });
    } else { btn.disabled = false; return; }
    p.then(function () { setStatus(""); }).catch(function (e) { setStatus(e.message || "Request failed"); btn.disabled = false; });
  });

  initZoom();
})();
</script>
</body></html>`;

  return new Response(html, { status: 200, headers: SECURITY_HEADERS });
}
