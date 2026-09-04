import * as THREE from 'three';
import { DEFS, ECON } from './defs.js';
import { tangentToward, moveOnSphere, angleBetween, anyTangent, mulberry32, clamp } from './util.js';

const DIFF = {
  easy:   { econ: 0.75, attack: 2800, thinkGap: 1.2, maxFab: 3, t2Time: 900, titans: false, aggression: 0.7, maxFactories: 3, defenseGap: 160, advFab: 1, orbitalTime: 1000, nukeTime: 1e9 },
  normal: { econ: 1.0,  attack: 2300, thinkGap: 0.8, maxFab: 5, t2Time: 480, titans: true,  aggression: 1.0, maxFactories: 5, defenseGap: 100, advFab: 2, orbitalTime: 540, nukeTime: 840 },
  hard:   { econ: 1.45, attack: 1700, thinkGap: 0.6, maxFab: 7, t2Time: 360, titans: true,  aggression: 1.3, maxFactories: 7, defenseGap: 70, advFab: 3, orbitalTime: 420, nukeTime: 660 },
  brutal: { econ: 2.1,  attack: 1500, thinkGap: 0.5, maxFab: 9, t2Time: 270, titans: true,  aggression: 1.7, maxFactories: 9, defenseGap: 50, advFab: 4, orbitalTime: 300, nukeTime: 520 },
};
const isFab = (u) => !!u.def.builder && u.def.kind !== 'commander';
const isCombat = (u) => u.def.mobile && !!u.def.weapons && u.def.kind !== 'commander';
const _t = new THREE.Vector3();

