/** Deterministic clock for runtime tests: timers fire only when the test advances time. */
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

export function fakeClock(start = 1_700_000_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    pending: () => timers.size,
    flush,
    /** Advances time, firing due timers in order and letting async work settle after each. */
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        now = Math.max(now, timer.at);
        timer.fn();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}
