# Titan Annihilation — Version History

Standalone builds of each version live in `versions/` (double-click to play; needs internet for three.js and fonts).
The published artifact keeps its own version picker as well (labels match the entries below).
The in-game menu shows the version number under the title.

## v3.5.0 — 2026-09-03 — Diorama Ink style; trees, foliage and water artefacts fixed
- **Diorama Ink**, an eleventh style: the Diorama war table wearing the Comic's ink. Matte clay surfaces with rim light, warm studio key plus cool fill, tilt-shift focus band and no haze, under heavy black outlines and crosshatched shadows.
- **Trees**: the conifers carried one wide horizontal card at mid-height so they read as a disc skewered on the trunk. Replaced with three small cards climbing to the crown, each rotated, so they still read from directly above without the ring.
- **Bushes and boulders**: displacing the corners of a non-indexed mesh moves every triangle's own copy of a shared corner independently, which pulled the solids apart into loose floating triangles. The vertices are welded before displacement and split again afterwards for flat facets, so bushes, boulders and the Poly style's canopies are solid again.
- **Drifting speckle over water and low ground**: the water stayed translucent for four units of depth, so the minified lake bed showed through as swimming grain that crawled with the camera. Water now reaches opacity within about one unit of depth, keeping a translucent lip at the shoreline. Also traced and fixed on the way: the shadow bias from v3.4.1 was far enough the other way to let terrain shadow itself into speckle (now 0.22, between the detached 0.5 and the noisy 0.06), the water's Fresnel term is driven by the smooth normal instead of a sub-pixel ripple, ripple strength and sun glitter fade with range, and terrain normal, roughness and albedo detail are damped with distance to stop specular sparkle.
- **Mesh changes apply immediately**: picking a style that wants a different world mesh no longer says it will take effect later. In the menu it regenerates, and in a match it rebuilds and restarts the match.

## v3.4.2 — 2026-09-03 — Metal spot pads lit per planet
- The metal-spot pads were one shared instanced mesh, so they could only carry one sun direction and pads on every planet except the focused one were lit from the wrong side. Each planet now gets its own pad mesh bound to its own sun, alongside the atmosphere and art style it already took. The glow rings stay a single mesh because they are unlit additive sprites.

## v3.4.1 — 2026-09-03 — Audit pass: 23 verified defects fixed
A multi-agent review of the whole codebase found 31 candidate defects; 23 survived adversarial verification and are fixed here.

**Rendering**
- The post-processing chain was never told the display's pixel ratio, so the entire game rendered at CSS resolution and was upscaled. Render resolution is now a real quality setting: Medium 1x, High 1.5x, Ultra the full device ratio. High is 1.5x sharper than before and still holds 60 fps in every style.
- Per-planet sunlight never worked. The override targeted a line that lives inside a three.js include, and `onBeforeCompile` runs before includes are resolved, so the substitution silently matched nothing and the uniform was optimised away. The light chunk is now inlined with the call site patched, scoped to the key light so each style's fill light keeps its own direction. Planets away from the camera are lit by their own star again.
- Toon styles divided direct light by the full albedo, ignoring the metalness factor three.js has already applied, so every metallic hull read as permanently in shadow. Units are lit properly in Cel, Comic, Spider-Verse, Reliquary and The Coil.
- Shadow normal bias was 0.5 world units, which detached every contact shadow from its object; now 0.06.
- The ink pass sampled the wrong depth buffer. The composer's two targets own separate depth textures and swap parity per frame, so outlines could key off a stale frame.
- Ambient occlusion re-rendered the entire shadow map a second time every frame.
- Grass blades are double-sided cards, and three flipped the normal on back faces into the ground, leaving half of every tuft unlit.
- Bloom is damped in the system view, where the star used to blow out the frame in the heavy-bloom styles.

**World connectivity**
- Everything in the world is placed by one height function, and it disagreed with the mesh actually drawn: it averaged each vertex with its neighbours, which pulled ridges down and hollows up by as much as 5 units. It now intersects the ray with the triangle being drawn. Mean placement error dropped from 0.14 to 0.002 units at subdivision 8 and from 0.19 to 0.002 at subdivision 7, and it runs slightly faster than the version it replaced.
- Scorch decals were spawned at the height the unit died, so every aircraft and orbital kill left a black disc hanging in the sky for a minute. Only ground deaths mark the ground.
- The prop scatter used a hand-rolled estimate of the navigation lattice spacing that was about half the real value, rejecting trees and rocks on ground that is not actually steep, and jittered them only 2.4 units on an 11-unit lattice so the scatter read as a grid.
- Missiles, bombs and metal-spot pads bypassed the style and atmosphere entirely and stayed brightly lit in the dark styles.

