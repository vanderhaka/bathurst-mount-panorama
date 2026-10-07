# Plan: next work for Mount Panorama (from October 2026)
This plan puts the agreed work in order. Do the phases in order. Inside a phase, do the items in order unless an item says that it can move. Not in this plan (later): game modes and competition, and error monitoring (Sentry).
| Phase | Theme | Items | Goal |
|---|---|---|---|
| 1 | Graphics realism | 1.0 – 1.12 | Close 50 % of the gap between the game and real photos (Realism Index), toward the new art direction: about 75 % of the way to photoreal |
| 2 | Phone strength | 2.1 – 2.9 | A safe, fast, measurable phone version |
| 3 | Racing realism | 3.1 – 3.11 | Tyres, brakes, fuel, setup and track grip that behave like a real Gen3 car |
Sizes: **S** = small, **M** = medium, **L** = large (relative to each other, not time promises).
## How to work on every item
1. Read the item. Check its "Depends on" line.
2. Before you write code against three.js or any other library, read its current documentation (Context7).
3. Write the tests first where the item has testable logic.
4. Do the work. Keep the repository rules: files at most 300 lines, TypeScript strict, `@/` imports, generated assets only (no photo textures, no real logos).
5. Check the "Done when" list. Every item also needs:
   - `npx tsc --noEmit` clean, `npx vitest run` passing, `npm run build` passing;
   - no new console errors in `node scripts/play.mjs` runs on desktop and on `--mobile`;
   - screenshots before and after for every visual change;
   - the frame-rate budget of each quality tier (see Appendix B).
6. Commit with one Conventional Commit per item; push `codex/bathurst-plan` to Vercel Preview. The user superseded main/production delivery on 2026-10-08. Main stays unchanged.
7. Phone items: the user checks the item on a real iPhone after the deployment.
8. Dev-only tools stay behind `DEV_TOOLS` (local builds and Vercel preview deployments).
9. Agents that work without the user (for example overnight): when an item needs an open decision, use the recommendation in the decisions table and write the choice in the commit message. Do not stop for a decision that has a recommendation.
## Decisions for the user
Decide these when the plan reaches them. Each one names the item that needs it. If the user is not available, use the recommendation.
| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| D1 | Change the art direction from "medium-poly, not photoreal" | 1.1 | **Decided (2026-10-07): about 75 % of the way to photoreal.** Real light, materials and detail; the medium-poly geometry may show on close inspection; generated assets only (no photo textures, no real logos). |
| D2 | Default time of day for the look | 1.2 | Race-day afternoon (about 15:00 AEDT, second Sunday of October). |
| D3 | Frame-rate budget for phones | 1.11 | 50 fps or more on the user's iPhone on Medium. |
| D4 | Download the Playwright WebKit browser (about 100 MB) | 2.5 | Accept: it tests the Safari engine, which Chrome emulation does not. |
## Phase 1 — Graphics realism (+50 %)
**Goal.** Close 50 % of the gap between the game and real photos of Mount Panorama, measured with the Realism Index (Appendix A). The art direction (D1) sets the ceiling at about 75 / 100. Target = the lower of 75 and baseline + 0.5 × (100 − baseline). Example: a baseline of 40 / 100 gives a target of 70 / 100; a baseline of 52 gives 75.
**Rules for this phase.**
- Keep the medium-poly geometry and the triangle budgets in `docs/ART_DIRECTION.md`. Realism comes from light, materials, detail textures and density, not from photo textures.
- Every new feature has a switch per quality tier (`QUALITY` in `src/config/graphics.ts`) and a value in the graphics tuner (T key, dev builds).
- Phones must not get slower: heavy features are High only until Phase 2 adds automatic quality.
### 1.0 Baseline and guard rails — S
Status: done (commit 896f619e794d5268659ba8cb964b878d5a955b8b).
- **Do:**
  1. Pick 12 matched viewpoints: the 12 corner shots of `scripts/capture-evidence.mjs`, each with a real photo from `docs/references/` taken from a similar place and angle. Add 3 car close-ups (one per make) against race photos.
  2. Write `docs/REALISM.md` with the viewpoints, the photos and the scoring sheet (Appendix A).
  3. Run the scorecard on the current build: two fresh reviewers (the same two reviewer briefs for every later round) and the user. Record the baseline Realism Index.
  4. Record the performance baseline: fps, GPU frame time, draw calls and triangles at the four evidence points on desktop High, and fps on the user's iPhone on Medium.
  5. Add CI: a GitHub Actions workflow that runs types, tests and the build on every push and pull request.
