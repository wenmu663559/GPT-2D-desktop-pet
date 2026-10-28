(function (root) {
  const cadence = { walk:240, rest:500, yawn:760, read:1000 };
  function stepFor(action) {
    return action.startsWith('walk-') ? cadence.walk : action === 'rest' ? cadence.rest : action === 'yawn' ? cadence.yawn : action === 'read' ? cadence.read : 0;
  }
  function sample(action, elapsed) {
    const t = Math.max(0, elapsed);
    const step = stepFor(action);
    if (action === 'walk-left' || action === 'walk-right') return { track: 'walk', frame: Math.floor(t / step) % 8, mirror: action === 'walk-left' };
    if (action === 'rest') return { track: 'relax', frame: Math.min(3, Math.floor(t / step)), mirror: false };
    if (action === 'yawn') return { track: 'relax', frame: 4 + Math.min(3, Math.floor(t / step)), mirror: false };
    if (action === 'read') return { track: 'read', frame: Math.floor(t / step) % 4, mirror: false };
    const blink = t % 5000;
    const frame = blink < 4200 ? 4 : 5 + Math.min(2, Math.floor((blink - 4200) / 260));
    return { track: 'read', frame, mirror: false };
  }
  function blend(action, elapsed) {
    const t = Math.max(0, elapsed), current = sample(action, t);
    const step = stepFor(action);
    if (!step) return { ...current, next: current.frame, mix: 0 };
    const next = sample(action, (Math.floor(t / step) + 1) * step).frame;
    const transition = Math.min(80, step * .6);
    const progress = Math.max(0, Math.min(1, (t % step - step + transition) / transition));
    return { ...current, next, mix: next === current.frame ? 0 : progress * progress * (3 - 2 * progress) };
  }
  function continuous(action, elapsed) {
    const t = Math.max(0, elapsed), current = sample(action, t);
    const step = stepFor(action);
    if (!step) return { ...current, next: current.frame, mix: 0 };
    const next = sample(action, (Math.floor(t / step) + 1) * step).frame;
    return { ...current, next, mix: next === current.frame ? 0 : (t % step) / step };
  }
  if (typeof module !== 'undefined') module.exports = { sample, blend, continuous };
  else root.PetAnimation = { sample, blend, continuous };
})(typeof window !== 'undefined' ? window : globalThis);
