import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFS } from './defs.js';
import { getTextureSet } from './assets.js';
import { injectFog } from './planet.js';

const COLORS = { base: [0.50, 0.53, 0.57], d: [0.20, 0.22, 0.25], l: [0.74, 0.76, 0.80], k: [0.07, 0.07, 0.08], t: [0.6, 0.6, 0.6] };
const BASE_GEOS = {};
function baseGeo(shape) {
  if (BASE_GEOS[shape]) return BASE_GEOS[shape];
  let g;
  switch (shape) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); break;
    case 'cylz': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.rotateX(Math.PI / 2); break;
    case 'cylx': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.rotateZ(Math.PI / 2); break;
    case 'sph': g = new THREE.SphereGeometry(0.5, 16, 12); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 14); break;
    case 'conez': g = new THREE.ConeGeometry(0.5, 1, 12); g.rotateX(Math.PI / 2); break;
    case 'wdg': g = new THREE.CylinderGeometry(0.62 * 0.7071, 0.7071, 1, 4, 1); g.rotateY(Math.PI / 4); break;
    case 'pyr': g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); break;
    case 'tor': g = new THREE.TorusGeometry(0.5, 0.1, 10, 28); g.rotateX(Math.PI / 2); break;
    case 'hex': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); break;
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  g = g.toNonIndexed(); g.deleteAttribute('uv'); BASE_GEOS[shape] = g; return g;
}
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** per-vertex "edge-ness" (bevels and rims) used for edge wear: 0 on flat panels, 1 on rounded corners */
function edgeAttr(shape, g, flags) {
  const p = g.getAttribute('position'), nr = g.getAttribute('normal'); const n = p.count; const e = new Float32Array(n);
  if (shape === 'rbox') { for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(nr.getX(i)), Math.abs(nr.getY(i)), Math.abs(nr.getZ(i))); e[i] = Math.min(1, Math.max(0, (1 - m) / 0.28)); } }
  else if ((shape === 'cyl' || shape === 'hex' || shape === 'cylz' || shape === 'cylx') && !flags.includes('k')) {
    for (let i = 0; i < n; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); let axial, rad2; if (shape === 'cylz') { axial = Math.abs(z); rad2 = x * x + y * y; } else if (shape === 'cylx') { axial = Math.abs(x); rad2 = y * y + z * z; } else { axial = Math.abs(y); rad2 = x * x + z * z; } e[i] = (axial > 0.49 && rad2 > 0.2) ? 0.35 : 0; }
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1));
}
const _pq = new THREE.Quaternion(), _pe = new THREE.Euler(), _pax = new THREE.Vector3();
/** sphere proxies approximating a part's volume (body space; turret parts get the pivot offset) */
function partProxies(part, idx, off) {
  const [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz] = part;
  _pe.set(rx || 0, ry || 0, rz || 0); _pq.setFromEuler(_pe);
  const s = [sx, sy, sz]; let a = 0; if (s[1] > s[a]) a = 1; if (s[2] > s[a]) a = 2; const b = (a + 1) % 3, c = (a + 2) % 3;
  const r = Math.max(0.03, 0.5 * Math.sqrt(s[b] * s[b] + s[c] * s[c]) * 0.72); const L = s[a]; const n = Math.max(1, Math.min(12, Math.round(L / (1.8 * r))));
  _pax.set(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0).applyQuaternion(_pq);
  const out = []; const span = Math.max(0, L - 1.6 * r);
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * span; out.push({ part: idx, r, c: new THREE.Vector3(x + off[0], y + off[1], z + off[2]).addScaledVector(_pax, t) }); }
  return out;
}
/** bake ambient occlusion from the other parts' sphere proxies into an aAO vertex attribute */
function bakeAO(g, own, spheres, off) {
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'); const n = pos.count; const ao = new Float32Array(n); const cache = new Map();
  g.computeBoundingSphere(); const bs = g.boundingSphere; const bcx = bs.center.x + off[0], bcy = bs.center.y + off[1], bcz = bs.center.z + off[2];
  const near = []; for (const sp of spheres) { if (sp.part === own) continue; const dx = sp.c.x - bcx, dy = sp.c.y - bcy, dz = sp.c.z - bcz; if (Math.sqrt(dx * dx + dy * dy + dz * dz) < bs.radius + sp.r + 3) near.push(sp); }
  const REACH = 3.0;
  for (let i = 0; i < n; i++) {
    const px = pos.getX(i) + off[0], py = pos.getY(i) + off[1], pz = pos.getZ(i) + off[2]; const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const key = ((px * 200) | 0) + ',' + ((py * 200) | 0) + ',' + ((pz * 200) | 0) + ',' + ((nx * 8) | 0) + ',' + ((ny * 8) | 0) + ',' + ((nz * 8) | 0);
    let v = cache.get(key);
    if (v === undefined) {
      let occ = 0;
      for (let k = 0; k < near.length; k++) { const sp = near[k]; const dx = sp.c.x - px, dy = sp.c.y - py, dz = sp.c.z - pz; const d2 = dx * dx + dy * dy + dz * dz; const d = Math.sqrt(d2); const gap = d - sp.r; if (gap > REACH) continue; const cos = (dx * nx + dy * ny + dz * nz) / Math.max(d, 1e-4); if (cos <= 0) continue; const fall = gap <= 0 ? 1 : 1 - gap / REACH; const solid = Math.min(1, (sp.r * sp.r) / Math.max(d2, 1e-6)); occ += solid * cos * fall * fall; }
      v = Math.pow(Math.max(0.1, 1 - occ * 0.9), 1.3); cache.set(key, v);
    }
    ao[i] = v;
  }
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}
function partGeometry(part, idx) {
  const [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz] = part;
  let g;
  if (shape === 'rbox') { const r = Math.min(0.12, Math.min(sx, sy, sz) * 0.2); g = new RoundedBoxGeometry(sx, sy, sz, 2, r).toNonIndexed(); g.deleteAttribute('uv'); _s.set(1, 1, 1); }
  else { g = baseGeo(shape).clone(); _s.set(sx, sy, sz); }
  edgeAttr(shape, g, flags || '');
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x, y, z); _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  const n = g.getAttribute('position').count; const col = new Float32Array(n * 3), team = new Float32Array(n), glow = new Float32Array(n);
  const f = flags || ''; let c = COLORS.base; if (f.includes('d')) c = COLORS.d; else if (f.includes('l')) c = COLORS.l; else if (f.includes('k')) c = COLORS.k;
  const v = 0.9 + 0.2 * (((idx * 7) % 5) / 4); const isTeam = f.includes('t') ? 1 : 0; const gl = f.includes('G') ? 2.2 : (f.includes('g') ? 1.0 : 0);
  for (let i = 0; i < n; i++) { col[i * 3] = c[0] * v; col[i * 3 + 1] = c[1] * v; col[i * 3 + 2] = c[2] * v; team[i] = isTeam || gl > 0 ? 1 : 0; glow[i] = gl; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}
