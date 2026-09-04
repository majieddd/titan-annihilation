import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const GRAD3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
export class Simplex {
  constructor(rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.permMod12[i] = this.perm[i] % 12; }
  }
  noise3(xin, yin, zin) {
    const F3 = 1 / 3, G3 = 1 / 6;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const perm = this.perm, pm = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = GRAD3[pm[ii + perm[jj + perm[kk]]]]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = GRAD3[pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = GRAD3[pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = GRAD3[pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; t3 *= t3; n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  fbm(x, y, z, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * this.noise3(x * f, y * f, z * f); norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }
  ridged(x, y, z, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(this.noise3(x * f, y * f, z * f)); sum += a * n * n; norm += a; a *= gain; f *= lac; }
    return sum / norm;
  }
}

// ---- sphere math ----
const _t = new THREE.Vector3(), _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** tangent unit vector at a pointing toward b (both unit dirs). zero if coincident. */
export function tangentToward(a, b, out) {
  out.copy(b).addScaledVector(a, -a.dot(b));
  const l = out.length();
  if (l < 1e-7) { out.set(0, 0, 0); return out; }
  return out.multiplyScalar(1 / l);
}
/** move unit dir along tangent by angle (radians). */
export function moveOnSphere(dir, tangent, angle, out) {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.set(dir.x * c + tangent.x * s, dir.y * c + tangent.y * s, dir.z * c + tangent.z * s);
  return out.normalize();
}
export function angleBetween(a, b) { return Math.acos(clamp(a.dot(b), -1, 1)); }
/** quaternion with local +Y = normal, local +Z = forward (projected to tangent plane). */
export function frameQuat(normal, forward, outQ) {
  _y.copy(normal);
  _z.copy(forward).addScaledVector(_y, -_y.dot(forward));
  if (_z.lengthSq() < 1e-8) anyTangent(_y, _z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  return outQ.setFromRotationMatrix(_m);
}
export function anyTangent(n, out) {
  out.set(1, 0, 0).addScaledVector(n, -n.x);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1).addScaledVector(n, -n.z);
  return out.normalize();
}
/** rotate tangent t about normal n by angle. */
export function rotateTangent(n, t, angle, out) {
  const c = Math.cos(angle), s = Math.sin(angle);
  _t.crossVectors(n, t);
  out.set(t.x * c + _t.x * s, t.y * c + _t.y * s, t.z * c + _t.z * s);
  return out;
}
/** project v onto tangent plane at n (in place) */
export function projectTangent(n, v) { return v.addScaledVector(n, -n.dot(v)); }

export class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a; a.push({ v, p });
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j].p <= a[i].p) break; const t = a[i]; a[i] = a[j]; a[j] = t; i = j; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        const t = a[i]; a[i] = a[m]; a[m] = t; i = m;
      }
    }
    return top.v;
  }
}

export function keyCode(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (k.length === 1) { if (/[a-z]/i.test(k)) return 'Key' + k.toUpperCase(); if (/[0-9]/.test(k)) return 'Digit' + k; if (k === ' ') return 'Space'; }
  return k;
}
export function fmtTime(s) { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }
export function fmtNum(n) { n = Math.round(n); if (Math.abs(n) >= 100000) return (n / 1000).toFixed(0) + 'k'; if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + 'k'; return String(n); }
export function colorHex(c) { return '#' + new THREE.Color(c[0], c[1], c[2]).getHexString(); }

/** periodic (tileable) 2D gradient noise. noise(x, y, period, periodY) wraps every `period` lattice units per axis. */
export function makePeriodicNoise2(seed) {
  const rng = mulberry32(seed >>> 0);
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y, period, periodY = period) {
    const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    const px = Math.max(1, Math.round(period)), py = Math.max(1, Math.round(periodY));
    const wx = (i) => ((i % px) + px) % px, wy = (j) => ((j % py) + py) % py;
    const g = (i, j) => G[perm[wx(i) + perm[wy(j)]] & 7];
    const d = (gr, dx, dy) => gr[0] * dx + gr[1] * dy;
    const u = fade(xf), v = fade(yf);
    const n00 = d(g(xi, yi), xf, yf), n10 = d(g(xi + 1, yi), xf - 1, yf), n01 = d(g(xi, yi + 1), xf, yf - 1), n11 = d(g(xi + 1, yi + 1), xf - 1, yf - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4;
  }
  function fbm(x, y, period, oct = 4, lac = 2, gain = 0.5, periodY = period) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, period * f, periodY * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  function ridged(x, y, period, oct = 5, gain = 0.55, periodY = period) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(noise(x * f, y * f, period * f, periodY * f)); s += a * v * v; n += a; a *= gain; f *= 2; }
    return s / n;
  }
  return { noise, fbm, ridged };
}
/** periodic Worley (cellular) noise: returns {f1, f2, id} for the nearest feature points; tiles every `period` cells. */
export function makePeriodicWorley(seed) {
  const rng = mulberry32(seed >>> 0);
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const out = { f1: 0, f2: 0, id: 0 };
  const h = (i, j, k) => perm[(perm[(i + k) & 255] + j) & 255] / 255;
  return function worley(x, y, period, periodY = period) {
    const xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = xi + di, cj = yi + dj; const wi = ((ci % period) + period) % period, wj = ((cj % periodY) + periodY) % periodY;
      const ox = h(wi, wj, 0), oy = h(wi, wj, 97);
      const dx = ci + ox - x, dy = cj + oy - y; const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; id = wi * 977 + wj * 131 + 7; } else if (d < f2) f2 = d;
    }
    out.f1 = Math.sqrt(f1); out.f2 = Math.sqrt(f2); out.id = id; return out;
  };
}
export const VERSION = '3.6.1';
export function cubicBezier(p0, p1, p2, p3, t, out) {
  const mt = 1 - t; const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return out.set(p0.x * a + p1.x * b + p2.x * c + p3.x * d, p0.y * a + p1.y * b + p2.y * c + p3.y * d, p0.z * a + p1.z * b + p2.z * c + p3.z * d);
}
export function cubicBezierTangent(p0, p1, p2, p3, t, out) {
  const mt = 1 - t; const a = 3 * mt * mt, b = 6 * mt * t, c = 3 * t * t;
  return out.set(a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x), a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y), a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z));
}
