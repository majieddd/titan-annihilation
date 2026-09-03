import * as THREE from 'three';

/**
 * Art-style lab. A style is a data bundle applied on top of the same world:
 *  - mat:   uniforms read by every lit material (texture softness, normal strength, toon bands, shadow tint, hatching, ...)
 *  - light: sun / hemisphere / environment / fill light
 *  - atmo:  multipliers on the planet atmosphere (aerial haze density, sky brightness)
 *  - post:  post-processing chain (edge/ink pass, bloom, halftone, colour grade, tilt-shift, tone mapping)
 * Switching styles only updates uniforms, lights and pass parameters, so it is instant.
 */
export const STYLE_U = {
  uStLod: { value: 0 },            // mip bias for surface textures (higher = softer, more painterly)
  uStNormal: { value: 1 },         // normal-map influence
  uStPoster: { value: 0 },         // albedo posterisation levels (0 = off)
  uStSat: { value: 1 },            // albedo saturation
  uStBands: { value: 0 },          // toon light bands (0 = continuous lighting)
  uStSoft: { value: 0.06 },        // band edge softness
  uStKey: { value: 1 },            // direct light normalisation (sun intensity / pi), set by main
  uStAmbient: { value: 1 },        // indirect scale in toon mode
  uStSpec: { value: 1 },           // specular scale (continuous) / quantised highlight strength (toon)
  uStHatch: { value: 0 },          // screen-space hatching in shadow
  uStHalftone: { value: 0 },       // screen-space dots in shadow
  uStOutline: { value: 0 },        // fresnel ink on silhouettes (per material)
  uStClay: { value: 0 },           // matte clay rim light (diorama)
  uStFaction: { value: 0 },        // per-team treatment (Spider-Verse)
  uStTime: { value: 0 },
  uStDebug: { value: 0 },          // 1 = show direct-light term, 2 = show shade, 3 = indirect
  uStTooth: { value: 0 },          // painted 'tooth': world-space value noise on every surface
  uStJitter: { value: 0 },         // per-cell offset of the toon band boundary (knife-stroke patchwork)
  uStRim: { value: 0 },            // neon rim light strength (team colour on units, uStRimColor elsewhere)
  uStTile: { value: 0 },           // mosaic tiles with dark grout
  uStFlat: { value: 0 },           // flat facet shading from screen-space derivatives (low-poly look)
  uStShadowTint: { value: new THREE.Vector3(1, 1, 1) },
  uStLitTint: { value: new THREE.Vector3(1, 1, 1) },
  uStRimColor: { value: new THREE.Vector3(1, 0.2, 0.8) },
  uStFxGain: { value: 1 },         // particle brightness
  uStFxTint: { value: new THREE.Vector3(1, 1, 1) },
};

export const STYLE_GLSL = `
uniform float uStLod, uStNormal, uStPoster, uStSat, uStBands, uStSoft, uStKey, uStAmbient, uStSpec, uStHatch, uStHalftone, uStOutline, uStClay, uStFaction, uStTime, uStDebug, uStTooth, uStJitter, uStRim, uStTile, uStFlat; uniform vec3 uStShadowTint, uStLitTint, uStRimColor;
float stHash3(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float stNoise3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(stHash3(i), stHash3(i + vec3(1, 0, 0)), f.x), mix(stHash3(i + vec3(0, 1, 0)), stHash3(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(stHash3(i + vec3(0, 0, 1)), stHash3(i + vec3(1, 0, 1)), f.x), mix(stHash3(i + vec3(0, 1, 1)), stHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float stLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 stPoster(vec3 c, float n) { return n > 0.5 ? floor(c * n + 0.5) / n : c; }
vec3 stSat(vec3 c, float s) { float l = stLum(c); return max(vec3(0.0), mix(vec3(l), c, s)); }
float stBand(float x, float bands, float soft) { float b = x * bands; float f = fract(b); float s = smoothstep(0.5 - soft, 0.5 + soft, f); return clamp((floor(b) + s) / bands, 0.0, 1.0); }
float stHatchPat(vec2 fc, float spacing, float dir) { float a = (fc.x + dir * fc.y) / spacing; return step(0.45, fract(a)); }
float stDotPat(vec2 fc, float spacing, float amt) { vec2 p = mat2(0.7071, 0.7071, -0.7071, 0.7071) * fc; vec2 g = fract(p / spacing) - 0.5; float d = length(g) * 2.0; return 1.0 - smoothstep(amt - 0.15, amt + 0.15, d); }
`;

