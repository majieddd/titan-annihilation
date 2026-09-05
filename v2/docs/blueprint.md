# Titan Annihilation v2 running blueprint

## Reference
Planetary Annihilation: TITANS is the existing project's mechanical reference. Borrowed mechanics: spherical navigation, continuous construction economy, factory production, interplanetary travel, commander elimination. This browser edition adds a guided opening, a readable tactical material treatment and a built-in comparison playtest lab.

## Pillars
1. Every command should register once and have visible feedback.
2. Machines should move as connected assemblies, with a stable readable silhouette.
3. Spend rendering time on the visible battlefield and keep simulation independent of appearance.
4. Teach a working economy before asking the player to manage five worlds.

## Core loop
Select commander, claim metal, build energy, establish factories, produce a combined army, expand and destroy the enemy commander. Between battles, compare seeded systems and difficulties. There is no invented metaprogression or multiplayer scope.

## Kit
Reuse the repository's procedural unit definitions, five biomes and nine CC0 PBR texture families: grass, rock, sand, snow, dust, ice, crust, panel and bark. The authoritative inventory is src/defs.js and ../assets/tex/CREDITS.md. Model previews are rendered from the same geometry as the battlefield.

## Concept
Selected concept is tactical sci-fi, recorded in DESIGN.md after the owner's choice. Reference frames are the played v3.8.0 Terran landing and extractor build. The local lab's Battle showcase and model inspection view supply the actual geometry review sheet, so art approval uses the game assets themselves.

## Mechanics
### Spherical navigation
Purpose: move selected units across reachable terrain and camera across the world.
Experience: responsive orders, smooth movement and clear arrival.
Inputs: right click, A attack move, S stop; arrow keys or drag for camera.
Outputs: formation goals and queued paths, interpolated visible unit transforms.
Edge cases: unreachable continents, queued paths after a new command, tab blur, teleporter transitions.
Failure: reject routes with visible feedback; never restart a match.

### Continuous construction economy
Purpose: convert stored metal and energy into structures and units.
Experience: the player sees efficiency and resource pressure before stalling.
Inputs: selected builder, valid terrain or metal spot, build command.
Outputs: gradual construction and current production rate.
Edge cases: empty stores, simultaneous builders, destroyed construction target.
Failure: slows production and explains the missing resource without negative balances.

### Factory production
Purpose: produce an army from a repeatable build queue.
Experience: readable unit silhouettes, cost, queue count and build progress.
Inputs: factory selection, unit button, Shift for five, loop and rally.
Outputs: completed unit with rally order, live queue progress.
Edge cases: cancelled queued item, focus during progress updates, factory destroyed.
Failure: valid queues remain clickable while running; no duplicate production orders.

### Interplanetary travel
Purpose: carry an economy and army to another world.
Experience: zoom to system, send orbital fabbers, link teleporters.
Inputs: destination world, reachable orbital unit or linked gate.
Outputs: travel state followed by destination orders.
Edge cases: unlink or destroy either gate, move during transit.
Failure: inaccessible route gives clear feedback.

### Commander elimination
Purpose: finish a match with an unambiguous win or loss.
Experience: the commander's health remains visible and the results explain the match.
Inputs: damage from projectiles, beams or nuclear blast.
Outputs: terminal winner, statistics and restart/menu controls.
Edge cases: simultaneous commander deaths, repeated damage after death, restart.
Failure: one terminal event; no lingering active input after defeat.

### Field repair
Purpose: let builders restore damaged friendly units and structures for resources.
Experience: right click a damaged ally to repair, giving a practical recovery choice.
Inputs: built friendly target below full health, selected builder, enough income.
Outputs: paid HP restoration, repair beam and completed order at full HP.
Edge cases: zero-cost commander, target death or transit, damage during repair.
Failure: resource shortages slow repair; never creates resources or repairs enemies.

## Numbers
| Value | Number | Rationale |
|---|---|---|
| Simulation tick | 1/60 s | Preserve existing balance and timing |
| Render interpolation | 0 to 1 tick | Smooth 60Hz poses on higher refresh displays |
| Target acquisition | 0.3 to 0.4 s | Bound repeated enemy scans when no target exists |
| Repair cost | 60% of replacement | Repair rewards preservation without free recovery |
| Commander repair basis | 3000 metal | Zero-cost commander must not yield infinite repair |
| Initial systems | 3 planets | Faster start and manageable opening; all five remain selectable |
| Terrain detail | 7 | Existing medium geometry is sufficient at tactical distances |
| Shadow map | 1024 medium, 2048 high, 4096 ultra | Tiered performance budget |
| Render pixels | bounded by quality | Prevent high-DPI fullscreen pixel cost from exploding |

## Content
Five world biomes, existing unit/factory/orbital/titan roster. World overview: V system view and planet buttons. Model inspection: v2/catalog.html. Battle showcase: tests/browser.html, Battle showcase button. No unit roster removals.

## Interface
Menu: mission summary, difficulty and launch, advanced setup collapsed. In play: top economy, persistent commander health, left opening checklist, bottom selected model and production, compact orders, planet rail. Live efficiency, idle factory/builder selection, keyboard help, pause/settings and comparison link are discoverable controls.

## Build order
1. Record original game's end-to-end combat loss and full self-play.
2. Correct commands, repair, hot appearance changes and focus loss.
3. Add interpolated movement and connected model rig animations.
4. Apply tactical art direction, material tuning and bounded render quality.
5. Improve onboarding, production controls and model inspection.
6. Run regression, compare renders, publish v2 and repeat on GitHub Pages.

## Verification
tests/browser.html runs the actual game and reports visible JSON assertions. Full match uses AI on both teams with real economic and combat rules. Combat end test uses real weapon damage. Functional regression covers construction, repair, queue, movement, travel, death, pause and style preservation. Benchmark samples requestAnimationFrame separately from the clamped simulation clock. Manual play covers selection and construction.

## Decided
| Decision | Status | Evidence |
|---|---|---|
| Preserve original root | in game | v2 has independent source; git diff limited to v2 |
| Tactical direction | partial | Owner selected tactical sci-fi in conversation |
| Repair and onboarding | not yet | |
| Interpolated animation and render budgets | not yet | |

## Task list
| # | Item | Status | Commit | Check id | Usage |
|---|---|---|---|---|---|
| 1 | E2E original | pending | baseline 9ad79c5 | tests/browser.html?baseline | unmeasured |

## Where we are
2026-09-05: inspected repository and manually played landing, selection and extractor placement. Confirmed repeated click needed when ghost validation lags input. Found conflicting camera/command keys, style-triggered restart, fixed-rate pose stepping and repeated DOM replacement. Implementation is isolated under v2.
