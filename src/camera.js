import * as THREE from 'three';
import { clamp, lerp, smoothstep, anyTangent, frameQuat, tangentToward, angleBetween, keyCode } from './util.js';

const _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();
const _ray = new THREE.Ray(), _sph = new THREE.Sphere(new THREE.Vector3(), 1), _hit = new THREE.Vector3(), _ndc = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);

export class PlanetCamera {
  constructor(camera, system, dom) {
    this.camera = camera; this.system = system; this.planet = system ? system.planets[0] : null; this.dom = dom; this.mode = 'planet';
    this.q = new THREE.Quaternion(); this.normal = new THREE.Vector3(0, 1, 0); this.forward = new THREE.Vector3(0, 0, 1); this.right = new THREE.Vector3(1, 0, 0); this.anchor = new THREE.Vector3();
    this.dist = 900; this.targetDist = 900; this.minDist = 9; this.keys = {}; this.enabled = true; this.shake = 0; this.shakeVec = new THREE.Vector3();
    this.dragging = false; this.dragButton = -1; this.dragMoved = 0; this.lastX = 0; this.lastY = 0; this.spin = 0; this.autoTilt = true; this.zoomLerp = 9;
    this.sysQ = new THREE.Quaternion(); this.sysDist = 7500; this.sysTarget = 7500; this.sysCenter = new THREE.Vector3();
    this.blend = 0; this.prevPos = new THREE.Vector3(); this.prevQuat = new THREE.Quaternion();
    this.onFocus = null; this.onSystem = null;
    this.setAnchor(new THREE.Vector3(0, 0, 1)); this.attach(dom);
  }
  get maxDist() { return this.planet ? this.planet.R * 4.2 : 1500; }
  setAnchor(dir, forwardHint) { if (!forwardHint) forwardHint = anyTangent(dir, _a); frameQuat(dir, forwardHint, this.q); this.updateFrame(); }
  updateFrame() { this.normal.set(0, 1, 0).applyQuaternion(this.q); this.forward.set(0, 0, 1).applyQuaternion(this.q); this.right.set(1, 0, 0).applyQuaternion(this.q); }
  moveToward(t, angle) { if (angle === 0) return; _a.crossVectors(this.normal, t); if (_a.lengthSq() < 1e-10) return; _a.normalize(); _q.setFromAxisAngle(_a, angle); this.q.premultiply(_q).normalize(); this.updateFrame(); }
  moveForward(units) { this.moveToward(this.forward, units / this.planet.R); }
  moveRight(units) { this.moveToward(this.right, units / this.planet.R); }
  yaw(angle) { _q.setFromAxisAngle(this.normal, angle); this.q.premultiply(_q).normalize(); this.updateFrame(); }
  zoom(factor, atDir) {
    const old = this.targetDist; this.targetDist = clamp(this.targetDist * factor, this.minDist, this.maxDist);
    if (atDir && this.targetDist < old) { const f = 1 - this.targetDist / old; const ang = angleBetween(this.normal, atDir); if (ang > 1e-4) { tangentToward(this.normal, atDir, _b); this.moveToward(_b, ang * f); } }
  }
  beginBlend() { this.prevPos.copy(this.camera.position); this.prevQuat.copy(this.camera.quaternion); this.blend = 1; }
  /** switch to a planet (keeps current zoom unless dist given) */
  focus(planet, dir, dist) {
    const changed = planet !== this.planet || this.mode !== 'planet'; if (changed) this.beginBlend();
    this.mode = 'planet'; this.planet = planet;
    const d = dir ? dir.clone() : this.camera.position.clone().sub(planet.center).normalize();
    if (dir || changed) this.setAnchor(d, null);
    if (dist !== undefined) this.targetDist = clamp(dist, this.minDist, this.maxDist); else this.targetDist = clamp(this.targetDist, this.minDist, this.maxDist);
    if (changed) this.dist = this.targetDist;
    if (this.onFocus) this.onFocus(planet);
  }
  enterSystem() {
    if (this.mode === 'system') return; this.beginBlend(); this.mode = 'system';
    const dir = this.camera.position.clone().sub(this.sysCenter); const len = dir.length(); dir.normalize();
    this.sysTarget = clamp(Math.max(len * 1.05, 6800), 3000, 16000); this.sysDist = Math.max(len, 3000);
    const up = new THREE.Vector3(0, 1, 0); if (Math.abs(dir.dot(up)) > 0.98) up.set(0, 0, 1);
    const x = new THREE.Vector3().crossVectors(up, dir).normalize(); const y = new THREE.Vector3().crossVectors(dir, x).normalize(); _m.makeBasis(x, y, dir); this.sysQ.setFromRotationMatrix(_m);
    if (this.onSystem) this.onSystem();
  }
  jumpTo(planet, dir, dist) {
    if (planet && planet !== this.planet || this.mode !== 'planet') { this.focus(planet || this.planet, dir, dist); return; }
    const ang = angleBetween(this.normal, dir); if (ang > 1e-5) { tangentToward(this.normal, dir, _b); this.moveToward(_b, ang); }
    if (dist !== undefined) this.targetDist = clamp(dist, this.minDist, this.maxDist);
  }
  addShake(v) { this.shake = Math.min(3, this.shake + v); }
  get tilt() { return this.autoTilt ? lerp(1.0, 0.1, smoothstep(14, this.maxDist * 0.6, this.dist)) : 0.9; }
  update(dt) {
    const k = this.keys; const cam = this.camera;
    if (this.mode === 'planet') {
      const R = this.planet.R;
      if (this.enabled) {
        const sp = this.dist * 1.1 * dt;
        if (k.KeyW || k.ArrowUp) this.moveForward(sp); if (k.KeyS || k.ArrowDown) this.moveForward(-sp);
        if (k.KeyA || k.ArrowLeft) this.moveRight(-sp); if (k.KeyD || k.ArrowRight) this.moveRight(sp);
        if (k.KeyQ) this.yaw(dt * 1.4); if (k.KeyE) this.yaw(-dt * 1.4);
      }
      if (this.spin) this.moveRight(this.spin * dt * R);
      this.dist = lerp(this.dist, this.targetDist, 1 - Math.exp(-dt * this.zoomLerp));
      const surf = this.planet.heightAt(this.normal); this.anchor.copy(this.planet.center).addScaledVector(this.normal, surf);
      const t = this.tilt; const pos = cam.position;
      pos.copy(this.anchor).addScaledVector(this.normal, this.dist * Math.cos(t)).addScaledVector(this.forward, -this.dist * Math.sin(t));
      _c.copy(pos).sub(this.planet.center); const len = _c.length(); _c.multiplyScalar(1 / len);
      const minR = this.planet.heightAt(_c) + 3.5; if (len < minR) pos.copy(this.planet.center).addScaledVector(_c, minR);
      for (const p of this.system.planets) { if (p === this.planet) continue; _d.copy(pos).sub(p.center); const l = _d.length(); if (l < p.R + 40) pos.copy(p.center).addScaledVector(_d.normalize(), p.R + 40); }
      if (this.shake > 0.001) { this.shake *= Math.exp(-dt * 4); this.shakeVec.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake * 0.6); pos.add(this.shakeVec); } else this.shake = 0;
      cam.up.copy(this.normal).multiplyScalar(Math.sin(t)).addScaledVector(this.forward, Math.cos(t)); cam.lookAt(this.anchor);
    } else {
      if (this.enabled) {
        if (k.KeyA || k.ArrowLeft) this.sysYaw(dt * 0.9); if (k.KeyD || k.ArrowRight) this.sysYaw(-dt * 0.9);
        if (k.KeyW || k.ArrowUp) this.sysPitch(dt * 0.6); if (k.KeyS || k.ArrowDown) this.sysPitch(-dt * 0.6);
      }
      if (this.spin) this.sysYaw(this.spin * dt * 8);
      this.sysDist = lerp(this.sysDist, this.sysTarget, 1 - Math.exp(-dt * 5));
      _a.set(0, 0, 1).applyQuaternion(this.sysQ); cam.position.copy(this.sysCenter).addScaledVector(_a, this.sysDist);
      cam.up.set(0, 1, 0).applyQuaternion(this.sysQ); cam.lookAt(this.sysCenter); this.anchor.copy(this.sysCenter);
    }
    if (this.blend > 0) { this.blend = Math.max(0, this.blend - dt / 0.8); const b = this.blend * this.blend * (3 - 2 * this.blend); cam.position.lerp(this.prevPos, b); cam.quaternion.slerp(this.prevQuat, b); }
    const d = this.mode === 'planet' ? this.dist : this.sysDist;
    cam.near = clamp(d * 0.012, 0.5, 80); cam.far = 80000; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  sysYaw(a) { _q.setFromAxisAngle(Y_AXIS, a); this.sysQ.premultiply(_q).normalize(); }
  sysPitch(a) { _q.setFromAxisAngle(X_AXIS, a); this.sysQ.multiply(_q).normalize(); }
  worldToScreen(p, out) {
    _ndc.copy(p).project(this.camera); const w = this.dom.clientWidth, h = this.dom.clientHeight;
    out.x = (_ndc.x * 0.5 + 0.5) * w; out.y = (-_ndc.y * 0.5 + 0.5) * h; out.z = _ndc.z; return _ndc.z < 1 && _ndc.z > -1;
  }
  /** returns { planet, dir } under the screen pixel or null */
  pickPlanet(px, py, out) {
    const w = this.dom.clientWidth, h = this.dom.clientHeight;
    _ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5);
    _ray.origin.setFromMatrixPosition(this.camera.matrixWorld); _ray.direction.copy(_ndc).unproject(this.camera).sub(_ray.origin).normalize();
    let best = null, bt = Infinity;
    for (const p of this.system.planets) { _sph.center.copy(p.center); _sph.radius = p.R + 28; const hit = _ray.intersectSphere(_sph, _hit); if (hit) { const t = hit.distanceTo(_ray.origin); if (t < bt) { bt = t; best = p; } } }
    if (!best) return null;
    _sph.center.copy(best.center); let r = best.R + 6; let hit = null;
    for (let i = 0; i < 4; i++) {
      _sph.radius = r; hit = _ray.intersectSphere(_sph, _hit);
      if (!hit) { if (i === 0) { _sph.radius = best.R + 28; hit = _ray.intersectSphere(_sph, _hit); if (!hit) return null; } else break; }
      _d.copy(hit).sub(best.center).normalize(); r = best.heightAt(_d);
    }
    const dir = out || new THREE.Vector3(); dir.copy(_d); return { planet: best, dir };
  }
  attach(dom) {
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('mousedown', (e) => { if (e.button === 1 || e.button === 2) { this.dragging = true; this.dragButton = e.button; this.dragMoved = 0; this.lastX = e.clientX; this.lastY = e.clientY; if (e.button === 1) e.preventDefault(); } });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; this.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (this.dragMoved < 4 && this.dragButton === 2) return;
      if (this.mode === 'system') { this.sysYaw(-dx * 0.005); this.sysPitch(-dy * 0.004); return; }
      const upp = 2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / dom.clientHeight; const f = Math.max(0.6, Math.cos(this.tilt));
      this.moveRight(-dx * upp); this.moveForward(dy * upp / f);
    });
    window.addEventListener('mouseup', (e) => { if (e.button === this.dragButton) { this.dragging = false; this.dragButton = -1; } });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault(); if (!this.planet) return;
      const factor = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
      if (this.mode === 'planet') {
        if (factor > 1 && this.targetDist >= this.maxDist * 0.98) { this.enterSystem(); return; }
        const pick = factor < 1 ? this.pickPlanet(e.clientX, e.clientY, _d) : null;
        this.zoom(factor, pick && pick.planet === this.planet ? pick.dir : null);
      } else {
        this.sysTarget = clamp(this.sysTarget * factor, 2600, 16000);
        if (factor < 1 && this.sysTarget <= 2700) { const pick = this.pickPlanet(e.clientX, e.clientY, _d); const p = pick ? pick.planet : this.system.nearest(this.camera.position); this.focus(p, pick ? pick.dir : null, p.R * 3.5); }
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.target && (e.target.tagName === 'INPUT')) return; this.keys[keyCode(e)] = true; });
    window.addEventListener('keyup', (e) => { this.keys[keyCode(e)] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.dragging = false; });
  }
}
