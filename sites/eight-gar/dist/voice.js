/** Audio-only LiveKit wrapper. Voice is always on while you sit at a table: you listen from the moment you join and
 *  publish your microphone only after you unmute. Browser autoplay rules may still require one tap to hear others. */
import { Room, RoomEvent, Track } from './vendor/livekit-client.esm.mjs';

const REJOIN_DELAYS_MS = [1000, 3000, 8000];

export function createVoice({ requestToken, micPreferred = false }) {
  let room = null, state = 'off', wanted = false, micWanted = micPreferred, micOn = false, micBlocked = false, audioBlocked = false;
  let rejoinAttempt = 0, rejoinTimer = null;
  const listeners = { speakers: new Set(), state: new Set(), participants: new Set() };
  const sink = document.createElement('div');
  sink.id = 'voice-sink'; sink.hidden = true; sink.setAttribute('aria-hidden', 'true');
  document.body.append(sink);
  const emit = (kind, ...args) => { for (const fn of listeners[kind]) { try { fn(...args); } catch (error) { console.error(error); } } };
  const setState = (next, error = null) => { state = next; emit('state', snapshot(), error); };
  const snapshot = () => ({ state, micOn, micWanted, micBlocked, audioBlocked });

  /** Who else is in the voice channel and whether their microphone is live. Keyed by player id. */
  function participants() {
    const result = new Map();
    if (!room) return result;
    for (const participant of room.remoteParticipants.values()) {
      const mic = participant.getTrackPublication(Track.Source.Microphone);
      result.set(participant.identity, { micOn: !!mic && !mic.isMuted });
    }
    return result;
  }
  const emitParticipants = () => emit('participants', participants());

  function attachRoom(current) {
    current.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.dataset.identity = participant.identity;
      sink.append(element);
      emitParticipants();
    });
    current.on(RoomEvent.TrackUnsubscribed, track => { for (const element of track.detach()) element.remove(); emitParticipants(); });
    for (const event of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted]) current.on(event, emitParticipants);
    current.on(RoomEvent.ActiveSpeakersChanged, speakers => emit('speakers', speakers.map(p => p.identity)));
    current.on(RoomEvent.AudioPlaybackStatusChanged, () => { audioBlocked = !current.canPlaybackAudio; setState(state); });
    current.on(RoomEvent.MediaDevicesError, error => { console.error('voice device', error); });
    current.on(RoomEvent.Reconnecting, () => setState('connecting'));
    current.on(RoomEvent.Reconnected, () => setState('on'));
    current.on(RoomEvent.Disconnected, () => {
      emit('speakers', []);
      if (current !== room) return;
      room = null; micOn = false;
      emitParticipants();
      if (!wanted) { setState('off'); return; }
      // The SFU closed the session (token expiry, server restart): fetch a fresh token and come back.
      const delay = REJOIN_DELAYS_MS[Math.min(rejoinAttempt++, REJOIN_DELAYS_MS.length - 1)];
      setState('connecting');
      rejoinTimer = setTimeout(() => { rejoinTimer = null; start(); }, delay);
    });
  }

  async function applyMic() {
    if (!room || state !== 'on') return micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(micWanted);
      micOn = micWanted; micBlocked = false;
    } catch (error) {
      // Permission refused or no device: stay in listen-only mode and let the UI offer a retry.
      console.error('microphone', error);
      micOn = false; micBlocked = micWanted;
    }
    setState(state);
    return micOn;
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
      rejoinAttempt = 0;
      // Autoplay policy: this succeeds silently when the page already had a gesture; otherwise the banner asks for a tap.
      try { await current.startAudio(); } catch { /* reported through canPlaybackAudio */ }
      audioBlocked = !current.canPlaybackAudio;
      setState('on');
      emitParticipants();
      await applyMic();
    } catch (error) {
      console.error('voice', error);
      if (current === room) room = null;
      try { await current.disconnect(); } catch { /* already closed */ }
      if (!wanted) return;
      const delay = REJOIN_DELAYS_MS[Math.min(rejoinAttempt++, REJOIN_DELAYS_MS.length - 1)];
      setState('error', error);
      rejoinTimer = setTimeout(() => { rejoinTimer = null; if (wanted) start(); }, delay * 4);
    }
  }

  return {
    get state() { return state; },
    get micOn() { return micOn; },
    get micWanted() { return micWanted; },
    snapshot,
    /** Connects and listens. Call once when seated; reconnects on its own until leave(). */
    async join() {
      if (wanted) return;
      wanted = true; rejoinAttempt = 0;
      setState('connecting');
      await start();
    },
    async leave() {
      wanted = false;
      clearTimeout(rejoinTimer); rejoinTimer = null;
      const current = room; room = null; micOn = false;
      emit('speakers', []);
      if (current) { try { await current.disconnect(); } catch { /* ignore */ } }
      setState('off');
    },
    /** Turns the microphone on or off. The first "on" asks the browser for permission. */
    async setMic(on) {
      micWanted = !!on;
      if (!on) micBlocked = false;
      if (!wanted) { setState(state); return false; }
      if (state !== 'on') { setState(state); return false; }
      return applyMic();
    },
    /** Must run inside a click: unblocks audio playback on browsers that require a gesture. */
    async resumeAudio() {
      if (!room) return;
      try { await room.startAudio(); } catch (error) { console.error('audio playback', error); }
      audioBlocked = !room.canPlaybackAudio;
      setState(state);
    },
    participants,
    onSpeakers(fn) { listeners.speakers.add(fn); return () => listeners.speakers.delete(fn); },
    onState(fn) { listeners.state.add(fn); return () => listeners.state.delete(fn); },
    onParticipants(fn) { listeners.participants.add(fn); return () => listeners.participants.delete(fn); },
  };
}
