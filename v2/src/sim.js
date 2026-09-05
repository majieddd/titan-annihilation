import * as THREE from 'three';
import { DEFS, ECON, TEAM_COLORS } from './defs.js';
import { clamp, lerp, tangentToward, moveOnSphere, angleBetween, frameQuat, anyTangent, rotateTangent, projectTangent, mulberry32, cubicBezier, cubicBezierTangent } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EPM = ECON.energyPerMetal;
const HOVER = 0.25;
export const AIR_ALT = 15;
const tmpList = [];
let nextId = 1;
const LAYER_CODE = { ground: 'g', air: 'a', orbital: 'o' };

class SpatialHash {
  constructor(cell = 14) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(ix, iy, iz) { return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0; }
  insert(u) { const c = this.cell; const k = this.key(Math.floor(u.pos.x / c), Math.floor(u.pos.y / c), Math.floor(u.pos.z / c)); let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); } l.push(u); }
  query(p, out) {
    out.length = 0; const c = this.cell; const ix = Math.floor(p.x / c), iy = Math.floor(p.y / c), iz = Math.floor(p.z / c);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const l = this.map.get(this.key(ix + dx, iy + dy, iz + dz)); if (l) for (let i = 0; i < l.length; i++) out.push(l[i]); }
    return out;
  }
}

export class Game {
  constructor({ system, fx, audio, settings }) {
    this.system = system; this.planets = system.planets; this.main = system.planets[0]; this.fx = fx; this.audio = audio; this.settings = settings || {};
    this.rng = mulberry32((this.main.seed * 7919 + 13) >>> 0);
    this.time = 0; this.tick = 0; this.over = false; this.winner = -1;
    this.units = []; this.projectiles = []; this.nukes = []; this.pathQueue = [];
    this.hash = new SpatialHash(14); this.onEvent = null;
    this.teams = [0, 1].map((id) => ({
      id, color: TEAM_COLORS[id], units: [], metal: ECON.startMetal, energy: ECON.startEnergy, metalCap: ECON.storageMetal, energyCap: ECON.storageEnergy,
      incomeM: 0, incomeE: 0, demandM: 0, spentM: 0, spentE: 0, eff: 1, lastDemandM: 0, cheat: 1, expenseM: 0, expenseE: 0,
      stats: { built: 0, lost: 0, killed: 0, metalMined: 0, damageDealt: 0, nukesFired: 0 }, alive: true, commander: null, lastAlert: {},
    }));
    for (const id in DEFS) { const d = DEFS[id]; d.hasTurret = d.model.some((p) => (p[7] || '').includes('u')); }
    this.spawnDirs = this.main.spawns.map((s) => s.dir);
  }
  emit(e) { if (this.onEvent) this.onEvent(e); }
  enemyOf(team) { return this.teams[1 - team]; }
  facing(team, planet, dir, out) { const target = this.spawnDirs[1 - team] || this.spawnDirs[0]; const t = tangentToward(dir, target, out); if (t.lengthSq() < 1e-6) anyTangent(dir, out); return out; }
  orbitTargetAlt(u) { const pl = u.planet; return pl.R + pl.orbitAlt - pl.heightAt(u.dir); }

