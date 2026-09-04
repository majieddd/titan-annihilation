// Unit, structure, orbital and titan definitions. Models are lists of primitive parts:
// [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz]
// shapes: box cyl cylz cylx sph cone conez wdg tor hex pyr
// flags: t=team color, g=glow, G=bright glow, u=turret part, d=dark, l=light, k=black
import { mulberry32 } from './util.js';
export const TEAM_COLORS = [[0.15, 0.62, 1.0], [1.0, 0.4, 0.1]];
export const TEAM_NAMES = ['Player', 'Enemy Commander'];
export const ECON = { energyPerMetal: 20, startMetal: 1000, startEnergy: 10000, storageMetal: 2500, storageEnergy: 30000 };

const P = (shape, x, y, z, sx, sy, sz, flags = '', rx = 0, ry = 0, rz = 0) => [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz];
const R = mulberry32(90210); // deterministic greeble randomness
/** scatter small mechanical details on a horizontal surface centred at (cx,cy,cz) spanning sx by sz */
function greeble(cx, cy, cz, sx, sz, n, flags = '') {
  const out = []; const minD = Math.min(sx, sz);
  for (let i = 0; i < n; i++) {
    const t = R(); const w = (0.1 + R() * 0.2) * minD; const hh = (0.2 + R() * 0.7) * w * 1.6;
    const x = cx + (R() - 0.5) * Math.max(0, sx - w) * 0.9, z = cz + (R() - 0.5) * Math.max(0, sz - w) * 0.9;
    if (t < 0.45) out.push(P('rbox', x, cy + hh / 2, z, w * (0.8 + R() * 0.8), hh, w * (0.8 + R() * 0.8), R() < 0.3 ? 'd' : (R() < 0.25 ? 't' : flags)));
    else if (t < 0.8) out.push(P('cyl', x, cy + hh / 2, z, w, hh, w, R() < 0.5 ? 'd' : 'l'));
    else out.push(P('box', x, cy + w * 0.12, z, w * 2.4, w * 0.25, w * 0.5, 'k', 0, R() * Math.PI, 0));
  }
  return out;
}
/** pipe with end flanges along an axis */
function pipe(x, y, z, len, axis = 'z', r = 0.14, flags = 'k') {
  if (axis === 'z') return [P('cylz', x, y, z, r * 2, r * 2, len, flags), P('cylz', x, y, z - len / 2 + r, r * 2.8, r * 2.8, r * 1.2, 'l'), P('cylz', x, y, z + len / 2 - r, r * 2.8, r * 2.8, r * 1.2, 'l')];
  if (axis === 'x') return [P('cylx', x, y, z, len, r * 2, r * 2, flags), P('cylx', x - len / 2 + r, y, z, r * 1.2, r * 2.8, r * 2.8, 'l'), P('cylx', x + len / 2 - r, y, z, r * 1.2, r * 2.8, r * 2.8, 'l')];
  return [P('cyl', x, y, z, r * 2, len, r * 2, flags), P('cyl', x, y - len / 2 + r, z, r * 2.8, r * 1.2, r * 2.8, 'l'), P('cyl', x, y + len / 2 - r, z, r * 2.8, r * 1.2, r * 2.8, 'l')];
}
function lights(x, y, z, n, dx, dz, size = 0.14, flags = 'G') { const out = []; for (let i = 0; i < n; i++) out.push(P('box', x + dx * i, y, z + dz * i, size, size * 0.6, size, flags)); return out; }
function bolts(x, y, z, n, dx, dz, r = 0.09) { const out = []; for (let i = 0; i < n; i++) out.push(P('cyl', x + dx * i, y, z + dz * i, r * 2, r * 0.8, r * 2, 'l')); return out; }

