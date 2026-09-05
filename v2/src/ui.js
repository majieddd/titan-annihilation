import * as THREE from 'three';
import { DEFS, BUILD_LISTS, BUILD_TABS, TEAM_COLORS } from './defs.js';
import { ICONS, iconCanvas } from './effects.js';
import { fmtTime, fmtNum, clamp, colorHex, smoothstep, angleBetween, frameQuat, keyCode } from './util.js';

const $ = (id) => document.getElementById(id);
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

export class UI {
  constructor(app) {
    this.app = app; this.sel = []; this.placing = null; this.ghost = null; this.mode = null; this.groups = {}; this.alerts = [];
    this.tab = 'econ'; this.mouse = { x: 0, y: 0 }; this.boxStart = null; this.boxing = false; this.lastKeyT = {};
    this.hudT = 0; this.fps = 0; this.frames = 0; this.fpsT = 0; this.selDirty = true; this.panelT = 0; this.lastAlert = null; this.shiftDown = false; this.barT = 0; this.barDirty = true;
    this.bind();
  }
  get game() { return this.app.game; }
  get cam() { return this.app.cam; }
  bind() {
    const canvas = this.app.canvas;
    canvas.addEventListener('mousedown', (e) => { if (this.app.state !== 'playing') return; canvas.focus(); if (e.button === 0) { if (this.placing || this.mode) return; this.boxStart = { x: e.clientX, y: e.clientY }; this.boxing = false; } });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.boxStart && !this.boxing && (Math.abs(e.clientX - this.boxStart.x) + Math.abs(e.clientY - this.boxStart.y)) > 6) { this.boxing = true; $('selbox').classList.remove('hidden'); }
      if (this.boxing) { const b = $('selbox'); const x = Math.min(e.clientX, this.boxStart.x), y = Math.min(e.clientY, this.boxStart.y); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.width = Math.abs(e.clientX - this.boxStart.x) + 'px'; b.style.height = Math.abs(e.clientY - this.boxStart.y) + 'px'; }
    });
    window.addEventListener('mouseup', (e) => {
      if (this.app.state !== 'playing') { this.boxStart = null; this.boxing = false; $('selbox').classList.add('hidden'); return; }
      if (e.button === 0) {
        const onCanvas = e.target === canvas;
        if (this.placing) { if (onCanvas) this.place(e.shiftKey); }
        else if (this.mode && onCanvas) { this.commandAt(e.clientX, e.clientY, e.shiftKey, true); }
        else if (this.boxing) { this.boxSelect(this.boxStart.x, this.boxStart.y, e.clientX, e.clientY, e.shiftKey); }
        else if (this.boxStart && onCanvas) { this.clickSelect(e.clientX, e.clientY, e.shiftKey); }
        this.boxStart = null; this.boxing = false; $('selbox').classList.add('hidden');
      } else if (e.button === 2 && e.target === canvas) {
        if (this.cam.dragMoved < 5) { if (this.placing) this.stopPlacing(); else if (this.mode) this.mode = null; else this.commandAt(e.clientX, e.clientY, e.shiftKey, false); }
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (e.key === '[' || e.key === ']') { this.app.cycleStyle(e.key === ']' ? 1 : -1); e.preventDefault(); return; }
      if (e.key === 'Shift') this.shiftDown = true;
      if (this.app.state !== 'playing') return;
      const k = keyCode(e);
      if (k === 'Escape') { if (this.placing) this.stopPlacing(); else if (this.mode) this.mode = null; else this.select([]); }
      else if (k === 'KeyA' && !e.ctrlKey && !e.metaKey) { if (this.ownSel().some((u) => u.def.weapons && u.def.mobile)) this.mode = 'attack'; }
      else if (k === 'KeyS' && !e.ctrlKey && !e.metaKey) { this.game.orderStop(this.ownSel()); this.mode = null; }
      else if (k === 'KeyR') { if (this.ownSel().some((u) => u.factory)) this.mode = 'rally'; }
      else if (k === 'KeyL') { this.toggleLoop(); }
      else if (k === 'KeyN') { if (this.ownSel().some((u) => u.def.silo && u.def.silo.ammo === 'nuke' && u.silo.ammo > 0)) this.mode = 'nuke'; else this.selectNukeLauncher(); }
      else if (k === 'KeyV') { this.toggleSystem(); }
      else if (k === 'KeyP') { this.app.togglePause(); }
      else if (k === 'Home' || k === 'KeyH') { const c = this.game.teams[0].commander; if (c && !c.dead) { this.cam.jumpTo(c.planet, c.dir, Math.min(this.cam.targetDist, 90)); if (k === 'KeyH') this.select([c]); } }
      else if (k === 'Space') { if (this.lastAlert) this.cam.jumpTo(this.lastAlert.planet, this.lastAlert.dir, Math.min(this.cam.targetDist, 120)); e.preventDefault(); }
      else if (k === 'Tab') { e.preventDefault(); this.selectIdleFabber(); }
      else if (/^Digit[1-9]$/.test(k)) {
        const n = k[5];
        if (e.ctrlKey || e.metaKey) { this.groups[n] = this.ownSel().slice(); e.preventDefault(); }
        else { const g = (this.groups[n] || []).filter((u) => !u.dead); if (g.length) { const now = performance.now(); if (this.lastKeyT[n] && now - this.lastKeyT[n] < 400) this.cam.jumpTo(g[0].planet, g[0].dir); this.lastKeyT[n] = now; this.select(g); } }
      }
      else if (k === 'Delete' && (e.ctrlKey || e.metaKey)) { for (const u of this.ownSel()) if (u.def.kind !== 'commander') this.game.kill(u, null); }
    });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.shiftDown = false; });
    canvas.addEventListener('dblclick', (e) => { if (this.app.state !== 'playing' || this.placing) return; const u = this.pickUnit(e.clientX, e.clientY); if (u && u.team === 0) this.selectAllOfType(u.def.id); });
    $('btnAgain').addEventListener('click', () => this.app.startGame());
    $('btnMenu').addEventListener('click', () => this.app.toMenu());
    for (const id of ['optDiff', 'optBiome', 'optQuality', 'optPlanets']) {
      $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $(id).querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); this.app.audio.click(); this.readSettings(); if (id !== 'optDiff') this.app.regenPlanet(); }));
    }
    $('btnRandom').addEventListener('click', () => { $('optSeed').value = Math.random().toString(36).slice(2, 8); this.readSettings(); this.app.regenPlanet(); });
    $('optSeed').addEventListener('change', () => { this.readSettings(); this.app.regenPlanet(); });
    $('launch').addEventListener('click', () => { this.readSettings(); this.app.startGame(); });
    $('optStyle').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('optStyle').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); this.app.setStyle(b.dataset.v); }));
    $('styleSel').addEventListener('change', (e) => { this.app.setStyle(e.target.value); e.target.blur(); });
    $('styleSel').addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); });
    $('styleSel').addEventListener('blur', () => { this.cam.keys = {}; });
  }
  readSettings() {
    const s = this.app.settings;
    s.difficulty = $('optDiff').querySelector('.active').dataset.v; s.biome = $('optBiome').querySelector('.active').dataset.v; s.quality = $('optQuality').querySelector('.active').dataset.v; s.planets = parseInt($('optPlanets').querySelector('.active').dataset.v, 10); s.seed = $('optSeed').value || 'titan'; const sb = $('optStyle').querySelector('.active'); if (sb) s.style = sb.dataset.v;
    try { localStorage.setItem('ta_settings', JSON.stringify(s)); } catch (e) { }
  }
  applySettings() {
    const s = this.app.settings;
    for (const [id, v] of [['optDiff', s.difficulty], ['optBiome', s.biome], ['optQuality', s.quality], ['optPlanets', String(s.planets)]]) $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    $('optSeed').value = s.seed; this.syncStyle();
  }
  hint(msg, ms = 2600) { $('hint').textContent = msg; this._hintUntil = performance.now() + ms; }
  syncStyle() {
    const id = this.app.style ? this.app.style.id : this.app.settings.style;
    $('optStyle').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === id)); const sel = $('styleSel'); if (sel.value !== id) sel.value = id;
    const st = this.app.style; if (st) $('styleHint').textContent = st.hint;
  }
  // ---------- selection ----------
  ownSel() { return this.sel.filter((u) => !u.dead && u.team === 0); }
  select(units) { this.sel = units.filter((u) => !u.dead); this.selDirty = true; this.mode = null; if (this.placing) this.stopPlacing(); this.app.audio.click(); }
  visible(u) { const p = u.planet; if (u.transit) return true; return u.dir.dot(p._camDir) > p._horizonDot; }
  updateHorizons() { const cp = this.cam.camera.position; for (const p of this.app.system.planets) { p._camDir = p._camDir || new THREE.Vector3(); p._camDir.copy(cp).sub(p.center); const l = p._camDir.length(); p._camDir.multiplyScalar(1 / l); p._horizonDot = (p.R - 2) / l; } }
  pickUnit(x, y) {
    const g = this.game; if (!g) return null; let best = null, bd = Infinity;
    const cam = this.cam; const H = this.app.canvas.clientHeight; const f = (H / 2) / Math.tan(THREE.MathUtils.degToRad(cam.camera.fov) / 2);
    const iconMode = cam.mode === 'system' || cam.dist > 90;
    for (const u of g.units) {
      if (u.dead || (u.progress <= 0 && u.team !== 0)) continue; if (!this.visible(u)) continue;
      if (!cam.worldToScreen(u.pos, _p)) continue;
      const dc = u.pos.distanceTo(cam.camera.position); const px = clamp(u.def.radius * f / dc * 1.5, 8, 60); const r = iconMode ? Math.max(px, 13) : px;
      const dx = _p.x - x, dy = _p.y - y; const d = Math.sqrt(dx * dx + dy * dy); if (d < r && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  clickSelect(x, y, shift) {
    const u = this.pickUnit(x, y);
    if (u) { if (shift && u.team === 0) { const i = this.sel.indexOf(u); if (i >= 0) this.sel.splice(i, 1); else if (this.sel.every((s) => s.team === 0)) this.sel.push(u); this.selDirty = true; } else this.select([u]); }
    else if (this.cam.mode === 'system') { const pick = this.cam.pickPlanet(x, y, _d); if (pick) this.app.focusPlanet(pick.planet, pick.dir, pick.planet.R * 3); }
    else if (!shift) this.select([]);
  }
  boxSelect(x0, y0, x1, y1, shift) {
    const g = this.game; const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1); const found = [];
    for (const u of g.teams[0].units) { if (u.dead || !this.visible(u) || !u.built || u.transit) continue; if (!this.cam.worldToScreen(u.pos, _p)) continue; if (_p.x >= xa && _p.x <= xb && _p.y >= ya && _p.y <= yb) found.push(u); }
    let list = found; if (found.some((u) => u.def.mobile)) list = found.filter((u) => u.def.mobile);
    if (shift) { const set = new Set(this.ownSel()); for (const u of list) set.add(u); this.select([...set]); } else if (list.length) this.select(list); else if (!shift) this.select([]);
  }
  selectAllOfType(defId) { const list = this.game.teams[0].units.filter((u) => !u.dead && u.built && u.def.id === defId && this.visible(u)); if (list.length) this.select(list); }
  selectIdleFabber() { const list = this.game.teams[0].units.filter((u) => !u.dead && u.built && u.def.builder && u.def.kind !== 'commander' && !u.orders.length && !u.transit); if (list.length) { const cur = this.sel[0]; const i = list.indexOf(cur); const u = list[(i + 1) % list.length]; this.select([u]); this.cam.jumpTo(u.planet, u.dir); } }
  selectNukeLauncher() { const l = this.game.teams[0].units.find((u) => !u.dead && u.built && u.def.silo && u.def.silo.ammo === 'nuke'); if (l) { this.select([l]); if (l.silo.ammo > 0) this.mode = 'nuke'; } }
  toggleSystem() { if (this.cam.mode === 'system') { const p = this.cam.planet; this.app.focusPlanet(p, null, p.R * 3); } else this.cam.enterSystem(); this.barDirty = true; }
  // ---------- commands ----------
  commandAt(x, y, shift, leftClick) {
    const g = this.game; const own = this.ownSel().filter((u) => u.built);
    if (this.mode === 'nuke') {
      const pick = this.cam.pickPlanet(x, y, _d); const L = own.find((u) => u.def.silo && u.def.silo.ammo === 'nuke' && u.silo.ammo > 0);
      if (pick && L) { g.fireNuke(L, pick.planet, pick.dir); this.alert(`Nuclear missile launched at ${pick.planet.name}`, 'warn', pick.planet, pick.dir.clone()); }
      this.mode = null; return;
    }
    if (!own.length) { this.mode = null; return; }
    const pick = this.cam.pickPlanet(x, y, _d);
    if (this.mode === 'rally') { if (pick) { for (const f of own) if (f.factory && f.planet === pick.planet) g.setRally(f, pick.dir); this.feedback(pick.planet, pick.dir, [0.3, 1, 0.5]); } this.mode = null; return; }
    const target = this.pickUnit(x, y);
    if (target && target.team === 0 && target.def.teleporter && own.length === 1 && own[0].def.teleporter && own[0] !== target) { if (g.linkTeleporters(own[0], target)) this.alert(`Teleporter linked: ${own[0].planet.name} ⇄ ${target.planet.name}`, 'good', target.planet, target.dir); this.mode = null; this.selDirty = true; return; }
    if (target && target.team !== 0 && target.progress > 0) { g.orderAttack(own, target, shift); this.feedback(target.planet, target.dir, [1, 0.3, 0.2]); if (!own.some((u) => g.canReach(u, target.planet))) this.alert('No route to that planet: link teleporters or use orbital units', 'warn', null); }
    else if (target && target.team === 0 && (!target.built || target.factory || target.silo) && own.some((u) => u.def.builder)) { g.orderBuild(own.filter((u) => u.def.builder), target, shift); this.feedback(target.planet, target.dir, [0.4, 1, 0.6]); }
    else if (pick) {
      const n = this.mode === 'attack' ? g.orderAttackMove(own, pick.planet, pick.dir, shift) : g.orderMove(own, pick.planet, pick.dir, shift);
      this.feedback(pick.planet, pick.dir, this.mode === 'attack' ? [1, 0.5, 0.2] : [0.3, 0.9, 1.0]);
      if (n === 0 && own.some((u) => u.def.mobile)) this.alert(`Cannot reach ${pick.planet.name}: link teleporters or use orbital units`, 'warn', null);
    }
    this.mode = null; this.app.audio.click();
  }
  feedback(planet, dir, col) { planet.surfacePoint(dir, 0.3, _p); this.app.fx.ring(_p, dir, col, 4, 0.45); }
  toggleLoop() { for (const f of this.ownSel()) { if (f.factory) f.factory.loop = !f.factory.loop; if (f.silo) f.silo.active = !f.silo.active; } this.selDirty = true; }
  // ---------- placement ----------
  startPlacing(defId) { this.stopPlacing(); this.mode = null; this.placing = { defId, valid: false, dir: new THREE.Vector3(), planet: null, reason: '' }; this.ghost = this.app.unitRenderer.createGhost(defId); this.app.scene.add(this.ghost); }
  stopPlacing() { if (this.ghost) { this.app.scene.remove(this.ghost); this.ghost = null; } this.placing = null; this.selDirty = true; }
  updateGhost() {
    const p = this.placing; if (!p) return;
    const pick = this.cam.pickPlanet(this.mouse.x, this.mouse.y, _d);
    if (!pick) { this.ghost.visible = false; p.valid = false; p.reason = ''; return; }
    p.planet = pick.planet;
    const builders = this.ownSel().filter((u) => u.built && u.def.builder && BUILD_LISTS[u.def.builder.list].includes(p.defId));
    const reachable = builders.some((u) => this.game.canReach(u, pick.planet));
    const c = this.game.canPlace(p.defId, 0, pick.planet, pick.dir); p.valid = c.ok && reachable; p.reason = !reachable ? `No selected builder can reach ${pick.planet.name}` : (c.reason || ''); p.dir.copy(c.dir || pick.dir);
    this.ghost.visible = true; pick.planet.surfacePoint(p.dir, 0.25, this.ghost.position);
    this.game.facing(0, pick.planet, p.dir, _s); frameQuat(p.dir, _s, this.ghost.quaternion);
    this.ghost.userData.mat.color.setRGB(p.valid ? 0.3 : 1.0, p.valid ? 1.0 : 0.25, p.valid ? 0.5 : 0.2);
  }
  place(shift) {
    const p = this.placing; if (!p || !p.valid) { if (p) this.app.audio.alert(true); return; }
    const s = this.game.placeStructure(p.defId, 0, p.planet, p.dir); if (!s) return;
    const builders = this.ownSel().filter((u) => u.built && u.def.builder && BUILD_LISTS[u.def.builder.list].includes(p.defId));
    this.game.orderBuild(builders, s, shift); this.app.audio.place();
    if (!shift) this.stopPlacing(); else this.selDirty = true;
  }
  // ---------- per-frame overlays ----------
  frame() {
    const g = this.game; const cam = this.cam; const fx = this.app.fx; if (!g) return;
    this.updateHorizons();
    if (this.sel.some((u) => u.dead)) { this.sel = this.sel.filter((u) => !u.dead); this.selDirty = true; }
    const sys = cam.mode === 'system';
    const iconAlpha = sys ? 1 : smoothstep(55, 130, cam.dist); fx.icons.uniforms.uAlpha.value = iconAlpha;
    const showBars = !sys && cam.dist < 320; const selSet = this.selSet || (this.selSet = new Set()); selSet.clear(); for (const u of this.sel) selSet.add(u);
    const focus = cam.planet;
    for (const u of g.units) {
      if (u.dead || u.drop > 0) continue; if (u.progress <= 0 && u.team !== 0) continue;
      if (!this.visible(u)) continue;
      const col = TEAM_COLORS[u.team]; const sel = selSet.has(u); const onFocus = u.planet === focus && !sys;
      const strategic = u.def.kind === 'structure' || u.def.kind === 'commander' || u.def.isTitan;
      if (iconAlpha > 0.01 && (onFocus || strategic || u.transit)) { const size = (u.def.isTitan ? 30 : (u.def.kind === 'commander' ? 26 : (u.def.kind === 'structure' ? 17 : 15))) * (onFocus ? 1 : 0.7); _p.copy(u.pos).addScaledVector(u.dir, 2); fx.icons.add(_p, ICONS.indexOf(u.def.icon), col, sel ? 1 : 0, size); }
      if (showBars && onFocus && (u.hp < u.def.hp * 0.999 || !u.built || sel || (u.silo && sel))) { _p.copy(u.pos).addScaledVector(u.dir, u.def.height + 1); fx.bars.add(_p, u.built ? clamp(u.hp / u.def.hp, 0, 1) : u.progress, u.built ? 0 : 1, clamp(u.def.radius * 12, 22, 70)); if (u.silo && u.built) { _p.addScaledVector(u.dir, 1.5); fx.bars.add(_p, u.silo.ammo >= u.def.silo.max ? 1 : u.silo.progress, 2, clamp(u.def.radius * 12, 22, 70)); } }
      if (sel && !u.transit) fx.addSelRing(u.pos, u.dir, u.def.radius * 1.5 + 0.6, col);
      if (u.def.teleporter && u.team === 0 && u.link && u.built && u.link.built && u.id < u.link.id) fx.linkLine(u.pos, u.link.pos, [0.3, 0.9, 1.0]);
    }
    if (this.sel.length <= 3) for (const u of this.sel) { if (u.team !== 0) continue; if (u.def.weapons && !u.def.mobile) fx.addRangeRing(u.pos, u.dir, u.def.weapons[0].range, [0.6, 0.9, 1.0]); if (u.def.antinukeRange && u.built) fx.addRangeRing(u.pos, u.dir, u.def.antinukeRange, [0.5, 1.0, 0.6]); }
    if (this.placing) { this.updateGhost(); const d = DEFS[this.placing.defId]; if (this.ghost.visible && (d.weapons || d.antinukeRange)) fx.addRangeRing(this.ghost.position, this.placing.dir, d.antinukeRange || d.weapons[0].range, [0.6, 0.9, 1.0]); }
    if (this.mode === 'nuke') { const pick = cam.pickPlanet(this.mouse.x, this.mouse.y, _d); if (pick) { pick.planet.surfacePoint(pick.dir, 0.5, _p); fx.addRangeRing(_p, pick.dir, 58, [1.0, 0.25, 0.2]); fx.addRangeRing(_p, pick.dir, 20, [1.0, 0.5, 0.2]); } }
  }
  // ---------- HUD ----------
  update(dt) {
    this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    this.hudT += dt; if (this.hudT >= 0.1) { this.hudT = 0; this.updateHud(); }
    this.panelT += dt; if (this.selDirty || this.panelT > 0.4) { this.panelT = 0; this.renderPanels(); this.selDirty = false; }
    this.barT += dt; if (this.barDirty || this.barT > 0.6) { this.barT = 0; this.barDirty = false; this.renderPlanetBar(); }
    this.updateAlerts(dt); this.updateHint();
  }
  updateHud() {
    const g = this.game; if (!g) return; const T = g.teams[0];
    $('metalVal').textContent = fmtNum(T.metal); $('metalFill').style.width = (T.metal / T.metalCap * 100).toFixed(1) + '%';
    $('energyVal').textContent = fmtNum(T.energy); $('energyFill').style.width = (T.energy / T.energyCap * 100).toFixed(1) + '%';
    const mr = $('metalRate'); mr.textContent = `+${fmtNum(T.incomeM)} -${fmtNum(T.expenseM || 0)}`; mr.classList.toggle('neg', T.incomeM - (T.expenseM || 0) < 0);
    const er = $('energyRate'); er.textContent = `+${fmtNum(T.incomeE)} -${fmtNum(T.expenseE || 0)}`; er.classList.toggle('neg', T.incomeE - (T.expenseE || 0) < 0);
    $('resMetal').classList.toggle('stall', T.stallM && T.lastDemandM > 0); $('resEnergy').classList.toggle('stall', T.stallE && T.lastDemandM > 0);
    $('clock').textContent = fmtTime(g.time); $('unitCount').textContent = `UNITS ${T.units.filter((u) => u.built).length}`; $('fps').textContent = `${this.fps} FPS`;
  }
  renderPlanetBar() {
    const bar = $('planetbar'); const g = this.game; if (!g) return; bar.innerHTML = '';
    const sys = this.cam.mode === 'system';
    for (const p of this.app.system.planets) {
      const b = document.createElement('button'); b.className = 'pbtn' + (!sys && this.cam.planet === p ? ' active' : '');
      const mine = g.teams[0].units.filter((u) => u.planet === p && !u.dead && u.built).length; const enemy = g.teams[1].units.filter((u) => u.planet === p && !u.dead && u.built && u.def.weapons).length;
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = colorHex(p.biome.atmo); b.appendChild(sw);
      b.appendChild(document.createTextNode(p.name.toUpperCase()));
      const c = document.createElement('span'); c.className = 'cnt'; c.textContent = `${mine}${enemy ? ' · ' + enemy + '⚔' : ''}`; b.appendChild(c);
      if (enemy && mine) b.classList.add('threat');
      b.title = `${p.biome.name} · radius ${p.R} · ${p.spots.length} metal spots`;
      b.addEventListener('click', () => { const c = g.teams[0].commander; const dir = (c && !c.dead && c.planet === p) ? c.dir : null; this.app.focusPlanet(p, dir, Math.min(this.cam.targetDist, p.R * 0.6)); this.barDirty = true; });
      bar.appendChild(b);
    }
    const s = document.createElement('button'); s.className = 'pbtn' + (sys ? ' active' : ''); s.textContent = 'SYSTEM (V)'; s.addEventListener('click', () => this.toggleSystem()); bar.appendChild(s);
  }
  updateHint() {
    const h = $('hint'); const m = $('modeTag');
    if (this._hintUntil > performance.now() && !this.placing && !this.mode) { m.textContent = ''; return; }
    if (this.placing) { const d = DEFS[this.placing.defId]; h.textContent = this.placing.valid ? `Place ${d.name} on ${this.placing.planet ? this.placing.planet.name : ''} — click to build, shift for multiple, Esc to cancel` : (this.placing.reason || 'Cannot build here'); m.textContent = 'PLACEMENT'; }
    else if (this.mode === 'attack') { h.textContent = 'Attack-move: click a location or target (any planet)'; m.textContent = 'ATTACK MOVE'; }
    else if (this.mode === 'rally') { h.textContent = 'Click to set the factory rally point'; m.textContent = 'SET RALLY'; }
    else if (this.mode === 'nuke') { h.textContent = 'NUCLEAR STRIKE: click the target on any planet'; m.textContent = 'NUKE TARGETING'; }
    else if (this.cam.mode === 'system') { h.textContent = 'System view — click a planet or scroll in to focus it'; m.textContent = 'SYSTEM VIEW'; }
    else { h.textContent = ''; m.textContent = ''; }
  }
  renderPanels() {
    const own = this.ownSel(); const sel = this.sel.filter((u) => !u.dead);
    const title = $('selTitle'), info = $('selInfo'), grid = $('selGrid'); grid.innerHTML = '';
    if (!sel.length) { title.textContent = 'No selection'; info.textContent = 'Left-drag to select units. Right-click to issue orders. V toggles the system view.'; }
    else if (sel.length === 1) {
      const u = sel[0]; const d = u.def; title.textContent = d.name + (u.team !== 0 ? ' (enemy)' : '') + ' · ' + u.planet.name;
      let s = `HP ${fmtNum(u.hp)} / ${fmtNum(d.hp)}`; if (!u.built) s += ` · building ${(u.progress * 100).toFixed(0)}%`;
      if (d.weapons) { const w = d.weapons[0]; s += ` · DPS ${fmtNum(w.dmg * w.rof)} · range ${w.range}`; }
      if (d.econ) { if (d.econ.metal) s += ` · +${d.econ.metal} metal/s`; if (d.econ.energy) s += ` · +${d.econ.energy} energy/s`; }
      if (d.builder) s += ` · build ${d.builder.rate} m/s`;
      if (u.factory) { const c = u.factory.current; s += c ? ` · producing ${c.def.name} ${(c.progress * 100).toFixed(0)}%` : ' · idle'; if (u.factory.loop) s += ' · LOOP'; }
      if (u.silo) s += ` · ${d.silo.ammo === 'nuke' ? 'Nukes' : 'Interceptors'} ${u.silo.ammo}/${d.silo.max}` + (u.silo.ammo < d.silo.max ? ` · building ${(u.silo.progress * 100).toFixed(0)}%${u.silo.active ? '' : ' (paused)'}` : ' · READY');
      if (d.teleporter) s += u.link ? ` · linked to ${u.link.planet.name}` : ' · unlinked: right-click another teleporter';
      if (u.transit) s += ` · in transit to ${u.transit.to.name}`;
      if (u.orders.length) s += ` · ${u.orders[0].type}`;
      info.textContent = s;
    } else { title.textContent = `${sel.length} units`; let hp = 0, max = 0; for (const u of sel) { hp += u.hp; max += u.def.hp; } info.textContent = `Total HP ${fmtNum(hp)} / ${fmtNum(max)}`; }
    if (sel.length > 1) {
      const counts = new Map(); for (const u of sel) counts.set(u.def.id, (counts.get(u.def.id) || 0) + 1);
      for (const [id, n] of counts) {
        const d = DEFS[id]; const el = document.createElement('div'); el.className = 'selItem'; el.title = d.name;
        el.appendChild(iconCanvas(d.icon, colorHex(TEAM_COLORS[sel[0].team]), 44)); const c = document.createElement('span'); c.className = 'cnt'; c.textContent = n; el.appendChild(c);
        el.addEventListener('click', () => this.select(sel.filter((u) => u.def.id === id))); grid.appendChild(el);
      }
    }
    const tabs = $('buildTabs'), bgrid = $('buildGrid'), qrow = $('queueRow'); tabs.innerHTML = ''; bgrid.innerHTML = ''; qrow.innerHTML = '';
    const builders = own.filter((u) => u.built && u.def.builder); const factories = own.filter((u) => u.built && u.factory);
    if (builders.length) {
      const list = new Set(); for (const b of builders) for (const id of BUILD_LISTS[b.def.builder.list]) list.add(id);
      const usable = BUILD_TABS.filter((t) => t.ids.some((id) => list.has(id)));
      if (!usable.some((t) => t.id === this.tab)) this.tab = usable[0].id;
      for (const t of usable) { const b = document.createElement('button'); b.textContent = t.name; if (t.id === this.tab) b.classList.add('active'); b.addEventListener('click', () => { this.tab = t.id; this.selDirty = true; this.app.audio.click(); }); tabs.appendChild(b); }
      const cur = usable.find((t) => t.id === this.tab);
      for (const id of cur.ids) { if (!list.has(id)) continue; bgrid.appendChild(this.buildButton(id, () => this.startPlacing(id), this.placing && this.placing.defId === id)); }
    } else if (factories.length) {
      const f = factories[0]; const units = f.def.factory.units;
      const lbl = document.createElement('button'); lbl.textContent = f.def.name; lbl.classList.add('active'); tabs.appendChild(lbl);
      const loop = document.createElement('button'); loop.textContent = f.factory.loop ? 'LOOP: ON' : 'LOOP: OFF'; loop.addEventListener('click', () => { this.toggleLoop(); this.app.audio.click(); }); tabs.appendChild(loop);
      const rally = document.createElement('button'); rally.textContent = 'RALLY (R)'; rally.addEventListener('click', () => { this.mode = 'rally'; }); tabs.appendChild(rally);
      const qc = {}; for (const id of f.factory.queue) qc[id] = (qc[id] || 0) + 1;
      for (const id of units) {
        const b = this.buildButton(id, (e) => { for (const ff of factories) this.game.factoryQueue(ff, id, e.shiftKey ? 5 : 1); this.selDirty = true; this.app.audio.click(); }, false, qc[id]);
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); const i = f.factory.queue.lastIndexOf(id); if (i >= 0) { this.game.factoryDequeue(f, i); this.selDirty = true; } });
        bgrid.appendChild(b);
      }
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'QUEUE'; qrow.appendChild(l);
      if (f.factory.current) { const c = f.factory.current; const qi = document.createElement('div'); qi.className = 'qi'; qi.appendChild(iconCanvas(c.def.icon, '#9be7ff', 28)); const pr = document.createElement('div'); pr.className = 'prog'; pr.style.width = (c.progress * 100).toFixed(0) + '%'; qi.appendChild(pr); qi.title = c.def.name; qrow.appendChild(qi); }
      f.factory.queue.slice(0, 12).forEach((id, i) => { const qi = document.createElement('div'); qi.className = 'qi'; qi.appendChild(iconCanvas(DEFS[id].icon, '#7fa3c0', 28)); qi.title = DEFS[id].name + ' (click to remove)'; qi.addEventListener('click', () => { this.game.factoryDequeue(f, i); this.selDirty = true; }); qrow.appendChild(qi); });
      if (f.factory.queue.length > 12) { const m = document.createElement('span'); m.className = 'lbl'; m.textContent = `+${f.factory.queue.length - 12}`; qrow.appendChild(m); }
    } else if (own.length === 1 && own[0].silo && own[0].built) {
      const u = own[0]; const d = u.def; const lbl = document.createElement('button'); lbl.textContent = d.name; lbl.classList.add('active'); tabs.appendChild(lbl);
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = `${d.silo.ammo === 'nuke' ? 'NUKE' : 'INTERCEPTOR'} ${u.silo.ammo}/${d.silo.max} · ${(u.silo.progress * 100).toFixed(0)}% · cost ${fmtNum(d.silo.cost)} metal each`; qrow.appendChild(l);
      const b = this.buildButton(d.silo.ammo === 'nuke' ? 'nuke_launcher' : 'antinuke', () => { this.toggleLoop(); }, u.silo.active); b.querySelector('.nm').textContent = u.silo.active ? 'Building' : 'Paused'; b.querySelector('.cost').textContent = fmtNum(d.silo.cost); bgrid.appendChild(b);
    }
    const cp = $('cmdpanel'); cp.innerHTML = '';
    const mk = (txt, kb, fn, active) => { const b = document.createElement('button'); b.innerHTML = `${txt}<span class="kb">${kb}</span>`; if (active) b.classList.add('active'); b.addEventListener('click', fn); cp.appendChild(b); };
    if (own.some((u) => u.def.silo && u.def.silo.ammo === 'nuke' && u.built)) { const ready = own.some((u) => u.silo && u.silo.ammo > 0); mk(ready ? 'LAUNCH NUKE' : 'Nuke not ready', 'N', () => { if (ready) this.mode = 'nuke'; }, this.mode === 'nuke'); }
    if (own.some((u) => u.def.mobile && u.def.weapons)) mk('Attack move', 'A', () => { this.mode = 'attack'; }, this.mode === 'attack');
    if (own.some((u) => u.def.mobile)) mk('Stop', 'S', () => this.game.orderStop(own));
    if (factories.length) { mk('Set rally', 'R', () => { this.mode = 'rally'; }, this.mode === 'rally'); mk('Toggle loop', 'L', () => this.toggleLoop(), factories[0].factory.loop); }
    if (own.some((u) => u.silo)) mk('Toggle production', 'L', () => this.toggleLoop(), own.some((u) => u.silo && u.silo.active));
    if (builders.length) mk('Cancel', 'Esc', () => { this.stopPlacing(); });
    mk(this.cam.mode === 'system' ? 'Planet view' : 'System view', 'V', () => this.toggleSystem());
    mk('Commander', 'H', () => { const c = this.game.teams[0].commander; if (c && !c.dead) { this.cam.jumpTo(c.planet, c.dir, Math.min(this.cam.targetDist, 90)); this.select([c]); } });
    mk(this.app.paused ? 'Resume' : 'Pause', 'P', () => this.app.togglePause(), this.app.paused);
  }
  buildButton(id, onClick, active, count) {
    const d = DEFS[id]; const b = document.createElement('div'); b.className = 'bbtn' + (active ? ' active' : '');
    b.appendChild(iconCanvas(d.icon, d.isTitan ? '#ffd15c' : (d.silo && d.silo.ammo === 'nuke' ? '#ff8a5c' : '#d6ecff'), 30));
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = d.name; b.appendChild(nm);
    const c = document.createElement('div'); c.className = 'cost'; c.textContent = fmtNum(d.cost); b.appendChild(c);
    if (count) { const k = document.createElement('span'); k.className = 'cnt'; k.textContent = count; b.appendChild(k); }
    b.addEventListener('click', (e) => onClick(e));
    b.addEventListener('mouseenter', () => this.showTooltip(d)); b.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
    return b;
  }
  showTooltip(d) {
    const t = $('tooltip'); let s = `<b>${d.name}</b><br>${d.desc || ''}<br><span class="st">Cost ${fmtNum(d.cost)} metal · HP ${fmtNum(d.hp)}`;
    if (d.speed) s += ` · Speed ${d.speed}`; if (d.weapons) { const w = d.weapons[0]; s += ` · DPS ${fmtNum(w.dmg * w.rof)} · Range ${w.range}` + (w.targets === 'a' ? ' (air only)' : w.targets === 'o' ? ' (orbital only)' : w.targets === 'ga' ? ' (ground+air)' : w.targets === 'go' ? ' (ground+orbital)' : ''); }
    if (d.econ) { if (d.econ.metal) s += ` · +${d.econ.metal} metal/s`; if (d.econ.energy) s += ` · +${d.econ.energy} energy/s`; }
    if (d.builder) s += ` · Build rate ${d.builder.rate}`; if (d.factory) s += ` · Build rate ${d.factory.rate}`; if (d.silo) s += ` · Ammo cost ${fmtNum(d.silo.cost)}`;
    if (d.layer === 'orbital') s += ' · Orbital: can travel between planets';
    s += '</span>'; t.innerHTML = s; t.classList.remove('hidden');
    const r = $('buildpanel').getBoundingClientRect(); t.style.left = Math.min(this.mouse.x, innerWidth - 280) + 'px'; t.style.top = (r.top - 118) + 'px';
  }
  // ---------- alerts ----------
  onEvent(e) {
    const g = this.game;
    switch (e.type) {
      case 'alert': if (e.kind === 'cmd') this.alert('COMMANDER UNDER ATTACK', 'bad', e.unit.planet, e.unit.dir, true); else this.alert(`Base under attack on ${e.unit.planet.name}`, 'warn', e.unit.planet, e.unit.dir, true); break;
      case 'titan': this.alert(e.unit.team === 0 ? `Titan complete: ${e.unit.def.name}` : `ENEMY TITAN DETECTED: ${e.unit.def.name}`, e.unit.team === 0 ? 'good' : 'bad', e.unit.planet, e.unit.dir, e.unit.team !== 0); break;
      case 'built': if (e.unit.team === 0 && e.unit.def.kind === 'structure' && (e.unit.def.factory || e.unit.def.tier >= 2 || e.unit.def.teleporter || e.unit.def.silo)) this.alert(`${e.unit.def.name} complete on ${e.unit.planet.name}`, 'info', e.unit.planet, e.unit.dir); break;
      case 'died': if (e.unit.team === 0 && e.unit.def.kind === 'structure' && e.unit.built) { if (g.time - (this.lastLossT || -99) > 6) { this.lastLossT = g.time; this.alert(`${e.unit.def.name} destroyed on ${e.unit.planet.name}`, 'bad', e.unit.planet, e.unit.dir); } } break;
      case 'landed': if (e.unit.team === 0) this.alert(`Commander landed on ${e.unit.planet.name}. Build extractors and an energy plant.`, 'info', e.unit.planet, e.unit.dir); break;
      case 'commanderDied': this.alert(e.unit.team === 0 ? 'COMMANDER LOST' : 'ENEMY COMMANDER DESTROYED', e.unit.team === 0 ? 'bad' : 'good', e.unit.planet, e.unit.dir); break;
      case 'shake': { const d = e.pos.distanceTo(this.cam.anchor); const f = clamp(1 - d / 220, 0, 1) * clamp(1 - this.cam.dist / 500, 0.1, 1); if (f > 0) this.cam.addShake(e.amount * f); break; }
      case 'nukeLaunch': if (e.team !== 0) { this.alert(`NUCLEAR LAUNCH DETECTED — target: ${e.planet.name}`, 'bad', e.planet, e.dir, false); this.app.audio.siren(); } else this.app.audio.alert(false); break;
      case 'nukeIntercept': this.alert(e.by.team === 0 ? 'Anti-nuke launched: intercepting' : 'Enemy anti-nuke intercepting our missile', e.by.team === 0 ? 'good' : 'warn', e.by.planet, e.by.dir); break;
      case 'nukeDestroyed': this.alert('Nuke intercepted', 'info', e.planet, null); break;
      case 'nukeImpact': this.alert(`NUCLEAR DETONATION on ${e.planet.name}`, e.team === 0 ? 'good' : 'bad', e.planet, e.dir, e.team !== 0); break;
      case 'ammo': if (e.unit.team === 0) this.alert(e.unit.def.silo.ammo === 'nuke' ? 'Nuclear missile ready. Press N to target.' : 'Anti-nuke interceptor ready', 'good', e.unit.planet, e.unit.dir, true); break;
      case 'linked': if (e.a.team === 0) this.barDirty = true; break;
      case 'arrived': if (e.unit.team === 0) this.alert(`${e.unit.def.name} arrived at ${e.planet.name}`, 'info', e.planet, e.unit.dir); break;
      case 'teleport': if (e.unit.team === 0 && g.time - (this.lastTeleT || -99) > 8) { this.lastTeleT = g.time; this.alert(`Units teleporting to ${e.planet.name}`, 'info', e.planet, e.unit.dir); } break;
    }
  }
  alert(text, cls, planet, dir, sound) {
    const el = document.createElement('div'); el.className = 'alert ' + cls; el.textContent = text;
    if (planet && dir) { const p = planet, d = dir.clone(); el.addEventListener('click', () => this.cam.jumpTo(p, d, Math.min(this.cam.targetDist, 110))); this.lastAlert = { planet: p, dir: d }; }
    $('alerts').prepend(el); this.alerts.push({ el, t: 9 });
    while (this.alerts.length > 6) { const a = this.alerts.shift(); a.el.remove(); }
    if (sound) this.app.audio.alert(cls === 'bad');
  }
  updateAlerts(dt) { for (let i = this.alerts.length - 1; i >= 0; i--) { const a = this.alerts[i]; a.t -= dt; if (a.t <= 0) { a.el.remove(); this.alerts.splice(i, 1); } else if (a.t < 1) a.el.style.opacity = a.t; } }
  clearAlerts() { for (const a of this.alerts) a.el.remove(); this.alerts = []; this.lastAlert = null; }
  showGameOver(winner, g) {
    const win = winner === 0; $('goTitle').textContent = win ? 'VICTORY' : 'ANNIHILATED'; $('goTitle').className = win ? 'win' : 'lose';
    $('goSub').textContent = win ? 'The enemy commander has been destroyed' : 'Your commander has fallen';
    const T = g.teams[0], E = g.teams[1];
    $('goStats').innerHTML = [['Time', fmtTime(g.time)], ['Difficulty', this.app.settings.difficulty], ['Units built', T.stats.built], ['Units lost', T.stats.lost], ['Enemy units destroyed', T.stats.killed], ['Metal mined', fmtNum(T.stats.metalMined)], ['Damage dealt', fmtNum(T.stats.damageDealt)], ['Nukes fired', `${T.stats.nukesFired} / ${E.stats.nukesFired}`]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    $('gameover').classList.remove('hidden');
  }
  reset() { this.select([]); this.stopPlacing(); this.clearAlerts(); this.groups = {}; this.mode = null; this.barDirty = true; this.boxStart = null; this.boxing = false; $('selbox').classList.add('hidden'); $('gameover').classList.add('hidden'); }
}
