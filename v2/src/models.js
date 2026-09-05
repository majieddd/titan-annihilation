import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFS } from './defs.js';
import { getTextureSet } from './assets.js';
import { injectFog } from './planet.js';
import { STYLE_U } from './style.js';

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
  const [shape, x, y, z, sx, sy, sz, flags, rx, ry, rz, pvOverride] = part;
  let g;
  if (shape === 'rbox') { const r = Math.min(0.12, Math.min(sx, sy, sz) * 0.2); g = new RoundedBoxGeometry(sx, sy, sz, 2, r); if(g.index)g=g.toNonIndexed(); g.deleteAttribute('uv'); _s.set(1, 1, 1); }
  else { g = baseGeo(shape).clone(); _s.set(sx, sy, sz); }
  edgeAttr(shape, g, flags || '');
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); _p.set(x, y, z); _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  const n = g.getAttribute('position').count; const col = new Float32Array(n * 3), team = new Float32Array(n), glow = new Float32Array(n);
  // Animation role, baked per part so one instanced draw call can still move its pieces:
  //   1 wheel/roller (rolls about its own X), 2 leg (swings about its top), 3 rotor (spins about Y),
  //   4 barrel (recoils along -Z). aPivot is the point that part turns about.
  const roleCh = (flags || '').includes('A') ? 5 : (flags || '').includes('W') ? 1 : ((flags || '').includes('S') ? 2 : ((flags || '').includes('R') ? 3 : ((flags || '').includes('B') ? 4 : 0)));
  const pivot = Array.isArray(pvOverride) ? pvOverride : [x, pvOverride !== undefined ? pvOverride : (roleCh === 2 ? y + sy * 0.5 : y), z];
  { const role = new Float32Array(n), piv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { role[i] = roleCh; piv[i * 3] = pivot[0]; piv[i * 3 + 1] = pivot[1]; piv[i * 3 + 2] = pivot[2]; }
    const joints = new Float32Array(n * 4); const joint = part[12] || [0,0,0,0]; for(let i=0;i<n;i++) joints.set(joint,i*4); g.setAttribute('aJR', new THREE.BufferAttribute(joints,4));
    g.setAttribute('aRole', new THREE.BufferAttribute(role, 1)); g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3)); }
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
  const packVerts = (geo) => {
    const n = geo.getAttribute('position').count;
    const t = geo.getAttribute('aTeam'), gl = geo.getAttribute('aGlow'), h = geo.getAttribute('aHeight'), ao = geo.getAttribute('aAO'), role = geo.getAttribute('aRole'), piv = geo.getAttribute('aPivot');
    const va = new Float32Array(n * 4), pr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      va[i * 4] = t.getX(i); va[i * 4 + 1] = gl.getX(i); va[i * 4 + 2] = h.getX(i); va[i * 4 + 3] = ao.getX(i);
      pr[i * 4] = piv.getX(i); pr[i * 4 + 1] = piv.getY(i); pr[i * 4 + 2] = piv.getZ(i); pr[i * 4 + 3] = role.getX(i);
    }
    geo.setAttribute('aVA', new THREE.BufferAttribute(va, 4)); geo.setAttribute('aPR', new THREE.BufferAttribute(pr, 4));
    for (const k of ['aTeam', 'aGlow', 'aHeight', 'aAO', 'aRole', 'aPivot']) geo.deleteAttribute(k);
  };
  packVerts(bodyGeo); if (turretGeo) packVerts(turretGeo);
  for (const g of [...body,...turret]) g.dispose();
  bodyGeo.computeBoundingSphere(); if (turretGeo) turretGeo.computeBoundingSphere();
  return { body: bodyGeo, turret: turretGeo, height: maxY, pivot };
}
// The animation runs in the vertex shader, so anything that also needs the animated pose : the
// shadow (depth) pass, and the shading normal : has to run the exact same maths. Share one source of
// truth rather than three drifting copies.
const ANIM_ATTRS = `
        attribute vec4 aVA; attribute vec4 aPR; attribute vec4 aJR; attribute vec3 aMot; uniform float uStTime;
        #define aRole aPR.w
        #define aPivot aPR.xyz
        float taCycle() { return aMot.x + (aPivot.x < 0.0 ? 3.14159 : 0.0); }
        float taKnee() { return aRole > 1.5 && aRole < 2.5 ? max(0.0,-sin(taCycle())) * 0.7 * aMot.z * aJR.w : 0.0; }
        float taHip() { return sin(taCycle()) * 0.42 * aMot.z; }
        float taAng() {
          if (aRole < 1.5) return aMot.x;
          if (aRole < 2.5) return taHip() + taKnee();
          if (aRole < 3.5) return uStTime * 26.0;
          if (aRole > 4.5) return -sin(taCycle()) * 0.16 * aMot.z;
          return 0.0;
        }
        vec3 taRotX(vec3 v, float a) { return vec3(v.x, v.y * cos(a) - v.z * sin(a), v.y * sin(a) + v.z * cos(a)); }
        vec3 taRotY(vec3 v, float a) { return vec3(v.x * cos(a) + v.z * sin(a), v.y, -v.x * sin(a) + v.z * cos(a)); }`;
