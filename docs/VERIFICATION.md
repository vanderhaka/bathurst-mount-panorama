# Independent verification — frozen rubric

Reviewers are fresh agents that did not build the game. They get the real game, the
evidence set from `scripts/capture-evidence.mjs`, this rubric and the references in
`docs/references/` and `docs/research/`. They do not get the builders' notes.

## Evidence
- `node scripts/capture-evidence.mjs artifacts/review/iter-N [--car mustang]` (game served at http://127.0.0.1:5181/).
- Screenshots: title, car select (both cars), grid, 12 famous corners in race view with the HUD,
  4 camera modes, racing line (full mode), damage, ghost lap, pause menu.
- `metrics.json`: load time, fps / draw calls / triangles at four places, damage values, AI lap times, console errors.
- Reviewers may also run the game themselves (`node scripts/play.mjs`, `node scripts/shot.mjs`) and read the code.

## Hard gates (any failure = FAIL regardless of score)
1. No console errors during the evidence run.
2. The race starts from the menus, the lights go out, and a full lap is timed.
3. 55 fps or more at 1920×1080 at all four perf points (Apple M-series, quality `high`).
4. Both the Camaro and the Mustang are selectable and drivable.

## Weighted criteria (total 100)
| # | Criterion | Weight | What earns full marks |
|---|---|---|---|
| C1 | Track realism | 20 | Layout, length (6.213 km), 174 m elevation, corner order and character match the real circuit and the references (Mountain Straight climb, Cutting, Skyline drop, Dipper, Conrod humps, Chase). |
| C2 | World visual quality | 20 | Coherent medium-poly style; lighting and palette read as an October afternoon at Bathurst; landmarks recognisable (pit building, grandstands, gantry, camping, gum trees, stone sign); no artefacts (z-fighting, floating or sunken objects, popping, stripes). |
| C3 | Cars | 15 | Camaro and Mustang recognisable at 10–30 m; Gen3 aero; livery; wheels; cockpit view believable; visible damage; ghost look. Primitive-built cars fail this criterion. |
| C4 | HUD and UI | 15 | Realistic broadcast/sim style; speed, gear, rpm/shift lights, timing, sectors, delta, map, damage, inputs, next-corner speed; menus clear and navigable. |
| C5 | Driving, racing line, speed indicators | 15 | Plausible Gen3 speeds and lap time (~2:04–2:15); racing line colours guide braking correctly; speed indicators consistent; camera feel. |
| C6 | Feature completeness | 10 | Lap timing, ghost, damage, gamepad support, cameras, settings, graphics tuner (F2). |
| C7 | Performance and robustness | 5 | Frame rate headroom, draw calls < 250, load time, no warnings. |

Score each criterion 0–weight with direct evidence (file name or measured value).

## Pass threshold
- Overall ≥ 85 and every criterion ≥ 60 % of its weight, and all hard gates pass.
- Report for each criterion: score, PASS/FAIL against 60 %, evidence, and the largest remaining gap.
- Finish with the top 5 defects ranked by impact on the user's request ("extremely high quality", realistic track, medium-poly, realistic HUD).

GPU evidence uses a frozen build (`npm run build`, then `npm run preview`).
`capture-evidence.mjs` runs its captures and then the tier benchmarks sequentially:
`metrics.json` includes actual rendered fps, GPU ms, all-pass draws and triangles
for four points on desktop High/Medium/Low and phone emulation Medium/Low.
A missing timer is reported as unavailable; emulation does not establish the
real-iPhone budget. D3 stays at 50 fps on Medium for three real laps.

## Phase 1 tier audit

`QUALITY` is the source of truth for CSM cascade count and map size, baked AO,
post processing, asset detail and camera effects. The tuner adjusts a feature's
value; its tier switch still decides whether it runs.

| Feature | Low | Medium | High |
|---|---|---|---|
| Sky / haze | simple dome / fog | dome / aerial perspective | physical sky / aerial perspective |
| Shadows | 1 × 512 | 2 × 768 | 3 × 2048 |
| Vertex / contact AO | baked | baked | baked |
| Screen AO / bloom / SMAA / camera effects | off | off | on |
| Asphalt aggregate, repairs and wear | base | base | detailed |
| Terrain detail / moving grass | off | off | on |
| Bark / leaf wind / underbrush | base / off / off | base / off / off | detailed / on / on |
| Wall wear / fence mesh / crowd | base | light / static | detailed / moving |
| Distant buildings / terrain detail | base | reduced | full |

Item 1.8's rejected car materials and item 1.10's isolated effects are excluded.
Phone paint atlases use Low 512 × 320, Medium 1024 × 640, High 2048 × 1280.
Medium uses 2× MSAA. Low releases unused HDR targets. Automatic quality rebuilds world maps and live car atlases; unused old maps are disposed.
It uses raw render intervals for ten active race seconds, respects an intentional frame cap,
and saves the tier and pixel density per device. Selecting a tier disables adaptation.
D3 adopts **50 fps on Medium for three laps on James's iPhone**. Mac Chrome phone
emulation proves code paths and console cleanliness; the physical check is pending.

## WebKit phone checks

D4 accepts the Playwright WebKit download. Install it with `npx playwright install webkit`.
Run `node scripts/play.mjs scripts/scenarios/phone-controls.json --engine webkit --mobile --size 844x390 --url http://127.0.0.1:5181/`;
repeat with `--engine chromium`. Native taps start the race, pause and resume it.
Chrome uses native CDP for held two-thumb input and pinch. WebKit uses synthetic
DOM pointers and Safari gesture events for those two checks; the output labels this.
Both engines check release, cancelled zoom gestures and portrait pause. WebKit's
coarse pointer also enables controls when its emulation reports zero maxTouchPoints.
These runs do not reproduce iOS Safari toolbar movement, physical pinch zoom,
rotation hardware or real device performance. Check those on James's iPhone.

Touch options: `node scripts/verify-touch-options.mjs chromium http://127.0.0.1:5181/ artifacts/review/item-2.7`; repeat with `webkit`. Native menu taps cover all choices and saving. Chrome held controls use CDP; WebKit held controls use synthetic routing. Tilt readings and granted/denied permission responses are explicit fixtures, with activation checked on the Enable tilt tap. They do not establish physical sensor behaviour or the native iPhone prompt.