export function buildModel(def) {
  const body = [], turret = []; const pivot0 = def.turretPivot || [0, 0, 0]; const spheres = [];
  def.model.forEach((part, i) => { const off = (part[7] || '').includes('u') ? pivot0 : [0, 0, 0]; for (const sp of partProxies(part, i, off)) spheres.push(sp); });
  def.model.forEach((part, i) => { const g = partGeometry(part, i); const isT = (part[7] || '').includes('u'); bakeAO(g, i, spheres, isT ? pivot0 : [0, 0, 0]); isT ? turret.push(g) : body.push(g); });
  const bodyGeo = mergeGeometries(body, false); let turretGeo = turret.length ? mergeGeometries(turret, false) : null;
  const pivot = def.turretPivot || [0, 0, 0];
  bodyGeo.computeBoundingBox(); let minY = bodyGeo.boundingBox.min.y, maxY = bodyGeo.boundingBox.max.y;
  if (turretGeo) { turretGeo.computeBoundingBox(); minY = Math.min(minY, turretGeo.boundingBox.min.y + pivot[1]); maxY = Math.max(maxY, turretGeo.boundingBox.max.y + pivot[1]); }
  const range = Math.max(0.01, maxY - minY);
  const setH = (g, off) => { const p = g.getAttribute('position'); const h = new Float32Array(p.count); for (let i = 0; i < p.count; i++) h[i] = (p.getY(i) + off - minY) / range; g.setAttribute('aHeight', new THREE.BufferAttribute(h, 1)); };
  setH(bodyGeo, 0); if (turretGeo) setH(turretGeo, pivot[1]);
  bodyGeo.computeBoundingSphere(); if (turretGeo) turretGeo.computeBoundingSphere();
  return { body: bodyGeo, turret: turretGeo, height: maxY, pivot };
}
export function makeUnitMaterial(atmoU) {
  const panel = getTextureSet('panel');
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tPanel = { value: panel.map }; shader.uniforms.tPanelN = { value: panel.normal };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTeam; attribute float aGlow; attribute float aHeight; attribute vec3 aTeamColor; attribute vec2 aInst; attribute float aAO; attribute float aEdge;
        varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec2 vInst; varying vec3 vObj; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2; varying float vAO; varying float vEdge;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTeam = aTeam; vGlow = aGlow; vHeight = aHeight; vTeamColor = aTeamColor; vInst = aInst; vObj = position; vObjN = normal; vAO = aAO; vEdge = aEdge;
        #ifdef USE_INSTANCING
        vR0 = instanceMatrix[0].xyz; vR1 = instanceMatrix[1].xyz; vR2 = instanceMatrix[2].xyz;
        #else
        vR0 = vec3(1.0, 0.0, 0.0); vR1 = vec3(0.0, 1.0, 0.0); vR2 = vec3(0.0, 0.0, 1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tPanel; uniform sampler2D tPanelN;
        varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec2 vInst; varying vec3 vObj; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2; varying float vAO; varying float vEdge;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vInst.x < 1.0 && vHeight > vInst.x) discard;
        vec3 an = abs(normalize(vObjN)); vec3 pw = an * an * an * an; pw /= (pw.x + pw.y + pw.z);
        vec3 pp = vObj * 0.5;
        vec3 pnc = texture2D(tPanel, pp.zy).rgb * pw.x + texture2D(tPanel, pp.xz).rgb * pw.y + texture2D(tPanel, pp.xy).rgb * pw.z; float pnl = dot(pnc, vec3(0.333));
        float prg = (texture2D(tPanelN, pp.zy).a * pw.x + texture2D(tPanelN, pp.xz).a * pw.y + texture2D(tPanelN, pp.xy).a * pw.z - 0.3) / 0.7;
        float pnh = (texture2D(tPanel, pp.zy).a * pw.x + texture2D(tPanel, pp.xz).a * pw.y + texture2D(tPanel, pp.xy).a * pw.z - 0.3) / 0.7;
        diffuseColor.rgb = mix(diffuseColor.rgb, vTeamColor * 0.9, vTeam);
        diffuseColor.rgb *= (0.62 + 0.75 * pnl) * (0.8 + 0.2 * pnh);
        float wear = vEdge * smoothstep(0.3, 0.75, pnl * 0.8 + vEdge * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.57) * (0.7 + 0.6 * pnl), wear * 0.85);
        diffuseColor.rgb *= 0.5 + 0.5 * vAO;
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 0.4, vHeight + (pnl - 0.5) * 0.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vInst.y * 0.7);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(0.3, 0.4, vTeam) + 0.5 * prg + (1.0 - smoothstep(0.0, 0.4, vHeight)) * 0.25, 0.15, 0.95); roughnessFactor = mix(roughnessFactor, 0.3, wear * 0.8);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(mix(0.8, 0.35, vTeam), 0.92, wear * 0.8);`)
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= 0.35 + 0.65 * vAO;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
        { float dotNV = saturate( dot( geometryNormal, geometryViewDir ) ); reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, vAO, material.roughness ); }
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        vec3 uon = normalize(vObjN);
        vec3 ux = texture2D(tPanelN, pp.zy).xyz * 2.0 - 1.0; vec3 uy = texture2D(tPanelN, pp.xz).xyz * 2.0 - 1.0; vec3 uz = texture2D(tPanelN, pp.xy).xyz * 2.0 - 1.0;
        ux = vec3(ux.xy + uon.zy, abs(ux.z) * uon.x); uy = vec3(uy.xy + uon.xz, abs(uy.z) * uon.y); uz = vec3(uz.xy + uon.xy, abs(uz.z) * uon.z);
        vec3 unb = normalize(mix(uon, normalize(ux.zyx * pw.x + uy.xzy * pw.y + uz.xyz * pw.z), 0.55));
        mat3 urot = mat3(normalize(vR0), normalize(vR1), normalize(vR2));
        normal = normalize((viewMatrix * vec4(urot * unb, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vTeamColor * vGlow * 1.4;
        float edge = (vInst.x < 1.0) ? (1.0 - smoothstep(0.0, 0.06, vInst.x - vHeight)) : 0.0;
        totalEmissiveRadiance += vTeamColor * edge * 1.8 + vec3(1.0) * vInst.y * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'unitmat_v6';
  if (atmoU) injectFog(mat, atmoU, 'unitmat_v6');
  return mat;
}
function makeInstanced(geo, cap, material) {
  const g = geo.clone();
  g.setAttribute('aTeamColor', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
  const mesh = new THREE.InstancedMesh(g, material, cap);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
export class UnitRenderer {
  constructor(scene, fogU) {
    this.scene = scene; this.material = makeUnitMaterial(fogU); this.types = {}; this.models = {};
    for (const id in DEFS) {
      const def = DEFS[id]; const model = buildModel(def); this.models[id] = model;
      const cap = def.kind === 'titan' ? 24 : (def.kind === 'structure' ? 300 : (def.kind === 'commander' ? 4 : (def.kind === 'orbital' ? 120 : 600)));
      const body = makeInstanced(model.body, cap, this.material); const turret = model.turret ? makeInstanced(model.turret, cap, this.material) : null;
      scene.add(body); if (turret) scene.add(turret);
      this.types[id] = { def, model, cap, n: 0, body, turret, bTeam: body.geometry.getAttribute('aTeamColor'), bInst: body.geometry.getAttribute('aInst'), tTeam: turret && turret.geometry.getAttribute('aTeamColor'), tInst: turret && turret.geometry.getAttribute('aInst') };
    }
  }
  setVisible(v) { for (const id in this.types) { const t = this.types[id]; t.body.visible = v; if (t.turret) t.turret.visible = v; } }
  begin() { for (const id in this.types) this.types[id].n = 0; }
  add(defId, matrix, teamColor, progress, flash, turretMatrix) {
    const t = this.types[defId]; if (!t || t.n >= t.cap) return; const i = t.n++;
    t.body.setMatrixAt(i, matrix); t.bTeam.setXYZ(i, teamColor[0], teamColor[1], teamColor[2]); t.bInst.setXY(i, progress, flash);
    if (t.turret) { t.turret.setMatrixAt(i, turretMatrix || matrix); t.tTeam.setXYZ(i, teamColor[0], teamColor[1], teamColor[2]); t.tInst.setXY(i, progress, flash); }
  }
  end() {
    for (const id in this.types) {
      const t = this.types[id]; t.body.count = t.n; t.body.instanceMatrix.needsUpdate = true; t.bTeam.needsUpdate = true; t.bInst.needsUpdate = true;
      if (t.turret) { t.turret.count = t.n; t.turret.instanceMatrix.needsUpdate = true; t.tTeam.needsUpdate = true; t.tInst.needsUpdate = true; }
    }
  }
  createGhost(defId) {
    const m = this.models[defId]; const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.45, depthWrite: false });
    const b = new THREE.Mesh(m.body, mat); group.add(b);
    if (m.turret) { const t = new THREE.Mesh(m.turret, mat); t.position.set(m.pivot[0], m.pivot[1], m.pivot[2]); group.add(t); }
    group.userData.mat = mat; return group;
  }
}