- **Done when:** `docs/REALISM.md` has the baseline scores; the performance baseline is in `artifacts/review/realism-baseline/metrics.json`; CI is green on the preview branch (latest user delivery override); the real-iPhone baseline remains pending.
### 1.1 Art direction update — S
Status: done (commit c4cfd33c090bd5da41ab3fa1361ec78ef9bae9fd).
- **Depends on:** D1 (decided: about 75 % of the way to photoreal).
- **Do:** Rewrite `docs/ART_DIRECTION.md` for "about 75 % of the way to photoreal": physically based light and materials; procedural normal, roughness and detail maps allowed; smooth shading allowed for terrain and car bodies; the medium-poly geometry may show on close inspection; generated assets only; new budgets for texture memory per tier. Add 3 reference-photo pairs that show "75 %" (what to match and what may stay stylised).
- **Done when:** the document states the new rules and the old rules that stay (no logos, generated assets, real scale, triangle budgets).
### 1.2 Light, sky and atmosphere — M
Status: done (commit d8ae91fb4ef4e6173023352c14ea701525a622b3).
- **Depends on:** D2.
- **Do:**
  1. Compute the sun position from Bathurst's latitude and longitude, the date and the time (solar position formula). Add a time-of-day value to the graphics config.
  2. Replace the custom sky dome with a physical sky (three.js `Sky`) or tune the dome to match it; keep the environment map from the sky (PMREM) for reflections.
  3. Replace plain exponential fog with aerial perspective: fog that thickens with distance and height and takes a warm tint toward the sun.
  4. Compare ACES, AgX and Neutral tone mapping on the 12 viewpoints. Keep the one with the best scorecard result.
  5. Add subtle bloom (High only) for sun glints, lights and chrome.
- **Done when:** the sky, the haze and the sun angle match the reference photos at Pit Straight, Skyline and Conrod; the tuner changes the time of day live.
### 1.3 Shadows and ambient occlusion — M
Status: done (commit 6b64646c40908224bbe7fc797960e34619f8927c).
- **Do:**
  1. Use cascaded shadow maps (three.js `CSM`): 3 cascades on High, 2 on Medium, 1 on Low. Soft edges with correct bias (no acne, no peter-panning).
  2. Bake ambient occlusion into vertex colours at world build: terrain from the height field (hemisphere samples), and a contact darkening under every placed object. This costs nothing at run time, so phones get it too.
  3. Add screen-space ambient occlusion (`GTAOPass`) on High only.
- **Done when:** objects sit on the ground (no floating look) in every viewpoint; shadows are sharp near the car and still present at 300 m; High stays inside its budget.
### 1.4 Track surface — M
Status: done (commit bf74e230b47a894628cd54e7b36c079fa5ec136f).
- **Depends on:** 1.1.
- **Do:**
  1. Asphalt: procedural tiling normal and roughness maps (aggregate grain, patch repairs, crack-sealing lines), large-scale colour variation along the lap.
  2. Rubbered racing line: darker, smoother, with a soft sheen at low sun. Use the existing racing line to place it.
  3. Skid marks in the braking zones (from the speed profile: where the brake ratio is high) and at the walls of The Chase, Murray's and Forrest's Elbow.
  4. Kerbs: real profile geometry (raised edge), paint wear, tyre rubber on the apex side. Make the inside kerb at The Chase T21 about 2 m wide, as the aerial photo shows.
  5. Painted lines: wear and small gaps.
- **Done when:** a close view of the road at Hell Corner and The Chase reads as asphalt in the reference photos; no texture stretch or repeat pattern is visible at 5–50 m.
### 1.5 Terrain and grass — M
Status: done (commit pending; exact SHA is recorded by the next item and in HANDOFF.md).
- **Do:**
  1. Smooth terrain normals with a procedural detail normal map; keep the large shapes.
  2. Splat by slope, height and distance from the track: green grass, dry grass, bare clay, rock, gravel.
  3. Mown verges near the track (stripes along the road), longer grass further out.
  4. Instanced grass blades near the camera with wind movement in the vertex shader; density per tier.
