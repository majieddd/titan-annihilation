# Titan Annihilation

A browser real-time strategy game in the spirit of *Planetary Annihilation: TITANS*: spherical planets in a star system, a commander economy, factories, fabbers, titans, orbital units, teleporters, nukes, and an AI opponent. Built with three.js; everything (terrain, textures, models, sound) is generated procedurally at runtime.

**Play:** open `index.html` from a web server (GitHub Pages serves it at the repository root), or double-click a standalone build in `versions/`.

## Versions

Every release is kept as a standalone file in [`versions/`](versions/) so builds can be compared over time. See [VERSIONS.md](VERSIONS.md) for the changelog. The menu shows the version number under the title.

## Controls

- WASD / drag: orbit the planet. Wheel: zoom (keep zooming out for the system view). V: system view. Q/E: rotate.
- Left click / drag: select. Right click: move / attack (works across planets). A: attack-move. S: stop. N: nuke.
- Shift: queue orders / multi-place. Ctrl+1-9: control groups. H: commander. Tab: next idle fabber. P: pause.
- Orbital launchers build orbital fabbers that fly between planets. Link two teleporters (select one, right-click the other) to move ground armies across the system. Nukes hit any planet; anti-nukes intercept them.

## Development

- `src/` holds the ES modules; `index.html` loads them through an import map (three.js from jsdelivr).
- `node build.js` bundles everything into `dist/index.html` (single file) and `versions/titan-annihilation-v<version>.html`.
- `python3 serve.py 8124` runs a no-cache dev server.
- `texlab.html` previews every procedural material with generation timings.
- Debug hooks in the browser console: `__app` (app state) and `__app.advance(seconds)` to fast-forward the simulation.