/** inserted before <opaque_fragment> in every lit material: restyles the physically computed lighting */
export const STYLE_LIGHT_GLSL = `
{
  vec3 stAlb = max(diffuseColor.rgb, vec3(0.003)); float stAlbL = max(stLum(stAlb), 1e-3);
  // directDiffuse already carries three's (1 - metalness) factor, so a metallic hull divided by full
  // albedo read as permanently unlit — every unit sat in the shadow band of the toon styles.
  float stDL = clamp(stLum(reflectedLight.directDiffuse) / (stAlbL * max(1.0 - metalnessFactor, 1e-3)) / max(uStKey, 1e-3), 0.0, 1.0);
  float stIL = stLum(reflectedLight.indirectDiffuse) / stAlbL;
  vec3 stSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  vec3 stDbg0 = outgoingLight; vec3 stDbg1 = vec3(0.0); vec3 stDbg2 = vec3(0.0);
  float stTeam = -1.0;
  #ifdef ST_HAS_TEAM
  stTeam = vInst.z;
  #endif
  if (uStBands > 0.5) {
    // toon: lift low sun angles into the lit band, keep the shadow side a tinted ~45% of the key light
    float stJit = uStJitter > 0.0 ? (stHash3(floor(vAtW * 0.45)) - 0.5) * uStJitter : 0.0;
    float q = stBand(clamp(pow(stDL, 0.6) + stJit, 0.0, 1.0), uStBands, uStSoft);
    vec3 unlit = stAlb * uStShadowTint * uStKey * 0.42 * uStAmbient + stAlb * stIL * 0.35;
    vec3 lit = stAlb * uStLitTint * uStKey + stAlb * stIL * 0.35;
    float sq = smoothstep(0.2, 0.3, stLum(stSpec) / max(uStKey, 1e-3)) * 0.5 * uStSpec;
    outgoingLight = mix(unlit, lit, q) + vec3(sq) + totalEmissiveRadiance;
  } else {
    float sh = 1.0 - stDL;
    outgoingLight = (outgoingLight - totalEmissiveRadiance - stSpec) * mix(vec3(1.0), uStShadowTint, sh) * mix(vec3(1.0), uStLitTint, stDL) + stSpec * uStSpec + totalEmissiveRadiance;
  }
  stDbg1 = outgoingLight;
  if (uStTooth > 0.0) { float t = stNoise3(vAtW * 1.7) * 0.6 + stNoise3(vAtW * 6.5) * 0.4; outgoingLight *= 1.0 + (t - 0.5) * uStTooth; }
  if (uStTile > 0.0) { vec3 tp = vAtW * 0.42; vec3 tf = fract(tp); vec3 edge = min(tf, 1.0 - tf); float g = smoothstep(0.0, 0.07, min(edge.x, min(edge.y, edge.z))); float cj = stHash3(floor(tp)); outgoingLight *= mix(1.0 - 0.55 * uStTile, 1.0, g) * (1.0 + (cj - 0.5) * 0.35 * uStTile); }
  float stNV = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
  if (uStRim > 0.0) { float rim = pow(1.0 - stNV, 3.2) * (0.35 + 0.65 * stDL); vec3 rc = uStRimColor;
    #ifdef ST_HAS_TEAM
    rc = vTeamColor;
    #endif
    outgoingLight += rc * rim * uStRim; }
  if (uStClay > 0.0) { float rim = pow(1.0 - stNV, 3.0); outgoingLight += stAlb * rim * uStClay * 0.7 * (0.35 + 0.65 * stDL); }
  float stShade = 1.0 - smoothstep(0.15, 0.6, stDL);
  float stHatchAmt = uStHatch, stDotAmt = uStHalftone;
  if (uStFaction > 0.5 && stTeam >= 0.0) { if (stTeam < 0.5) { stDotAmt = 0.9; stHatchAmt = 0.0; } else { stHatchAmt = 0.9; stDotAmt = 0.0; outgoingLight = stSat(outgoingLight, 0.5) * vec3(1.0, 0.97, 0.9); } }
  if (stHatchAmt > 0.0) { float h1 = stHatchPat(gl_FragCoord.xy, 7.0, 1.0); float h2 = stHatchPat(gl_FragCoord.xy, 7.0, -1.0); float lines = clamp((1.0 - h1) + (1.0 - h2) * smoothstep(0.5, 0.9, stShade), 0.0, 1.0); outgoingLight *= 1.0 - stHatchAmt * stShade * lines * 0.32; }
  if (stDotAmt > 0.0) { float dots = stDotPat(gl_FragCoord.xy, 7.0, stShade * 0.95); outgoingLight *= 1.0 - stDotAmt * dots * 0.5; }
  stDbg2 = outgoingLight;
  if (uStOutline > 0.0) { float fr = pow(1.0 - stNV, 4.0); outgoingLight *= 1.0 - uStOutline * smoothstep(0.5, 0.95, fr); }
  if (uStDebug > 0.5) {
    if (uStDebug < 1.5) outgoingLight = vec3(stDL); else if (uStDebug < 2.5) outgoingLight = vec3(stShade); else if (uStDebug < 3.5) outgoingLight = vec3(stIL);
    else if (uStDebug < 4.5) outgoingLight = vec3(stLum(stSpec));
    else if (uStDebug < 6.5) outgoingLight = stDbg0; else if (uStDebug < 7.5) outgoingLight = stDbg1; else if (uStDebug < 8.5) outgoingLight = stDbg2; else if (uStDebug < 9.5) outgoingLight = vec3(stHatchAmt, stShade, stDotAmt);
    else { bool bad = any(isnan(outgoingLight)) || any(isinf(outgoingLight)); bool badS = any(isnan(stSpec)) || any(isinf(stSpec)); bool badD = any(isnan(reflectedLight.directDiffuse)) || any(isnan(reflectedLight.indirectDiffuse)); outgoingLight = bad ? (badS ? vec3(1.0, 0.0, 1.0) : (badD ? vec3(1.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))) : vec3(0.0, 0.5, 0.0); }
  }
}
`;

