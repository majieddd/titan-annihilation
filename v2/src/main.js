import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STYLES, STYLE_U, styleById, applyStyleUniforms } from './style.js';
import { StarSystem } from './system.js';
import { setPropCards } from './planet.js';
import { PlanetCamera } from './camera.js';
import { Game } from './sim.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { ModelPortraits } from './portraits.js';
import { TacticalUI } from './tactical.js';
import { Effects } from './effects.js';
import { UnitRenderer } from './models.js';
import { GameAudio } from './audio.js';
import { TEAM_COLORS } from './defs.js';
import { setAnisotropy, setTextureSize, nebulaTexture } from './textures.js';
import { loadRealTextures, TEX_KINDS } from './assets.js';
import { mulberry32, hashString, clamp, Simplex, VERSION, TAU } from './util.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const app = { state: 'loading', paused: false, settings: { difficulty: 'normal', biome: 'earth', seed: 'titan', quality: 'high', planets: 3, style: 'tactical', adaptive: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, volume: 0.45 }, game: null, ai: null, system: null, fx: null, fxGroup: null };
try { const s = JSON.parse(localStorage.getItem('ta_v2_settings') || 'null'); if (s) Object.assign(app.settings, s); } catch (e) { }
if (!['medium', 'high', 'ultra'].includes(app.settings.quality)) app.settings.quality = 'high';
if (![2, 3, 4, 5].includes(app.settings.planets)) app.settings.planets = 3;
if (!STYLES.some((s) => s.id === app.settings.style)) app.settings.style = 'tactical';
window.__app = app;

