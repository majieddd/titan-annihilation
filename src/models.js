import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFS } from './defs.js';
import { detailTexture } from './textures.js';

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
function partGeometry(part, idx) {
  const [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz] = part;
  let g;
  if (shape === 'rbox') { const r = Math.min(0.12, Math.min(sx, sy, sz) * 0.2); g = new RoundedBoxGeometry(sx, sy, sz, 2, r).toNonIndexed(); g.deleteAttribute('uv'); _s.set(1, 1, 1); }
  else { g = baseGeo(shape).clone(); _s.set(sx, sy, sz); }
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x, y, z); _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  const n = g.getAttribute('position').count; const col = new Float32Array(n * 3), team = new Float32Array(n), glow = new Float32Array(n);
  const f = flags || ''; let c = COLORS.base; if (f.includes('d')) c = COLORS.d; else if (f.includes('l')) c = COLORS.l; else if (f.includes('k')) c = COLORS.k;
  const v = 0.9 + 0.2 * (((idx * 7) % 5) / 4); const isTeam = f.includes('t') ? 1 : 0; const gl = f.includes('G') ? 2.2 : (f.includes('g') ? 1.0 : 0);
  for (let i = 0; i < n; i++) { col[i * 3] = c[0] * v; col[i * 3 + 1] = c[1] * v; col[i * 3 + 2] = c[2] * v; team[i] = isTeam || gl > 0 ? 1 : 0; glow[i] = gl; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aTeam', new THREE.BufferAttribute(team, 1)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return g;
}
export function buildModel(def) {
  const body = [], turret = [];
  def.model.forEach((part, i) => { const g = partGeometry(part, i); (part[7] || '').includes('u') ? turret.push(g) : body.push(g); });
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
export function makeUnitMaterial(fogU) {
  const panel = detailTexture('panel', 256);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tPanel = { value: panel.map }; shader.uniforms.tPanelN = { value: panel.normal }; if (fogU) { shader.uniforms.uFogColor = fogU.uFogColor; shader.uniforms.uFogDensity = fogU.uFogDensity; }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTeam; attribute float aGlow; attribute float aHeight; attribute vec3 aTeamColor; attribute vec2 aInst;
        varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec2 vInst; varying vec3 vObj; varying vec3 vObjN; varying float vFogD;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTeam = aTeam; vGlow = aGlow; vHeight = aHeight; vTeamColor = aTeamColor; vInst = aInst; vObj = position; vObjN = normal;`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFogD = length(mvPosition.xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tPanel; uniform sampler2D tPanelN; uniform vec3 uFogColor; uniform float uFogDensity;
        varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec2 vInst; varying vec3 vObj; varying vec3 vObjN; varying float vFogD;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vInst.x < 1.0 && vHeight > vInst.x) discard;
        vec3 an = abs(normalize(vObjN)); vec3 pw = an * an * an * an; pw /= (pw.x + pw.y + pw.z);
        vec3 pp = vObj * 0.5;
        float pnl = texture2D(tPanel, pp.zy).r * pw.x + texture2D(tPanel, pp.xz).r * pw.y + texture2D(tPanel, pp.xy).r * pw.z;
        float prg = (texture2D(tPanelN, pp.zy).a * pw.x + texture2D(tPanelN, pp.xz).a * pw.y + texture2D(tPanelN, pp.xy).a * pw.z - 0.3) / 0.7;
        diffuseColor.rgb = mix(diffuseColor.rgb, vTeamColor, vTeam);
        diffuseColor.rgb *= 0.72 + 0.5 * pnl;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vInst.y * 0.7);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(0.28 + 0.6 * prg, 0.15, 0.95);`)
      .replace('#include <fog_fragment>', 'float ffog = 1.0 - exp(-vFogD * uFogDensity); gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, ffog);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vTeamColor * vGlow * 1.4;
        float edge = (vInst.x < 1.0) ? (1.0 - smoothstep(0.0, 0.06, vInst.x - vHeight)) : 0.0;
        totalEmissiveRadiance += vTeamColor * edge * 1.8 + vec3(1.0) * vInst.y * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'unitmat_v3';
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
