import { useSyncExternalStore } from "react";
import { AVATAR_COLORS } from "../world/avatars";
import { overlayBridge } from "./overlayBridge";

export function AvatarPicker() {
  const state = useSyncExternalStore(overlayBridge.subscribe, overlayBridge.getSnapshot);

  return (
    <div className="vw-avatar">
      <span className="vw-avatar-label">Avatar</span>
      {AVATAR_COLORS.map((color) => (
        <button
          key={color}
          className={`vw-swatch${state.myColor === color ? " on" : ""}`}
          style={{ background: color }}
          aria-label={`Use ${color} avatar`}
          onClick={() => overlayBridge.getActions()?.setColor(color)}
        />
      ))}
    </div>
  );
}
