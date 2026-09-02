# Titan Annihilation — Version History

Standalone builds of each version live in `versions/` (double-click to play; needs internet for three.js and fonts).
The published artifact keeps its own version picker as well (labels match the entries below).
The in-game menu shows the version number under the title.

## v2.2.0 — 2026-09-02 — High-poly terrain and detailed units
- Main planet mesh raised to 1.3M triangles (655k vertices) on High and Ultra, with two extra fine terrain octaves for rocky micro-relief; Ultra also raises the other planets.
- Every unit, structure and titan rebuilt with bevelled hulls, road wheels, hatches, cupolas, mantlets and muzzle brakes, side skirts, exhausts, headlights, hydraulics and joints, backpacks, canopies, engine nacelles, rooftop greebles, pipe runs, ladders, bolts and lights (three to four times the part count).
- Close-range grass: thousands of swaying alpha-cut grass tufts follow the camera on Terran and Arid worlds, lit and shadowed like the ground and fading with distance.
- Sharpening in the post-process chain; world generation now runs planet by planet with a progress readout.
- Tooling: `versions/` builds per release, README, GitHub Pages deployment.

## v2.1.0 — 2026-09-02 — Texture and lighting pass
- New procedural material set built on cellular (Worley) noise: cracked strata rock, clumped grass with dirt patches, rippled sand with pebbles, cracked ice, lava crust with glowing fissures, wind-ridged snow, cratered regolith.
- Height-based material blending (grass fills crevices, rock crowns ridges), elevation-aligned rock strata, anti-tiling second sample, roughness maps, wet shorelines.
- Terrain ambient occlusion baked into valleys, biome color patches, aerial-perspective fog on the focused planet.
- Riveted, beveled armor plating on units with roughness variation and stronger metallic response.
- Lighting rebalanced for a semi-realistic look (stronger key light, lower ambient, tuned bloom).
- Dense clustered forests (three tree types), textured boulders using the stone material, version label in the menu.
- Tooling: `texlab.html` previews every procedural material with generation timings; `build.js` writes `versions/titan-annihilation-v<version>.html` on every build.

## v2.0.0 — 2026-09-02 — Star systems, orbital layer, teleporters, nukes, HD overhaul
- 2–4 planet star systems with a sun, orbit rings and a system view; planet bar in the HUD.
- Orbital Launcher, Solar Array, Orbital Fabber (interplanetary), Avenger, Anchor, Umbrella.
- Teleporters that link planets for ground armies.
- Nuke Launcher, Anti-Nuke with interception, nuclear detonation effects.
- AI colonizes other planets, links teleporters, builds titans, nukes and anti-nukes.
- Graphics: triplanar textured terrain with normal maps, depth-shaded water with foam, scattered props, environment reflections, sun with lens flare, nebula backdrop, sunset atmosphere and haze, color grading, quality presets.

## v1.1.0 — 2026-09-01 — Hotkey fix
- Keyboard fallback so hotkeys work when `event.code` is missing.

## v1.0.0 — 2026-09-01 — Initial release
- Single procedural planet (5 biomes), PA-style orbit camera, economy, factories, fabbers, 41 unit types incl. three titans, AI opponent with four difficulties.
- Builds for v1.x were not kept as files; they remain in the artifact's version picker.