- **Done when:** the grass on Mountain Straight and the verges at Conrod match the reference colours and texture at game distance; no tiling pattern is visible from the TV cameras.
### 1.6 Gum trees and bush — L
- **Do:**
  1. Eucalyptus crowns from clusters of alpha-tested leaf cards (procedurally drawn leaves), with alpha to coverage under MSAA.
  2. Bark: pale smooth gums and rough grey box trees with procedural bark textures; the existing trunk shapes stay.
  3. Wind sway: branches and leaf cards move in the vertex shader; amplitude in the tuner.
  4. Far LOD: cross-billboard impostors that keep the same oval crown silhouette (see the gum-tree lesson in `~/.claude/lessons.md`).
  5. Shrubs and fallen bark under the trees on the Mountain.
- **Done when:** the bush at The Cutting, Skyline and The Dipper reads as Australian woodland next to the reference photos; triangle and draw-call budgets hold; no visible popping between LODs.
### 1.7 Trackside and distance — M
- **Do:**
  1. Concrete walls: weathering, tyre scuffs at impact points, sponsor panels with fictional brands.
  2. Catch fences: real wire mesh density with alpha, cable stays, post caps.
  3. Grandstand crowds: more variety (clothing colours, flags, umbrellas), and a gentle movement on High.
  4. Ground detail: marshal flags, TV camera towers, cones, tyre bundles at the right corners.
  5. Distance: Bathurst town, the plains and the hills with haze from 1.2; the Mount Panorama silhouette from the plains.
- **Done when:** the Pit Straight, Skyline and Murray's viewpoints show the landmarks of the reference photos at the right scale.
### 1.8 Cars — M
- **Do:**
  1. Paint: physical material with clearcoat; metallic flake as a livery option.
  2. Materials: carbon splitter and wing, rubber tyres with sidewall roughness, metal brake discs, tinted glass with environment reflections.
  3. Lights: emissive head and tail lights that feed the bloom.
  4. Dirt: rubber and dust build-up on the lower body and the rear over a stint; a clean car after Restart.
- **Done when:** the three car close-ups score at least the Phase 1 target; no extra draw calls beyond the car budget.
### 1.9 Anti-aliasing and camera effects — S
- **Do:**
  1. Add SMAA (or TAA on High) for edges that MSAA misses, and alpha to coverage for foliage and fences.
  2. Subtle camera motion blur at high speed (High; a setting to turn it off).
  3. A subtle sun lens flare, only when the sun is in view.
- **Done when:** fences and leaves do not shimmer when the camera moves; the setting turns motion blur off.
### 1.10 Effects — S
- **Do:** exhaust flames on overrun and downshifts; better tyre smoke and off-track dust; floor sparks on the Conrod humps at full speed; rubber marbles off the racing line.
- **Done when:** each effect shows in a capture at its real place and costs less than 0.5 ms on High.
### 1.11 Quality tiers and performance — M
- **Depends on:** D3.
- **Do:**
  1. Put every Phase 1 feature in the tier table (`QUALITY` in `src/config/graphics.ts`).
  2. Extend `scripts/capture-evidence.mjs` to record GPU frame time per tier.
  3. Measure on desktop High and on the user's iPhone on Medium and Low.
- **Done when:** every tier meets Appendix B; the user's iPhone runs 3 laps on Medium with no graphics loss.
### 1.12 Scorecard round, user review and release — S
- **Do:**
  1. Run the scorecard (same reviewers and sheet as 1.0).
  2. The user reviews the game with the graphics tuner and gives values; make them the defaults.
  3. Update `README.md` and `docs/ART_DIRECTION.md`. Ship to preview (latest user delivery override).
- **Done when:** the Realism Index reaches the target, or the user accepts the result.
## Phase 2 — Phone strength
**Goal.** The phone version is safe, fast and measurable.
### 2.1 Keep the screen awake — S
- **Do:** request a Screen Wake Lock while a race runs; release it on pause, results and page hide; request it again after the page shows.
- **Done when:** the iPhone screen does not dim during a 3-minute lap.
### 2.2 Android full screen and landscape lock — S
- **Do:** on the first tap on Android, request full screen and lock the orientation to landscape. Do nothing on iPhone (no support); keep the Home Screen tip there.
- **Done when:** an Android phone plays in full screen landscape after one tap.
### 2.3 Smaller download and less memory — S
- **Do:**
  1. Remove the test pages (`harness/*.html`) from the production build.
  2. On phones: smaller shadow maps, livery atlas and terrain textures; dispose unused render targets.
  3. Measure the download size and the GPU memory before and after.
