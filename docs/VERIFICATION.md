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

Minimal HUD: `node scripts/verify-minimal-hud.mjs webkit http://127.0.0.1:5181/ artifacts/review/item-2.8/webkit`; repeat with `chromium`. Native settings/camera taps cover both units and Chase/Cockpit. The observed panel union is 23,576 CSS px², 7.1625% of 844×390, with live physics instruments/map checked. Touch controls and the 3D cockpit are outside that HUD area. Real iPhone safe areas remain pending.

Phone vibration: `node scripts/verify-phone-vibration.mjs android http://127.0.0.1:5181/ artifacts/review/item-2.9/android`; repeat with `iphone` for native WebKit. Original navigator.vibrate remains intact and is observed through actual Chase wheel contacts and collision reports. Chrome accepted five pulses, minimum gap 216.3 ms; Off survives reload and stays silent. Native WebKit has no API and remains quiet through the same contacts. Pose/forward-velocity fixtures shorten the approaches; this does not prove physical Android buzzing.

Fuel: `tests/fuel-laps.test.ts` completes actual fixed-step AI laps. Full 132 L versus the calibrated 80 L adds 0.4333 s; 132 L versus 15 L adds 0.9917 s with adaptive profiles, or 0.7417 s with identical driver targets. Every measured lap has zero wall impacts. `artifacts/review/item-3.1/fuel-runtime.json` checks native driving, actual HUD litres, frozen pause, recovery preservation, refilled Restart, and stable race profile references without changing the world cache. Manual and automatic reverse have separate engine-pedal burn regressions. Consumption is an estimate, not measured race telemetry.

Tyres: `tests/stint-laps.test.ts` measures fixed-step AI with owned runtime profiles: warm flying lap 124.386 s, cold versus warm standing start +0.831 s, lap 22 versus lap 2 +1.022 s with zero wall contacts. Temperature windows and wear rates are game estimates. `artifacts/review/item-3.2/tyre-runtime.json` covers native Hard/Soft selection, real HUD temperatures/tread, computed EST hiding, frozen pause, preserved recovery and fresh Restart. RaceSession keeps its selected compound; endless title loops fit warm fresh softs. Verification runners start through the labelled native button so added session options cannot redirect a smoke to the wrong row.

Telemetry: `node scripts/verify-telemetry.mjs chromium http://127.0.0.1:5181/ artifacts/review/item-3.3/chromium` runs one actual standing start and two flying laps using the existing preview autopilot/time-scale hook. 27,135 original session updates were observed intact; 2,297 interior samples match actual speed/throttle/brake exactly. Flying laps are 124.273 and 124.753 s. All six SVG traces, distinct Best/Ghost/lap choices, 23 rounded corner deltas summing to ±0.480 s, native narrow scrolling and both same-session resume routes pass. No pose, timer or trace data is inserted.

Setup: `node scripts/verify-setup.mjs chromium http://127.0.0.1:5181/ artifacts/review/item-3.4/chromium` checks all five values for each car, storage across reload, reset, actual race changes, keyboard bracket and standard-pad stick-click edges, simultaneous cancellation, legacy R1/Y behavior and recovery/Restart. The standard-pad fixture exercises original InputManager polling; physical hardware remains untested. The 453-test suite includes each setting’s actual stopping-distance/load-transfer/yaw effects and pressure × stint composition. Supplemental frozen comparison matches 32,400 steps across 45 scenarios against the exact 3.3 physics. Pressure response is an estimate.

Brakes: `node scripts/verify-brakes.mjs chromium http://127.0.0.1:5181/ artifacts/review/item-3.6` observes original simulation/session/camera methods and native controls. Three actual laps peak at 601.671°C with full force, zero impacts and no ABS flat spots; a subsequent Chase stop reaches 774.557°C and 6.18% fade without an impact. All eleven rendered HUD/glow, pause, recovery, fresh Restart and Soft/Hard checkpoints pass. Cold ABS-off braking creates persistent reduced-grip flat spots and wheel-phase body vibration. Fixtures set only pose/velocity; shared discs are four existing instances. The runner waits for pending touch-device selection before keyboard input. Combined cockpit Head movement Off is checked after 3.10. Physical vibration remains unverified.

Track grip: the shared 1.25 m Gaussian drives the generated road groove and actual wheel grip. Fresh on-line/off-line factors are 1.005 / 0.990000536; 600 moving simulation seconds raises on-line grip to 1.0125, capped at 1.02 after 1200 seconds. Native `artifacts/review/item-3.7/track-runtime.json` reads 546 actual road vertices and the owned TrackGrip: maximum disagreement is below 0.000005. Driving advances grip; native pause/recovery preserve it and Restart resets it. All 496 tests pass. The setup-specific stopping fixture isolates the new spatial rubber factor while retaining its original threshold; a separate unmocked all-car comparison verifies the signed native 0.15–0.25 m bias effect.

Kerbs: `artifacts/review/item-3.8/after/corners.json` compares 35 actual rendered mesh vertices across Hell, Griffins, McPhillamy, Chase and Murray’s with an independent height oracle and native Vehicle contacts. Maximum mesh disagreement is 0.000007866 m; native contact error is at most 2.23e-16 m. Ten before/after bonnet views and the frozen aerial/onboard references confirm inside placement. Hell’s existing barrier clamps its kerb to 0.40 m; Chase retains the 2.00 m, 65 mm estimated raised profile. Other checked corners use estimated flat profiles. Real heights remain unmeasured. Actual flat/raised crossings produce 8,472/21,038 N peak wheel load and 0.0668/0.2707 rad/s peak roll; the unchanged line-following and zero-impact lap gates pass in all 509 tests. All five frozen tiers run at nominal 60 fps.
