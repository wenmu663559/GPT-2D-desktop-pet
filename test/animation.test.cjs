const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.cjs');
const anim = require('../src/animation.cjs');
test('continuous motion advances between poses throughout the interval', () => {
  for (const action of ['walk-right','read','yawn','rest']) {
    const phases = Array.from({length:6}, (_,i)=>anim.continuous(action, i*16.67));
    assert.equal(phases[0].mix,0);
    assert.ok(phases[1].mix > 0, action + ' must start moving without a held-pose interval');
    assert.equal(new Set(phases.map(p=>p.mix)).size,6);
  }
  assert.equal(anim.continuous('rest',10000).mix,0);
});
test('one-shot action durations do not leave several seconds of a frozen final pose', () => {
  assert.equal(core.transition(core.initialState(),'yawn',0).until,3040);
});
test('frame blending approaches the next pose and holds final non-looping poses', () => {
  const mid = anim.blend('walk-right', 220);
  assert.equal(mid.frame, 0);
  assert.equal(mid.next, 1);
  assert.ok(mid.mix > 0 && mid.mix < 1);
  assert.equal(anim.blend('walk-right', 1910).next, 0);
  assert.equal(anim.blend('rest', 10000).mix, 0);
  assert.equal(anim.blend('rest', 10000).next, 3);
  assert.equal(anim.blend('idle', 1000).mix, 0);
});
const overlap = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
test('side panel remains outside pet window at either edge and center', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  for (const x of [0, 700, 1500]) {
    const result = core.layoutControls({ x, y: 250, width: 420, height: 740 }, area);
    assert.equal(overlap(result.pet, result.panel), false);
    assert.ok(result.panel.x >= 0 && result.panel.x + result.panel.width <= 1920);
    assert.ok(result.panel.y >= 0 && result.panel.y + result.panel.height <= 1040);
  }
});
test('narrow and negative-coordinate screens preserve non-overlap', () => {
  for (const area of [{ x: -800, y: 0, width: 800, height: 600 }, { x: 0, y: 0, width: 640, height: 480 }]) {
    const result = core.layoutControls({ x: area.x+100, y: 0, width: 630, height: 1110 }, area);
    assert.equal(overlap(result.pet, result.panel), false);
    for (const b of [result.pet, result.panel]) assert.ok(b.x >= area.x && b.x+b.width <= area.x+area.width && b.y+b.height <= area.y+area.height);
  }
});
test('walking advances through eight actual frames and mirrors only direction', () => {
  const observed = new Set(Array.from({length:8},(_,i)=>anim.sample('walk-right',i*240).frame));
  assert.equal(observed.size,8);
  assert.equal(anim.sample('walk-left',240).mirror,true);
  assert.equal(anim.sample('walk-right',240).mirror,false);
});
test('rest ends in stable seated frame', () => {
  assert.equal(anim.sample('rest',100000).frame,3);
  assert.equal(anim.sample('rest',100000).track,'relax');
  assert.equal(anim.sample('read',1000).track,'read');
});
