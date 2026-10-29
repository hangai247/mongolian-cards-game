/** Exact underdamped spring solution; behavior is independent of display refresh rate. */
export function springStep(value, velocity, target, dt) {
  const omega = 22, damping = .78, decay = damping * omega;
  const frequency = omega * Math.sqrt(1 - damping * damping);
  const offset = value - target, coefficient = (velocity + decay * offset) / frequency;
  const envelope = Math.exp(-decay * dt), cos = Math.cos(frequency * dt), sin = Math.sin(frequency * dt);
  return {
    value: target + envelope * (offset * cos + coefficient * sin),
    velocity: envelope * ((-decay * offset + frequency * coefficient) * cos - (decay * coefficient + frequency * offset) * sin),
  };
}

/** Cubic spatial curve. Size/roll interpolate separately; endpoints stay exact. */
export function bezierPoses(from, to, lift = 70, segments = 48) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const p1 = { x: from.x + dx * .2, y: from.y + dy * .2 - lift };
  const p2 = { x: from.x + dx * .8, y: from.y + dy * .8 - lift };
  const roll = ((to.angle || 0) - (from.angle || 0) + 540) % 360 - 180;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments, u = 1 - t;
    return {
      x: u ** 3 * from.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * to.y,
      width: from.width + (to.width - from.width) * t,
      height: from.height + (to.height - from.height) * t,
      angle: (from.angle || 0) + roll * t,
      offset: t,
    };
  });
}
