# Titan v2: tactical sci-fi

## North star
A field command console overlooking a physical miniature battlefield. Read the army, terrain and next order immediately. Keep the spherical RTS identity and existing model vocabulary.

## Direction studies
| Direction | Layout skeleton | Type and accent | Fit |
|---|---|---|---|
| Tactical sci-fi, selected by owner | narrow mission panel / unobstructed battlefield / compact bottom production strip | Orbitron titles, Rajdhani controls, ice blue | Clear command decisions; less theatrical than cinema |
| Living diorama | soft world view / large illustrated unit panel / painted menus | Rajdhani, leaf green | Expressive tabletop scale; less industrial |
| Cinematic warfare | fullscreen world / minimal corners / expanding command tray | Orbitron, amber | Spectacle; hides more information during play |

## Dials
DESIGN_VARIANCE: 6/10
MOTION_INTENSITY: 3/10
VISUAL_DENSITY: 7/10

## Tokens
The authoritative CSS tokens are in theme.css. Ground #09121a, raised surface #152631, text #e1edf1, muted text #a6becb, accent #79d4ed. Orange means enemy or warning, red means critical damage, green means healthy or complete. Terrain uses biome colors; team identification is blue versus orange. These are semantic colors rather than extra brand accents.

## Type and primitives
Orbitron is the existing game's display face. Rajdhani is the deliberate compact command face, with Segoe UI fallback. Type scale: 11, 12, 14, 16, 20, 28, 44 px. Body copy maximum 62ch. Spacing scale 4, 8, 12, 16, 24, 32 px; radius 2 and 4 px only.
Primitives: button (.primary, .active, :disabled), .panel, .opt, .bbtn, .field. Existing HUD primitives are reused. Model preview and mission rail are new domain-specific components.

## Motion
HTML feedback uses transform and opacity, 160ms ease-out. No animated resource widths or repeating warning pulse. Simulation remains fixed at 60Hz, render poses interpolate between ticks. Camera easing is time based. Reduced motion disables shake, idle camera drift and decorative model sway. Gameplay movement is retained.

## Do not
- Restart a match to change appearance.
- Blur the action with tilt shift or chromatic aberration in the default style.
- Ink every tree edge or amplify the nebula behind a battlefield.
- Rebuild interactive DOM every 400ms and steal focus.
- Change the original game at the repository root.

## Preflight
New controls need focus rings, labels, fit at desktop and no page overflow at 375, 768 and 1280 px. Layout measurements are recorded by the regression lab. Existing procedural models and CC0 surface textures are the visual kit; no unrelated raster illustrations are introduced.
