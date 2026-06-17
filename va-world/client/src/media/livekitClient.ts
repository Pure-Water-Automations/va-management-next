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

// Single world-wide LiveKit room; proximity decides who we subscribe to and at
// what volume. The local participant publishes only when the user toggles on.

let room: Room | null = null;
const remoteAudioEls = new Map<string, HTMLAudioElement>();

export async function connectMedia(url: string, token: string): Promise<void> {
  if (room) return;
  mediaStore.set({ available: true });

  room = new Room({ adaptiveStream: true });
  room
    .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
    .on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
    .on(RoomEvent.Disconnected, () => mediaStore.set({ connected: false }));

  await room.connect(url, token, { autoSubscribe: false });
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

/** Drive subscription + volume from in-world distance. */
export function updateProximity(local: Point, peers: Array<{ identity: string } & Point>): void {
  if (!room) return;
  const byIdentity = new Map(peers.map((p) => [p.identity, p]));

  room.remoteParticipants.forEach((participant) => {
    const peer = byIdentity.get(participant.identity);
    const d = peer ? distance(local, peer) : Number.POSITIVE_INFINITY;
    const near = withinRadius(d);

    participant.trackPublications.forEach((pub) => {
      if (pub.isSubscribed !== near) pub.setSubscribed(near);
    });
    participant.setVolume(near ? proximityVolume(d) : 0);
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
