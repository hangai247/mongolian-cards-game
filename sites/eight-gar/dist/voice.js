/** Audio-only LiveKit wrapper. Joining happens only from a click so browsers allow microphone capture and playback. */
import { Room, RoomEvent, Track } from './vendor/livekit-client.esm.mjs';

const REJOIN_DELAYS_MS = [1000, 3000, 8000];

export function createVoice({ requestToken }) {
  let room = null, state = 'off', wanted = false, muted = false, rejoinAttempt = 0, rejoinTimer = null;
  const speakerListeners = new Set(), stateListeners = new Set();
  const sink = document.createElement('div');
  sink.id = 'voice-sink'; sink.hidden = true; sink.setAttribute('aria-hidden', 'true');
  document.body.append(sink);
  const setState = (next, error = null) => { state = next; for (const fn of stateListeners) fn(next, error); };
  const emitSpeakers = ids => { for (const fn of speakerListeners) fn(ids); };

  function attachRoom(current) {
    current.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.dataset.identity = participant.identity;
      sink.append(element);
    });
    current.on(RoomEvent.TrackUnsubscribed, track => { for (const element of track.detach()) element.remove(); });
    current.on(RoomEvent.ActiveSpeakersChanged, speakers => emitSpeakers(speakers.map(p => p.identity)));
    current.on(RoomEvent.Reconnecting, () => setState('connecting'));
    current.on(RoomEvent.Reconnected, () => setState('on'));
    current.on(RoomEvent.Disconnected, () => {
      emitSpeakers([]);
      if (current !== room) return;
      room = null;
      if (!wanted) { setState('off'); return; }
      // The SFU closed the session (token expiry, server restart): fetch a fresh token and come back.
      const delay = REJOIN_DELAYS_MS[Math.min(rejoinAttempt++, REJOIN_DELAYS_MS.length - 1)];
      setState('connecting');
      rejoinTimer = setTimeout(() => { rejoinTimer = null; start(); }, delay);
    });
  }

  async function start() {
    const current = new Room({
      adaptiveStream: false, dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    room = current;
    attachRoom(current);
    try {
      const { url, token } = await requestToken();
      if (!wanted || current !== room) return;
      await current.connect(url, token);
      await current.startAudio();
      await current.localParticipant.setMicrophoneEnabled(!muted);
      rejoinAttempt = 0;
      setState('on');
    } catch (error) {
      console.error('voice', error);
      if (current === room) room = null;
      try { await current.disconnect(); } catch { /* already closed */ }
      wanted = false;
      setState('error', error);
    }
  }

  return {
    get state() { return state; },
    get muted() { return muted; },
    async join() {
      if (wanted) return;
      wanted = true; rejoinAttempt = 0;
      setState('connecting');
      await start();
    },
    async leave() {
      wanted = false;
      clearTimeout(rejoinTimer); rejoinTimer = null;
      const current = room; room = null;
      emitSpeakers([]);
      if (current) { try { await current.disconnect(); } catch { /* ignore */ } }
      setState('off');
    },
    async toggleMute() {
      muted = !muted;
      if (room && state === 'on') { try { await room.localParticipant.setMicrophoneEnabled(!muted); } catch (error) { console.error(error); } }
      return muted;
    },
    onSpeakers(fn) { speakerListeners.add(fn); return () => speakerListeners.delete(fn); },
    onState(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
  };
}