- **Done when:** the first download is at least 25 % smaller; phone GPU memory is lower than before Phase 1.
### 2.4 Automatic graphics quality — M
- **Do:** measure the frame time in the first 10 seconds of a race; if it is above the tier budget, step down (High → Medium → Low, then pixel density). Save the result per device. Show a short note when the quality changes; the player can override it in Settings.
- **Done when:** a throttled desktop (CPU and GPU slowdown in Chrome) steps down by itself and stays down after a reload.
### 2.5 WebKit test engine — S
- **Depends on:** D4.
- **Do:** install Playwright WebKit; run the phone play scenarios (`scripts/play.mjs --mobile`) in WebKit as well as Chrome.
- **Done when:** the phone scenarios pass in WebKit; any WebKit-only fault has a fix or an issue.
### 2.6 Offline play — S
- **Do:** a service worker that caches the game files and fonts; a new version replaces the old one on the next start.
- **Done when:** the Home Screen app starts and plays with the network off.
### 2.7 Touch-control options — M
- **Do:** in Settings > Steering, add:
  1. Touch steering mode: drag (current), tilt (gyroscope; iOS asks for permission on a tap), or left/right buttons.
  2. Analog throttle: thumb position on the pedal sets the throttle.
  3. Auto-throttle for casual play (the player only brakes and steers).
  4. Left-handed layout (mirror the controls).
- **Done when:** each mode works in a phone play scenario and on the user's iPhone.
### 2.8 Minimal phone HUD — S
- **Do:** a Display setting with HUD size "Full" or "Minimal" (speed, gear, lap time, position on the map).
- **Done when:** the minimal HUD covers less than 10 % of a phone screen.
### 2.9 Android vibration — S
- **Do:** short vibration pulses on kerbs and impacts where `navigator.vibrate` exists (Android); a setting to turn it off.
- **Done when:** an Android phone pulses on the Chase kerbs; nothing happens on iPhone.
## Phase 3 — Racing realism
**Goal.** The car behaves like a real Gen3 car over a stint. Every physics change keeps the existing tests green (autopilot laps, line-follower test) and re-checks the lap times: the user-tuned car near 2:04 for the test AI.
### 3.1 Fuel weight — S
- **Do:** the fuel load adds mass (about 0.75 kg per litre); the fuel burns per lap; a full car is slower than a light one.
- **Done when:** a test shows a lap time difference between full and light fuel in the expected size (a few tenths of a second).
### 3.2 Tyre temperature and wear change the grip — M
- **Do:**
  1. Move the display tyre model (`src/hud/tyre-heat.ts`, `tyre-fuel-model.ts`) into the physics: grip falls below and above a temperature window; wear lowers grip over a stint.
  2. Two compounds (soft and hard) with different windows and wear rates.
  3. The HUD shows the real values (no longer "display only").
