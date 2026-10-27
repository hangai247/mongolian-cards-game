// One 24px vector family for every live control, including rerendered buttons.
const paths = {
 settings: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="m9.5 2-.6 2.2-1.5.9-2.2-.6-2.5 4.3 1.6 1.6v1.8l-1.6 1.6 2.5 4.3 2.2-.6 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.6 2.5-4.3-1.6-1.6v-1.8l1.6-1.6-2.5-4.3-2.2.6-1.5-.9L14.5 2Zm6.5 9.3a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/>',
 sound: '<path fill="currentColor" stroke="none" d="M11 4 5.5 8H2v8h3.5L11 20Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 muted: '<path fill="currentColor" stroke="none" d="M11 4 5.5 8H2v8h3.5L11 20Z"/><path d="m16 9 6 6m0-6-6 6"/>',
 mic: '<rect x="9" y="2" width="6" height="13" rx="3" fill="currentColor" stroke="none"/><path d="M5.5 10v2a6.5 6.5 0 0 0 13 0v-2M12 18.5V22m-4 0h8"/>',
 micOff: '<path d="M9 5a3 3 0 0 1 6 0v5M9 9v3a3 3 0 0 0 5.1 2.1M5.5 10v2a6.5 6.5 0 0 0 11.1 4.6M18.5 10v2M12 18.5V22m-4 0h8M3 3l18 18"/>',
 loading: '<path d="M12 3a9 9 0 1 1-9 9"/>',
 hint: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4ZM12 1v1M2 9H1m22 0h-1M4 3l1 1m14 0 1-1"/>',
 signals: '<path fill="currentColor" stroke="none" d="M6 3h12a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4H9l-6 3v-4a4 4 0 0 1-1-3V7a4 4 0 0 1 4-4Z"/><g fill="#1b2227" stroke="none"><circle cx="7" cy="11.5" r="1.4"/><circle cx="12" cy="11.5" r="1.4"/><circle cx="17" cy="11.5" r="1.4"/></g>',
 copy: '<rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 4V3H4v14h1"/>',
 sort: '<path d="M7 3v18M3 7l4-4 4 4M17 21V3m-4 14 4 4 4-4"/>',
 cards: '<rect x="3" y="4" width="13" height="17" rx="2" transform="rotate(-12 9.5 12.5)" fill="#65717e"/><rect x="7" y="3" width="13" height="18" rx="2" transform="rotate(12 13.5 12)" fill="#8a95a1"/>',
 chevron: '<path d="m9 4 8 8-8 8" stroke-width="3.2"/>',
 help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4m0 3h.01"/>',
 invite: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2Zm17-15v8m-4-4h8"/>',
};
export function controlIcon(name) {
  return `<svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.help}</svg>`;
}
export function setActionButton(button, label, icon, after = false) {
  button.innerHTML = controlIcon(icon);
  const text = document.createElement('span'); text.className = 'control-label'; text.textContent = label;
  after ? button.prepend(text) : button.append(text);
}