// ---------- renderer / scene ----------
const canvas = $('gl'); app.canvas = canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.info.autoReset = false; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
setAnisotropy(renderer.capabilities.getMaxAnisotropy());
app.renderer = renderer;
const scene = new THREE.Scene(); app.scene = scene;
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 80000);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.1); sun.castShadow = true;
sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.22; sun.shadow.camera.near = 100; sun.shadow.camera.far = 1300;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a2a1a, 0.15); scene.add(hemi);
const fill = new THREE.DirectionalLight(0xa8c8ff, 0); fill.castShadow = false; scene.add(fill); scene.add(fill.target);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5; pmrem.compileCubemapShader();
// dynamic image-based lighting: a cube capture of the real sky/terrain around the camera anchor, filtered by PMREM
const envRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
const envCam = new THREE.CubeCamera(2, 70000, envRT); envCam.children.forEach((c) => c.layers.enable(1)); let envTarget = null; let envT = -1e9; const _envN = new THREE.Vector3();
function updateEnvironment(now, force) {
  const p = cam.planet; if (!p || (cam.mode === 'system' && !force) || (!force && now - envT < 12000)) return; envT = now;
  const hid = []; for (const o of [app.fxGroup]) if (o && o.visible) { o.visible = false; hid.push(o); }
  if (unitRenderer) unitRenderer.setVisible(false);
  _envN.copy(cam.anchor).sub(p.center).normalize(); envCam.position.copy(cam.anchor).addScaledVector(_envN, 30);
  const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false; envCam.update(renderer, scene); renderer.shadowMap.autoUpdate = sm;
  for (const o of hid) o.visible = true; if (unitRenderer) unitRenderer.setVisible(true);
  const old = envTarget; envTarget = pmrem.fromCubemap(envRT.texture); scene.environment = envTarget.texture; scene.environmentIntensity = app.style ? app.style.light.env : 1.0; if (old) old.dispose();
}

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) }));
const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
const gtao = new GTAOPass(scene, camera, 1, 1); gtao.enabled = false; gtao.blendIntensity = 0.7; composer.addPass(gtao);
// layer 1 = alpha-tested / volumetric surfaces (foliage cards, grass, clouds, sky shell): drawn normally but excluded from the AO depth pass
camera.layers.enable(1); sun.shadow.camera.layers.enable(1);
{ const r = gtao.render.bind(gtao); gtao.render = (...a) => { camera.layers.disable(1); const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false; r(...a); renderer.shadowMap.autoUpdate = sm; camera.layers.enable(1); }; }
const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// ink / outline pass: depth + reconstructed-normal edges from the scene depth texture
const edgePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uNear: { value: 1 }, uFar: { value: 1000 }, uProjInv: { value: new THREE.Matrix4() }, uThick: { value: 1.5 }, uDepthT: { value: 0.05 }, uNormalT: { value: 0.35 }, uStrength: { value: 1 }, uBoil: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uWidth: { value: 3 }, uStepAbs: { value: 0.55 }, uCrease: { value: 0.55 }, uTaper: { value: 0.55 }, uColor: { value: new THREE.Vector3(0, 0, 0) } },
  vertexShader: QUAD_VS,
  // Ink model. The old one took the second derivative of depth, which is a HAIRLINE: it marks only
  // the one pixel where curvature peaks, so the line came out thin, broken and mushy, and widening it
  // via the sampling radius only made the detector fire on coarser clutter. Instead ask, for every
  // pixel, "is anything NEARER than me within uWidth pixels?" : the minimum depth over a small disc.
  // That paints a solid, even band of exactly uWidth on the far side of every silhouette, which is how
  // a pen actually behaves, and it cannot dash because a minimum over a disc varies continuously.
  // Requiring the step to clear an absolute world-space size is also a far better clutter filter than
  // the screen-space one it replaces: grass stands a few centimetres proud of the ground and never
  // qualifies, while a tree or a tank always does.
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uThick, uDepthT, uNormalT, uStrength, uBoil, uFade, uTime, uWidth, uStepAbs, uCrease, uTaper; uniform vec3 uColor; uniform mat4 uProjInv; varying vec2 vUv;
    float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    vec3 vpos(vec2 uv, float d) { vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    void main(){
      vec2 uv = vUv; vec4 col = texture2D(tDiffuse, vUv);
      if (uBoil > 0.0) { float t = floor(uTime * 8.0); uv += (vec2(fract(sin(t * 12.99) * 43758.5), fract(sin(t * 78.23) * 43758.5)) - 0.5) * uTexel * 2.0 * uBoil; }
      float d0 = texture2D(tDepth, uv).r; float z0 = lin(d0);
      // The sky is left in deliberately: at depth 1.0 it reads as maximally far, so sky pixels beside a
      // silhouette take the ink and every object gets a proper outline against it.
      // Constant screen-space width. A distance taper was tried and is wrong here: this detector inks
      // the pixel whose NEIGHBOUR is nearer, so an object's outline is painted on the background
      // behind it : and against the sky that background is the far plane at 80000, which pinned the
      // taper to its minimum and drew every silhouette against the sky at 55% width, at any range.
      // The opacity fade below already does the distance dissolve, and it keys off the near surface.
      float wpx = uWidth;
      // Twelve fixed rays make the isoline around a small feature a visible dodecagon and let anything
      // thinner than the ray spacing fall between them and dash. Rotating the ring by a quarter step
      // across a 2x2 pixel quad gives 48 effective angles for no extra fetches; the residual 1px
      // stipple is absorbed by the multisampled target.
      float ph = (mod(floor(gl_FragCoord.x), 2.0) + 2.0 * mod(floor(gl_FragCoord.y), 2.0)) * 0.1308997;
      // A neighbour only earns a line if it is ink-eligible. Grass writes alpha 0 (see foliage.js) and
      // so can never lower zmin, which is what keeps a hillside of tufts from turning to black stipple
      // while a bot of the very same height still gets a full outline.
      float zmin = z0;
      for (int i = 0; i < 12; i++) {
        vec2 dir = vec2(cos(float(i) * 0.5235988 + ph), sin(float(i) * 0.5235988 + ph));
        vec2 o1 = dir * uTexel * wpx, o2 = o1 * 0.55;
        float z1 = lin(texture2D(tDepth, uv + o1).r), a1 = texture2D(tDiffuse, uv + o1).a;
        float z2 = lin(texture2D(tDepth, uv + o2).r), a2 = texture2D(tDiffuse, uv + o2).a;
        zmin = min(zmin, mix(z0, z1, step(0.5, a1)));
        zmin = min(zmin, mix(z0, z2, step(0.5, a2)));
      }
      // Absolute floor rejects near-field clutter; the relative term keeps the line scale-free at range.
      float need = max(uStepAbs, uDepthT * z0);
      float eSil = smoothstep(need, need * 1.22, z0 - zmin);
      // Interior creases stay thin and separately controlled, the way ink is lighter inside a shape
      // than around its edge.
      vec2 o = uTexel * uThick;
      float dL = texture2D(tDepth, uv - vec2(o.x, 0.0)).r, dR = texture2D(tDepth, uv + vec2(o.x, 0.0)).r;
      float dD = texture2D(tDepth, uv - vec2(0.0, o.y)).r, dU = texture2D(tDepth, uv + vec2(0.0, o.y)).r;
      vec3 P = vpos(uv, d0); vec3 Px = vpos(uv + vec2(o.x, 0.0), dR) - P; vec3 Py = vpos(uv + vec2(0.0, o.y), dU) - P;
      vec3 n0 = normalize(cross(Px, Py));
      vec3 PL = vpos(uv - vec2(o.x, 0.0), dL); vec3 PD = vpos(uv - vec2(0.0, o.y), dD);
      vec3 n1 = normalize(cross(P - PL, Py)); vec3 n2 = normalize(cross(Px, P - PD));
      float eN = smoothstep(uNormalT, uNormalT + 0.3, max(1.0 - dot(n0, n1), 1.0 - dot(n0, n2))) * (1.0 - step(0.9999, d0));
      float zn = min(z0, zmin);
      // The screen-space clutter heuristic that used to live here is gone. It was a proxy for "this is
      // foliage, do not ink it", and it guessed wrong often enough to chew real silhouettes into
      // dashes. Foliage now says so itself through the alpha channel, which is exact.
      // Note the eligibility test is only on the NEIGHBOUR, never on the pixel being drawn: the band
      // lands on whatever is behind an object, and that is often grass. Gating the centre pixel too
      // would chew a unit's outline into dashes wherever it happens to stand in long grass.
      float e = clamp(max(eSil, eN * uCrease) * uStrength, 0.0, 1.0);
      if (uFade > 0.0) e *= exp(-zn / uFade); // ink dissolves into the haze with distance
      gl_FragColor = vec4(mix(col.rgb, uColor, e), col.a); }` });
edgePass.enabled = false; composer.insertPass(edgePass, 1);
// Ink width is authored in CSS pixels; uTexel is in device pixels, so it is rescaled on every resize.
let edgeWidthCss = 3;
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.5, 0.92); composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uSat: { value: 1.08 }, uCon: { value: 1.06 }, uVig: { value: 0.4 }, uSharp: { value: 0.22 }, uCA: { value: 0.006 }, uGrain: { value: 0.03 }, uPoster: { value: 0 }, uPaper: { value: 0 }, uDots: { value: 0 }, uDotSize: { value: 6 }, uTime: { value: 0 }, uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: QUAD_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uSat, uCon, uVig, uSharp, uCA, uGrain, uPoster, uPaper, uDots, uDotSize, uTime; uniform vec3 uShadowTint, uHighTint; varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
    float dotPat(vec2 fc, float ang, float spacing, float size) { mat2 rot = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)); vec2 g = fract(rot * fc / spacing) - 0.5; return smoothstep(size - 0.22, size + 0.22, length(g) * 2.0); }
    void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d); float ca = uCA * r2;
      vec3 col; col.r = texture2D(tDiffuse, vUv + d * ca).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv - d * ca).b;
      if (uSharp > 0.0) { vec3 nb = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb; col = max(col + (col * 4.0 - nb) * uSharp, 0.0); }
      float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, uSat); col = (col - 0.5) * uCon + 0.5;
      float t = clamp(lum / (1.0 + lum), 0.0, 1.0); col *= mix(uShadowTint, uHighTint, t);
      if (uPoster > 0.5) { vec3 c2 = col / (1.0 + col); c2 = floor(c2 * uPoster + 0.5) / uPoster; col = c2 / max(1.0 - c2, 1e-3); }
      if (uDots > 0.0) { float lm = lum / (1.0 + lum); float sz = (1.0 - lm) * 1.1; vec3 pat = vec3(dotPat(gl_FragCoord.xy, 0.26, uDotSize, sz), dotPat(gl_FragCoord.xy, 0.79, uDotSize, sz), dotPat(gl_FragCoord.xy, 1.31, uDotSize, sz)); col *= mix(vec3(1.0), pat, uDots); }
      if (uPaper > 0.0) { float p = hash(floor(vUv * vec2(900.0, 500.0))); col *= mix(1.0, mix(0.9, 1.1, p), uPaper); col = mix(col, col * vec3(1.03, 0.99, 0.93), uPaper * 0.6); }
      if (uGrain > 0.0) { float g = hash(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5; col += g * uGrain * (0.3 + lum); }
      float vig = 1.0 - smoothstep(0.35, 1.25, r2 * 1.7) * uVig; col *= vig; gl_FragColor = vec4(max(col, 0.0), 1.0); }` });
