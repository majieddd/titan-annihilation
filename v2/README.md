# Titan Annihilation v2: Tactical Edition

[Play v2](https://majieddd.github.io/titan-annihilation/v2/) · [Play the original](https://majieddd.github.io/titan-annihilation/) · [Model roster](https://majieddd.github.io/titan-annihilation/v2/catalog.html)

An independent tactical edition of the original v3.8.0 game. The `/v2` name is the comparison destination requested by the owner, not a downgrade of the original version number. The root game is preserved.

## What changed

- Tactical materials, restrained lighting and explosions, cleaner skies, beveled commander armor and connected articulated legs, knees, arms, wheels and recoil.
- Interpolated unit position, rotation, turret, gait and recoil. Strategic icons now appear farther out so they do not cover models at normal play distance.
- Single-click construction placement, camera/command key separation, appearance changes that preserve the match, paid field repair and consistent shared resource spending.
- Guided opening, persistent commander health and construction efficiency, idle factory/builder controls, army selection and actual model portraits throughout production and selection.
- Bounded rendering resolution, adaptive resolution, tiered shadows, horizon culling and dynamic instance capacity for large armies. All five worlds and all 51 unit definitions remain available.
- Pause/settings dialog, volume and reduced-motion controls, separate saved preferences, keyboard focus and compact layouts.

## Controls

| Action | Control |
|---|---|
| Select / group select | Left click / drag |
| Move, attack, assist, repair | Right click |
| Attack-move / stop | A / S |
| Camera orbit / zoom | Arrow keys or drag / wheel |
| Camera rotation | Q / E |
| Commander / army | H / F |
| Idle factory / builder | I / Tab |
| Queue orders / save control group | Shift / Ctrl + 1-9 |
| System / nuclear order | V / N |
| Pause / settings | P / Escape |

Best played with a mouse and keyboard. Compact layouts do not add touch RTS controls.

## Develop and verify

From the repository root:

```sh
node v2/build.mjs
python v2/tests/serve.py 8125
```

Open `http://127.0.0.1:8125/v2/dev.html` for modules, or `/v2/` for the built game. The v2 build command writes only `v2/index.html`.

Open `/v2/tests/browser.html?bundle&compare&w=1280&h=720&auto=suite` for the release regression suite. The lab also exposes full AI matches, real combat end states, fixed battle scenes and render-work measurement. Add `baseline` to run the original. `compare` deliberately sets local test preferences to five worlds, high quality, normal difficulty, seed `titan` and fixed resolution.

The local server can save evidence to a directory passed as its second argument. Evidence POST requests are local test tooling; GitHub Pages does not accept or store them.

[Playtest findings and evidence](docs/PLAYTEST.md) · [Running blueprint](docs/blueprint.md) · [Design contract](DESIGN.md)

## Assets and scope

The procedural roster and existing CC0 texture families are reused and refined. Textures are fetched from `../assets/tex/` and retain the [original credits](../assets/tex/CREDITS.md). Three.js remains pinned to the repository's 0.170.0 CDN version. This edition uses procedural animation, not imported skeletal character assets.

No multiplayer, fog-of-war rewrite, saved matches or mobile control system is included in this release.
