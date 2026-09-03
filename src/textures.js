import * as THREE from 'three';
import { makePeriodicNoise2, makePeriodicWorley, clamp, smoothstep, lerp, mulberry32, hashString, TAU } from './util.js';

let maxAniso = 4; let texSize = 768;
export function setAnisotropy(n) { maxAniso = n; }
export function getAnisotropy() { return maxAniso; }
export function setTextureSize(n) { texSize = n; }
const cache = new Map();
export const genStats = {};

function makeTex(img, srgb) {
  const t = new THREE.CanvasTexture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
// albedo base/contrast, tint variation, normal strength
const KINDS = {
  rock:  { base: 0.50, contrast: 0.85, tint: 0.05, nstr: 2.6 },
  grass: { base: 0.56, contrast: 0.55, tint: 0.08, nstr: 1.4 },
  sand:  { base: 0.62, contrast: 0.45, tint: 0.04, nstr: 1.6 },
  snow:  { base: 0.76, contrast: 0.28, tint: 0.02, nstr: 1.0 },
  dust:  { base: 0.52, contrast: 0.6,  tint: 0.03, nstr: 2.0 },
  ice:   { base: 0.66, contrast: 0.5,  tint: 0.03, nstr: 2.2 },
  crust: { base: 0.40, contrast: 0.8,  tint: 0.04, nstr: 2.8 },
  panel: { base: 0.58, contrast: 0.6,  tint: 0.0,  nstr: 2.4 },
};
const idh = (id) => (((id * 2654435761) >>> 0) % 100003) / 100003;

/** fills height, roughness and per-pixel tint for a material kind */
function generate(kind, size) {
  const P = makePeriodicNoise2(hashString('tex_' + kind)); const W = makePeriodicWorley(hashString('w_' + kind)); const rng = mulberry32(hashString('r_' + kind));
  const n = size * size; const H = new Float32Array(n), R = new Float32Array(n), CR = new Float32Array(n).fill(1), CG = new Float32Array(n).fill(1), CB = new Float32Array(n).fill(1);
  const craters = []; if (kind === 'dust') for (let i = 0; i < 30; i++) craters.push([rng(), rng(), 0.015 + rng() * 0.07]);
  const scratches = []; if (kind === 'panel') for (let i = 0; i < 40; i++) { const a = rng() * TAU; scratches.push([rng(), rng(), Math.cos(a), Math.sin(a), 0.03 + rng() * 0.12]); }
  const splitCell = []; if (kind === 'panel') for (let i = 0; i < 16; i++) splitCell.push(rng());
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; const u = x / size, v = y / size; let h = 0.5, rough = 0.85, cr = 1, cg = 1, cb = 1;
    switch (kind) {
      case 'rock': {
        const wx = 0.38 * P.fbm(u * 3 + 1.3, v * 3, 3, 3), wy = 0.38 * P.fbm(u * 3, v * 3 + 2.1, 3, 3);
        const c = W(u * 5 + wx, v * 5 + wy, 5); const crack = smoothstep(0.0, 0.06, c.f2 - c.f1); const ph = idh(c.id);
        const c2 = W(u * 14 + wy, v * 14 + wx, 14); const crack2 = smoothstep(0.0, 0.035, c2.f2 - c2.f1);
        const boulder = 1 - clamp(W(u * 3, v * 3, 3).f1, 0, 1);
        const rid = P.ridged(u * 8, v * 8, 8, 5, 0.55); const ero = P.fbm(u * 22, v * 22, 22, 4, 2, 0.5); const grain = P.fbm(u * 60, v * 60, 60, 2);
        h = 0.2 + 0.5 * rid + 0.14 * boulder * boulder + ph * 0.08 + ero * 0.14 - (1 - crack) * 0.12 - (1 - crack2) * 0.04 + grain * 0.05;
        rough = 0.86 + 0.1 * (1 - crack) - 0.14 * rid; cr = 1 + 0.06 * (ph - 0.5) + 0.05 * ero; cb = 1 - 0.06 * (ph - 0.5) - 0.05 * ero;
        break;
      }
      case 'grass': {
        const cl = W(u * 11, v * 11, 11); const clump = 1 - clamp(cl.f1, 0, 1); const ch = idh(cl.id);
        const blades = P.fbm(u * 96, v * 12, 96, 3, 2, 0.5, 12);
        const patch = P.fbm(u * 3, v * 3, 3, 3); const dirt = smoothstep(0.22, 0.5, patch);
        const fine = P.fbm(u * 60, v * 60, 60, 2);
        h = 0.4 + 0.3 * clump + 0.12 * blades + 0.08 * fine + 0.05 * ch - 0.2 * dirt;
        rough = 0.86 - 0.1 * dirt; cr = lerp(0.96 + 0.1 * (ch - 0.5), 1.28, dirt); cg = lerp(1.03 + 0.05 * (ch - 0.5), 0.86, dirt); cb = lerp(0.84, 0.62, dirt);
        break;
      }
      case 'sand': {
        const rip = Math.sin(TAU * (v * 14 + 1.3 * P.fbm(u * 5, v * 5, 5, 3) + 0.3 * P.fbm(u * 20, v * 20, 20, 2)));
        const grain = P.fbm(u * 90, v * 90, 90, 2); const pb = W(u * 34, v * 34, 34); const pebble = idh(pb.id) > 0.82 ? smoothstep(0.32, 0.12, pb.f1) : 0;
        h = 0.5 + 0.1 * rip + 0.1 * grain + 0.3 * pebble; rough = 0.88 - 0.25 * pebble; cr = 1 + 0.04 * rip; cb = 1 - 0.04 * rip;
        if (pebble > 0.5) { cr = 0.85; cg = 0.85; cb = 0.85; }
        break;
      }
      case 'snow': {
        const mound = P.fbm(u * 4, v * 4, 4, 3); const wind = P.fbm(u * 32, v * 6, 32, 3, 2, 0.5, 6); const fine = P.fbm(u * 70, v * 70, 70, 2);
        h = 0.5 + 0.3 * mound + 0.15 * wind + 0.06 * fine + (rng() < 0.003 ? 0.4 : 0); rough = 0.62 + 0.15 * fine; cb = 1.03;
        break;
      }
      case 'dust': {
        h = 0.5 + 0.35 * P.fbm(u * 8, v * 8, 8, 6) + 0.08 * P.fbm(u * 70, v * 70, 70, 2);
        for (const c of craters) { let dx = Math.abs(u - c[0]); dx = Math.min(dx, 1 - dx); if (dx > c[2] * 1.3) continue; let dy = Math.abs(v - c[1]); dy = Math.min(dy, 1 - dy); if (dy > c[2] * 1.3) continue; const d = Math.hypot(dx, dy) / c[2]; if (d < 1) h += (d * d - 1) * 0.35 + 0.15 * smoothstep(0.7, 1, d); else if (d < 1.3) h += 0.12 * (1 - smoothstep(1, 1.3, d)); }
        const pb = W(u * 40, v * 40, 40); const pebble = idh(pb.id) > 0.85 ? smoothstep(0.3, 0.1, pb.f1) : 0; h += 0.25 * pebble; rough = 0.95 - 0.3 * pebble;
        break;
      }
      case 'ice': {
        const c = W(u * 7, v * 7, 7); const crack = smoothstep(0, 0.05, c.f2 - c.f1); const c2 = W(u * 19, v * 19, 19); const crack2 = smoothstep(0, 0.035, c2.f2 - c2.f1);
        const frost = P.fbm(u * 50, v * 50, 50, 3); const bub = W(u * 45, v * 45, 45); const bubble = idh(bub.id) > 0.6 ? smoothstep(0.18, 0.05, bub.f1) : 0;
        h = 0.62 + 0.12 * frost - 0.45 * (1 - crack) - 0.2 * (1 - crack2) + 0.12 * bubble;
        rough = 0.22 + 0.5 * (1 - crack) + 0.2 * (1 - crack2) + 0.1 * frost; cr = 0.94; cb = 1.06;
        break;
      }
      case 'crust': {
        const c = W(u * 7, v * 7, 7); const crack = smoothstep(0, 0.1, c.f2 - c.f1); const ph = idh(c.id); const rid = P.ridged(u * 12, v * 12, 12, 4, 0.5);
        h = lerp(0.04, 0.28 + 0.3 * rid + 0.25 * ph, crack); rough = 0.75 - 0.2 * rid;
        if (crack < 0.5) { cr = 1.2; cg = 0.72; cb = 0.45; } else { cr = 1.04; cg = 0.96; cb = 0.9; }
        break;
      }
      case 'panel': {
        const gx = u * 4, gy = v * 4; const cx = Math.floor(gx), cy = Math.floor(gy); const lx = gx - cx, ly = gy - cy; const cell = cx + cy * 4;
        let dEdge = Math.min(lx, 1 - lx, ly, 1 - ly);
        if (splitCell[cell] > 0.55) dEdge = Math.min(dEdge, Math.abs(lx - 0.5)); else if (splitCell[cell] < 0.2) dEdge = Math.min(dEdge, Math.abs(ly - 0.5));
        dEdge /= 4; const bevel = smoothstep(0.004, 0.02, dEdge);
        const grime = P.fbm(u * 6, v * 6, 6, 3);
        h = 0.35 + 0.45 * bevel + 0.06 * idh(cell + 3) - 0.05 * grime;
        const rx = (u * 16) % 1, ry = (v * 16) % 1; const nearU = Math.min(lx, 1 - lx) / 4, nearV = Math.min(ly, 1 - ly) / 4;
        let rivet = 0;
        if (nearU < 0.035 && nearU > 0.02) rivet = smoothstep(0.03, 0.012, Math.hypot(nearU - 0.027, (ry - 0.5) / 16));
        if (nearV < 0.035 && nearV > 0.02) rivet = Math.max(rivet, smoothstep(0.03, 0.012, Math.hypot(nearV - 0.027, (rx - 0.5) / 16)));
        h += 0.28 * rivet;
        for (const s of scratches) { const dx = u - s[0], dy = v - s[1]; const t = clamp(dx * s[2] + dy * s[3], 0, s[4]); const px = s[0] + s[2] * t, py = s[1] + s[3] * t; if (Math.hypot(u - px, v - py) < 0.0016) h += 0.14; }
        rough = 0.42 + 0.4 * (1 - bevel) + 0.2 * Math.max(0, grime) - 0.15 * rivet; cr = 1 - 0.04 * grime; cb = 1 + 0.03 * grime;
        break;
      }
    }
    H[i] = clamp(h, 0, 1); R[i] = clamp(rough, 0.05, 1); CR[i] = cr; CG[i] = cg; CB[i] = cb;
  }
  return { H, R, CR, CG, CB };
}
export function detailTexture(kind, size = texSize) {
  const key = kind + size; if (cache.has(key)) return cache.get(key);
  const t0 = performance.now();
  const opt = KINDS[kind]; const { H, R, CR, CG, CB } = generate(kind, size); const P = makePeriodicNoise2(hashString('tint_' + kind));
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  const nc = document.createElement('canvas'); nc.width = nc.height = size; const nctx = nc.getContext('2d'); const nimg = nctx.createImageData(size, size);
  const str = opt.nstr * size / 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; const val = clamp(opt.base + opt.contrast * (H[i] - 0.5), 0, 1);
    const tn = opt.tint ? P.fbm(x / size * 3, y / size * 3, 3, 2) : 0;
    img.data[i * 4] = clamp(val * CR[i] * (1 + opt.tint * tn), 0, 1) * 255; img.data[i * 4 + 1] = clamp(val * CG[i], 0, 1) * 255; img.data[i * 4 + 2] = clamp(val * CB[i] * (1 - opt.tint * tn), 0, 1) * 255; img.data[i * 4 + 3] = (0.3 + 0.7 * H[i]) * 255;
    const hl = H[y * size + ((x - 1 + size) % size)], hr = H[y * size + ((x + 1) % size)], hu = H[((y - 1 + size) % size) * size + x], hd = H[((y + 1) % size) * size + x];
    let nx = (hl - hr) * str, ny = (hd - hu) * str, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nimg.data[i * 4] = (nx * 0.5 + 0.5) * 255; nimg.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i * 4 + 3] = (0.3 + 0.7 * R[i]) * 255;
  }
  ctx.putImageData(img, 0, 0); nctx.putImageData(nimg, 0, 0);
  const map = makeTex(c, true); map.premultiplyAlpha = false; const normal = makeTex(nc, false);
  const out = { map, normal, canvas: c, ncanvas: nc }; cache.set(key, out); genStats[key] = performance.now() - t0; return out;
}