// ---------- model templates ----------
function tankModel(s, opts = {}) {
  const w = 1.8 * s, l = 2.6 * s, h = 0.75 * s;
  const parts = [
    P('rbox', 0, h * 0.9, 0, w, h, l),
    P('wdg', 0, h * 1.45, 0.1 * l, w * 0.8, h * 0.5, l * 0.85, 't'),
    P('box', -w * 0.58, h * 0.6, 0, w * 0.28, h * 1.1, l * 1.08, 'd'), P('box', w * 0.58, h * 0.6, 0, w * 0.28, h * 1.1, l * 1.08, 'd'),
    P('rbox', -w * 0.58, h * 1.2, 0, w * 0.32, h * 0.14, l * 1.1, 'l'), P('rbox', w * 0.58, h * 1.2, 0, w * 0.32, h * 0.14, l * 1.1, 'l'),
    P('box', -w * 0.74, h * 0.85, 0, 0.06 * s, h * 0.5, l * 0.9, 't'), P('box', w * 0.74, h * 0.85, 0, 0.06 * s, h * 0.5, l * 0.9, 't'),
    P('box', 0, h * 1.0, -l * 0.52, w * 0.5, h * 0.35, 0.1 * s, 'g'),
    P('rbox', 0, h * 1.5, -l * 0.35, w * 0.5, h * 0.3, l * 0.22, 'd'),
    P('cylz', -w * 0.28, h * 1.3, -l * 0.55, 0.16 * s, 0.16 * s, 0.4 * s, 'k'), P('cylz', w * 0.28, h * 1.3, -l * 0.55, 0.16 * s, 0.16 * s, 0.4 * s, 'k'),
    P('box', -w * 0.3, h * 1.25, l * 0.5, 0.18 * s, 0.1 * s, 0.05 * s, 'G'), P('box', w * 0.3, h * 1.25, l * 0.5, 0.18 * s, 0.1 * s, 0.05 * s, 'G'),
    P('box', -w * 0.4, h * 2.3, -l * 0.35, 0.04 * s, 1.3 * s, 0.04 * s, 'l'),
  ];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) { const z = (-0.36 + i * 0.24) * l; parts.push(P('cylx', side * w * 0.6, h * 0.5, z, w * 0.34, h * 0.8, h * 0.8, 'kW'), P('cylx', side * w * 0.63, h * 0.5, z, w * 0.34, h * 0.4, h * 0.4, 'l')); }
  const ty = h * 1.7;
  const tr = opts.turretR || 0.55 * s;
  parts.push(P('cyl', 0, 0.3 * s, 0, tr * 2, 0.6 * s, tr * 2, 'u'));
  parts.push(P('rbox', 0, 0.35 * s, -0.1 * s, tr * 1.4, 0.55 * s, tr * 2.2, 'ut'));
  parts.push(P('cyl', tr * 0.5, 0.7 * s, -0.35 * s, 0.32 * s, 0.14 * s, 0.32 * s, 'ul'));
  parts.push(P('box', -tr * 0.45, 0.63 * s, -0.5 * s, 0.25 * s, 0.1 * s, 0.4 * s, 'ud'));
  parts.push(P('rbox', 0, 0.4 * s, tr * 0.95, tr * 1.1, 0.45 * s, 0.3 * s, 'ud'));
  parts.push(P('box', tr * 0.7, 0.62 * s, -0.3 * s, 0.25 * s, 0.25 * s, 0.6 * s, 'ul'));
  const barrels = opts.barrels === undefined ? 1 : opts.barrels; const bl = opts.barrelLen || 1.5 * s; const br = opts.barrelR || 0.11 * s;
  for (let i = 0; i < barrels; i++) {
    const off = barrels === 1 ? 0 : (i - (barrels - 1) / 2) * br * 3.2;
    parts.push(P('cylz', off, 0.4 * s, tr + bl / 2, br * 2, br * 2, bl, 'udB'));
    parts.push(P('cylz', off, 0.4 * s, tr + bl * 0.25, br * 2.6, br * 2.6, bl * 0.2, 'uk'));
    parts.push(P('cylz', off, 0.4 * s, tr + bl - br * 1.4, br * 2.5, br * 2.5, br * 2.4, 'ukB'));
  }
  if (opts.radar) parts.push(P('box', tr * 0.8, 0.85 * s, -0.2 * s, 0.15 * s, 0.5 * s, 0.15 * s, 'ul'), P('box', tr * 0.8, 1.1 * s, -0.2 * s, 0.5 * s, 0.04 * s, 0.25 * s, 'ul'));
  return { parts, turretPivot: [0, ty, -0.15 * s], height: ty + 0.8 * s };
}
function botModel(s, opts = {}) {
  const parts = [
    P('sph', -0.34 * s, 1.0 * s, 0, 0.32 * s, 0.32 * s, 0.32 * s, 'd'), P('sph', 0.34 * s, 1.0 * s, 0, 0.32 * s, 0.32 * s, 0.32 * s, 'd'),
    P('rbox', -0.32 * s, 0.75 * s, 0, 0.22 * s, 0.5 * s, 0.32 * s, 'S'), P('rbox', 0.32 * s, 0.75 * s, 0, 0.22 * s, 0.5 * s, 0.32 * s, 'S'),
    P('sph', -0.32 * s, 0.55 * s, 0, 0.3 * s, 0.3 * s, 0.3 * s, 'l'), P('sph', 0.32 * s, 0.55 * s, 0, 0.3 * s, 0.3 * s, 0.3 * s, 'l'),
    P('rbox', -0.32 * s, 0.3 * s, 0.02 * s, 0.2 * s, 0.5 * s, 0.3 * s, 'dS'), P('rbox', 0.32 * s, 0.3 * s, 0.02 * s, 0.2 * s, 0.5 * s, 0.3 * s, 'dS'),
    P('box', -0.32 * s, 0.32 * s, 0.19 * s, 0.16 * s, 0.4 * s, 0.05 * s, 'l'), P('box', 0.32 * s, 0.32 * s, 0.19 * s, 0.16 * s, 0.4 * s, 0.05 * s, 'l'),
    P('cyl', -0.32 * s, 0.32 * s, -0.19 * s, 0.07 * s, 0.42 * s, 0.07 * s, 'k'), P('cyl', 0.32 * s, 0.32 * s, -0.19 * s, 0.07 * s, 0.42 * s, 0.07 * s, 'k'),
    P('box', -0.32 * s, 0.08 * s, 0.08 * s, 0.28 * s, 0.16 * s, 0.55 * s, 'kS'), P('box', 0.32 * s, 0.08 * s, 0.08 * s, 0.28 * s, 0.16 * s, 0.55 * s, 'kS'),
    P('rbox', 0, 1.2 * s, 0, 0.9 * s, 0.7 * s, 0.7 * s, ''),
    P('rbox', 0, 1.25 * s, 0.36 * s, 0.6 * s, 0.4 * s, 0.1 * s, 't'),
    P('box', -0.18 * s, 1.0 * s, 0.37 * s, 0.14 * s, 0.03 * s, 0.03 * s, 'k'), P('box', 0, 1.0 * s, 0.37 * s, 0.14 * s, 0.03 * s, 0.03 * s, 'k'), P('box', 0.18 * s, 1.0 * s, 0.37 * s, 0.14 * s, 0.03 * s, 0.03 * s, 'k'),
    P('rbox', 0, 1.15 * s, -0.42 * s, 0.62 * s, 0.5 * s, 0.18 * s, 'd'),
    P('cyl', -0.16 * s, 1.15 * s, -0.55 * s, 0.14 * s, 0.4 * s, 0.14 * s, 'k'), P('cyl', 0.16 * s, 1.15 * s, -0.55 * s, 0.14 * s, 0.4 * s, 0.14 * s, 'k'),
    P('rbox', -0.5 * s, 1.5 * s, 0, 0.28 * s, 0.2 * s, 0.5 * s, 't'), P('rbox', 0.5 * s, 1.5 * s, 0, 0.28 * s, 0.2 * s, 0.5 * s, 't'),
    P('sph', -0.55 * s, 1.35 * s, 0, 0.2 * s, 0.2 * s, 0.2 * s, 'l'), P('sph', 0.55 * s, 1.35 * s, 0, 0.2 * s, 0.2 * s, 0.2 * s, 'l'),
    P('rbox', 0, 1.62 * s, 0, 0.5 * s, 0.32 * s, 0.5 * s, 'l'),
    P('box', 0, 1.62 * s, 0.26 * s, 0.32 * s, 0.1 * s, 0.06 * s, 'G'),
    P('cyl', 0.16 * s, 1.72 * s, 0.1 * s, 0.1 * s, 0.1 * s, 0.1 * s, 'k'),
    P('box', 0.2 * s, 1.95 * s, -0.1 * s, 0.04 * s, 0.4 * s, 0.04 * s, 'l'),
  ];
  if (opts.gun === 'twin') { parts.push(P('cylz', -0.55 * s, 1.15 * s, 0.35 * s, 0.16 * s, 0.16 * s, 0.9 * s, 'd'), P('cylz', 0.55 * s, 1.15 * s, 0.35 * s, 0.16 * s, 0.16 * s, 0.9 * s, 'd'), P('cylz', -0.55 * s, 1.15 * s, 0.74 * s, 0.2 * s, 0.2 * s, 0.14 * s, 'k'), P('cylz', 0.55 * s, 1.15 * s, 0.74 * s, 0.2 * s, 0.2 * s, 0.14 * s, 'k')); }
  else if (opts.gun === 'launcher') { parts.push(P('rbox', -0.6 * s, 1.45 * s, -0.1 * s, 0.3 * s, 0.35 * s, 0.9 * s, 'd'), P('rbox', 0.6 * s, 1.45 * s, -0.1 * s, 0.3 * s, 0.35 * s, 0.9 * s, 'd')); for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) parts.push(P('cylz', sd * 0.6 * s + (i % 2 ? 0.07 : -0.07) * s, 1.45 * s + (i < 2 ? 0.08 : -0.08) * s, 0.36 * s, 0.09 * s, 0.09 * s, 0.05 * s, 'k')); }
  else if (opts.gun === 'sniper') { parts.push(P('cylz', 0.55 * s, 1.3 * s, 0.6 * s, 0.14 * s, 0.14 * s, 2.2 * s, 'd'), P('cylz', 0.55 * s, 1.3 * s, 1.6 * s, 0.2 * s, 0.2 * s, 0.2 * s, 'k'), P('box', 0.55 * s, 1.45 * s, 0.2 * s, 0.1 * s, 0.2 * s, 0.5 * s, 'l'), P('rbox', -0.55 * s, 1.2 * s, 0, 0.3 * s, 0.4 * s, 0.4 * s, '')); }
  else if (opts.gun === 'fab') { parts.push(P('rbox', 0.6 * s, 1.15 * s, 0.3 * s, 0.25 * s, 0.25 * s, 0.7 * s, 'd'), P('sph', 0.6 * s, 1.15 * s, 0.7 * s, 0.22 * s, 0.22 * s, 0.22 * s, 'G'), P('rbox', -0.6 * s, 1.3 * s, -0.2 * s, 0.3 * s, 0.5 * s, 0.4 * s, 't'), P('cyl', -0.6 * s, 1.6 * s, -0.2 * s, 0.08 * s, 0.3 * s, 0.08 * s, 'l')); }
  else parts.push(P('cylz', 0.55 * s, 1.15 * s, 0.35 * s, 0.16 * s, 0.16 * s, 0.9 * s, 'd'), P('cylz', 0.55 * s, 1.15 * s, 0.74 * s, 0.2 * s, 0.2 * s, 0.14 * s, 'k'));
  return { parts, height: 1.9 * s };
}
function planeModel(s, opts = {}) {
  const parts = [
    P('wdg', 0, 0.5 * s, 0.9 * s, 0.5 * s, 0.4 * s, 1.6 * s, '', Math.PI / 2, 0, 0),
    P('rbox', 0, 0.5 * s, -0.2 * s, 0.55 * s, 0.42 * s, 1.6 * s, ''),
    P('rbox', 0, 0.64 * s, 0.4 * s, 0.34 * s, 0.22 * s, 0.6 * s, 'G'),
    P('box', 0, 0.9 * s, -0.8 * s, 0.1 * s, 0.6 * s, 0.6 * s, 't'),
    P('box', -0.35 * s, 0.6 * s, -0.95 * s, 0.6 * s, 0.05 * s, 0.35 * s, 'l', 0, 0, 0.25), P('box', 0.35 * s, 0.6 * s, -0.95 * s, 0.6 * s, 0.05 * s, 0.35 * s, 'l', 0, 0, -0.25),
    P('cylz', 0, 0.5 * s, -1.05 * s, 0.3 * s, 0.3 * s, 0.4 * s, 'd'),
    P('cylz', 0, 0.5 * s, -1.28 * s, 0.24 * s, 0.24 * s, 0.05 * s, 'G'),
    P('box', 0, 0.28 * s, -0.1 * s, 0.4 * s, 0.1 * s, 1.2 * s, 'd'),
    P('cylz', 0, 0.42 * s, 1.72 * s, 0.08 * s, 0.08 * s, 0.25 * s, 'k'),
    P('box', -0.2 * s, 0.25 * s, 0.3 * s, 0.05 * s, 0.14 * s, 0.4 * s, 'k'), P('box', 0.2 * s, 0.25 * s, 0.3 * s, 0.05 * s, 0.14 * s, 0.4 * s, 'k'),
  ];
  const span = (opts.span || 2.6) * s;
  if (opts.wing === 'delta') { parts.push(P('wdg', 0, 0.45 * s, -0.2 * s, span, 0.08 * s, 1.3 * s, 't', 0, 0, 0), P('box', -span * 0.42, 0.5 * s, -0.5 * s, 0.05 * s, 0.25 * s, 0.4 * s, 'l'), P('box', span * 0.42, 0.5 * s, -0.5 * s, 0.05 * s, 0.25 * s, 0.4 * s, 'l'), P('box', 0, 0.42 * s, -0.75 * s, span * 0.7, 0.03 * s, 0.14 * s, 'd')); }
  else if (opts.wing === 'heli') { parts.push(P('box', 0, 0.95 * s, 0, 3.4 * s, 0.05 * s, 0.25 * s, 'dR'), P('box', 0, 0.95 * s, 0, 0.25 * s, 0.05 * s, 3.4 * s, 'dR'), P('cyl', 0, 0.85 * s, 0, 0.2 * s, 0.2 * s, 0.2 * s, 'l'), P('cyl', 0, 0.78 * s, 0, 0.5 * s, 0.1 * s, 0.5 * s, 'k'), P('box', 0, 0.2 * s, 0, 0.5 * s, 0.1 * s, 0.8 * s, 'k')); }
  else { parts.push(P('rbox', 0, 0.45 * s, -0.1 * s, span, 0.07 * s, 0.7 * s, 't'), P('box', 0, 0.44 * s, -0.42 * s, span * 0.85, 0.04 * s, 0.14 * s, 'd'), P('box', -span * 0.5, 0.45 * s, -0.3 * s, 0.1 * s, 0.35 * s, 0.6 * s, 'd'), P('box', span * 0.5, 0.45 * s, -0.3 * s, 0.1 * s, 0.35 * s, 0.6 * s, 'd')); }
  parts.push(P('box', -span * 0.5, 0.5 * s, -0.1 * s, 0.08 * s, 0.05 * s, 0.08 * s, 'G'), P('box', span * 0.5, 0.5 * s, -0.1 * s, 0.08 * s, 0.05 * s, 0.08 * s, 'G'));
  if (opts.pods) { parts.push(P('cylz', -span * 0.3, 0.3 * s, 0, 0.22 * s, 0.22 * s, 1.0 * s, 'd'), P('cylz', span * 0.3, 0.3 * s, 0, 0.22 * s, 0.22 * s, 1.0 * s, 'd'), P('conez', -span * 0.3, 0.3 * s, 0.6 * s, 0.22 * s, 0.22 * s, 0.25 * s, 'l'), P('conez', span * 0.3, 0.3 * s, 0.6 * s, 0.22 * s, 0.22 * s, 0.25 * s, 'l'), P('box', -span * 0.3, 0.4 * s, 0, 0.06 * s, 0.1 * s, 0.4 * s, 'k'), P('box', span * 0.3, 0.4 * s, 0, 0.06 * s, 0.1 * s, 0.4 * s, 'k')); }
  return { parts, height: 1.1 * s };
}
function factoryModel(w, l, h, tier, kind) {
  const parts = [
    P('rbox', 0, h * 0.5, 0, w, h, l, ''),
    P('rbox', 0, h * 1.02, 0, w * 0.92, h * 0.12, l * 0.92, 'd'),
    P('box', 0, h * 0.95, 0, w * 0.3, h * 0.3, l * 0.9, 't'),
    P('box', -w * 0.5, h * 0.5, l * 0.52, w * 0.3, h * 1.05, 0.5, 'd'),
    P('box', w * 0.5, h * 0.5, l * 0.52, w * 0.3, h * 1.05, 0.5, 'd'),
    P('box', 0, h * 0.85, l * 0.52, w * 0.6, h * 0.25, 0.5, 't'),
    P('box', 0, h * 0.25, l * 0.51, w * 0.5, h * 0.45, 0.2, 'g'),
    P('box', 0, 0.15, l * 0.75, w * 0.6, 0.3, l * 0.5, 'k'),
    P('box', -w * 0.52, h * 0.3, 0, 0.4, h * 0.5, l * 0.8, 'l'), P('box', w * 0.52, h * 0.3, 0, 0.4, h * 0.5, l * 0.8, 'l'),
    ...pipe(-w * 0.35, h * 1.15, -l * 0.1, l * 0.6, 'z', 0.2), ...pipe(w * 0.35, h * 1.15, -l * 0.1, l * 0.6, 'z', 0.2),
    P('box', 0, h * 0.5, -l * 0.52, w * 0.7, h * 0.6, 0.3, 'd'), P('box', 0, h * 0.5, -l * 0.53, w * 0.5, h * 0.25, 0.1, 'g'),
    P('box', 0, h * 1.1, -l * 0.46, w * 0.9, 0.12, 0.12, 't'),
    ...greeble(0, h * 1.08, -l * 0.05, w * 0.7, l * 0.45, 7),
    ...lights(-w * 0.46, h * 1.12, l * 0.46, 2, w * 0.92, 0, 0.3), ...lights(-w * 0.46, h * 1.12, -l * 0.46, 2, w * 0.92, 0, 0.3),
    ...bolts(w * 0.51, h * 0.15, -l * 0.35, 5, 0, l * 0.17, 0.12),
  ];
  for (let i = 0; i < 5; i++) parts.push(P('box', -w * 0.52, h * (0.15 + i * 0.18), l * 0.3, 0.12, 0.05, 0.5, 'k'));
  parts.push(P('cyl', -w * 0.36, h * 1.5, -l * 0.36, 0.7, h * 0.9, 0.7, 'd'), P('cyl', -w * 0.36, h * 1.97, -l * 0.36, 0.85, 0.12, 0.85, 'l'));
  if (kind === 'air') { parts.push(P('box', 0, h * 1.15, 0, w * 0.75, 0.15, l * 0.75, 'd'), P('tor', 0, h * 1.25, 0, w * 0.5, 0.3, w * 0.5, 'g'), P('box', 0, h * 1.6, -l * 0.42, 0.3, h * 0.9, 0.3, 'l'), P('box', 0, h * 2.05, -l * 0.42, 0.9, 0.15, 0.15, 'G'), P('cyl', w * 0.3, h * 1.5, -l * 0.35, 0.9, 0.08, 0.9, 'l', 0.6, 0, 0)); }
  if (kind === 'bot') { parts.push(P('cyl', -w * 0.3, h * 1.4, -l * 0.3, 0.6, h * 0.8, 0.6, 'd'), P('cyl', w * 0.3, h * 1.4, -l * 0.3, 0.6, h * 0.8, 0.6, 'd'), P('cyl', -w * 0.3, h * 1.85, -l * 0.3, 0.8, 0.15, 0.8, 'l'), P('cyl', w * 0.3, h * 1.85, -l * 0.3, 0.8, 0.15, 0.8, 'l'), ...pipe(0, h * 1.6, -l * 0.3, w * 0.6, 'x', 0.12)); }
  if (kind === 'vehicle') { parts.push(P('rbox', 0, h * 1.35, -l * 0.25, w * 0.5, h * 0.5, l * 0.3, 'l'), P('box', 0, h * 1.35, -l * 0.25 + l * 0.16, w * 0.4, h * 0.3, 0.1, 'g'), P('box', -w * 0.15, h * 1.75, -l * 0.25, 0.25, h * 0.4, 0.25, 'd'), P('box', 0, h * 1.95, -l * 0.1, 0.3, 0.3, l * 0.8, 'd'), P('box', 0, h * 1.75, l * 0.25, 0.12, h * 0.4, 0.12, 'k')); }
  if (kind === 'orbital') { parts.push(P('cyl', 0, h * 2.2, -l * 0.2, 2.6, h * 2.4, 2.6, 'l'), P('box', -2.2, h * 2.0, -l * 0.2, 0.5, h * 3.0, 0.5, 'd'), P('box', 2.2, h * 2.0, -l * 0.2, 0.5, h * 3.0, 0.5, 'd'), P('box', 0, h * 3.5, -l * 0.2, 5.0, 0.35, 0.6, 'd'), P('cone', 0, h * 4.0, -l * 0.2, 2.2, h * 1.4, 2.2, 't'), P('tor', 0, h * 3.2, -l * 0.2, 3.4, 0.5, 3.4, 'g'), ...lights(-2.2, h * 3.55, -l * 0.2, 2, 4.4, 0, 0.35), ...pipe(-1.4, h * 1.3, -l * 0.2, h * 2.2, 'y', 0.15), ...pipe(1.4, h * 1.3, -l * 0.2, h * 2.2, 'y', 0.15)); }
  if (tier === 2) { parts.push(P('box', -w * 0.45, h * 1.5, -l * 0.35, 0.5, h * 1.0, 0.5, 'l'), P('box', w * 0.45, h * 1.5, -l * 0.35, 0.5, h * 1.0, 0.5, 'l'), P('box', 0, h * 1.9, -l * 0.35, w * 0.95, 0.25, 0.5, 'G'), P('tor', -w * 0.36, h * 2.05, -l * 0.36, 0.9, 0.2, 0.9, 'g')); }
  return { parts, height: h * (kind === 'orbital' ? 4.6 : (tier === 2 ? 2.0 : 1.4)) };
}

