import * as THREE from 'three';
import { STYLE_U } from './style.js';
import { injectFog } from './planet.js';
import { frameQuat, anyTangent, clamp, lerp } from './util.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();

function instancedQuad(cap) {
  const base = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry();
  g.setIndex(base.index); g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  g.instanceCount = cap; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7); return g;
}
function iattr(g, name, cap, size) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; }

class GPUParticles {
  constructor(cap, { additive = true, sharp = false, renderOrder = 20 } = {}) {
    this.cap = cap; this.head = 0; this.dirty = false; this.time = 0; this.centerFor = null;
    const g = instancedQuad(cap);
    this.aPos0 = iattr(g, 'aPos0', cap, 3); this.aVel = iattr(g, 'aVel', cap, 3); this.aInfo = iattr(g, 'aInfo', cap, 4); this.aColor = iattr(g, 'aColor', cap, 3); this.aExtra = iattr(g, 'aExtra', cap, 3); this.aCenter = iattr(g, 'aCenter', cap, 3);
    this.uniforms = { uFxGain: STYLE_U.uStFxGain, uFxTint: STYLE_U.uStFxTint, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `uniform float uTime; attribute vec3 aPos0; attribute vec3 aVel; attribute vec4 aInfo; attribute vec3 aColor; attribute vec3 aExtra; attribute vec3 aCenter;
        varying vec2 vUv; varying vec4 vColor;
        void main(){ vUv = uv; float t = uTime - aInfo.x; float life = aInfo.y;
          if (t < 0.0 || t >= life || life <= 0.0) { gl_Position = vec4(0.0,0.0,-10.0,1.0); vColor = vec4(0.0); return; }
          float k = aInfo.w; float m = k > 0.001 ? (1.0 - exp(-k*t))/k : t;
          vec3 gdir = normalize(aCenter - aPos0);
          vec3 p = aPos0 + aVel*m + gdir*(0.5*aExtra.x*t*t);
          float f = t/life; float size = aInfo.z * (1.0 + f*aExtra.y);
          float ang = aExtra.z * f; float cs = cos(ang), sn = sin(ang);
          vec2 off = vec2(position.x*cs - position.y*sn, position.x*sn + position.y*cs) * size;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); mv.xy += off; gl_Position = projectionMatrix * mv;
          float fade = (1.0 - smoothstep(0.5, 1.0, f)) * smoothstep(0.0, 0.03, f); vColor = vec4(aColor, fade); }`,
      fragmentShader: additive
        ? `uniform vec3 uFxTint; uniform float uFxGain; varying vec2 vUv; varying vec4 vColor; void main(){ vec2 d = vUv - 0.5; float r = length(d)*2.0; float a = pow(max(0.0, 1.0 - r), ${sharp ? '0.8' : '2.0'}); gl_FragColor = vec4(vColor.rgb * uFxTint * uFxGain * 2.2, a * vColor.a); }`
        : `uniform vec3 uFxTint; uniform float uFxGain; varying vec2 vUv; varying vec4 vColor; void main(){ vec2 d = vUv - 0.5; float r = length(d)*2.0; float a = pow(max(0.0, 1.0 - r), 1.6); gl_FragColor = vec4(vColor.rgb * uFxTint * uFxGain, a * vColor.a * 0.7); }`,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder;
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, drag, grav, grow, spin, center) {
    const i = this.head; this.head = (i + 1) % this.cap;
    const c = center || (this.centerFor ? this.centerFor(x, y, z) : null);
    this.aPos0.setXYZ(i, x, y, z); this.aVel.setXYZ(i, vx, vy, vz); this.aInfo.setXYZW(i, this.time, life, size, drag); this.aColor.setXYZ(i, r, g, b); this.aExtra.setXYZ(i, grav, grow, spin || 0);
    this.aCenter.setXYZ(i, c ? c.x : 0, c ? c.y : 0, c ? c.z : 0); this.dirty = true;
  }
  update(time) {
    this.time = time; this.uniforms.uTime.value = time;
    if (this.dirty) { this.aPos0.needsUpdate = this.aVel.needsUpdate = this.aInfo.needsUpdate = this.aColor.needsUpdate = this.aExtra.needsUpdate = this.aCenter.needsUpdate = true; this.dirty = false; }
  }
}
class InstPool {
  constructor(geo, mat, cap, opts = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.cap = cap; this.n = 0;
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (opts.color !== false) { this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    if (opts.renderOrder) this.mesh.renderOrder = opts.renderOrder; this.mesh.castShadow = !!opts.shadow;
  }
  begin() { this.n = 0; }
  add(matrix, r, g, b) { if (this.n >= this.cap) return; const i = this.n++; this.mesh.setMatrixAt(i, matrix); if (this.mesh.instanceColor) this.mesh.instanceColor.setXYZ(i, r, g, b); }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

// ---------- icons ----------
export const ICONS = ['commander', 'bot', 'vehicle', 'air', 'fighter', 'bomber', 'gunship', 'fab', 'structure', 'factory', 'extractor', 'energy', 'tower', 'aa', 'artillery', 'titan', 'orbital', 'nuke', 'antinuke', 'teleporter'];
export function drawGlyph(ctx, name, cx, cy, s, color, outline = '#000') {
  const r = s * 0.36;
  const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(cx + p[0] * r, cy + p[1] * r) : ctx.moveTo(cx + p[0] * r, cy + p[1] * r)); ctx.closePath(); };
  const hex = () => { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; p.push([Math.cos(a), Math.sin(a)]); } poly(p); };
  const star = (n, inner) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n; const rr = i % 2 ? inner : 1; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } poly(p); };
  const chevron = () => poly([[0, -1], [1, 0.75], [0.55, 0.9], [0, 0.35], [-0.55, 0.9], [-1, 0.75]]);
  const circle = (rr) => { ctx.beginPath(); ctx.arc(cx, cy, r * rr, 0, Math.PI * 2); ctx.closePath(); };
  const shape = () => {
    switch (name) {
      case 'commander': star(5, 0.5); break;
      case 'bot': poly([[0, -1], [1, 0.85], [-1, 0.85]]); break;
      case 'vehicle': case 'aa': poly([[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]]); break;
      case 'air': case 'fighter': case 'bomber': case 'gunship': chevron(); break;
      case 'fab': case 'orbital': case 'nuke': circle(1); break;
      case 'teleporter': circle(1); break;
      case 'titan': star(8, 0.62); break;
      default: hex();
    }
  };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  shape(); ctx.strokeStyle = outline; ctx.lineWidth = s * 0.14; ctx.stroke();
  shape(); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = outline; ctx.strokeStyle = outline; ctx.lineWidth = s * 0.09;
  const inner = r * 0.5;
  if (name === 'fab' || name === 'factory') { ctx.beginPath(); ctx.moveTo(cx - inner, cy); ctx.lineTo(cx + inner, cy); ctx.stroke(); if (name === 'fab') { ctx.beginPath(); ctx.moveTo(cx, cy - inner); ctx.lineTo(cx, cy + inner); ctx.stroke(); } }
  if (name === 'extractor' || name === 'tower') { ctx.beginPath(); ctx.arc(cx, cy, name === 'tower' ? r * 0.22 : r * 0.38, 0, Math.PI * 2); ctx.fill(); }
  if (name === 'energy') { ctx.beginPath(); ctx.moveTo(cx + r * 0.15, cy - r * 0.55); ctx.lineTo(cx - r * 0.25, cy + r * 0.05); ctx.lineTo(cx + r * 0.1, cy + r * 0.05); ctx.lineTo(cx - r * 0.15, cy + r * 0.6); ctx.stroke(); }
  if (name === 'aa' || name === 'artillery') { ctx.beginPath(); ctx.moveTo(cx - inner * 0.8, cy + inner * 0.5); ctx.lineTo(cx, cy - inner * 0.6); ctx.lineTo(cx + inner * 0.8, cy + inner * 0.5); ctx.stroke(); }
  if (name === 'bomber') { ctx.beginPath(); ctx.arc(cx, cy + r * 0.45, r * 0.18, 0, Math.PI * 2); ctx.fill(); }
  if (name === 'gunship') { ctx.beginPath(); ctx.moveTo(cx - inner * 0.7, cy + r * 0.45); ctx.lineTo(cx + inner * 0.7, cy + r * 0.45); ctx.stroke(); }
  if (name === 'fighter') { ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.2); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke(); }
  if (name === 'orbital') { ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.95, r * 0.35, -0.5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill(); }
  if (name === 'nuke') { for (let k = 0; k < 3; k++) { const a0 = -Math.PI / 2 + k * Math.PI * 2 / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.8, a0 - 0.5, a0 + 0.5); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill(); }
  if (name === 'antinuke') { ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - r * 0.25, cy + r * 0.1); ctx.lineTo(cx, cy - r * 0.25); ctx.lineTo(cx + r * 0.25, cy + r * 0.1); ctx.stroke(); }
  if (name === 'teleporter') { ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
export function iconCanvas(name, color, size = 40) { const c = document.createElement('canvas'); c.width = size; c.height = size; const ctx = c.getContext('2d'); drawGlyph(ctx, name, size / 2, size / 2, size, color, 'rgba(0,0,0,0.85)'); return c; }
function makeAtlas() {
  const cell = 64; const c = document.createElement('canvas'); c.width = cell * 8; c.height = cell * 4; const ctx = c.getContext('2d');
  ICONS.forEach((name, i) => { const ix = i % 8, iy = Math.floor(i / 8); drawGlyph(ctx, name, ix * cell + cell / 2, (3 - iy) * cell + cell / 2, cell, '#fff', '#000'); });
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; return tex;
}
class IconRenderer {
  constructor(cap) {
    this.cap = cap; this.n = 0; const g = instancedQuad(cap);
    this.aPos = iattr(g, 'aPos', cap, 3); this.aIcon = iattr(g, 'aIcon', cap, 1); this.aColor = iattr(g, 'aColor', cap, 3); this.aSel = iattr(g, 'aSel', cap, 1); this.aSize = iattr(g, 'aSize', cap, 1);
    this.uniforms = { uRes: { value: new THREE.Vector2(1, 1) }, uAtlas: { value: makeAtlas() }, uAlpha: { value: 1 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `attribute vec3 aPos; attribute float aIcon; attribute vec3 aColor; attribute float aSel; attribute float aSize; uniform vec2 uRes;
        varying vec2 vUv; varying vec3 vC; varying float vSel;
        void main(){ vec4 c = projectionMatrix * modelViewMatrix * vec4(aPos, 1.0);
          if (aSize <= 0.0) { gl_Position = vec4(0.0,0.0,-10.0,1.0); return; }
          vec2 px = position.xy * aSize * (1.0 + aSel*0.2); c.xy += px / uRes * 2.0 * c.w; gl_Position = c;
          float ix = mod(aIcon, 8.0); float iy = floor(aIcon / 8.0); vUv = (vec2(ix, iy) + uv) / vec2(8.0, 4.0); vC = aColor; vSel = aSel; }`,
      fragmentShader: `uniform sampler2D uAtlas; uniform float uAlpha; varying vec2 vUv; varying vec3 vC; varying float vSel;
        void main(){ vec4 t = texture2D(uAtlas, vUv); vec3 col = mix(vC, vec3(1.0), vSel*0.75); gl_FragColor = vec4(col * t.rgb, t.a * uAlpha); }` });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 100;
  }
  begin() { this.n = 0; }
  add(p, icon, color, sel, size) { if (this.n >= this.cap) return; const i = this.n++; this.aPos.setXYZ(i, p.x, p.y, p.z); this.aIcon.setX(i, icon); this.aColor.setXYZ(i, color[0], color[1], color[2]); this.aSel.setX(i, sel); this.aSize.setX(i, size); }
  end() { this.mesh.geometry.instanceCount = this.n; this.aPos.needsUpdate = this.aIcon.needsUpdate = this.aColor.needsUpdate = this.aSel.needsUpdate = this.aSize.needsUpdate = true; }
}
class BarRenderer {
  constructor(cap) {
    this.cap = cap; this.n = 0; const g = instancedQuad(cap);
    this.aPos = iattr(g, 'aPos', cap, 3); this.aInfo = iattr(g, 'aInfo', cap, 3);
    this.uniforms = { uRes: { value: new THREE.Vector2(1, 1) } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: `attribute vec3 aPos; attribute vec3 aInfo; uniform vec2 uRes; varying vec2 vUv; varying vec3 vInfo;
        void main(){ vec4 c = projectionMatrix * modelViewMatrix * vec4(aPos, 1.0); vec2 px = position.xy * vec2(aInfo.z, 5.0) + vec2(0.0, 14.0); c.xy += px / uRes * 2.0 * c.w; gl_Position = c; vUv = uv; vInfo = aInfo; }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vInfo; void main(){ float f = vInfo.x; vec3 col;
        if (vInfo.y > 1.5) col = vec3(1.0, 0.75, 0.2); else if (vInfo.y > 0.5) col = vec3(0.3, 0.8, 1.0); else col = mix(vec3(1.0,0.2,0.1), vec3(0.3,1.0,0.35), smoothstep(0.2,0.7,f));
        float on = step(vUv.x, f); vec3 c = mix(vec3(0.05,0.05,0.07), col, on); gl_FragColor = vec4(c, 0.9); }` });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 99;
  }
  begin() { this.n = 0; }
  add(p, frac, mode, width) { if (this.n >= this.cap) return; const i = this.n++; this.aPos.setXYZ(i, p.x, p.y, p.z); this.aInfo.setXYZ(i, frac, mode, width); }
  end() { this.mesh.geometry.instanceCount = this.n; this.aPos.needsUpdate = this.aInfo.needsUpdate = true; }
}
function makeScorchTexture() {
  const s = 128; const c = document.createElement('canvas'); c.width = s; c.height = s; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene, system, atmoU) {
    this.scene = scene; this.system = system; this.planets = system.planets; this.time = 0; this.atmoU = atmoU;
    const lit = (m, key) => (atmoU ? injectFog(m, atmoU, key) : m); // share the world's atmosphere and art style
    const cf = (x, y, z) => this.centerFor(x, y, z);
    this.sparks = new GPUParticles(30000, { additive: true }); this.glow = new GPUParticles(2500, { additive: true, renderOrder: 21 }); this.smoke = new GPUParticles(20000, { additive: false, renderOrder: 18 });
    this.sparks.centerFor = cf; this.glow.centerFor = cf; this.smoke.centerFor = cf;
    scene.add(this.sparks.mesh, this.glow.mesh, this.smoke.mesh);
    const addMat = (extra = {}) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });
    this.beams = new InstPool(new THREE.BoxGeometry(1, 1, 1), addMat(), 500, { renderOrder: 22 }); this.beamList = [];
    this.rings = new InstPool(new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2), addMat({ side: THREE.DoubleSide }), 120, { renderOrder: 22 }); this.ringList = [];
    this.bolts = new InstPool(new THREE.BoxGeometry(0.24, 0.24, 1), addMat(), 800, { renderOrder: 22 });
    this.shells = new InstPool(new THREE.SphereGeometry(0.42, 8, 6), addMat(), 500, { renderOrder: 22 });
    this.missiles = new InstPool(new THREE.ConeGeometry(0.28, 1.2, 6).rotateX(Math.PI / 2), lit(new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.4, metalness: 0.5 }), 'fx_missile'), 400, { shadow: false });
    this.bombs = new InstPool(new THREE.SphereGeometry(0.45, 8, 6), lit(new THREE.MeshStandardMaterial({ color: 0x333940, roughness: 0.6 }), 'fx_bomb'), 200, { color: false });
    this.selRings = new InstPool(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }), 500, { renderOrder: 12 });
    this.rangeRings = new InstPool(new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, depthTest: false }), 60, { renderOrder: 13 });
    const dg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    dg.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(240), 1));
    const dm = new THREE.ShaderMaterial({ uniforms: { uMap: { value: makeScorchTexture() } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      vertexShader: `attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying float vA; void main(){ float a = texture2D(uMap, vUv).a * vA; gl_FragColor = vec4(0.02, 0.02, 0.025, a); }` });
    this.decals = new InstPool(dg, dm, 240, { color: false, renderOrder: 2 }); this.decalList = []; this.decalAlpha = dg.getAttribute('aAlpha');
    this.icons = new IconRenderer(2500); this.bars = new BarRenderer(1200);
    for (const p of [this.beams, this.rings, this.bolts, this.shells, this.missiles, this.bombs, this.selRings, this.rangeRings, this.decals]) scene.add(p.mesh);
    scene.add(this.icons.mesh, this.bars.mesh);
    this.buildSpotPads();
  }
  centerFor(x, y, z) {
    let best = this.planets[0].center, bd = Infinity;
    for (const p of this.planets) { const dx = p.center.x - x, dy = p.center.y - y, dz = p.center.z - z; const d = dx * dx + dy * dy + dz * dz - p.R * p.R; if (d < bd) { bd = d; best = p.center; } }
    return best;
  }
  upAt(p, out) { const c = this.centerFor(p.x, p.y, p.z); return out.copy(p).sub(c).normalize(); }
  buildSpotPads() {
    let n = 0; for (const p of this.planets) n += p.spots.length;
    const pad = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.3, 2.6, 0.5, 6), this.atmoU ? injectFog(new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.7, metalness: 0.5 }), this.atmoU, 'fx_pad') : new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.7, metalness: 0.5 }), n);
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(1.7, 0.12, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    pad.receiveShadow = true; pad.castShadow = true; let i = 0;
    for (const p of this.planets) for (const s of p.spots) {
      frameQuat(s.dir, anyTangent(s.dir, _t), _q); _v.copy(s.pos).addScaledVector(s.dir, 0.1); _s.set(1, 1, 1); _m.compose(_v, _q, _s); pad.setMatrixAt(i, _m);
      _v.copy(s.pos).addScaledVector(s.dir, 0.42); _m.compose(_v, _q, _s); ring.setMatrixAt(i, _m); i++;
    }
    this.spotPads = pad; this.spotRings = ring; this.scene.add(pad, ring);
  }
  setViewport(w, h) { this.icons.uniforms.uRes.value.set(w, h); this.bars.uniforms.uRes.value.set(w, h); }
  /** Free every GPU resource. A world rebuild drops the whole Effects instance, and switching art
      styles can rebuild the world repeatedly, so without this each switch leaked its geometries,
      materials and canvas textures. */
  dispose() {
    const kill = (m) => { if (!m) return; if (m.geometry) m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mat of mats) { if (!mat) continue; for (const k of ['map', 'alphaMap', 'normalMap']) if (mat[k] && mat[k].dispose) mat[k].dispose(); if (mat.uniforms) for (const u of Object.values(mat.uniforms)) { const v = u && u.value; if (v && v.isTexture && v.dispose) v.dispose(); } mat.dispose(); } if (m.parent) m.parent.remove(m); };
    for (const p of [this.sparks, this.glow, this.smoke, this.beams, this.rings, this.bolts, this.shells, this.missiles, this.bombs, this.selRings, this.rangeRings, this.decals, this.icons, this.bars]) kill(p && p.mesh);
    kill(this.spotPads); kill(this.spotRings);
  }
  // ---- spawners ----
  sparkBurst(p, n, count, speed, life, size, col, opts = {}) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5), vy = (Math.random() - 0.5), vz = (Math.random() - 0.5); const l = Math.hypot(vx, vy, vz) || 1; const sp = speed * (0.4 + Math.random() * 0.9); const up = opts.up === undefined ? 0.6 : opts.up;
      this.sparks.spawn(p.x, p.y, p.z, vx / l * sp + n.x * sp * up, vy / l * sp + n.y * sp * up, vz / l * sp + n.z * sp * up, life * (0.6 + Math.random() * 0.8), size * (0.6 + Math.random() * 0.8), col[0], col[1], col[2], opts.drag ?? 2.5, opts.grav ?? 28, opts.grow ?? -0.3, 0);
    }
  }
  smokePuff(p, n, count, speed, life, size, col, opts = {}) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5), vy = (Math.random() - 0.5), vz = (Math.random() - 0.5); const l = Math.hypot(vx, vy, vz) || 1; const sp = speed * (0.3 + Math.random() * 0.9); const up = opts.up ?? 0.8; const shade = 0.7 + Math.random() * 0.5;
      this.smoke.spawn(p.x, p.y, p.z, vx / l * sp + n.x * sp * up, vy / l * sp + n.y * sp * up, vz / l * sp + n.z * sp * up, life * (0.6 + Math.random() * 0.8), size * (0.6 + Math.random() * 0.8), col[0] * shade, col[1] * shade, col[2] * shade, opts.drag ?? 1.6, opts.grav ?? -1.5, opts.grow ?? 1.6, (Math.random() - 0.5) * 3);
    }
  }
  flash(p, size, col, life = 0.22) { this.glow.spawn(p.x, p.y, p.z, 0, 0, 0, life, size, col[0], col[1], col[2], 0, 0, 0.8, 0); }
  explosion(p, size, teamCol, ground = true) {
    const n = this.upAt(p, _n);
    this.flash(p, 3.2 * size, [1, 0.9, 0.7], 0.16 + 0.04 * size); this.flash(p, 1.6 * size, [1, 0.6, 0.25], 0.4);
    this.sparkBurst(p, n, Math.round(18 * size), 14 * Math.sqrt(size), 0.9, 0.9 * Math.sqrt(size), [1.0, 0.7, 0.3]);
    this.sparkBurst(p, n, Math.round(10 * size), 20 * Math.sqrt(size), 1.4, 0.4 * Math.sqrt(size), [1.0, 0.45, 0.15], { grav: 40, drag: 0.8 });
    this.smokePuff(p, n, Math.round(6 * size), 5 * Math.sqrt(size), 2.0 + size * 0.4, 1.4 * Math.sqrt(size), [0.16, 0.15, 0.14]);
    this.smokePuff(p, n, Math.round(6 * size), 18 * Math.sqrt(size), 1.6, 0.35 * Math.sqrt(size), [0.12, 0.12, 0.13], { grav: 45, drag: 0.4, grow: 0, up: 1.2 });
    if (teamCol) this.sparkBurst(p, n, Math.round(6 * size), 10 * Math.sqrt(size), 1.0, 0.5, teamCol);
    if (size >= 1.4) this.ring(p, n, [1.0, 0.75, 0.45], 9 * size, 0.55);
    if (ground && size >= 0.9) this.scorch(p, n, 2.2 * size);
  }
  bigExplosion(p, size, ground = true) {
    const n = this.upAt(p, _n);
    this.flash(p, 12 * size, [1, 0.95, 0.85], 0.35); this.flash(p, 7 * size, [1, 0.6, 0.2], 0.9);
    this.sparkBurst(p, n, 200 * size, 40 * size, 2.0, 1.1, [1.0, 0.7, 0.3], { grav: 25, drag: 1.2 });
    this.sparkBurst(p, n, 120 * size, 70 * size, 2.5, 0.8, [1.0, 0.5, 0.15], { grav: 45, drag: 0.4 });
    this.smokePuff(p, n, 90 * size, 18 * size, 6, 7 * size, [0.2, 0.18, 0.17], { grav: -3 });
    this.smokePuff(p, n, 40 * size, 50 * size, 3, 1.0, [0.12, 0.12, 0.13], { grav: 50, drag: 0.3, grow: 0, up: 1.5 });
    this.ring(p, n, [0.8, 0.6, 0.35], 60 * size, 1.4); this.ring(p, n, [0.35, 0.5, 0.7], 100 * size, 2.2);
    if (ground) this.scorch(p, n, 16 * size);
  }
  nuke(p, n) {
    this.flash(p, 55, [1, 0.98, 0.9], 0.5); this.flash(p, 30, [1, 0.6, 0.2], 2.0); this.flash(p, 18, [1, 0.35, 0.1], 4);
    for (let i = 0; i < 70; i++) { const r = () => (Math.random() - 0.5) * 10; this.glow.spawn(p.x + r(), p.y + r(), p.z + r(), n.x * 14 + r() * 0.6, n.y * 14 + r() * 0.6, n.z * 14 + r() * 0.6, 3 + Math.random() * 2, 12 + Math.random() * 12, 1, 0.5 + Math.random() * 0.2, 0.15, 0.6, -6, 1.2, 0); }
    for (let i = 0; i < 180; i++) { const r = () => (Math.random() - 0.5) * 8; const sp = 20 + Math.random() * 24; const sh = 0.7 + Math.random() * 0.5; this.smoke.spawn(p.x + r(), p.y + r(), p.z + r(), n.x * sp + r() * 0.5, n.y * sp + r() * 0.5, n.z * sp + r() * 0.5, 9 + Math.random() * 6, 6 + Math.random() * 5, 0.25 * sh, 0.22 * sh, 0.2 * sh, 0.45, -2, 2.2, (Math.random() - 0.5) * 2); }
    const t1 = anyTangent(n, _t); const t2 = _v2.crossVectors(n, t1);
    for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI * 2; const tx = Math.cos(a), ty = Math.sin(a); const sp = 12 + Math.random() * 20; const sh = 0.75 + Math.random() * 0.4;
      this.smoke.spawn(p.x, p.y, p.z, n.x * 58 + (t1.x * tx + t2.x * ty) * sp, n.y * 58 + (t1.y * tx + t2.y * ty) * sp, n.z * 58 + (t1.z * tx + t2.z * ty) * sp, 12 + Math.random() * 6, 9 + Math.random() * 6, 0.32 * sh, 0.28 * sh, 0.26 * sh, 1.1, -1, 2.6, (Math.random() - 0.5) * 2); }
    for (let i = 0; i < 240; i++) { const a = Math.random() * Math.PI * 2; const tx = Math.cos(a), ty = Math.sin(a); const sp = 35 + Math.random() * 30; const sh = 0.8 + Math.random() * 0.4;
      this.smoke.spawn(p.x, p.y, p.z, (t1.x * tx + t2.x * ty) * sp + n.x * 4, (t1.y * tx + t2.y * ty) * sp + n.y * 4, (t1.z * tx + t2.z * ty) * sp + n.z * 4, 5 + Math.random() * 4, 5 + Math.random() * 4, 0.42 * sh, 0.37 * sh, 0.3 * sh, 1.0, 3, 2.0, (Math.random() - 0.5) * 2); }
    this.sparkBurst(p, n, 500, 60, 3.0, 1.4, [1, 0.75, 0.35], { grav: 25, drag: 0.9 });
    this.smokePuff(p, n, 120, 70, 3.5, 0.8, [0.1, 0.1, 0.1], { grav: 45, drag: 0.3, grow: 0, up: 1.2 });
    this.ring(p, n, [1, 0.9, 0.7], 140, 2.0); this.ring(p, n, [1, 0.6, 0.3], 220, 3.2); this.ring(p, n, [0.6, 0.7, 0.9], 320, 4.5);
    if (this.decalList.length >= 240) this.decalList.shift();
    this.decalList.push({ p: p.clone().addScaledVector(n, 0.15), n: n.clone(), r: 42, age: 0, life: 420 });
  }
  impact(p, col) { const n = this.upAt(p, _n); this.sparkBurst(p, n, 5, 9, 0.35, 0.35, col || [1, 0.8, 0.5], { grav: 20 }); this.flash(p, 1.0, col || [1, 0.8, 0.5], 0.1); }
  muzzle(p, col) { this.flash(p, 0.9, col, 0.08); }
  dust(p, n, size) { this.smokePuff(p, n, Math.round(14 * size), 8 * size, 2.0, 2.5 * size, [0.45, 0.4, 0.33], { up: 0.25, grav: 2, grow: 1.2 }); }
  beam(a, b, col, width = 0.35, life = 0.1) { this.beamList.push({ a: a.clone(), b: b.clone(), col, width, life, age: 0 }); }
  linkLine(a, b, col) { this.beamList.push({ a: a.clone(), b: b.clone(), col, width: 0.9, life: 0.06, age: 0 }); }
  lightning(a, b, col) {
    const segs = 7; let prev = a.clone(); const len = _v.copy(b).sub(a).length();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs; const p = a.clone().lerp(b, t);
      if (i < segs) { p.x += (Math.random() - 0.5) * len * 0.12; p.y += (Math.random() - 0.5) * len * 0.12; p.z += (Math.random() - 0.5) * len * 0.12; }
      this.beamList.push({ a: prev, b: p, col, width: 0.45, life: 0.14, age: 0 }); prev = p;
    }
    this.flash(b, 5, col, 0.2); this.impact(b, col);
  }
  nanolathe(a, b, col) {
    this.beamList.push({ a: a.clone(), b: b.clone(), col, width: 0.18, life: 0.07, age: 0 });
    if (Math.random() < 0.5) { const n = this.upAt(b, _n); this.sparks.spawn(b.x + (Math.random() - 0.5) * 2, b.y + (Math.random() - 0.5) * 2, b.z + (Math.random() - 0.5) * 2, n.x * 3, n.y * 3, n.z * 3, 0.5, 0.35, col[0], col[1], col[2], 2, 0, 0, 0); }
  }
  ring(p, n, col, maxR, life) { this.ringList.push({ p: p.clone(), n: n.clone(), col, maxR, life, age: 0 }); }
  scorch(p, n, radius) { if (this.decalList.length >= 240) this.decalList.shift(); this.decalList.push({ p: p.clone().addScaledVector(n, 0.12), n: n.clone(), r: radius, age: 0, life: 60 }); }
  // ---- per-frame instanced things ----
  beginFrame() { this.bolts.begin(); this.shells.begin(); this.missiles.begin(); this.bombs.begin(); this.selRings.begin(); this.rangeRings.begin(); this.icons.begin(); this.bars.begin(); }
  addBolt(p, dir, len, col) { _q.setFromUnitVectors(Z_AXIS, dir); _s.set(1, 1, len); _m.compose(p, _q, _s); this.bolts.add(_m, col[0] * 2.2, col[1] * 2.2, col[2] * 2.2); }
  addShell(p, size, col) { _s.set(size, size, size); _m.compose(p, _q.identity(), _s); this.shells.add(_m, col[0] * 2, col[1] * 2, col[2] * 2); }
  addMissile(p, dir, size) { _q.setFromUnitVectors(Z_AXIS, dir); _s.set(size, size, size); _m.compose(p, _q, _s); this.missiles.add(_m, 1, 1, 1); }
  addNuke(p, dir) { this.addMissile(p, dir, 4.5); this.flash(p, 5, [1, 0.8, 0.5], 0.06); }
  addBomb(p, size) { _s.set(size, size, size); _m.compose(p, _q.identity(), _s); this.bombs.add(_m); }
  addSelRing(p, n, radius, col) { frameQuat(n, anyTangent(n, _t), _q); _v.copy(p).addScaledVector(n, 0.25); _s.set(radius, 1, radius); _m.compose(_v, _q, _s); this.selRings.add(_m, col[0], col[1], col[2]); }
  addRangeRing(p, n, radius, col) { frameQuat(n, anyTangent(n, _t), _q); _v.copy(p).addScaledVector(n, 0.4); _s.set(radius, 1, radius); _m.compose(_v, _q, _s); this.rangeRings.add(_m, col[0], col[1], col[2]); }
  endFrame() { this.bolts.end(); this.shells.end(); this.missiles.end(); this.bombs.end(); this.selRings.end(); this.rangeRings.end(); this.icons.end(); this.bars.end(); }
  update(dt) {
    this.time += dt; this.sparks.update(this.time); this.glow.update(this.time); this.smoke.update(this.time);
    this.beams.begin();
    for (let i = this.beamList.length - 1; i >= 0; i--) {
      const b = this.beamList[i]; b.age += dt; if (b.age >= b.life) { this.beamList[i] = this.beamList[this.beamList.length - 1]; this.beamList.pop(); continue; }
      const f = 1 - b.age / b.life; _v.copy(b.b).sub(b.a); const len = _v.length(); if (len < 1e-4) continue; _v.multiplyScalar(1 / len);
      _q.setFromUnitVectors(Z_AXIS, _v); _v2.copy(b.a).lerp(b.b, 0.5); _s.set(b.width * f, b.width * f, len); _m.compose(_v2, _q, _s);
      this.beams.add(_m, b.col[0] * 2.5, b.col[1] * 2.5, b.col[2] * 2.5);
    }
    this.beams.end();
    this.rings.begin();
    for (let i = this.ringList.length - 1; i >= 0; i--) {
      const r = this.ringList[i]; r.age += dt; if (r.age >= r.life) { this.ringList[i] = this.ringList[this.ringList.length - 1]; this.ringList.pop(); continue; }
      const f = r.age / r.life; const rad = r.maxR * (1 - Math.pow(1 - f, 2.2)); const a = 1 - f;
      frameQuat(r.n, anyTangent(r.n, _t), _q); _v.copy(r.p).addScaledVector(r.n, 0.5); _s.set(rad, 1, rad); _m.compose(_v, _q, _s);
      this.rings.add(_m, r.col[0] * a * 1.5, r.col[1] * a * 1.5, r.col[2] * a * 1.5);
    }
    this.rings.end();
    this.decals.begin();
    for (let i = this.decalList.length - 1; i >= 0; i--) {
      const d = this.decalList[i]; d.age += dt; if (d.age >= d.life) { this.decalList.splice(i, 1); continue; }
      frameQuat(d.n, anyTangent(d.n, _t), _q); _s.set(d.r, 1, d.r); _m.compose(d.p, _q, _s);
      this.decalAlpha.setX(this.decals.n, 0.9 * (1 - d.age / d.life)); this.decals.add(_m);
    }
    this.decalAlpha.needsUpdate = true; this.decals.end();
  }
}