  // ---------- units ----------
  createUnit(defId, team, planet, dir, fwd, opts = {}) {
    const def = DEFS[defId];
    const u = {
      id: nextId++, def, team, planet, pos: new THREE.Vector3(), dir: dir.clone().normalize(), fwd: new THREE.Vector3(), quat: new THREE.Quaternion(),
      hp: 0, progress: opts.progress ?? 1, built: false, orders: [], path: null, pathIdx: 0, pathGoal: null, pathPending: false,
      target: null, attackTarget: null, engage: 'idle', moveGoal: null, holdFacing: null, cd: def.weapons ? def.weapons.map(() => 0) : null, scanT: this.rng() * 0.3,
      turret: 0, turretGoal: 0, speed: 0, alt: 0, flash: 0, phase: 0, recoil: 0, lastWpIdx: -1, stuck: 0, stuckT: 0, lastGoalDist: 1e9, giveUp: 0, dead: false, drop: opts.drop || 0,
      moving: false, yawRate: 0, roll: 0, building: null, ai: null, spot: null, loiter: null, overshoot: null, bobPhase: this.rng() * 6.28, assist: 0,
      factory: def.factory ? { queue: [], current: null, loop: false, rally: null } : null, parentFactory: null, lastHitT: -99, killedBy: null, lastBuildT: this.time,
      transit: null, link: null, silo: def.silo ? { progress: 0, ammo: 0, active: true } : null,
    };
    if (fwd && fwd.lengthSq() > 0) u.fwd.copy(fwd); else this.facing(team, planet, u.dir, u.fwd);
    projectTangent(u.dir, u.fwd); if (u.fwd.lengthSq() < 1e-6) anyTangent(u.dir, u.fwd); u.fwd.normalize();
    if (u.progress >= 1) { u.built = true; u.hp = def.hp; } else u.hp = def.hp * Math.max(0.05, u.progress);
    if (def.layer === 'air') u.alt = opts.groundStart ? 1.5 : AIR_ALT;
    else if (def.layer === 'orbital') u.alt = opts.groundStart ? 1.5 : this.orbitTargetAlt(u);
    this.updateTransform(u);
    u.prevPos = u.pos.clone(); u.prevQuat = u.quat.clone(); u.prevTurret = 0; u.prevPhase = 0; u.prevRecoil = 0; u.visualMotion = 0;
    this.units.push(u); this.teams[team].units.push(u);
    if (def.kind === 'structure') planet.blockCircle(u.dir, def.radius + 0.6, +1);
    if (def.kind === 'commander') this.teams[team].commander = u;
    return u;
  }
  updateTransform(u) {
    if (u.transit) return;
    const pl = u.planet; const h = pl.heightAt(u.dir);
    let r = u.def.layer === 'ground' ? h + HOVER : h + u.alt;
    if (u.def.layer === 'ground' && pl.biome.sea) r = Math.max(r, pl.R + 0.3 + HOVER); // never sink below the sea/lava surface
    if (u.drop > 0) r += 300 * u.drop * u.drop;
    u.pos.copy(u.dir).multiplyScalar(r).add(pl.center);
    frameQuat(u.dir, u.fwd, u.quat);
    if (u.roll) { _q.setFromAxisAngle(Z_AXIS, u.roll); u.quat.multiply(_q); }
  }
  spawnCommander(team, dir) { return this.createUnit('commander', team, this.main, dir, null, { drop: 1 }); }
  terrainOk(planet, dir, radius, lenient = false) {
    const pl = planet; const R = pl.R;
    if (pl.isWater(dir)) return false; if (lenient) return true; if (!pl.isPassableNodeRaw(pl.navNode(dir))) return false;
    const h0 = pl.heightAt(dir); const t = anyTangent(dir, _c);
    for (let i = 0; i < 6; i++) {
      rotateTangent(dir, t, i * Math.PI / 3, _d); moveOnSphere(dir, _d, radius * 0.9 / R, _e);
      if (pl.isWater(_e)) return false; if (!pl.isPassableNodeRaw(pl.navNode(_e))) return false;
      if (Math.abs(pl.heightAt(_e) - h0) > radius * 0.55 + 1.2) return false;
    }
    return true;
  }
  canPlace(defId, team, planet, dir, ignore = null) {
    const def = DEFS[defId]; const R = planet.R; let d = dir; let spot = null;
    if (def.extractor) {
      let best = null, bd = Math.cos(8 / R);
      for (const s of planet.spots) { const dt = s.dir.dot(dir); if (dt > bd) { bd = dt; best = s; } }
      if (!best) return { ok: false, reason: 'Requires a metal spot', dir: d };
      if (best.taken && !best.taken.dead) return { ok: false, reason: 'Spot already claimed', dir: best.dir };
      d = best.dir; spot = best;
    }
    if (!this.terrainOk(planet, d, def.radius, !!def.extractor)) return { ok: false, reason: 'Terrain unsuitable', dir: d };
    planet.surfacePoint(d, 0, _a);
    for (const u of this.units) {
      if (u.dead || u === ignore || u.planet !== planet || u.transit) continue;
      if (u.def.kind !== 'structure' && !(u.def.isTitan && !u.built) && u.def.kind !== 'commander') continue;
      const need = u.def.radius + def.radius + (u.def.kind === 'commander' ? 0.5 : 1.0);
      if (u.pos.distanceTo(_a) < need) return { ok: false, reason: 'Obstructed', dir: d };
    }
    return { ok: true, dir: d, spot };
  }
  placeStructure(defId, team, planet, dir) {
    const c = this.canPlace(defId, team, planet, dir); if (!c.ok) return null;
    const u = this.createUnit(defId, team, planet, c.dir, null, { progress: 0 });
    if (c.spot) { c.spot.taken = u; u.spot = c.spot; }
    return u;
  }
  findPlacement(defId, team, planet, nearDir, minR, maxR, towardDir = null) {
    const R = planet.R; const tan = towardDir ? tangentToward(nearDir, towardDir, new THREE.Vector3()) : anyTangent(nearDir, new THREE.Vector3());
    if (tan.lengthSq() < 1e-6) anyTangent(nearDir, tan);
    const a0 = towardDir ? 0 : this.rng() * Math.PI * 2; const dir = new THREE.Vector3(), t2 = new THREE.Vector3();
    for (let r = minR; r <= maxR; r += 4.5) {
      const steps = Math.max(6, Math.round(r * 0.9));
      for (let i = 0; i < steps; i++) {
        const spread = towardDir ? (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * (Math.PI * 2 / steps) : i * Math.PI * 2 / steps;
        rotateTangent(nearDir, tan, a0 + spread, t2); moveOnSphere(nearDir, t2, r / R, dir);
        const c = this.canPlace(defId, team, planet, dir); if (c.ok) return c.dir.clone();
      }
    }
    return null;
  }

  // ---------- orders ----------
  setOrder(u, order, queue) {
    if (queue && u.orders.length) u.orders.push(order); else { u.orders = [order]; u.path = null; u.pathGoal = null; u.overshoot = null; u.attackTarget = null; }
  }
  finishOrder(u) { u.orders.shift(); u.path = null; u.pathGoal = null; u.attackTarget = null; u.giveUp = 0; u.engage = 'idle'; }
  formationDir(planet, dir, i, n, spacing, out) {
    if (n <= 1 || i === 0) return out.copy(dir);
    const r = spacing * Math.sqrt(i) * 0.9; const ang = i * 2.399963; const t = anyTangent(dir, _c); rotateTangent(dir, t, ang, _d); return moveOnSphere(dir, _d, r / planet.R, out);
  }
  orderMove(units, planet, dir, queue = false, type = 'move') {
    const mob = units.filter((u) => u.def.mobile && u.built && !u.dead && this.canReach(u, planet));
    let avgR = 0; for (const u of mob) avgR += u.def.radius; avgR = mob.length ? avgR / mob.length : 1;
    mob.forEach((u, i) => { const d = new THREE.Vector3(); this.formationDir(planet, dir, i, mob.length, 2.2 + avgR * 1.5 + (u.def.layer !== 'ground' ? 3 : 0), d); this.setOrder(u, { type, dir: d, planet }, queue); });
    return mob.length;
  }
  orderAttackMove(units, planet, dir, queue = false) { return this.orderMove(units, planet, dir, queue, 'attackmove'); }
  orderAttack(units, target, queue = false) {
    const tcode = LAYER_CODE[target.def.layer];
    for (const u of units) { if (!u.built || u.dead || !u.def.weapons) continue; if (!this.canReach(u, target.planet)) continue;
      if (!u.def.weapons.some((w) => w.targets.includes(tcode))) continue; // no weapon can engage that layer
      if (!u.def.mobile) { u.attackTarget = target; u.engage = 'attack'; continue; }
      this.setOrder(u, { type: 'attack', target }, queue); }
  }
  orderBuild(units, target, queue = false) { for (const u of units) { if (!u.built || u.dead || !u.def.builder) continue; if (!this.canReach(u, target.planet)) continue; this.setOrder(u, { type: 'build', target }, queue); } }
  orderRepair(units, target, queue = false) {
    if (!target || target.dead || !target.built || target.hp >= target.def.hp) return 0;
    let n = 0;
    for (const u of units) if (u !== target && u.built && !u.dead && u.def.builder && u.team === target.team && this.canReach(u, target.planet)) {
      this.setOrder(u, { type: 'repair', target }, queue); n++;
    }
    return n;
  }
  orderStop(units) { for (const u of units) { u.orders = []; u.path = null; u.attackTarget = null; u.engage = 'idle'; u.overshoot = null; if (u.def.mobile && u.def.layer === 'ground') u.speed = 0; } }
  factoryQueue(f, defId, count = 1) { if (!f.factory) return; for (let i = 0; i < count; i++) f.factory.queue.push(defId); }
  factoryDequeue(f, idx) { if (!f.factory) return; f.factory.queue.splice(idx, 1); }
  setRally(f, dir) { if (f.factory) f.factory.rally = dir.clone(); }
  factoryExit(f, out) { return moveOnSphere(f.dir, f.fwd, (f.def.radius + 2.2) / f.planet.R, out); }
  factoryRally(f, out) { if (f.factory.rally) return out.copy(f.factory.rally); return moveOnSphere(f.dir, f.fwd, (f.def.radius + 12) / f.planet.R, out); }
  linkTeleporters(a, b) {
    if (!a || !b || a === b || !a.def.teleporter || !b.def.teleporter || a.team !== b.team || a.dead || b.dead) return false;
    this.unlinkTeleporter(a); this.unlinkTeleporter(b); a.link = b; b.link = a; this.emit({ type: 'linked', a, b }); return true;
  }
  unlinkTeleporter(a) { if (a && a.link) { a.link.link = null; a.link = null; } }
  teleportRoute(from, to, team) {
    for (const u of this.teams[team].units) { if (u.def.teleporter && u.built && !u.dead && u.planet === from && u.link && !u.link.dead && u.link.built && u.link.planet === to) return u; }
    return null;
  }
  canReach(u, planet) {
    if (!planet || u.planet === planet) return true;
    if (u.def.layer === 'orbital') return true;
    if (u.def.layer === 'ground') return !!this.teleportRoute(u.planet, planet, u.team);
    return false;
  }
  orderPlanet(o) { return o.planet || (o.target && o.target.planet) || (o.tp && o.tp.planet) || null; }

  // ---------- economy ----------
  spend(team, rate, dt) { const t = this.teams[team]; const s = Math.max(0, Math.min(rate * dt * t.eff, t.metal + t.incomeM * dt - t.spentM, (t.energy + t.incomeE * dt - t.spentE) / EPM)); t.spentM += s; t.spentE += s * EPM; t.demandM += rate; return s; }
  economyPre(dt) {
    for (const t of this.teams) {
      let im = 0, ie = 0;
      for (const u of t.units) { if (u.dead || !u.built || !u.def.econ || u.transit) continue; im += u.def.econ.metal; ie += u.def.econ.energy; }
      t.incomeM = im * t.cheat; t.incomeE = ie * t.cheat;
      const needM = t.lastDemandM * dt, needE = t.lastDemandM * EPM * dt; const availM = t.metal + t.incomeM * dt, availE = t.energy + t.incomeE * dt;
      const effM = needM > 1e-6 ? Math.min(1, availM / needM) : 1, effE = needE > 1e-6 ? Math.min(1, availE / needE) : 1;
      t.eff = Math.max(0, Math.min(effM, effE)); t.stallM = effM < 0.999; t.stallE = effE < 0.999; t.demandM = 0; t.spentM = 0; t.spentE = 0;
    }
  }
  economyPost(dt) {
    for (const t of this.teams) {
      t.metal = clamp(t.metal + t.incomeM * dt - t.spentM, 0, t.metalCap); t.energy = clamp(t.energy + t.incomeE * dt - t.spentE, 0, t.energyCap);
      t.stats.metalMined += t.incomeM * dt; t.lastDemandM = t.demandM; t.expenseM = t.spentM / dt; t.expenseE = t.spentE / dt;
    }
  }

  // ---------- main step ----------
  step(dt) {
    this.time += dt; this.tick++;
    for (const u of this.units) { u.prevPos.copy(u.pos); u.prevQuat.copy(u.quat); u.prevTurret = u.turret; u.prevPhase = u.phase; u.prevRecoil = u.recoil; }
    this.economyPre(dt);
    this.hash.clear();
    for (const u of this.units) if (!u.dead && !u.transit && u.def.layer === 'ground' && (u.built || u.def.kind === 'structure' || u.def.isTitan) && u.drop <= 0) this.hash.insert(u);
    let budget = 8;
    while (budget-- > 0 && this.pathQueue.length) {
      const u = this.pathQueue.shift(); u.pathPending = false; if (u.dead || !u.moveGoal || u.transit) continue;
      u.path = u.planet.findPath(u.dir, u.moveGoal); u.pathIdx = 0; u.pathGoal = u.moveGoal.clone();
      // Unreachable means impassable ground OR a goal in a different walkable component - without
      // the second test a failed path fell through to a straight line across the sea.
      if (!u.path && (!u.planet.isPassable(u.moveGoal) || !u.planet.sameComponent(u.dir, u.moveGoal))) this.finishOrder(u);
    }
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    if (this.tick % 90 === 0) for (const u of this.units) { if (!u.dead && !u.built && u.progress <= 0 && u.def.kind !== 'commander' && this.time - u.lastBuildT > 30) this.removeGhost(u); }
    this.updateNukes(dt);
    this.updateProjectiles(dt);
    this.economyPost(dt);
    this.cleanup();
    this.checkEnd();
  }
  updateUnit(u, dt) {
    // wheels roll and legs swing off distance travelled, so motion matches the ground speed
    // Wrap the gait phase. It is uploaded as a float32 and fed to sin(); left to grow it reaches five
    // figures in a long match, where float32 steps are coarse enough to make the walk cycle visibly
    // stutter. The angle is meaningless beyond one turn anyway.
    if (u.def.mobile) u.phase = (u.phase + u.speed * dt * (u.def.kind === 'bot' ? 1.15 : u.def.kind === 'commander' ? 0.8 : u.def.isTitan ? 0.25 : 1.7)) % 6.283185307179586;
    if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt * 4.5);
    const def = u.def;
    if (u.flash > 0) u.flash *= Math.exp(-dt * 7);
    if (u.drop > 0) {
      u.drop -= dt / 3.2;
      if (u.drop <= 0) { u.drop = 0; this.updateTransform(u); this.fx.dust(u.pos, u.dir, 3); this.fx.ring(u.pos, u.dir, [0.6, 0.8, 1.0], 26, 0.8); this.fx.flash(u.pos, 12, [0.7, 0.85, 1.0], 0.4); this.audio.explosion(u.pos, 1.5); this.emit({ type: 'landed', unit: u }); }
      else if (u.drop < 0.35 && Math.random() < 0.5) { _a.copy(u.pos).addScaledVector(u.dir, -2); this.fx.sparks.spawn(_a.x, _a.y, _a.z, (Math.random() - .5) * 8, (Math.random() - .5) * 8, (Math.random() - .5) * 8, 0.4, 1.2, 0.6, 0.85, 1.0, 3, 0, 0, 0); }
      this.updateTransform(u); return;
    }
    if (u.transit) { this.updateTransit(u, dt); return; }
    if (!u.built) { if (def.layer !== 'ground') this.updateTransform(u); return; }
    u.moveGoal = null; u.holdFacing = null; u.engage = 'idle';
    this.processOrder(u, dt);
    if (def.weapons) this.updateWeapons(u, dt);
    if (def.mobile) { if (def.layer === 'ground') this.moveGround(u, dt); else this.moveAir(u, dt); }
    if (u.factory) this.updateFactory(u, dt);
    if (u.silo) this.updateSilo(u, dt);
    if (def.hasTurret) this.updateTurret(u, dt);
    this.updateTransform(u);
  }
  processOrder(u, dt) {
    const o = u.orders[0]; const pl = u.planet; const R = pl.R;
    if (!o) { if (u.def.mobile && u.def.layer === 'ground') u.path = null; return; }
    const op = this.orderPlanet(o);
    if (op && op !== pl && o.type !== 'teleport') {
      if (u.def.layer === 'orbital') { this.startTransit(u, op); return; }
      if (u.def.layer === 'ground') { const tp = this.teleportRoute(pl, op, u.team); if (tp) { u.orders.unshift({ type: 'teleport', tp }); return; } }
      this.finishOrder(u); return;
    }
    switch (o.type) {
      case 'teleport': {
        const tp = o.tp; if (!tp || tp.dead || !tp.link || tp.link.dead || !tp.link.built || tp.planet !== pl) { this.finishOrder(u); break; }
        u.moveGoal = tp.dir;
        if (angleBetween(u.dir, tp.dir) * R < tp.def.radius + u.def.radius + 2.5) { this.doTeleport(u, tp); this.finishOrder(u); }
        break;
      }
      case 'move': case 'attackmove': {
        u.moveGoal = o.dir; if (o.type === 'attackmove') u.engage = 'aggressive';
        const arrive = 1.6 + u.def.radius * 0.5 + (u.def.layer !== 'ground' ? 4 : 0);
        if (angleBetween(u.dir, o.dir) * R < arrive) this.finishOrder(u);
        break;
      }
      case 'attack': { const t = o.target; if (!t || t.dead || t.transit) { this.finishOrder(u); break; } u.engage = 'attack'; u.attackTarget = t; break; }
      case 'repair': {
        const t = o.target;
        if (!t || t.dead || !t.built || t.team !== u.team || t.transit || t.hp >= t.def.hp) { this.finishOrder(u); break; }
        if (u.pos.distanceTo(t.pos) > u.def.builder.range + t.def.radius) u.moveGoal = t.dir;
        else {
          u.holdFacing = t.dir;
          const basis = Math.max(t.def.cost, t.def.kind === 'commander' ? 3000 : 1) * 0.6;
          const rate = Math.min(u.def.builder.rate, (t.def.hp - t.hp) / t.def.hp * basis / dt);
          const spent = this.spend(u.team, rate, dt);
          t.hp = Math.min(t.def.hp, t.hp + spent / basis * t.def.hp);
          if (spent > 0 && this.tick % 3 === 0) {
            _a.copy(u.pos).addScaledVector(u.dir, u.def.height * 0.6);
            _b.copy(t.pos).addScaledVector(t.dir, t.def.height * 0.5);
            this.fx.nanolathe(_a, _b, this.teams[u.team].color);
          }
        }
        break;
      }
      case 'build': {
        const t = o.target; if (!t || t.dead) { this.finishOrder(u); break; }
        t.lastBuildT = this.time;
        if (t.built && !t.factory && !t.silo) { this.finishOrder(u); break; }
        const producing = t.built && ((t.factory && t.factory.current) || (t.silo && t.silo.active && t.silo.ammo < t.def.silo.max));
        const range = u.def.builder.range + t.def.radius; const d = u.pos.distanceTo(t.pos);
        if (d > range) { u.moveGoal = t.dir; }
        else {
          if (u.def.layer !== 'ground') u.moveGoal = null;
          u.holdFacing = t.dir;
          if (t.built) { if (producing) t.assist += u.def.builder.rate; } else this.construct(u, t, dt);
        }
        break;
      }
      default: this.finishOrder(u);
    }
  }
  doTeleport(u, tp) {
    const dest = tp.link; if (!dest || dest.dead || !dest.built) return;
    const col = this.teams[u.team].color;
    this.fx.flash(u.pos, 4, col, 0.3); this.fx.ring(u.pos, u.dir, col, 6, 0.4);
    u.planet = dest.planet; const R = dest.planet.R;
    rotateTangent(dest.dir, dest.fwd, (Math.random() - 0.5) * 1.2, _e);
    moveOnSphere(dest.dir, _e, (dest.def.radius + 3 + Math.random() * 4) / R, u.dir);
    u.fwd.copy(dest.fwd); projectTangent(u.dir, u.fwd); if (u.fwd.lengthSq() < 1e-6) anyTangent(u.dir, u.fwd); u.fwd.normalize();
    u.path = null; u.pathGoal = null; u.speed = 0; u.target = null;
    this.updateTransform(u); this.fx.flash(u.pos, 4, col, 0.3); this.fx.ring(u.pos, u.dir, col, 6, 0.4); this.audio.teleport(u.pos);
    this.emit({ type: 'teleport', unit: u, planet: u.planet });
  }
  startTransit(u, dest) {
    const from = u.planet; if (from === dest) return;
    const p0 = u.pos.clone(); const outDir = _a.copy(u.pos).sub(from.center).normalize();
    const approach = _b.copy(from.center).sub(dest.center).normalize();
    const p3 = dest.center.clone().addScaledVector(approach, dest.R + dest.orbitAlt);
    const dist = p0.distanceTo(p3); _c.copy(p3).sub(p0).normalize();
    const c1 = p0.clone().addScaledVector(outDir, 150 + dist * 0.12).addScaledVector(_c, dist * 0.25);
    const c2 = p3.clone().addScaledVector(approach, 150 + dist * 0.2);
    u.transit = { from, to: dest, t: 0, T: 5 + dist / 320, p0, c1, c2, p3 };
    u.target = null; u.moveGoal = null; u.path = null; u.speed = 0; u.attackTarget = null;
    this.audio.transit(u.pos); this.emit({ type: 'transit', unit: u, to: dest });
  }
  updateTransit(u, dt) {
    const tr = u.transit; tr.t += dt / tr.T; const t = Math.min(1, tr.t); const te = t * t * (3 - 2 * t);
    cubicBezier(tr.p0, tr.c1, tr.c2, tr.p3, te, u.pos); cubicBezierTangent(tr.p0, tr.c1, tr.c2, tr.p3, te, _a);
    if (_a.lengthSq() > 1e-6) { _a.normalize(); _b.copy(u.pos).sub(t < 0.5 ? tr.from.center : tr.to.center).normalize(); frameQuat(_b, _a, u.quat); }
    if (this.tick % 2 === 0) { const col = this.teams[u.team].color; this.fx.sparks.spawn(u.pos.x, u.pos.y, u.pos.z, 0, 0, 0, 0.5, 1.8, col[0], col[1], col[2], 0, 0, -0.5, 0); }
    if (tr.t >= 1) {
      u.planet = tr.to; u.dir.copy(u.pos).sub(tr.to.center).normalize(); u.alt = this.orbitTargetAlt(u);
      u.fwd.copy(_a); projectTangent(u.dir, u.fwd); if (u.fwd.lengthSq() < 1e-6) anyTangent(u.dir, u.fwd); u.fwd.normalize();
      u.transit = null; u.roll = 0; this.updateTransform(u); this.emit({ type: 'arrived', unit: u, planet: tr.to });
    }
  }
  construct(b, t, dt) {
    const spent = this.spend(b.team, b.def.builder.rate, dt);
    t.progress = Math.min(1, t.progress + spent / t.def.cost); t.hp = Math.min(t.def.hp, t.hp + spent / t.def.cost * t.def.hp); b.building = t;
    if (this.tick % 2 === 0 && spent > 0) {
      _a.copy(b.pos).addScaledVector(b.dir, b.def.layer === 'orbital' ? -1 : b.def.height * 0.6).addScaledVector(b.fwd, b.def.radius * 0.6);
      _b.copy(t.pos).addScaledVector(t.dir, t.def.height * t.progress * 0.9 + 0.3); _b.x += (Math.random() - 0.5) * t.def.radius; _b.y += (Math.random() - 0.5) * t.def.radius; _b.z += (Math.random() - 0.5) * t.def.radius;
      this.fx.nanolathe(_a, _b, this.teams[b.team].color);
    }
    if (t.progress >= 1) this.complete(t);
  }
  complete(u) {
    u.built = true; u.progress = 1; u.hp = u.def.hp; this.teams[u.team].stats.built++; this.audio.build(u.pos);
    if (u.def.isTitan) { this.fx.ring(u.pos, u.dir, this.teams[u.team].color, 30, 1.0); this.emit({ type: 'titan', unit: u }); }
    this.emit({ type: 'built', unit: u });
  }
  updateFactory(f, dt) {
    const fa = f.factory;
    if (!fa.current && fa.queue.length) {
      const id = fa.queue.shift(); if (fa.loop) fa.queue.push(id);
      const exit = this.factoryExit(f, new THREE.Vector3());
      const c = this.createUnit(id, f.team, f.planet, exit, f.fwd, { progress: 0.001, groundStart: true }); c.parentFactory = f; fa.current = c;
    }
    if (fa.current) {
      const c = fa.current; if (c.dead) { fa.current = null; f.assist = 0; return; }
      const spent = this.spend(f.team, f.def.factory.rate + f.assist, dt); f.assist = 0;
      c.progress = Math.min(1, c.progress + spent / c.def.cost); c.hp = c.def.hp * Math.max(0.05, c.progress);
      if (this.tick % 3 === 0 && spent > 0) { _a.copy(f.pos).addScaledVector(f.dir, f.def.height * 0.9).addScaledVector(f.fwd, f.def.radius * 0.5); _b.copy(c.pos).addScaledVector(c.dir, c.def.height * c.progress); _b.x += (Math.random() - .5) * 2; _b.z += (Math.random() - .5) * 2; this.fx.nanolathe(_a, _b, this.teams[f.team].color); }
      if (c.progress >= 1) { this.complete(c); fa.current = null; const r = this.factoryRally(f, new THREE.Vector3()); this.setOrder(c, { type: 'move', dir: r, planet: f.planet }, false); }
    } else f.assist = 0;
  }
  updateSilo(u, dt) {
    const s = u.silo, d = u.def.silo;
    if (!s.active || s.ammo >= d.max) { u.assist = 0; return; }
    const spent = this.spend(u.team, d.rate + u.assist, dt); u.assist = 0; s.progress += spent / d.cost;
    if (s.progress >= 1) { s.progress = 0; s.ammo++; this.emit({ type: 'ammo', unit: u }); if (u.team === 0) this.audio.build(u.pos); }
  }

