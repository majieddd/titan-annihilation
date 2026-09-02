import * as THREE from 'three';
import { mulberry32, clamp, moveOnSphere, rotateTangent, anyTangent, TAU } from './util.js';
import { grassBladeTexture } from './textures.js';

const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _p = new THREE.Vector3();

/** camera-following field of alpha-cut grass tufts on a planet (local coordinates) */
export class GrassField {
  constructor(planet, kind, inject) {
    this.planet = planet; this.kind = kind; this.N = 7000; this.radius = 46; this.fade = 42; this.lastAnchor = new THREE.Vector3(1e9, 0, 0); this.rng = mulberry32(planet.seed ^ 0x9e37);
    const q1 = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); const q2 = q1.clone().rotateY(Math.PI / 2);
    const base = new THREE.BufferGeometry(); const pos = [], uv = [];
    for (const q of [q1, q2]) { const p = q.getAttribute('position'), u = q.getAttribute('uv'), idx = q.index; for (let i = 0; i < idx.count; i++) { const k = idx.getX(i); pos.push(p.getX(k), p.getY(k), p.getZ(k)); uv.push(u.getX(k), u.getY(k)); } }
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3); this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aInfo.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aPos', this.aPos); g.setAttribute('aInfo', this.aInfo); g.instanceCount = this.N; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), planet.R + 60);
    this.uniforms = { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uCenter: { value: planet.center }, uFade: { value: this.fade } };
    const mat = new THREE.MeshStandardMaterial({ map: grassBladeTexture(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aPos; attribute vec3 aInfo; uniform float uTime; uniform vec3 uCamPos; uniform vec3 uCenter; uniform float uFade; varying float vTint;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(aPos);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
        .replace('#include <begin_vertex>', `
          vec3 up = normalize(aPos); vec3 tg = normalize(cross(up, vec3(0.0, 1.0, 0.013))); vec3 bt = cross(up, tg);
          float cs = cos(aInfo.y), sn = sin(aInfo.y); vec3 t2 = tg * cs + bt * sn; vec3 b2 = -tg * sn + bt * cs;
          float dist = distance(aPos + uCenter, uCamPos); float sc = aInfo.x * (1.0 - smoothstep(uFade * 0.65, uFade, dist));
          float sway = sin(uTime * 1.6 + aPos.x * 0.7 + aPos.z * 0.5) * 0.14 * position.y;
          vec3 transformed = aPos + t2 * ((position.x + sway) * sc) + b2 * (position.z * sc) + up * (position.y * sc);
          vTint = aInfo.z;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTint;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.55, 0.68, 0.5), vec3(0.95, 0.92, 0.7), vTint);');
    };
    if (inject) { inject.sun(mat, planet.uniforms.uSunView, 'grass'); inject.fog(mat, planet.uniforms, 'grass_sun'); }
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false; this.mesh.visible = false; this.mesh.renderOrder = 2;
    planet.group.add(this.mesh);
  }
  update(anchorWorld, camPos, time, visible) {
    this.uniforms.uTime.value = time; this.uniforms.uCamPos.value.copy(camPos);
    this.mesh.visible = visible; if (!visible) return;
    if (anchorWorld.distanceTo(this.lastAnchor) > 7) this.rebuild(anchorWorld);
  }
  rebuild(anchorWorld) {
    const pl = this.planet; const R = pl.R; const rng = this.rng; this.lastAnchor.copy(anchorWorld);
    pl.localDir(anchorWorld, _d); anyTangent(_d, _t); const mat = pl.terrainGeo.getAttribute('aMat'); const sizeBase = this.kind === 'dry' ? 0.8 : 0.85;
    for (let i = 0; i < this.N; i++) {
      const ang = rng() * TAU, r = Math.sqrt(rng()) * this.radius;
      rotateTangent(_d, _t, ang, _t2); moveOnSphere(_d, _t2, r / R, _p);
      let ok = !pl.isWater(_p);
      if (ok) { const v = pl.lookup.nearest(_p.x, _p.y, _p.z); ok = mat.getX(v) > 0.55; }
      if (!ok) { this.aInfo.setXYZ(i, 0, 0, 0); this.aPos.setXYZ(i, 0, 0, 0); continue; }
      const h = pl.heightAt(_p) - 0.08; this.aPos.setXYZ(i, _p.x * h, _p.y * h, _p.z * h);
      this.aInfo.setXYZ(i, sizeBase * (0.6 + rng() * 0.9), rng() * TAU, rng());
    }
    this.aPos.needsUpdate = true; this.aInfo.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