// ---------- definitions ----------
const D = {};
function def(id, o) { o.id = id; D[id] = o; return o; }

def('commander', {
  name: 'Commander', kind: 'commander', tier: 1, cost: 0, hp: 9000, speed: 9, turn: 2.5, radius: 1.6, height: 5.6, layer: 'ground', icon: 'commander', desc: 'Your avatar. Builds, fights, and must survive.',
  builder: { rate: 30, range: 22, list: 'fabber1' }, econ: { metal: 12, energy: 1200 },
  weapons: [
    { type: 'laser', range: 44, dmg: 130, rof: 1.2, targets: 'ga', speed: 150, color: [0.4, 0.9, 1.0] },
    { type: 'uber', range: 42, dmg: 3200, rof: 0.12, splash: 9, targets: 'g', speed: 70, color: [1.0, 0.9, 0.3] },
  ],
  model: [
    P('box', -0.75, 1.0, 0, 0.7, 2.0, 0.9, 'd'), P('box', 0.75, 1.0, 0, 0.7, 2.0, 0.9, 'd'),
    P('sph', -0.75, 1.15, 0, 0.9, 0.9, 0.9, 'l'), P('sph', 0.75, 1.15, 0, 0.9, 0.9, 0.9, 'l'),
    P('box', -0.75, 0.25, 0.25, 0.95, 0.5, 1.4, 'k'), P('box', 0.75, 0.25, 0.25, 0.95, 0.5, 1.4, 'k'),
    P('box', 0, 2.2, 0, 1.6, 0.6, 1.1, 'd'),
    P('box', 0, 3.2, 0, 2.4, 1.6, 1.5, ''),
    P('box', 0, 3.2, 0.78, 1.7, 1.1, 0.25, 't'),
    P('box', 0, 4.45, 0.15, 1.05, 0.85, 0.95, 'l'),
    P('box', 0, 4.5, 0.64, 0.75, 0.25, 0.1, 'G'),
    P('box', -1.55, 3.75, 0, 0.8, 0.75, 1.1, 't'), P('box', 1.55, 3.75, 0, 0.8, 0.75, 1.1, 't'),
    P('cylz', 1.55, 3.1, 0.8, 0.55, 0.55, 1.8, 'd'), P('cylz', 1.55, 3.1, 1.75, 0.35, 0.35, 0.3, 'G'),
    P('box', -1.55, 2.6, 0.15, 0.55, 1.3, 0.55, ''),
    P('box', 0, 3.3, -1.0, 1.7, 1.5, 0.6, 'd'), P('box', 0, 3.3, -1.32, 1.1, 0.7, 0.06, 'g'),
    P('box', -0.6, 4.6, -0.7, 0.2, 1.4, 0.2, 'l'), P('cylz', 0.5, 3.6, -1.3, 0.3, 0.3, 0.3, 'k'),
    P('sph', -0.75, 2.05, 0, 0.8, 0.8, 0.8, 'd'), P('sph', 0.75, 2.05, 0, 0.8, 0.8, 0.8, 'd'),
    P('cyl', -0.75, 1.0, -0.5, 0.16, 1.6, 0.16, 'k'), P('cyl', 0.75, 1.0, -0.5, 0.16, 1.6, 0.16, 'k'),
    P('box', -0.75, 1.0, 0.5, 0.5, 1.4, 0.12, 'l'), P('box', 0.75, 1.0, 0.5, 0.5, 1.4, 0.12, 'l'),
    P('cyl', -0.35, 3.4, -1.2, 0.22, 1.1, 0.22, 'k'), P('cyl', 0.35, 3.4, -1.2, 0.22, 1.1, 0.22, 'k'),
    P('box', -0.5, 2.6, 0.5, 0.2, 0.05, 0.05, 'k'), P('box', 0.5, 2.6, 0.5, 0.2, 0.05, 0.05, 'k'),
    P('box', 1.55, 4.2, 0, 0.6, 0.15, 0.9, 'l'), P('box', -1.55, 4.2, 0, 0.6, 0.15, 0.9, 'l'),
    P('cyl', 1.55, 3.75, -0.7, 0.3, 0.4, 0.3, 'l'), P('cyl', -1.55, 3.75, -0.7, 0.3, 0.4, 0.3, 'l'),
    P('box', 0, 3.9, 0.82, 1.2, 0.08, 0.08, 'k'), P('box', 0, 2.6, 0.82, 1.2, 0.08, 0.08, 'k'),
  ],
  deathSize: 6, aiValue: 0,
});
Object.assign(def('dox', { name: 'Dox', kind: 'bot', tier: 1, cost: 45, hp: 65, speed: 26, turn: 6, radius: 0.7, layer: 'ground', icon: 'bot', desc: 'Fast, cheap assault bot. Swarms.', weapons: [{ type: 'laser', range: 30, dmg: 11, rof: 2.2, targets: 'ga', speed: 140 }] }), botModel(0.85));
Object.assign(def('stinger', { name: 'Stinger', kind: 'bot', tier: 1, cost: 60, hp: 80, speed: 20, turn: 5, radius: 0.75, layer: 'ground', icon: 'aa', desc: 'Anti-air missile bot.', weapons: [{ type: 'aa', range: 46, dmg: 34, rof: 1.2, targets: 'a', speed: 120 }] }), botModel(0.9, { gun: 'launcher' }));
Object.assign(def('grenadier', { name: 'Grenadier', kind: 'bot', tier: 1, cost: 100, hp: 95, speed: 16, turn: 4, radius: 0.8, layer: 'ground', icon: 'bot', desc: 'Long-range grenades. Outranges towers.', weapons: [{ type: 'cannon', range: 56, dmg: 48, rof: 0.6, splash: 3.5, targets: 'g', speed: 55, arc: 1.4 }] }), botModel(1.0, { gun: 'launcher' }));
Object.assign(def('bot_fabber', { name: 'Fabber', kind: 'bot', tier: 1, cost: 130, hp: 150, speed: 18, turn: 5, radius: 0.8, layer: 'ground', icon: 'fab', desc: 'Basic bot fabricator. Builds and assists.', builder: { rate: 10, range: 18, list: 'fabber1' } }), botModel(0.95, { gun: 'fab' }));
Object.assign(def('skitter', { name: 'Skitter', kind: 'vehicle', tier: 1, cost: 30, hp: 45, speed: 42, turn: 6, radius: 0.7, layer: 'ground', icon: 'vehicle', desc: 'Fast scout with a pop-gun.', weapons: [{ type: 'laser', range: 22, dmg: 5, rof: 3, targets: 'g', speed: 140 }] }), tankModel(0.6, { turretR: 0.3, barrelLen: 0.7 }));
Object.assign(def('ant', { name: 'Ant', kind: 'vehicle', tier: 1, cost: 90, hp: 260, speed: 16, turn: 3, radius: 1.1, layer: 'ground', icon: 'vehicle', desc: 'Sturdy main battle tank.', weapons: [{ type: 'cannon', range: 40, dmg: 42, rof: 1.0, splash: 1.5, targets: 'g', speed: 90, arc: 0.3, turret: true }] }), tankModel(1.0));
Object.assign(def('spinner', { name: 'Spinner', kind: 'vehicle', tier: 1, cost: 110, hp: 300, speed: 15, turn: 3, radius: 1.1, layer: 'ground', icon: 'aa', desc: 'Mobile anti-air missile platform.', weapons: [{ type: 'aa', range: 52, dmg: 44, rof: 1.0, targets: 'a', speed: 130, turret: true }] }), tankModel(1.0, { barrels: 2, barrelLen: 1.1, barrelR: 0.16, radar: true }));
Object.assign(def('inferno', { name: 'Inferno', kind: 'vehicle', tier: 1, cost: 135, hp: 760, speed: 14, turn: 3, radius: 1.2, layer: 'ground', icon: 'vehicle', desc: 'Armored flamethrower. Melts bases up close.', weapons: [{ type: 'flame', range: 15, dmg: 95, rof: 1, targets: 'g', turret: true }] }), tankModel(1.05, { barrels: 1, barrelLen: 1.0, barrelR: 0.22 }));
Object.assign(def('vehicle_fabber', { name: 'Fab Vehicle', kind: 'vehicle', tier: 1, cost: 160, hp: 220, speed: 14, turn: 3, radius: 1.1, layer: 'ground', icon: 'fab', desc: 'Basic vehicle fabricator.', builder: { rate: 12, range: 18, list: 'fabber1' } }), tankModel(1.0, { barrels: 0, radar: true }));
Object.assign(def('firefly', { name: 'Firefly', kind: 'air', tier: 1, cost: 40, hp: 35, speed: 60, turn: 2.5, radius: 0.8, layer: 'air', icon: 'air', desc: 'Air scout. Fast and fragile.', weapons: [{ type: 'laser', range: 24, dmg: 4, rof: 3, targets: 'ga', speed: 150 }] }), planeModel(0.7, { wing: 'delta', span: 2.0 }));
Object.assign(def('hummingbird', { name: 'Hummingbird', kind: 'air', tier: 1, cost: 110, hp: 130, speed: 52, turn: 2.6, radius: 0.9, layer: 'air', icon: 'fighter', desc: 'Air superiority fighter.', weapons: [{ type: 'laser', range: 40, dmg: 18, rof: 2.4, targets: 'a', speed: 170 }] }), planeModel(0.85, { wing: 'delta', span: 2.8 }));
Object.assign(def('bumblebee', { name: 'Bumblebee', kind: 'air', tier: 1, cost: 170, hp: 210, speed: 40, turn: 1.8, radius: 1.1, layer: 'air', icon: 'bomber', desc: 'Bomber. Drops heavy bombs on ground targets.', weapons: [{ type: 'bomb', range: 6, dmg: 260, rof: 0.35, splash: 6, targets: 'g' }] }), planeModel(1.05, { wing: 'straight', span: 3.2, pods: true }));
Object.assign(def('air_fabber', { name: 'Fab Aircraft', kind: 'air', tier: 1, cost: 190, hp: 160, speed: 42, turn: 2.2, radius: 1.0, layer: 'air', icon: 'fab', desc: 'Flying fabricator. Goes anywhere on a planet.', builder: { rate: 8, range: 20, list: 'fabber1' } }), planeModel(0.95, { wing: 'heli', span: 2.4 }));
Object.assign(def('slammer', { name: 'Slammer', kind: 'bot', tier: 2, cost: 340, hp: 1250, speed: 22, turn: 4, radius: 1.05, layer: 'ground', icon: 'bot', desc: 'Heavy assault bot with twin cannons.', weapons: [{ type: 'laser', range: 40, dmg: 95, rof: 1.6, targets: 'ga', speed: 150 }] }), botModel(1.35, { gun: 'twin' }));
Object.assign(def('bluehawk', { name: 'Bluehawk', kind: 'bot', tier: 2, cost: 420, hp: 900, speed: 16, turn: 3.5, radius: 1.1, layer: 'ground', icon: 'aa', desc: 'Long-range missile bot. Hits ground and air.', weapons: [{ type: 'missile', range: 92, dmg: 210, rof: 0.5, splash: 3, targets: 'ga', speed: 80 }] }), botModel(1.3, { gun: 'launcher' }));
Object.assign(def('gil_e', { name: 'Gil-E', kind: 'bot', tier: 2, cost: 460, hp: 420, speed: 18, turn: 3, radius: 1.0, layer: 'ground', icon: 'bot', desc: 'Sniper bot. Extreme range beam.', weapons: [{ type: 'beam', range: 135, dmg: 720, rof: 0.16, targets: 'g' }] }), botModel(1.2, { gun: 'sniper' }));
Object.assign(def('adv_bot_fabber', { name: 'Adv. Fabber', kind: 'bot', tier: 2, cost: 520, hp: 420, speed: 18, turn: 4, radius: 1.0, layer: 'ground', icon: 'fab', desc: 'Advanced fabricator. Builds titans and advanced structures.', builder: { rate: 45, range: 22, list: 'fabber2' } }), botModel(1.25, { gun: 'fab' }));
Object.assign(def('leveler', { name: 'Leveler', kind: 'vehicle', tier: 2, cost: 560, hp: 3100, speed: 12, turn: 2.2, radius: 1.7, layer: 'ground', icon: 'vehicle', desc: 'Heavy tank. Frontline anchor.', weapons: [{ type: 'cannon', range: 56, dmg: 260, rof: 0.8, splash: 4, targets: 'g', speed: 95, arc: 0.3, turret: true }] }), tankModel(1.55, { barrels: 2, barrelLen: 2.4, barrelR: 0.16 }));
Object.assign(def('sheller', { name: 'Sheller', kind: 'vehicle', tier: 2, cost: 600, hp: 900, speed: 11, turn: 2, radius: 1.5, layer: 'ground', icon: 'artillery', desc: 'Mobile artillery. Siege from afar.', weapons: [{ type: 'cannon', range: 130, dmg: 420, rof: 0.25, splash: 7, targets: 'g', speed: 70, arc: 2.2, turret: true }] }), tankModel(1.35, { barrels: 1, barrelLen: 3.0, barrelR: 0.22 }));
Object.assign(def('vanguard', { name: 'Vanguard', kind: 'vehicle', tier: 2, cost: 950, hp: 6200, speed: 12, turn: 2, radius: 1.8, layer: 'ground', icon: 'vehicle', desc: 'Massive brawler tank. Short range, brutal damage.', weapons: [{ type: 'cannon', range: 22, dmg: 520, rof: 1.0, splash: 4, targets: 'g', speed: 110, arc: 0.1, turret: true }] }), tankModel(1.75, { barrels: 3, barrelLen: 1.3, barrelR: 0.18 }));
Object.assign(def('adv_vehicle_fabber', { name: 'Adv. Fab Vehicle', kind: 'vehicle', tier: 2, cost: 620, hp: 640, speed: 12, turn: 2.5, radius: 1.4, layer: 'ground', icon: 'fab', desc: 'Advanced vehicle fabricator.', builder: { rate: 50, range: 22, list: 'fabber2' } }), tankModel(1.3, { barrels: 0, radar: true }));
Object.assign(def('phoenix', { name: 'Phoenix', kind: 'air', tier: 2, cost: 320, hp: 420, speed: 62, turn: 2.8, radius: 1.1, layer: 'air', icon: 'fighter', desc: 'Advanced fighter. Rules the sky.', weapons: [{ type: 'aa', range: 52, dmg: 65, rof: 1.6, targets: 'a', speed: 160 }] }), planeModel(1.1, { wing: 'delta', span: 3.4 }));
Object.assign(def('hornet', { name: 'Hornet', kind: 'air', tier: 2, cost: 720, hp: 850, speed: 40, turn: 1.6, radius: 1.5, layer: 'air', icon: 'bomber', desc: 'Heavy bomber. Base-cracking payload.', weapons: [{ type: 'bomb', range: 7, dmg: 1250, rof: 0.3, splash: 9, targets: 'g' }] }), planeModel(1.5, { wing: 'straight', span: 4.2, pods: true }));
Object.assign(def('kestrel', { name: 'Kestrel', kind: 'air', tier: 2, cost: 520, hp: 1500, speed: 34, turn: 2.5, radius: 1.3, layer: 'air', icon: 'gunship', desc: 'Gunship. Hovers and shreds ground units.', weapons: [{ type: 'laser', range: 38, dmg: 60, rof: 2.5, targets: 'g', speed: 160 }], hover: true }), planeModel(1.3, { wing: 'heli', span: 3.0, pods: true }));
Object.assign(def('adv_air_fabber', { name: 'Adv. Fab Aircraft', kind: 'air', tier: 2, cost: 540, hp: 420, speed: 44, turn: 2.2, radius: 1.2, layer: 'air', icon: 'fab', desc: 'Advanced flying fabricator.', builder: { rate: 35, range: 24, list: 'fabber2' } }), planeModel(1.2, { wing: 'heli', span: 2.8 }));

