import * as THREE from 'three';
import { detailTexture, getAnisotropy } from './textures.js';

/** Real (photogrammetry, CC0) texture sets packed into the game's two-texture layout:
 *  map = albedo*AO (rgb) + height (a),  normal = normalGL (rgb) + roughness (a).
 *  Falls back to the procedural generator when a set is unavailable (offline / artifact without embedded data). */
const REAL = new Map();
export const TEX_KINDS = ['grass', 'rock', 'sand', 'snow', 'dust', 'ice', 'crust', 'panel', 'bark'];
/** which maps each packed set ships with (see tools/fetch_textures.py) — avoids probing for files that do not exist */
const MAPS = { grass: 'color normal rough ao height', rock: 'color normal rough ao height', sand: 'color normal rough ao height', snow: 'color normal rough ao height', dust: 'color normal rough ao height', ice: 'color normal rough height', crust: 'color normal rough height emission', panel: 'color normal rough height', bark: 'color normal rough ao height' };
export function getTextureSet(kind) { return REAL.get(kind) || detailTexture(kind === 'bark' ? 'rock' : kind); }
export function hasRealTexture(kind) { return REAL.has(kind); }
export function realTextureCount() { return REAL.size; }
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + src.slice(0, 40))); im.src = src; }); }
export async function loadRealTextures(kinds = TEX_KINDS, onProgress) {
  const data = (typeof window !== 'undefined' && window.__TEXDATA) || null;
  if (!data && location.protocol === 'file:') return REAL;
  for (const kind of kinds) {
    try {
      const src = (m) => (data && data[kind] ? data[kind][m] : `assets/tex/${kind}/${m}.jpg`);
      if (data && !data[kind]) continue;
      const avail = (MAPS[kind] || 'color normal rough ao height').split(' ');
      const [col, nrm, rgh, ao, hgt, emi] = await Promise.all(['color', 'normal', 'rough', 'ao', 'height', 'emission'].map((m) => (!avail.includes(m) || (data && data[kind] && !data[kind][m])) ? Promise.resolve(null) : loadImage(src(m)).catch(() => null)));
      if (!col || !nrm) continue;
      REAL.set(kind, pack(col, nrm, rgh, ao, hgt, emi)); if (onProgress) onProgress(kind, REAL.size);
    } catch (e) { /* keep procedural fallback */ }
  }
  return REAL;
}
function pack(col, nrm, rgh, ao, hgt, emi) {
  const size = Math.min(1024, col.width); const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const grab = (img) => { if (!img) return null; ctx.clearRect(0, 0, size, size); ctx.drawImage(img, 0, 0, size, size); return ctx.getImageData(0, 0, size, size).data; };
  const c = grab(col), a = grab(ao), h = grab(hgt), n = grab(nrm), r = grab(rgh), e = grab(emi);
  const out = ctx.createImageData(size, size), no = ctx.createImageData(size, size); const n2 = size * size;
  for (let i = 0; i < n2; i++) {
    const i4 = i * 4; const aoF = a ? Math.pow(a[i4] / 255, 0.85) : 1;
    out.data[i4] = c[i4] * aoF; out.data[i4 + 1] = c[i4 + 1] * aoF; out.data[i4 + 2] = c[i4 + 2] * aoF; out.data[i4 + 3] = (0.3 + 0.7 * (h ? h[i4] / 255 : 0.5)) * 255;
    no.data[i4] = n[i4]; no.data[i4 + 1] = n[i4 + 1]; no.data[i4 + 2] = n[i4 + 2]; no.data[i4 + 3] = (0.3 + 0.7 * (r ? r[i4] / 255 : 0.8)) * 255;
  }
  const cm = document.createElement('canvas'); cm.width = cm.height = size; cm.getContext('2d').putImageData(out, 0, 0);
  const cn = document.createElement('canvas'); cn.width = cn.height = size; cn.getContext('2d').putImageData(no, 0, 0);
  const mk = (canvas, srgb) => { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = getAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; return t; };
  const res = { map: mk(cm, true), normal: mk(cn, false), real: true };
  if (e) { const ce = document.createElement('canvas'); ce.width = ce.height = size; const ectx = ce.getContext('2d'); ectx.drawImage(emi, 0, 0, size, size); res.emissive = mk(ce, true); }
  return res;
}