**Simulation**
- With no route to a destination a unit drove straight at it, across the sea. Unreachable orders are now dropped. A 310-second match ends with no ground unit in the water and no stranded orders.
- Ground titans could never use a teleporter: the separation radius held them further out than the arrival test allowed.
- An attack order against something none of the unit's weapons can hit is refused instead of becoming an order that never finishes.
- A single enemy unit parked near any structure suppressed the AI's attack waves indefinitely, even when nothing could respond.

**Interface and tooling**
- The in-game style dropdown kept keyboard focus, so its keystrokes drove the camera while every game hotkey was swallowed. It now releases focus, and the camera ignores keys typed into form controls.
- A selection drag interrupted by the match ending stranded the selection box into the next match.
- The alert shortcut could aim the camera at a planet belonging to the previous, disposed star system.
- Effects were dropped without freeing their GPU resources on every world rebuild, which style switching now triggers more often.
- Returning to the menu left the world marked as played, so the next launch regenerated an identical one.
- `node build.js` overwrote the already-released archive in `versions/`; cutting a new one takes `--release`.

## v3.4.0 — 2026-09-03 — Reliquary, The Coil and Poly styles; GitHub Pages ships the bundle
- **Reliquary** (from Cosmic Conquest: Reliquary): painted cutscene illustration — three wrap-lit bands whose boundary is jittered per world cell into knife-stroke patchwork, violet-hued shadows, faction-neon rim light (team colour on units, magenta elsewhere), wet posterised specular, paint tooth, ink before bloom, halftone in the shadow bands, canvas grain, chromatic aberration, exposure under 1.
- **The Coil** (from Cosmic Conquest: The Coil): the night cobalt sibling — desaturated duotone grade, mosaic tiles with dark grout, cyan glows and team-neon rims, strong bloom, heavy vignette, darkening ink.
- **Poly**: flat-shaded facets from screen-space derivatives on every surface including water, flat colours (textures collapsed to their averages, no normal maps), no outlines, grass tufts off; the world mesh drops to medium detail (subdivision 7, 164k vertices) so the facets read — applied immediately in the menu, or on the next launch in game. Props, units and spots are placed from the same mesh, so nothing floats.
- New shader ingredients available to every style: paint tooth (world-space value noise), per-cell band jitter, rim light, mosaic tiles, flat facets.
- GitHub Pages now serves the single-file bundle as the root page (the module dev page moved to `dev.html`), so a deploy can no longer mix cached old modules with a new page — the cause of the "new style cannot be selected" report. The in-game STYLE dropdown moved out of the top bar into its own panel under the planet bar so it cannot overflow off-screen on narrower windows.

## v3.3.0 — 2026-09-02 — Ink & Steel style
- Seventh style, requested as a blend: Comic's ink outline pass, fresnel silhouette ink and hatched shadow layers over Beyond All Reason's full-detail textures, strong metallic specular, bright ACES exposure and sharpened clarity, with atmospheric haze pushed past the realism baseline.
- New edge-pass option `fade`: ink lines dissolve into the haze with distance, so outlines stay crisp on nearby units and thin out on far mountains the way a comic artist would draw atmospheric perspective.