composer.addPass(grade);
const TILT_FS = `uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform vec2 uDir; uniform float uAmount, uFocus, uWidth; varying vec2 vUv;
  void main(){ float f = smoothstep(uWidth, uWidth + 0.35, abs(vUv.y - uFocus)); float r = uAmount * f; vec4 c = vec4(0.0); float ws = 0.0;
    for (int i = -4; i <= 4; i++) { float w = exp(-float(i * i) / 6.0); c += texture2D(tDiffuse, vUv + uDir * uTexel * r * float(i) / 4.0) * w; ws += w; } gl_FragColor = c / ws; }`;
const mkTilt = (dx, dy) => new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uDir: { value: new THREE.Vector2(dx, dy) }, uAmount: { value: 5 }, uFocus: { value: 0.5 }, uWidth: { value: 0.2 } }, vertexShader: QUAD_VS, fragmentShader: TILT_FS });
const tiltH = mkTilt(1, 0), tiltV = mkTilt(0, 1); tiltH.enabled = tiltV.enabled = false; composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new OutputPass());
const TONE = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, cineon: THREE.CineonToneMapping, reinhard: THREE.ReinhardToneMapping };
const _fillDir = new THREE.Vector3();
app.styleU = STYLE_U; app.passes = { edgePass, gtao, bloom, grade, tiltH, tiltV, composer };
app.setStyle = (id) => {
  const st = styleById(id); app.style = st; app.settings.style = st.id; try { localStorage.setItem('ta_v2_settings', JSON.stringify(app.settings)); } catch (e) { }
  applyStyleUniforms(st.mat); STYLE_U.uStKey.value = st.light.sun / Math.PI;
  sun.intensity = st.light.sun; sun.color.set(st.light.sunColor); hemi.intensity = st.light.hemi; fill.intensity = st.light.fill; fill.color.set(st.light.fillColor); scene.environmentIntensity = st.light.env;
  const p = st.post; app.bloomBase = p.bloom[0]; bloom.strength = p.bloom[0]; bloom.radius = p.bloom[1]; bloom.threshold = p.bloom[2];
  edgePass.enabled = !!p.edge; if (p.edge) { const u = edgePass.uniforms; u.uThick.value = p.edge.thick; u.uDepthT.value = p.edge.depthT; u.uNormalT.value = p.edge.normalT; u.uStrength.value = p.edge.strength; u.uBoil.value = p.edge.boil; u.uFade.value = p.edge.fade || 0; u.uStepAbs.value = p.edge.stepAbs !== undefined ? p.edge.stepAbs : 0.55; u.uCrease.value = p.edge.crease !== undefined ? p.edge.crease : 0.55; u.uTaper.value = p.edge.taper !== undefined ? p.edge.taper : 0.55; edgeWidthCss = p.edge.width !== undefined ? p.edge.width : 3; u.uWidth.value = edgeWidthCss * renderer.getPixelRatio(); u.uColor.value.set(...p.edge.color); }
  tiltH.enabled = tiltV.enabled = !!p.tilt; if (p.tilt) for (const t of [tiltH, tiltV]) { t.uniforms.uAmount.value = p.tilt.amount; t.uniforms.uFocus.value = p.tilt.focus; t.uniforms.uWidth.value = p.tilt.width; }
  const g = grade.uniforms, gr = p.grade; g.uSat.value = gr.sat; g.uCon.value = gr.con; g.uVig.value = gr.vig; g.uSharp.value = gr.sharp; g.uCA.value = gr.ca; g.uGrain.value = gr.grain; g.uPoster.value = gr.poster; g.uPaper.value = gr.paper; g.uDots.value = p.halftone ? p.halftone.dots : 0; g.uDotSize.value = p.halftone ? p.halftone.size : 6; g.uShadowTint.value.set(...gr.shadowTint); g.uHighTint.value.set(...gr.highTint);
  renderer.toneMapping = TONE[p.tone] || THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = p.exposure;
  gtao.enabled = app.settings.quality !== 'medium' && p.gtao !== false;
  if (app.system) for (const pl of app.system.planets) { if (!pl.atBase) pl.atBase = { I: pl.uniforms.uAtI.value, K: pl.uniforms.uAtK.value }; pl.uniforms.uAtI.value = pl.atBase.I * st.atmo.sunI; pl.uniforms.uAtK.value = pl.atBase.K * st.atmo.aerial; }
  envT = -1e9; if (app.ui) app.ui.syncStyle();
  // Mesh layout is fixed for a match. A material choice must never reset player state.
  if (app.tacticalUI) app.tacticalUI.syncSettings();
};
app.cycleStyle = (dir) => { const i = STYLES.findIndex((s) => s.id === (app.style ? app.style.id : app.settings.style)); app.setStyle(STYLES[(i + dir + STYLES.length) % STYLES.length].id); };