// ---- orbital units ----
def('solar_array', { name: 'Solar Array', kind: 'orbital', tier: 1, cost: 700, hp: 900, speed: 6, turn: 1, radius: 2.4, height: 2.2, layer: 'orbital', icon: 'orbital', desc: 'Orbital power satellite. Cheap energy, but fragile to orbital fighters.', econ: { metal: 0, energy: 1400 },
  model: [P('box', 0, 0.6, 0, 1.4, 0.9, 1.8, ''), P('cylx', 0, 0.6, 0, 0.3, 0.3, 7.8, 'd'), P('box', -3.0, 0.6, 0, 4.2, 0.08, 1.9, 't'), P('box', 3.0, 0.6, 0, 4.2, 0.08, 1.9, 't'), P('box', -3.0, 0.66, 0, 4.0, 0.04, 0.12, 'g'), P('box', 3.0, 0.66, 0, 4.0, 0.04, 0.12, 'g'), P('sph', 0, 1.35, 0, 0.5, 0.5, 0.5, 'G'), P('cyl', 0, 0.0, 0, 0.9, 0.3, 0.9, 'l')] });
def('orbital_fabber', { name: 'Orbital Fabber', kind: 'orbital', tier: 2, cost: 1100, hp: 1200, speed: 14, turn: 1.2, radius: 2.4, height: 2.6, layer: 'orbital', icon: 'fab', desc: 'Builds on any planet from orbit and travels between planets.', builder: { rate: 24, range: 84, list: 'fabber2' },
  model: [P('box', 0, 0.8, 0, 2.0, 1.2, 2.6, ''), P('box', 0, 0.8, 1.4, 1.4, 0.8, 0.3, 't'), P('cylx', 0, 1.0, -0.4, 0.25, 0.25, 5.6, 'd'), P('box', -2.2, 1.0, -0.4, 2.0, 0.06, 1.6, 't'), P('box', 2.2, 1.0, -0.4, 2.0, 0.06, 1.6, 't'), P('cyl', 0, 0.0, 0.5, 0.5, 0.6, 0.5, 'd'), P('sph', 0, -0.4, 0.5, 0.6, 0.6, 0.6, 'G'), P('cylz', 0, 1.2, -1.6, 0.5, 0.5, 0.6, 'k'), P('box', 0, 1.2, -1.95, 0.4, 0.4, 0.05, 'G')] });
