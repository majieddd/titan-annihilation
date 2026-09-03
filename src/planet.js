import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, mulberry32, Simplex, MinHeap, angleBetween, tangentToward, moveOnSphere, rotateTangent, anyTangent, frameQuat, TAU } from './util.js';
import { detailTexture, cloudTexture, waterNormalTexture, leafClusterTexture, coniferTexture } from './textures.js';
import { getTextureSet } from './assets.js';
import { GrassField } from './foliage.js';

export const BIOMES = {
  earth:  { name: 'Terran',  sea: true,  lava: false, seaColor: [0.06, 0.34, 0.58], deepColor: [0.01, 0.07, 0.18], atmo: [0.35, 0.62, 1.0], atmoStrength: 1.0,  clouds: 'white', landBias: 0.12, palette: 'earth',  hemiSky: [0.55, 0.7, 1.0], hemiGround: [0.25, 0.2, 0.15], tex: ['grass', 'rock', 'snow'], high: [14, 21], rough: [0.9, 0.96, 0.55], props: 'earth', scatter: [0.0079, 0.0184, 0.045], mie: 0.004, sunI: 22 },
  lava:   { name: 'Magma',   sea: true,  lava: true,  seaColor: [1.0, 0.42, 0.06], deepColor: [0.55, 0.08, 0.0], atmo: [1.0, 0.42, 0.12], atmoStrength: 0.75, clouds: 'ash',   landBias: 0.2,  palette: 'lava',   hemiSky: [0.9, 0.5, 0.35], hemiGround: [0.3, 0.1, 0.05], tex: ['dust', 'crust', 'rock'], high: [10, 18], rough: [0.95, 0.9, 0.92], props: 'lava', scatter: [0.05, 0.018, 0.006], mie: 0.01, sunI: 18, aerial: 0.12 },
  ice:    { name: 'Glacial', sea: true,  lava: false, seaColor: [0.5, 0.72, 0.9],   deepColor: [0.15, 0.35, 0.6], atmo: [0.6, 0.82, 1.0], atmoStrength: 0.9,  clouds: 'white', landBias: 0.25, palette: 'ice',    hemiSky: [0.7, 0.8, 1.0], hemiGround: [0.4, 0.45, 0.55], tex: ['ice', 'rock', 'snow'], high: [1.5, 4], rough: [0.3, 0.9, 0.6], props: 'ice', scatter: [0.007, 0.017, 0.045], mie: 0.003, sunI: 22, alb: 0.58 },
  desert: { name: 'Arid',    sea: false, lava: false, seaColor: [0.2, 0.4, 0.5],   deepColor: [0.1, 0.2, 0.3],   atmo: [1.0, 0.72, 0.42], atmoStrength: 0.7,  clouds: null,    landBias: 0.95, palette: 'desert', hemiSky: [1.0, 0.85, 0.6], hemiGround: [0.45, 0.3, 0.15], tex: ['sand', 'rock', 'dust'], high: [9, 15], rough: [0.9, 0.96, 0.9], props: 'desert', scatter: [0.024, 0.02, 0.028], mie: 0.008, sunI: 20, alb: 0.95 },
  moon:   { name: 'Barren',  sea: false, lava: false, seaColor: [0, 0, 0],         deepColor: [0, 0, 0],         atmo: [0.5, 0.55, 0.65], atmoStrength: 0.22, clouds: null,    landBias: 0.95, palette: 'moon',   hemiSky: [0.5, 0.55, 0.65], hemiGround: [0.2, 0.2, 0.22], tex: ['dust', 'rock', 'dust'], high: [8, 14], rough: [0.95, 0.96, 0.95], props: 'moon', scatter: [0.0079, 0.0184, 0.045], mie: 0.002, sunI: 20 },
};

const RAMPS = {
  earth:  { stops: [[-10, .05, .10, .16], [-1, .14, .26, .30], [0.35, .78, .72, .52], [1.3, .44, .62, .27], [4, .23, .50, .19], [8, .30, .43, .17], [12, .48, .44, .32], [17, .50, .48, .46], [23, .92, .94, .97]], rock: [.42, .38, .35] },
  lava:   { stops: [[-10, .40, .09, .02], [0, .30, .12, .06], [2, .16, .13, .13], [8, .22, .20, .20], [16, .30, .30, .32], [24, .38, .37, .40]], rock: [.11, .09, .09] },
  ice:    { stops: [[-10, .10, .22, .35], [0, .55, .75, .88], [1, .82, .90, .96], [6, .90, .94, .98], [14, .85, .90, .95], [22, 1, 1, 1]], rock: [.38, .42, .50] },
  desert: { stops: [[-10, .35, .25, .15], [0, .55, .42, .25], [2, .84, .66, .40], [8, .78, .55, .32], [14, .62, .40, .24], [22, .55, .42, .38]], rock: [.48, .30, .20] },
  moon:   { stops: [[-10, .20, .20, .22], [0, .34, .34, .36], [6, .46, .46, .48], [14, .55, .55, .57], [22, .66, .66, .69]], rock: [.28, .28, .30] },
};

export function buildIcosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  for (let i = 0; i < verts.length; i += 3) { const l = Math.hypot(verts[i], verts[i + 1], verts[i + 2]); verts[i] /= l; verts[i + 1] /= l; verts[i + 2] /= l; }
  let faces = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let l = 0; l < level; l++) {
    const cache = new Map(); const nf = new Array(faces.length * 4); let fi = 0;
    const mid = (a, b) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      let m = cache.get(key); if (m !== undefined) return m;
      let x = (verts[a * 3] + verts[b * 3]) / 2, y = (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, z = (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2;
      const len = Math.hypot(x, y, z); x /= len; y /= len; z /= len;
      m = verts.length / 3; verts.push(x, y, z); cache.set(key, m); return m;
    };
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf[fi++] = a; nf[fi++] = ab; nf[fi++] = ca; nf[fi++] = b; nf[fi++] = bc; nf[fi++] = ab; nf[fi++] = c; nf[fi++] = ca; nf[fi++] = bc; nf[fi++] = ab; nf[fi++] = bc; nf[fi++] = ca;
    }
    faces = nf;
  }
  return { verts: new Float32Array(verts), faces: new Uint32Array(faces), count: verts.length / 3 };
}
function buildAdjacency(nv, faces) {
  const K = 6; const slots = new Int32Array(nv * K).fill(-1); const deg = new Uint8Array(nv);
  const add = (a, b) => { const base = a * K; const n = deg[a]; for (let k = 0; k < n; k++) if (slots[base + k] === b) return; if (n < K) { slots[base + n] = b; deg[a] = n + 1; } };
  for (let i = 0; i < faces.length; i += 3) { const a = faces[i], b = faces[i + 1], c = faces[i + 2]; add(a, b); add(b, a); add(b, c); add(c, b); add(c, a); add(a, c); }
  const start = new Int32Array(nv + 1); for (let i = 0; i < nv; i++) start[i + 1] = start[i] + deg[i];
  const list = new Int32Array(start[nv]); for (let i = 0; i < nv; i++) { const s = start[i], base = i * K; for (let k = 0; k < deg[i]; k++) list[s + k] = slots[base + k]; }
  return { start, list };
}
class SphereLookup {
  constructor(verts, count, adjStart, adjList, cols, rows) {
    this.verts = verts; this.adjStart = adjStart; this.adjList = adjList; this.cols = cols; this.rows = rows;
    const n = cols * rows; const grid = new Int32Array(n).fill(-1); const best = new Float32Array(n).fill(-2);
    for (let i = 0; i < count; i++) {
      const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2]; const cell = this.cellOf(x, y, z);
      const c = cell % cols, r = (cell / cols) | 0; const lon = ((c + 0.5) / cols - 0.5) * TAU, lat = ((r + 0.5) / rows - 0.5) * Math.PI;
      const cx = Math.cos(lat) * Math.cos(lon), cy = Math.sin(lat), cz = Math.cos(lat) * Math.sin(lon); const d = x * cx + y * cy + z * cz;
      if (d > best[cell]) { best[cell] = d; grid[cell] = i; }
    }
    let empty = 0; for (let i = 0; i < n; i++) if (grid[i] < 0) empty++;
    let pass = 0;
    while (empty > 0 && pass++ < 64) {
      const copy = grid.slice();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const idx = r * cols + c; if (copy[idx] >= 0) continue; let found = -1;
        for (let dr = -1; dr <= 1 && found < 0; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const v = copy[rr * cols + ((c + dc + cols) % cols)]; if (v >= 0) { found = v; break; } }
        if (found >= 0) { grid[idx] = found; empty--; }
      }
    }
    this.grid = grid;
  }
  cellOf(x, y, z) {
    const lon = Math.atan2(z, x), lat = Math.asin(clamp(y, -1, 1));
    let c = Math.floor((lon / TAU + 0.5) * this.cols); c = ((c % this.cols) + this.cols) % this.cols;
    const r = clamp(Math.floor((lat / Math.PI + 0.5) * this.rows), 0, this.rows - 1); return r * this.cols + c;
  }
  nearest(x, y, z) {
    const V = this.verts, S = this.adjStart, L = this.adjList; let v = this.grid[this.cellOf(x, y, z)]; if (v < 0) v = 0;
    let bd = V[v * 3] * x + V[v * 3 + 1] * y + V[v * 3 + 2] * z;
    for (let it = 0; it < 12; it++) {
      let bv = v;
      for (let k = S[v], e = S[v + 1]; k < e; k++) { const u = L[k]; const d = V[u * 3] * x + V[u * 3 + 1] * y + V[u * 3 + 2] * z; if (d > bd) { bd = d; bv = u; } }
      if (bv === v) break; v = bv;
    }
    return v;
  }
}
function craterProfile(a) { if (a < 1) return (a * a - 1) * 0.9 + 0.3 * smoothstep(0.65, 1, a); if (a < 1.5) return 0.3 * (1 - smoothstep(1, 1.5, a)); return 0; }
function rampColor(stops, e, out) {
  if (e <= stops[0][0]) { out[0] = stops[0][1]; out[1] = stops[0][2]; out[2] = stops[0][3]; return; }
  for (let i = 1; i < stops.length; i++) { if (e <= stops[i][0]) { const a = stops[i - 1], b = stops[i]; const t = (e - a[0]) / (b[0] - a[0]); out[0] = lerp(a[1], b[1], t); out[1] = lerp(a[2], b[2], t); out[2] = lerp(a[3], b[3], t); return; } }
  const s = stops[stops.length - 1]; out[0] = s[1]; out[1] = s[2]; out[2] = s[3];
}

