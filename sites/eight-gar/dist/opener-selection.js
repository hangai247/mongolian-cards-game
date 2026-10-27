/** A single-choice teammate picker. Receives only public names and hand counts. */
export function mountOpenerSelection({ container, onChange, seatRoot = null }) {
  let value = null, roundKey = null, players = [], disabled = false;
  const buttons = new Map();
  function refresh() {
    for (const [seat, button] of buttons) {
      const checked = seat === value;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = seat === (value ?? players[0]?.seat) ? 0 : -1;
      button.disabled = disabled;
      button.querySelector('.opener-check').textContent = checked ? '✓' : '';
    }
  }
  function choose(seat) {
    if (disabled || !buttons.has(seat)) return;
    value = seat; refresh(); onChange(value);
  }
  function navigate(event) {
    if (disabled) return;
    const index = players.findIndex(player => String(player.seat) === event.target.closest('[data-opener-seat]')?.dataset.openerSeat);
    if (index < 0) return;
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? players.length - 1 : step ? (index + step + players.length) % players.length : null;
    if (next === null) return;
    event.preventDefault(); choose(players[next].seat); buttons.get(value).focus({ preventScroll: true });
  }
  return {
    get value() { return value; },
    reset() { value = null; roundKey = null; for (const button of buttons.values()) { button.parentElement?.classList.remove('choosing-opener'); button.classList.remove('seat-opener'); container.append(button); } container.classList.remove('seated'); container.removeAttribute('aria-owns'); refresh(); },
    render({ key, entries, busy = false }) {
      if (roundKey !== key) { value = null; roundKey = key; }
      players = entries; disabled = busy;
      if (!players.some(player => player.seat === value)) value = null;
      for (const [seat, button] of buttons) if (!players.some(player => player.seat === seat)) { button.remove(); buttons.delete(seat); }
      for (const player of players) {
        let button = buttons.get(player.seat);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button'; button.className = 'opener-card'; button.dataset.openerSeat = player.seat;
          button.setAttribute('role', 'radio');
          for (const className of ['opener-avatar', 'opener-name', 'opener-count', 'opener-check']) {
            const node = document.createElement('span'); node.className = className;
            if (className === 'opener-avatar' || className === 'opener-check') node.setAttribute('aria-hidden', 'true');
            button.append(node);
          }
          button.addEventListener('click', () => choose(player.seat));
          button.addEventListener('keydown', navigate);
          buttons.set(player.seat, button); container.append(button);
        }
        const seat = seatRoot?.querySelector(`.seat-${player.seat}`);
        button.classList.toggle('seat-opener', Boolean(seat));
        if (seat) { button.id = `opener-seat-${player.seat}`; seat.classList.add('choosing-opener'); if (button.parentElement !== seat) seat.append(button); }
        button.querySelector('.opener-avatar').textContent = player.name.trim().split(/\s+/).map(part => [...part][0]).slice(0, 2).join('').toUpperCase();
        button.querySelector('.opener-name').textContent = player.name;
        button.querySelector('.opener-count').textContent = `${player.count} хөзөр`;
        button.setAttribute('aria-label', `${player.name}, ${player.count} хөзөр`); button.title = player.name;
      }
      container.classList.toggle('seated', Boolean(seatRoot));
      if (seatRoot) container.setAttribute('aria-owns', [...buttons.values()].map(button => button.id).join(' '));
      refresh();
    },
  };
}
