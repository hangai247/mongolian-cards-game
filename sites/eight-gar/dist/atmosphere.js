/** Short local sounds. Creating/resuming audio always follows a user gesture. */
export class TableAtmosphere {
  constructor({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(), hidden = () => document.hidden } = {}) {
    this.createContext = createContext; this.hidden = hidden;
    this.context = null; this.sources = new Set(); this.sound = true; this.volume = .25;
    this.unlocked = false; this.lastKey = null; this.epoch = 0;
  }
  configure({ sound, volume }) {
    this.sound = sound; this.volume = volume;
    if (!sound || volume === 0) this.stop();
    if (this.master && this.context) this.master.gain.setValueAtTime(volume, this.context.currentTime);
  }
  async unlock() {
    if (!this.sound || this.hidden()) return;
    const epoch = this.epoch;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.master = this.context.createGain(); this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.unlocked = epoch === this.epoch && this.context.state === 'running';
    } catch { this.unlocked = false; }
  }
  stop() {
    this.epoch++;
    for (const source of this.sources) { try { source.stop(); source.disconnect(); } catch { /* Already ended. */ } }
    this.sources.clear();
  }
  cue(kind, key) {
    if (this.lastKey === key) return;
    this.lastKey = key;
    if (!this.sound || !this.volume || !this.unlocked || this.hidden() || this.context?.state !== 'running') return;
    // One bounded sound per action, never one per picked-up card.
    this.stop();
    try {
      const time = this.context.currentTime;
      if (kind === 'play') this.rustle(time, .10, 1400);
      if (kind === 'refill') this.rustle(time, .16, 2100);
      if (kind === 'pickup') this.rustle(time, .25, 900);
      if (kind === 'sleep') { this.rustle(time, .32, 650); this.tone(time + .12, 660, .42); }
      if (kind === 'win') { this.tone(time, 523.25, .28); this.tone(time + .13, 659.25, .36); this.tone(time + .26, 783.99, .48); }
    } catch { this.stop(); }
  }
  connect(source, end, gain, filter = null) {
    if (filter) { source.connect(filter); filter.connect(gain); } else source.connect(gain);
    gain.connect(this.master); this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); filter?.disconnect(); };
    source.stop(end);
  }
  tone(time, frequency, duration) {
    const source = this.context.createOscillator(), gain = this.context.createGain();
    source.type = 'sine'; source.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.11, time + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.start(time); this.connect(source, time + duration, gain);
  }
  rustle(time, duration, frequency) {
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.2, time + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.start(time); this.connect(source, time + duration, gain, filter);
  }
}
