# Bathurst handoff — 8 October 2026

## Start here

**Play on your phone, no login:** [Bathurst](https://bathurst-mount-panorama-playtest.vercel.app/) or [Adelaide](https://bathurst-mount-panorama-playtest.vercel.app/?track=adelaide). Use **Circuit** on the title screen to switch.

That link is a frozen copy of the reviewed build (game code at `d0e6f89`). A push to the branch does not update it. Redeploy it after any change (see [Delivery](#delivery)).

**Where things stand**

- Branch `codex/bathurst-plan` holds Codex's overnight work plus this review's 51 commits.
- On 8 October you asked for a release. `main` fast-forwarded to this branch, and production at https://bathurst-mount-panorama.vercel.app deploys from `main`. The previous production commit was `3f157e9`.
- All 750 tests pass. Types are clean. Desktop, phone-emulation and WebKit smokes pass on both circuits ([Verification](#verification-of-this-build)).

**Your next steps**

1. Run the iPhone checks below. Emulation cannot prove them.
2. Decide on item 1.12. The graphics scorecard is 51.92/100 against the 72.05 target. Accept it or ask for a focused follow-up ([below](#awaiting-your-decision-112-scorecard)).
3. Report any phone fault. A fix goes to `main` and deploys production.

### Real-device checklist

For each check, record the device, the iOS or browser version, the quality shown in Settings and what you saw.

| # | Check | It passes when |
|---|---|---|
| 1 | **Steering question.** Use a private Safari tab (no saved settings), then tap **Start time trial**. | "Choose how to steer" appears with Finger and Tilt. After you answer, it does not appear again, even after a reload. |
| 2 | **Tilt.** Choose **Tilt**. | iOS shows its motion-access prompt. If you allow it, the race starts in tilt mode, and the pose you hold at the lights is straight ahead. If you refuse, the screen says "Motion access is off — using Finger" and waits for **Start**. |
| 3 | **Change later.** Go to Settings > Steering > Touch steering mode. | Drag, Tilt and Buttons all work. Test real left/right tilt, partial and full analog throttle, auto-throttle and left-handed controls (2.7). iOS may not ask for motion access again after a refusal until the tab is closed. |
| 4 | **Graphics.** Phones now start on **High** with automatic quality. Drive three laps. | Note the fps at Pit Straight, Mountain Straight, Skyline and Conrod (target ≥ 50). If quality steps down, a notice shows, and the result survives a reload. Then choose Medium by hand and check that it survives a reload too (1.0, 1.11, 2.4). |
| 5 | **Wheel lift.** Take Forrest's Elbow, The Chase and Murray's flat out. | The car stays on four wheels. Only a kerb strike or a crest may unload one wheel. |
| 6 | **Fuel.** Run a long stint. | When the tank cannot finish the next lap, crossing the line refills it and shows **REFUELLED**. |
| 7 | **Screen awake (2.1).** Race for three minutes without touching the screen to keep it awake. | The screen does not dim. After a lock and return, the race pauses and the screen stays awake again on Resume. |
| 8 | **Touch handling (2.5).** Steer and accelerate with two thumbs, release both, pinch, then rotate to portrait and back. | The controls release, portrait pauses the race and Resume works. Check normal Safari and the Home Screen app. |
| 9 | **Minimal HUD (2.8).** Choose Display > Minimal. | Speed, gear, lap time and map are readable, clear of the notch, and cover under 10% of the screen. |
| 10 | **Assets (2.3).** | Shadows, liveries and HUD text look right. |
| 11 | **Audio (3.10).** Wear headphones, in Cockpit and Chase. | Tyre scrub, kerb rumble, gear whine and downshifts sound convincing. After a phone call or Siri, Resume brings the engine sound back. |
| 12 | **Adelaide.** Drive Senna, Turn 8 and Turn 14 in each car. Complete a valid lap, reload, then switch to Bathurst. | The best lap and ghost come back after the reload, and the two circuits keep separate records. |
| 13 | **Menu text size.** | The menu text (9–11 CSS px on a phone, the same scale as every menu) is readable. |
| Android | Fullscreen on Start, Resume and Restart (2.2). Vibration On over the Chase kerb, then Off and reload (2.9). | Fullscreen landscape each time. It vibrates when On and stays silent when Off. |

## What the review changed

The review added 51 commits on top of Codex's handoff commit `57c0d60`. Each fix has a test that fails without it. `DEFAULT_HANDLING`, the controls and the `DEV_TOOLS` gates are unchanged.

**Car physics**

- **Two-wheel lift in fast, sharp corners** (your report) (`8be7f5c`).
  - **Cause:** the tuned tyre friction (1.94 front) was above the car's tip-over limit (1.86 g at a 0.44 m centre of gravity). The inside wheels lost all their load, and the body rolled onto two wheels. `main` has the same defect.
  - **Fix:** a 0.38 m centre of gravity, plus roll-centre load transfer (front 0.05 m, rear 0.08 m). Both are estimates, because no Gen3 figure is published.
  - **Result:** before the fix, two Bathurst laps had 40 two-wheel episodes with gaps up to 189 mm. Now no lift is visible (largest gap 4 mm). A kerb strike still unloads a wheel. AI lap times change by 0.4 s or less.
- **Tyre slide heat had no limit** (`5599753`). Tyres reached 221 °C over 12 laps, and lap times climbed to 84 s. Heat now comes from friction work, temperature has a cap of 150 °C, and the overheat wear multiplier has a cap of 3×. Lap times hold between 79.4 and 80.9 s.
- **Fuel refills at the line** when the tank cannot finish the next lap, and shows REFUELLED (`0608a04`).
- **Stint laps counted at Adelaide**, where the timing line is at distance 0 (`705c2a9`).
- **Altitude derate at Bathurst only** (`9bc3df6`).
- **The AI no longer clips Adelaide's hairpin** (`faf45df`).

**Racing-line guidance**

- **The line colours and HUD corner speed promised too much on warm tyres.** A driver who obeyed only the colours hit the wall at Forrest's Elbow and at Adelaide's Final Hairpin.
- **Fix:** each corner now uses its weaker axle and each tyre's own grip (`89034b8`, `a59616a`).
- **Result:** two-lap warm-tyre tests on both circuits pass, and guided laps are about 0.2 s slower. The AI's laps do not change.

**Phone**

- **Steering question, asked once** (new) (`8a7e133`, `d0e6f89`).
- **Phones start on High** with automatic quality, not Medium (`ad620bc`).
- **Automatic quality** ignores start-up hitches and steps down only after two slow windows. A saved choice survives browser updates and zoom, and old automatic results are learned again (`300fbaa`, `969ea25`).
- **Centring the tilt keeps held pedals** (`01aee0c`).
- **Android fullscreen** comes back on Start, Resume and Restart (`45d627f`).
- **Minimal HUD** is sized to the phone and keeps the lights, messages and FPS (`73885e7`).
- **The race pauses** when the graphics context is lost (`e30021f`).

**Audio**

- **iOS interruptions** keep the engine paused (`4c94ede`).
- **The gear-whine dip** starts at the shift (`71c194c`).
- **Fixed one leaked audio context per race** (`e817c27`).

**Records, timing and results**

- **A best lap is never lost** to a pending save or full storage (`0ddc9d2`).
- **The standing-start lap** shows no live delta or ghost (`1ca2753`).
- **Results** label that lap and list this session's laps (`0503f92`, `89f0390`, `2adf03c`).
- **Telemetry** offers each lap once as a reference, and the D-pad reaches every corner row (`41e4099`, `7e87580`).
- **The circuit choice** is remembered (`7cdc997`).

**Adelaide**

- Every corner is labelled (`c0f1eb3`).
- The wall signs use a generated sponsor set (`a98ea31`).
- The grid boxes sit where the cars stand (`3cc60e5`).
- The map shows a sourced altitude (`35035ad`).

**Graphics**

- **Shadows near the car on Low and Medium are back** (`3a5432c`). On Low, shadow pixels near the car shrank from 80.8 cm to 10.9 cm.
- **The black slivers on dead tree branches are gone** (`e43c5cd`).
- **Haze** now covers objects first seen while hidden (`c9d9f00`).
- **Faster frames:** less terrain, grass, haze, flare and HUD work each frame (`e950176`, `d010247`, `421ae14`, `82a1e6c`).
- **The © sign** is in the font subset (`e8fa23b`).

**Camera, tests and CI**

- **Head movement Off** removes the flat-spot shake from the whole cockpit (`96d9a20`).
- **CI** now runs the verify-script tests (`3c152d1`).
- **The props test coverage** is restored (`12d23d8`).
- **Slow tests** have explicit timeouts (`67f9650`).

### Test changes to know about

**One threshold changed:** `tests/track-stint.test.ts` (`40a1a72`).

- **Why:** the old 0.15–0.25 m band measured a landing bounce. The car started in the air on the Conrod downhill.
- **Now:** the stop starts planted in Murray's braking zone at 200 km/h. The lower bound (> 0.15 m) stays.
- **The ceiling:** the absolute 0.25 m ceiling is gone. In its place, the gain from more front bias with native rubber must be within ±25% of the same stop with rubber mocked, and a loose < 0.6 m cap remains.
- **Measured:** 0.424 m against 0.458 m.

**Fixtures changed, assertions unchanged**

- `tests/setup-physics.test.ts` (`93ed154`): the brake-bias stop starts planted on the road, and the > 0.2 m limit stays.
- `tests/wheel-lift.test.ts`: the test starts on race-warm tyres (95 °C).
- `tests/records-durability.test.ts` (`e22ddd8`): the circuit switch now calls `location.replace`, so the test stubs that.
- `tests/hud.test.ts`: "covers every Settings field" skips `steerOnboarded`. It records whether the question was answered and has no Settings row.
- **Touch scripts:** nine verify scripts answer the steering question with Finger.

## Watch-outs

- **The wheel-lift margin is thin on warm tyres:** 1.77 g against the 1.75 g gate, and 27 N lowest wheel load at 250 km/h. Any future grip increase could bring the lift back.
- **The autopilot winds on full lock past the tyre's best slip angle** when it understeers, and this overheats the front tyre. I left it, because a change would change AI lap times.
- **The line colours follow each tyre's temperature** and refresh once a second, so a corner target can move a few per cent mid-lap. Nobody has checked this by eye in the game.
- **Item 2.3 no longer meets its target.** The first download is 21.80% smaller than before 2.3, against the 25% target. Later items grew it again.
- **Desktop High peaks at 321 draw calls** at Pit Straight, over the soft target of 250. The M3 Max still holds 60 fps.
- **Shadows on Low reach 40 m,** so they visibly pop in at that distance. The 300 m shadow gate in PLAN 1.3 is met only on High.
- **Fonts:** only four faces ship (Barlow Condensed 700 and 800, Barlow 400, JetBrains Mono 500).
  - About 22 rules ask for weight 600 and get 700.
  - Barlow 500 renders as 400.
  - `.mn-arrow` at 600 is faux-bold.
- **The debug hooks ship in production.** `__game`, autopilot, teleport and time scale are all on `window`. This is not new.
- **`src/game/profile-cache.ts` is used only by tests.**
- **Steering question:** a Tilt choice made with a game controller on iOS falls back to Finger, because a controller press does not count as a tap for the motion prompt.

## Blocked

These are the same six items as in Codex's report.

| Item | Blocker and next step | Evidence |
|---|---|---|
| 1.8 Cars | **Blocker:** three glazing, paint/metal and arch/wheel fixes missed the 7.205/10 car target. The best player mean was 5.67. Codex discarded the source changes. **Next:** rework body sculpture, fascia and wheel materials, using the same scoring gate. | [item-1.8/](artifacts/review/item-1.8) |
| 1.10 Effects | **Blocker:** three full-speed Conrod runs found no real floor contact. Ride height stayed between 9.97 and 10.72 mm, above the 4 mm spark trigger. **Next:** prove real floor contact before adding sparks. The candidate source is archived at [item-1.10/candidate-source/](artifacts/review/item-1.10/candidate-source). | [blocker.md](artifacts/review/item-1.10/blocker.md) |
| 2.6 Offline play | **Blocker:** the local offline and update checks passed, but the protected Preview blocked the service worker's authentication, so no live cache was ever established. Codex reverted the candidate (`a85152a`). **Next:** verify with your normal Vercel login, then restore it. | [blocker.md](artifacts/review/item-2.6/blocker.md) |
| 3.5 Tyre load sensitivity | **Blocker:** three attempts failed the warm-lap gate (124.54 s against 124.5 s) and the line-contact gate. **Next:** reconcile load capacity with the guidance. | [blocker.md](artifacts/review/item-3.5/blocker.md) |
| 3.9 Pole ghost | **Blocker:** no official sector times exist for the 124.0413 s Q9 lap. **Next:** get the official Q9 timing export or a readable graphic for that exact lap. | [pole-reference.md](docs/research/pole-reference.md) |
| 3.11 Weather | **Blocker:** the wet scorecard reached 4.61/10 against the 7.20 gate, and Codex discarded the candidate. **Next:** improve terrain, foliage, pit structures and the wet-road look against a closer rain reference. | [blocker.md](artifacts/review/item-3.11/blocker.md) |

## Awaiting your decision: 1.12 scorecard

| | Score |
|---|---|
| Baseline | 44.09/100 |
| Now | 51.92/100 (player 55.53, photographer 48.31) |
| Target | 72.05 |

Review the 15 matched pairs and the preview. Send any graphics-tuner values you want adopted. No tuner defaults were changed for you. The table is in the [Overnight record](#overnight-record-codex).

## Decisions

| Decision | Choice |
|---|---|
| D1 | About 75% of the way to photoreal, with generated assets only (decided 7 October). |
| D2 | Race-day afternoon, about 15:00 AEDT on 11 October, with AgX tone mapping. |
| D3 | At least 50 fps on your iPhone. The physical check is still open (checklist row 4). |
| D4 | Playwright WebKit for Safari-engine checks. Real iPhone checks are still open. |
| Review, 8 October | Fuel refills at the line, and the altitude derate applies at Bathurst only. The kerb's outer step stays. Phones start on High. Touch players are asked once how to steer. |

## Delivery

- **Production.** `main` holds this work. A push to `main` deploys https://bathurst-mount-panorama.vercel.app. To roll back, redeploy `3f157e94f4053893c766601a658d02df4dd824dc`.
- **Public playtest.** The Vercel project `bathurst-mount-panorama-playtest` serves a static copy of a frozen preview build. It is a separate project, so it never publishes to the live Bathurst project or `main`. It does not update when the branch gets a push.
- **To redeploy the playtest:**
  1. Build with `VERCEL_ENV=preview npx vite build --outDir <dir>`.
  2. Copy the output into a folder with `{"version":2}` as `vercel.json` and the playtest project's `.vercel/project.json`. That file is in `artifacts/review/public-playtest/site-L2SIap/.vercel/`.
  3. Run `vercel deploy --prod` there.
  4. Check that both URLs return 200 with no redirects and serve the new `index.html`.
- **Codex's first playtest** (commit `57c0d60`) is recorded in [public-playtest/](artifacts/review/public-playtest/).

## Verification of this build

The build checked here is commit `d0e6f89`.

- **Unit tests:** 750 tests in 111 files pass, and `tsc --noEmit` is clean.
- **File size:** no changed source file has more than 300 lines.
- **Smokes:** `play.mjs` smokes pass on the frozen build with `errors: []`:
  - desktop Bathurst
  - desktop Adelaide
  - Chrome phone emulation
  - WebKit phone on Bathurst
  - WebKit phone on Adelaide
- **Steering question:** the full verifier (`scripts/verify-steer-onboarding.mjs`) passes on WebKit and Chromium at 844×390 and 568×320. It covers:
  - Finger
  - Tilt granted
  - Tilt refused
  - the keyboard
  - Back
  - rotating mid-question
  - reloading
  - desktop
  - players who already changed the mode

  The `steer-onboarding-mobile` and `steer-onboarding-desktop` scenarios also pass.
- **Not covered by emulation:** the native iOS motion prompt, a physical sensor, real safe areas, sustained GPU heat and Android vibration. These need the checklist above.

---

## Overnight record (Codex)

This section keeps Codex's per-item evidence, unchanged apart from its layout. Codex delivered 27 items to preview overnight: 26 for Bathurst plus Adelaide.

| Item / preview | Exact deployed SHA | Deployment ID | Evidence and CI |
| --- | --- | --- | --- |
| [1.0](https://bathurst-mount-panorama-ccpl88g4d-vanderhakas-projects.vercel.app) | `896f619e794d5268659ba8cb964b878d5a955b8b` | `dpl_BCpBrJgDBL6yofeNwXesm7SXudyz` | [realism-baseline/](artifacts/review/realism-baseline) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37633503969) |
| [1.1](https://bathurst-mount-panorama-mecwqn2jq-vanderhakas-projects.vercel.app) | `c4cfd33c090bd5da41ab3fa1361ec78ef9bae9fd` | `dpl_6xJTzefgGx34zi2HS4617KDqoMcQ` | [item-1.1/](artifacts/review/item-1.1) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37633915495) |
| [1.2](https://bathurst-mount-panorama-uoxackfhg-vanderhakas-projects.vercel.app) | `d8ae91fb4ef4e6173023352c14ea701525a622b3` | `dpl_GmaGfKMhJipZ6rX1WV3V8vqgnfgP` | [item-1.2/](artifacts/review/item-1.2) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37637574881) |
| [1.3](https://bathurst-mount-panorama-8wl0i3ze1-vanderhakas-projects.vercel.app) | `6b64646c40908224bbe7fc797960e34619f8927c` | `dpl_GRypw5rFxQ4vNTaJK9pLyq321uz8` | [item-1.3/](artifacts/review/item-1.3) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37655728990) |
| [1.4](https://bathurst-mount-panorama-h8w9bf67k-vanderhakas-projects.vercel.app) | `bf74e230b47a894628cd54e7b36c079fa5ec136f` | `dpl_ErkXUyHmUiQ4v7UKPL8cVdW1cpuS` | [item-1.4/](artifacts/review/item-1.4) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37657762834) |
| [1.5](https://bathurst-mount-panorama-hq2by9q3n-vanderhakas-projects.vercel.app) | `d29d20ac5ae27e26b481d55b9db827f5cb584926` | `dpl_AHRSbWcLoW92mpwvrRtgx91JfemL` | [item-1.5/](artifacts/review/item-1.5) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37659547865) |
| [1.6](https://bathurst-mount-panorama-dzyfcq7ih-vanderhakas-projects.vercel.app) | `1d70a513315dd7b68e0cf1b267ef8ec7c4084acd` | `dpl_3YdAuNAt9DZoKzYDaqHw7Xcbi9ma` | [item-1.6/](artifacts/review/item-1.6) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37667593567) |
| [1.7](https://bathurst-mount-panorama-154e78102-vanderhakas-projects.vercel.app) | `7cc2a3bc4c46c960ad72bb10f2e89ce643e183a1` | `dpl_FvTD7RTfdEhWHUsojkkDkc5JbphK` | [item-1.7/](artifacts/review/item-1.7) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37669110736) |
| [1.9](https://bathurst-mount-panorama-6oab0bnru-vanderhakas-projects.vercel.app) | `1cdabfc66e6c2bd4f0f7a20c52a1cf5ae89d296f` | `dpl_7hyh3URNuhkUD1EkkWcmHqmUaTg9` | [item-1.9/](artifacts/review/item-1.9) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37674925737) |
| [1.11](https://bathurst-mount-panorama-hspfuglq0-vanderhakas-projects.vercel.app) | `5e61474d55e9cce0f7e3c28f89aeec948eca7c9d` | `dpl_EJ3kTPFrXL3y2zJPGE1tDVcKnBse` | [item-1.11/](artifacts/review/item-1.11) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37677454336) |
| [1.12](https://bathurst-mount-panorama-ot2abtvls-vanderhakas-projects.vercel.app) | `a1ad8f215e1c01bd6a6cb2989c25b7dfe81a9fc2` | `dpl_8WWYvrt9dDs4N7CxqtN8zjSfXKTB` | [item-1.12/](artifacts/review/item-1.12) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37678053413) |
| [2.1](https://bathurst-mount-panorama-eacb7xsnc-vanderhakas-projects.vercel.app) | `332524bfb04fdddd54e7faaac0b236dbfd94dc2e` | `dpl_2S7qgyuLB1Kw9WmCuwCgsfcpQNRT` | [item-2.1/](artifacts/review/item-2.1) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37678910462) |
| [2.2](https://bathurst-mount-panorama-5dg9kcnen-vanderhakas-projects.vercel.app) | `214dbf865d775039b4d338842e6933666bf71096` | `dpl_JBaTvybAxcJWrYkRpUG71mPdt4jf` | [item-2.2/](artifacts/review/item-2.2) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37680220484) |
| [2.3](https://bathurst-mount-panorama-b6js7d061-vanderhakas-projects.vercel.app) | `10b63d3f26906000803c4afa74d219f33a087415` | `dpl_HU6wgaaDZDBbydExCsiNLcbk7Avj` | [item-2.3/](artifacts/review/item-2.3) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37682898706) |
| [2.4](https://bathurst-mount-panorama-9u1441m3k-vanderhakas-projects.vercel.app) | `486017aed92e06b84b030937023fdda6b2bee159` | `dpl_JANdePuBCcPJxMUpKvPnaeENDMdr` | [item-2.4/](artifacts/review/item-2.4) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37684565976) |
| [2.5](https://bathurst-mount-panorama-avmpu42wb-vanderhakas-projects.vercel.app) | `d04b66132dd93346c09b08456c44ec04e9b3a4e6` | `dpl_AGXQ9q8R3Lj8MyuDyDuSLVzQXPVr` | [item-2.5/](artifacts/review/item-2.5) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37686351757) |
| [2.7](https://bathurst-mount-panorama-6sq0z48ys-vanderhakas-projects.vercel.app) | `f6747bf3564a64882c8e8acd3927f526b96d1f20` | `dpl_C9u2hgvGjkSoEog5hZRQRMKjmrnb` | [item-2.7/](artifacts/review/item-2.7) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37690380898) |
| [2.8](https://bathurst-mount-panorama-cwf6l25n6-vanderhakas-projects.vercel.app) | `174212056fa35810378d7692ec10eb08945ac66e` | `dpl_DXQJYoxPWZKUHkBQPrLML5UjHPwq` | [item-2.8/](artifacts/review/item-2.8) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37691580927) |
| [2.9](https://bathurst-mount-panorama-9w7wilqj0-vanderhakas-projects.vercel.app) | `3daa49a787995ab490ccac73180249186bf63852` | `dpl_GpaZ7n5igP7hRDhLpyvF2ye56zhG` | [item-2.9/](artifacts/review/item-2.9) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37696358787) |
| [3.1](https://bathurst-mount-panorama-in69e87t6-vanderhakas-projects.vercel.app) | `e2d24102565f41fe47508bfabbb067d30c52e050` | `dpl_BtGJdDKGCu8zNfzGKDrh2so12wrS` | [item-3.1/](artifacts/review/item-3.1) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37698386880) |
| [3.2](https://bathurst-mount-panorama-gob19y8h7-vanderhakas-projects.vercel.app) | `09ef32914d0f95876e7c44564f2d3f9c92a6284c` | `dpl_DfFWNDED71bAnYDaJH86tUJpyFUd` | [item-3.2/](artifacts/review/item-3.2) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37700015007) |
| [3.3](https://bathurst-mount-panorama-9l94b9kz8-vanderhakas-projects.vercel.app) | `a1b463a9d1e67cf25b88e459bc5f5a944d6182bb` | `dpl_DjBNe4hcXHzmaAoxTLZ6tUrsY7xN` | [item-3.3/](artifacts/review/item-3.3) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37701313471) |
| [3.4](https://bathurst-mount-panorama-41vh5x3l3-vanderhakas-projects.vercel.app) | `5893e74860c17b96638cbb3f51557bc06dbfcda9` | `dpl_C2pxUTR3iktEtDXwW8SXHim6guXT` | [item-3.4/](artifacts/review/item-3.4) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37702442421) |
| [3.6](https://bathurst-mount-panorama-jy7yd50te-vanderhakas-projects.vercel.app) | `a3fafe064cc410f9114d24503d5ff624a3a48c8d` | `dpl_9P9HZgCupmX4KfAEPSErGB9xeAAR` | [item-3.6/](artifacts/review/item-3.6) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37704692480) |
| [3.7](https://bathurst-mount-panorama-ogs6c45sh-vanderhakas-projects.vercel.app) | `98ea49201928ff8455a6acda13864736eb3779fa` | `dpl_B7eAxL6gxtVLdvD77ZtpNwXAeoGN` | [item-3.7/](artifacts/review/item-3.7) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37705337033) |
| [3.8](https://bathurst-mount-panorama-nwf1wufls-vanderhakas-projects.vercel.app) | `3a48538c0900b1da4eaf9886a3007a41db97699c` | `dpl_GycE2k9eDwqzV6SasUcqNQf8YuyL` | [item-3.8/](artifacts/review/item-3.8) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37706264846) |
| [3.10](https://bathurst-mount-panorama-hyqr79aeu-vanderhakas-projects.vercel.app) | `07acd21562bbf8c5e0477f9e88a8ead9954e4284` | `dpl_FGnvg2gBqJ5Es9xj8UY5iyHNBzbJ` | [item-3.10/](artifacts/review/item-3.10) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37707914746) |
| [Adelaide](https://bathurst-mount-panorama-e1ez5n8vw-vanderhakas-projects.vercel.app/?track=adelaide) | `b9b25e359c07a4cf7f793bc7b0b3bb902ec5c164` | `dpl_DoKnxgZucAo2V3S7P9SspTwP1k6L` | [adelaide/](artifacts/review/adelaide) · [CI](https://github.com/vanderhaka/bathurst-mount-panorama/actions/runs/37715095991) |

**Notes on these rows**

- **3.3:** the deployed SHA includes a CI-only repair (two workers).
- **3.8 and 3.10:** their native kerb, sensory and brake evidence is in each item's folder.
- **Adelaide:**
  - 3,219 m, clockwise, 14 turns.
  - The timing origin, grid, sectors, widths and scenery positions are estimates.
  - Sources are in [docs/research/adelaide.md](docs/research/adelaide.md).

### Graphics scorecard (1.12)

All 15 views have equal weight. Different photo angles limit the comparison, and still images cannot show shimmer.

| Viewpoint | Baseline player | Baseline photographer | Latest player (1.12) | Latest photographer (1.12) |
| --- | ---: | ---: | ---: | ---: |
| 10-hell-corner | 4.25 | 4.58 | 5.53 | 4.75 |
| 11-mountain-straight | 4.25 | 4.67 | 5.53 | 4.75 |
| 12-griffins-bend | 4.00 | 4.50 | 5.50 | 4.50 |
| 13-the-cutting | 4.25 | 4.62 | 5.47 | 4.62 |
| 14-reid-park | 3.92 | 4.40 | 5.30 | 4.50 |
| 15-mcphillamy-park | 4.33 | 4.58 | 5.48 | 4.58 |
| 16-skyline | 3.92 | 4.50 | 5.38 | 4.58 |
| 17-the-dipper | 3.92 | 4.58 | 5.58 | 4.58 |
| 18-forrests-elbow | 3.83 | 4.58 | 5.33 | 4.67 |
| 19-conrod-straight | 4.25 | 4.42 | 5.17 | 4.33 |
| 20-the-chase | 4.17 | 4.42 | 5.46 | 4.67 |
| 21-murrays-corner | 4.25 | 4.58 | 5.64 | 4.58 |
| car-camaro | 4.67 | 4.83 | 5.93 | 5.67 |
| car-mustang | 4.67 | 4.83 | 6.03 | 5.67 |
| car-supra | 4.50 | 5.00 | 5.93 | 6.00 |

**Sources:**

- Raw scores: [baseline](artifacts/review/realism-baseline) and [1.12](artifacts/review/item-1.12).
- Reference pairs: [matched-manifest.json](artifacts/review/realism-baseline/references/matched-manifest.json).

### Performance (Codex's final frozen build, before this review)

- **Points sampled:** Pit Straight, Mountain Straight, Skyline and Conrod.
- **Machines:** an Apple M3 Max at 1920×1080, and Chrome phone emulation at 844×390.
- **Sampling:** 211 frames and 35 GPU queries at each point.

These short local samples do not establish real iPhone performance.

| Tier | fps baseline → final | GPU ms baseline → final | Calls baseline → final | Triangles baseline → final |
| --- | ---: | ---: | ---: | ---: |
| Desktop High | 60–60 → 60–60 | 5.49–5.79 → 7.27–8.84 | 113–177 → 212–321 | 921,620–1,023,018 → 1,348,815–1,741,085 |
| Desktop Medium | 60–60 → 60–60 | 5.30–5.99 → 4.79–5.85 | 113–176 → 159–251 | 882,741–996,504 → 1,173,858–1,481,515 |
| Desktop Low | 60–60 → 60–60 | 2.28–2.85 → 3.94–4.79 | 112–175 → 116–167 | 806,335–965,430 → 971,964–1,233,922 |
| Phone emulation Medium | 60–60 → 60–60 | 2.49–3.84 → 3.45–4.50 | 114–176 → 161–254 | 903,617–1,011,374 → 1,172,778–1,538,061 |
| Phone emulation Low | 60–60 → 60–60 | 2.01–2.77 → 2.12–3.04 | 113–175 → 117–170 | 821,963–975,904 → 982,884–1,311,110 |

Adelaide is a new track, so it has no "before" figures. It holds 60 fps on every tier. High peaks at 228 calls and 10.07 ms of GPU time. Evidence: [desktop](artifacts/review/adelaide/after-desktop.json) and [phone emulation](artifacts/review/adelaide/after-phone.json).

### Download and memory (Bathurst, Medium phone emulation)

| Snapshot | First-load encoded bytes | Transferred bytes | Estimated live GPU bytes |
|---|---:|---:|---:|
| Pre-Phase-1 baseline | 594,963 | 602,163 | 114,520,660 |
| Immediately before 2.3 | 638,116 | 645,916 | 95,369,913 |
| After 2.3 | 476,650 | 483,250 | 57,148,041 |
| Final Bathurst (31 resources) | 499,020 | 508,320 | 57,148,041 |

Against these snapshots:

- **Pre-Phase-1:** the final first download is 16.13% smaller.
- **Before 2.3:** it is 21.80% smaller, short of 2.3's 25% target.
- **GPU memory:** 50.10% below pre-Phase-1.
- **Adelaide:** 506,014 encoded bytes and 55,818,893 GPU bytes.

Evidence: [final Bathurst](artifacts/review/overnight/final-resources.json) and [final Adelaide](artifacts/review/adelaide/resource-phone.json).