/** cloud layer texture sampled seamlessly on the sphere */
export function cloudTexture(nz, off, kind = 'white', w = 768, h = 384) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
  const tint = kind === 'ash' ? [0.42, 0.36, 0.33] : [1, 1, 1];
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI; const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * TAU; const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const base = nz.fbm(px * 4.2 + off[2], py * 4.2, pz * 4.2, 5, 2.3, 0.55);
      let a = smoothstep(0.12, 0.5, base);
      const det = nz.fbm(px * 12 + off[0], py * 12, pz * 12, 3, 2.2, 0.5); a *= clamp(0.7 + 0.5 * det, 0, 1.1);
      const up = nz.fbm(px * 4.2 + off[2], (py + 0.035) * 4.2, pz * 4.2, 3, 2.3, 0.55); const shade = clamp(0.78 + (up - base) * 5.0, 0.5, 1.08);
      const i = (y * w + x) * 4; img.data[i] = tint[0] * shade * 255; img.data[i + 1] = tint[1] * shade * 255; img.data[i + 2] = tint[2] * shade * 255; img.data[i + 3] = clamp(a, 0, 1) * 235;
    }
  }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t;
}
export function nebulaTexture(simplex, w = 1024, h = 512) {
  if (cache.has('nebula')) return cache.get('nebula');
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
  const ax = new THREE.Vector3(0.3, 0.9, 0.25).normalize();
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI; const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * TAU; const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const a = simplex.fbm(px * 2.2, py * 2.2, pz * 2.2, 5, 2.1, 0.55), b = simplex.fbm(px * 3.1 + 5, py * 3.1, pz * 3.1, 4, 2, 0.5), c = simplex.fbm(px * 1.4 + 9, py * 1.4 - 3, pz * 1.4, 4, 2, 0.5);
      const va = Math.max(0, a) * 1.5, vb = Math.max(0, b) * 1.3, vc = Math.max(0, c);
      const band = Math.exp(-Math.pow(px * ax.x + py * ax.y + pz * ax.z, 2) / 0.05) * (0.35 + 0.65 * Math.max(0, simplex.fbm(px * 6, py * 6, pz * 6, 4)));
      const i = (y * w + x) * 4;
      img.data[i] = clamp(8 + va * 55 + vb * 15 + vc * 40 + band * 70, 0, 255); img.data[i + 1] = clamp(6 + va * 22 + vb * 45 + vc * 20 + band * 62, 0, 255); img.data[i + 2] = clamp(16 + va * 85 + vb * 70 + vc * 30 + band * 75, 0, 255); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; cache.set('nebula', t); return t;
}
export function radialTexture(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}
export function sunTextures() {
  if (cache.has('sun')) return cache.get('sun');
  const out = {
    corona: radialTexture(512, [[0, 'rgba(255,250,235,1)'], [0.1, 'rgba(255,240,205,0.95)'], [0.25, 'rgba(255,200,120,0.45)'], [0.55, 'rgba(255,160,70,0.12)'], [1, 'rgba(255,140,60,0)']]),
    flare0: radialTexture(256, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,245,220,0.8)'], [0.5, 'rgba(255,220,160,0.25)'], [1, 'rgba(255,200,120,0)']]),
    flare1: radialTexture(128, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(200,230,255,0.05)'], [0.7, 'rgba(200,230,255,0.45)'], [0.8, 'rgba(200,230,255,0.05)'], [1, 'rgba(200,230,255,0)']]),
    flare2: radialTexture(128, [[0, 'rgba(255,255,255,0.5)'], [0.5, 'rgba(255,230,200,0.2)'], [1, 'rgba(255,230,200,0)']]),
  };
  cache.set('sun', out); return out;
}

/** alpha-cut grass blade sprite for close-range foliage */
export function grassBladeTexture(kind = 'green') {
  const key = 'grass_' + kind; if (cache.has(key)) return cache.get(key);
  const s = 256; const c = document.createElement('canvas'); c.width = c.height = s; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, s, s);
  const rng = mulberry32(hashString(key));
  const base = kind === 'dry' ? [[0.42, 0.36, 0.16], [0.78, 0.68, 0.36]] : [[0.1, 0.3, 0.08], [0.45, 0.62, 0.2]];
  for (let i = 0; i < 16; i++) {
    const x0 = 30 + rng() * (s - 60); const w = 7 + rng() * 9; const h = s * (0.55 + rng() * 0.42); const lean = (rng() - 0.5) * 70;
    const c0 = base[0], c1 = base[1]; const t = rng() * 0.5;
    const g = ctx.createLinearGradient(0, s, 0, s - h);
    g.addColorStop(0, `rgb(${(c0[0] * 255) | 0},${(c0[1] * 255) | 0},${(c0[2] * 255) | 0})`);
    g.addColorStop(1, `rgb(${(lerp(c0[0], c1[0], 0.6 + t) * 255) | 0},${(lerp(c0[1], c1[1], 0.6 + t) * 255) | 0},${(lerp(c0[2], c1[2], 0.6 + t) * 255) | 0})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - w / 2, s); ctx.quadraticCurveTo(x0 + lean * 0.3, s - h * 0.55, x0 + lean, s - h); ctx.quadraticCurveTo(x0 + lean * 0.35 + 2, s - h * 0.5, x0 + w / 2, s); ctx.closePath(); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = maxAniso; cache.set(key, t); return t;
}

/** tileable water wave normal map */
export function waterNormalTexture(size = 512) {
  if (cache.has('waterN')) return cache.get('waterN');
  const P = makePeriodicNoise2(hashString('water')); const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const u = x / size, v = y / size; let val = 0.5 + 0.28 * P.fbm(u * 6, v * 6, 6, 4, 2.1, 0.55) + 0.14 * P.fbm(u * 16 + 3, v * 16, 16, 3) + 0.08 * Math.sin(TAU * (u * 5 + 0.6 * P.fbm(u * 4, v * 4, 4, 2))); h[y * size + x] = val; }
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); const str = 1.6 * size / 256;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x; const hl = h[y * size + ((x - 1 + size) % size)], hr = h[y * size + ((x + 1) % size)], hu = h[((y - 1 + size) % size) * size + x], hd = h[((y + 1) % size) * size + x];
    let nx = (hl - hr) * str, ny = (hd - hu) * str, nz = 1; const l = Math.hypot(nx, ny, nz); img.data[i * 4] = (nx / l * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); const t = makeTex(c, false); cache.set('waterN', t); return t;
}
/** alpha-cut cluster of leaves for tree canopy cards */
export function leafClusterTexture(size = 256) {
  if (cache.has('leaves')) return cache.get('leaves');
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, size, size); const rng = mulberry32(hashString('leaves'));
  for (let i = 0; i < 260; i++) {
    const rad = Math.pow(rng(), 0.6) * size * 0.46, ang = rng() * TAU; const cx = size / 2 + Math.cos(ang) * rad, cy = size / 2 + Math.sin(ang) * rad; const d = rad / (size / 2);
    const r = 9 + rng() * 13; const a = rng() * TAU; const g = 0.3 + rng() * 0.3; const shade = (0.55 + rng() * 0.6) * (1.0 - d * 0.35);
    ctx.fillStyle = `rgb(${(0.14 * 255 * shade) | 0},${(g * 255 * shade) | 0},${(0.08 * 255 * shade) | 0})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.5, a, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${(0.3 * 255 * shade) | 0},${((g + 0.2) * 255 * shade) | 0},${(0.12 * 255 * shade) | 0},0.55)`;
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35, r * 0.5, r * 0.28, a, 0, TAU); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; cache.set('leaves', t); return t;
}

/** conifer silhouette for crossed-card trees: thousands of drooping needle strokes inside a tall triangle */
export function coniferTexture(size = 256) {
  if (cache.has('conifer')) return cache.get('conifer');
  const c = document.createElement('canvas'); c.width = size * 2; c.height = size; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, size * 2, size); const rng = mulberry32(hashString('conifer'));
  const cx = size / 2, top = size * 0.03, bottom = size * 0.985;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(62,44,28)'; ctx.lineWidth = size * 0.028; ctx.beginPath(); ctx.moveTo(cx, size * 0.3); ctx.lineTo(cx, bottom); ctx.stroke();
  for (let i = 0; i < 3200; i++) {
    const t = Math.pow(rng(), 0.75); const y = top + t * (bottom - top - size * 0.07); const halfW = size * 0.015 + t * size * 0.45;
    const side = rng() < 0.5 ? -1 : 1; const x0 = cx + side * rng() * halfW * 0.92; const len = size * (0.025 + rng() * 0.05); const a = 0.1 + rng() * 0.7;
    const shade = (0.45 + rng() * 0.7) * (1 - t * 0.2); const g = 0.3 + rng() * 0.22;
    ctx.strokeStyle = `rgb(${(0.09 * 255 * shade) | 0},${(g * 255 * shade) | 0},${(0.08 * 255 * shade) | 0})`; ctx.lineWidth = 1 + rng() * 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + side * Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  // right half: top-down view (radial needle whorls) for the horizontal card
  const tx = size * 1.5, ty = size / 2;
  for (let i = 0; i < 2600; i++) {
    const r0 = Math.pow(rng(), 0.55) * size * 0.46; const a = rng() * TAU; const len = size * (0.03 + rng() * 0.06);
    const shade = (0.4 + rng() * 0.7) * (1 - r0 / (size * 0.5) * 0.35); const g = 0.3 + rng() * 0.22;
    ctx.strokeStyle = `rgb(${(0.09 * 255 * shade) | 0},${(g * 255 * shade) | 0},${(0.08 * 255 * shade) | 0})`; ctx.lineWidth = 1 + rng() * 1.5;
    const x0 = tx + Math.cos(a) * r0, y0 = ty + Math.sin(a) * r0; const b = a + (rng() - 0.5) * 0.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(b) * len, y0 + Math.sin(b) * len); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; cache.set('conifer', t); return t;
}
