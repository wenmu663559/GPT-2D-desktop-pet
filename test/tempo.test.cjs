const {test}=require('node:test');
const assert=require('node:assert/strict');
const anim=require('../src/animation.cjs');
const core=require('../src/core.cjs');
test('walk, rest and reading have an unhurried pose cadence',()=>{
  assert.equal(anim.sample('walk-right',180).frame,0);
  assert.equal(anim.sample('read',800).frame,0);
  assert.equal(anim.sample('rest',400).frame,0);
});
test('yawn lasts long enough without an extra frozen tail',()=>{
  const yawn=core.transition(core.initialState(),'yawn',0);
  assert.ok(yawn.until>=2600 && yawn.until<=3600);
  assert.equal(anim.sample('yawn',yawn.until-1).frame,7);
});
