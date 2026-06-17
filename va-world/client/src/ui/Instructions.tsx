import { useState } from "react";

// A right-docked "how this works" guide that fills the empty gutter beside the
// (fixed-width) world. Collapsible; the open/closed choice is remembered locally.

const STORAGE_KEY = "va-world-help-open";

function initialOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function Instructions() {
  const [open, setOpen] = useState(initialOpen);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };

  if (!open) {
    return (
      <div className="vw-help">
        <button className="vw-help-toggle" onClick={toggle} title="Show the guide">
          ❔ Guide
        </button>
      </div>
    );
  }

  return (
    <div className="vw-help">
      <div className="vw-help-card">
        <div className="vw-help-h">
          <span>👋 Welcome to VA World</span>
          <button className="vw-help-toggle" onClick={toggle} title="Hide the guide">
            ✕
          </button>
        </div>
        <p>
          A shared virtual office — walk around, bump into teammates, and start
          spontaneous video chats.
        </p>

        <h4>Move</h4>
        <p>
          <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrow keys to
          walk. The camera follows you.
        </p>

        <h4>Talk to people</h4>
        <p>
          On the open floor, just walk up to someone — your audio &amp; video
          connect automatically and get louder as you get closer. Walk away to
          end the call.
        </p>
        <p>
          Mic &amp; camera start <strong>off</strong>. Use{" "}
          <strong>Unmute mic</strong> / <strong>Start cam</strong> (bottom-right)
          to join in.
        </p>

        <h4>
          <span className="vw-help-zone" style={{ background: "#f59e0b" }} /> Stage
          (top)
        </h4>
        <p>
          Stand on the center <strong>podium</strong> to broadcast to everyone on
          the stage. Anywhere else on the stage you're a listen-only audience.
        </p>

        <h4>
          <span className="vw-help-zone" style={{ background: "#2dd4bf" }} />{" "}
          Meeting Room (bottom)
        </h4>
        <p>
          Step inside for a private group call — everyone in the room hears each
          other at full volume, and people outside can't listen in.
        </p>

        <h4>Chat</h4>
        <p>
          Press <kbd>Enter</kbd> to type, <kbd>Enter</kbd> again to send,{" "}
          <kbd>Esc</kbd> to cancel. Everyone sees your message.
        </p>

        <h4>Teammates &amp; avatar</h4>
        <p>
          <strong>Teammates</strong> (top-left) shows who's online — hit{" "}
          <strong>Walk to</strong> to teleport beside them. Pick your{" "}
          <strong>avatar color</strong> up there too.
        </p>
      </div>
    </div>
  );
}
