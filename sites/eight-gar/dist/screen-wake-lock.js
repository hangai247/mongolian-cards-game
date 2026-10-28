const PREFERENCE_KEY = 'eight-gar-keep-screen-on';

/** Best-effort screen lock; never blocks play or retries in a background loop. */
export function createScreenWakeLock({
  page = document, lifecycle = window, wakeLock = navigator.wakeLock,
  storage, onChange = () => {},
} = {}) {
  let enabled = true, playing = false, suspended = false, destroyed = false;
  let sentinel = null, pending = false, generation = 0, unavailable = false;
  const supported = typeof wakeLock?.request === 'function';
  try { enabled = storage?.getItem(PREFERENCE_KEY) !== 'off'; } catch { /* Storage is optional. */ }
  const wanted = () => supported && enabled && playing && !destroyed && !suspended && page.visibilityState === 'visible';
  function publish() {
    const status = !supported ? 'unsupported' : !enabled ? 'off' : !playing ? 'idle'
      : suspended || page.visibilityState !== 'visible' ? 'hidden'
      : sentinel ? 'active' : pending ? 'requesting' : unavailable ? 'unavailable' : 'idle';
    onChange({ enabled, supported, status });
  }
  async function release(lock) {
    try { await lock.release(); } catch { /* The browser may already have released it. */ }
  }
  async function sync() {
    if (!wanted()) {
      generation++;
      const old = sentinel; sentinel = null;
      if (old) void release(old);
      publish(); return;
    }
    if (sentinel || pending) return;
    const attempt = generation;
    pending = true; unavailable = false; publish();
    try {
      const next = await wakeLock.request('screen');
      if (attempt !== generation || !wanted()) await release(next);
      else if (next.released) unavailable = true;
      else {
        sentinel = next;
        next.addEventListener('release', () => {
          if (sentinel !== next) return;
          sentinel = null; unavailable = true; publish();
          // Battery saving may revoke the lock. Retry only on return or interaction.
        }, { once: true });
      }
    } catch { if (attempt === generation) unavailable = true; }
    finally {
      pending = false; publish();
      // A setting/visibility change during a pending request must not retain a stale lock.
      if (attempt !== generation && wanted()) void sync();
    }
  }
  const onVisibility = () => { void sync(); };
  const onHide = () => { suspended = true; void sync(); };
  const onShow = () => { suspended = false; void sync(); };
  const onInteraction = () => { if (wanted() && !sentinel && !pending) void sync(); };
  page.addEventListener('visibilitychange', onVisibility);
  page.addEventListener('pointerup', onInteraction);
  page.addEventListener('keydown', onInteraction);
  lifecycle.addEventListener('pagehide', onHide);
  lifecycle.addEventListener('pageshow', onShow);
  publish();
  return {
    setPlaying(value) {
      if (destroyed || playing === Boolean(value)) return;
      playing = Boolean(value); void sync();
    },
    setEnabled(value) {
      if (destroyed) return;
      enabled = Boolean(value);
      try { storage?.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
      void sync();
    },
    destroy() {
      destroyed = true; void sync();
      page.removeEventListener('visibilitychange', onVisibility);
      page.removeEventListener('pointerup', onInteraction);
      page.removeEventListener('keydown', onInteraction);
      lifecycle.removeEventListener('pagehide', onHide);
      lifecycle.removeEventListener('pageshow', onShow);
    },
  };
}

/** Shared settings UI for online and practice tables. */
export function mountScreenWakeLock(container) {
  const row = document.createElement('div'); row.className = 'wake-lock-setting';
  const button = document.createElement('button'); button.type = 'button'; button.id = 'keep-screen-on';
  button.textContent = 'Дэлгэцийг асаалттай байлгах';
  button.setAttribute('aria-pressed', 'true');
  const status = document.createElement('p'); status.id = 'wake-lock-status'; status.setAttribute('role', 'status');
  button.setAttribute('aria-describedby', status.id);
  row.append(button, status); container.append(row);
  let storage;
  try { storage = window.localStorage; } catch { /* Private/blocked storage is optional. */ }
  const messages = {
    unsupported: 'Энэ хөтөч дэлгэцийг асаалттай байлгах боломжийг дэмжихгүй байна.',
    off: 'Унтраасан. Дэлгэц утасны тохиргоогоор унтарна.',
    idle: 'Тоглох үед дэлгэцийг асаалттай байлгана.',
    hidden: 'Тоглоомдоо буцаж ирэхэд дахин идэвхжинэ.',
    requesting: 'Идэвхжүүлж байна…',
    active: 'Идэвхтэй. Тоглох үед дэлгэц автоматаар унтрахгүй.',
    unavailable: 'Утас эсвэл хөтөч зөвшөөрсөнгүй. Цэнэг хэмнэх горимоо шалгана уу.',
  };
  const controller = createScreenWakeLock({ storage, onChange({ enabled, supported, status: state }) {
    button.disabled = !supported;
    button.setAttribute('aria-pressed', String(enabled));
    if (status.textContent !== messages[state]) status.textContent = messages[state];
  } });
  button.addEventListener('click', () => controller.setEnabled(button.getAttribute('aria-pressed') !== 'true'));
  document.addEventListener('game-activity', event => controller.setPlaying(event.detail.active));
  return controller;
}