  // ---------- nukes ----------
  fireNuke(launcher, planet, dir) {
    const s = launcher.silo; if (!s || s.ammo < 1 || launcher.dead || !launcher.built) return false; s.ammo--;
    const p0 = launcher.pos.clone().addScaledVector(launcher.dir, 5); const up0 = launcher.dir.clone();
    const p3 = planet.surfacePoint(dir, 0.5, new THREE.Vector3()); const up3 = dir.clone();
    const dist = p0.distanceTo(p3); const c1 = p0.clone().addScaledVector(up0, 320 + dist * 0.15); const c2 = p3.clone().addScaledVector(up3, 320 + dist * 0.15);
    const nuke = { team: launcher.team, planet, dir: dir.clone(), t: 0, T: 7 + dist / 420, p0, c1, c2, p3, pos: p0.clone(), vel: new THREE.Vector3(0, 1, 0), checked: false, dead: false, def: { height: 0, radius: 3, layer: 'air' }, id: nextId++ };
    this.nukes.push(nuke); this.teams[launcher.team].stats.nukesFired++;
    this.fx.flash(p0, 14, [1, 0.9, 0.7], 0.4); this.fx.smokePuff(p0, up0, 40, 12, 3, 3, [0.85, 0.85, 0.85], { grav: 2 }); this.audio.nukeLaunch(p0);
    this.emit({ type: 'nukeLaunch', nuke, team: launcher.team, planet, dir: nuke.dir });
    return true;
  }
  updateNukes(dt) {
    for (let i = this.nukes.length - 1; i >= 0; i--) {
      const n = this.nukes[i];
      if (n.dead) { this.nukes[i] = this.nukes[this.nukes.length - 1]; this.nukes.pop(); continue; }
      n.t += dt / n.T; const t = Math.min(1, n.t);
      cubicBezier(n.p0, n.c1, n.c2, n.p3, t, n.pos); cubicBezierTangent(n.p0, n.c1, n.c2, n.p3, t, n.vel); if (n.vel.lengthSq() > 1e-6) n.vel.normalize();
      if (this.tick % 2 === 0) { this.fx.smoke.spawn(n.pos.x, n.pos.y, n.pos.z, (Math.random() - .5) * 3, (Math.random() - .5) * 3, (Math.random() - .5) * 3, 3.0, 2.6, 0.8, 0.8, 0.82, 1, 0, 2.5, 0); this.fx.sparks.spawn(n.pos.x, n.pos.y, n.pos.z, 0, 0, 0, 0.15, 2.2, 1.0, 0.7, 0.3, 0, 0, 0, 0); }
      if (!n.checked && t > 0.35) {
        n.checked = true;
        for (const e of this.enemyOf(n.team).units) {
          if (e.dead || !e.built || !e.def.silo || e.def.silo.ammo !== 'antinuke' || e.planet !== n.planet || e.silo.ammo < 1) continue;
          if (e.pos.distanceTo(n.p3) <= e.def.antinukeRange) {
            e.silo.ammo--;
            this.projectiles.push({ kind: 'missile', pos: e.pos.clone().addScaledVector(e.dir, 6), dir: e.dir.clone(), speed: 320, turn: 9, dmg: 0, splash: 0, target: n, team: e.team, life: 14, trailT: 0, col: [1, 1, 1], attacker: e, accel: 1.0, isInterceptor: true, planet: e.planet });
            n.intercepting = true; this.fx.flash(e.pos, 6, [0.8, 0.9, 1], 0.3); this.audio.missile(e.pos); this.emit({ type: 'nukeIntercept', nuke: n, by: e }); break;
          }
        }
      }
      if (n.intercepting && t >= 0.9) { n.dead = true; this.fx.explosion(n.pos, 3.2, null, false); this.audio.explosion(n.pos, 4); this.emit({ type: 'nukeDestroyed', pos: n.pos.clone(), planet: n.planet }); continue; }
      if (t >= 1) { this.nukeImpact(n); this.nukes[i] = this.nukes[this.nukes.length - 1]; this.nukes.pop(); }
    }
  }
  nukeImpact(n) {
    const p = n.p3; const planet = n.planet;
    for (const t of this.teams) for (const e of t.units) { if (e.dead || e.planet !== planet || e.transit) continue; const d = e.pos.distanceTo(p); if (d < 58) this.damage(e, 42000 * (1 - 0.72 * d / 58), null); }
    this.fx.nuke(p, n.dir); this.audio.nukeBlast(p); this.emit({ type: 'nukeImpact', pos: p, planet, dir: n.dir, team: n.team }); this.emit({ type: 'shake', pos: p, amount: 4 });
  }

