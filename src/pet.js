(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.PetCore;
  const bridge = window.desktop;
  const isControls = new URLSearchParams(location.search).get('surface') === 'controls';
  if (isControls) document.body.classList.add('controls-surface');
  if (isControls) document.title = '龙娘 · 动作与对话';
  const canvas = $('pet'), present = canvas.getContext('2d');
  const scene = document.createElement('canvas'), ctx = scene.getContext('2d');
  const alphaMasks = new WeakMap();
  const blendBuffer = document.createElement('canvas');
  let motionRenderer = null;
  let heldMotion = null;
  let surfaceSize = {width:273,height:481};
  let tracks = {}, visualMirror = false;
  let loaded = false, frames = [], state = core.initialState(), preferences = core.sanitizeSettings(null), manualIgnore = false, chatOpen = false;
  let width = 0, height = 0, rect = { x: 0, y: 0, w: 1, h: 1 }, cursor = { x: -100, y: -100 };
  let speechTimer, down = null, dragging = false, panelOpen = false, activeRegion = '', lastFrame = -1;
  let particles = [], lastTime = 0, light = { x: 0, y: 0 }, lightTarget = { x: 0, y: 0 }, lastChaseTalk = 0;
  let lastInteractive = '', lastClick = 0, nextAuto = performance.now() + 14000, actionStart = 0;
  let busyChat = false, chatGeneration = 0, chatConfigured = false;
  let lastReportedState = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dialogue = {
    yawn: ['哈啊……刚刚有一点点走神。', '困意悄悄跑过来了。'],
    read: ['我翻几页书，你慢慢忙。', '这个故事，好像还挺有趣。'],
    'walk-left': ['往这边走几步。', '给裙摆和尾巴也放放风。'],
    'walk-right': ['去另一边看看。', '散步一下，马上回来。'],
    listen: ['嗯，我在听。', '你慢慢说。'],
    horn: ['是真的龙角哦，要轻一点。', '这里会有一点点痒……', '角没有藏着开关啦。'],
    tail: ['尾巴……我有好好收起来的！', '被发现了，刚刚偷偷晃了一下。', '不要打结哦，这是我的尾巴。'],
    body: ['我在这里。', '想做点什么，还是一起发呆？', '今天也慢慢来吧。'],
    wave: ['嗨，我来陪你啦。', '看到你啦，挥挥手。', '有空就来找我玩一小会儿。'],
    play: ['咦，一颗会跑的小星星。移动鼠标逗逗我吧。', '让我看看，那颗光跑到哪里去了？'],
    rest: ['我眯一会儿。你忙你的就好。', '借一小片安静，做个软软的梦。'],
    wake: ['醒啦。刚刚梦到一朵小云。', '嗯，我在。'],
    drag: ['欸——被你拎起来了。', '起飞之前，先把尾巴收好！'],
    land: ['落地。这里也很适合陪你。', '好啦，我就待在这里。'],
    idle: ['路过一下，也可以什么都不做。', '尾巴收好啦，不挡着你。', '今天的天空，会是什么颜色呢？', '我在，慢慢忙。', '发呆也是一件正经的小事。']
  };
  const pick = list => list[Math.floor(Math.random() * list.length)];
  function say(text, duration = 4200) {
    clearTimeout(speechTimer);
    $('words').textContent = text;
    $('speech').classList.add('visible');
    speechTimer = setTimeout(() => $('speech').classList.remove('visible'), duration);
  }
  function showPanel(value) {
    if (!isControls && bridge) { bridge.controls(value ? 'menu' : 'close'); return; }
    if (value) { chatOpen = false; $('chat-panel').hidden = true; bridge?.wander(0); }
    panelOpen = value;
    $('panel').hidden = !value;
    $('open-menu').setAttribute('aria-expanded', String(value));
    $('hint').classList.remove('visible');
    updateInteractive();
  }
  function useAction(action, automatic = false) {
    if (isControls) { bridge?.performAction(action); return; }
    if (action === 'chat') { openChat(); return; }
    if (['head', 'face', 'feed', 'flower','stretch','fly','sit','wing'].includes(action)) return;
    if (action === 'rest' && state.mode === 'rest') action = 'wake';
    if (action === 'play' && state.mode === 'play') action = 'stop';
    if (action === 'stop') { state = core.transition(state, action, performance.now()); bridge?.wander(0); say('先安静地待一会儿。'); return; }
    if (state.mode === 'rest' && !['wake', 'rest', 'drag', 'land'].includes(action)) state = core.initialState();
    const now = performance.now();
    if(action==='drag') heldMotion=spriteFor(now);
    else heldMotion=null;
    lastClick = now;
    actionStart = now;
    nextAuto = now + 18000 + Math.random() * 16000;
    state = core.transition(state, action, now);
    const words = dialogue[action] || dialogue.body;
    if (!automatic || !preferences.quiet) say(pick(words), action === 'rest' ? 5000 : 4200);
    bridge?.wander(action.startsWith('walk-') && (!automatic || preferences.roam) ? (action === 'walk-left' ? -1 : 1) : 0);
    if (action === 'play') {
      light = { x: width * .8, y: height * .3 };
      lightTarget = { ...light };
    }
    if (['wave', 'tail'].includes(action)) burst(action);
    $('rest-label').hidden = state.mode !== 'rest';
    $('rest-button').innerHTML = state.mode === 'rest' ? '<b>☀</b>轻轻唤醒' : '<b>☾</b>休息一下';
    document.body.dataset.action = action;
  }
  function burst(action) {
    const px = rect.x + rect.w * (action === 'tail' ? .8 : .5), py = rect.y + rect.h * (action === 'tail' ? .65 : .22);
    for (let i = 0; i < 12; i++) particles.push({ x: px, y: py, vx: (Math.random() - .5) * 1.5, vy: -.4 - Math.random() * 1.5, life: 1, color: '#c0a36c', kind: 'spark' });
  }
  function splitAtlas(atlas) {
    const result = [], cw = atlas.naturalWidth / 4, ch = atlas.naturalHeight / 2;
    const cells = [], bounds = [];
    for (let n = 0; n < 8; n++) {
      const col = n % 4, row = Math.floor(n / 4), px = Math.round(cw * .09), py = Math.round(ch * .025);
      const sx = Math.max(0, Math.round(col * cw) - px), sy = Math.max(0, Math.round(row * ch) - py);
      const sw = Math.min(atlas.naturalWidth, Math.round((col + 1) * cw) + px) - sx, sh = Math.min(atlas.naturalHeight, Math.round((row + 1) * ch) + py) - sy;
      const frame = document.createElement('canvas');
      frame.width = sw; frame.height = sh;
      const context = frame.getContext('2d');
      context.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
      const imageData = context.getImageData(0, 0, frame.width, frame.height);
      window.PetSprite.cleanSprite(imageData.data, frame.width, frame.height);
      context.putImageData(imageData, 0, 0);
      const pixels = imageData.data;
      let x1 = frame.width, y1 = frame.height, x2 = 0, y2 = 0;
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        if (pixels[(y * frame.width + x) * 4 + 3] > 128) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      }
      bounds.push({ x: Math.max(0, x1 - 3), y: Math.max(0, y1 - 3), w: Math.min(frame.width, x2 + 4) - Math.max(0, x1 - 3), h: Math.min(frame.height, y2 + 4) - Math.max(0, y1 - 3), center: (col + .5) * cw - sx });
      cells.push(frame);
    }
    const halfWidth = Math.ceil(Math.max(...bounds.map(b => Math.max(b.center - b.x, b.x + b.w - b.center)))) + 6;
    const outHeight = Math.max(...bounds.map(b => b.h)) + 12;
    for (let n = 0; n < 8; n++) {
      const b = bounds[n];
      const frame = document.createElement('canvas'); frame.width = halfWidth * 2; frame.height = outHeight;
      frame.getContext('2d').drawImage(cells[n], b.x, b.y, b.w, b.h, halfWidth + b.x - b.center, outHeight - b.h - 6, b.w, b.h);
      const rgba = frame.getContext('2d').getImageData(0, 0, frame.width, frame.height).data;
      const alpha = new Uint8Array(frame.width * frame.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      alphaMasks.set(frame, alpha);
      result.push(frame);
    }
    return result;
  }
  function fit() {
    if(!isControls){$('companion').style.width=surfaceSize.width+'px';$('companion').style.height=surfaceSize.height+'px';}
    const box = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    width = box.width; height = box.height;
    const pixelsW=Math.round(width*dpr),pixelsH=Math.round(height*dpr);
    if(canvas.width!==pixelsW||canvas.height!==pixelsH){
      canvas.width=pixelsW;canvas.height=pixelsH;scene.width=pixelsW;scene.height=pixelsH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    placeFrame(0);
    if(loaded){ctx.clearRect(0,0,width,height);drawCharacter(performance.now());publish();}
  }
  function placeFrame(index) {
    if (!loaded) return;
    const image = frames[index];
    const track=canvas.dataset.track||'read';
    rect = core.spriteLayout(track,image,{width,height});
    canvas.dataset.bodyHeight=rect.bodyHeight.toFixed(3);
  }
  function publish(){
    present.setTransform(1,0,0,1,0,0);
    present.globalCompositeOperation='copy';
    present.drawImage(scene,0,0);
    present.globalCompositeOperation='source-over';
  }
  function spriteFor(now) {
    if(state.action==='drag'&&heldMotion) return heldMotion;
    return window.PetAnimation[motionRenderer && !motionRenderer.lost ? 'continuous' : 'blend'](state.action, now - actionStart);
  }
  function drawCharacter(now) {
    const motion = spriteFor(now), index = motion.frame;
    frames = tracks[motion.track];
    const image = frames[index];
    visualMirror = preferences.mirror !== motion.mirror;
    canvas.dataset.track = motion.track; canvas.dataset.frame = String(index);
    canvas.dataset.phase = motion.mix.toFixed(3);
    placeFrame(index);
    lastFrame = index;
    const t = now / 1000;
    const rest = state.mode === 'rest';
    const amplitude = reduced || dragging ? 0 : rest ? .5 : 1.8;
    const breath = Math.sin(t * (rest ? 1.3 : 2)) * amplitude;
    const look = state.mode === 'rest' ? 0 : Math.max(-1, Math.min(1, (cursor.x - innerWidth / 2) / (innerWidth / 2)));
    const phase = state.until ? Math.max(0, Math.min(1, (state.until - now) / Math.max(1, state.until - actionStart))) : 0;
    const walking = state.action.startsWith('walk-');
    const bob = reduced ? 0 : walking ? Math.abs(Math.sin(t * 4)) * 2 : 0;
    let tilt = reduced ? 0 : Math.sin(t * 1.2) * .003;
    if (state.action === 'horn' || state.action === 'listen') tilt += Math.sin(phase * Math.PI) * -.025;
    if (walking) tilt += Math.sin(t * 4) * .008;
    if (state.action === 'drag') tilt = 0;
    if (state.action === 'tail' && !reduced) tilt += Math.sin(t * 8) * .012 * phase;
    ctx.save();
    ctx.translate(rect.x + rect.w / 2 + look * 1.4, rect.y + rect.h - bob);
    if (visualMirror) ctx.scale(-1, 1);
    ctx.rotate(tilt);
    // Draw cached whole sprites; avoid 100 resampling operations on every refresh.
    const mix = reduced ? 0 : motion.mix;
    const interpolated = mix > 0 && motionRenderer?.draw(motion.track,index,motion.next,mix,image.width,image.height);
    if (interpolated) {
      ctx.drawImage(interpolated, -rect.w / 2, -rect.h + breath, rect.w, rect.h - breath);
    } else if (mix > 0) {
      // Add premultiplied layers offscreen to avoid fading overlapping opaque pixels.
      const buffer = blendBuffer, bx = buffer.getContext('2d');
      if (buffer.width !== image.width || buffer.height !== image.height) { buffer.width = image.width; buffer.height = image.height; }
      bx.clearRect(0, 0, buffer.width, buffer.height);
      bx.globalAlpha = 1 - mix; bx.drawImage(image, 0, 0);
      bx.globalCompositeOperation = 'lighter'; bx.globalAlpha = mix; bx.drawImage(frames[motion.next], 0, 0);
      bx.globalCompositeOperation = 'source-over'; bx.globalAlpha = 1;
      ctx.drawImage(buffer, -rect.w / 2, -rect.h + breath, rect.w, rect.h - breath);
    } else ctx.drawImage(image, -rect.w / 2, -rect.h + breath, rect.w, rect.h - breath);
    ctx.restore();
    if (rest) {
      ctx.fillStyle = '#c5b1d0'; ctx.font = 'italic 16px Georgia';
      for (let i = 0; i < 3; i++) {
        const k = (t * .2 + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * .7;
        ctx.fillText('z', rect.x + rect.w * .68 + k * 20, rect.y + rect.h * .16 - k * 38);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawLight(now) {
    if (state.mode !== 'play') return;
    const ease = reduced ? 1 : .065;
    light.x += (lightTarget.x - light.x) * ease;
    light.y += (lightTarget.y - light.y) * ease;
    const pulse = 1 + Math.sin(now / 180) * .12;
    const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 23 * pulse);
    gradient.addColorStop(0, '#fff8d4ee'); gradient.addColorStop(.2, '#f5dc98aa'); gradient.addColorStop(1, '#eac56c00');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(light.x, light.y, 23 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff5cd'; ctx.font = '20px Georgia'; ctx.fillText('✦', light.x - 8, light.y + 7);
    // A tiny drifting cloud follows the light, without scores or a win condition.
    const cloudX = light.x + (rect.x + rect.w * .7 - light.x) * .3;
    const cloudY = light.y + (rect.y + rect.h * .37 - light.y) * .3 + Math.sin(now / 300) * 3;
    ctx.fillStyle = '#faf6ffdc'; ctx.beginPath();
    ctx.ellipse(cloudX, cloudY, 14, 10, 0, 0, 7); ctx.ellipse(cloudX - 8, cloudY + 3, 8, 7, 0, 0, 7); ctx.ellipse(cloudX + 8, cloudY + 3, 8, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#a18cb8'; ctx.beginPath(); ctx.arc(cloudX - 4, cloudY, 1.5, 0, 7); ctx.arc(cloudX + 4, cloudY, 1.5, 0, 7); ctx.fill();
  }
  function drawParticles(delta) {
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) {
      p.x += p.vx * delta / 16; p.y += p.vy * delta / 16; p.life -= delta / 1800;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      if (p.kind === 'petal') { ctx.beginPath(); ctx.ellipse(p.x, p.y, 3, 5, p.life * 3, 0, 7); ctx.fill(); }
      else { ctx.font = '12px Georgia'; ctx.fillText('✧', p.x, p.y); }
    }
    ctx.globalAlpha = 1;
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (!loaded || document.hidden) return;
    const delta = Math.min(100, now - lastTime); lastTime = now;
    state = core.settle(state, now);
    if (preferences.auto && state.action === 'idle' && !panelOpen && !chatOpen && !down && !dragging && now > nextAuto && now - lastClick > 12000) {
      const candidates = preferences.roam ? ['yawn', 'read', 'walk-left', 'walk-right', 'listen'] : ['yawn', 'read', 'listen'];
      const action = pick(candidates); useAction(action, true);
      if (action==='read') state = { mode: 'idle', action, until: now + 10000 + Math.random() * 8000 };
    }
    document.body.dataset.action = state.action;
    const stateSignature = state.action + ':' + state.mode;
    if (stateSignature !== lastReportedState) { lastReportedState = stateSignature; bridge?.reportState({ action: state.action, mode: state.mode }); }
    ctx.clearRect(0, 0, width, height);
    drawCharacter(now); drawLight(now); drawParticles(delta);
    publish();
    updateInteractive();
  }
  function normalized(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    let x = (clientX - box.left - rect.x) / rect.w;
    if (visualMirror) x = 1 - x;
    return { x, y: (clientY - box.top - rect.y) / rect.h };
  }
  function opaqueAt(x, y) {
    if (!loaded) return false;
    const p = normalized(x, y);
    if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) return false;
    const image = frames[Math.max(0, lastFrame)];
    return alphaMasks.get(image)[Math.floor(p.y * image.height) * image.width + Math.floor(p.x * image.width)] > 25;
  }
  function updateInteractive() {
    if (!bridge) return;
    const node = document.elementFromPoint(cursor.x, cursor.y);
    const ui = node && node.closest('button,input,textarea,summary,#panel,#chat-panel,#dock,#help');
    const value = { character: !!(down || dragging || opaqueAt(cursor.x, cursor.y) || state.mode === 'play'), controls: !!ui };
    const signature = JSON.stringify(value);
    if (signature !== lastInteractive) { lastInteractive = signature; bridge.interactive(value); }
  }
  function onCursor(point) {
    cursor = point;
    const box = canvas.getBoundingClientRect();
    if (state.mode === 'play') {
      lightTarget = { x: Math.max(20, Math.min(width - 20, point.x)), y: Math.max(25, Math.min(height - 25, point.y - box.top)) };
      if (performance.now() - lastChaseTalk > 13000 && !preferences.quiet) { say('这里？……还是那里？跟上小星星啦。'); lastChaseTalk = performance.now(); }
    }
    updateInteractive();
    if (manualIgnore || panelOpen || chatOpen || down || !opaqueAt(point.x, point.y)) { $('hint').classList.remove('visible'); return; }
    const p = normalized(point.x, point.y);
    const region = core.hitRegion(p.x, p.y);
    if (region !== activeRegion) {
      activeRegion = region;
      const labels = { head: '按住拖动 · 右键菜单', face: '按住拖动 · 右键菜单', horn: '轻轻碰龙角', wing: '按住可以拖动我', tail: '碰碰尾巴', body: '按住可以拖动我' };
      $('hint').textContent = state.mode === 'rest' ? '轻轻唤醒' : labels[region];
    }
    $('hint').style.left = Math.max(5, Math.min(innerWidth - 120, point.x + 12)) + 'px';
    $('hint').style.top = Math.max(5, Math.min(innerHeight - 45, point.y - 22)) + 'px';
    $('hint').classList.add('visible');
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !loaded || manualIgnore || !opaqueAt(event.clientX, event.clientY)) return;
    down = { x: event.screenX, y: event.screenY, clientX: event.clientX, clientY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (down && !dragging && core.isDrag(down, { x: event.screenX, y: event.screenY })) {
      dragging = true; bridge?.dragStart(); useAction('drag'); $('hint').classList.remove('visible');
    }
    if (!bridge) onCursor({ x: event.clientX, y: event.clientY });
  });
  function endPointer(event, cancelled = false) {
    if (!down) return;
    if (dragging) { bridge?.dragEnd(); useAction('land'); }
    else if (!cancelled) { const p = normalized(down.clientX, down.clientY), action = core.hitRegion(p.x, p.y); useAction(['head', 'face', 'body'].includes(action) ? 'listen' : action); }
    down = null; dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', event => endPointer(event));
  canvas.addEventListener('pointercancel', event => endPointer(event, true));
  window.addEventListener('blur', () => { if (dragging) bridge?.dragEnd(); if (down) { down = null; dragging = false; state = core.transition(state, 'land', performance.now()); } });
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); showPanel(!panelOpen); });
  $('open-menu').onclick = () => showPanel(!panelOpen);
  $('close-panel').onclick = () => bridge?.controls('close');
  $('greet').onclick = () => openChat();
  $('open-chat').onclick = () => openChat();
  const handle = $('dock-move');
  handle.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); down = { x: event.screenX, y: event.screenY, clientX: event.clientX, clientY: event.clientY }; dragging = true; handle.setPointerCapture(event.pointerId); bridge?.dragStart(); useAction('drag'); });
  function finishHandle(event) {
    if (!dragging && state.action !== 'drag') return;
    bridge?.dragEnd(); down = null; dragging = false; useAction('land');
    if (event && handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  handle.addEventListener('pointerup', finishHandle);
  handle.addEventListener('pointercancel', finishHandle);
  handle.addEventListener('lostpointercapture', finishHandle);
  document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => { if (!isControls) showPanel(false); useAction(button.dataset.action); });
  for (const key of ['quiet', 'top', 'mirror', 'auto', 'roam']) $(key).onchange = event => { preferences[key] = event.target.checked; bridge?.preference(key, preferences[key]); if (key === 'quiet') say(preferences.quiet ? '我会安静地待着，想聊时再叫我。' : '好呀，偶尔聊一句。'); };
  $('size').oninput = event => { $('size-value').textContent = event.target.value + '%'; };
  $('size').onchange = event => bridge?.scale(Number(event.target.value) / 100);
  $('click-through').onclick = () => { const enable = !manualIgnore; if (!isControls) showPanel(false); say(enable ? '只穿透角色。底部菜单仍可点击，按住 ⠿ 可以拖动。' : '恢复角色交互啦。', 6500); bridge?.ignore(enable); };
  $('hide-pet').onclick = () => { showPanel(false); bridge?.hide(); };
  $('exit').onclick = () => bridge?.quit();
  $('fallback-exit').onclick = () => bridge?.quit();
  $('retry').onclick = () => loadAnimations();
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { showPanel(false); closeChat(); if (state.mode === 'play') useAction('stop'); }
    if (event.target === canvas && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); useAction(state.mode === 'rest' ? 'wake' : 'listen'); }
    if ((event.key === '+' || event.key === '-') && event.ctrlKey) bridge?.scale(preferences.scale + (event.key === '+' ? .1 : -.1));
  });
  window.addEventListener('wheel', event => { if (event.ctrlKey) { event.preventDefault(); bridge?.scale(preferences.scale + (event.deltaY < 0 ? .05 : -.05)); } }, { passive: false });
  function applySettings(value) {
    preferences = core.sanitizeSettings(value);
    surfaceSize=value.surfaceSize||{width:Math.round(420*preferences.scale),height:Math.round(740*preferences.scale)};
    manualIgnore = value.ignore === true;
    lastInteractive = '';
    for (const key of ['quiet', 'top', 'mirror', 'auto', 'roam']) $(key).checked = preferences[key];
    $('click-through').textContent = manualIgnore ? '恢复角色交互' : '穿透角色';
    $('dock-label').textContent = manualIgnore ? '角色穿透中' : '陪你一会儿';
    $('recover-tip').textContent = value.shortcut === false ? '穿透后菜单和 ⠿ 仍可用。快捷键被占用时，可双击托盘恢复。' : '穿透后菜单和 ⠿ 仍可用。Ctrl + Alt + Shift + D 恢复。';
    $('size').value = Math.round(preferences.scale * 100);
    $('size-value').textContent = Math.round(preferences.scale * 100) + '%';
    if (value.error) say(value.error, 7000);
    fit();
  }
  async function refreshChatConfig() {
    const config = bridge ? await bridge.chatConfig() : { configured: false };
    chatConfigured = config.configured;
    $('api-status').textContent = chatConfigured ? '已配置 · 免费模型' : '未配置 Key';
    $('api-key').placeholder = chatConfigured ? '已加密保存；填写可替换' : '在这里填写 OpenRouter API Key';
    $('api-settings').open = !chatConfigured;
  }
  function openChat() {
    if (!isControls && bridge) { bridge.controls('chat'); return; }
    showPanel(false); chatOpen = true; $('chat-panel').hidden = false;
    bridge?.wander(0); useAction('listen'); updateInteractive();
    refreshChatConfig();
    $('chat-input').focus();
  }
  function closeChat() {
    if (isControls) { bridge?.controls('close'); return; }
    chatOpen = false; $('chat-panel').hidden = true; updateInteractive();
  }
  function appendChat(text, role = '') {
    const p = document.createElement('p'); p.className = 'chat-line ' + role; p.textContent = text;
    $('chat-log').append(p);
    while ($('chat-log').children.length > 40) $('chat-log').firstElementChild.remove();
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
  }
  function setChatBusy(value) {
    busyChat = value;
    $('chat-send').disabled = value;
    $('chat-send').textContent = value ? '等一句回复…' : '发送 ↗';
    $('chat-cancel').hidden = !value;
    $('save-key').disabled = value; $('clear-key').disabled = value;
  }
  $('close-chat').onclick = closeChat;
  $('key-page').onclick = () => bridge?.keyPage();
  $('save-key').onclick = async () => {
    if (!bridge) return;
    const result = await bridge.saveKey($('api-key').value);
    $('api-key').value = '';
    $('key-notice').textContent = result.ok ? '已加密保存。可以发一句话试试。' : result.error;
    await refreshChatConfig();
  };
  $('clear-key').onclick = async () => {
    if (!bridge) return;
    const result = await bridge.clearKey(); $('api-key').value = '';
    $('key-notice').textContent = result.ok ? '密钥已移除。' : result.error;
    await refreshChatConfig();
  };
  $('chat-cancel').onclick = () => bridge?.cancelChat();
  $('chat-reset').onclick = () => { chatGeneration++; bridge?.resetChat(); setChatBusy(false); $('chat-log').replaceChildren(); appendChat('新的一段对话，从这里开始。'); };
  $('chat-form').onsubmit = async event => {
    event.preventDefault();
    if (busyChat) return;
    const text = $('chat-input').value.trim(); if (!text) return;
    if (!chatConfigured) { appendChat('先在下方设置中填写 OpenRouter API Key。', 'error'); $('api-settings').open = true; return; }
    $('chat-input').value = ''; appendChat(text, 'user'); setChatBusy(true); useAction('listen');
    const generation = chatGeneration;
    try {
      const result = await bridge.chat(text);
      if (generation !== chatGeneration) return;
      appendChat(result.ok ? result.text : result.error, result.ok ? '' : 'error');
      if (result.ok) say(result.text, 10000);
    } catch { if (generation === chatGeneration) appendChat('对话没有完成，请再试一次。', 'error'); }
    finally { if (generation === chatGeneration) setChatBusy(false); }
  };
  $('chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit(); } });
  if (bridge) {
    bridge.settings().then(applySettings);
    bridge.onSettings(applySettings); bridge.onCursor(onCursor); bridge.onAction(useAction); bridge.onNotice(message => say(message, 6500)); bridge.ready();
    bridge.onSurface(surface => { if (!isControls) return; if (surface === 'chat') openChat(); else showPanel(true); });
    bridge.onControlsVisible(value => { if (!isControls) panelOpen = value; });
    bridge.onPetState(value => { if (isControls) $('rest-button').innerHTML = value.mode === 'rest' ? '<b>☀</b>轻轻唤醒' : '<b>☾</b>休息一下'; });
  }
  async function loadAnimations() {
    try {
      const entries = await Promise.all(['walk','relax','read'].map(async name => {
        const image = new Image(); image.src = '../assets/animations/' + name + '.png'; await image.decode(); return [name, splitAtlas(image)];
      }));
      tracks = Object.fromEntries(entries);
      try { motionRenderer = new window.PetMotionRenderer(tracks, await bridge.motionFields()); document.body.dataset.motion = 'optical-flow'; }
      catch (error) { motionRenderer = null; document.body.dataset.motion = 'fallback'; console.warn('Motion interpolation unavailable:',error.message); }
      frames = tracks.read; loaded = true; fit(); $('help').hidden = true;
      document.body.dataset.ready = 'true';
      say('我来陪你一会儿。右键选动作，底部 ♧ 聊两句。', 6500);
    } catch { loaded = false; $('help').hidden = false; document.body.dataset.ready = 'error'; }
  }
  if (!isControls) { loadAnimations(); new ResizeObserver(fit).observe(canvas); requestAnimationFrame(loop); }
  else document.body.dataset.ready = 'true';
  setInterval(() => { if (loaded && !preferences.quiet && state.mode === 'idle' && !panelOpen && !down && performance.now() - lastClick > 40000) say(pick(dialogue.idle)); }, 75000);
})();