export class AI {
  constructor(game, team, difficulty) {
    this.game = game; this.team = team; this.enemy = 1 - team; this.p = DIFF[difficulty] || DIFF.normal; this.difficulty = difficulty;
    game.teams[team].cheat = this.p.econ;
    this.home = game.main; this.base = game.spawnDirs[team].clone(); this.enemyBase = game.spawnDirs[this.enemy].clone();
    this.rng = mulberry32((team + 1) * 7777 + game.main.seed);
    this.acc = 0; this.wave = null; this.lastWave = 0; this.waveCount = 0; this.airRaidT = 0; this.lastDefenseBuild = 0; this.lastThreat = -99; this.factoryRotation = 0; this.lastNuke = -99; this.expansion = null;
    const R = this.home.R; const tan = tangentToward(this.base, this.enemyBase, new THREE.Vector3()); if (tan.lengthSq() < 1e-6) anyTangent(this.base, tan);
    this.rally = moveOnSphere(this.base, tan, 36 / R, new THREE.Vector3()); this.toward = tan;
    const f1 = this.rng() < 0.5 ? 'bot_factory' : 'vehicle_factory';
    this.opening = ['metal_extractor', 'metal_extractor', 'energy_plant', f1, 'metal_extractor', 'metal_extractor', 'energy_plant', 'metal_extractor', 'metal_extractor', 'energy_plant', f1 === 'bot_factory' ? 'vehicle_factory' : 'bot_factory', 'laser_tower', 'energy_plant', 'air_factory'];
  }
  update(dt) { this.acc += dt; if (this.acc >= this.p.thinkGap) { this.acc = 0; this.think(); } }
  T() { return this.game.teams[this.team]; }
  think() {
    const g = this.game; const T = this.T(); if (!T.alive || g.over) return;
    const my = T.units; const en = g.teams[this.enemy].units;
    const c = {
      commander: T.commander && !T.commander.dead ? T.commander : null,
      fabbers: my.filter((u) => isFab(u) && u.built && u.def.layer !== 'orbital'), orbFabbers: my.filter((u) => isFab(u) && u.built && u.def.layer === 'orbital'),
      factories: my.filter((u) => u.factory && u.built && u.def.factory.kind !== 'orbital'), launchers: my.filter((u) => u.factory && u.built && u.def.factory.kind === 'orbital'),
      structures: my.filter((u) => u.def.kind === 'structure'), building: my.filter((u) => !u.built && (u.def.kind === 'structure' || u.def.isTitan)),
      ground: my.filter((u) => isCombat(u) && u.built && u.def.layer === 'ground'),
      fighters: my.filter((u) => isCombat(u) && u.built && u.def.layer === 'air' && u.def.weapons[0].targets === 'a'),
      raiders: my.filter((u) => isCombat(u) && u.built && u.def.layer === 'air' && u.def.weapons[0].targets !== 'a'),
      avengers: my.filter((u) => u.built && u.def.id === 'avenger'), anchors: my.filter((u) => u.built && u.def.id === 'anchor'), solars: my.filter((u) => u.def.id === 'solar_array'),
      titans: my.filter((u) => u.def.isTitan), umbrellas: my.filter((u) => u.def.id === 'umbrella'), antinukes: my.filter((u) => u.def.id === 'antinuke'), nukeLaunchers: my.filter((u) => u.def.id === 'nuke_launcher'), teleporters: my.filter((u) => u.def.teleporter && !u.dead),
      enemyAir: en.filter((u) => u.def.layer === 'air' && u.built).length, enemyOrbitals: en.filter((u) => u.def.layer === 'orbital' && u.built && !u.transit),
      enemyStructures: en.filter((u) => u.def.kind === 'structure' && u.progress > 0), enemyUnits: en,
      enemyNukeLaunchers: en.filter((u) => u.def.id === 'nuke_launcher'), enemyAntinukes: en.filter((u) => u.def.id === 'antinuke'),
    };
    c.advFabbers = c.fabbers.filter((u) => u.def.tier >= 2);
    c.hasAdv = c.factories.some((f) => f.def.factory.tier === 2) || c.building.some((u) => u.def.factory && u.def.factory.tier === 2);
    this.c = c;
    this.manageCommander(c); this.manageFabbers(c); this.manageFactories(c); this.manageOrbital(c); this.manageNukes(c); this.manageDefense(c); this.manageArmy(c);
  }
  needEnergy() { const T = this.T(); const demandE = (T.lastDemandM + 30) * ECON.energyPerMetal; return T.incomeE < demandE * 1.15 || (T.stallE && T.energy < T.energyCap * 0.3); }
  freeSpot(planet, near, maxDist, builder = null) {
    const R = planet.R; const cands = [];
    const lim = Math.cos(Math.min(Math.PI, maxDist / R));
    // A metal spot on another continent is placeable but not WALKABLE. Without this check a ground
    // engineer is sent across an ocean, stalls at the shoreline, and the 60s blacklist never trips
    // because canPlace keeps saying yes. On the home world 41 of 76 spots are off-continent.
    const walk = builder && builder.planet === planet && !builder.dead
      && builder.def && builder.def.layer === 'ground' && planet.sameComponent;
    for (const s of planet.spots) {
      if (s.taken && !s.taken.dead) continue;
      const d = s.dir.dot(near); if (d <= lim) continue;
      if (walk && !planet.sameComponent(builder.dir, s.dir)) continue;
      cands.push([d, s]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    for (const [, s] of cands) { if (s.aiBad && this.game.time - s.aiBad < 60) continue; if (this.game.canPlace('metal_extractor', this.team, planet, s.dir).ok) return s; s.aiBad = this.game.time; }
    return null;
  }
  tryBuild(id, builder, planet, near, minR = 8, maxR = 60, toward = null) {
    const g = this.game; let dir;
    if (DEFS[id].extractor) { const s = this.freeSpot(planet, near, maxR, builder); if (!s) return false; dir = s.dir; }
    else { dir = g.findPlacement(id, this.team, planet, near, minR, maxR, toward); if (!dir) return false; }
    const s = g.placeStructure(id, this.team, planet, dir); if (!s) return false;
    g.orderBuild([builder], s, false); if (this.c) { this.c.building.push(s); if (s.def.factory && s.def.factory.tier === 2) this.c.hasAdv = true; if (s.def.teleporter) this.c.teleporters.push(s); }
    return true;
  }
  desiredFactories() { const T = this.T(); return clamp(1 + Math.floor(T.incomeM / 22), 1, this.p.maxFactories); }
  nextFactoryType(c) {
    const counts = {}; for (const f of c.factories) counts[f.def.id] = (counts[f.def.id] || 0) + 1; for (const b of c.building) if (b.def.factory) counts[b.def.id] = (counts[b.def.id] || 0) + 1;
    const t = this.game.time; const T = this.T();
    if (t > this.p.t2Time && !c.hasAdv && T.incomeM > 18) return (counts.bot_factory || 0) >= (counts.vehicle_factory || 0) ? 'adv_bot_factory' : 'adv_vehicle_factory';
    if (c.hasAdv && t > this.p.t2Time + 400 && !counts.adv_air_factory && T.incomeM > 45) return 'adv_air_factory';
    const order = ['vehicle_factory', 'bot_factory', 'air_factory', 'vehicle_factory', 'bot_factory'];
    return order[this.factoryRotation++ % order.length];
  }
  idleOrStale(u) {
    if (!u.orders.length) return true;
    const o = u.orders[0]; const t = this.game.time;
    const assisting = o.type === 'build' && o.target && (o.target.built || o.target.dead);
    if (assisting) {
      if (!u.ai || u.ai.role !== 'assist') { u.ai = { role: 'assist', t }; return false; }
      if (t - u.ai.t > 25) { this.game.orderStop([u]); u.ai = null; return true; }
    }
    return false;
  }
  assistSomething(c, u) {
    const g = this.game; let best = null, bd = Infinity;
    for (const b of c.building) { if (b.planet !== u.planet && u.def.layer !== 'orbital') continue; const d = b.pos.distanceTo(u.pos); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 600) { g.orderBuild([u], best, false); return true; }
    let bf = null; bd = Infinity;
    for (const f of c.factories.concat(c.launchers)) { if (f.planet !== u.planet) continue; if (!f.factory.current && !f.factory.queue.length) continue; const d = f.pos.distanceTo(u.pos); if (d < bd) { bd = d; bf = f; } }
    if (!bf) for (const s of c.nukeLaunchers.concat(c.antinukes)) { if (s.built && s.planet === u.planet && s.silo.ammo < s.def.silo.max) { bf = s; break; } }
    if (bf) { g.orderBuild([u], bf, false); u.ai = { role: 'assist', t: g.time }; return true; }
    return false;
  }
  /** high-value structures that must not wait behind assist duty */
  strategicBuild(c, u) {
    const g = this.game; const T = this.T(); const t = g.time; const pl = u.planet; const adv = u.def.tier >= 2 || u.def.kind === 'commander';
    const building = (id) => c.building.some((b) => b.def.id === id);
    const count = (id) => c.structures.filter((s) => s.def.id === id).length;
    if (t > this.p.t2Time && !c.hasAdv && T.incomeM > 18 && pl === this.home) { const id = c.factories.filter((f) => f.def.factory.kind === 'bot').length >= c.factories.filter((f) => f.def.factory.kind === 'vehicle').length ? 'adv_bot_factory' : 'adv_vehicle_factory'; if (this.tryBuild(id, u, pl, this.base, 10, 70)) return true; }
    if (t > this.p.orbitalTime && T.incomeM > 35 && !count('orbital_launcher') && !building('orbital_launcher') && pl === this.home && this.tryBuild('orbital_launcher', u, pl, this.base, 10, 70)) return true;
    const nukeThreat = c.enemyNukeLaunchers.length > 0 || g.teams[this.enemy].stats.nukesFired > 0;
    if (nukeThreat && !count('antinuke') && !building('antinuke') && pl === this.home && this.tryBuild('antinuke', u, pl, this.base, 4, 40)) return true;
    if (adv && u.def.kind !== 'commander' && t > this.p.nukeTime && T.incomeM > 55 && !count('nuke_launcher') && !building('nuke_launcher') && pl === this.home && this.tryBuild('nuke_launcher', u, pl, this.base, 10, 60)) return true;
    const tpEx = c.teleporters.find((x) => x.planet !== this.home); const tpHome = c.teleporters.find((x) => x.planet === this.home);
    if (tpEx && !tpHome && pl === this.home && this.tryBuild('teleporter', u, pl, this.rally, 4, 50)) return true;
    if (c.enemyOrbitals.length >= 2 && c.umbrellas.filter((x) => x.planet === pl).length < 2 && this.tryBuild('umbrella', u, pl, pl === this.home ? this.base : u.dir, 6, 50)) return true;
    return false;
  }
  manageCommander(c) {
    const cm = c.commander; if (!cm || cm.drop > 0) return;
    const g = this.game; const T = this.T();
    if (!this.idleOrStale(cm)) return;
    while (this.opening.length) { const id = this.opening[0]; this.opening.shift(); if (this.tryBuild(id, cm, this.home, this.base, 8, 50, null)) return; }
    if (this.needEnergy() && this.tryBuild('energy_plant', cm, this.home, this.base, 8, 60)) return;
    if (this.strategicBuild(c, cm)) return;
    if (this.freeSpot(this.home, this.base, 70, cm) && this.tryBuild('metal_extractor', cm, this.home, this.base, 0, 70)) return;
    if (c.factories.length + c.building.filter((b) => b.def.factory).length < this.desiredFactories() && T.metal > 300 && this.tryBuild(this.nextFactoryType(c), cm, this.home, this.base, 10, 60)) return;
    if (g.time - this.lastDefenseBuild > this.p.defenseGap && c.structures.length > 6) { const id = c.enemyAir > 4 && this.rng() < 0.5 ? 'flak_tower' : 'laser_tower'; if (this.tryBuild(id, cm, this.home, this.rally, 4, 40, this.enemyBase)) { this.lastDefenseBuild = g.time; return; } }
    this.assistSomething(c, cm);
  }
  manageFabbers(c) {
    const g = this.game; const T = this.T(); const t = g.time;
    const titanBuilding = c.building.find((b) => b.def.isTitan);
    for (const u of c.fabbers) {
      if (!this.idleOrStale(u)) continue;
      const adv = u.def.tier >= 2; const pl = u.planet;
      if (adv) {
        if (titanBuilding && titanBuilding.planet === pl) { g.orderBuild([u], titanBuilding, false); continue; }
        if (this.p.titans && t > this.p.t2Time + 150 && T.incomeM > 30 && c.titans.length < 2 + Math.floor(t / 900)) { const pick = c.enemyAir > 8 ? 'zeus' : (this.rng() < 0.5 ? 'ares' : 'atlas'); if (this.tryBuild(pick, u, pl, this.base, 16, 70, null)) continue; }
        if (this.needEnergy() && T.incomeM > 25 && this.tryBuild('adv_energy', u, pl, this.base, 12, 70)) continue;
        if (t - this.lastDefenseBuild > this.p.defenseGap * 0.7) { if (this.tryBuild(this.rng() < 0.6 ? 'adv_laser_tower' : 'artillery', u, pl, this.rally, 4, 45, this.enemyBase)) { this.lastDefenseBuild = t; continue; } }
      }
      if (this.needEnergy() && this.tryBuild('energy_plant', u, pl, u.dir, 6, 60)) continue;
      if (this.strategicBuild(c, u)) continue;
      const spot = this.freeSpot(pl, u.dir, 520);
      if (spot && !(c.enemyStructures.some((e) => e.planet === pl && e.pos.distanceTo(spot.pos) < 45)) && this.tryBuild('metal_extractor', u, pl, u.dir, 0, 520)) continue;
      if (!spot && this.expansion && g.teleportRoute(pl, this.expansion, this.team) && this.freeSpot(this.expansion, this.expansion.spots[0].dir, 1e9) && this.tryBuild('metal_extractor', u, this.expansion, this.expansion.spots[0].dir, 0, 1e9)) continue;
      if (pl === this.home && c.factories.length + c.building.filter((b) => b.def.factory).length < this.desiredFactories() && T.metal > 250 && this.tryBuild(this.nextFactoryType(c), u, pl, this.base, 10, 70)) continue;
      if (c.enemyOrbitals.length >= 2 && c.umbrellas.filter((x) => x.planet === pl).length < 2 && this.tryBuild('umbrella', u, pl, pl === this.home ? this.base : u.dir, 6, 50)) continue;
      if (t - this.lastDefenseBuild > this.p.defenseGap && c.structures.length > 8) { const id = c.enemyAir > 3 && this.rng() < 0.5 ? 'flak_tower' : 'laser_tower'; if (this.tryBuild(id, u, pl, pl === this.home ? this.rally : u.dir, 4, 45, pl === this.home ? this.enemyBase : null)) { this.lastDefenseBuild = t; continue; } }
      if (this.assistSomething(c, u)) continue;
      if (spot && this.tryBuild('metal_extractor', u, pl, u.dir, 0, 520)) continue;
    }
  }
  manageFactories(c) {
    const g = this.game;
    const T = this.T(); const fabCount = c.fabbers.length + c.factories.reduce((n, f) => n + (f.factory.current && isFab(f.factory.current) ? 1 : 0) + f.factory.queue.filter((id) => DEFS[id].builder).length, 0);
    const maxFab = this.p.maxFab + Math.floor(g.time / 360);
    const advFab = c.advFabbers.length; const airFactor = clamp(c.enemyAir / 6, 0.4, 2.5);
    const starving = T.metal < 150 && T.eff < 0.85;
    const armySize = c.ground.length + c.fighters.length + c.raiders.length; const capped = armySize > 320;
    for (const f of c.factories) {
      const fa = f.factory; if (!fa.rally && f.planet === this.home) g.setRally(f, this.rally);
      if (fa.queue.length >= 2) continue;
      if (capped && !(fabCount < maxFab)) continue;
      if (starving && (fa.queue.length >= 1 || fa.current) && !(fabCount < maxFab)) continue;
      const kind = f.def.factory.kind, tier = f.def.factory.tier; let pick; const r = this.rng();
      if (tier === 1) {
        if (fabCount < maxFab && (this.rng() < 0.6 || starving) && kind !== 'air') pick = kind === 'bot' ? 'bot_fabber' : 'vehicle_fabber';
        else if (kind === 'bot') pick = r < 0.5 ? 'dox' : (r < 0.75 ? 'grenadier' : (this.rng() < airFactor * 0.5 ? 'stinger' : 'dox'));
        else if (kind === 'vehicle') pick = r < 0.5 ? 'ant' : (r < 0.7 ? 'inferno' : (r < 0.9 ? (this.rng() < airFactor * 0.5 ? 'spinner' : 'ant') : 'skitter'));
        else pick = (fabCount < maxFab && r < 0.15) ? 'air_fabber' : (r < 0.55 ? 'hummingbird' : 'bumblebee');
      } else {
        if (advFab < this.p.advFab && this.rng() < 0.7) pick = kind === 'bot' ? 'adv_bot_fabber' : (kind === 'vehicle' ? 'adv_vehicle_fabber' : 'adv_air_fabber');
        else if (kind === 'bot') pick = r < 0.45 ? 'slammer' : (r < 0.75 ? 'bluehawk' : 'gil_e');
        else if (kind === 'vehicle') pick = r < 0.45 ? 'leveler' : (r < 0.75 ? 'sheller' : 'vanguard');
        else pick = r < 0.4 ? 'phoenix' : (r < 0.75 ? 'hornet' : 'kestrel');
      }
      g.factoryQueue(f, pick, 1);
    }
  }
  chooseExpansion(c) {
    const g = this.game; let best = null, bs = -Infinity;
    for (const p of g.planets) {
      if (p === this.home) continue; const free = p.spots.filter((s) => !s.taken || s.taken.dead).length; if (free < 3) continue;
      const enemy = c.enemyStructures.filter((e) => e.planet === p).length; const s = free - enemy * 3 - p.center.distanceTo(this.home.center) / 3000;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  manageOrbital(c) {
    const g = this.game; const T = this.T(); const t = g.time;
    if (!this.expansion || (this.expansion.spots.every((s) => s.taken && !s.taken.dead) && c.teleporters.some((x) => x.planet === this.expansion))) this.expansion = this.chooseExpansion(c);
    const ex = this.expansion;
    for (const L of c.launchers) {
      if (L.factory.queue.length >= 1) continue;
      const queued = (id) => (L.factory.current && L.factory.current.def.id === id ? 1 : 0) + L.factory.queue.filter((x) => x === id).length;
      const orbFabTotal = c.orbFabbers.length + queued('orbital_fabber'); let pick = null;
      if (orbFabTotal < 2 && ex) pick = 'orbital_fabber';
      else if (c.enemyOrbitals.length >= 2 && c.avengers.length + queued('avenger') < c.enemyOrbitals.length + 1) pick = 'avenger';
      else if (this.needEnergy() && c.solars.length + queued('solar_array') < 8) pick = 'solar_array';
      else if (ex && c.anchors.filter((a) => a.planet === ex || (a.transit && a.transit.to === ex)).length + queued('anchor') < 1 && T.incomeM > 50 && c.structures.some((s) => s.planet === ex)) pick = 'anchor';
      else if (c.solars.length + queued('solar_array') < 4) pick = 'solar_array';
      if (pick) g.factoryQueue(L, pick, 1);
    }
    for (const u of c.orbFabbers) {
      if (u.transit) continue; if (!this.idleOrStale(u)) continue;
      if (!ex) { this.assistSomething(c, u); continue; }
      if (u.planet !== ex) { const spot = this.freeSpot(ex, ex.spots[0].dir, 1e9); g.orderMove([u], ex, spot ? spot.dir : ex.spots[0].dir, false); continue; }
      const mineHere = ex.spots.filter((s) => s.taken && !s.taken.dead && s.taken.team === this.team);
      const tpHere = c.teleporters.find((x) => x.planet === ex);
      if (!tpHere && mineHere.length >= 2) { if (this.tryBuild('teleporter', u, ex, mineHere[0].dir, 8, 70)) continue; }
      if (this.tryBuild('metal_extractor', u, ex, u.dir, 0, 500)) continue;
      if (c.enemyOrbitals.length >= 1 && !c.umbrellas.some((x) => x.planet === ex) && this.tryBuild('umbrella', u, ex, u.dir, 6, 60)) continue;
      if (this.needEnergy() && this.tryBuild('energy_plant', u, ex, u.dir, 6, 70)) continue;
      if (c.factories.filter((f) => f.planet === ex).length < 1 && T.incomeM > 60 && this.tryBuild('vehicle_factory', u, ex, u.dir, 10, 70)) continue;
      this.assistSomething(c, u);
    }
    const tpEx = c.teleporters.find((x) => x.planet !== this.home); const tpHome = c.teleporters.find((x) => x.planet === this.home);
    if (tpEx && tpHome && tpEx.built && tpHome.built && tpEx.link !== tpHome) g.linkTeleporters(tpHome, tpEx);
    for (const a of c.anchors) if (!a.orders.length && !a.transit && ex && a.planet !== ex) { const mine = ex.spots.find((s) => s.taken && !s.taken.dead && s.taken.team === this.team); g.orderMove([a], ex, mine ? mine.dir : ex.spots[0].dir, false); }
    const av = c.avengers.filter((u) => !u.orders.length && !u.transit);
    if (av.length && c.enemyOrbitals.length) { const target = c.enemyOrbitals[0]; g.orderAttack(av, target, false); }
  }
  manageNukes(c) {
    const g = this.game; const T = this.T(); const t = g.time;
    for (const L of c.nukeLaunchers) {
      if (!L.built || L.silo.ammo < 1 || t - this.lastNuke < 20) continue;
      const target = this.pickNukeTarget(c); if (target) { g.fireNuke(L, target.planet, target.dir); this.lastNuke = t; }
    }
  }
  pickNukeTarget(c) {
    let best = null, bs = 2500; const en = c.enemyUnits; const ec = this.game.teams[this.enemy].commander;
    const cands = c.enemyStructures.slice(); if (ec && !ec.dead) cands.push(ec);
    for (const s of cands) {
      if (s.dead) continue; let v = 0;
      for (const e of en) { if (e.dead || e.planet !== s.planet || e.transit) continue; if (e.pos.distanceTo(s.pos) < 45) v += e.def.kind === 'commander' ? 6000 : (e.def.kind === 'structure' ? e.def.cost : e.def.cost * 0.5); }
      for (const an of c.enemyAntinukes) if (an.built && an.silo.ammo > 0 && an.planet === s.planet && an.pos.distanceTo(s.pos) < an.def.antinukeRange) { v *= 0.03; break; }
      if (v > bs) { bs = v; best = s; }
    }
    return best ? { planet: best.planet, dir: best.dir.clone() } : null;
  }
  reachable(planet) { return planet === this.home || !!this.game.teleportRoute(this.home, planet, this.team); }
  pickTarget(from, c) {
    let best = null, bs = Infinity;
    for (const e of c.enemyStructures) {
      if (e.dead || !this.reachable(e.planet)) continue; let w = 1; const id = e.def.id;
      if (id === 'metal_extractor') w = 0.85; else if (id.includes('energy')) w = 0.8; else if (e.def.factory) w = 0.95; else if (e.def.weapons) w = 1.5;
      if (e.planet !== this.home) w *= 1.4;
      const s = e.pos.distanceTo(from) * w; if (s < bs) { bs = s; best = e; }
    }
    if (!best) { const ec = this.game.teams[this.enemy].commander; if (ec && !ec.dead && this.reachable(ec.planet)) best = ec; }
    if (!best) { for (const e of c.enemyUnits) if (!e.dead && e.progress > 0 && this.reachable(e.planet) && e.def.layer === 'ground') { best = e; break; } }
    return best;
  }
  value(units) { let v = 0; for (const u of units) v += u.def.aiValue; return v; }
  centroid(units, out) { out.set(0, 0, 0); for (const u of units) out.add(u.pos); if (units.length) out.multiplyScalar(1 / units.length); else out.copy(this.home.center); return out; }
  manageArmy(c) {
    const g = this.game; const t = g.time;
    if (this.wave) {
      const w = this.wave; w.units = w.units.filter((u) => !u.dead);
      if (!w.units.length || this.value(w.units) < w.initial * 0.18 || t - w.started > 260) { if (w.units.length) g.orderMove(w.units, this.home, this.rally, false); this.wave = null; }
      else {
        if (!w.target || w.target.dead) { w.target = this.pickTarget(this.centroid(w.units, _t), c); if (w.target) g.orderAttackMove(w.units, w.target.planet, w.target.dir, false); }
        else if (t - w.lastIssue > 10) { w.lastIssue = t; const idle = w.units.filter((u) => !u.orders.length); if (idle.length) g.orderAttackMove(idle, w.target.planet, w.target.dir, false); }
      }
    }
    const inWave = new Set(this.wave ? this.wave.units : []);
    const idle = c.ground.filter((u) => !inWave.has(u) && !u.orders.length && u.drop <= 0 && u.planet === this.home);
    const near = idle.filter((u) => angleBetween(u.dir, this.rally) * this.home.R < 60);
    const threshold = this.p.attack * (0.45 + t / 700) / this.p.aggression; const val = this.value(near);
    if (!this.wave && (val >= threshold || (t - this.lastWave > 300 && val >= threshold * 0.5 && near.length >= 6)) && t - this.lastThreat > 15) {
      const target = this.pickTarget(this.centroid(near, _t), c);
      if (target) { this.wave = { units: near.slice(), target, initial: val, lastIssue: t, started: t, id: ++this.waveCount }; g.orderAttackMove(near, target.planet, target.dir, false); this.lastWave = t; }
    }
    for (const u of idle) { if (this.wave && this.wave.units.includes(u)) continue; if (angleBetween(u.dir, this.rally) * this.home.R > 40) g.orderMove([u], this.home, this.rally, false); }
    const fIdle = c.fighters.filter((u) => !u.orders.length);
    if (fIdle.length) {
      const enemyAir = c.enemyUnits.filter((e) => e.def.layer === 'air' && e.built && e.planet === this.home && angleBetween(e.dir, this.base) * this.home.R < 220);
      if (enemyAir.length) g.orderAttackMove(fIdle, this.home, enemyAir[0].dir, false);
      else if (this.wave && this.wave.target && this.wave.target.planet === this.home && fIdle.length >= 4) g.orderAttackMove(fIdle, this.home, this.wave.target.dir, false);
      else for (const u of fIdle) if (angleBetween(u.dir, this.rally) * this.home.R > 30) g.orderMove([u], this.home, this.rally, false);
    }
    const rIdle = c.raiders.filter((u) => !u.orders.length && u.planet === this.home);
    if (rIdle.length >= 3 && t - this.airRaidT > 40) {
      const econ = c.enemyStructures.filter((e) => (e.def.econ || e.def.factory) && e.planet === this.home);
      const target = econ.length ? econ[Math.floor(this.rng() * econ.length)] : this.pickTarget(this.home.center, c);
      if (target && target.planet === this.home) { g.orderAttack(rIdle, target, false); g.orderMove(rIdle, this.home, this.rally, true); this.airRaidT = t; }
    } else if (rIdle.length) { for (const u of rIdle) if (angleBetween(u.dir, this.rally) * this.home.R > 30) g.orderMove([u], this.home, this.rally, false); }
  }
  manageDefense(c) {
    const g = this.game; const t = g.time;
    let threat = null, td = Infinity;
    for (const e of c.enemyUnits) {
      if (e.dead || !e.built || e.transit || !(e.def.weapons || e.def.builder) || (e.def.layer === 'air' && e.def.weapons && e.def.weapons[0].targets === 'a') || e.def.layer === 'orbital') continue;
      for (const s of c.structures) { if (s.planet !== e.planet) continue; const d = e.pos.distanceTo(s.pos); if (d < 80 && d < td) { td = d; threat = e; } }
      if (c.commander && c.commander.planet === e.planet) { const d = e.pos.distanceTo(c.commander.pos); if (d < 90 && d < td) { td = d; threat = e; } }
    }
    if (!threat) return;
    const responders = c.ground.filter((u) => u.drop <= 0 && (!u.orders.length || (u.ai && u.ai.role === 'defend' && t - u.ai.t > 12)) && g.canReach(u, threat.planet) && (u.planet !== threat.planet || u.pos.distanceTo(threat.pos) < 260));
    if (responders.length) { this.lastThreat = t; g.orderAttackMove(responders, threat.planet, threat.dir, false); for (const u of responders) u.ai = { role: 'defend', t }; }
    if (threat.def.layer === 'air') { const f = c.fighters.filter((u) => !u.orders.length && u.planet === threat.planet); if (f.length) g.orderAttackMove(f, threat.planet, threat.dir, false); }
    if (this.wave && threat.planet === this.home && td < 50 && this.value(responders) < this.value(this.wave.units) * 0.3 && this.centroid(this.wave.units, _t).distanceTo(this.home.center) < this.home.R + 40 && angleBetween(_t.clone().sub(this.home.center).normalize(), this.base) * this.home.R > 150) {
      g.orderAttackMove(this.wave.units, threat.planet, threat.dir, false); this.wave = null;
    }
  }
}