/** make a lit material use this planet's own sun direction (all planets share one scene light) */
export function injectSun(mat, uSunView, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uSunView = uSunView;
    if (!shader.fragmentShader.includes('uniform vec3 uSunView')) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSunView;');
    shader.fragmentShader = shader.fragmentShader.replace('light.direction = directionalLight.direction;', 'light.direction = uSunView;');
  };
  mat.customProgramCacheKey = () => key + '_sun';
  return mat;
}

/** single-scattering atmosphere (Rayleigh + Mie) shared by the sky shell and every surface (aerial perspective) */
export const ATMO_GLSL = `
uniform vec3 uAtC; uniform float uAtR; uniform float uAtRa; uniform float uAtHr; uniform float uAtHm; uniform float uAtI; uniform float uAtOn; uniform vec3 uAtBr; uniform float uAtBm; uniform vec3 uAtSun; uniform float uAtK;
vec2 atRaySphere(vec3 ro, vec3 rd, float r) { float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float h = b * b - c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
float atOD(vec3 p, vec3 dir, float H) {
  vec2 tg = atRaySphere(p, dir, uAtR); if (tg.y > 0.0 && tg.x > 0.0) return 1e4;
  vec2 t = atRaySphere(p, dir, uAtRa); float len = max(t.y, 0.0); float ds = len / 3.0; float od = 0.0;
  for (int i = 0; i < 3; i++) { vec3 q = p + dir * ((float(i) + 0.5) * ds); od += exp(-max(length(q) - uAtR, 0.0) / H) * ds; }
  return od;
}
void atPhase(float mu, out float phR, out float phM) { float g = 0.76; phR = 0.0596831 * (1.0 + mu * mu); phM = 0.1193662 * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5)); }
vec3 atSky(vec3 ro, vec3 rd) {
  vec2 t = atRaySphere(ro, rd, uAtRa); if (t.y <= 0.0) return vec3(0.0); float t0 = max(t.x, 0.0), t1 = t.y;
  vec2 tg = atRaySphere(ro, rd, uAtR); if (tg.x > 0.0 && tg.x < t1) t1 = tg.x; if (t1 <= t0) return vec3(0.0);
  float ds = (t1 - t0) / 12.0; float odR = 0.0, odM = 0.0; vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds); float h = max(length(p) - uAtR, 0.0); float hr = exp(-h / uAtHr) * ds, hm = exp(-h / uAtHm) * ds; odR += hr; odM += hm;
    float lr = atOD(p, uAtSun, uAtHr), lm = atOD(p, uAtSun, uAtHm);
    vec3 tau = uAtBr * (odR + lr) + uAtBm * 1.1 * (odM + lm); vec3 att = exp(-tau); sumR += att * hr; sumM += att * hm;
  }
  float phR, phM; atPhase(dot(rd, uAtSun), phR, phM);
  return uAtI * (sumR * uAtBr * phR + sumM * uAtBm * phM) * uAtOn;
}
void atAerial(vec3 camW, vec3 posW, out vec3 T, out vec3 S) {
  vec3 ro = camW - uAtC; vec3 rd = posW - camW; float dist = length(rd); rd /= max(dist, 1e-4);
  vec2 ta = atRaySphere(ro, rd, uAtRa); float t0 = max(ta.x, 0.0); float t1 = min(ta.y, dist);
  if (t1 <= t0 || uAtOn < 0.01) { T = vec3(1.0); S = vec3(0.0); return; }
  float ds = (t1 - t0) / 4.0; float odR = 0.0, odM = 0.0; vec3 sumR = vec3(0.0), sumM = vec3(0.0); vec3 br = uAtBr * uAtK; float bm = uAtBm * uAtK;
  for (int i = 0; i < 4; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds); float h = max(length(p) - uAtR, 0.0); float hr = exp(-h / uAtHr) * ds, hm = exp(-h / uAtHm) * ds; odR += hr; odM += hm;
    float lr = atOD(p, uAtSun, uAtHr), lm = atOD(p, uAtSun, uAtHm);
    vec3 tau = br * (odR + lr * 0.35) + bm * 1.1 * (odM + lm * 0.35); vec3 att = exp(-tau); sumR += att * hr; sumM += att * hm;
  }
  float phR, phM; atPhase(dot(rd, uAtSun), phR, phM);
  S = uAtI * (sumR * br * phR + sumM * bm * phM) * uAtOn;
  T = exp(-(br * odR + bm * 1.1 * odM));
}
`;
const AT_KEYS = ['uAtC', 'uAtR', 'uAtRa', 'uAtHr', 'uAtHm', 'uAtI', 'uAtOn', 'uAtBr', 'uAtBm', 'uAtSun', 'uAtK'];
export function atmoUniformsOf(uniforms) { const o = {}; for (const k of AT_KEYS) o[k] = uniforms[k]; return o; }
/** aerial perspective (atmospheric in-scatter + transmittance) for lit materials — replaces the old exponential fog */
export function injectFog(mat, uniforms, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    for (const k of AT_KEYS) shader.uniforms[k] = uniforms[k];
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAtW;').replace('#include <project_vertex>', '#include <project_vertex>\nvec4 atwp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\natwp = instanceMatrix * atwp;\n#endif\nvAtW = (modelMatrix * atwp).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + ATMO_GLSL + '\nvarying vec3 vAtW;').replace('#include <tonemapping_fragment>', '{ vec3 atT, atS; atAerial(cameraPosition, vAtW, atT, atS); gl_FragColor.rgb = gl_FragColor.rgb * atT + atS; }\n#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => key + '_atmo';
  return mat;
}
const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK_TEX.needsUpdate = true;