const V = (r, g, b) => [r, g, b];
export const STYLES = [
  {
    id: 'realism', name: 'Polished Realism', hint: 'The photographic baseline: scanned materials, scattering sky, image-based light, gentle film grade.',
    mat: { lod: 0, normal: 1, poster: 0, sat: 1.02, bands: 0, soft: 0.06, ambient: 1, spec: 1, hatch: 0, halftone: 0, outline: 0, clay: 0, faction: 0, shadowTint: V(0.94, 0.97, 1.05), litTint: V(1.03, 1.0, 0.96) },
    light: { sun: 3.1, sunColor: 0xfff1dc, hemi: 0.15, env: 1.0, fill: 0.0, fillColor: 0x9fbcff },
    atmo: { aerial: 1.0, sunI: 1.0 },
    post: { tone: 'aces', exposure: 1.0, gtao: true, bloom: [0.3, 0.5, 0.92], edge: null, halftone: null, tilt: null,
      grade: { sat: 1.08, con: 1.06, vig: 0.4, sharp: 0.22, ca: 0.006, grain: 0.03, poster: 0, paper: 0, shadowTint: V(0.95, 0.98, 1.04), highTint: V(1.03, 1.0, 0.96) } },
  },
  {
    id: 'cel', name: 'Cel Shaded', hint: 'Three-band toon light, cool flat shadows, softened painterly textures, clean ink lines.',
    mat: { lod: 3.5, normal: 0.15, poster: 0, sat: 1.25, bands: 3, soft: 0.04, ambient: 1.2, spec: 0.8, hatch: 0, halftone: 0, outline: 0.3, clay: 0, faction: 0, shadowTint: V(0.6, 0.66, 0.98), litTint: V(1.03, 1.0, 0.95) },
    light: { sun: 3.0, sunColor: 0xfff6ea, hemi: 0.35, env: 0.45, fill: 0.3, fillColor: 0x8fb8ff },
    atmo: { aerial: 0.5, sunI: 0.9 },
    post: { tone: 'neutral', exposure: 1.05, gtao: false, bloom: [0.12, 0.4, 0.95], edge: { thick: 1.6, depthT: 0.05, normalT: 0.35, color: V(0.05, 0.04, 0.09), strength: 0.9, boil: 0 }, halftone: null, tilt: null,
      grade: { sat: 1.1, con: 1.08, vig: 0.22, sharp: 0, ca: 0, grain: 0, poster: 0, paper: 0, shadowTint: V(1, 1, 1), highTint: V(1, 1, 1) } },
  },
  {
    id: 'spiderverse', name: 'Spider-Verse', hint: 'Printed-comic animation: two-tone light, Ben-Day dots and hatching per faction, misregistered inks, line boil.',
    mat: { lod: 2.5, normal: 0.3, poster: 0, sat: 1.35, bands: 2, soft: 0.03, ambient: 1.25, spec: 0.6, hatch: 0.3, halftone: 0, outline: 0.3, clay: 0, faction: 1, shadowTint: V(0.55, 0.5, 0.9), litTint: V(1.05, 0.98, 0.92) },
    light: { sun: 3.2, sunColor: 0xffe9d6, hemi: 0.5, env: 0.5, fill: 0.35, fillColor: 0xff4fd8 },
    atmo: { aerial: 0.35, sunI: 0.8 },
    post: { tone: 'neutral', exposure: 1.0, gtao: false, bloom: [0.22, 0.6, 0.85], edge: { thick: 2.0, depthT: 0.045, normalT: 0.32, color: V(0.09, 0.02, 0.13), strength: 1.0, boil: 1 }, halftone: { dots: 0.5, size: 7 }, tilt: null,
      grade: { sat: 1.15, con: 1.12, vig: 0.3, sharp: 0, ca: 0.03, grain: 0.07, poster: 0, paper: 0.35, shadowTint: V(0.95, 0.9, 1.1), highTint: V(1.05, 1.0, 0.95) } },
  },
  {
    id: 'comic', name: 'Comic 3D', hint: 'Borderlands-style: heavy ink outlines, crosshatched shadows, hand-painted textures, punchy contrast.',
    mat: { lod: 1.0, normal: 0.8, poster: 0, sat: 1.15, bands: 0, soft: 0.06, ambient: 1, spec: 0.7, hatch: 0.7, halftone: 0, outline: 0.45, clay: 0, faction: 0, shadowTint: V(0.68, 0.7, 0.92), litTint: V(1.04, 1.0, 0.94) },
    light: { sun: 3.4, sunColor: 0xfff2e0, hemi: 0.5, env: 0.9, fill: 0.2, fillColor: 0xa0c0ff },
    atmo: { aerial: 0.45, sunI: 0.9 },
    post: { tone: 'cineon', exposure: 1.05, gtao: true, bloom: [0.18, 0.5, 0.9], edge: { thick: 2.4, depthT: 0.04, normalT: 0.3, color: V(0.02, 0.02, 0.03), strength: 1.0, boil: 0 }, halftone: null, tilt: null,
      grade: { sat: 1.05, con: 1.15, vig: 0.45, sharp: 0.35, ca: 0, grain: 0.05, poster: 0, paper: 0.15, shadowTint: V(0.96, 0.96, 1.02), highTint: V(1.02, 1.0, 0.98) } },
  },
  {
    id: 'bar', name: 'Beyond All Reason', hint: 'Crisp sunlit PBR: hard shadows, strong metallic specular, saturated team colours, almost no haze.',
    mat: { lod: 0, normal: 1.3, poster: 0, sat: 1.1, bands: 0, soft: 0.06, ambient: 1, spec: 1.5, hatch: 0, halftone: 0, outline: 0, clay: 0, faction: 0, shadowTint: V(0.85, 0.9, 1.06), litTint: V(1.02, 1.0, 0.98) },
    light: { sun: 4.0, sunColor: 0xfff8f0, hemi: 0.12, env: 0.8, fill: 0.0, fillColor: 0xa0c0ff },
    atmo: { aerial: 0.3, sunI: 0.85 },
    post: { tone: 'aces', exposure: 1.05, gtao: true, bloom: [0.26, 0.45, 0.9], edge: null, halftone: null, tilt: null,
      grade: { sat: 1.15, con: 1.12, vig: 0.2, sharp: 0.4, ca: 0, grain: 0.02, poster: 0, paper: 0, shadowTint: V(0.97, 0.98, 1.03), highTint: V(1.02, 1.0, 0.97) } },
  },
  {
    id: 'inksteel', name: 'Ink & Steel', hint: 'Comic ink lines and hatched shadow layers over bright, sharp, saturated PBR with strong metallic specular; deeper haze, and lines that dissolve into it with distance.',
    mat: { lod: 0, normal: 1.2, poster: 0, sat: 1.18, bands: 0, soft: 0.06, ambient: 1, spec: 1.4, hatch: 0.45, halftone: 0, outline: 0.4, clay: 0, faction: 0, shadowTint: V(0.88, 0.9, 1.04), litTint: V(1.03, 1.0, 0.96) },
    light: { sun: 3.9, sunColor: 0xfff6ec, hemi: 0.3, env: 0.85, fill: 0.15, fillColor: 0xa0c0ff },
    atmo: { aerial: 1.2, sunI: 1.0 },
    post: { tone: 'aces', exposure: 1.08, gtao: true, bloom: [0.24, 0.45, 0.9], edge: { thick: 2.2, depthT: 0.04, normalT: 0.3, color: V(0.02, 0.02, 0.03), strength: 1.0, boil: 0, fade: 420 }, halftone: null, tilt: null,
      grade: { sat: 1.15, con: 1.12, vig: 0.3, sharp: 0.4, ca: 0, grain: 0.03, poster: 0, paper: 0.1, shadowTint: V(0.96, 0.97, 1.03), highTint: V(1.03, 1.0, 0.97) } },
  },
  {
    id: 'reliquary', name: 'Reliquary', hint: 'From Cosmic Conquest: Reliquary — painted cutscene illustration: violet-hued shadows, band boundaries jittered per cell into knife strokes, faction-neon rim light, wet posterised specular, paint tooth, ink before bloom, canvas grain.',
    mat: { lod: 4, normal: 0.1, poster: 0, sat: 1.24, bands: 3, soft: 0.03, ambient: 1.1, spec: 0.9, hatch: 0, halftone: 0.6, outline: 0.25, clay: 0, faction: 0, tooth: 0.35, jitter: 0.5, rim: 0.85, rimColor: V(1.0, 0.18, 0.84), tile: 0, flat: 0, fxGain: 0.55, fxTint: V(0.9, 0.75, 1.0), shadowTint: V(0.5, 0.36, 1.0), litTint: V(1.06, 0.96, 1.02) },
    light: { sun: 3.2, sunColor: 0xffe6ff, hemi: 0.6, env: 0.6, fill: 0.45, fillColor: 0x8b5cf6 },
    atmo: { aerial: 1.2, sunI: 0.75 },
    post: { tone: 'aces', exposure: 1.0, gtao: false, bloom: [0.6, 0.6, 0.6], edge: { thick: 1.8, depthT: 0.05, normalT: 0.45, color: V(0.06, 0.02, 0.12), strength: 0.95, boil: 0 }, halftone: null, tilt: null,
      grade: { sat: 1.1, con: 1.1, vig: 0.54, sharp: 0, ca: 0.012, grain: 0.042, poster: 0, paper: 0.2, shadowTint: V(0.62, 0.48, 1.15), highTint: V(1.08, 0.94, 1.1) } },
  },
  {
    id: 'coil', name: 'The Coil', hint: 'From Cosmic Conquest: The Coil — night cobalt duotone, mosaic tiles with dark grout, cyan glows and team-neon rims, heavy vignette, ink that darkens.',
    mat: { lod: 4, normal: 0.1, poster: 0, sat: 0.9, bands: 3, soft: 0.03, ambient: 1.3, spec: 0.8, hatch: 0, halftone: 0.3, outline: 0.35, clay: 0, faction: 0, tooth: 0.25, jitter: 0.45, rim: 0.7, rimColor: V(0.22, 0.9, 1.0), tile: 0.7, flat: 0, fxGain: 0.45, fxTint: V(0.55, 0.85, 1.0), shadowTint: V(0.42, 0.52, 1.0), litTint: V(0.85, 0.98, 1.15) },
    light: { sun: 3.2, sunColor: 0xcfe4ff, hemi: 0.75, env: 0.55, fill: 0.5, fillColor: 0x38e8ff },
    atmo: { aerial: 1.1, sunI: 0.5 },
    post: { tone: 'aces', exposure: 1.0, gtao: false, bloom: [0.9, 0.65, 0.6], edge: { thick: 1.8, depthT: 0.05, normalT: 0.45, color: V(0.01, 0.02, 0.06), strength: 1.0, boil: 0 }, halftone: null, tilt: null,
      grade: { sat: 0.72, con: 1.15, vig: 0.62, sharp: 0, ca: 0.006, grain: 0.05, poster: 0, paper: 0.12, shadowTint: V(0.4, 0.5, 1.05), highTint: V(0.92, 1.04, 1.18) } },
  },
  {
    id: 'poly', name: 'Poly', hint: 'Low-poly art: flat-shaded facets, flat colours, no textures or outlines; a medium-poly world mesh that applies on the next launch.',
    mat: { lod: 8, normal: 0, poster: 0, sat: 1.2, bands: 0, soft: 0.06, ambient: 1, spec: 0.5, hatch: 0, halftone: 0, outline: 0, clay: 0, faction: 0, tooth: 0, jitter: 0, rim: 0, rimColor: V(1, 1, 1), tile: 0, flat: 1, fxGain: 0.8, shadowTint: V(0.82, 0.88, 1.1), litTint: V(1.04, 1.0, 0.94) },
    light: { sun: 3.4, sunColor: 0xfff4e6, hemi: 0.35, env: 0.6, fill: 0.2, fillColor: 0xa8c8ff },
    atmo: { aerial: 0.8, sunI: 0.9 },
    post: { tone: 'aces', exposure: 1.05, gtao: true, bloom: [0.15, 0.5, 0.92], edge: null, halftone: null, tilt: null,
      grade: { sat: 1.12, con: 1.08, vig: 0.3, sharp: 0, ca: 0, grain: 0.02, poster: 0, paper: 0, shadowTint: V(0.96, 0.98, 1.03), highTint: V(1.03, 1.0, 0.97) } },
    world: { detail: 7, grass: false, cards: false },
  },
  {
    id: 'dioramaink', name: 'Diorama Ink', hint: 'The war table drawn in ink: matte clay miniatures with rim light and tilt-shift focus, wearing the comic\'s heavy black outlines and crosshatched shadows.',
    mat: { lod: 1.2, normal: 0.6, poster: 0, sat: 1.3, bands: 0, soft: 0.06, ambient: 1, spec: 0.45, hatch: 0.6, halftone: 0, outline: 0.4, clay: 1, faction: 0, tooth: 0, jitter: 0, rim: 0, rimColor: V(1, 1, 1), tile: 0, flat: 0, fxGain: 0.9, shadowTint: V(0.78, 0.8, 0.96), litTint: V(1.04, 1.0, 0.94) },
    light: { sun: 3.7, sunColor: 0xffe6c8, hemi: 0.36, env: 0.75, fill: 0.5, fillColor: 0xa8c8ff },
    atmo: { aerial: 0.15, sunI: 0.7 },
    post: { tone: 'aces', exposure: 1.08, gtao: true, bloom: [0.14, 0.5, 0.9], edge: { thick: 2.4, depthT: 0.04, normalT: 0.3, color: V(0.02, 0.02, 0.03), strength: 1.0, boil: 0 }, halftone: null, tilt: { amount: 5, focus: 0.5, width: 0.2 },
      grade: { sat: 1.16, con: 1.12, vig: 0.5, sharp: 0.2, ca: 0.004, grain: 0.04, poster: 0, paper: 0.12, shadowTint: V(0.96, 0.97, 1.03), highTint: V(1.04, 1.0, 0.95) } },
  },
  {
    id: 'diorama', name: 'Diorama', hint: 'Original: a war table of painted miniatures — matte clay surfaces, studio key and fill lights, tilt-shift focus, no haze.',
    mat: { lod: 1.2, normal: 0.6, poster: 0, sat: 1.28, bands: 0, soft: 0.06, ambient: 1, spec: 0.45, hatch: 0, halftone: 0, outline: 0.15, clay: 1, faction: 0, shadowTint: V(0.8, 0.82, 0.96), litTint: V(1.04, 1.0, 0.94) },
    light: { sun: 3.6, sunColor: 0xffe6c8, hemi: 0.3, env: 0.7, fill: 0.5, fillColor: 0xa8c8ff },
    atmo: { aerial: 0.15, sunI: 0.7 },
    post: { tone: 'aces', exposure: 1.08, gtao: true, bloom: [0.16, 0.5, 0.9], edge: null, halftone: null, tilt: { amount: 5, focus: 0.5, width: 0.2 },
      grade: { sat: 1.15, con: 1.1, vig: 0.5, sharp: 0.15, ca: 0.004, grain: 0.04, poster: 0, paper: 0, shadowTint: V(0.96, 0.97, 1.03), highTint: V(1.04, 1.0, 0.95) } },
  },
];
export function styleById(id) { return STYLES.find((s) => s.id === id) || STYLES[0]; }
export function applyStyleUniforms(m) {
  STYLE_U.uStLod.value = m.lod; STYLE_U.uStNormal.value = m.normal; STYLE_U.uStPoster.value = m.poster; STYLE_U.uStSat.value = m.sat; STYLE_U.uStBands.value = m.bands; STYLE_U.uStSoft.value = m.soft;
  STYLE_U.uStAmbient.value = m.ambient; STYLE_U.uStSpec.value = m.spec; STYLE_U.uStHatch.value = m.hatch; STYLE_U.uStHalftone.value = m.halftone; STYLE_U.uStOutline.value = m.outline; STYLE_U.uStClay.value = m.clay; STYLE_U.uStFaction.value = m.faction;
  const norm = (c) => { const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; return [c[0] / l, c[1] / l, c[2] / l]; };
  STYLE_U.uStShadowTint.value.set(...norm(m.shadowTint)); STYLE_U.uStLitTint.value.set(...norm(m.litTint));
  STYLE_U.uStTooth.value = m.tooth || 0; STYLE_U.uStJitter.value = m.jitter || 0; STYLE_U.uStRim.value = m.rim || 0; STYLE_U.uStTile.value = m.tile || 0; STYLE_U.uStFlat.value = m.flat || 0; STYLE_U.uStRimColor.value.set(...(m.rimColor || [1, 1, 1])); STYLE_U.uStFxGain.value = m.fxGain === undefined ? 1 : m.fxGain; STYLE_U.uStFxTint.value.set(...(m.fxTint || [1, 1, 1]));
}