  // ---------- combat ----------
  acquireTarget(u) {
    const def = u.def; const enemies = this.enemyOf(u.team).units;
    const aggro = u.engage === 'idle' ? 1.0 : (def.mobile ? 1.5 : 1.0);
    let maxRange = 0; const tl = { g: 0, a: 0, o: 0 };
    for (const w of def.weapons) { maxRange = Math.max(maxRange, w.range); for (const ch of w.targets) tl[ch] = 1; }
    const lim = (maxRange + (def.weapons[0].type === 'bomb' ? 30 : 0)) * aggro; const lim2 = lim * lim;
    let best = null, bs = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (e.dead || e.progress <= 0 || e.drop > 0 || e.transit || e.planet !== u.planet) continue;
      if (!tl[LAYER_CODE[e.def.layer]]) continue;
      const d2 = u.pos.distanceToSquared(e.pos); if (d2 > lim2) continue;
      let pr = 1; if (e.def.kind === 'commander') pr = 0.8; else if (e.def.weapons) pr = 0.9; else if (e.def.kind === 'structure') pr = 1.15;
      if (!e.built) pr *= 1.1;
      const s = d2 * pr; if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  updateWeapons(u, dt) {
    const def = u.def; const cd = u.cd; for (let i = 0; i < cd.length; i++) cd[i] -= dt;
    let t = null;
    if (u.engage === 'attack' && u.attackTarget && !u.attackTarget.dead && u.attackTarget.progress > 0 && !u.attackTarget.transit && u.attackTarget.planet === u.planet) t = u.attackTarget;
    if (!t) {
      if (u.target && (u.target.dead || u.target.progress <= 0 || u.target.drop > 0 || u.target.transit || u.target.planet !== u.planet)) u.target = null;
      u.scanT -= dt;
      if (u.scanT <= 0) { u.scanT = 0.3 + this.rng() * 0.1; u.target = this.acquireTarget(u); }
      t = u.target;
      if (t && u.engage === 'idle') { let inR = false; for (const w of def.weapons) if (u.pos.distanceTo(t.pos) <= w.range) inR = true; if (!inR) t = null; }
    } else u.target = t;
    if (!t) return;
    const d = u.pos.distanceTo(t.pos); const flying = def.layer !== 'ground'; const hoverLike = def.hover || def.layer === 'orbital';
    const tcode = LAYER_CODE[t.def.layer];
    for (let i = 0; i < def.weapons.length; i++) {
      const w = def.weapons[i]; if (!w.targets.includes(tcode)) continue;
      let inRange = d <= w.range;
      if (w.type === 'bomb') { const horiz = angleBetween(u.dir, t.dir) * u.planet.R; inRange = horiz <= w.range; }
      if (inRange) {
        let canFire = true;
        if (!def.hasTurret && !flying && w.type !== 'stomp' && def.mobile) { tangentToward(u.dir, t.dir, _a); if (_a.lengthSq() > 0) { u.holdFacing = t.dir; if (u.fwd.dot(_a) < 0.55) canFire = false; } }
        if (flying && !hoverLike && w.type !== 'bomb') { tangentToward(u.dir, t.dir, _a); if (_a.lengthSq() > 0 && u.fwd.dot(_a) < 0.35) canFire = false; }
        if (canFire && cd[i] <= 0) { this.fire(u, w, i, t); cd[i] = 1 / (w.type === 'flame' ? w.rof * 4 : w.rof); }
      }
    }
    const w0 = def.weapons.find((w) => w.targets.includes(tcode)) || def.weapons[0]; const range = w0.range;
    if (def.mobile && u.engage !== 'idle') {
      if (flying) {
        if (hoverLike) { if (d > range * 0.7) u.moveGoal = t.dir; else { u.moveGoal = null; u.holdFacing = t.dir; } }
        else {
          u.moveGoal = t.dir; const horiz = angleBetween(u.dir, t.dir) * u.planet.R; tangentToward(u.dir, t.dir, _a);
          const passed = _a.lengthSq() > 0 && u.fwd.dot(_a) < (w0.type === 'bomb' ? -0.1 : 0.3);
          if (horiz < (w0.type === 'bomb' ? 12 : 14) && passed && !u.overshoot) u.overshoot = moveOnSphere(u.dir, u.fwd, (30 + Math.random() * 15) / u.planet.R, new THREE.Vector3());
        }
      } else { if (d > range * 0.92) u.moveGoal = t.dir; else { u.moveGoal = null; if (!def.hasTurret) u.holdFacing = t.dir; } }
    } else if (def.mobile && !flying && !def.hasTurret) u.holdFacing = t.dir;
  }
  weaponOrigin(u, w, out) {
    out.copy(u.pos).addScaledVector(u.dir, u.def.layer === 'orbital' ? -0.5 : u.def.height * 0.6);
    if (u.def.hasTurret && w.turret !== false) { rotateTangent(u.dir, u.fwd, u.turret, _e); out.addScaledVector(_e, u.def.radius * 0.9); }
    else out.addScaledVector(u.fwd, u.def.radius * 0.7);
    return out;
  }
  fire(u, w, wi, t) {
    u.recoil = 1;
    const col = w.color || this.teams[u.team].color; const origin = this.weaponOrigin(u, w, new THREE.Vector3()); const pl = u.planet;
    switch (w.type) {
      case 'laser': case 'uber': {
        const big = w.type === 'uber';
        this.projectiles.push({ kind: 'bolt', pos: origin, dir: _a.copy(t.pos).sub(origin).normalize().clone(), speed: w.speed, dmg: w.dmg, splash: w.splash || 0, target: t, team: u.team, life: t.pos.distanceTo(origin) / w.speed + 0.6, col, len: big ? 4 : 2.2, big, attacker: u, planet: pl });
        this.fx.muzzle(origin, col); if (big) { this.audio.uber(origin); this.fx.flash(origin, 6, col, 0.2); } else this.audio.laser(origin);
        break;
      }
      case 'cannon': {
        const d = origin.distanceTo(t.pos); const T = d / w.speed; let toDir = t.dir.clone();
        if (t.def.mobile && t.speed > 0.5) moveOnSphere(t.dir, t.fwd, t.speed * T * 0.9 / pl.R, toDir);
        const toR = pl.heightAt(toDir) + (t.def.layer !== 'ground' ? t.alt : 0.3);
        this.projectiles.push({ kind: 'shell', fromDir: origin.clone().sub(pl.center).normalize(), fromR: origin.distanceTo(pl.center), toDir, toR, T, t: 0, arc: w.arc * d * 0.32 + 1, dmg: w.dmg, splash: w.splash || 1.5, target: t, team: u.team, col: [1, 0.75, 0.35], size: w.dmg > 200 ? 1.6 : 1, pos: origin.clone(), attacker: u, ground: t.def.layer === 'ground', planet: pl });
        this.fx.muzzle(origin, [1, 0.8, 0.5]); this.fx.smokePuff(origin, u.dir, 2, 3, 0.8, 1.0, [0.5, 0.5, 0.5], { grav: 0 }); this.audio.cannon(origin, w.dmg > 200 ? 2 : 1);
        break;
      }
      case 'missile': case 'aa': {
        _a.copy(u.dir).multiplyScalar(0.8).addScaledVector(u.fwd, 0.5).normalize();
        this.projectiles.push({ kind: 'missile', pos: origin, dir: _a.clone(), speed: w.speed, turn: w.type === 'aa' ? 5.5 : 3.2, dmg: w.dmg, splash: w.splash || 0, target: t, team: u.team, life: 7, trailT: 0, col, attacker: u, accel: 0.4, planet: pl });
        this.audio.missile(origin); this.fx.muzzle(origin, [1, 0.9, 0.7]);
        break;
      }
      case 'beam': { _b.copy(t.pos).addScaledVector(t.dir, t.def.height * 0.4); this.fx.beam(origin, _b, [1.0, 0.35, 0.45], 0.5, 0.2); this.fx.impact(_b, [1, 0.5, 0.5]); this.damage(t, w.dmg, u); this.audio.beam(origin); break; }
      case 'lightning': {
        _b.copy(t.pos).addScaledVector(t.dir, t.def.height * 0.5); _a.copy(u.pos).addScaledVector(u.dir, -1.5);
        this.fx.lightning(_a, _b, [0.7, 0.85, 1.0]); this.damage(t, w.dmg, u); this.audio.lightning(_b);
        const enemies = this.enemyOf(u.team).units;
        for (let k = 0; k < 4; k++) { const e = enemies[Math.floor(Math.random() * enemies.length)]; if (e && e !== t && !e.dead && e.progress > 0 && e.planet === pl && !e.transit && e.pos.distanceTo(u.pos) < w.range) { _c.copy(e.pos).addScaledVector(e.dir, e.def.height * 0.5); this.fx.lightning(_b, _c, [0.7, 0.85, 1.0]); this.damage(e, w.dmg * 0.5, u); break; } }
        break;
      }
      case 'flame': {
        this.damage(t, w.dmg / 4, u); _a.copy(t.pos).sub(origin).normalize();
        for (let k = 0; k < 4; k++) this.fx.sparks.spawn(origin.x, origin.y, origin.z, _a.x * 26 + (Math.random() - .5) * 6, _a.y * 26 + (Math.random() - .5) * 6, _a.z * 26 + (Math.random() - .5) * 6, 0.5 + Math.random() * 0.3, 1.4, 1.0, 0.45 + Math.random() * 0.3, 0.1, 3.5, 0, 1.5, 0);
        this.fx.smoke.spawn(t.pos.x, t.pos.y, t.pos.z, t.dir.x * 4, t.dir.y * 4, t.dir.z * 4, 1.2, 1.5, 0.15, 0.13, 0.12, 1.5, -1, 1.5, 0); this.audio.flame(origin);
        break;
      }
      case 'bomb': { _a.copy(u.fwd).multiplyScalar(u.speed * 0.95); this.projectiles.push({ kind: 'bomb', pos: u.pos.clone().addScaledVector(u.dir, -0.8), vel: _a.clone(), dmg: w.dmg, splash: w.splash, team: u.team, life: 5, size: w.dmg > 500 ? 1.6 : 1, attacker: u, planet: pl }); break; }
      case 'stomp': {
        this.fx.ring(u.pos, u.dir, [0.9, 0.75, 0.5], w.splash * 1.2, 0.7); this.fx.dust(u.pos, u.dir, 3); this.fx.flash(u.pos, 5, [1, 0.8, 0.5], 0.2);
        this.splash(u.pos, w.splash, w.dmg, u.team, 'g', u); this.audio.stomp(u.pos); this.emit({ type: 'shake', pos: u.pos, amount: 1.5 });
        break;
      }
    }
  }
  splash(pos, radius, dmg, team, layer = 'g', attacker = null, except = null) {
    const enemies = this.enemyOf(team).units;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (e.dead || e.progress <= 0 || e.drop > 0 || e.transit || e === except) continue;
      if (layer === 'g' && e.def.layer !== 'ground') continue;
      const d2 = e.pos.distanceToSquared(pos); const rr = radius + e.def.radius; if (d2 > rr * rr) continue;
      const f = 1 - 0.6 * clamp(Math.sqrt(d2) / rr, 0, 1); this.damage(e, dmg * f, attacker);
    }
  }
  damage(u, amount, attacker) {
    if (u.dead || amount <= 0) return;
    u.hp -= amount; u.flash = 1; u.lastHitT = this.time;
    if (attacker) this.teams[attacker.team].stats.damageDealt += amount;
    const team = this.teams[u.team];
    if (u.team === 0) {
      const key = u.def.kind === 'commander' ? 'cmd' : (u.def.kind === 'structure' ? 'base' : null);
      if (key && this.time - (team.lastAlert[key] || -99) > (key === 'cmd' ? 12 : 20)) { team.lastAlert[key] = this.time; this.emit({ type: 'alert', kind: key, unit: u }); }
    }
    if (u.hp <= 0) this.kill(u, attacker);
  }
  kill(u, attacker) {
    if (u.dead) return; u.dead = true; u.killedBy = attacker;
    const def = u.def; const col = this.teams[u.team].color;
    if (def.kind === 'commander') {
      this.fx.bigExplosion(u.pos, 1.3, def.layer === 'ground'); this.audio.explosion(u.pos, 12); this.emit({ type: 'shake', pos: u.pos, amount: 3 });
      for (const t of this.teams) { for (const e of t.units) { if (e === u || e.dead || e.transit) continue; const d = e.pos.distanceTo(u.pos); if (d < 70) this.damage(e, 6000 * (1 - d / 70), u); } }
      this.emit({ type: 'commanderDied', unit: u });
    } else if (def.isTitan) { this.fx.bigExplosion(u.pos, 0.6, def.layer === 'ground'); this.audio.explosion(u.pos, 8); this.emit({ type: 'shake', pos: u.pos, amount: 2 }); this.splash(u.pos, 22, 800, u.team, 'g', u); }
    else if (!u.transit) { const size = def.deathSize * (0.8 + def.radius * 0.25); this.fx.explosion(u.pos, size, col, def.layer === 'ground'); this.audio.explosion(u.pos, size); }
    if (u.spot) { u.spot.taken = null; u.spot = null; }
    if (def.kind === 'structure') u.planet.blockCircle(u.dir, def.radius + 0.6, -1);
    if (def.teleporter) this.unlinkTeleporter(u);
    if (u.factory && u.factory.current && !u.factory.current.dead) this.kill(u.factory.current, attacker);
    if (u.parentFactory && u.parentFactory.factory && u.parentFactory.factory.current === u) u.parentFactory.factory.current = null;
    this.teams[u.team].stats.lost++; if (attacker) this.teams[attacker.team].stats.killed++;
    this.emit({ type: 'died', unit: u, attacker });
  }
  removeGhost(u) { u.dead = true; if (u.spot) { u.spot.taken = null; u.spot = null; } if (u.def.kind === 'structure') u.planet.blockCircle(u.dir, u.def.radius + 0.6, -1); }
  updateProjectiles(dt) {
    const P = this.projectiles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; let done = false; const pl = p.planet;
      switch (p.kind) {
        case 'bolt': {
          p.life -= dt; const t = p.target;
          if (t && !t.dead) {
            _a.copy(t.pos).addScaledVector(t.dir, t.def.height * 0.45).sub(p.pos); const d = _a.length();
            if (d < p.speed * dt + 0.8 + t.def.radius * 0.5) { this.damage(t, p.dmg, p.attacker); if (p.splash) this.splash(t.pos, p.splash, p.dmg * 0.6, p.team, 'g', p.attacker, t); this.fx.impact(t.pos, p.col); if (p.big) { this.fx.explosion(t.pos, 2.2); this.audio.explosion(t.pos, 3); } done = true; break; }
            _a.multiplyScalar(1 / d); p.dir.lerp(_a, Math.min(1, dt * 6)).normalize();
          }
          p.pos.addScaledVector(p.dir, p.speed * dt);
          _b.copy(p.pos).sub(pl.center); if (p.life <= 0 || _b.length() < pl.heightAt(_b.normalize()) - 1) done = true;
          break;
        }
        case 'shell': {
          p.t += dt; const f = Math.min(1, p.t / p.T);
          const ang = angleBetween(p.fromDir, p.toDir); tangentToward(p.fromDir, p.toDir, _a); moveOnSphere(p.fromDir, _a, ang * f, _b);
          const r = lerp(p.fromR, p.toR, f) + Math.sin(f * Math.PI) * p.arc; p.pos.copy(_b).multiplyScalar(r).add(pl.center);
          if (p.size > 1.2 && this.tick % 2 === 0) this.fx.smoke.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.6, 0.8, 0.5, 0.5, 0.5, 1, 0, 2, 0);
          if (f >= 1) {
            done = true; const t = p.target; let hit = false;
            if (t && !t.dead && t.pos.distanceTo(p.pos) < p.splash + t.def.radius + 1.5) { this.damage(t, p.dmg, p.attacker); hit = true; }
            this.splash(p.pos, p.splash, p.dmg * 0.6, p.team, 'g', p.attacker, hit ? t : null);
            this.fx.explosion(p.pos, p.size > 1.2 ? 1.6 : 0.6, null, !!p.ground); this.audio.explosion(p.pos, p.size > 1.2 ? 1.5 : 0.5); if (p.ground) this.fx.dust(p.pos, _b, 0.6);
          }
          break;
        }
        case 'missile': {
          p.life -= dt; const t = p.target; p.speed += p.speed * p.accel * dt;
          if (t && !t.dead) {
            _a.copy(t.pos).addScaledVector(t.dir, t.def.height * 0.4).sub(p.pos); const d = _a.length();
            if (d < p.speed * dt + 1.0 + t.def.radius * 0.6) {
              if (p.isInterceptor) { t.dead = true; this.fx.explosion(t.pos, 3.2, null, false); this.audio.explosion(t.pos, 4); this.emit({ type: 'nukeDestroyed', pos: t.pos.clone(), planet: t.planet }); }
              else { this.damage(t, p.dmg, p.attacker); if (p.splash) this.splash(t.pos, p.splash, p.dmg * 0.5, p.team, t.def.layer === 'ground' ? 'g' : 'x', p.attacker, t); this.fx.explosion(t.pos, t.def.layer !== 'ground' ? 0.5 : 0.7); this.audio.explosion(t.pos, 0.6); }
              done = true; break;
            }
            _a.multiplyScalar(1 / d); p.dir.lerp(_a, Math.min(1, p.turn * dt)).normalize();
          } else if (p.life > 0.5) p.life = 0.5;
          p.pos.addScaledVector(p.dir, p.speed * dt);
          p.trailT -= dt; if (p.trailT <= 0) { p.trailT = 0.035; this.fx.smoke.spawn(p.pos.x, p.pos.y, p.pos.z, (Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2, 0.9, 0.7, 0.6, 0.6, 0.6, 1, 0, 2.5, 0); this.fx.sparks.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.12, 1.0, 1.0, 0.7, 0.3, 0, 0, 0, 0); }
          _b.copy(p.pos).sub(pl.center); if (p.life <= 0 || (!p.isInterceptor && _b.length() < pl.heightAt(_b.normalize()) - 0.5)) { done = true; this.fx.impact(p.pos, [1, 0.6, 0.3]); }
          break;
        }
        case 'bomb': {
          p.life -= dt; _b.copy(p.pos).sub(pl.center).normalize(); p.vel.addScaledVector(_b, -38 * dt); p.pos.addScaledVector(p.vel, dt);
          const h = pl.heightAt(_b);
          if (p.pos.distanceTo(pl.center) <= h + 0.4 || p.life <= 0) {
            done = true; p.pos.copy(_b).multiplyScalar(h + 0.3).add(pl.center);
            this.splash(p.pos, p.splash, p.dmg, p.team, 'g', p.attacker);
            this.fx.explosion(p.pos, p.size > 1.2 ? 2.4 : 1.4); this.audio.explosion(p.pos, p.size > 1.2 ? 3 : 1.5); this.fx.dust(p.pos, _b, 1.2);
          }
          break;
        }
      }
      if (done) { P[i] = P[P.length - 1]; P.pop(); }
    }
  }
  renderProjectiles(fx) {
    for (const p of this.projectiles) {
      if (p.kind === 'bolt') fx.addBolt(p.pos, p.dir, p.len, p.col);
      else if (p.kind === 'shell') fx.addShell(p.pos, p.size, p.col);
      else if (p.kind === 'missile') fx.addMissile(p.pos, p.dir, p.isInterceptor ? 2.2 : 1);
      else if (p.kind === 'bomb') fx.addBomb(p.pos, p.size);
    }
    for (const n of this.nukes) if (!n.dead) fx.addNuke(n.pos, n.vel);
  }

  // ---------- movement ----------
  turnToward(u, desired, maxAngle) {
    const dot = clamp(u.fwd.dot(desired), -1, 1); const ang = Math.acos(dot);
    _e.crossVectors(u.fwd, desired); const sign = _e.dot(u.dir) >= 0 ? 1 : -1;
    const a = Math.min(ang, maxAngle) * sign; rotateTangent(u.dir, u.fwd, a, _e); u.fwd.copy(_e).normalize(); return a;
  }
  requestPath(u) { if (!u.pathPending) { u.pathPending = true; this.pathQueue.push(u); } }
  moveGround(u, dt) {
    const def = u.def; const R = u.planet.R; const goal = u.moveGoal;
    if (goal) {
      if (!u.pathGoal || u.pathGoal.dot(goal) < Math.cos(1.5 / R)) { u.path = null; u.pathGoal = goal.clone(); this.requestPath(u); }
      let wp = goal;
      if (u.path && u.pathIdx < u.path.length) { while (u.pathIdx < u.path.length && angleBetween(u.dir, u.path[u.pathIdx]) * R < 2.8) u.pathIdx++; wp = u.pathIdx < u.path.length ? u.path[u.pathIdx] : goal; }
      tangentToward(u.dir, wp, _a); let align = 1;
      if (_a.lengthSq() > 0) { this.turnToward(u, _a, def.turn * dt); align = clamp(u.fwd.dot(_a) + 0.35, 0.15, 1); }
      const remaining = angleBetween(u.dir, goal) * R;
      const targetSpeed = def.speed * align * (remaining < 5 ? clamp(remaining / 5, 0.35, 1) : 1);
      u.speed = lerp(u.speed, targetSpeed, 1 - Math.exp(-dt * 4));
      moveOnSphere(u.dir, u.fwd, u.speed * dt / R, u.dir); projectTangent(u.dir, u.fwd).normalize();
      u.moving = u.speed > 0.5; u.stuckT += dt;
      if (u.stuckT > 0.8) {
        // measure progress toward the CURRENT waypoint: a legitimate detour around a canyon wall
        // increases the distance to the final goal and used to be punished as being stuck
        u.stuckT = 0; const prog = (u.path && u.pathIdx < u.path.length) ? angleBetween(u.dir, u.path[u.pathIdx]) * R : remaining;
        if (u.pathIdx !== u.lastWpIdx) { u.lastWpIdx = u.pathIdx; u.stuck = 0; u.lastGoalDist = prog; }
        else if (prog > u.lastGoalDist - 0.4) u.stuck++; else { u.stuck = 0; u.giveUp = 0; }
        u.lastGoalDist = prog;
        if (u.stuck >= 3) { u.stuck = 0; u.path = null; u.pathGoal = null; rotateTangent(u.dir, u.fwd, (Math.random() - 0.5) * 2.5, _e); u.fwd.copy(_e).normalize(); if (++u.giveUp > 5 && u.orders.length) this.finishOrder(u); }
      }
    } else {
      u.speed *= Math.exp(-dt * 6); if (u.speed > 0.3) { moveOnSphere(u.dir, u.fwd, u.speed * dt / R, u.dir); projectTangent(u.dir, u.fwd).normalize(); }
      u.moving = false; u.path = null; u.pathGoal = null;
      if (u.holdFacing) { tangentToward(u.dir, u.holdFacing, _a); if (_a.lengthSq() > 0) this.turnToward(u, _a, def.turn * dt); }
    }
    this.separate(u, dt);
  }
  separate(u, dt) {
    const list = this.hash.query(u.pos, tmpList); const R = u.planet.R;
    for (let i = 0; i < list.length; i++) {
      const o = list[i]; if (o === u || o.dead || o.planet !== u.planet) continue;
      const isStruct = !o.def.mobile; const minD = u.def.radius + o.def.radius + (isStruct ? 0.5 : 0.15);
      const d2 = u.pos.distanceToSquared(o.pos); if (d2 >= minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2); const push = (minD - d) * (isStruct ? 1.0 : (o.moving ? 0.5 : 0.7));
      _a.copy(u.pos).sub(o.pos).multiplyScalar(1 / d); projectTangent(u.dir, _a); if (_a.lengthSq() < 1e-6) anyTangent(u.dir, _a);
      u.dir.addScaledVector(_a.normalize(), push * Math.min(1, dt * 12) / R).normalize();
    }
    projectTangent(u.dir, u.fwd).normalize();
  }
  moveAir(u, dt) {
    const def = u.def; const pl = u.planet; const R = pl.R; let goal = u.moveGoal; const orbital = def.layer === 'orbital';
    if (u.overshoot) { goal = u.overshoot; if (angleBetween(u.dir, goal) * R < 7) u.overshoot = null; }
    const cruise = orbital ? this.orbitTargetAlt(u) : AIR_ALT + (def.isTitan ? 12 : 0) + (u.id % 6) * 0.7;
    let targetSpeed = 0; let turned = 0;
    if (goal) {
      tangentToward(u.dir, goal, _a); if (_a.lengthSq() > 0) turned = this.turnToward(u, _a, def.turn * dt);
      const remaining = angleBetween(u.dir, goal) * R;
      targetSpeed = def.speed * ((def.hover || orbital) && remaining < 12 ? clamp(remaining / 12, 0.2, 1) : 1);
    } else if (u.holdFacing) { tangentToward(u.dir, u.holdFacing, _a); if (_a.lengthSq() > 0) turned = this.turnToward(u, _a, def.turn * dt); }
    u.speed = lerp(u.speed, targetSpeed, 1 - Math.exp(-dt * (targetSpeed > u.speed ? 1.6 : 2.5)));
    if (u.speed > 0.05) { moveOnSphere(u.dir, u.fwd, u.speed * dt / R, u.dir); projectTangent(u.dir, u.fwd).normalize(); }
    u.moving = u.speed > 1;
    if (orbital && u.alt < cruise - 3) { u.alt = Math.min(cruise, u.alt + dt * 16); if (this.tick % 2 === 0) { _a.copy(u.pos).addScaledVector(u.dir, -1.5); this.fx.sparks.spawn(_a.x, _a.y, _a.z, -u.dir.x * 14, -u.dir.y * 14, -u.dir.z * 14, 0.6, 1.6, 1.0, 0.8, 0.5, 2.5, 0, 0.5, 0); this.fx.smoke.spawn(_a.x, _a.y, _a.z, -u.dir.x * 10 + (Math.random() - .5) * 3, -u.dir.y * 10 + (Math.random() - .5) * 3, -u.dir.z * 10 + (Math.random() - .5) * 3, 2.0, 2.0, 0.8, 0.8, 0.8, 1.2, 0, 2.5, 0); } }
    else u.alt = lerp(u.alt, cruise, 1 - Math.exp(-dt * 1.4));
    const yawRate = dt > 0 ? turned / dt : 0;
    u.roll = lerp(u.roll, clamp(-yawRate * 0.28 * (u.speed / Math.max(1, def.speed)), -0.75, 0.75), 1 - Math.exp(-dt * 5));
  }
  updateTurret(u, dt) {
    if (u.def.spin) { u.turret += dt * u.def.spin; return; }
    if (u.target && !u.target.dead) { _a.copy(u.target.pos).sub(u.pos); _qi.copy(u.quat).invert(); _a.applyQuaternion(_qi); u.turretGoal = Math.atan2(_a.x, _a.z); }
    else u.turretGoal = 0;
    let diff = u.turretGoal - u.turret; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    const step = 4 * dt; u.turret += clamp(diff, -step, step);
  }
  cleanup() {
    let w = 0; for (let i = 0; i < this.units.length; i++) { const u = this.units[i]; if (!u.dead) this.units[w++] = u; } this.units.length = w;
    for (const t of this.teams) { let k = 0; for (let i = 0; i < t.units.length; i++) { const u = t.units[i]; if (!u.dead) t.units[k++] = u; } t.units.length = k; }
  }
  checkEnd() {
    if (this.over) return;
    for (const t of this.teams) { if (t.commander && t.commander.dead) { t.alive = false; this.over = true; this.winner = 1 - t.id; this.emit({ type: 'gameover', winner: this.winner }); return; } }
  }
}