const ANIM_POS = `
        if (aRole > 0.5) {
          float ang = taAng(); vec3 rel = transformed - aPivot;
          if (aRole < 1.5) transformed = aPivot + taRotX(rel, ang);
          else if (aRole < 2.5) {
            vec3 lower = aJR.xyz + taRotX(transformed - aJR.xyz,taKnee());
            transformed = aPivot + taRotX(lower - aPivot,taHip());
          }
          else if (aRole < 3.5) transformed = aPivot + taRotY(rel, ang);
          else if (aRole < 4.5) transformed.z -= aMot.y * 0.42;
          else { transformed = aPivot + taRotX(rel,ang); transformed.z -= aMot.y * aJR.w * 0.18; }
        }`;
// Rotating the position without rotating the normal leaves a swinging leg lit as though it never
// moved, which reads as a flat, dead limb however far it travels.
const ANIM_NRM = `
        if (aRole > 0.5 && (aRole < 3.5 || aRole > 4.5)) {
          float ang2 = taAng();
          objectNormal = (aRole < 2.5 || aRole > 4.5) ? taRotX(objectNormal, ang2) : taRotY(objectNormal, ang2);
        }`;
/** Depth material matching the animated pose, so shadows swing with the parts that cast them. */
function animDepthMaterial() {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => {
    sh.uniforms.uStTime = STYLE_U.uStTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + ANIM_ATTRS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + ANIM_POS);
  };
  d.customProgramCacheKey = () => 'ta_anim_depth';
  return d;
}

