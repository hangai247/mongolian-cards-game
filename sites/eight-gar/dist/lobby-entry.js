/** Keep the entrance inside the visible viewport without changing the gameplay viewport. */
export function lobbyViewportState({ width, height, offsetTop = 0, scale = 1, baseline, focused }) {
  return {
    height: Math.max(1, height),
    top: Math.max(0, offsetTop),
    // A browser toolbar is not a keyboard; pinch zoom must retain the full accessible form.
    keyboard: width <= 1000 && scale === 1 && focused && baseline - height > 120,
  };
}

export function mountLobbyViewport(win = window, doc = document) {
  const entry = doc.getElementById('lobby-entry');
  const scroller = doc.getElementById('welcome');
  const viewport = win.visualViewport;
  let baseline = viewport?.height || win.innerHeight;
  let frame = 0;
  let wasKeyboard = false;
  const isEditing = () => entry.contains(doc.activeElement) && doc.activeElement.matches('input');
  function update() {
    frame = 0;
    const focused = isEditing();
    const active = doc.body.classList.contains('lobby-home');
    const height = viewport?.height || win.innerHeight;
    if (!focused && !wasKeyboard) baseline = height;
    if (focused) baseline = Math.max(baseline, height);
    const state = lobbyViewportState({ width: win.innerWidth, height, offsetTop: viewport?.offsetTop,
      scale: viewport?.scale, baseline, focused: active && (focused || wasKeyboard) });
    doc.body.style.setProperty('--lobby-vv-height', `${state.height}px`);
    doc.body.style.setProperty('--lobby-vv-top', `${state.top}px`);
    doc.body.classList.toggle('lobby-keyboard', state.keyboard);
    if (state.keyboard !== wasKeyboard) scroller.scrollTop = 0;
    wasKeyboard = state.keyboard;
    if (active && focused) {
      const box = doc.activeElement.getBoundingClientRect();
      const bounds = scroller.getBoundingClientRect();
      if (box.top < bounds.top + 16) scroller.scrollTop += box.top - bounds.top - 16;
      else if (box.bottom > bounds.bottom - 24) scroller.scrollTop += box.bottom - bounds.bottom + 24;
    }
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  // Rotation can change both the layout viewport and keyboard size.
  win.addEventListener('orientationchange', () => { baseline = win.innerHeight; schedule(); });
  entry.addEventListener('focusin', schedule);
  entry.addEventListener('focusout', schedule);
  doc.addEventListener('lobby-state-change', schedule);
  update();
}
