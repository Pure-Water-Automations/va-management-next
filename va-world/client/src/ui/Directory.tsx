import { useState, useSyncExternalStore } from "react";
import { overlayBridge } from "./overlayBridge";

const prettyTier = (t: string) => (!t || t === "GUEST" ? "guest" : t.replace(/_/g, " ").toLowerCase());

type Row = {
  key: string;
  name: string;
  tier: string;
  color: string;
  online: boolean;
  sessionId: string | null;
  isSelf: boolean;
};

export function Directory() {
  const state = useSyncExternalStore(overlayBridge.subscribe, overlayBridge.getSnapshot);
  const [open, setOpen] = useState(false);

  const onlineVaIds = new Set(state.online.filter((o) => o.vaId).map((o) => o.vaId));
  const rows: Row[] = [
    ...state.online.map((o) => ({
      key: o.sessionId,
      name: o.name,
      tier: o.tier,
      color: o.color,
      online: true,
      sessionId: o.sessionId,
      isSelf: o.isSelf,
    })),
    ...state.roster
      .filter((r) => !onlineVaIds.has(r.vaId))
      .map((r) => ({
        key: r.vaId,
        name: r.name,
        tier: r.tier,
        color: "#3a4260",
        online: false,
        sessionId: null,
        isSelf: false,
      })),
  ];

  const onlineCount = state.online.length;

  return (
    <div className="vw-dir">
      <button className="vw-dir-toggle" onClick={() => setOpen((v) => !v)}>
        Teammates ({onlineCount} online)
      </button>
      {open && (
        <div className="vw-dir-list">
          {rows.map((r) => (
            <div key={r.key} className="vw-dir-row">
              <span className="vw-dir-dot" style={{ background: r.online ? r.color : "#3a4260" }} />
              <span className="vw-dir-name">
                {r.name}
                {r.isSelf ? " (you)" : ""}
              </span>
              <span className="vw-dir-tier">{prettyTier(r.tier)}</span>
              {r.online && !r.isSelf && r.sessionId && (
                <button
                  className="vw-dir-go"
                  onClick={() => overlayBridge.getActions()?.teleportTo(r.sessionId as string)}
                >
                  Walk to
                </button>
              )}
            </div>
          ))}
          {rows.length === 0 && <div className="vw-dir-empty">No teammates yet.</div>}
        </div>
      )}
    </div>
  );
}
