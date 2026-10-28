(function (root) {
  'use strict';
  const stable = new Set(['rest', 'play', 'idle', 'read']);
  function initialState() { return { mode: 'idle', action: 'idle', until: 0 }; }
  function transition(state, action, now) {
    if (['fly','wing','stretch','sit'].includes(action)) return state;
    if (action === 'stop' || action === 'wake') return initialState();
    if (stable.has(action)) return { mode: action, action, until: 0 };
    const duration = { drag: 86400000, yawn: 3040, 'walk-left': 12000, 'walk-right': 12000, listen: 6500 }[action] || 4000;
    return { mode: state.mode, action, until: now + duration };
  }
  function settle(state, now) {
    return state.until && now >= state.until ? { mode: state.mode, action: state.mode, until: 0 } : state;
  }
  function hitRegion(x, y) {
    if (y < .12) return 'horn';
    if (y < .21) return 'head';
    if (y < .32 && x > .25 && x < .75) return 'face';
    if (y > .55 && x > .7) return 'tail';
    if (y < .62 && (x < .3 || x > .72)) return 'wing';
    return 'body';
  }
  function isDrag(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) > 7; }
  function shouldIgnore({ manual = false, character = false, controls = false, dragging = false } = {}) {
    return !dragging && !controls && (manual || !character);
  }
  function clampBounds(bounds, areas) {
    if (!areas.length) return bounds;
    const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
    const area = areas.reduce((best, next) => {
      const distance = a => Math.hypot(cx - Math.max(a.x, Math.min(cx, a.x + a.width)), cy - Math.max(a.y, Math.min(cy, a.y + a.height)));
      return distance(next) < distance(best) ? next : best;
    });
    const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
    return { x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))), width, height };
  }
  function sanitizeSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    const result = { scale: Number.isFinite(input.scale) ? Math.min(1.5, Math.max(.65, input.scale)) : .65, layoutVersion: 2, quiet: input.quiet === true, top: input.top !== false, mirror: input.mirror === true, auto: input.auto !== false, roam: input.roam === true };
    if (Number.isFinite(input.x)) result.x = Math.round(input.x);
    if (Number.isFinite(input.y)) result.y = Math.round(input.y);
    return result;
  }
  function layoutControls(bounds, area) {
    const gap = 10, panelWidth = Math.min(350, Math.floor(area.width * .48)), panelHeight = Math.min(650, area.height);
    const factor = Math.min(1, (area.width - panelWidth - gap) / bounds.width, area.height / bounds.height);
    const pet = clampBounds({ ...bounds, width: Math.max(1, Math.floor(bounds.width * factor)), height: Math.max(1, Math.floor(bounds.height * factor)) }, [area]);
    let x;
    if (pet.x - panelWidth - gap >= area.x) x = pet.x - panelWidth - gap;
    else if (pet.x + pet.width + gap + panelWidth <= area.x + area.width) x = pet.x + pet.width + gap;
    else { pet.x = area.x + panelWidth + gap; x = area.x; }
    return { pet, panel: { x: Math.round(x), y: Math.round(Math.max(area.y, Math.min(pet.y, area.y + area.height - panelHeight))), width: panelWidth, height: panelHeight } };
  }
  function spriteLayout(track, image, viewport) {
    // Calibrated standing body heights; seated poses retain the same body unit.
    const bodyUnits = { walk:481, read:505, relax:494 };
    const factor = 505 / (bodyUnits[track] || 505);
    const scale = Math.min((viewport.width-24)/480,(viewport.height-24)/550);
    const w=image.width*factor*scale,h=image.height*factor*scale,footY=viewport.height-10;
    return {x:(viewport.width-w)/2,y:footY-(image.height-9)*factor*scale,w,h,footY,bodyHeight:505*scale};
  }
  const api = { initialState, transition, settle, hitRegion, isDrag, shouldIgnore, clampBounds, sanitizeSettings, layoutControls, spriteLayout };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
