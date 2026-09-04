import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { Planet } from './planet.js';
import { mulberry32, clamp, TAU } from './util.js';
import { sunTextures } from './textures.js';

const MAIN_NAMES = ['Terminus', 'Halcyon', 'Vesper', 'Corvid', 'Meridian', 'Ostara', 'Tarn', 'Ilium', 'Sarn', 'Kepler'];
const MOON_NAMES = ['Minor', 'Keel', 'Sable', 'Pike', 'Nix', 'Vela'];
const OTHER_NAMES = ['Brannoch', 'Ashfall', 'Rime', 'Dune', 'Cinder', 'Hollow', 'Calyx', 'Orrin'];

export class StarSystem {
  constructor({ seed = 1, biome = 'earth', planetCount = 3, quality = 'high', detailMain = 7, detailOther = 6 } = {}) {
    this.seed = seed >>> 0; this.biome = biome; this.planetCount = clamp(planetCount, 1, 5); this.quality = quality; this.detailMain = detailMain; this.detailOther = detailOther;
    this.group = new THREE.Group(); this.planets = []; this.sunPos = new THREE.Vector3();
  }
  layout() {
    const rng = mulberry32((this.seed ^ 0x5bd1e995) >>> 0);
    // Every system shows every world type: the menu's choice is the home planet, and the remaining
    // slots take the other biomes in a seed-shuffled order so nothing repeats before all five appear.
    const rest = ['earth', 'lava', 'ice', 'desert', 'moon'].filter((x) => x !== this.biome);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    let rp = 0; const next = () => rest[rp++ % rest.length];
    const nm = (arr) => arr[Math.floor(rng() * arr.length)];
    const a0 = rng() * TAU; const detailMain = this.detailMain, detailSec = this.detailOther;
    return [
      { R: 320, orbit: 2600, ang: a0, y: 0, biome: this.biome, isMain: true, name: nm(MAIN_NAMES), detail: detailMain },
      { R: 150, parent: 0, orbit: 1250, ang: rng() * TAU, y: 140 + rng() * 120, biome: next(), name: nm(MOON_NAMES), detail: detailSec },
      { R: 230, orbit: 4100, ang: a0 + 1.9 + rng() * 0.8, y: -160, biome: next(), name: nm(OTHER_NAMES), detail: detailSec },
      { R: 190, orbit: 5400, ang: a0 + 3.9 + rng() * 0.8, y: 240, biome: next(), name: nm(OTHER_NAMES), detail: detailSec },
      { R: 210, orbit: 6800, ang: a0 + 5.4 + rng() * 0.7, y: -280, biome: next(), name: nm(OTHER_NAMES), detail: detailSec },
    ].slice(0, this.planetCount);
  }
  addPlanet(L, i) {
      const center = new THREE.Vector3(Math.cos(L.ang) * L.orbit, L.y, Math.sin(L.ang) * L.orbit);
      if (L.parent !== undefined) center.add(this.planets[L.parent].center);
      const sunDir = center.clone().negate().normalize();
      const planet = new Planet({ seed: (this.seed * 31 + i * 977) >>> 0, radius: L.R, biome: L.biome, detail: L.detail, name: L.name, index: i, center, sunDir, isMain: !!L.isMain, orbit: L.orbit, parent: L.parent === undefined ? null : this.planets[L.parent] });
      planet.generate(); this.planets.push(planet); this.group.add(planet.group); return planet;
  }
  generate() { const layout = this.layout(); layout.forEach((L, i) => this.addPlanet(L, i)); this.buildSun(); this.buildOrbits(); }
  /** generates planet by planet, yielding to the browser so a progress overlay can repaint */
  async generateAsync(onProgress) {
    const layout = this.layout(); const tick = () => new Promise((r) => setTimeout(r, 30));
    for (let i = 0; i < layout.length; i++) { if (onProgress) onProgress(`Forging ${layout[i].name} (${i + 1}/${layout.length})`); await tick(); this.addPlanet(layout[i], i); }
    if (onProgress) onProgress('Igniting the sun'); await tick(); this.buildSun(); this.buildOrbits();
  }
  buildSun() {
    const tex = sunTextures();
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(110, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 2.4, 1.8) }));
    this.sun.position.copy(this.sunPos); this.group.add(this.sun);
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.corona, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(1.6, 1.4, 1.1) }));
    corona.scale.set(1500, 1500, 1); corona.position.copy(this.sunPos); this.group.add(corona); this.corona = corona;
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(tex.flare0, 520, 0, new THREE.Color(1.0, 0.95, 0.85)));
    flare.addElement(new LensflareElement(tex.flare1, 90, 0.3, new THREE.Color(0.7, 0.85, 1.0)));
    flare.addElement(new LensflareElement(tex.flare2, 140, 0.5, new THREE.Color(1.0, 0.8, 0.6)));
    flare.addElement(new LensflareElement(tex.flare1, 200, 0.75, new THREE.Color(0.6, 0.8, 1.0)));
    flare.addElement(new LensflareElement(tex.flare2, 60, 0.9, new THREE.Color(1.0, 0.9, 0.7)));
    flare.addElement(new LensflareElement(tex.flare1, 320, 1.15, new THREE.Color(0.5, 0.7, 1.0)));
    this.sun.add(flare); this.flare = flare;
  }
  buildOrbits() {
    const mat = new THREE.LineBasicMaterial({ color: 0x3a5a7a, transparent: true, opacity: 0.35, depthWrite: false });
    for (const p of this.planets) {
      if (!p.orbit) continue;
      const pts = []; const cen = p.parent ? p.parent.center : this.sunPos; const y = p.center.y;
      for (let i = 0; i <= 256; i++) { const a = i / 256 * TAU; pts.push(new THREE.Vector3(cen.x + Math.cos(a) * p.orbit, y, cen.z + Math.sin(a) * p.orbit)); }
      const g = new THREE.BufferGeometry().setFromPoints(pts); const line = new THREE.LineLoop(g, mat); line.frustumCulled = false; this.group.add(line);
    }
  }
  setFocus(planet) { for (const p of this.planets) p.setFocus(p === planet); this.focused = planet; }
  nearest(pos) { let best = null, bd = Infinity; for (const p of this.planets) { const d = p.center.distanceTo(pos) - p.R; if (d < bd) { bd = d; best = p; } } return best; }
  update(dt, camera) { for (const p of this.planets) p.update(dt, camera); }
  dispose() { for (const p of this.planets) p.dispose(); this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); }); }
}