def('avenger', { name: 'Avenger', kind: 'orbital', tier: 1, cost: 320, hp: 320, speed: 38, turn: 2.2, radius: 1.6, height: 1.4, layer: 'orbital', icon: 'fighter', desc: 'Orbital fighter. Hunts satellites and orbital units.', weapons: [{ type: 'laser', range: 60, dmg: 42, rof: 2.2, targets: 'o', speed: 180, color: [0.5, 1.0, 0.6] }],
  model: [P('wdg', 0, 0.5, 0.8, 0.5, 0.4, 2.2, '', Math.PI / 2, 0, 0), P('box', 0, 0.5, -0.4, 0.6, 0.45, 1.6, ''), P('wdg', 0, 0.45, -0.4, 2.8, 0.08, 1.3, 't'), P('box', 0, 0.62, 0.2, 0.35, 0.2, 0.6, 'G'), P('cylz', 0, 0.5, -1.3, 0.34, 0.34, 0.5, 'd'), P('box', 0, 0.5, -1.58, 0.26, 0.26, 0.05, 'G'), P('cylz', -0.7, 0.35, 0.3, 0.14, 0.14, 0.9, 'd'), P('cylz', 0.7, 0.35, 0.3, 0.14, 0.14, 0.9, 'd')] });
def('anchor', { name: 'Anchor', kind: 'orbital', tier: 2, cost: 1600, hp: 4200, speed: 4, turn: 0.8, radius: 3.0, height: 3.2, layer: 'orbital', icon: 'tower', desc: 'Orbital battle station. Fires on ground targets and orbit.', weapons: [{ type: 'laser', range: 76, dmg: 110, rof: 1.6, targets: 'g', speed: 170 }, { type: 'aa', range: 88, dmg: 80, rof: 1.0, targets: 'o', speed: 150 }],
  model: [P('hex', 0, 0.8, 0, 3.6, 1.6, 3.6, ''), P('hex', 0, 0.8, 0, 2.4, 1.9, 2.4, 't'), P('tor', 0, 0.8, 0, 4.4, 0.6, 4.4, 'g'), P('box', -2.4, 0.8, 0, 1.8, 0.6, 0.6, 'd'), P('box', 2.4, 0.8, 0, 1.8, 0.6, 0.6, 'd'), P('box', 0, 0.8, -2.4, 0.6, 0.6, 1.8, 'd'), P('box', 0, 0.8, 2.4, 0.6, 0.6, 1.8, 'd'), P('cyl', -3.3, 0.0, 0, 0.4, 1.6, 0.4, 'k'), P('cyl', 3.3, 0.0, 0, 0.4, 1.6, 0.4, 'k'), P('cyl', 0, 0.0, -3.3, 0.4, 1.6, 0.4, 'k'), P('cyl', 0, 0.0, 3.3, 0.4, 1.6, 0.4, 'k'), P('sph', 0, 2.1, 0, 1.2, 1.2, 1.2, 'G'), P('box', 0, -0.4, 0, 1.2, 0.4, 1.2, 'l')] });

// ---- structures ----
def('metal_extractor', { name: 'Metal Extractor', kind: 'structure', tier: 1, cost: 170, hp: 350, radius: 2.4, height: 2.8, layer: 'ground', icon: 'extractor', desc: 'Extracts metal. Must be built on a metal spot.', extractor: true, econ: { metal: 7, energy: 0 }, turretPivot: [0, 0, 0], spin: 2.2,
  model: [P('hex', 0, 0.3, 0, 4.4, 0.6, 4.4, 'd'), P('cyl', 0, 1.2, 0, 2.6, 1.4, 2.6, ''), P('tor', 0, 1.95, 0, 2.6, 0.5, 2.6, 'ug'), P('box', 0, 2.2, 0, 0.8, 1.0, 0.8, 'ut'), P('box', 0, 2.5, 0, 1.6, 0.15, 0.3, 'ul'), P('box', -1.8, 0.8, 0, 0.5, 1.0, 0.5, 'l'), P('box', 1.8, 0.8, 0, 0.5, 1.0, 0.5, 'l'), P('box', 0, 0.8, 1.8, 0.5, 1.0, 0.5, 'l'), P('box', 0, 0.8, -1.8, 0.5, 1.0, 0.5, 'l'), ...pipe(1.2, 1.4, -1.0, 2.0, 'z', 0.15), ...pipe(-1.4, 0.9, 0.9, 1.6, 'x', 0.12), ...bolts(-1.6, 0.62, -1.6, 4, 1.07, 1.07, 0.1), P('box', 1.4, 1.2, 1.4, 0.4, 0.6, 0.4, 'd'), P('box', 1.4, 1.55, 1.4, 0.2, 0.1, 0.2, 'G')] });
def('energy_plant', { name: 'Energy Plant', kind: 'structure', tier: 1, cost: 380, hp: 900, radius: 3.2, height: 5.5, layer: 'ground', icon: 'energy', desc: 'Generates energy for construction and weapons.', econ: { metal: 0, energy: 650 }, turretPivot: [0, 0, 0], spin: 0.9,
  model: [P('box', 0, 0.4, 0, 6, 0.8, 6, 'd'), P('cyl', 0, 2.2, 0, 3.2, 3.6, 3.2, ''), P('cyl', 0, 4.4, 0, 2.2, 1.2, 2.2, 'l'), P('sph', 0, 5.4, 0, 1.6, 1.6, 1.6, 'G'), P('box', -2.4, 1.6, 0, 0.6, 2.4, 1.2, 't'), P('box', 2.4, 1.6, 0, 0.6, 2.4, 1.2, 't'), P('box', 0, 1.6, 2.4, 1.2, 2.4, 0.6, 't'), P('box', 0, 1.6, -2.4, 1.2, 2.4, 0.6, 't'), P('tor', 0, 3.0, 0, 3.6, 0.3, 3.6, 'ug'), P('box', 0, 3.0, 1.9, 0.5, 0.5, 0.4, 'ul'), ...pipe(2.2, 0.9, 1.4, 2.4, 'z', 0.18), ...pipe(-2.2, 0.9, -1.4, 2.4, 'z', 0.18), ...pipe(0, 0.9, 2.6, 3.6, 'x', 0.14), ...greeble(-2.1, 0.8, -2.1, 1.4, 1.4, 4), P('cyl', 2.4, 1.2, -2.4, 0.5, 0.8, 0.5, 'd'), P('cyl', 2.4, 1.65, -2.4, 0.6, 0.1, 0.6, 'l'), ...bolts(-2.6, 0.82, 2.6, 4, 1.73, 0, 0.1)] });
def('adv_energy', { name: 'Adv. Energy Plant', kind: 'structure', tier: 2, cost: 3600, hp: 4200, radius: 5.2, height: 9, layer: 'ground', icon: 'energy', desc: 'Massive reactor. Enormous energy output.', econ: { metal: 0, energy: 3400 }, turretPivot: [0, 0, 0], spin: 0.6,
  model: [P('box', 0, 0.5, 0, 10, 1.0, 10, 'd'), P('cyl', 0, 3.2, 0, 6.0, 5.4, 6.0, ''), P('tor', 0, 2.2, 0, 6.6, 0.5, 6.6, 'ug'), P('tor', 0, 4.4, 0, 6.6, 0.5, 6.6, 'ug'), P('box', 0, 2.2, 3.4, 0.6, 0.6, 0.5, 'ul'), P('box', 0, 4.4, -3.4, 0.6, 0.6, 0.5, 'ul'), P('cyl', 0, 6.4, 0, 3.6, 1.6, 3.6, 'l'), P('sph', 0, 8.0, 0, 2.8, 2.8, 2.8, 'G'), P('box', -4, 2, 0, 1.2, 4, 2.4, 't'), P('box', 4, 2, 0, 1.2, 4, 2.4, 't'), P('box', 0, 2, 4, 2.4, 4, 1.2, 't'), P('box', 0, 2, -4, 2.4, 4, 1.2, 't'), ...pipe(3.5, 1.2, 2.0, 4.0, 'z', 0.25), ...pipe(-3.5, 1.2, -2.0, 4.0, 'z', 0.25), ...pipe(0, 1.2, 4.2, 5.0, 'x', 0.22), ...greeble(-3.6, 1.0, 3.6, 2.2, 2.2, 5), ...greeble(3.6, 1.0, -3.6, 2.2, 2.2, 5), P('cyl', 3.8, 2.5, 3.8, 0.9, 3.0, 0.9, 'd'), P('cyl', 3.8, 4.05, 3.8, 1.1, 0.15, 1.1, 'l'), P('box', 3.8, 4.3, 3.8, 0.4, 0.3, 0.4, 'G')] });
