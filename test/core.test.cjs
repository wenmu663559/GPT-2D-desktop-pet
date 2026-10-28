const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.cjs');

test('short reactions return to prior rest mode, even after repeated actions', () => {
  let state = core.transition(core.initialState(), 'rest', 0);
  state = core.transition(state, 'head', 100);
  state = core.transition(state, 'horn', 200);
  assert.equal(core.settle(state, 10000).mode, 'rest');
  assert.equal(core.settle(state, 10000).action, 'rest');
});
test('wake ends rest; play can be stopped without any score or progression', () => {
  let state = core.transition(core.initialState(), 'rest', 0);
  state = core.transition(state, 'wake', 10);
  assert.equal(state.mode, 'idle');
  state = core.transition(state, 'play', 20);
  state = core.transition(state, 'face', 30);
  assert.equal(core.settle(state, 10000).action, 'play');
  assert.equal(core.transition(state, 'stop', 10001).mode, 'idle');
  assert.deepEqual(Object.keys(state).sort(), ['action', 'mode', 'until']);
});
test('normalized hit regions preserve head, face, wings, tail and dress', () => {
  assert.equal(core.hitRegion(.5, .08), 'horn');
  assert.equal(core.hitRegion(.5, .16), 'head');
  assert.equal(core.hitRegion(.5, .25), 'face');
  assert.equal(core.hitRegion(.12, .48), 'wing');
  assert.equal(core.hitRegion(.83, .68), 'tail');
  assert.equal(core.hitRegion(.5, .75), 'body');
});
test('drag threshold prevents shaking hands from counting as movement', () => {
  assert.equal(core.isDrag({ x: 5, y: 5 }, { x: 8, y: 9 }), false);
  assert.equal(core.isDrag({ x: 5, y: 5 }, { x: 30, y: 9 }), true);
});
test('multi-monitor clamping preserves negative coordinates and recovers disconnected display', () => {
  const areas = [{ x: -1920, y: 0, width: 1920, height: 1040 }, { x: 0, y: 0, width: 1920, height: 1040 }];
  assert.deepEqual(core.clampBounds({ x: -900, y: 500, width: 400, height: 500 }, areas), { x: -900, y: 500, width: 400, height: 500 });
  const result = core.clampBounds({ x: -1700, y: 700, width: 400, height: 500 }, [areas[1]]);
  assert.ok(result.x >= 0 && result.y + result.height <= 1040);
});
test('bad settings recover safely and accept only bounded display preferences', () => {
  assert.equal(core.sanitizeSettings(null).scale, .65);
  const result = core.sanitizeSettings({ scale: 99, x: 'bad', quiet: true, top: false, coins: 999, ignore: true });
  assert.equal(result.scale, 1.5);
  assert.equal(result.quiet, true);
  assert.equal(result.top, false);
  assert.equal(result.ignore, undefined);
  assert.equal(result.coins, undefined);
  assert.equal(result.x, undefined);
});
