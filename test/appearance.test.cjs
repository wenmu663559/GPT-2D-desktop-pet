const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core.cjs');
test('new desktop pet starts at the existing minimum scale',()=>assert.equal(core.sanitizeSettings(null).scale,.65));
test('removed actions cannot be entered through alternate entry points',()=>{
  const state=core.initialState();
  for(const action of ['fly','wing','stretch','sit'])assert.deepEqual(core.transition(state,action,0),state);
});
test('all remaining tracks share body scale and foot baseline without width-driven resizing',()=>{
  const layouts=Object.entries({walk:{width:432,height:507},read:{width:380,height:525},relax:{width:432,height:514}}).map(([track,image])=>core.spriteLayout(track,image,{width:273,height:414}));
  assert.ok(layouts[0].bodyHeight>100);
  assert.ok(Math.max(...layouts.map(l=>l.bodyHeight))-Math.min(...layouts.map(l=>l.bodyHeight))<.01);
  assert.ok(Math.max(...layouts.map(l=>l.footY))-Math.min(...layouts.map(l=>l.footY))<.01);
});
