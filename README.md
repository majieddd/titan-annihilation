# Titan Annihilation

A browser real-time strategy game in the spirit of *Planetary Annihilation: TITANS*: spherical planets in a star system, a commander economy, factories, fabbers, titans, orbital units, teleporters, nukes, and an AI opponent. Built with three.js. Terrain, models and sound are generated procedurally at runtime; since v3.0 the surface materials are real photo-scanned PBR texture sets (CC0, from ambientCG — see [`assets/tex/CREDITS.md`](assets/tex/CREDITS.md)), lit by a physically based scattering atmosphere and dynamic image-based lighting.

**Play:** open `index.html` (the single-file bundle that GitHub Pages serves at the repository root), or double-click a standalone build in `versions/`. `dev.html` is the module version for development.

## Versions

Every release is kept as a standalone file in [`versions/`](versions/) so builds can be compared over time. See [VERSIONS.md](VERSIONS.md) for the changelog. The menu shows the version number under the title.

## Art styles

Ten switchable looks share the same world (see `src/style.js`): Polished Realism, Cel Shaded, Spider-Verse, Comic 3D, Beyond All Reason, Ink & Steel, Reliquary, The Coil, Poly and Diorama. Pick one on the menu's Style row, or switch in game with the STYLE dropdown in the top bar or the `[` / `]` keys. A style is a data bundle of material uniforms, lighting, atmosphere multipliers and post-processing settings, so switching is instant.

## Controls

- WASD / drag: orbit the planet. Wheel: zoom (keep zooming out for the system view). V: system view. Q/E: rotate.
- Left click / drag: select. Right click: move / attack (works across planets). A: attack-move. S: stop. N: nuke.
- Shift: queue orders / multi-place. Ctrl+1-9: control groups. H: commander. Tab: next idle fabber. P: pause.
- Orbital launchers build orbital fabbers that fly between planets. Link two teleporters (select one, right-click the other) to move ground armies across the system. Nukes hit any planet; anti-nukes intercept them.

## Development

- `src/` holds the ES modules; `dev.html` loads them through an import map (three.js from jsdelivr). `index.html` is the built bundle.
- `node build.js` bundles everything into `index.html` (Pages root), `dist/index.html` (artifact body), `dist/titan-annihilation.html` and `versions/titan-annihilation-v<version>.html`.
- `python3 serve.py 8124` runs a no-cache dev server.
- `texlab.html` previews every procedural material with generation timings.
- `python3 tools/fetch_textures.py` downloads and packs the ambientCG texture sets into `assets/tex/` (1K, served) and `assets/tex-embed/` (768px, embedded into the standalone builds by `build.js`). The game falls back to the procedural materials if the sets are missing.
- Debug hooks in the browser console: `__app` (app state) and `__app.advance(seconds)` to fast-forward the simulation.