Object.assign(def('bot_factory', { name: 'Bot Factory', kind: 'structure', tier: 1, cost: 660, hp: 3200, radius: 4.6, layer: 'ground', icon: 'factory', desc: 'Produces basic bots.', factory: { kind: 'bot', tier: 1, rate: 20, units: ['dox', 'stinger', 'grenadier', 'bot_fabber'] } }), factoryModel(6.5, 7.5, 3.6, 1, 'bot'));
Object.assign(def('vehicle_factory', { name: 'Vehicle Factory', kind: 'structure', tier: 1, cost: 660, hp: 3800, radius: 5.2, layer: 'ground', icon: 'factory', desc: 'Produces basic vehicles.', factory: { kind: 'vehicle', tier: 1, rate: 20, units: ['skitter', 'ant', 'spinner', 'inferno', 'vehicle_fabber'] } }), factoryModel(7.5, 8.5, 3.8, 1, 'vehicle'));
Object.assign(def('air_factory', { name: 'Air Factory', kind: 'structure', tier: 1, cost: 660, hp: 2600, radius: 5.4, layer: 'ground', icon: 'factory', desc: 'Produces basic aircraft.', factory: { kind: 'air', tier: 1, rate: 20, units: ['firefly', 'hummingbird', 'bumblebee', 'air_fabber'] } }), factoryModel(8, 8, 2.6, 1, 'air'));
Object.assign(def('adv_bot_factory', { name: 'Adv. Bot Factory', kind: 'structure', tier: 2, cost: 2400, hp: 6500, radius: 5.4, layer: 'ground', icon: 'factory', desc: 'Produces advanced bots.', factory: { kind: 'bot', tier: 2, rate: 60, units: ['slammer', 'bluehawk', 'gil_e', 'adv_bot_fabber'] } }), factoryModel(7.5, 8.5, 4.4, 2, 'bot'));
Object.assign(def('adv_vehicle_factory', { name: 'Adv. Vehicle Factory', kind: 'structure', tier: 2, cost: 2400, hp: 7500, radius: 6.2, layer: 'ground', icon: 'factory', desc: 'Produces advanced vehicles.', factory: { kind: 'vehicle', tier: 2, rate: 60, units: ['leveler', 'sheller', 'vanguard', 'adv_vehicle_fabber'] } }), factoryModel(9, 10, 4.6, 2, 'vehicle'));
Object.assign(def('adv_air_factory', { name: 'Adv. Air Factory', kind: 'structure', tier: 2, cost: 2400, hp: 5500, radius: 6.4, layer: 'ground', icon: 'factory', desc: 'Produces advanced aircraft.', factory: { kind: 'air', tier: 2, rate: 60, units: ['phoenix', 'hornet', 'kestrel', 'adv_air_fabber'] } }), factoryModel(9.5, 9.5, 3.2, 2, 'air'));
Object.assign(def('orbital_launcher', { name: 'Orbital Launcher', kind: 'structure', tier: 1, cost: 1800, hp: 4200, radius: 5.0, layer: 'ground', icon: 'factory', desc: 'Builds and launches orbital units: satellites, orbital fabbers, fighters and anchors.', factory: { kind: 'orbital', tier: 1, rate: 30, units: ['solar_array', 'orbital_fabber', 'avenger', 'anchor'] } }), factoryModel(7.5, 8.5, 3.0, 1, 'orbital'));
def('laser_tower', { name: 'Laser Tower', kind: 'structure', tier: 1, cost: 320, hp: 1600, radius: 1.8, height: 5, layer: 'ground', icon: 'tower', desc: 'Basic defense. Rapid laser fire.', weapons: [{ type: 'laser', range: 46, dmg: 62, rof: 1.4, targets: 'g', speed: 160, turret: true }], turretPivot: [0, 4.0, 0],
  model: [P('hex', 0, 0.4, 0, 3.6, 0.8, 3.6, 'd'), P('cyl', 0, 2.2, 0, 1.6, 3.0, 1.6, ''), P('box', 0, 2.0, 0, 2.2, 2.0, 0.6, 't'), P('box', 0, 2.0, 0, 0.6, 2.0, 2.2, 't'), P('tor', 0, 3.5, 0, 1.9, 0.3, 1.9, 'l'), P('sph', 0, 0, 0, 1.8, 1.8, 1.8, 'ul'), P('cylz', 0, 0.2, 1.4, 0.4, 0.4, 2.0, 'ud'), P('box', 0, 0.2, 2.45, 0.3, 0.3, 0.15, 'uG'), P('box', 0, 0.9, 0, 0.5, 0.3, 0.5, 'uk'), ...bolts(-1.3, 0.82, -1.3, 3, 1.3, 0, 0.1), ...bolts(-1.3, 0.82, 1.3, 3, 1.3, 0, 0.1), P('box', 1.2, 1.2, 0, 0.3, 1.5, 0.3, 'k'), P('box', 1.2, 2.0, 0, 0.5, 0.1, 0.3, 'l')] });
def('flak_tower', { name: 'Flak Tower', kind: 'structure', tier: 1, cost: 420, hp: 1300, radius: 1.8, height: 5, layer: 'ground', icon: 'aa', desc: 'Anti-air flak cannon.', weapons: [{ type: 'aa', range: 62, dmg: 55, rof: 1.5, targets: 'a', speed: 150, turret: true }], turretPivot: [0, 3.4, 0],
  model: [P('hex', 0, 0.4, 0, 3.6, 0.8, 3.6, 'd'), P('cyl', 0, 1.8, 0, 2.0, 2.2, 2.0, ''), P('tor', 0, 2.9, 0, 2.2, 0.3, 2.2, 'g'), P('box', 0, 0.3, 0, 1.8, 0.8, 1.2, 'ut'), P('cylz', -0.4, 0.5, 1.0, 0.3, 0.3, 2.2, 'ud'), P('cylz', 0.4, 0.5, 1.0, 0.3, 0.3, 2.2, 'ud'), P('box', 0, 1.2, -0.3, 0.3, 0.8, 0.3, 'ul'), P('box', 0, 1.6, -0.3, 0.8, 0.05, 0.4, 'ul'), ...bolts(-1.3, 0.82, -1.3, 3, 1.3, 0, 0.1), ...pipe(1.3, 0.9, 0, 1.6, 'z', 0.12), P('box', -1.3, 1.0, 0.6, 0.3, 0.5, 0.3, 'd')] });
def('adv_laser_tower', { name: 'Adv. Laser Tower', kind: 'structure', tier: 2, cost: 980, hp: 3400, radius: 2.4, height: 7, layer: 'ground', icon: 'tower', desc: 'Twin heavy lasers. Long range.', weapons: [{ type: 'laser', range: 60, dmg: 140, rof: 1.5, targets: 'ga', speed: 170, turret: true }], turretPivot: [0, 5.2, 0],
  model: [P('hex', 0, 0.5, 0, 5.0, 1.0, 5.0, 'd'), P('cyl', 0, 2.8, 0, 2.4, 3.8, 2.4, ''), P('box', 0, 2.5, 0, 3.4, 3.0, 0.8, 't'), P('box', 0, 2.5, 0, 0.8, 3.0, 3.4, 't'), P('tor', 0, 4.6, 0, 3.0, 0.4, 3.0, 'g'), P('box', 0, 0.3, 0, 2.4, 1.0, 2.0, 'ul'), P('cylz', -0.7, 0.4, 1.8, 0.45, 0.45, 2.8, 'ud'), P('cylz', 0.7, 0.4, 1.8, 0.45, 0.45, 2.8, 'ud'), P('box', -0.7, 0.4, 3.2, 0.35, 0.35, 0.15, 'uG'), P('box', 0.7, 0.4, 3.2, 0.35, 0.35, 0.15, 'uG'), P('box', 0, 1.0, -0.6, 1.2, 0.4, 0.8, 'uk'), ...bolts(-1.9, 1.02, -1.9, 4, 1.27, 0, 0.12), ...bolts(-1.9, 1.02, 1.9, 4, 1.27, 0, 0.12), ...pipe(1.9, 1.3, 0, 2.6, 'z', 0.15), ...pipe(-1.9, 1.3, 0, 2.6, 'z', 0.15), P('cyl', 0, 4.9, 0, 0.5, 0.5, 0.5, 'l')] });
def('artillery', { name: 'Pelter', kind: 'structure', tier: 2, cost: 1300, hp: 2200, radius: 2.6, height: 6, layer: 'ground', icon: 'artillery', desc: 'Long-range artillery emplacement.', weapons: [{ type: 'cannon', range: 170, dmg: 300, rof: 0.3, splash: 8, targets: 'g', speed: 75, arc: 2.6, turret: true }], turretPivot: [0, 2.6, 0],
  model: [P('hex', 0, 0.5, 0, 5.6, 1.0, 5.6, 'd'), P('cyl', 0, 1.6, 0, 3.0, 1.4, 3.0, ''), P('tor', 0, 2.3, 0, 3.4, 0.3, 3.4, 'g'), P('box', 0, 0.6, -0.4, 2.6, 1.4, 2.4, 'ut'), P('cylz', 0, 1.4, 1.6, 0.6, 0.6, 5.0, 'ud', -0.5, 0, 0), P('cylz', 0, 1.9, 3.4, 0.8, 0.8, 0.8, 'uk', -0.5, 0, 0), P('box', 0, 0.9, -1.6, 1.6, 0.8, 0.6, 'ul'), P('cyl', -1.2, 0.5, -1.6, 0.5, 0.7, 0.5, 'uk'), P('cyl', 1.2, 0.5, -1.6, 0.5, 0.7, 0.5, 'uk'), ...bolts(-2.2, 1.02, -2.2, 4, 1.47, 0, 0.12), ...greeble(-1.8, 1.0, 1.8, 1.6, 1.6, 4), ...pipe(2.2, 1.3, 0, 3.2, 'z', 0.16)] });
def('umbrella', { name: 'Umbrella', kind: 'structure', tier: 1, cost: 720, hp: 2300, radius: 2.6, height: 7.5, layer: 'ground', icon: 'aa', desc: 'Anti-orbital defense. Shoots down satellites and orbital units above it.', weapons: [{ type: 'aa', range: 98, dmg: 260, rof: 0.7, targets: 'o', speed: 170, turret: true }], turretPivot: [0, 4.2, 0],
  model: [P('hex', 0, 0.4, 0, 4.8, 0.8, 4.8, 'd'), P('cyl', 0, 2.3, 0, 1.6, 3.2, 1.6, ''), P('box', 0, 2.0, 0, 2.6, 1.6, 0.6, 't'), P('box', 0, 2.0, 0, 0.6, 1.6, 2.6, 't'), P('cone', 0, 1.2, 0, 5.6, 1.4, 5.6, 'ul', Math.PI, 0, 0), P('cyl', 0, 0.3, 0, 1.4, 0.8, 1.4, 'ud'), P('cyl', 0, 2.2, 0, 0.25, 2.2, 0.25, 'ul'), P('sph', 0, 3.3, 0, 0.7, 0.7, 0.7, 'uG'), P('tor', 0, 1.15, 0, 5.4, 0.35, 5.4, 'ug'), ...bolts(-1.8, 0.82, -1.8, 4, 1.2, 0, 0.1), ...greeble(1.6, 0.8, 1.6, 1.4, 1.4, 4), ...pipe(-1.7, 1.2, 0, 2.6, 'z', 0.14), P('box', 1.8, 1.4, -1.2, 0.5, 1.2, 0.5, 'd'), P('box', 1.8, 2.1, -1.2, 0.3, 0.2, 0.3, 'G')] });