- **Done when:** the out-lap is slower than a warm lap; a long stint loses lap time; tests cover the grip curve.
### 3.3 Telemetry compare — M
- **Do:** after a lap, a screen with speed, throttle and brake traces against the best lap and the ghost; the time gained or lost per corner; open it from the pause menu and the results screen.
- **Done when:** the screen shows real data for two laps and the corner deltas add up to the lap delta.
### 3.4 Setup screen and brake bias — M
- **Do:** a Setup tab (every build) with brake bias, front and rear anti-roll bars and tyre pressures, inside safe ranges; brake bias also on a button during the race; one setup per car.
- **Done when:** each setting changes the car in a test (balance, stopping distance) and the defaults equal today's car.
### 3.5 Tyre load sensitivity — M
- **Depends on:** 3.2.
- **Do:** grip per unit of load falls as the load rises, so weight transfer changes the balance; retune the grip so that the lap time targets still hold.
- **Done when:** a smooth turn-in is faster than an abrupt one in a test; the lap time targets hold.
### 3.6 Brake temperature, fade and flat spots — M
- **Do:** brake temperature from energy in and cooling; brake force falls above a temperature; a lock-up above a slip and speed makes a flat spot (vibration and less grip until the tyre changes).
- **Done when:** repeated late braking at The Chase raises the brake temperature to the fade zone in a test; the HUD shows the brake temperature.
### 3.7 Track grip on and off the racing line — S
- **Do:** more grip on the rubbered line, less on the dirty outside; the line grip rises through a session.
- **Done when:** a test shows lower grip 4 m off the line; the visual line from 1.4 matches the grip.
### 3.8 Kerb types — M
- **Depends on:** 1.4.
- **Do:** flat kerbs that a driver can use; raised "sausage" kerbs that unsettle the car; per-corner kerb data from the aerial photos (for example the 2 m inside kerb at The Chase T21).
- **Done when:** the physics surface and the visual kerb match at five checked corners; the line-follower test still passes.
### 3.9 Real pole reference — S
- **Do:** a "2025 pole" target ghost (2:04.03, first sector 50.847 s) built from the AI line and timed to the real sector splits; it shows as a target in time trial.
- **Done when:** the ghost crosses the sector lines at the real split times.
### 3.10 Head movement and sound detail — S
- **Do:** the cockpit camera leans and moves with g-forces (amount in Settings); tyre scrub, kerb rumble, gear whine and downshift backfires in the audio.
- **Done when:** each sound shows in an audio test; the head movement setting turns it off.
### 3.11 Weather and time of day — L
- **Depends on:** 1.2, 3.2, 3.7.
- **Do:** time of day as a session setting (morning to sunset); rain with a wet track (darker, reflective), spray behind cars, less grip, wet tyres, wipers in the cockpit, and a drying line.
- **Done when:** a wet lap is slower by a realistic amount; the look passes the scorecard for a wet viewpoint.
## Appendix A — Realism Index
- **Viewpoints:** 12 corner viewpoints (as `scripts/capture-evidence.mjs`) and 3 car close-ups. Each viewpoint has one real reference photo from `docs/references/` taken from a similar place and angle.
- **Aspects (0–10 each):** light and atmosphere; road surface and kerbs; terrain and grass; trees and bush; trackside structures and distance; cars (close-ups only); image quality (aliasing, shimmer, artefacts).
- **Score:** for each viewpoint, the mean of its aspects; the Realism Index is the mean over viewpoints, times 10 (0–100).
- **Reviewers:** two fresh reviewer agents with fixed briefs (a sim-racing player and a photographer) plus the user. Use the same briefs for every round so that the scores measure change (see the review-plateau lesson in `~/.claude/lessons.md`). The user's score decides a tie.
- **Target:** target = the lower of 75 (the art-direction ceiling, decision D1) and baseline + 0.5 × (100 − baseline). A score of 100 means "the same as the photo"; 75 means "most people see a game, but the light, materials and detail read as the real place".
## Appendix B — Frame-rate budgets
| Tier | Device | Budget |
|---|---|---|
| High | Apple M-series laptop, 1920 × 1080 | 60 fps or more at all four evidence points |
| Medium | The user's iPhone (and modern laptops) | 50 fps or more (decision D3) |
| Low | Older phones | 30 fps or more |
## Appendix C — Item index
| Item | Phase | Size |
|---|---|---|
| 1.0 Baseline and guard rails | 1 | S |
| 1.1 Art direction update | 1 | S |
| 1.2 Light, sky and atmosphere | 1 | M |
| 1.3 Shadows and ambient occlusion | 1 | M |
| 1.4 Track surface | 1 | M |
| 1.5 Terrain and grass | 1 | M |
| 1.6 Gum trees and bush | 1 | L |
| 1.7 Trackside and distance | 1 | M |
| 1.8 Cars | 1 | M |
| 1.9 Anti-aliasing and camera effects | 1 | S |
| 1.10 Effects | 1 | S |
| 1.11 Quality tiers and performance | 1 | M |
| 1.12 Scorecard round, user review and release | 1 | S |
| 2.1 Keep the screen awake | 2 | S |
| 2.2 Android full screen and landscape lock | 2 | S |
| 2.3 Smaller download and less memory | 2 | S |
| 2.4 Automatic graphics quality | 2 | M |
| 2.5 WebKit test engine | 2 | S |
| 2.6 Offline play | 2 | S |
| 2.7 Touch-control options | 2 | M |
| 2.8 Minimal phone HUD | 2 | S |
| 2.9 Android vibration | 2 | S |
| 3.1 Fuel weight | 3 | S |
| 3.2 Tyre temperature and wear change the grip | 3 | M |
| 3.3 Telemetry compare | 3 | M |
| 3.4 Setup screen and brake bias | 3 | M |
| 3.5 Tyre load sensitivity | 3 | M |
| 3.6 Brake temperature, fade and flat spots | 3 | M |
| 3.7 Track grip on and off the racing line | 3 | S |
| 3.8 Kerb types | 3 | M |
| 3.9 Real pole reference | 3 | S |
| 3.10 Head movement and sound detail | 3 | S |
| 3.11 Weather and time of day | 3 | L |