/** triplanar stone detail (object space) for boulder props */
function injectStone(mat, tex) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tS = { value: tex.map }; shader.uniforms.tSN = { value: tex.normal };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSPos; varying vec3 vSNrm; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvSPos = position; vSNrm = normal;\n#ifdef USE_INSTANCING\nvR0 = instanceMatrix[0].xyz; vR1 = instanceMatrix[1].xyz; vR2 = instanceMatrix[2].xyz;\n#else\nvR0 = vec3(1.0, 0.0, 0.0); vR1 = vec3(0.0, 1.0, 0.0); vR2 = vec3(0.0, 0.0, 1.0);\n#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tS, tSN; varying vec3 vSPos; varying vec3 vSNrm; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sn = normalize(vSNrm); vec3 sw = pow(abs(sn), vec3(6.0)); sw /= (sw.x + sw.y + sw.z); vec3 sp = vSPos * 0.55;
        vec3 sd = texture2D(tS, sp.zy).rgb * sw.x + texture2D(tS, sp.xz).rgb * sw.y + texture2D(tS, sp.xy).rgb * sw.z;
        diffuseColor.rgb *= sd * 1.25;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 sx = texture2D(tSN, sp.zy).xyz * 2.0 - 1.0; vec3 sy = texture2D(tSN, sp.xz).xyz * 2.0 - 1.0; vec3 sz = texture2D(tSN, sp.xy).xyz * 2.0 - 1.0;
        sx = vec3(sx.xy + sn.zy, abs(sx.z) * sn.x); sy = vec3(sy.xy + sn.xz, abs(sy.z) * sn.y); sz = vec3(sz.xy + sn.xy, abs(sz.z) * sn.z);
        vec3 son = normalize(mix(sn, normalize(sx.zyx * sw.x + sy.xzy * sw.y + sz.xyz * sw.z), 0.8));
        mat3 srot = mat3(normalize(vR0), normalize(vR1), normalize(vR2));
        normal = normalize((viewMatrix * vec4(srot * son, 0.0)).xyz);`);
  };
  return mat;
}

function makeTerrainMaterial(planet, tA, tB, tC) {
  const b = planet.biome; const U = planet.uniforms;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tA: { value: tA.map }, tAN: { value: tA.normal }, tB: { value: tB.map }, tBN: { value: tB.normal }, tC: { value: tC.map }, tCN: { value: tC.normal }, tBE: { value: tB.emissive || BLACK_TEX }, uHasBE: { value: tB.emissive ? 1 : 0 }, uTexScale: { value: 1 / 12 }, uR: { value: planet.R }, uLava: { value: b.lava ? 1 : 0 }, uSea: { value: b.sea && !b.lava ? 1 : 0 }, uAlb: { value: b.alb || 1.2 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aMat; varying vec3 vMat; varying vec3 vLPos; varying vec3 vLNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLPos = transformed; vMat = aMat;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvLNrm = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tA, tAN, tB, tBN, tC, tCN, tBE; uniform float uTexScale, uR, uLava, uSea, uHasBE, uAlb;
        varying vec3 vMat; varying vec3 vLPos; varying vec3 vLNrm;
        vec4 tri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
        vec4 triR(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.yz) * w.x + texture2D(t, p.zx) * w.y + texture2D(t, p.yx) * w.z; }
        vec4 triN(sampler2D t, vec3 p, vec3 n, vec3 w) {
          vec4 sx = texture2D(t, p.zy); vec4 sy = texture2D(t, p.xz); vec4 sz = texture2D(t, p.xy);
          float r = (sx.a * w.x + sy.a * w.y + sz.a * w.z - 0.3) / 0.7;
          vec3 tx = sx.xyz * 2.0 - 1.0; vec3 ty = sy.xyz * 2.0 - 1.0; vec3 tz = sz.xyz * 2.0 - 1.0;
          tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
          return vec4(normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z), r);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gn = normalize(vLNrm); vec3 bw = pow(abs(gn), vec3(8.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 m = vMat / max(0.001, vMat.x + vMat.y + vMat.z);
        vec3 p1 = vLPos * uTexScale; vec3 p2 = vLPos * uTexScale * 0.53 + 3.7;
        vec4 sa = vec4(0.5), sb = vec4(0.5), sc = vec4(0.5); vec4 na = vec4(gn, 0.85), nb = na, nc = na;
        if (m.x > 0.002) { sa = mix(tri(tA, p1, bw), triR(tA, p2, bw), 0.45); na = triN(tAN, p1, gn, bw); }
        if (m.y > 0.002) { sb = mix(tri(tB, p1, bw), triR(tB, p2, bw), 0.45); nb = triN(tBN, p1, gn, bw); }
        if (m.z > 0.002) { sc = mix(tri(tC, p1, bw), triR(tC, p2, bw), 0.45); nc = triN(tCN, p1, gn, bw); }
        float hA = (sa.a - 0.3) / 0.7, hB = (sb.a - 0.3) / 0.7, hC = (sc.a - 0.3) / 0.7;
        float ha = m.x > 0.002 ? m.x + hA * 0.7 : -1.0, hb = m.y > 0.002 ? m.y + hB * 0.7 : -1.0, hc = m.z > 0.002 ? m.z + hC * 0.7 : -1.0;
        float ma = max(ha, max(hb, hc)) - 0.22; vec3 w = max(vec3(ha, hb, hc) - ma, 0.0); w /= (w.x + w.y + w.z);
        vec3 det = sa.rgb * w.x + sb.rgb * w.y + sc.rgb * w.z;
        float el = length(vLPos) - uR;
        float strata = 0.5 + 0.5 * sin(el * 1.4 + hB * 5.0 + hA * 2.0);
        det *= mix(1.0, 0.84 + 0.3 * strata, w.y);
        diffuseColor.rgb *= det * uAlb;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(na.a * w.x + nb.a * w.y + nc.a * w.z, 0.05, 1.0);
        if (uSea > 0.5) roughnessFactor *= mix(0.35, 1.0, smoothstep(0.0, 3.0, el));`)
      .replace('#include <normal_fragment_maps>', `
        vec3 wn = normalize(mix(gn, normalize(na.xyz * w.x + nb.xyz * w.y + nc.xyz * w.z), 0.9));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uLava > 0.5) { vec3 em = uHasBE > 0.5 ? pow(tri(tBE, p1, bw).rgb, vec3(1.6)) * 1.6 : smoothstep(0.16, 0.04, hB) * vec3(1.0, 0.42, 0.08) * 2.4; totalEmissiveRadiance += w.y * em; }`);
  };
  injectSun(mat, U.uSunView, 'terrain_v4'); injectFog(mat, U, 'terrain_v4_sun');
  return mat;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export class Planet {
  constructor({ seed = 1, radius = 320, biome = 'earth', detail = 7, navDetail = 5, name = 'Planet', index = 0, center = null, sunDir = null, isMain = true, orbit = 0, parent = null } = {}) {
    this.seed = seed; this.R = radius; this.biomeId = biome; this.biome = BIOMES[biome] || BIOMES.earth;
    this.detail = detail; this.navDetail = navDetail; this.name = name; this.index = index; this.isMain = isMain; this.orbit = orbit; this.parent = parent;
    this.center = center ? center.clone() : new THREE.Vector3(); this.sunDir = sunDir ? sunDir.clone().normalize() : new THREE.Vector3(1, 0.4, 0.6).normalize();
    this.group = new THREE.Group(); this.group.position.copy(this.center);
    this.time = 0; this.focused = false;
    const at = this.biome.scatter || [0.0079, 0.0184, 0.045]; const st = this.biome.atmoStrength;
    this.uniforms = { uTime: { value: 0 }, uSun: { value: this.sunDir }, uCamDist: { value: 500 }, uSunView: { value: new THREE.Vector3(0, 0, 1) }, uHaze: { value: 0 }, uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogDensity: { value: 0 },
      uAtC: { value: this.center }, uAtR: { value: this.R + 0.5 }, uAtRa: { value: this.R * 1.16 }, uAtHr: { value: this.R * 0.035 }, uAtHm: { value: this.R * 0.012 }, uAtBr: { value: new THREE.Vector3(at[0] * st, at[1] * st, at[2] * st) }, uAtBm: { value: (this.biome.mie || 0.004) * st }, uAtI: { value: this.biome.sunI || 20 }, uAtOn: { value: 1 }, uAtSun: { value: this.sunDir }, uAtK: { value: this.biome.aerial || 0.07 } };
  }
  get orbitAlt() { return this.R * 0.16 + 12; }
  generate() {
    const t0 = performance.now();
    const rng = mulberry32(this.seed); this.rng = rng; this.noise = new Simplex(rng); this.noiseOff = [rng() * 100, rng() * 100, rng() * 100];
    const R = this.R;
    this.craters = [];
    const nCr = Math.round((this.biome.palette === 'moon' ? 34 : 16) * (R / 320));
    for (let i = 0; i < nCr; i++) { const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(); const r = 8 + rng() * 26; const depth = 3 + rng() * 7; this.craters.push({ dir: d, r, depth, cosOuter: Math.cos(r * 1.5 / R) }); }
    const nav = buildIcosphere(this.navDetail); const nadj = buildAdjacency(nav.count, nav.faces);
    this.nav = { verts: nav.verts, count: nav.count, adjStart: nadj.start, adjList: nadj.list };
    this.nav.lookup = new SphereLookup(nav.verts, nav.count, nadj.start, nadj.list, 160, 80);
    const rawE = new Float32Array(nav.count);
    for (let i = 0; i < nav.count; i++) rawE[i] = this.rawElev(nav.verts[i * 3], nav.verts[i * 3 + 1], nav.verts[i * 3 + 2]);
    const rawPass = this.computePassable(rawE);
    this._stampArr = new Int32Array(nav.count); this._stamp = 0;
    // ---- spawns (main planet only) ----
    this.spawns = [];
    if (this.isMain) {
      const candidates = [];
      for (let tries = 0; tries < 6000 && candidates.length < 400; tries++) {
        const i = Math.floor(rng() * nav.count); if (!rawPass[i] || rawE[i] < 1.5 || rawE[i] > 9) continue;
        if (nav.verts[i * 3] * this.sunDir.x + nav.verts[i * 3 + 1] * this.sunDir.y + nav.verts[i * 3 + 2] * this.sunDir.z < 0.2) continue;
        candidates.push(i);
      }
      const score = (i) => { _v1.set(nav.verts[i * 3], nav.verts[i * 3 + 1], nav.verts[i * 3 + 2]); const nodes = this.nodesWithin(_v1, 34); let s = 0; for (const n of nodes) if (rawPass[n] && rawE[n] > 1) s++; return s; };
      let bestA = -1, bestS = -1; for (const c of candidates) { const s = score(c); if (s > bestS) { bestS = s; bestA = c; } }
      if (bestA < 0) bestA = 0;
      const aDir = new THREE.Vector3(nav.verts[bestA * 3], nav.verts[bestA * 3 + 1], nav.verts[bestA * 3 + 2]);
      let bestB = -1; bestS = -1;
      for (const c of candidates) { _v2.set(nav.verts[c * 3], nav.verts[c * 3 + 1], nav.verts[c * 3 + 2]); if (_v2.dot(aDir) > Math.cos(1.7)) continue; const s = score(c); if (s > bestS) { bestS = s; bestB = c; } }
      if (bestB < 0) { _v2.copy(this.sunDir).multiplyScalar(0.4).sub(aDir).normalize(); bestB = this.nav.lookup.nearest(_v2.x, _v2.y, _v2.z); }
      const bDir = new THREE.Vector3(nav.verts[bestB * 3], nav.verts[bestB * 3 + 1], nav.verts[bestB * 3 + 2]);
      for (const d of [aDir, bDir]) { const e = clamp(this.rawElev(d.x, d.y, d.z), 2.5, 7); this.spawns.push({ dir: d, elev: e, pos: new THREE.Vector3() }); }
    }
    // ---- metal spots ----
    this.spots = []; const spotDirs = [];
    const addSpot = (d) => { const s = { dir: d.clone(), pos: new THREE.Vector3(), elev: 0, taken: null, index: this.spots.length, planet: this }; this.spots.push(s); spotDirs.push(s.dir); return s; };
    for (const sp of this.spawns) {
      const tan = anyTangent(sp.dir, new THREE.Vector3()); const n = 7; const a0 = rng() * TAU;
      for (let k = 0; k < n; k++) { const ang = a0 + k * TAU / n + (rng() - 0.5) * 0.4; const dist = 14 + rng() * 12; rotateTangent(sp.dir, tan, ang, _v1); moveOnSphere(sp.dir, _v1, dist / R, _v2); addSpot(_v2); }
    }
    const minSpot = Math.cos(13 / R), spawnClear = Math.cos(50 / R);
    const tooClose = (d) => { for (const s of spotDirs) if (s.dot(d) > minSpot) return true; for (const sp of this.spawns) if (sp.dir.dot(d) > spawnClear) return true; return false; };
    let clusters = 0, tries = 0; const targetClusters = Math.max(4, Math.round(30 * (R / 320) * (R / 320) * (this.isMain ? 1 : 1.3)));
    while (clusters < targetClusters && tries++ < 20000) {
      const i = Math.floor(rng() * nav.count); if (!rawPass[i] || rawE[i] < 1.2) continue;
      _v1.set(nav.verts[i * 3], nav.verts[i * 3 + 1], nav.verts[i * 3 + 2]); if (tooClose(_v1)) continue;
      addSpot(_v1); clusters++;
      const extra = 1 + Math.floor(rng() * 3); const tan = anyTangent(_v1, new THREE.Vector3()); const base = _v1.clone();
      for (let k = 0; k < extra; k++) { const ang = rng() * TAU; const dist = 14 + rng() * 6; rotateTangent(base, tan, ang, _v2); moveOnSphere(base, _v2, dist / R, _v3); const ni = this.nav.lookup.nearest(_v3.x, _v3.y, _v3.z); if (!rawPass[ni] || rawE[ni] < 1.2 || tooClose(_v3)) continue; addSpot(_v3); }
    }
    for (const s of this.spots) s.elev = this.elevSpawnFlat(s.dir.x, s.dir.y, s.dir.z);
    this.navElev = new Float32Array(nav.count);
    for (let i = 0; i < nav.count; i++) this.navElev[i] = this.elev(nav.verts[i * 3], nav.verts[i * 3 + 1], nav.verts[i * 3 + 2]);
    this.nav.pass = this.computePassable(this.navElev); this.nav.blocked = new Uint8Array(nav.count);
    // ambient occlusion from local concavity (2-ring mean elevation)
    this.navAO = new Float32Array(nav.count);
    for (let i = 0; i < nav.count; i++) {
      let sum = 0, cnt = 0;
      const AS = this.nav.adjStart, AL = this.nav.adjList;
      for (let k = AS[i], e = AS[i + 1]; k < e; k++) { const j = AL[k]; for (let q = AS[j], qe = AS[j + 1]; q < qe; q++) { sum += this.navElev[AL[q]]; cnt++; } }
      this.navAO[i] = clamp(1 + (this.navElev[i] - sum / cnt) * 0.12, 0.45, 1.08);
    }
    this._g = new Float32Array(nav.count); this._gst = new Int32Array(nav.count); this._came = new Int32Array(nav.count); this._closed = new Int32Array(nav.count); this._pstamp = 0;
    // ---- render mesh ----
    const rm = buildIcosphere(this.detail); const radj = buildAdjacency(rm.count, rm.faces);
    this.rv = rm.verts; this.rcount = rm.count; this.radjStart = radj.start; this.radjList = radj.list; this.rh = new Float32Array(rm.count);
    const pos = new Float32Array(rm.count * 3); const elevArr = new Float32Array(rm.count);
    for (let i = 0; i < rm.count; i++) { const x = rm.verts[i * 3], y = rm.verts[i * 3 + 1], z = rm.verts[i * 3 + 2]; const e = this.elev(x, y, z); elevArr[i] = e; const r = R + e; this.rh[i] = r; pos[i * 3] = x * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = z * r; }
    this.lookup = new SphereLookup(rm.verts, rm.count, radj.start, radj.list, this.detail >= 8 ? 1024 : 512, this.detail >= 8 ? 512 : 256);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(rm.faces, 1)); geo.computeVertexNormals();
    const nrm = geo.getAttribute('normal').array;
    const col = new Float32Array(rm.count * 3); const matW = new Float32Array(rm.count * 3);
    const ramp = RAMPS[this.biome.palette]; const tmp = [0, 0, 0]; const nz = this.noise; const hi = this.biome.high;
    for (let i = 0; i < rm.count; i++) {
      const x = rm.verts[i * 3], y = rm.verts[i * 3 + 1], z = rm.verts[i * 3 + 2];
      const slope = 1 - (nrm[i * 3] * x + nrm[i * 3 + 1] * y + nrm[i * 3 + 2] * z);
      const n1 = nz.noise3(x * 40, y * 40, z * 40), n2 = nz.noise3(x * 9 + 7, y * 9, z * 9);
      const e = elevArr[i];
      rampColor(ramp.stops, e + n2 * 0.9, tmp);
      const rockMix = smoothstep(0.09, 0.22, slope + n1 * 0.02);
      const v = 1 + 0.05 * n1;
      col[i * 3] = lerp(tmp[0] * v, ramp.rock[0] * (1 + 0.06 * n1), rockMix);
      col[i * 3 + 1] = lerp(tmp[1] * v, ramp.rock[1] * (1 + 0.06 * n1), rockMix);
      col[i * 3 + 2] = lerp(tmp[2] * v, ramp.rock[2] * (1 + 0.06 * n1), rockMix);
      const ao = this.aoAtXYZ(x, y, z); const warm = nz.fbm(x * 2.3 + 11, y * 2.3, z * 2.3, 3); const bright = 1 + 0.07 * nz.fbm(x * 1.3 + 5, y * 1.3, z * 1.3, 2);
      col[i * 3] *= ao * bright * (1 + 0.1 * warm); col[i * 3 + 1] *= ao * bright; col[i * 3 + 2] *= ao * bright * (1 - 0.1 * warm);
      const highW = smoothstep(hi[0], hi[1], e + n2 * 1.5);
      matW[i * 3] = (1 - rockMix) * (1 - highW); matW[i * 3 + 1] = rockMix; matW[i * 3 + 2] = (1 - rockMix) * highW;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aMat', new THREE.BufferAttribute(matW, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 40);
    this.terrainGeo = geo;
    for (const sp of this.spawns) this.surfacePoint(sp.dir, 0, sp.pos);
    for (const s of this.spots) this.surfacePoint(s.dir, 0, s.pos);
    this.buildMeshes();
    this.genTime = performance.now() - t0;
  }
  computePassable(elev) {
    const nav = this.nav; const pass = new Uint8Array(nav.count); const R = this.R; const seaLimit = this.biome.sea ? 0.9 : -1e9;
    for (let i = 0; i < nav.count; i++) {
      if (elev[i] < seaLimit) continue; let ok = true; const x = nav.verts[i * 3], y = nav.verts[i * 3 + 1], z = nav.verts[i * 3 + 2];
      for (let k = nav.adjStart[i], e = nav.adjStart[i + 1]; k < e; k++) { const u = nav.adjList[k]; const dx = nav.verts[u * 3] - x, dy = nav.verts[u * 3 + 1] - y, dz = nav.verts[u * 3 + 2] - z; const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * R; if (Math.abs(elev[u] - elev[i]) / dist > 0.62) { ok = false; break; } }
      pass[i] = ok ? 1 : 0;
    }
    return pass;
  }
  rawElev(x, y, z) {
    const nz = this.noise, b = this.biome, o = this.noiseOff, R = this.R;
    const wx = nz.fbm(x * 0.9 + 7.1, y * 0.9, z * 0.9, 2) * 0.4, wy = nz.fbm(x * 0.9, y * 0.9 + 3.3, z * 0.9, 2) * 0.4, wz = nz.fbm(x * 0.9 + 1.7, y * 0.9, z * 0.9 + 5.9, 2) * 0.4;
    const X = x + wx, Y = y + wy, Z = z + wz;
    let c = nz.fbm(X * 1.4 + o[0], Y * 1.4 + o[1], Z * 1.4 + o[2], 5, 2.1, 0.5); c = c * 1.7 + b.landBias; let e = c * 9.0;
    const mmask = smoothstep(0.05, 0.55, c);
    if (mmask > 0) { const r = nz.ridged(X * 3.1 + o[1], Y * 3.1, Z * 3.1 + o[0], 4, 2.2, 0.5); e += r * r * r * 24 * mmask; }
    e += nz.noise3(x * 14, y * 14, z * 14) * 0.5;
    const d1 = nz.noise3(x * 40 + o[2], y * 40, z * 40), d2 = nz.noise3(x * 95, y * 95 + o[0], z * 95);
    e += (d1 * 0.5 + d2 * 0.2) * (0.3 + 0.7 * mmask);
    for (let i = 0; i < this.craters.length; i++) { const cr = this.craters[i]; const d = x * cr.dir.x + y * cr.dir.y + z * cr.dir.z; if (d > cr.cosOuter) { const a = Math.acos(Math.min(1, d)) * R / cr.r; e += craterProfile(a) * cr.depth; } }
    return e;
  }
  elevSpawnFlat(x, y, z) {
    let e = this.rawElev(x, y, z); const R = this.R;
    for (const sp of this.spawns) { const d = x * sp.dir.x + y * sp.dir.y + z * sp.dir.z; if (d > Math.cos(50 / R)) { const a = Math.acos(Math.min(1, d)) * R; const w = 1 - smoothstep(24, 50, a); e = lerp(e, sp.elev, w); } }
    return e;
  }
  elev(x, y, z) {
    let e = this.elevSpawnFlat(x, y, z); const R = this.R; const cosS = Math.cos(12 / R);
    for (let i = 0; i < this.spots.length; i++) { const s = this.spots[i]; const d = x * s.dir.x + y * s.dir.y + z * s.dir.z; if (d > cosS) { const a = Math.acos(Math.min(1, d)) * R; const w = 1 - smoothstep(6, 12, a); e = lerp(e, s.elev, w); } }
    return e;
  }
  heightAt(d) { return this.heightAtXYZ(d.x, d.y, d.z); }
  heightAtXYZ(x, y, z) {
    const v = this.lookup.nearest(x, y, z); const V = this.rv, H = this.rh, S = this.radjStart, L = this.radjList;
    let w = 1 / (1e-5 + (1 - (V[v * 3] * x + V[v * 3 + 1] * y + V[v * 3 + 2] * z))); let ws = w, hs = w * H[v];
    for (let k = S[v], e = S[v + 1]; k < e; k++) { const u = L[k]; w = 1 / (1e-5 + (1 - (V[u * 3] * x + V[u * 3 + 1] * y + V[u * 3 + 2] * z))); ws += w; hs += w * H[u]; }
    return hs / ws;
  }
  aoAtXYZ(x, y, z) {
    const nav = this.nav; const v = nav.lookup.nearest(x, y, z); const V = nav.verts;
    let w = 1 / (1e-4 + (1 - (V[v * 3] * x + V[v * 3 + 1] * y + V[v * 3 + 2] * z))); let ws = w, s = w * this.navAO[v];
    for (let k = nav.adjStart[v], e = nav.adjStart[v + 1]; k < e; k++) { const u = nav.adjList[k]; w = 1 / (1e-4 + (1 - (V[u * 3] * x + V[u * 3 + 1] * y + V[u * 3 + 2] * z))); ws += w; s += w * this.navAO[u]; }
    return s / ws;
  }
  /** world-space point at unit dir + hover above terrain */
  surfacePoint(dir, hover, out) { return out.copy(dir).multiplyScalar(this.heightAt(dir) + hover).add(this.center); }
  localDir(worldPos, out) { return out.copy(worldPos).sub(this.center).normalize(); }
  isWater(dir) { return this.biome.sea && this.heightAt(dir) < this.R + 0.3; }
  navNode(dir) { return this.nav.lookup.nearest(dir.x, dir.y, dir.z); }
  isPassable(dir) { const n = this.navNode(dir); return this.nav.pass[n] === 1 && this.nav.blocked[n] === 0; }
  isPassableNode(n) { return this.nav.pass[n] === 1 && this.nav.blocked[n] === 0; }
  isPassableNodeRaw(n) { return this.nav.pass[n] === 1; }
  nodeDir(n, out) { const V = this.nav.verts; return out.set(V[n * 3], V[n * 3 + 1], V[n * 3 + 2]); }
  nodesWithin(dir, radius) {
    const nav = this.nav; const start = nav.lookup.nearest(dir.x, dir.y, dir.z); const cosR = Math.cos(radius / this.R); const stamp = ++this._stamp; const st = this._stampArr;
    const res = [start]; st[start] = stamp; const q = [start];
    while (q.length) { const n = q.pop(); for (let k = nav.adjStart[n], e = nav.adjStart[n + 1]; k < e; k++) { const u = nav.adjList[k]; if (st[u] === stamp) continue; if (nav.verts[u * 3] * dir.x + nav.verts[u * 3 + 1] * dir.y + nav.verts[u * 3 + 2] * dir.z >= cosR) { st[u] = stamp; res.push(u); q.push(u); } } }
    return res;
  }
  blockCircle(dir, radius, delta) { const nodes = this.nodesWithin(dir, radius); const B = this.nav.blocked; for (const n of nodes) B[n] = Math.max(0, B[n] + delta); }
  nearestOpenNode(n, maxRings = 8) {
    const nav = this.nav; const stamp = ++this._stamp; const st = this._stampArr; let ring = [n]; st[n] = stamp;
    for (let r = 0; r < maxRings; r++) { const next = []; for (const a of ring) { if (this.isPassableNode(a)) return a; for (let k = nav.adjStart[a], e = nav.adjStart[a + 1]; k < e; k++) { const u = nav.adjList[k]; if (st[u] !== stamp) { st[u] = stamp; next.push(u); } } } ring = next; }
    return -1;
  }
  isClear(a, b) {
    const V = this.nav.verts; _v1.set(V[a * 3], V[a * 3 + 1], V[a * 3 + 2]); _v2.set(V[b * 3], V[b * 3 + 1], V[b * 3 + 2]);
    const ang = angleBetween(_v1, _v2); const steps = Math.ceil(ang * this.R / 2.5); tangentToward(_v1, _v2, _v3);
    for (let i = 1; i < steps; i++) { const d = moveOnSphere(_v1, _v3, ang * i / steps, new THREE.Vector3()); if (!this.isPassableNode(this.navNode(d))) return false; }
    return true;
  }
  findPath(fromDir, toDir) {
    const nav = this.nav, V = nav.verts, P = nav.pass, B = nav.blocked, R = this.R;
    const s = nav.lookup.nearest(fromDir.x, fromDir.y, fromDir.z); let e = nav.lookup.nearest(toDir.x, toDir.y, toDir.z); let endExact = true;
    if (!(P[e] && !B[e])) { e = this.nearestOpenNode(e, 10); if (e < 0) return null; endExact = false; }
    if (s === e) return [endExact ? toDir.clone() : this.nodeDir(e, new THREE.Vector3())];
    const stamp = ++this._pstamp; const g = this._g, st = this._gst, came = this._came, closed = this._closed;
    const heap = new MinHeap(); g[s] = 0; st[s] = stamp; came[s] = -1; heap.push(s, 0);
    const ex = V[e * 3], ey = V[e * 3 + 1], ez = V[e * 3 + 2]; let found = false, exp = 0;
    while (heap.size) {
      const n = heap.pop(); if (n === e) { found = true; break; } if (closed[n] === stamp) continue; closed[n] = stamp; if (++exp > 30000) break;
      const nx = V[n * 3], ny = V[n * 3 + 1], nz = V[n * 3 + 2]; const gn = g[n];
      for (let k = nav.adjStart[n], ke = nav.adjStart[n + 1]; k < ke; k++) {
        const u = nav.adjList[k]; if (closed[u] === stamp || !P[u] || B[u]) continue;
        const ux = V[u * 3], uy = V[u * 3 + 1], uz = V[u * 3 + 2]; const dx = ux - nx, dy = uy - ny, dz = uz - nz; const ng = gn + Math.sqrt(dx * dx + dy * dy + dz * dz) * R;
        if (st[u] !== stamp || ng < g[u]) { g[u] = ng; st[u] = stamp; came[u] = n; const hx = ux - ex, hy = uy - ey, hz = uz - ez; heap.push(u, ng + Math.sqrt(hx * hx + hy * hy + hz * hz) * R); }
      }
    }
    if (!found) return null;
    const nodes = []; for (let n = e; n !== -1; n = came[n]) nodes.push(n); nodes.reverse();
    const out = []; let i = 0;
    while (i < nodes.length - 1) { let j = Math.min(nodes.length - 1, i + 14); while (j > i + 1 && !this.isClear(nodes[i], nodes[j])) j--; out.push(this.nodeDir(nodes[j], new THREE.Vector3())); i = j; }
    if (endExact) { if (out.length) out[out.length - 1].copy(toDir); else out.push(toDir.clone()); }
    return out;
  }
  randomPassableDir(rng, out) { for (let t = 0; t < 200; t++) { const i = Math.floor(rng() * this.nav.count); if (this.isPassableNode(i)) return this.nodeDir(i, out); } return this.nodeDir(0, out); }

  // ---------- rendering ----------
  buildMeshes() {
    const R = this.R, b = this.biome; const g = this.group;
    const tex = b.tex.map((k) => getTextureSet(k));
    this.terrain = new THREE.Mesh(this.terrainGeo, makeTerrainMaterial(this, tex[0], tex[1], tex[2]));
    this.terrain.receiveShadow = false; this.terrain.castShadow = false; this.terrain.frustumCulled = true;
    g.add(this.terrain);
    if (b.sea) this.buildWater();
    // physically based sky: single-scattering shell, additive over space, occluded by terrain
    const U = this.uniforms;
    const sm = new THREE.ShaderMaterial({ uniforms: atmoUniformsOf(U), side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: ATMO_GLSL + `
        varying vec3 vW;
        void main(){ vec3 ro = cameraPosition - uAtC; vec3 rd = normalize(vW - cameraPosition); vec3 col = atSky(ro, rd); gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 96, 64), sm); this.sky.frustumCulled = false; this.sky.renderOrder = 5; this.sky.layers.set(1); g.add(this.sky);
    if (b.clouds) this.buildClouds();
    this.buildProps(tex);
    if (b.props === 'earth' || b.props === 'desert') this.grass = new GrassField(this, b.props === 'earth' ? 'green' : 'dry', { sun: injectSun, fog: injectFog });
  }
  updateGrass(anchorWorld, camPos, time, visible) { if (this.grass) this.grass.update(anchorWorld, camPos, time, visible); }
  buildWater() {
    const R = this.R, b = this.biome; const ico = buildIcosphere(6);
    const pos = new Float32Array(ico.count * 3); const depth = new Float32Array(ico.count);
    for (let i = 0; i < ico.count; i++) { const x = ico.verts[i * 3], y = ico.verts[i * 3 + 1], z = ico.verts[i * 3 + 2]; pos[i * 3] = x * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = z * R; depth[i] = R - this.heightAtXYZ(x, y, z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(ico.verts, 3)); geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1)); geo.setIndex(new THREE.BufferAttribute(ico.faces, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 2);
    const wm = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTime: this.uniforms.uTime, uSun: this.uniforms.uSun, uColor: { value: new THREE.Color(...b.seaColor) }, uDeep: { value: new THREE.Color(...b.deepColor) }, uSky: { value: new THREE.Color(...b.atmo) }, uLava: { value: b.lava ? 1 : 0 }, tWN: { value: waterNormalTexture() } }, atmoUniformsOf(this.uniforms)),
      transparent: !b.lava, depthWrite: true,
      vertexShader: 'attribute float aDepth; varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vL = position; vD = aDepth; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: ATMO_GLSL + `uniform vec3 uColor, uDeep, uSky, uSun; uniform float uTime, uLava; uniform sampler2D tWN; varying vec3 vN; varying vec3 vW; varying vec3 vL; varying float vD;
        vec3 wnSample(vec3 p, vec3 n, vec3 w) { vec3 sx = texture2D(tWN, p.zy).xyz * 2.0 - 1.0; vec3 sy = texture2D(tWN, p.xz).xyz * 2.0 - 1.0; vec3 sz = texture2D(tWN, p.xy).xyz * 2.0 - 1.0; sx = vec3(sx.xy + n.zy, abs(sx.z) * n.x); sy = vec3(sy.xy + n.xz, abs(sy.z) * n.y); sz = vec3(sz.xy + n.xy, abs(sz.z) * n.z); return normalize(sx.zyx * w.x + sy.xzy * w.y + sz.xyz * w.z); }
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float noise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
          float w2 = noise(vL*1.1 - uTime*0.3);
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 n1 = wnSample(vL * 0.03 + vec3(uTime * 0.012, 0.0, uTime * 0.009), n, bw); vec3 n2 = wnSample(vL * 0.11 - vec3(uTime * 0.02, uTime * 0.007, 0.0), n, bw);
          vec3 np = normalize(mix(n, normalize(n1 * 0.5 + n2 * 0.8), 0.16));
          float NoV = max(dot(np, v), 0.0); float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
          float diff = max(dot(n, uSun), 0.0);
          vec3 h = normalize(uSun + v); float NoH = max(dot(np, h), 0.0); float spec = pow(NoH, 700.0) * 3.0 + pow(NoH, 48.0) * 0.06;
          float depth = max(vD, 0.0);
          if (uLava > 0.5) {
            float crack = noise(vL*0.35 + uTime*0.08); crack = smoothstep(0.3,0.8,crack + 0.35*(w2-0.5));
            float crust = smoothstep(0.35, 0.65, noise(vL * 0.9 + 3.0) + 0.3 * noise(vL * 3.5));
            vec3 col = mix(uDeep, uColor, crack) * 0.75 + vec3(1.0, 0.7, 0.28) * pow(crack, 3.0) * 1.1;
            col = mix(col, vec3(0.06, 0.04, 0.035) * (0.3 + 0.7 * diff), crust * 0.8);
            col = mix(col * 0.55, col, smoothstep(0.0, 3.0, depth));
            gl_FragColor = vec4(col, 1.0);
          } else {
            // reflection of the real scattered sky along the reflected ray (kept above the horizon)
            vec3 r = reflect(-v, np); float rn = dot(r, n); if (rn < 0.03) r = normalize(r + n * (0.03 - rn));
            vec3 ro = n * (uAtR + 0.05); vec3 skyR = atSky(ro, r) + vec3(0.004, 0.005, 0.009);
            float shallow = 1.0 - smoothstep(0.0, 6.0, depth);
            vec3 shallowCol = uColor * 1.1 + vec3(0.04, 0.10, 0.06);
            vec3 body = mix(uDeep, uColor, 0.35); body = mix(body, shallowCol, shallow * 0.7);
            float foamN = noise(vL*1.7 + uTime*0.35) + 0.5*noise(vL*4.0 - uTime*0.6);
            float foam = (1.0 - smoothstep(0.0, 0.9, depth + (foamN - 0.75) * 0.9)) * 0.7;
            vec3 col = body * (0.05 + 0.55 * diff) * (1.0 - fres) + skyR * fres * 0.9 + vec3(1.0) * spec * step(0.001, diff) + vec3(0.85) * foam * (0.2 + 0.8 * diff);
            float alpha = mix(0.55, 0.96, smoothstep(0.0, 4.0, depth)) + foam * 0.4; alpha = mix(alpha, 1.0, fres);
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
          }
          { vec3 atT, atS; atAerial(cameraPosition, vW, atT, atS); gl_FragColor.rgb = gl_FragColor.rgb * atT + atS; }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    this.water = new THREE.Mesh(geo, wm); this.water.frustumCulled = true; this.water.renderOrder = 1; this.group.add(this.water);
  }
  buildClouds() {
    const R = this.R, b = this.biome; const tex = cloudTexture(this.noise, this.noiseOff, b.clouds);
    const mk = (radius, opacity, alphaTest) => { const cm = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest, opacity }); injectSun(cm, this.uniforms.uSunView, 'clouds'); injectFog(cm, this.uniforms, 'clouds_sun'); const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), cm); m.frustumCulled = false; m.renderOrder = 3; return m; };
    this.clouds = mk(R * 1.085, 0.92, 0.2); this.clouds.rotation.y = this.rng() * TAU; this.clouds.layers.set(1); this.group.add(this.clouds);
    this.clouds2 = mk(R * 1.105, 0.4, 0.3); this.clouds2.rotation.y = this.rng() * TAU + 2; this.clouds2.rotation.z = 0.4; this.group.add(this.clouds2);
    this.cloudBase = 0.92;
  }
  buildProps(tex) {
    const b = this.biome; const R = this.R; const rng = this.rng; const nav = this.nav; const area = (R / 320) * (R / 320);
    const kinds = [];
    const jitter = (g, amt) => { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rng() - .5) * amt, p.getY(i) + (rng() - .5) * amt, p.getZ(i) + (rng() - .5) * amt); g.computeVertexNormals(); return g; };
    const colorize = (g, c) => { const n = g.getAttribute('position').count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
    const rockGeo = () => { const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed(); g.deleteAttribute('uv'); jitter(g, 0.42); g.translate(0, 0.35, 0); const rc = RAMPS[b.palette].rock; return colorize(g, [rc[0] * 1.15, rc[1] * 1.15, rc[2] * 1.15]); };
    if (b.props === 'earth') {
      const trunk = colorize(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 5).toNonIndexed(), [0.28, 0.18, 0.1]); trunk.deleteAttribute('uv'); trunk.translate(0, 0.75, 0);
      const cross = new THREE.BufferGeometry(); { const pos = [], uv = [], nrm = []; const hw = 1.35, y0 = 0.25, y1 = 5.6; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; const dx = Math.cos(a) * hw, dz = Math.sin(a) * hw; const q = [[-dx, y0, -dz, 0, 0], [dx, y0, dz, 0.5, 0], [dx, y1, dz, 0.5, 1], [-dx, y0, -dz, 0, 0], [dx, y1, dz, 0.5, 1], [-dx, y1, -dz, 0, 1]]; for (const [x, y, z, u, v] of q) { pos.push(x, y, z); uv.push(u, v); const nn = new THREE.Vector3(x * 0.5, 0.85, z * 0.5).normalize(); nrm.push(nn.x, nn.y, nn.z); } }
        { const hw2 = 1.45, yt = 2.6; const q = [[-hw2, yt, -hw2, 0.5, 0], [hw2, yt, -hw2, 1, 0], [hw2, yt, hw2, 1, 1], [-hw2, yt, -hw2, 0.5, 0], [hw2, yt, hw2, 1, 1], [-hw2, yt, hw2, 0.5, 1]]; for (const [x, y, z, u, v] of q) { pos.push(x, y, z); uv.push(u, v); nrm.push(0, 1, 0); } } cross.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cross.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cross.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); }
      const forest = (d) => this.noise.fbm(d.x * 5 + 3, d.y * 5, d.z * 5, 3);
      kinds.push({ geo: trunk, canopy: cross, canopyTex: 'conifer', bark: true, count: Math.round(4200 * area), tries: 60, test: (e, s, d) => e > 1.6 && e < 13 && s < 0.4 && forest(d) > 0.04, scale: [0.7, 1.6], stretch: 1, tree: true });
      const trunk2 = colorize(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 7).toNonIndexed(), [0.3, 0.2, 0.12]); trunk2.deleteAttribute('uv'); trunk2.translate(0, 1.3, 0);
      const branches = []; for (let i = 0; i < 4; i++) { const br = colorize(new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5).toNonIndexed(), [0.28, 0.19, 0.11]); br.deleteAttribute('uv'); br.translate(0, 0.8, 0); br.rotateZ(0.7 + rng() * 0.5); br.rotateY(i * Math.PI / 2 + rng() * 0.6); br.translate(0, 2.2 + rng() * 0.5, 0); branches.push(br); }
      const cards = new THREE.BufferGeometry(); { const pos = [], uv = [], nrm = []; for (let i = 0; i < 14; i++) { const cx = (rng() - 0.5) * 1.5, cy = 3.2 + (rng() - 0.5) * 1.3, cz = (rng() - 0.5) * 1.5; const sz = 1.3 + rng() * 0.7; const ax = rng() * Math.PI, ay = rng() * Math.PI * 2; const u = new THREE.Vector3(Math.cos(ay), 0, Math.sin(ay)); const vv = new THREE.Vector3(0, Math.cos(ax), Math.sin(ax)); const nn = new THREE.Vector3(cx, cy - 3.1 + 0.8, cz).normalize(); const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]; for (const [a, b2] of corners) { pos.push(cx + (u.x * a + vv.x * b2) * sz / 2, cy + (u.y * a + vv.y * b2) * sz / 2, cz + (u.z * a + vv.z * b2) * sz / 2); uv.push(a * 0.5 + 0.5, b2 * 0.5 + 0.5); nrm.push(nn.x, nn.y, nn.z); } } cards.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cards.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cards.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); }
      kinds.push({ geo: mergeGeometries([trunk2, ...branches], false), canopy: cards, bark: true, count: Math.round(2600 * area), tries: 40, test: (e, s, d) => e > 1.4 && e < 10 && s < 0.3 && forest(d) > -0.04, scale: [0.8, 1.5], stretch: 1, tree: true });
      const bush = colorize(jitter(new THREE.IcosahedronGeometry(0.8, 1).toNonIndexed(), 0.3), [0.2, 0.38, 0.13]); bush.deleteAttribute('uv'); bush.translate(0, 0.45, 0);
      kinds.push({ geo: bush, count: Math.round(2400 * area), test: (e, s) => e > 1.2 && e < 11 && s < 0.45, scale: [0.6, 1.4], stretch: 0.8, tree: true });
      kinds.push({ geo: rockGeo(), count: Math.round(1200 * area), test: (e, s) => e > 1.0 && (s > 0.25 || rng() < 0.2), scale: [0.6, 3.2], stretch: 0.7, stone: true });
    } else if (b.props === 'ice') {
      const cr = colorize(new THREE.ConeGeometry(0.45, 3.2, 6).toNonIndexed(), [0.6, 0.82, 1.0]); cr.deleteAttribute('uv'); cr.translate(0, 1.4, 0);
      kinds.push({ geo: cr, count: Math.round(1100 * area), test: (e, s) => e > 1.2 && s < 0.5, scale: [0.6, 2.4], stretch: 1.4 });
      kinds.push({ geo: rockGeo(), count: Math.round(900 * area), test: (e, s) => e > 1.0 && (s > 0.12 || rng() < 0.2), scale: [0.6, 2.8], stretch: 0.7, stone: true });
    } else if (b.props === 'lava') {
      const col = colorize(new THREE.CylinderGeometry(0.55, 0.7, 2.6, 6).toNonIndexed(), [0.16, 0.13, 0.13]); col.deleteAttribute('uv'); col.translate(0, 1.0, 0);
      kinds.push({ geo: col, count: Math.round(900 * area), test: (e, s) => e > 1.2 && s < 0.45, scale: [0.6, 2.2], stretch: 1.3 });
      kinds.push({ geo: rockGeo(), count: Math.round(1400 * area), test: (e, s) => e > 1.0, scale: [0.6, 3.0], stretch: 0.7, stone: true });
    } else if (b.props === 'desert') {
      const arm = colorize(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 6).toNonIndexed(), [0.3, 0.5, 0.25]); arm.deleteAttribute('uv'); arm.rotateZ(Math.PI / 2); arm.translate(0.5, 1.4, 0);
      const body = colorize(new THREE.CylinderGeometry(0.28, 0.34, 2.6, 7).toNonIndexed(), [0.3, 0.52, 0.26]); body.deleteAttribute('uv'); body.translate(0, 1.3, 0);
      kinds.push({ geo: mergeGeometries([body, arm], false), count: Math.round(700 * area), test: (e, s) => e > 1.5 && s < 0.3, scale: [0.6, 1.5], stretch: 1.2 });
      kinds.push({ geo: rockGeo(), count: Math.round(1300 * area), test: (e, s) => e > 1.0 && (s > 0.1 || rng() < 0.2), scale: [0.6, 3.4], stretch: 0.7, stone: true });
    } else {
      kinds.push({ geo: rockGeo(), count: Math.round(2600 * area), test: (e, s) => e > -5, scale: [0.5, 3.6], stretch: 0.7, stone: true });
    }
    const cosSpot = Math.cos(11 / R), cosSpawn = Math.cos(48 / R);
    this.props = [];
    for (const k of kinds) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0 });
      if (k.stone) injectStone(mat, tex[1]); else if (k.bark) injectStone(mat, getTextureSet('bark'));
      const pk = k.stone ? 'props_stone' : (k.bark ? 'props_bark' : 'props'); injectSun(mat, this.uniforms.uSunView, pk); injectFog(mat, this.uniforms, pk + '_sun');
      const mesh = new THREE.InstancedMesh(k.geo, mat, k.count); let n = 0; let tries = 0;
      let canopyMesh = null;
      if (k.canopy) { const lm = new THREE.MeshStandardMaterial({ map: k.canopyTex === 'conifer' ? coniferTexture() : leafClusterTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }); injectSun(lm, this.uniforms.uSunView, 'leaves'); injectFog(lm, this.uniforms, 'leaves_sun'); canopyMesh = new THREE.InstancedMesh(k.canopy, lm, k.count); canopyMesh.layers.set(1); }
      const dir = new THREE.Vector3(), tan = new THREE.Vector3(), pos = new THREE.Vector3();
      while (n < k.count && tries++ < k.count * (k.tries || 8)) {
        const i = Math.floor(rng() * nav.count); this.nodeDir(i, dir);
        const e = this.navElev[i]; let slope = 0;
        const spacing = 2 * Math.PI * R / 10242 * 32; for (let q = nav.adjStart[i], qe = nav.adjStart[i + 1]; q < qe; q++) { const u = nav.adjList[q]; slope = Math.max(slope, Math.abs(this.navElev[u] - e) / spacing); }
        if (!k.test(e, slope, dir)) continue;
        let bad = false; for (const s of this.spots) if (s.dir.dot(dir) > cosSpot) { bad = true; break; } if (bad) continue;
        for (const sp of this.spawns) if (sp.dir.dot(dir) > cosSpawn) { bad = true; break; } if (bad) continue;
        rotateTangent(dir, anyTangent(dir, _v1), rng() * TAU, tan); moveOnSphere(dir, tan, (rng() * 2.4) / R, dir);
        const h = this.heightAt(dir); pos.copy(dir).multiplyScalar(h - 0.15);
        rotateTangent(dir, anyTangent(dir, _v1), rng() * TAU, tan); frameQuat(dir, tan, _q);
        const sc = k.scale[0] + rng() * (k.scale[1] - k.scale[0]); _s.set(sc, sc * (k.stretch + rng() * 0.4), sc); _m.compose(pos, _q, _s); mesh.setMatrixAt(n, _m); if (canopyMesh) canopyMesh.setMatrixAt(n, _m);
        const v = 0.8 + rng() * 0.4; const tc = k.tree ? new THREE.Color(0.75 + rng() * 0.5, 0.85 + rng() * 0.3, 0.7 + rng() * 0.4) : new THREE.Color(v, v * (0.95 + rng() * 0.1), v); mesh.setColorAt(n, tc); if (canopyMesh) canopyMesh.setColorAt(n, tc); n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !!k.tree; mesh.receiveShadow = true; mesh.frustumCulled = true; k.geo.computeBoundingSphere(); mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 40);
      this.group.add(mesh); this.props.push(mesh);
      if (canopyMesh) { canopyMesh.count = n; canopyMesh.instanceMatrix.needsUpdate = true; if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true; canopyMesh.castShadow = true; canopyMesh.receiveShadow = true; canopyMesh.frustumCulled = true; canopyMesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 40); this.group.add(canopyMesh); this.props.push(canopyMesh); }
    }
  }
  setFocus(f) {
    this.focused = f; this.terrain.castShadow = f; this.terrain.receiveShadow = f;
    for (const p of this.props) { p.castShadow = f; p.receiveShadow = f; }
    if (this.clouds) this.clouds.castShadow = f;
  }
  update(dt, camera) {
    this.time += dt; this.uniforms.uTime.value = this.time;
    const d = camera.position.distanceTo(this.center); const alt = d - this.R; this.uniforms.uCamDist.value = d;
    this.uniforms.uSunView.value.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
    if (this.clouds) {
      this.clouds.rotation.y += dt * 0.003; this.clouds2.rotation.y += dt * 0.0045;
      const o = smoothstep(60, 240, alt); this.clouds.material.opacity = o * this.cloudBase; this.clouds2.material.opacity = o * 0.4; this.clouds.visible = o > 0.02; this.clouds2.visible = o > 0.02; if (this.focused) this.clouds.castShadow = o > 0.3;
    }
    this.uniforms.uHaze.value = smoothstep(90, 6, alt);
  }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.shared) o.material.dispose(); }); }
}