const QUALITY = {
  medium: { pixels: 1100000, ratio: 1, shadow: 1024, samples: 0 },
  high: { pixels: 1900000, ratio: 1.5, shadow: 2048, samples: 2 },
  ultra: { pixels: 3600000, ratio: 2, shadow: 4096, samples: 4 },
};
app.renderScale = 1; app.performance = { fps: 0, frameMs: 16.7, slow: 0, fast: 0 };
function applyResolution() {
  const q = QUALITY[app.settings.quality];
  const dpr = Math.min(devicePixelRatio, q.ratio, Math.sqrt(q.pixels / Math.max(1, innerWidth * innerHeight))) * app.renderScale;
  renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); resize();
}
function applyQuality() {
  const q = QUALITY[app.settings.quality]; app.renderScale = 1;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt.samples !== q.samples) { rt.samples = q.samples; rt.dispose(); }
  }
  if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow,q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  setTextureSize(app.settings.quality === 'medium' ? 512 : 768);
  gtao.enabled = app.settings.quality !== 'medium' && !(app.style && app.style.post.gtao === false);
  applyResolution();
}
app.applyQuality = applyQuality;
function trackFrame(dt) {
  if (document.hidden || dt <= 0 || dt > 0.5 || app.generating) return;
  const p = app.performance; p.frameMs += (dt * 1000 - p.frameMs) * 0.06; p.fps = Math.round(1000 / p.frameMs);
  if (!app.settings.adaptive) return;
  p.slow = p.frameMs > 27 ? p.slow + dt : 0; p.fast = p.frameMs < 17.7 ? p.fast + dt : 0;
  if (p.slow > 2.5 && app.renderScale > 0.65) { app.renderScale = Math.max(0.65,app.renderScale - 0.1); p.slow = 0; applyResolution(); }
  if (p.fast > 8 && app.renderScale < 1) { app.renderScale = Math.min(1,app.renderScale + 0.05); p.fast = 0; applyResolution(); }
}

