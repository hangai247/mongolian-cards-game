import { availableSetSizes, signalsForPlayer } from './rules/signals.js';

/** Online callers pass only their own hand and server-filtered teammate signals. */
export function mountTeamSignals({ container, onToggle }) {
  const panel = document.createElement('section');
  panel.className = 'team-signals';
  panel.setAttribute('aria-label', 'Багийн нууц дохио');
  panel.hidden = true;
  const label = document.createElement('p');
  label.className = 'signal-label';
  label.textContent = 'Зөвхөн танай баг харна';
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
    button.textContent = `${size} хөзрийн багц`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (!current || button.disabled) return;
      onToggle(size, !current.signals.some(signal => signal.seat === current.seat && signal.size === size));
    });
    buttons.append(button);
  }
  panel.append(label, buttons, status);
  container.append(panel);
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
        button.title = enabled ? 'Энэ дохиог арилгах' : available.includes(size) ? 'Энэ багц гартаа байгааг багтаа мэдэгдэх' : `Гартаа ${size} хөзрийн багцтай байх шаардлагатай`;
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
        if (!badges) { badges = document.createElement('span'); badges.className = 'set-signals'; name.append(badges); }
        if (badges.dataset.sizes === sizes.join(',')) continue;
        badges.dataset.sizes = sizes.join(',');
        badges.replaceChildren(...sizes.map(size => {
          const badge = document.createElement('span');
          badge.className = 'set-signal'; badge.textContent = String(size);
          badge.title = `${size} хөзрийн багц · зөвхөн танай баг`;
          badge.setAttribute('aria-label', `${size} хөзрийн багцыг танай багт мэдэгдсэн`);
          return badge;
        }));
      }
    },
  };
}
