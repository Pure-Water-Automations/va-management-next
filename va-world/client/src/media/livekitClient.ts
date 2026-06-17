import {
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { mediaStore } from "./mediaStore";
import { distance, proximityVolume, withinRadius, type Point } from "./proximity";
import type { RoomMode } from "../world/zones";

// One LiveKit connection at a time. The server assigns the room by zone and
// pushes a token; crossing a zone boundary switches rooms here. In "proximity"
// mode (open floor) we subscribe by distance; in "full" mode (meeting/stage) we
// subscribe to everyone at volume 1.

export type MediaMessage = {
  url: string;
  token: string;
  room: string;
  mode: RoomMode;
  canPublish: boolean;
  label: string;
};

let room: Room | null = null;
let currentRoomName: string | null = null;
let currentSignature: string | null = null;
let currentMode: RoomMode = "proximity";
const remoteAudioEls = new Map<string, HTMLAudioElement>();

function detachAllAudio(): void {
  for (const el of remoteAudioEls.values()) el.remove();
  remoteAudioEls.clear();
}

async function disconnectCurrent(): Promise<void> {
  if (room) {
    await room.disconnect();
    room = null;
  }
  detachAllAudio();
  for (const tile of mediaStore.getSnapshot().tiles) mediaStore.removeTile(tile.identity);
  mediaStore.set({ connected: false, micOn: false, camOn: false });
}

/** Connect to (or switch to) the room/role described by the server message. */
export async function connectMedia(msg: MediaMessage): Promise<void> {
  const signature = `${msg.room}|${msg.canPublish}`;
  if (room && signature === currentSignature) return; // already in this room+role

  await disconnectCurrent();

  currentRoomName = msg.room;
  currentSignature = signature;
  currentMode = msg.mode;
  mediaStore.set({ available: true, canPublish: msg.canPublish, zoneLabel: msg.label });

  room = new Room({ adaptiveStream: true });
  room
    .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
    .on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
    .on(RoomEvent.Disconnected, () => mediaStore.set({ connected: false }));

  await room.connect(msg.url, msg.token, { autoSubscribe: false });
  mediaStore.set({ connected: true });
}

function onTrackSubscribed(
  track: RemoteTrack,
  _pub: RemoteTrackPublication,
  participant: RemoteParticipant,
): void {
  if (track.kind === Track.Kind.Video) {
    mediaStore.upsertTile({
      identity: participant.identity,
      name: participant.name || participant.identity,
      track,
      isLocal: false,
    });
  } else if (track.kind === Track.Kind.Audio) {
    const el = track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
    remoteAudioEls.set(participant.identity, el);
  }
}

function onTrackUnsubscribed(
  track: RemoteTrack,
  _pub: RemoteTrackPublication,
  participant: RemoteParticipant,
): void {
  if (track.kind === Track.Kind.Video) {
    mediaStore.removeTile(participant.identity);
  } else {
    const el = remoteAudioEls.get(participant.identity);
    if (el) {
      track.detach(el);
      el.remove();
      remoteAudioEls.delete(participant.identity);
    }
  }
}

function onLocalTrackPublished(pub: LocalTrackPublication): void {
  if (pub.kind === Track.Kind.Video && pub.track) {
    mediaStore.upsertTile({ identity: "local", name: "You", track: pub.track, isLocal: true });
  }
}

function onLocalTrackUnpublished(pub: LocalTrackPublication): void {
  if (pub.kind === Track.Kind.Video) mediaStore.removeTile("local");
}

/** Drive subscription + volume. Distance matters only in proximity mode. */
export function updateProximity(local: Point, peers: Array<{ identity: string } & Point>): void {
  if (!room) return;
  const byIdentity = new Map(peers.map((p) => [p.identity, p]));

  room.remoteParticipants.forEach((participant) => {
    let subscribe: boolean;
    let volume: number;

    if (currentMode === "full") {
      subscribe = true;
      volume = 1;
    } else {
      const peer = byIdentity.get(participant.identity);
      const d = peer ? distance(local, peer) : Number.POSITIVE_INFINITY;
      subscribe = withinRadius(d);
      volume = subscribe ? proximityVolume(d) : 0;
    }

    participant.trackPublications.forEach((pub) => {
      if (pub.isSubscribed !== subscribe) pub.setSubscribed(subscribe);
    });
    participant.setVolume(volume);
  });
}

export async function setMic(on: boolean): Promise<void> {
  if (!room) return;
  await room.localParticipant.setMicrophoneEnabled(on);
  mediaStore.set({ micOn: on });
}

export async function setCam(on: boolean): Promise<void> {
  if (!room) return;
  await room.localParticipant.setCameraEnabled(on);
  mediaStore.set({ camOn: on });
}

/** Exposed for debugging/tests. */
export function currentRoom(): string | null {
  return currentRoomName;
}