export function makeUnitMaterial(atmoU) {
  const panel = getTextureSet('panel');
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tPanel = { value: panel.map }; shader.uniforms.tPanelN = { value: panel.normal };
    shader.fragmentShader = '#define ST_HAS_TEAM\n' + shader.fragmentShader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
` + ANIM_ATTRS + `
        attribute vec3 aTeamColor; attribute vec3 aInst; attribute float aEdge;
        #define aTeam aVA.x
        #define aGlow aVA.y
        #define aHeight aVA.z
        #define aAO aVA.w
        varying vec2 vPartMotion; varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec3 vInst; varying vec3 vObj; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2; varying float vAO; varying float vEdge;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>` + ANIM_NRM)
      .replace('#include <begin_vertex>', `#include <begin_vertex>` + ANIM_POS + `
        vPartMotion = vec2(taAng(),aRole); vTeam = aTeam; vGlow = aGlow; vHeight = aHeight; vTeamColor = aTeamColor; vInst = aInst; vObj = position; vObjN = normal; vAO = aAO; vEdge = aEdge;
        #ifdef USE_INSTANCING
        vR0 = instanceMatrix[0].xyz; vR1 = instanceMatrix[1].xyz; vR2 = instanceMatrix[2].xyz;
        #else
        vR0 = vec3(1.0, 0.0, 0.0); vR1 = vec3(0.0, 1.0, 0.0); vR2 = vec3(0.0, 0.0, 1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tPanel; uniform sampler2D tPanelN;
        varying vec2 vPartMotion; varying float vTeam; varying float vGlow; varying float vHeight; varying vec3 vTeamColor; varying vec3 vInst; varying vec3 vObj; varying vec3 vObjN; varying vec3 vR0; varying vec3 vR1; varying vec3 vR2; varying float vAO; varying float vEdge;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vInst.x < 1.0 && vHeight > vInst.x) discard;
        vec3 an = abs(normalize(vObjN)); vec3 pw = an * an * an * an; pw /= (pw.x + pw.y + pw.z);
        vec3 pp = vObj * 0.5;
        vec3 pnc = texture2D(tPanel, pp.zy, uStLod).rgb * pw.x + texture2D(tPanel, pp.xz, uStLod).rgb * pw.y + texture2D(tPanel, pp.xy, uStLod).rgb * pw.z; float pnl = dot(pnc, vec3(0.333));
        float prg = (texture2D(tPanelN, pp.zy, uStLod).a * pw.x + texture2D(tPanelN, pp.xz, uStLod).a * pw.y + texture2D(tPanelN, pp.xy, uStLod).a * pw.z - 0.3) / 0.7;
        float pnh = (texture2D(tPanel, pp.zy, uStLod).a * pw.x + texture2D(tPanel, pp.xz, uStLod).a * pw.y + texture2D(tPanel, pp.xy, uStLod).a * pw.z - 0.3) / 0.7;
        diffuseColor.rgb = mix(diffuseColor.rgb, vTeamColor * 1.08, vTeam);
        diffuseColor.rgb *= (0.8 + 0.36 * pnl) * (0.93 + 0.07 * pnh);
        float wear = vEdge * smoothstep(0.3, 0.75, pnl * 0.8 + vEdge * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.57) * (0.7 + 0.6 * pnl), wear * 0.85);
        diffuseColor.rgb *= 0.5 + 0.5 * vAO;
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 0.4, vHeight + (pnl - 0.5) * 0.3));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vInst.y * 0.7);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(0.3, 0.4, vTeam) + 0.5 * prg + (1.0 - smoothstep(0.0, 0.4, vHeight)) * 0.25, 0.15, 0.95); roughnessFactor = mix(roughnessFactor, 0.3, wear * 0.8);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(mix(0.62, 0.18, vTeam), 0.8, wear * 0.8);`)
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= 0.35 + 0.65 * vAO;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
        { float dotNV = saturate( dot( geometryNormal, geometryViewDir ) ); reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, vAO, material.roughness ); }
        #endif`)
      .replace('#include <normal_fragment_maps>', `
        vec3 uon = normalize(vObjN);
        vec3 ux = texture2D(tPanelN, pp.zy, uStLod).xyz * 2.0 - 1.0; vec3 uy = texture2D(tPanelN, pp.xz, uStLod).xyz * 2.0 - 1.0; vec3 uz = texture2D(tPanelN, pp.xy, uStLod).xyz * 2.0 - 1.0;
        ux = vec3(ux.xy + uon.zy, abs(ux.z) * uon.x); uy = vec3(uy.xy + uon.xz, abs(uy.z) * uon.y); uz = vec3(uz.xy + uon.xy, abs(uz.z) * uon.z);
        vec3 unb = normalize(mix(uon, normalize(ux.zyx * pw.x + uy.xzy * pw.y + uz.xyz * pw.z), 0.55));
        float pa = vPartMotion.x;
        if (vPartMotion.y > 0.5 && (vPartMotion.y < 2.5 || vPartMotion.y > 4.5)) unb = vec3(unb.x,unb.y*cos(pa)-unb.z*sin(pa),unb.y*sin(pa)+unb.z*cos(pa));
        else if (vPartMotion.y > 2.5 && vPartMotion.y < 3.5) unb = vec3(unb.x*cos(pa)+unb.z*sin(pa),unb.y,-unb.x*sin(pa)+unb.z*cos(pa));
        mat3 urot = mat3(normalize(vR0), normalize(vR1), normalize(vR2));
        normal = normalize((viewMatrix * vec4(urot * unb, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vTeamColor * vGlow * 0.65;
        float edge = (vInst.x < 1.0) ? (1.0 - smoothstep(0.0, 0.06, vInst.x - vHeight)) : 0.0;
        totalEmissiveRadiance += vTeamColor * edge * 1.8 + vec3(1.0) * vInst.y * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'unitmat_v2_rig';
  if (atmoU) injectFog(mat, atmoU, 'unitmat_v2_rig');
  return mat;
}
function makeInstanced(geo, cap, material) {
  const g = geo.clone();
  g.setAttribute('aTeamColor', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
  g.setAttribute('aMot', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage)); // phase, recoil, moving : rewritten every frame
  const mesh = new THREE.InstancedMesh(g, material, cap);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Without this the shadow pass renders the rest pose, so a walking bot drags a rigid silhouette.
  mesh.customDepthMaterial = animDepthMaterial();
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
      this.types[id] = { def, model, cap, n: 0, body, turret, bTeam: body.geometry.getAttribute('aTeamColor'), bInst: body.geometry.getAttribute('aInst'), bMot: body.geometry.getAttribute('aMot'), tMot: turret && turret.geometry.getAttribute('aMot'), tTeam: turret && turret.geometry.getAttribute('aTeamColor'), tInst: turret && turret.geometry.getAttribute('aInst') };
    }
  }
  setVisible(v) { for (const id in this.types) { const t = this.types[id]; t.body.visible = v; if (t.turret) t.turret.visible = v; } }
  begin() { for (const id in this.types) this.types[id].n = 0; }
  grow(t) {
    const cap = t.cap * 2;
    for (const key of ['body','turret']) {
      const old=t[key]; if(!old)continue;
      const mesh=makeInstanced(t.model[key],cap,this.material);
      mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      for(const name of ['aTeamColor','aInst','aMot'])mesh.geometry.getAttribute(name).array.set(old.geometry.getAttribute(name).array);
      this.scene.remove(old);old.geometry.dispose();old.customDepthMaterial.dispose();old.dispose();this.scene.add(mesh);t[key]=mesh;
    }
    t.cap=cap;
    for(const [prefix,key] of [['b','body'],['t','turret']])if(t[key]){
      t[prefix+'Team']=t[key].geometry.getAttribute('aTeamColor');t[prefix+'Inst']=t[key].geometry.getAttribute('aInst');t[prefix+'Mot']=t[key].geometry.getAttribute('aMot');
    }
  }
  add(defId, matrix, teamColor, progress, flash, turretMatrix, team = 0, phase = 0, recoil = 0, moving = 0) {
    const t = this.types[defId]; if (!t) return; if(t.n>=t.cap)this.grow(t); const i = t.n++;
    t.body.setMatrixAt(i, matrix); t.bTeam.setXYZ(i, teamColor[0], teamColor[1], teamColor[2]); t.bInst.setXYZ(i, progress, flash, team); t.bMot.setXYZ(i, phase, recoil, moving);
    if (t.turret) { t.turret.setMatrixAt(i, turretMatrix || matrix); t.tTeam.setXYZ(i, teamColor[0], teamColor[1], teamColor[2]); t.tInst.setXYZ(i, progress, flash, team); if (t.tMot) t.tMot.setXYZ(i, phase, recoil, moving); }
  }
  end() {
    for (const id in this.types) {
      const t = this.types[id]; t.body.count = t.n; t.body.visible = t.n > 0;
      const upload = (a, size) => { if (!a || !t.n) return; a.clearUpdateRanges(); a.addUpdateRange(0,t.n*size); a.needsUpdate = true; };
      upload(t.body.instanceMatrix,16); upload(t.bTeam,3); upload(t.bInst,3); upload(t.bMot,3);
      if (t.turret) { t.turret.count = t.n; t.turret.visible = t.n > 0; upload(t.turret.instanceMatrix,16); upload(t.tTeam,3); upload(t.tInst,3); upload(t.tMot,3); }
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
