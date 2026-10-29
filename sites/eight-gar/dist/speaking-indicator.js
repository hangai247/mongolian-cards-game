/** A compact voice waveform inside the existing player card. */
export function setSpeakingIndicator(node, speaking, targetSelector, audioLevel = 0) {
  if (!node) return;
  node.classList.toggle('speaking', speaking);
  // A square-root response makes quiet speech readable without inventing motion.
  const level = speaking && Number.isFinite(audioLevel) ? Math.sqrt(Math.max(0, Math.min(1, audioLevel))) : 0;
  node.style.setProperty('--voice-level', String(level));
  if (!speaking || node.querySelector('.speaking-wave')) return;
  const target = targetSelector ? node.querySelector(targetSelector) : node;
  if (!target) return;
  const wave = document.createElement('span');
  wave.className = 'speaking-wave';
  wave.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) wave.append(document.createElement('i'));
  target.append(wave);
}
