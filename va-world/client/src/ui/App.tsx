import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Track } from "livekit-client";
import { mediaStore } from "../media/mediaStore";
import { setCam, setMic } from "../media/livekitClient";

function VideoTile({ track, name }: { track: Track; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <div className="vw-tile">
      <video ref={ref} autoPlay playsInline muted />
      <span className="vw-tile-name">{name}</span>
    </div>
  );
}

export function App() {
  const state = useSyncExternalStore(mediaStore.subscribe, mediaStore.getSnapshot);
  if (!state.available) return null;

  return (
    <div className="vw-hud">
      {state.tiles.length > 0 && (
        <div className="vw-tiles">
          {state.tiles.map((t) => (
            <VideoTile key={t.identity} track={t.track} name={t.name} />
          ))}
        </div>
      )}
      <div className="vw-controls">
        {state.zoneLabel && <span className="vw-zone">{state.zoneLabel}</span>}
        <button
          className={state.micOn ? "on" : ""}
          onClick={() => void setMic(!state.micOn)}
          disabled={!state.connected || !state.canPublish}
          title={state.canPublish ? "" : "Listen-only in this zone"}
        >
          {state.micOn ? "Mute mic" : "Unmute mic"}
        </button>
        <button
          className={state.camOn ? "on" : ""}
          onClick={() => void setCam(!state.camOn)}
          disabled={!state.connected || !state.canPublish}
          title={state.canPublish ? "" : "Listen-only in this zone"}
        >
          {state.camOn ? "Stop cam" : "Start cam"}
        </button>
      </div>
    </div>
  );
}
