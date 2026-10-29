/** Local preview only: measure microphone input without recording or playing it back. */
export function createMicrophoneMeter({ onLevel, onState, getUserMedia = options => navigator.mediaDevices.getUserMedia(options), createContext = () => new AudioContext(), schedule = fn => setInterval(fn, 50), cancel = clearInterval }) {
  let epoch = 0, context = null, stream = null, source = null, analyser = null, timer = null;
  function stop(state = 'off') {
    epoch++;
    if (timer !== null) cancel(timer);
    timer = null;
    source?.disconnect(); analyser?.disconnect();
    source = analyser = null;
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    const oldContext = context; context = null;
    if (oldContext) void oldContext.close().catch(() => {});
    onLevel(0); onState(state);
  }
  async function start() {
    stop();
    const current = epoch;
    onState('requesting');
    try {
      // Create/resume in the click gesture so browser autoplay rules cannot stall the meter.
      const audio = createContext(); context = audio;
      // Request device access immediately, even if the browser suspends the audio context.
      void audio.resume().catch(() => {});
      const input = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (current !== epoch) { input.getTracks().forEach(track => track.stop()); return; }
      stream = input;
      await audio.resume();
      if (current !== epoch) return;
      analyser = audio.createAnalyser(); analyser.fftSize = 1024;
      source = audio.createMediaStreamSource(input); source.connect(analyser);
      // No connection to the speakers: this cannot create microphone feedback.
      const samples = new Float32Array(analyser.fftSize);
      const read = () => {
        if (current !== epoch) return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0, squares = 0;
        for (const sample of samples) { sum += sample; squares += sample * sample; }
        const rms = Math.sqrt(Math.max(0, squares / samples.length - (sum / samples.length) ** 2));
        // Small noise floor and fixed visual gain keep quiet input readable.
        onLevel(rms < .003 ? 0 : Math.min(1, rms * 4));
      };
      input.getTracks().forEach(track => track.addEventListener('ended', () => { if (current === epoch) stop('ended'); }, { once: true }));
      onState('on'); read(); timer = schedule(read);
    } catch (error) {
      if (current !== epoch) return;
      stop(); onState('error', error);
    }
  }
  return { start, stop };
}