## v3.2.0 — 2026-09-02 — Art style lab: six switchable looks
- New style system: a style is a data bundle (material uniforms, lighting, atmosphere multipliers, post-processing chain) applied on top of the same world, so switching is instant — from the menu (Style row) or in game with the STYLE dropdown in the top bar and the `[` / `]` keys. The choice is saved with the other settings.
- **Polished Realism** — the v3.1 photographic baseline with a cohesive film grade (cool shadows / warm highlights, subtle grain).
- **Cel Shaded** — three-band toon light with cool flat shadows, softened painterly textures (mip-biased sampling), posterised sky, and a depth+normal ink outline pass.
- **Spider-Verse** — two-tone light, per-faction print treatments (the player's units get Ben-Day halftone dots, the enemy's get crosshatching and a desaturated ink palette), CMYK halftone pass, misregistered colour fringing, line boil, paper grain, magenta fill light.
- **Comic 3D** (Borderlands-like) — heavy ink outlines, crosshatched shadows on every surface, hand-painted texture softness, high-contrast Cineon grade with grunge.
- **Beyond All Reason** — crisp hard-lit PBR: stronger sun, low ambient, strong metallic specular, saturated team colours, almost no atmospheric haze, sharpened image.
- **Diorama** (original) — a war table of painted miniatures: matte clay surfaces with rim light, warm studio key plus cool fill light, tilt-shift focus band, no haze, saturated toy palette.
- Under the hood: every lit material now carries style hooks (albedo posterise/saturation, normal-map strength, texture mip bias, toon banding, shadow/lit tints, hatching, halftone, fresnel ink, clay rim), the composer gained an edge pass fed by the scene depth texture, a halftone pass, a parametric grade and a tilt-shift blur; the sun, hemisphere, environment and a new fill light are driven per style; tone mapping and exposure switch per style.

## v3.1.0 — 2026-09-02 — Unit fidelity pass, volumetric-look clouds, water-crossing fix
- Units and structures: baked ambient occlusion between parts (contact shadows under overhangs, around wheels, hatches and greebles) computed from sphere proxies at model build time (~0.2 s for all 41 models), applied to indirect light with specular occlusion and a lighter direct-light term.
- Edge wear: bevels and rims expose bare metal (brighter, more metallic, smoother) modulated by the plate texture, so paint reads as worn at the corners like real vehicles.
- Clouds: a normal map derived from cloud thickness gives the cloud deck rounded, self-shaded puffs instead of flat sprites; the deck stays in the shadow pass at close zoom so cloud shadows keep drifting across the ground.
- Fix: ground units no longer drive through the sea. The navigation grid is coarser than the terrain, so links between land nodes are now rejected when the terrain dips under water halfway, and units are clamped to the water surface in the rare remaining cases.
- Loading screen shows the unit build step; unit model build time is logged to the console.

## v3.0.1 — 2026-09-02 — Camera direction fix
- WASD / arrow keys were mirrored horizontally (D moved the view left) because the camera frame's "right" vector pointed to screen-left; keys now move the camera in the key's direction, and middle/right-drag pulls the world with the mouse.
- The same fix applied to the system view (A/D orbit, W/S tilt).

## v3.0.0 — 2026-09-02 — Realism pass: real PBR materials, physical sky, image-based lighting
- Real photo-scanned CC0 materials from ambientCG replace the procedural set: grass, rock, sand, snow, ice, lava crust (with its own emission map), gravel, metal plates for units, and bark for tree trunks. Each ships as colour + normal + roughness + ambient-occlusion + height maps, packed at build time and embedded in the standalone file (credits in `assets/tex/CREDITS.md`).
- Physically based atmosphere: single-scattering Rayleigh + Mie sky shell per planet (blue Terran sky, dusty Arid, sulphur-orange Magma, thin Barren) with a real sunlit limb from orbit, and aerial perspective on every surface (terrain, water, props, units, grass) — distant mountains fade into the sky the way they do in photographs. Replaces the old fog and rim glow.
- Dynamic image-based lighting: the real sky and terrain around the camera are captured to a cube map and filtered for reflections and ambient light, so metal reflects the actual sky colour and the shaded side of units picks up ground bounce.
- Ground-truth ambient occlusion (GTAO) on High as well as Ultra, with foliage, clouds and the sky shell excluded from the depth pass so they do not produce halos.
- Terrain: domain-warped continents and ridges (no more straight noise ridges), snow and ice exposure control per biome.
- Water: reflects the scattered sky along the reflected ray, GGX-style sun glitter over two scrolling normal-mapped wave layers, thin animated shore foam; lava seas with dark crust islands.
- Trees: deciduous canopies built from leaf-cluster cards, conifers from crossed needle cards plus a top card so they read correctly from above; bark-textured trunks; trees now cast shadows.
- Units: triplanar normal-mapped metal plating, bare metal vs painted metalness split, grime and roughness build-up toward the ground, edge cavities from the plate height map.
- Grass blades darkened to match the photographic ground.

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