def('teleporter', { name: 'Teleporter', kind: 'structure', tier: 1, cost: 900, hp: 2800, radius: 4.2, height: 7.5, layer: 'ground', icon: 'teleporter', desc: 'Link two teleporters (right-click another) to move ground units between planets.', teleporter: true, turretPivot: [0, 0, 0], spin: 0.5,
  model: [P('hex', 0, 0.4, 0, 9.0, 0.8, 9.0, 'd'), P('box', -3.6, 1.6, 0, 1.2, 2.4, 2.0, 'l'), P('box', 3.6, 1.6, 0, 1.2, 2.4, 2.0, 'l'), P('tor', 0, 3.9, 0, 6.4, 0.9, 6.4, 't', Math.PI / 2, 0, 0), P('cyl', 0, 3.9, 0, 5.0, 0.15, 5.0, 'G', Math.PI / 2, 0, 0), P('box', 0, 6.9, 0, 2.0, 0.6, 0.8, 'l'), P('box', 0, 7.3, 0, 0.6, 0.3, 0.3, 'G'), P('box', -3.6, 3.0, 0, 0.5, 0.5, 0.5, 'g'), P('box', 3.6, 3.0, 0, 0.5, 0.5, 0.5, 'g'), P('tor', 0, 0.85, 0, 7.0, 0.3, 7.0, 'ug'), ...pipe(-3.6, 1.0, -1.5, 2.2, 'z', 0.16), ...pipe(3.6, 1.0, 1.5, 2.2, 'z', 0.16), ...bolts(-3.9, 0.82, -3.9, 5, 1.95, 0, 0.12), ...bolts(-3.9, 0.82, 3.9, 5, 1.95, 0, 0.12), P('box', -3.6, 3.4, 0, 0.18, 1.6, 0.18, 'k', 0, 0, 0.9), P('box', 3.6, 3.4, 0, 0.18, 1.6, 0.18, 'k', 0, 0, -0.9), ...greeble(3.4, 0.8, -3.2, 1.6, 1.6, 4)] });
def('nuke_launcher', { name: 'Nuke Launcher', kind: 'structure', tier: 2, cost: 4200, hp: 5200, radius: 4.4, height: 9, layer: 'ground', icon: 'nuke', desc: 'Builds nuclear missiles that can strike any planet. Devastating area damage.', silo: { ammo: 'nuke', cost: 9000, rate: 60, max: 1 },
  model: [P('hex', 0, 0.5, 0, 9.0, 1.0, 9.0, 'd'), P('cyl', 0, 3.0, 0, 5.6, 4.0, 5.6, ''), P('cyl', 0, 5.2, 0, 4.6, 0.6, 4.6, 'l'), P('box', -2.6, 5.5, 0, 1.6, 0.4, 4.4, 'k'), P('box', 2.6, 5.5, 0, 1.6, 0.4, 4.4, 'k'), P('cylz', 0, 6.5, 0, 1.6, 1.6, 0.4, 'l', 0, 0, 0), P('cone', 0, 7.4, 0, 1.4, 2.8, 1.4, 'l'), P('cyl', 0, 5.8, 0, 1.4, 1.2, 1.4, 't'), P('box', -3.4, 1.5, 3.0, 1.6, 2.0, 1.6, 't'), P('box', 3.4, 1.5, 3.0, 1.6, 2.0, 1.6, 't'), P('box', 0, 1.6, -3.6, 5.0, 2.2, 1.4, 'd'), P('box', 0, 2.8, -3.6, 3.0, 0.3, 0.2, 'G'), P('tor', 0, 2.5, 0, 6.2, 0.4, 6.2, 'g'), P('box', 0, 5.3, 2.4, 3.2, 0.25, 0.3, 'k'), P('box', 0, 5.3, -2.4, 3.2, 0.25, 0.3, 'k'), P('box', 2.4, 5.3, 0, 0.3, 0.25, 3.2, 'k'), P('box', -2.4, 5.3, 0, 0.3, 0.25, 3.2, 'k'), ...pipe(3.4, 1.4, -1.4, 3.0, 'z', 0.2), ...pipe(-3.4, 1.4, -1.4, 3.0, 'z', 0.2), ...greeble(0, 1.0, 3.6, 3.0, 1.2, 5), ...bolts(-3.8, 1.02, -3.8, 5, 1.9, 0, 0.12), ...lights(-3.8, 3.0, 3.8, 3, 3.8, 0, 0.3)] });
def('antinuke', { name: 'Anti-Nuke', kind: 'structure', tier: 2, cost: 2600, hp: 3600, radius: 3.2, height: 8, layer: 'ground', icon: 'antinuke', desc: 'Intercepts nukes aimed within its radius. Stocks up to three interceptors.', silo: { ammo: 'antinuke', cost: 2000, rate: 50, max: 3 }, antinukeRange: 130, turretPivot: [0, 5.2, 0], spin: 1.4,
  model: [P('hex', 0, 0.4, 0, 6.4, 0.8, 6.4, 'd'), P('box', 0, 1.8, 0, 4.0, 2.4, 4.0, ''), P('box', 0, 1.8, 2.05, 2.6, 1.6, 0.2, 't'), P('cylz', -1.2, 3.4, 0, 0.7, 0.7, 3.2, 'd', -0.9, 0, 0), P('cylz', 0, 3.4, 0, 0.7, 0.7, 3.2, 'd', -0.9, 0, 0), P('cylz', 1.2, 3.4, 0, 0.7, 0.7, 3.2, 'd', -0.9, 0, 0), P('cyl', 0, 4.2, 0, 0.6, 2.4, 0.6, 'l'), P('cyl', 0, 0.3, 0, 3.4, 0.2, 3.4, 'ul', 0.5, 0, 0), P('box', 0, 1.0, 0.6, 0.2, 1.2, 0.2, 'ul'), P('sph', 0, 1.7, 0.9, 0.4, 0.4, 0.4, 'uG'), P('tor', 0, 2.9, 0, 4.6, 0.35, 4.6, 'g'), ...greeble(-2.4, 0.8, 2.4, 1.6, 1.6, 4), ...greeble(2.4, 0.8, -2.4, 1.6, 1.6, 4), ...pipe(2.6, 1.0, 0.8, 2.4, 'z', 0.15), ...bolts(-2.7, 0.82, -2.7, 4, 1.8, 0, 0.11), P('box', -2.6, 1.6, 0, 0.4, 1.6, 0.4, 'k'), P('box', -2.6, 2.5, 0, 0.6, 0.06, 0.4, 'l')] });

