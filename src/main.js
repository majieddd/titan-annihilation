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
import { PlanetCamera } from './camera.js';
import { Game } from './sim.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { UnitRenderer } from './models.js';
import { GameAudio } from './audio.js';
import { TEAM_COLORS } from './defs.js';
import { setAnisotropy, setTextureSize, nebulaTexture } from './textures.js';
import { loadRealTextures, TEX_KINDS } from './assets.js';
import { mulberry32, hashString, clamp, Simplex, VERSION } from './util.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const app = { state: 'loading', paused: false, settings: { difficulty: 'normal', biome: 'earth', seed: 'titan', quality: 'high', planets: 3, style: 'realism' }, game: null, ai: null, system: null, fx: null, fxGroup: null };
try { const s = JSON.parse(localStorage.getItem('ta_settings') || 'null'); if (s) Object.assign(app.settings, s); } catch (e) { }
if (!['medium', 'high', 'ultra'].includes(app.settings.quality)) app.settings.quality = 'high';
if (![2, 3, 4].includes(app.settings.planets)) app.settings.planets = 3;
if (!STYLES.some((s) => s.id === app.settings.style)) app.settings.style = 'realism';
window.__app = app;

// ---------- renderer / scene ----------
const canvas = $('gl'); app.canvas = canvas;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
setAnisotropy(renderer.capabilities.getMaxAnisotropy());
app.renderer = renderer;
const scene = new THREE.Scene(); app.scene = scene;
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 80000);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.1); sun.castShadow = true;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5; sun.shadow.camera.near = 100; sun.shadow.camera.far = 1300;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a2a1a, 0.15); scene.add(hemi);
const fill = new THREE.DirectionalLight(0xa8c8ff, 0); fill.castShadow = false; scene.add(fill); scene.add(fill.target);
const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5; pmrem.compileCubemapShader();
// dynamic image-based lighting: a cube capture of the real sky/terrain around the camera anchor, filtered by PMREM
const envRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
const envCam = new THREE.CubeCamera(2, 70000, envRT); envCam.children.forEach((c) => c.layers.enable(1)); let envTarget = null; let envT = -1e9; const _envN = new THREE.Vector3();
function updateEnvironment(now, force) {
  const p = cam.planet; if (!p || (!force && now - envT < 4000)) return; envT = now;
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
{ const r = gtao.render.bind(gtao); gtao.render = (...a) => { camera.layers.disable(1); r(...a); camera.layers.enable(1); }; }
const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// ink / outline pass: depth + reconstructed-normal edges from the scene depth texture
const edgePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uNear: { value: 1 }, uFar: { value: 1000 }, uProjInv: { value: new THREE.Matrix4() }, uThick: { value: 1.5 }, uDepthT: { value: 0.05 }, uNormalT: { value: 0.35 }, uStrength: { value: 1 }, uBoil: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Vector3(0, 0, 0) } },
  vertexShader: QUAD_VS,
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uNear, uFar, uThick, uDepthT, uNormalT, uStrength, uBoil, uFade, uTime; uniform vec3 uColor; uniform mat4 uProjInv; varying vec2 vUv;
    float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    vec3 vpos(vec2 uv, float d) { vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    void main(){
      vec2 uv = vUv; vec4 col = texture2D(tDiffuse, vUv);
      if (uBoil > 0.0) { float t = floor(uTime * 8.0); uv += (vec2(fract(sin(t * 12.99) * 43758.5), fract(sin(t * 78.23) * 43758.5)) - 0.5) * uTexel * 2.0 * uBoil; }
      vec2 o = uTexel * uThick; float d0 = texture2D(tDepth, uv).r; float z0 = lin(d0);
      float dL = texture2D(tDepth, uv - vec2(o.x, 0.0)).r, dR = texture2D(tDepth, uv + vec2(o.x, 0.0)).r, dD = texture2D(tDepth, uv - vec2(0.0, o.y)).r, dU = texture2D(tDepth, uv + vec2(0.0, o.y)).r;
      float zL = lin(dL), zR = lin(dR), zD = lin(dD), zU = lin(dU);
      float zmin = min(min(zL, zR), min(zD, zU)); float zn = min(z0, zmin);
      float dz = max(abs(zL + zR - 2.0 * z0), abs(zD + zU - 2.0 * z0)) / zn;
      float far = max(max(abs(zL - z0), abs(zR - z0)), max(abs(zD - z0), abs(zU - z0))) / zn;
      float eDepth = smoothstep(uDepthT, uDepthT * 2.5, max(dz, far * 0.35));
      vec3 P = vpos(uv, d0); vec3 Px = vpos(uv + vec2(o.x, 0.0), dR) - P; vec3 Py = vpos(uv + vec2(0.0, o.y), dU) - P; vec3 n0 = normalize(cross(Px, Py));
      vec3 PL = vpos(uv - vec2(o.x, 0.0), dL); vec3 PD = vpos(uv - vec2(0.0, o.y), dD); vec3 n1 = normalize(cross(P - PL, Py)); vec3 n2 = normalize(cross(Px, P - PD));
      float eN = smoothstep(uNormalT, uNormalT + 0.3, max(1.0 - dot(n0, n1), 1.0 - dot(n0, n2))) * (1.0 - step(0.9999, d0));
      float e = clamp(max(eDepth, eN) * uStrength, 0.0, 1.0);
      if (uFade > 0.0) e *= exp(-zn / uFade); // ink dissolves into the haze with distance
      gl_FragColor = vec4(mix(col.rgb, uColor, e), col.a); }` });
edgePass.enabled = false; composer.insertPass(edgePass, 1);
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
  const st = styleById(id); app.style = st; app.settings.style = st.id; try { localStorage.setItem('ta_settings', JSON.stringify(app.settings)); } catch (e) { }
  applyStyleUniforms(st.mat); STYLE_U.uStKey.value = st.light.sun / Math.PI;
  sun.intensity = st.light.sun; sun.color.set(st.light.sunColor); hemi.intensity = st.light.hemi; fill.intensity = st.light.fill; fill.color.set(st.light.fillColor); scene.environmentIntensity = st.light.env;
  const p = st.post; bloom.strength = p.bloom[0]; bloom.radius = p.bloom[1]; bloom.threshold = p.bloom[2];
  edgePass.enabled = !!p.edge; if (p.edge) { const u = edgePass.uniforms; u.uThick.value = p.edge.thick; u.uDepthT.value = p.edge.depthT; u.uNormalT.value = p.edge.normalT; u.uStrength.value = p.edge.strength; u.uBoil.value = p.edge.boil; u.uFade.value = p.edge.fade || 0; u.uColor.value.set(...p.edge.color); }
  tiltH.enabled = tiltV.enabled = !!p.tilt; if (p.tilt) for (const t of [tiltH, tiltV]) { t.uniforms.uAmount.value = p.tilt.amount; t.uniforms.uFocus.value = p.tilt.focus; t.uniforms.uWidth.value = p.tilt.width; }
  const g = grade.uniforms, gr = p.grade; g.uSat.value = gr.sat; g.uCon.value = gr.con; g.uVig.value = gr.vig; g.uSharp.value = gr.sharp; g.uCA.value = gr.ca; g.uGrain.value = gr.grain; g.uPoster.value = gr.poster; g.uPaper.value = gr.paper; g.uDots.value = p.halftone ? p.halftone.dots : 0; g.uDotSize.value = p.halftone ? p.halftone.size : 6; g.uShadowTint.value.set(...gr.shadowTint); g.uHighTint.value.set(...gr.highTint);
  renderer.toneMapping = TONE[p.tone] || THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = p.exposure;
  gtao.enabled = app.settings.quality !== 'medium' && p.gtao !== false;
  if (app.system) for (const pl of app.system.planets) { if (!pl.atBase) pl.atBase = { I: pl.uniforms.uAtI.value, K: pl.uniforms.uAtK.value }; pl.uniforms.uAtI.value = pl.atBase.I * st.atmo.sunI; pl.uniforms.uAtK.value = pl.atBase.K * st.atmo.aerial; }
  envT = -1e9; if (app.ui) app.ui.syncStyle();
  // a style that asks for a different world mesh: rebuild now in the menu, otherwise it applies on the next launch
  const wantDetail = (st.world && st.world.detail) || (app.settings.quality === 'medium' ? 7 : 8);
  if (app.system && app.worldDetail && wantDetail !== app.worldDetail) { if (app.state === 'menu' && !app.generating) app.regenPlanet(); else if (app.ui && app.ui.hint) app.ui.hint('Mesh detail for this style applies on the next launch'); }
};
app.cycleStyle = (dir) => { const i = STYLES.findIndex((s) => s.id === (app.style ? app.style.id : app.settings.style)); app.setStyle(STYLES[(i + dir + STYLES.length) % STYLES.length].id); };


function applyQuality() {
  const q = app.settings.quality; const dpr = q === 'medium' ? Math.min(devicePixelRatio, 1.25) : (q === 'high' ? Math.min(devicePixelRatio, 2) : devicePixelRatio);
  renderer.setPixelRatio(dpr); const sm = q === 'medium' ? 2048 : 4096; setTextureSize(q === 'medium' ? 512 : (q === 'high' ? 768 : 1024));
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  gtao.enabled = q !== 'medium' && !(app.style && app.style.post.gtao === false); resize();
}
function setupSky() {
  const rng = mulberry32(7); const n = 9000; const p = new Float32Array(n * 3); const c = new Float32Array(n * 3); const s = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3(rng() - .5, rng() - .5, rng() - .5).normalize().multiplyScalar(40000); p.set([v.x, v.y, v.z], i * 3); const col = new THREE.Color().setHSL(0.55 + (rng() - .5) * 0.3, 0.5, 0.6 + rng() * 0.4); c.set([col.r, col.g, col.b], i * 3); s[i] = 1 + Math.pow(rng(), 5) * 6; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({ vertexColors: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aSize; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize * 1.7; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.08, 0.5, length(d)); gl_FragColor = vec4(vC*a*1.2, a); }' });
  const stars = new THREE.Points(g, m); stars.frustumCulled = false; scene.add(stars);
  const neb = new THREE.Mesh(new THREE.SphereGeometry(60000, 48, 24), new THREE.MeshBasicMaterial({ map: nebulaTexture(new Simplex(mulberry32(5))), side: THREE.BackSide, depthWrite: false })); neb.renderOrder = -10; neb.frustumCulled = false; scene.add(neb);
}

app.atmoU = { uAtC: { value: new THREE.Vector3() }, uAtR: { value: 1 }, uAtRa: { value: 1 }, uAtHr: { value: 1 }, uAtHm: { value: 1 }, uAtI: { value: 0 }, uAtOn: { value: 0 }, uAtBr: { value: new THREE.Vector3() }, uAtBm: { value: 0 }, uAtSun: { value: new THREE.Vector3(0, 0, 1) }, uAtK: { value: 0.1 } };
let unitRenderer = null;
const audio = new GameAudio(); app.audio = audio;
const cam = new PlanetCamera(camera, null, canvas); app.cam = cam;
const ui = new UI(app); app.ui = ui;
cam.onFocus = (p) => { app.system.setFocus(p); envT = -1e9; hemi.color.setRGB(...p.biome.hemiSky); hemi.groundColor.setRGB(...p.biome.hemiGround); ui.barDirty = true; };
cam.onSystem = () => { ui.barDirty = true; };

async function createWorld() {
  app.generating = true; $('loading').classList.remove('hidden');
  if (app.system) { scene.remove(app.system.group); app.system.dispose(); }
  if (app.fxGroup) scene.remove(app.fxGroup);
  const s = app.settings; const q = s.quality;
  const stWorld = (app.style && app.style.world) || (styleById(app.settings.style).world) || {};
  const detailMain = stWorld.detail || (q === 'medium' ? 7 : 8); app.worldDetail = detailMain;
  const system = new StarSystem({ seed: hashString(String(s.seed || 'titan')), biome: s.biome, planetCount: s.planets, quality: q, detailMain, detailOther: Math.min(detailMain, q === 'ultra' ? 7 : 6) });
  await system.generateAsync((msg) => { $('loadingText').textContent = msg.toUpperCase(); }); scene.add(system.group);
  app.system = system; cam.system = system; cam.planet = system.planets[0];
  app.fxGroup = new THREE.Group(); scene.add(app.fxGroup);
  app.fx = new Effects(app.fxGroup, system); app.fx.setViewport(innerWidth, innerHeight);
  app.focusPlanet(system.planets[0], null, 780);
  if (app.style) app.setStyle(app.style.id);
  app.generating = false; $('loading').classList.add('hidden');
}
app.focusPlanet = (planet, dir, dist) => { cam.focus(planet, dir, dist); };
app.regenPlanet = async () => { if (app.generating) return; $('loadingText').textContent = 'FORGING SYSTEM'; applyQuality(); await createWorld(); setupMenuCamera(); };
function setupMenuCamera() { const p = app.system.planets[0]; cam.mode = 'planet'; cam.planet = p; cam.blend = 0; cam.setAnchor(p.spawns[0].dir.clone()); cam.dist = 820; cam.targetDist = 820; cam.spin = 0.03; cam.enabled = false; app.system.setFocus(p); }

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
  cam.setAnchor(main.spawns[0].dir.clone(), game.facing(0, main, main.spawns[0].dir, new THREE.Vector3())); cam.dist = 700; cam.targetDist = 110; app.system.setFocus(main);
  app.introT = 4.5; app.overShown = false;
  app.state = 'playing'; app.paused = false; $('hud').classList.remove('hidden'); $('pauseTag').classList.add('hidden');
  audio.init(); audio.resume(); ui.barDirty = true;
  ui.alert(`Commander inbound to ${main.name}. Difficulty: ${app.settings.difficulty.toUpperCase()} · ${app.system.planets.length} planets`, 'info', null);
};
function onGameOver(winner) { app.state = 'over'; app.overT = 0; app.winner = winner; if (winner === 0) audio.victory(); else audio.defeat(); }
app.toMenu = async () => { if (app.generating) return; app.state = 'menu'; app.game = null; app.ai = null; ui.reset(); $('hud').classList.add('hidden'); $('gameover').classList.add('hidden'); await createWorld(); setupMenuCamera(); $('menu').classList.remove('hidden'); };
app.togglePause = () => { if (app.state !== 'playing') return; app.paused = !app.paused; $('pauseTag').classList.toggle('hidden', !app.paused); ui.selDirty = true; };

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h); gtao.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); if (app.fx) app.fx.setViewport(w, h); const pr = renderer.getPixelRatio(); grade.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr)); edgePass.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr)); tiltH.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr)); tiltV.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr)); }
addEventListener('resize', resize);
document.addEventListener('pointerdown', () => { audio.init(); audio.resume(); }, { capture: true });

// ---------- render ----------
const _m = new THREE.Matrix4(), _tm = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _rm = new THREE.Matrix4(), _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _sunDir = new THREE.Vector3();
function renderUnits(time) {
  const g = app.game; unitRenderer.begin();
  if (g) {
    for (const u of g.units) {
      if (u.dead) continue; if (u.progress <= 0 && u.team !== 0) continue;
      _pos.copy(u.pos); const prog = (u.progress <= 0) ? 0.04 : u.progress;
      if (u.def.kind === 'bot' && u.moving) _pos.addScaledVector(u.dir, Math.abs(Math.sin(time * 14 + u.bobPhase)) * 0.12);
      _m.compose(_pos, u.quat, _one); let tm = null;
      if (u.def.hasTurret) { const pv = unitRenderer.models[u.def.id].pivot; _pm.makeTranslation(pv[0], pv[1], pv[2]); _rm.makeRotationY(u.turret); tm = _tm.copy(_m).multiply(_pm).multiply(_rm); }
      unitRenderer.add(u.def.id, _m, TEAM_COLORS[u.team], prog, u.flash, tm, u.team);
    }
  }
  unitRenderer.end();
}
let last = performance.now(); let acc = 0; let simTime = 0;
function frame(now) { requestAnimationFrame(frame); const dt = clamp((now - last) / 1000, 0, 0.1); last = now; advance(dt); }
function advance(dt, render = true) {
  if (app.generating || !app.system) return;
  const g = app.game;
  if (app.state === 'playing' || app.state === 'over') {
    if (!app.paused) {
      acc += dt; let steps = 0;
      while (acc >= STEP && steps < 5) { g.step(STEP); if (app.state === 'playing') app.ai.update(STEP); acc -= STEP; steps++; simTime += STEP; }
      if (steps === 5) acc = 0; app.fx.update(dt);
    }
    if (app.introT > 0) { app.introT -= dt; cam.zoomLerp = 1.4; } else cam.zoomLerp = 9;
    if (app.state === 'over') { app.overT += dt; if (app.overT > 3.5 && !app.overShown) { app.overShown = true; ui.showGameOver(app.winner, g); } }
  } else if (app.fx) app.fx.update(dt);
  audio.frame(); audio.listener = cam.anchor; audio.camDist = cam.mode === 'system' ? 3000 : cam.dist;
  cam.update(dt); app.system.update(dt, camera);
  cam.planet.updateGrass(cam.anchor, camera.position, simTime + (app.state === 'menu' ? performance.now() / 1000 : 0), cam.mode === 'planet' && cam.dist < 130 && app.state !== 'menu' && !(app.style && app.style.world && app.style.world.grass === false));
  if (!render) return;
  renderUnits(simTime);
  app.fx.beginFrame(); if (g) g.renderProjectiles(app.fx); if (g && app.state !== 'menu') ui.frame(); app.fx.endFrame();
  const p = cam.planet; _sunDir.copy(p.sunDir);
  { const a = app.atmoU, u = p.uniforms; a.uAtC.value.copy(u.uAtC.value); a.uAtR.value = u.uAtR.value; a.uAtRa.value = u.uAtRa.value; a.uAtHr.value = u.uAtHr.value; a.uAtHm.value = u.uAtHm.value; a.uAtI.value = u.uAtI.value; a.uAtOn.value = 1; a.uAtBr.value.copy(u.uAtBr.value); a.uAtBm.value = u.uAtBm.value; a.uAtSun.value.copy(u.uAtSun.value); a.uAtK.value = u.uAtK.value; }
  sun.position.copy(cam.anchor).addScaledVector(_sunDir, 600); sun.target.position.copy(cam.anchor);
  const s = cam.mode === 'system' ? 700 : clamp(cam.dist * 1.15, 45, 700); const sc = sun.shadow.camera; sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix();
  updateEnvironment(performance.now(), false);
  { const now = performance.now() / 1000; STYLE_U.uStTime.value = now; grade.uniforms.uTime.value = now; edgePass.uniforms.uTime.value = now; edgePass.uniforms.uNear.value = camera.near; edgePass.uniforms.uFar.value = camera.far; edgePass.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse); edgePass.uniforms.tDepth.value = composer.renderTarget2.depthTexture;
    _fillDir.copy(_sunDir).multiplyScalar(-1).addScaledVector(cam.mode === 'planet' ? cam.normal : _sunDir, 0.9).normalize(); fill.position.copy(cam.anchor).addScaledVector(_fillDir, 600); fill.target.position.copy(cam.anchor); }
  composer.render();
  if (app.state === 'playing' || app.state === 'over') ui.update(dt);
}
app.advance = (sec, fdt = 1 / 30) => { for (let t = 0; t < sec; t += fdt) advance(fdt, false); advance(0.001, true); };

// ---------- boot ----------
(async () => {
  setupSky(); applyQuality();
  $('loadingText').textContent = 'LOADING MATERIALS';
  try { await loadRealTextures(TEX_KINDS, (kind, n) => { $('loadingText').textContent = 'LOADING MATERIALS ' + n + '/' + TEX_KINDS.length; }); } catch (e) { console.warn('texture preload failed, using procedural materials', e); }
  $('loadingText').textContent = 'BUILDING UNITS'; await new Promise((r) => setTimeout(r, 30));
  { const t0 = performance.now(); unitRenderer = new UnitRenderer(scene, app.atmoU); app.unitRenderer = unitRenderer; app.unitBuildMs = performance.now() - t0; console.info('unit models built in ' + app.unitBuildMs.toFixed(0) + ' ms'); }
  await createWorld(); app.setStyle(app.settings.style); setupMenuCamera(); ui.applySettings();
  $('subtitle').textContent = 'v' + VERSION + ' · Command. Expand. Annihilate.'; $('menu').classList.remove('hidden'); app.state = 'menu';
  requestAnimationFrame(frame);
})();