function setupSky() {
  const rng = mulberry32(7); const n = 2600; const p = new Float32Array(n * 3); const c = new Float32Array(n * 3); const s = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3(rng() - .5, rng() - .5, rng() - .5).normalize().multiplyScalar(40000); p.set([v.x, v.y, v.z], i * 3); const col = new THREE.Color().setHSL(0.55 + (rng() - .5) * 0.3, 0.5, 0.6 + rng() * 0.4); c.set([col.r, col.g, col.b], i * 3); s[i] = 0.45 + Math.pow(rng(), 5) * 1.8; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({ vertexColors: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aSize; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize * 1.7; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.08, 0.5, length(d)); gl_FragColor = vec4(vC*a*1.2, a); }' });
  const stars = new THREE.Points(g, m); stars.frustumCulled = false; scene.add(stars);
  const neb = new THREE.Mesh(new THREE.SphereGeometry(60000, 48, 24), new THREE.MeshBasicMaterial({ map: nebulaTexture(new Simplex(mulberry32(5))), color: 0x283b49, side: THREE.BackSide, depthWrite: false })); neb.renderOrder = -10; neb.frustumCulled = false; scene.add(neb);
}

app.atmoU = { uAtC: { value: new THREE.Vector3() }, uAtR: { value: 1 }, uAtRa: { value: 1 }, uAtHr: { value: 1 }, uAtHm: { value: 1 }, uAtI: { value: 0 }, uAtOn: { value: 0 }, uAtBr: { value: new THREE.Vector3() }, uAtBm: { value: 0 }, uAtSun: { value: new THREE.Vector3(0, 0, 1) }, uAtK: { value: 0.1 } };
let unitRenderer = null;
const audio = new GameAudio(); app.audio = audio; audio.setVolume(app.settings.volume);
const cam = new PlanetCamera(camera, null, canvas); app.cam = cam; cam.reducedMotion = app.settings.reducedMotion;
const ui = new UI(app); app.ui = ui;
app.tacticalUI = new TacticalUI(app);
cam.onFocus = (p) => { app.system.setFocus(p); envT = -1e9; hemi.color.setRGB(...p.biome.hemiSky); hemi.groundColor.setRGB(...p.biome.hemiGround); ui.barDirty = true; };
cam.onSystem = () => { ui.barDirty = true; };

