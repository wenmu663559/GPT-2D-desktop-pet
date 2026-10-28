const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, globalShortcut, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const core = require('./core.cjs');
const { requestReply } = require('./chat.cjs');

if (process.env.DRAGON_PET_DATA) app.setPath('userData', path.resolve(process.env.DRAGON_PET_DATA));
app.setName('WhiteDragonCompanion');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let win, tray, cursorTimer, settings, saveTimer, quitting = false, manualIgnore = false, automaticInteractive = false, controlsInteractive = false, drag = null, wander = null;
let apiKey = '', pendingChat = null, chatHistory = [], shortcutAvailable = false;
let settingsPath, savedError = '';
let controlsWin, controlsSurface = 'menu', positioningControls = false, lastPetState = { action: 'idle', mode: 'idle' };
let petSize = null, activeDisplayId = null;
const base = { width: 420, height: 740 };
const areas = () => screen.getAllDisplays().map(display => display.workArea);
function stableSize(scale,display=screen.getDisplayMatching(win?.getBounds()||screen.getPrimaryDisplay().workArea)) {
  const factor=display.scaleFactor;
  let grid=1;while(grid<16&&Math.abs(grid*factor-Math.round(grid*factor))>.001)grid++;
  return {width:Math.min(Math.ceil(base.width*scale/grid)*grid,Math.floor(display.workArea.width/grid)*grid),height:Math.min(Math.ceil(base.height*scale/grid)*grid,Math.floor(display.workArea.height/grid)*grid)};
}
function movePet(x,y){
  // Preserve requested dimensions: setPosition can feed DPI-rounded dimensions
  // back into Chromium and resize the transparent surface on every movement.
  const current=win.getBounds(),display=screen.getDisplayMatching({x:Math.round(x),y:Math.round(y),...petSize});
  const changed=display.id!==activeDisplayId;
  if(changed){petSize=stableSize(settings.scale,display);activeDisplayId=display.id;}
  const target=core.clampBounds({x:Math.round(x),y:Math.round(y),...petSize},[display.workArea]);
  if(changed||current.x!==target.x||current.y!==target.y) win.setBounds(target);
  if(changed)sendSettings();
}
function persist() {
  clearTimeout(saveTimer);
  if (win && !win.isDestroyed()) Object.assign(settings, { x: win.getBounds().x, y: win.getBounds().y });
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath + '.tmp', JSON.stringify(core.sanitizeSettings(settings), null, 2));
    fs.renameSync(settingsPath + '.tmp', settingsPath);
    savedError = '';
  } catch (error) {
    savedError = '设置暂时没能保存；仍可继续陪伴。';
    if (win && !win.isDestroyed()) win.webContents.send('notice', savedError);
  }
}
function laterSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); }
function sendSettings() { for (const target of [win, controlsWin]) if (target && !target.isDestroyed()) target.webContents.send('settings', { ...settings, surfaceSize:petSize, ignore: manualIgnore, shortcut: shortcutAvailable }); }
function dispatch(action) { win?.webContents.send('action', action); }
function positionControls(force = false) {
  if (!controlsWin || controlsWin.isDestroyed() || (!force && !controlsWin.isVisible()) || positioningControls) return;
  positioningControls = true;
  try {
    const bounds = {...win.getBounds(),...petSize}, area = screen.getDisplayMatching(bounds).workArea;
    const layout = core.layoutControls(bounds, area);
    if (JSON.stringify(bounds) !== JSON.stringify(layout.pet)) {petSize={width:layout.pet.width,height:layout.pet.height};win.setBounds(layout.pet);sendSettings();}
    controlsWin.setBounds(layout.panel);
  } finally { positioningControls = false; }
}
function closeControls() {
  if (controlsWin && !controlsWin.isDestroyed()) controlsWin.hide();
  win?.webContents.send('controls-visible', false);
  if (win && !win.isDestroyed()) {
    const b = win.getBounds(), next=stableSize(settings.scale);
    if (petSize.width!==next.width||petSize.height!==next.height) {petSize=next;win.setBounds(core.clampBounds({...b,...next},areas()));sendSettings();}
  }
}
async function openControls(surface) {
  if (surface === 'close') { closeControls(); return; }
  controlsSurface = surface === 'chat' ? 'chat' : 'menu';
  if (wander) { wander = null; dispatch('stop'); }
  if (!controlsWin || controlsWin.isDestroyed()) {
    controlsWin = new BrowserWindow({ width: 350, height: 650, title: '龙娘 · 动作与对话', parent: win, show: false, frame: false, thickFrame:false, roundedCorners:false, transparent: true, backgroundColor: '#00000000', resizable: false, skipTaskbar: true, alwaysOnTop: settings.top, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    controlsWin.setMenu(null);
    controlsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    controlsWin.webContents.on('will-navigate', event => event.preventDefault());
    controlsWin.on('close', event => { if (!quitting) { event.preventDefault(); closeControls(); } });
    await controlsWin.loadFile(path.join(__dirname, 'index.html'), { query: { surface: 'controls' } });
  }
  positionControls(true); controlsWin.show();
  controlsWin.webContents.send('surface', controlsSurface);
  win.webContents.send('controls-visible', true);
  sendSettings();
}
function applyInput() {
  win.setIgnoreMouseEvents(core.shouldIgnore({ manual: manualIgnore, character: automaticInteractive, controls: controlsInteractive, dragging: !!drag }), { forward: true });
}
function recover() {
  if (!win || win.isDestroyed()) return;
  manualIgnore = false;
  applyInput();
  const clamped=core.clampBounds({...win.getBounds(),...petSize},areas());movePet(clamped.x,clamped.y);
  win.show();
  positionControls();
  sendSettings();
  updateTray();
}
function resize(scale) {
  settings.scale = core.sanitizeSettings({ scale }).scale;
  const old = win.getBounds();
  const {width,height}=stableSize(settings.scale);petSize={width,height};
  win.setBounds(core.clampBounds({ x: old.x + old.width - width, y: old.y + old.height - height, width, height }, areas()));
  sendSettings(); laterSave(); updateTray();
}
function setPreference(key, value) {
  if (!['top', 'quiet', 'mirror', 'auto', 'roam'].includes(key) || typeof value !== 'boolean') return;
  settings[key] = value;
  if (key === 'top') { win.setAlwaysOnTop(value, 'floating'); controlsWin?.setAlwaysOnTop(value, 'floating'); }
  applyInput();
  sendSettings(); laterSave(); updateTray();
}
function setIgnore(value) {
  manualIgnore = value;
  applyInput();
  sendSettings(); updateTray();
}
function template() {
  return [
    { label: '显示龙娘 / 恢复鼠标交互', click: recover },
    { label: '一起玩一会儿', submenu: [
      ['打哈欠', 'yawn'], ['看书', 'read'], ['向左散步', 'walk-left'], ['向右散步', 'walk-right'], ['逗光点', 'play'], ['倾听', 'listen'], ['休息一下', 'rest'], ['站起来 / 停止动作', 'wake']
    ].map(([label, action]) => ({ label, click: () => { recover(); dispatch(action); } })) },
    { type: 'separator' },
    { label: '聊两句 / 设置免费 API', click: () => { recover(); dispatch('chat'); } },
    { label: '角色大小', submenu: [.65, .8, 1, 1.2, 1.5].map(scale => ({ label: `${Math.round(scale * 100)}%`, type: 'radio', checked: settings.scale === scale, click: () => resize(scale) })) },
    { label: '置顶', type: 'checkbox', checked: settings.top, click: item => setPreference('top', item.checked) },
    { label: '安静陪伴', type: 'checkbox', checked: settings.quiet, click: item => setPreference('quiet', item.checked) },
    { label: '左右镜像', type: 'checkbox', checked: settings.mirror, click: item => setPreference('mirror', item.checked) },
    { label: '自主动作', type: 'checkbox', checked: settings.auto, click: item => setPreference('auto', item.checked) },
    { label: '允许自主桌面散步', type: 'checkbox', checked: settings.roam, click: item => setPreference('roam', item.checked) },
    { label: '角色穿透（底部菜单仍可用）', type: 'checkbox', checked: manualIgnore, click: item => setIgnore(item.checked) },
    { label: '恢复默认位置', click: () => { const area = screen.getPrimaryDisplay().workArea; win.setPosition(area.x + area.width - win.getBounds().width, area.y + area.height - win.getBounds().height); recover(); persist(); } },
    { label: '收起到托盘', click: () => { closeControls(); win.hide(); } },
    { type: 'separator' },
    { label: '退出桌宠', click: () => app.quit() }
  ];
}
function updateTray() { tray?.setContextMenu(Menu.buildFromTemplate(template())); }
function installHandlers() {
  ipcMain.handle('motion-fields', event => {
    if (event.sender !== win.webContents) return null;
    return Object.fromEntries(['walk','relax','read'].map(name => [name, new Uint8Array(fs.readFileSync(path.join(__dirname, '../assets/motion', name + '.bin')))]));
  });
  ipcMain.handle('get-settings', () => ({ ...settings, surfaceSize:petSize, ignore: manualIgnore, error: savedError, shortcut: shortcutAvailable }));
  ipcMain.on('menu', () => Menu.buildFromTemplate(template()).popup({ window: win }));
  ipcMain.on('controls', (_event, surface) => { if (['menu', 'chat', 'close'].includes(surface)) openControls(surface); });
  ipcMain.on('perform-action', (_event, action) => {
    if (['yawn','read','walk-left','walk-right','play','rest','wake','listen','stop'].includes(action)) dispatch(action);
  });
  ipcMain.on('pet-state', (event, value) => {
    if (event.sender !== win.webContents || !value || typeof value.action !== 'string' || typeof value.mode !== 'string') return;
    lastPetState = { action: value.action.slice(0,30), mode: value.mode.slice(0,30) };
    controlsWin?.webContents.send('pet-state', lastPetState);
  });
  ipcMain.on('preference', (event, key, value) => setPreference(key, value));
  ipcMain.on('scale', (event, scale) => { if (Number.isFinite(scale)) resize(scale); });
  ipcMain.on('ignore', (event, value) => { if (typeof value === 'boolean') setIgnore(value); });
  ipcMain.on('hide', () => { closeControls(); win.hide(); });
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('interactive', (event, value) => { if (event.sender && event.sender !== win.webContents) return; automaticInteractive = typeof value === 'object' ? value.character === true : value === true; controlsInteractive = typeof value === 'object' && value.controls === true; applyInput(); });
  ipcMain.on('drag-start', () => { wander = null; drag = { mouse: screen.getCursorScreenPoint(), bounds: {...win.getBounds(),...petSize} }; applyInput(); });
  ipcMain.on('drag-end', () => { drag = null; const clamped=core.clampBounds({...win.getBounds(),...petSize},areas());movePet(clamped.x,clamped.y); applyInput(); laterSave(); });
  ipcMain.on('wander', (event, direction) => {
    if (event.sender !== win.webContents) return;
    if (direction === 1 || direction === -1) {
      closeControls();
      wander = { direction, until: Date.now() + 12000 };
    } else wander = null;
  });
  ipcMain.handle('chat-config', () => ({ configured: !!apiKey, provider: 'OpenRouter', model: 'openrouter/free' }));
  ipcMain.handle('chat-key', (_event, value) => {
    if (typeof value !== 'string' || value.trim().length < 20 || value.length > 512 || /\s/.test(value.trim())) return { ok: false, error: '请填写完整的 OpenRouter API Key。' };
    const next = value.trim();
    try {
      if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: '系统加密暂不可用，密钥未保存。' };
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'chat-key.bin'), safeStorage.encryptString(next));
      pendingChat?.abort(); apiKey = next; chatHistory = [];
      return { ok: true };
    } catch { return { ok: false, error: '未能加密保存密钥，请检查目录权限。' }; }
  });
  ipcMain.handle('chat-clear-key', () => {
    pendingChat?.abort(); apiKey = ''; chatHistory = [];
    try { fs.rmSync(path.join(app.getPath('userData'), 'chat-key.bin'), { force: true }); return { ok: true }; }
    catch { return { ok: false, error: '本次已断开，但未能删除本地密钥文件，请检查目录权限。' }; }
  });
  ipcMain.handle('chat-send', async (_event, text) => {
    if (pendingChat) return { ok: false, error: '上一句还在等待，可以先取消。' };
    const request = new AbortController(); pendingChat = request;
    try {
      const answer = await requestReply({ key: apiKey, text, history: chatHistory, signal: request.signal });
      if (request.signal.aborted) return { ok: false, error: '已取消这次对话。' };
      chatHistory.push({ role: 'user', content: text.trim() }, { role: 'assistant', content: answer }); chatHistory = chatHistory.slice(-12);
      return { ok: true, text: answer };
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (pendingChat === request) pendingChat = null; }
  });
  ipcMain.on('chat-cancel', () => pendingChat?.abort());
  ipcMain.on('chat-reset', () => { pendingChat?.abort(); pendingChat = null; chatHistory = []; });
  ipcMain.on('open-key-page', () => shell.openExternal('https://openrouter.ai/settings/keys'));
  ipcMain.on('renderer-ready', event => { sendSettings(); if (controlsWin && event.sender === controlsWin.webContents) { event.sender.send('surface', controlsSurface); event.sender.send('pet-state', lastPetState); } });
}
async function create() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let raw;
  try { raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') savedError = '旧设置未能读取，已用默认显示设置启动。'; }
  settings = core.sanitizeSettings(raw);
  if (raw?.layoutVersion !== 2) settings.scale = .65;
  try { apiKey = safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'), 'chat-key.bin'))); } catch { apiKey = ''; }
  const area = screen.getPrimaryDisplay().workArea;
  const {width,height}=stableSize(settings.scale);petSize={width,height};
  const bounds = core.clampBounds({ x: settings.x ?? area.x + area.width - width - 24, y: settings.y ?? area.y + area.height - height, width, height }, areas());
  activeDisplayId=screen.getDisplayMatching(bounds).id;
  win = new BrowserWindow({ ...bounds, title: 'GPT 龙娘 · 陪你一会儿', frame: false, thickFrame:false, roundedCorners:false, transparent: true, backgroundColor: '#00000000', resizable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: settings.top, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('move', () => { laterSave(); positionControls(); });
  win.on('resize', () => positionControls());
  win.on('close', event => { if (!quitting) { event.preventDefault(); closeControls(); win.hide(); } });
  win.webContents.on('render-process-gone', () => { drag = null; manualIgnore = false; win.setIgnoreMouseEvents(false); win.reload(); });
  const atlas = nativeImage.createFromPath(path.join(__dirname, '../assets/character-sheet.png'));
  const size = atlas.getSize();
  const icon = atlas.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==') : atlas.crop({ x: Math.round(size.width / 9), y: 2, width: Math.round(size.width / 9), height: Math.round(size.width / 9) }).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('GPT 龙娘 · 右键菜单 / 双击恢复交互');
  tray.on('double-click', recover);
  updateTray(); installHandlers();
  shortcutAvailable = globalShortcut.register('CommandOrControl+Alt+Shift+D', recover);
  screen.on('display-removed', recover);
  screen.on('display-metrics-changed', () => {const display=screen.getDisplayMatching(win.getBounds());activeDisplayId=display.id;petSize=stableSize(settings.scale,display);win.setBounds(core.clampBounds({...win.getBounds(),...petSize},areas()));sendSettings();});
  let previousTick = Date.now(), walkRemainder = 0, lastCursor = '';
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const tick = Date.now(), elapsed = Math.min(100, tick - previousTick); previousTick = tick;
    const mouse = screen.getCursorScreenPoint();
    if (drag) {
      const target=core.clampBounds({...drag.bounds,x:drag.bounds.x+mouse.x-drag.mouse.x,y:drag.bounds.y+mouse.y-drag.mouse.y},areas());
      const current=win.getBounds();
      if(current.x!==target.x||current.y!==target.y) movePet(target.x,target.y);
    }
    else if (wander && Date.now() < wander.until && win.isVisible() && !controlsWin?.isVisible()) {
      walkRemainder += elapsed * .028;
      const step = Math.floor(walkRemainder); walkRemainder -= step;
      if (step) {
        const b = win.getBounds(); const next = core.clampBounds({ ...b, x: b.x + wander.direction * step }, areas());
        if (next.x === b.x) { wander = null; dispatch('stop'); }
        else movePet(next.x, next.y);
      }
    } else if (wander && Date.now() >= wander.until) wander = null;
    if (win.isVisible()) { const b = win.getBounds(); const x = mouse.x - b.x, y = mouse.y - b.y, signature = x + ':' + y; if (signature !== lastCursor) { lastCursor = signature; win.webContents.send('cursor', { x, y }); } }
  }, 16);
  await win.loadFile(path.join(__dirname, 'index.html'));
  win.showInactive();
}
app.on('second-instance', recover);
app.on('before-quit', () => { quitting = true; pendingChat?.abort(); if (settingsPath) persist(); clearInterval(cursorTimer); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
if (locked) app.whenReady().then(create).catch(error => { console.error(error); app.quit(); });
