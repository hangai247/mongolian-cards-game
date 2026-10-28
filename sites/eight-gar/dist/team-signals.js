import { availableSetSizes, signalsForPlayer } from './rules/signals.js';
import { controlIcon } from './control-icons.js';

// Shown under each button so the state (and the meaning of the button) is visible without hovering.
const STATE_CAPTIONS = { sent: 'мэдэгдсэн', ready: 'багтаа мэдэгдэх', none: 'багц алга' };

/** Online callers pass only their own hand and server-filtered teammate signals. */
export function mountTeamSignals({ container, onToggle }) {
  const panel = document.createElement('section');
  panel.className = 'team-signals';
  panel.id = 'team-signals-panel';
  panel.setAttribute('aria-label', 'Багийн нууц дохио');
  panel.hidden = true;
  const label = document.createElement('p');
  label.className = 'signal-label';
  label.textContent = 'Багийн нууц дохио';
  const buttons = document.createElement('div');
  buttons.className = 'signal-buttons';
  const status = document.createElement('span');
  status.className = 'signal-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  let current = null;
  for (const size of [3, 5]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quiet-button';
    button.dataset.signalSize = String(size);
    button.innerHTML = `${controlIcon('signals')}<span class="signal-name">${size} масстай</span>`;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${size} масстай · багийн нууц дохио`);
    button.addEventListener('click', () => {
      if (!current || button.disabled) return;
      onToggle(size, !current.signals.some(signal => signal.seat === current.seat && signal.size === size));
    });
    buttons.append(button);
  }
  panel.append(label, buttons, status);
  (container.querySelector('.signal-slot') ?? container).append(panel);
  return {
    render({ seat, phase, hand = [], signals = [], busy = false }) {
      const visible = signalsForPlayer(signals, seat);
      current = { seat, signals: visible };
      const active = phase === 'choosing-leader' || phase === 'playing';
      panel.hidden = !active;
      const available = availableSetSizes(hand);
      for (const button of buttons.children) {
        const size = Number(button.dataset.signalSize);
        const enabled = visible.some(signal => signal.seat === seat && signal.size === size);
        button.setAttribute('aria-pressed', String(enabled));
        button.disabled = !active || busy || (!enabled && !available.includes(size));
        const state = enabled ? 'sent' : available.includes(size) ? 'ready' : 'none';
        button.dataset.state = state; button.dataset.caption = STATE_CAPTIONS[state];
        button.title = enabled ? 'Багтаа мэдэгдсэн · дахин дарж арилгана' : state === 'ready' ? 'Энэ багц гартаа байгааг багтаа мэдэгдэх' : `Гартаа ${size} масстай багц алга`;
        button.setAttribute('aria-label', `${size} масстай · ${STATE_CAPTIONS[state]}`);
      }
      const own = visible.filter(signal => signal.seat === seat).map(signal => signal.size);
      const message = own.length ? `Мэдэгдсэн: ${own.join(' болон ')} хөзрийн багц` : 'Дохио өгөөгүй';
      if (status.textContent !== message) status.textContent = message;
      for (const player of document.querySelectorAll('.seat[data-player]')) {
        const name = player.querySelector('.seat-name');
        if (!name) continue;
        const playerSeat = Number(player.dataset.player);
        const sizes = active ? visible.filter(signal => signal.seat === playerSeat).map(signal => signal.size) : [];
        let badges = name.querySelector('.set-signals');
        if (!sizes.length) { badges?.remove(); continue; }
        // Inside the name row: anything placed above the seat can hide under the score strip on phones.
        if (!badges) { badges = document.createElement('span'); badges.className = 'set-signals'; const mic = name.querySelector('.seat-mic'); if (mic) mic.before(badges); else name.append(badges); }
        if (badges.dataset.sizes === sizes.join(',')) continue;
        badges.dataset.sizes = sizes.join(',');
        badges.replaceChildren(...sizes.map(size => {
          const badge = document.createElement('span');
          badge.className = 'set-signal'; badge.textContent = String(size); badge.setAttribute('role', 'img');
          badge.title = `${size} масстай багц · зөвхөн танай баг харна`;
          badge.setAttribute('aria-label', `${size} хөзрийн багцыг танай багт мэдэгдсэн`);
          return badge;
        }));
      }
    },
  };
}