let createWorld = async function () {
  app.generating = true; $('loading').classList.remove('hidden');
  if (app.system) { scene.remove(app.system.group); app.system.dispose(); }
  if (app.fx && app.fx.dispose) app.fx.dispose();
  if (app.fxGroup) scene.remove(app.fxGroup);
  // The frame loop skips everything while generating, but the camera and effects still hold the
  // disposed world across the await below. Drop those references now so a stray touch fails loudly
  // instead of reading freed GPU buffers.
  app.system = null; app.fx = null; app.fxGroup = null; cam.system = null; cam.planet = null;
  const s = app.settings; const q = s.quality;
  const stWorld = (app.style && app.style.world) || (styleById(app.settings.style).world) || {};
  const detailMain = 7; app.worldDetail = detailMain;
  setPropCards(false); app.worldCards = false;
  const system = new StarSystem({ seed: hashString(String(s.seed || 'titan')), biome: s.biome, planetCount: s.planets, quality: q, detailMain, detailOther: 6 });
  await system.generateAsync((msg) => { $('loadingText').textContent = msg.toUpperCase(); }); scene.add(system.group);
  app.system = system; cam.system = system; cam.planet = system.planets[0];
  app.fxGroup = new THREE.Group(); scene.add(app.fxGroup);
  app.fx = new Effects(app.fxGroup, system, app.atmoU); app.fx.setViewport(innerWidth, innerHeight);
  app.focusPlanet(system.planets[0], null, 780);
  app.generating = false; app.worldUsed = false; $('loading').classList.add('hidden');
  if (app.style) app.setStyle(app.style.id); // after generating clears, so a mesh request made mid-build can still rebuild
};
// Generation is the one long await between the player and a playable game. If it throws, the guard
// flag stays set and the frame loop returns forever: a black screen under a loading card, with no
// error anywhere the player can see. Always clear the flag, and say what happened.
const createWorldRaw = createWorld;
createWorld = async function () {
  try { await createWorldRaw(); } catch (err) {
    app.generating = false;
    console.error('world generation failed', err);
    $('loadingText').textContent = 'GENERATION FAILED - RELOAD';
    throw err;
  }
};
app.focusPlanet = (planet, dir, dist) => { cam.focus(planet, dir, dist); };
app.regenPlanet = async () => { if (app.generating) return; $('loadingText').textContent = 'FORGING SYSTEM'; applyQuality(); await createWorld(); setupMenuCamera(); };
function setupMenuCamera() { const p = app.system.planets[0]; cam.mode = 'planet'; cam.planet = p; cam.blend = 0; cam.setAnchor(p.spawns[0].dir.clone()); cam.dist = 820; cam.targetDist = 820; cam.spin = app.settings.reducedMotion ? 0 : 0.012; cam.enabled = false; app.system.setFocus(p); }

app.startGame = async () => {
  if (app.generating) return;
  app.ui.reset(); $('menu').classList.add('hidden'); $('gameover').classList.add('hidden');
  if (app.game || app.worldUsed) { app.game = null; app.state = 'menu'; await createWorld(); } app.worldUsed = true;
  const main = app.system.planets[0];
  const game = new Game({ system: app.system, fx: app.fx, audio, settings: app.settings }); app.game = game;
  game.onEvent = (e) => { ui.onEvent(e); if (e.type === 'gameover') onGameOver(e.winner); };
  app.ai = new AI(game, 1, app.settings.difficulty);
  game.spawnCommander(0, main.spawns[0].dir); game.spawnCommander(1, main.spawns[1].dir);
  cam.spin = 0; cam.enabled = true; cam.mode = 'planet'; cam.planet = main; cam.blend = 0;
  cam.setAnchor(main.spawns[0].dir.clone(), game.facing(0, main, main.spawns[0].dir, new THREE.Vector3())); cam.dist = app.settings.reducedMotion ? 95 : 330; cam.targetDist = 95; app.system.setFocus(main);
  acc = 0; simTime = 0; app.introT = app.settings.reducedMotion ? 0 : 2.2; app.overShown = false;
  app.state = 'playing'; app.paused = false; $('hud').classList.remove('hidden'); $('pauseTag').classList.add('hidden');
  audio.init(); audio.resume(); ui.barDirty = true; ui.select([game.teams[0].commander]); if (app.tacticalUI) app.tacticalUI.reset();
  ui.alert(`Commander inbound to ${main.name}. Difficulty: ${app.settings.difficulty.toUpperCase()} · ${app.system.planets.length} planets`, 'info', null);
};
function onGameOver(winner) { app.state = 'over'; app.overT = 0; app.winner = winner; if (winner === 0) audio.victory(); else audio.defeat(); }
app.toMenu = async () => { if (app.generating) return; app.state = 'menu'; app.game = null; app.ai = null; ui.reset(); $('hud').classList.add('hidden'); $('gameover').classList.add('hidden'); await createWorld(); setupMenuCamera(); $('menu').classList.remove('hidden'); };
app.togglePause = () => { if (app.state !== 'playing') return; app.paused = !app.paused; $('pauseTag').classList.toggle('hidden', !app.paused); ui.selDirty = true; };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  // composer.setSize already sizes bloom and GTAO at the device pixel ratio. Sizing them again in
  // CSS pixels (as this used to) undid that and halved effective resolution on retina displays.
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (app.fx) app.fx.setViewport(w, h);
  const pr = renderer.getPixelRatio();
  const tx = 1 / (w * pr), ty = 1 / (h * pr);
  grade.uniforms.uTexel.value.set(tx, ty);
  edgePass.uniforms.uTexel.value.set(tx, ty);
  edgePass.uniforms.uWidth.value = edgeWidthCss * pr;
  tiltH.uniforms.uTexel.value.set(tx, ty);
  tiltV.uniforms.uTexel.value.set(tx, ty);
  // Ambient occlusion is by far the most expensive pass and its result is low frequency, so it runs
  // at a fraction of the render resolution. Full resolution cost the house style a third of its
  // frame rate for no visible gain.
  gtao.setSize(Math.max(2, Math.round(w * pr * 0.55)), Math.max(2, Math.round(h * pr * 0.55)));
}
addEventListener('resize', applyResolution);
document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; if (document.hidden && !app.testHarness && app.state === 'playing' && !app.paused) app.togglePause(); });
document.addEventListener('pointerdown', () => { audio.init(); audio.resume(); }, { capture: true });

