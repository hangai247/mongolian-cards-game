/** Countdown UI uses wall time; it does not need a callback at every display refresh. */
export function createUiClock(tick, {
  document: doc = globalThis.document,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
  interval = 100,
} = {}) {
  let enabled = false, handle = null, disposed = false;
  function stop() { if (handle !== null) cancel(handle); handle = null; }
  function refresh() {
    stop();
    if (disposed || !enabled || doc.hidden) return;
    tick();
    handle = schedule(refresh, interval);
  }
  doc.addEventListener('visibilitychange', refresh);
  return {
    setEnabled(value) { if (enabled === value) return; enabled = value; refresh(); },
    dispose() { disposed = true; stop(); doc.removeEventListener('visibilitychange', refresh); },
  };
}