// ---- titans ----
def('ares', { name: 'Ares', kind: 'titan', tier: 3, cost: 24000, hp: 42000, speed: 6.5, turn: 1.2, radius: 5.5, height: 18, layer: 'ground', icon: 'titan', desc: 'Walking titan. Devastating dual cannons and missile racks.', deathSize: 5,
  weapons: [{ type: 'cannon', range: 95, dmg: 900, rof: 0.5, splash: 9, targets: 'g', speed: 85, arc: 0.6, turret: true }, { type: 'missile', range: 80, dmg: 160, rof: 2.0, splash: 3, targets: 'ga', speed: 90 }], turretPivot: [0, 12.5, 0],
  model: [
    P('box', -3.2, 3.5, 0, 2.0, 7.0, 2.6, 'd'), P('box', 3.2, 3.5, 0, 2.0, 7.0, 2.6, 'd'),
    P('box', -3.2, 0.8, 0.5, 2.8, 1.6, 4.4, 'k'), P('box', 3.2, 0.8, 0.5, 2.8, 1.6, 4.4, 'k'),
    P('box', -3.2, 7.4, 0, 2.6, 1.6, 3.2, 'l'), P('box', 3.2, 7.4, 0, 2.6, 1.6, 3.2, 'l'),
    P('sph', -3.2, 4.2, 0, 2.6, 2.6, 2.6, 'l'), P('sph', 3.2, 4.2, 0, 2.6, 2.6, 2.6, 'l'),
    P('box', 0, 8.5, 0, 6.0, 2.0, 4.0, ''), P('wdg', 0, 10.6, 0.2, 7.5, 2.4, 6.0, 't'),
    P('box', 0, 10.5, -3.0, 5.0, 2.0, 1.0, 'd'), P('box', 0, 10.5, -3.55, 3.6, 1.2, 0.1, 'g'),
    P('box', -4.6, 10.8, -0.5, 1.6, 1.4, 3.0, 'd'), P('box', 4.6, 10.8, -0.5, 1.6, 1.4, 3.0, 'd'),
    P('box', -4.6, 11.6, -0.5, 1.2, 0.3, 2.4, 'G'), P('box', 4.6, 11.6, -0.5, 1.2, 0.3, 2.4, 'G'),
    P('cylz', -4.9, 10.5, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', -4.4, 10.5, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', -4.9, 11.0, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', -4.4, 11.0, 1.05, 0.34, 0.34, 0.5, 'k'),
    P('cylz', 4.9, 10.5, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', 4.4, 10.5, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', 4.9, 11.0, 1.05, 0.34, 0.34, 0.5, 'k'), P('cylz', 4.4, 11.0, 1.05, 0.34, 0.34, 0.5, 'k'),
    P('cylz', -4.6, 10.8, -2.2, 0.4, 0.4, 1.0, 'k'), P('cylz', 4.6, 10.8, -2.2, 0.4, 0.4, 1.0, 'k'),
    P('box', 0, 0.6, 0, 3.6, 1.2, 3.0, 'ut'), P('box', 0, 1.6, 0.5, 2.0, 1.2, 1.6, 'ul'), P('box', 0, 1.7, 1.4, 1.2, 0.3, 0.1, 'uG'),
    P('cylz', -1.3, 0.8, 3.5, 0.7, 0.7, 6.0, 'ud'), P('cylz', 1.3, 0.8, 3.5, 0.7, 0.7, 6.0, 'ud'),
    P('cylz', -1.3, 0.8, 6.4, 0.5, 0.5, 0.4, 'uG'), P('cylz', 1.3, 0.8, 6.4, 0.5, 0.5, 0.4, 'uG'),
    P('cylz', -1.3, 0.8, 1.6, 0.95, 0.95, 1.0, 'uk'), P('cylz', 1.3, 0.8, 1.6, 0.95, 0.95, 1.0, 'uk'),
    P('rbox', 0, 9.4, 2.3, 5.2, 1.2, 0.8, 't'), P('rbox', -2.6, 9.0, 0, 1.0, 1.4, 3.6, 'l'), P('rbox', 2.6, 9.0, 0, 1.0, 1.4, 3.6, 'l'),
    P('sph', -3.2, 7.3, 0, 1.8, 1.8, 1.8, 'd'), P('sph', 3.2, 7.3, 0, 1.8, 1.8, 1.8, 'd'),
    P('cyl', -3.2, 3.6, -1.6, 0.4, 5.0, 0.4, 'k'), P('cyl', 3.2, 3.6, -1.6, 0.4, 5.0, 0.4, 'k'),
    P('box', -3.2, 3.5, 1.5, 1.6, 4.0, 0.3, 'l'), P('box', 3.2, 3.5, 1.5, 1.6, 4.0, 0.3, 'l'),
    P('box', -1.5, 11.9, -1.8, 0.2, 1.4, 0.2, 'l'), P('box', 1.2, 12.2, -2.0, 0.2, 1.9, 0.2, 'l'),
    P('box', 0, 8.9, -2.4, 3.6, 0.3, 0.3, 'k'), P('box', 0, 8.1, -2.4, 3.6, 0.3, 0.3, 'k'),
  ] });
def('atlas', { name: 'Atlas', kind: 'titan', tier: 3, cost: 30000, hp: 64000, speed: 7, turn: 1.2, radius: 6, height: 20, layer: 'ground', icon: 'titan', desc: 'Bot titan. Its stomp shatters everything nearby.', deathSize: 5,
  weapons: [{ type: 'stomp', range: 26, dmg: 2600, rof: 0.45, splash: 26, targets: 'g' }],
  model: [
    P('box', -3.4, 4.5, 0, 2.4, 9.0, 3.0, 'd'), P('box', 3.4, 4.5, 0, 2.4, 9.0, 3.0, 'd'),
    P('box', -3.4, 1.0, 0.6, 3.6, 2.0, 5.5, 'k'), P('box', 3.4, 1.0, 0.6, 3.6, 2.0, 5.5, 'k'),
    P('sph', -3.4, 9.4, 0, 3.0, 3.0, 3.0, 'l'), P('sph', 3.4, 9.4, 0, 3.0, 3.0, 3.0, 'l'),
    P('sph', -3.4, 5.0, 0, 3.0, 3.0, 3.0, 'l'), P('sph', 3.4, 5.0, 0, 3.0, 3.0, 3.0, 'l'),
    P('box', 0, 10.5, 0, 6.5, 3.0, 4.5, ''), P('box', 0, 13.5, 0, 8.5, 3.5, 6.0, 't'),
    P('box', 0, 13.5, 3.05, 5.0, 2.0, 0.2, 'G'),
    P('box', 0, 16.2, 0, 3.5, 2.0, 3.5, 'l'), P('box', 0, 16.4, 1.8, 2.2, 0.6, 0.2, 'G'),
    P('box', -6.2, 13.0, 0, 3.0, 4.0, 4.0, 'd'), P('box', 6.2, 13.0, 0, 3.0, 4.0, 4.0, 'd'),
    P('box', -6.2, 9.0, 0.5, 2.6, 4.5, 2.6, ''), P('box', 6.2, 9.0, 0.5, 2.6, 4.5, 2.6, ''),
    P('box', -6.2, 6.0, 0.8, 3.4, 2.0, 3.4, 't'), P('box', 6.2, 6.0, 0.8, 3.4, 2.0, 3.4, 't'),
    P('box', 0, 12.0, -3.5, 5.0, 4.0, 1.5, 'd'), P('box', 0, 12.0, -4.3, 3.5, 2.5, 0.1, 'g'),
    P('cyl', -2.0, 15.5, -3.0, 0.5, 4.0, 0.5, 'k'), P('cyl', 2.0, 15.5, -3.0, 0.5, 4.0, 0.5, 'k'),
    P('rbox', 0, 14.6, 3.2, 6.0, 1.2, 0.6, 'l'), P('rbox', 0, 12.4, 3.2, 6.0, 1.2, 0.6, 'l'),
    P('rbox', -3.4, 7.0, 1.3, 2.0, 3.6, 0.5, 'l'), P('rbox', 3.4, 7.0, 1.3, 2.0, 3.6, 0.5, 'l'),
    P('cyl', -3.4, 7.2, -1.8, 0.5, 4.4, 0.5, 'k'), P('cyl', 3.4, 7.2, -1.8, 0.5, 4.4, 0.5, 'k'),
    P('box', -6.2, 11.2, 0, 3.2, 0.3, 4.2, 'k'), P('box', 6.2, 11.2, 0, 3.2, 0.3, 4.2, 'k'),
    P('box', -2.4, 10.6, -2.6, 0.5, 1.0, 0.5, 'k'), P('box', -1.2, 10.6, -2.6, 0.5, 1.0, 0.5, 'k'), P('box', 1.2, 10.6, -2.6, 0.5, 1.0, 0.5, 'k'), P('box', 2.4, 10.6, -2.6, 0.5, 1.0, 0.5, 'k'),
    P('box', 0, 17.6, -0.5, 0.2, 1.6, 0.2, 'l'), P('box', 0, 18.4, -0.5, 1.2, 0.08, 0.3, 'l'),
  ] });
def('zeus', { name: 'Zeus', kind: 'titan', tier: 3, cost: 22000, hp: 26000, speed: 14, turn: 1.0, radius: 5, height: 8, layer: 'air', icon: 'titan', desc: 'Air titan. Rains lightning on everything below.', deathSize: 4, hover: true,
  weapons: [{ type: 'lightning', range: 62, dmg: 420, rof: 4, targets: 'ga' }],
  model: [
    P('box', 0, 2.0, 0, 5.0, 3.0, 14.0, ''), P('wdg', 0, 2.0, 8.0, 4.0, 2.4, 3.0, 'l', Math.PI / 2, 0, 0),
    P('box', 0, 3.8, -2, 3.0, 1.2, 6.0, 't'),
    P('box', 0, 2.0, -1, 16.0, 0.6, 5.0, 't'), P('box', -7.5, 1.5, -1, 1.2, 1.4, 6.0, 'd'), P('box', 7.5, 1.5, -1, 1.2, 1.4, 6.0, 'd'),
    P('box', -7.5, 1.5, -4.2, 0.9, 0.9, 0.2, 'G'), P('box', 7.5, 1.5, -4.2, 0.9, 0.9, 0.2, 'G'),
    P('box', 0, 4.5, -6, 0.5, 3.0, 3.0, 't'),
    P('sph', 0, 0.2, 1, 2.6, 1.4, 2.6, 'G'), P('sph', -4, 0.4, -1, 1.4, 1.0, 1.4, 'G'), P('sph', 4, 0.4, -1, 1.4, 1.0, 1.4, 'G'),
    P('cyl', 0, 0.5, 4, 1.6, 1.0, 1.6, 'g'), P('cyl', 0, 0.5, -4, 1.6, 1.0, 1.6, 'g'),
    P('box', 0, 3.6, 4.5, 1.6, 0.4, 3.0, 'l'), P('cylz', 0, 2.0, -7.3, 1.2, 1.2, 0.5, 'k'),
    P('cylz', -7.5, 1.5, 2.2, 1.5, 1.5, 0.4, 'k'), P('cylz', 7.5, 1.5, 2.2, 1.5, 1.5, 0.4, 'k'),
    P('box', 0, 4.4, -3.5, 0.15, 1.6, 0.15, 'l'), P('box', 0, 5.2, -3.5, 1.4, 0.08, 0.2, 'l'),
    P('box', -2.6, 3.5, 0, 0.3, 0.3, 8.0, 'k'), P('box', 2.6, 3.5, 0, 0.3, 0.3, 8.0, 'k'),
    P('rbox', 0, 3.7, 2.5, 2.2, 0.5, 2.0, 'd'), P('box', -3.6, 2.4, -1, 0.3, 0.4, 5.0, 't'), P('box', 3.6, 2.4, -1, 0.3, 0.4, 5.0, 't'),
    P('box', -7.5, 2.3, -1, 0.5, 0.25, 4.0, 'l'), P('box', 7.5, 2.3, -1, 0.5, 0.25, 4.0, 'l'),
  ] });

export const DEFS = D;
export const BUILD_LISTS = {
  fabber1: ['metal_extractor', 'energy_plant', 'bot_factory', 'vehicle_factory', 'air_factory', 'orbital_launcher', 'laser_tower', 'flak_tower', 'umbrella', 'adv_bot_factory', 'adv_vehicle_factory', 'adv_air_factory', 'teleporter', 'antinuke'],
  fabber2: ['metal_extractor', 'energy_plant', 'adv_energy', 'bot_factory', 'vehicle_factory', 'air_factory', 'orbital_launcher', 'adv_bot_factory', 'adv_vehicle_factory', 'adv_air_factory', 'laser_tower', 'flak_tower', 'umbrella', 'adv_laser_tower', 'artillery', 'teleporter', 'antinuke', 'nuke_launcher', 'ares', 'atlas', 'zeus'],
};
export const BUILD_TABS = [
  { id: 'econ', name: 'Economy', ids: ['metal_extractor', 'energy_plant', 'adv_energy'] },
  { id: 'factory', name: 'Factories', ids: ['bot_factory', 'vehicle_factory', 'air_factory', 'orbital_launcher', 'adv_bot_factory', 'adv_vehicle_factory', 'adv_air_factory'] },
  { id: 'defense', name: 'Defense', ids: ['laser_tower', 'flak_tower', 'umbrella', 'adv_laser_tower', 'artillery'] },
  { id: 'strategic', name: 'Strategic', ids: ['teleporter', 'antinuke', 'nuke_launcher'] },
  { id: 'titans', name: 'Titans', ids: ['ares', 'atlas', 'zeus'] },
];
for (const id in D) {
  const d = D[id];
  if (!d.model && d.parts) d.model = d.parts;
  if (d.speed === undefined) d.speed = 0;
  if (d.turn === undefined) d.turn = 2;
  if (d.height === undefined) d.height = 3;
  if (d.layer === undefined) d.layer = d.kind === 'orbital' ? 'orbital' : 'ground';
  if (d.deathSize === undefined) d.deathSize = d.kind === 'structure' ? 2.2 : (d.tier >= 2 ? 1.8 : 1.0);
  if (d.aiValue === undefined) d.aiValue = d.cost;
  d.mobile = d.speed > 0;
  d.isTitan = d.kind === 'titan';
  for (const w of d.weapons || []) { if (!w.color) w.color = null; if (w.aggro === undefined) w.aggro = 1.35; }
}