// ---------- render ----------
const _renderQ = new THREE.Quaternion(), _viewVector = new THREE.Vector3();
const _m = new THREE.Matrix4(), _tm = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _rm = new THREE.Matrix4(), _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _sunDir = new THREE.Vector3();
function renderUnits(time, alpha = 1, dt = 0) {
  const g = app.game; unitRenderer.begin();
  if (g) {
    for (const u of g.units) {
      if (u.dead) continue; if (u.progress <= 0 && u.team !== 0) continue;
      const dc = camera.position.distanceTo(u.pos);
      _viewVector.copy(camera.position).sub(u.planet.center);
      if (!u.transit && u.drop <= 0 && u.dir.dot(_viewVector) < u.planet.R - 20) continue;
      if (!u.transit && u.drop <= 0 && dc > Math.max(500, u.def.radius * 180)) continue;
      const interpolate = u.prevPos.distanceToSquared(u.pos) < 10000 && !app.paused;
      _pos.copy(u.prevPos).lerp(u.pos, interpolate ? alpha : 1);
      _renderQ.copy(u.prevQuat).slerp(u.quat, interpolate ? alpha : 1);
      const prog = (u.progress <= 0) ? 0.04 : u.progress;
      u.visualMotion += ((u.moving ? Math.min(1, u.speed / Math.max(1, u.def.speed) * 1.6) : 0) - u.visualMotion) * (1 - Math.exp(-dt * 14));
      _m.compose(_pos, _renderQ, _one); let tm = null;
      if (u.def.hasTurret) { const pv = unitRenderer.models[u.def.id].pivot; _pm.makeTranslation(pv[0], pv[1], pv[2]); _rm.makeRotationY(u.prevTurret + Math.atan2(Math.sin(u.turret - u.prevTurret), Math.cos(u.turret - u.prevTurret)) * (app.paused ? 1 : alpha)); tm = _tm.copy(_m).multiply(_pm).multiply(_rm); }
      const blend = app.paused ? 1 : alpha;
      const gait = u.prevPhase + ((u.phase - u.prevPhase + TAU) % TAU) * blend;
      unitRenderer.add(u.def.id, _m, TEAM_COLORS[u.team], prog, u.flash, tm, u.team, gait, u.prevRecoil + (u.recoil - u.prevRecoil) * blend, u.visualMotion);
    }
  }
  unitRenderer.end();
}
let last = performance.now(); let acc = 0; let simTime = 0;
function frame(now) { requestAnimationFrame(frame); const raw = (now - last) / 1000; const dt = clamp(raw, 0, 0.1); last = now; trackFrame(raw); if (!document.hidden) advance(dt); }
function advance(dt, render = true) {
  if (app.generating || !app.system) return;
  const g = app.game;
  if (app.state === 'playing' || app.state === 'over') {
    if (!app.paused && !g.over) {
      acc += dt; let steps = 0;
      while (acc >= STEP && steps < 8) { g.step(STEP); if (app.state === 'playing') app.ai.update(STEP); acc -= STEP; steps++; simTime += STEP; }
      if (steps === 8) acc = 0; app.fx.update(dt);
    }
    if (!app.paused && g.over) app.fx.update(dt);
    if (app.introT > 0) { app.introT -= dt; cam.zoomLerp = 1.4; } else cam.zoomLerp = 9;
    if (app.state === 'over') { app.overT += dt; if (app.overT > 3.5 && !app.overShown) { app.overShown = true; ui.showGameOver(app.winner, g); } }
  } else if (app.fx) app.fx.update(dt);
  audio.frame(); audio.listener = cam.anchor; audio.camDist = cam.mode === 'system' ? 3000 : cam.dist;
  cam.update(dt); app.system.update(dt, camera);
  cam.planet.updateGrass(cam.anchor, camera.position, simTime + (app.state === 'menu' ? performance.now() / 1000 : 0), cam.mode === 'planet' && cam.dist < 130 && app.state !== 'menu' && !(app.style && app.style.world && app.style.world.grass === false));
  if (!render) return;
  renderUnits(simTime, clamp(acc / STEP, 0, 1), dt);
  app.fx.beginFrame(); if (g) g.renderProjectiles(app.fx); if (g && app.state !== 'menu') ui.frame(); app.fx.endFrame();
  const p = cam.planet; _sunDir.copy(p.sunDir);
  { const a = app.atmoU, u = p.uniforms; a.uAtC.value.copy(u.uAtC.value); a.uAtR.value = u.uAtR.value; a.uAtRa.value = u.uAtRa.value; a.uAtHr.value = u.uAtHr.value; a.uAtHm.value = u.uAtHm.value; a.uAtI.value = u.uAtI.value; a.uAtOn.value = 1; a.uAtBr.value.copy(u.uAtBr.value); a.uAtBm.value = u.uAtBm.value; a.uAtSun.value.copy(u.uAtSun.value); a.uAtK.value = u.uAtK.value; }
  sun.position.copy(cam.anchor).addScaledVector(_sunDir, 600); sun.target.position.copy(cam.anchor);
  const s = cam.mode === 'system' ? 700 : clamp(cam.dist * 1.15, 45, 700); const sc = sun.shadow.camera; sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix();
  updateEnvironment(performance.now(), false);
  sun.castShadow = cam.mode === 'planet' && cam.dist < 600;
  // The painterly styles run a heavy bloom that reads well on a lit surface but turns the star
  // into a white blob from orbit, where the sun sprite and its corona fill the frame.
  bloom.strength = app.bloomBase * (cam.mode === 'system' ? 0.4 : 1);
  { const now = performance.now() / 1000; STYLE_U.uStTime.value = app.state === 'menu' ? (app.settings.reducedMotion ? 0 : now) : simTime; grade.uniforms.uTime.value = now; edgePass.uniforms.uTime.value = now; edgePass.uniforms.uNear.value = camera.near; edgePass.uniforms.uFar.value = camera.far; edgePass.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse); edgePass.uniforms.tDepth.value = composer.readBuffer.depthTexture; // RenderPass draws into readBuffer, and the two targets own separate depth textures
    _fillDir.copy(_sunDir).multiplyScalar(-1).addScaledVector(cam.mode === 'planet' ? cam.normal : _sunDir, 0.9).normalize(); fill.position.copy(cam.anchor).addScaledVector(_fillDir, 600); fill.target.position.copy(cam.anchor); }
  renderer.info.reset(); composer.render();
  if (app.tacticalUI && g) app.tacticalUI.update(dt);
  if (app.state === 'playing' || app.state === 'over') ui.update(dt);
}
app.advance = (sec, fdt = 1 / 30) => { for (let t = 0; t < sec; t += fdt) advance(fdt, false); advance(0.001, true); };

// ---------- boot ----------
(async () => {
  setupSky(); applyQuality();
  $('loadingText').textContent = 'LOADING MATERIALS';
  try { await loadRealTextures(TEX_KINDS, (kind, n) => { $('loadingText').textContent = 'LOADING MATERIALS ' + n + '/' + TEX_KINDS.length; }); } catch (e) { console.warn('texture preload failed, using procedural materials', e); }
  $('loadingText').textContent = 'BUILDING UNITS'; await new Promise((r) => setTimeout(r, 30));
  { const t0 = performance.now(); unitRenderer = new UnitRenderer(scene, app.atmoU); app.unitRenderer = unitRenderer; app.portraits = new ModelPortraits(unitRenderer.models); app.unitBuildMs = performance.now() - t0; console.info('unit models built in ' + app.unitBuildMs.toFixed(0) + ' ms'); }
  await createWorld(); app.setStyle(app.settings.style); setupMenuCamera(); ui.applySettings();
  $('subtitle').textContent = 'TACTICAL EDITION / V' + VERSION; $('menu').classList.remove('hidden'); app.state = 'menu';
  requestAnimationFrame(frame);
})();
