import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { overlayBridge } from "./overlayBridge";

export function Chat() {
  const state = useSyncExternalStore(overlayBridge.subscribe, overlayBridge.getSnapshot);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    overlayBridge.getActions()?.sendChat(text);
    setDraft("");
  };

  return (
    <div className="vw-chat">
      <div className="vw-chat-log" ref={listRef}>
        {state.chat.map((m, i) => (
          <div key={`${m.ts}-${i}`} className="vw-chat-line">
            <span className="vw-chat-from">{m.from}:</span> {m.text}
          </div>
        ))}
      </div>
      <input
        className="vw-chat-input"
        value={draft}
        placeholder="Press Enter to chat…"
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
      />
    </div>
  );
}
