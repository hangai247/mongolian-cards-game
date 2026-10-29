import { chainProgress } from './table-insights.js';

// Keep the eighth play visible after the pile animation, including reduced motion.
export function createSleepNotice(refresh, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let active = false, timer;
  return {
    get active() { return active; },
    show() {
      clearTimer(timer);
      active = true;
      timer = setTimer(() => { active = false; refresh(); }, 2500);
    },
    clear() { clearTimer(timer); active = false; },
  };
}

export function renderSleepFeedback(scene, motion, notice, doc = document) {
  const sleeping = motion?.type === 'sleep' || notice.active;
  const pile = doc.getElementById('pile-open');
  let chip = doc.getElementById('sleep-chip');
  if (!chip) {
    chip = doc.createElement('span');
    chip.id = 'sleep-chip';
    pile.append(chip);
  }
  const count = sleeping ? 8 : chainProgress(scene?.table);
  chip.textContent = `Унтана ${count}/8`;
  chip.hidden = !scene || scene.phase === 'choosing-leader';
  chip.classList.toggle('near-sleep', count >= 7);
  pile.setAttribute('aria-label', `Ширээн дээр ${scene?.table.pile.length ?? 0} хөзөр · Унтана ${count}/8 · Томруулж харах`);
  if (sleeping) doc.getElementById('turn-label').textContent = 'УНТАНА · хөзөр унтлаа';
}

export function hostName(room) {
  const host = room?.seats.find(seat => seat.isHost);
  return host?.reservedForName || host?.name || 'Зохион байгуулагч';
}

export function voiceCaption(info) {
  if (info.state === 'connecting') return 'Холбож байна';
  if (info.state === 'error') return 'Тасарсан';
  if (info.audioBlocked && info.state === 'on') return 'Сонсох';
  if (info.micBlocked) return 'Зөвшөөрөл';
  return info.micOn ? 'Асаалттай' : 'Хаалттай';
}
