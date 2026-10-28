import { AVATARS, isAvatarId, normalizeAvatar, botAvatar } from './rules/avatars.js';
export { botAvatar, normalizeAvatar };
const KEY = 'gar:avatar';
export function rememberedAvatar() {
  try { const id = localStorage.getItem(KEY); return isAvatarId(id) ? id : null; } catch { return null; }
}
export function rememberAvatar(id) {
  if (isAvatarId(id)) try { localStorage.setItem(KEY, id); } catch { /* Optional browser preference. */ }
}
export function avatarImage(id, className = 'avatar-portrait') {
  const avatar = AVATARS.find(a => a.id === normalizeAvatar(id));
  const wrapper = document.createElement('span'); wrapper.className = className;
  wrapper.dataset.avatarId = avatar.id;
  const fallback = document.createElement('span'); fallback.className = 'avatar-initial'; fallback.textContent = avatar.name[0];
  const img = new Image(); img.src = avatar.image; img.alt = ''; img.decoding = 'async';
  img.addEventListener('error', () => { img.hidden = true; wrapper.classList.add('image-failed'); });
  wrapper.append(fallback, img);
  return wrapper;
}
/** The remembered character, or a random one so nothing has to be picked before playing. */
export function defaultAvatar() {
  return rememberedAvatar() ?? AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}
/** Native radio inputs provide keyboard navigation and an announced selected state. The picker always holds a character. */
export function mountAvatarPicker(host, { value = null, onChange = () => {}, previewHost = null } = {}) {
  const field = document.createElement('fieldset'); field.className = 'avatar-picker';
  const legend = document.createElement('legend'); legend.textContent = 'Дүрээ сонгоорой';
  const hint = document.createElement('p'); hint.className = 'avatar-hint'; hint.textContent = 'Таны дүр бусад тоглогчдод харагдана.';
  const grid = document.createElement('div'); grid.className = 'avatar-grid';
  const preview = document.createElement('figure'); preview.className = 'avatar-preview';
  const caption = document.createElement('figcaption');
  const status = document.createElement('p'); status.className = 'avatar-feedback'; status.setAttribute('role', 'status');
  let current = isAvatarId(value) ? value : defaultAvatar(), busy = false, disabled = false;
  for (const avatar of AVATARS) {
    const label = document.createElement('label'); label.className = 'avatar-option';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `${host.id}-avatar`; radio.value = avatar.id; radio.setAttribute('aria-label', avatar.name);
    const name = document.createElement('span'); name.className = 'avatar-option-name'; name.textContent = avatar.name;
    label.append(radio, avatarImage(avatar.id), name); grid.append(label);
    radio.addEventListener('change', async () => {
      if (busy || disabled) return;
      const previous = current; current = avatar.id; busy = true; status.textContent = ''; draw();
      try { await onChange(current); } catch (error) { current = previous; status.textContent = error.message || 'Дүрийг өөрчилж чадсангүй.'; }
      finally { busy = false; draw(); }
    });
  }
  field.append(legend, hint, grid, status); host.replaceChildren(field);
  (previewHost ?? host).append(preview);
  function draw() {
    field.disabled = disabled || busy; field.setAttribute('aria-busy', String(busy));
    for (const radio of grid.querySelectorAll('input')) radio.checked = radio.value === current;
    if (preview.dataset.avatarId !== current) {
      preview.dataset.avatarId = current;
      caption.textContent = AVATARS.find(a => a.id === current).name;
      preview.replaceChildren(avatarImage(current, 'avatar-full-preview'), caption);
    }
  }
  draw();
  return {
    get value() { return current; },
    setValue(id) { if (isAvatarId(id)) { current = id; draw(); } },
    setDisabled(value) { disabled = value; draw(); },
  };
}

/** Keep the local identity visible even when the opener-only seat badge is hidden. */
export function renderSelfAvatar(id) {
  let chip = document.getElementById('self-avatar-chip');
  if (!chip) { chip = document.createElement('span'); chip.id = 'self-avatar-chip'; document.querySelector('.header').append(chip); }
  const normalized = normalizeAvatar(id);
  if (chip.dataset.avatarId === normalized) return;
  chip.dataset.avatarId = normalized;
  chip.setAttribute('aria-label', `Таны дүр: ${AVATARS.find(a => a.id === normalized).name}`);
  const name = document.createElement('span'); name.textContent = 'Та';
  chip.replaceChildren(avatarImage(normalized), name);
}
