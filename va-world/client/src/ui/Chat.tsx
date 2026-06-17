import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { overlayBridge } from "./overlayBridge";

/** True when focus is already in a text field (don't steal it). */
function isTextEntry(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
  );
}

export function Chat() {
  const state = useSyncExternalStore(overlayBridge.subscribe, overlayBridge.getSnapshot);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat]);

  // Press Enter (while playing) to jump into the chat box — matches the
  // placeholder and means you never have to click to chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || isTextEntry(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Send, clear, and hand control back to the avatar (blur the input — otherwise
  // the scene keeps treating you as "typing" and WASD won't move you).
  const send = () => {
    const text = draft.trim();
    if (text) {
      overlayBridge.getActions()?.sendChat(text);
      setDraft("");
    }
    inputRef.current?.blur();
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
        ref={inputRef}
        className="vw-chat-input"
        value={draft}
        placeholder="Press Enter to chat…"
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Keep keystrokes in the box (don't let the scene react to them).
          e.stopPropagation();
          if (e.key === "Enter") {
            send();
          } else if (e.key === "Escape") {
            // Cancel: drop the draft and return control to the avatar.
            setDraft("");
            inputRef.current?.blur();
          }
        }}
      />
    </div>
  );
}
