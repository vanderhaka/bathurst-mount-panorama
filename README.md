# Mount Panorama — Bathurst

A browser racing game on a real-scale Mount Panorama Circuit, Bathurst NSW, with
generated (code-only) medium-poly Gen3 Supercars: the Chevrolet Camaro ZL1, the
Ford Mustang GT and the Toyota GR Supra (new in 2026). Built with three.js, TypeScript and Vite.

## Plan

The work order and item status are in [`docs/PLAN.md`](docs/PLAN.md): graphics realism (toward about 75 % of the way to photoreal), phone strength, then racing realism.

This run ships to the `codex/bathurst-plan` **preview branch**. Main and production
stay at their existing revision. Phase 1 adds measured afternoon light, AgX tone
mapping, cascaded shadows, generated asphalt and terrain detail, eucalyptus crowns,
trackside detail and High-only AO, bloom, SMAA and camera effects. The fixed photo
round is in [`docs/REALISM.md`](docs/REALISM.md); user review is pending. The rejected
car-material and floor-spark candidates are recorded in the plan rather than shipped.

High/Medium/Low pass the four frozen Mac evidence points. Real iPhone Medium
(three laps, at least 50 fps) and Low remain pending. See [`docs/VERIFICATION.md`](docs/VERIFICATION.md)
for the per-tier feature audit and the limits of phone emulation.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5180/
```

Production build: `npm run build`, then `npm run preview` (http://127.0.0.1:5181/).

## Controls

| Action | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Steer | ← → or A D | Left stick |
| Throttle / brake | ↑ ↓ or W S | RT / LT |
| Reverse (automatic gears) | Stop, release the brake, then press and hold it to drive backwards | Same with LT |
| Shift up / down | E or Shift / Q or Ctrl | A / X |
| Change camera (chase, far chase, bonnet, cockpit, TV) | C | RB (R1), like Gran Turismo 7 and F1 |
| Look back (hold; from the in-car views a rear roof camera) | V | B |
| Reset to track (also repairs the car; also in the pause menu) | R | View |
| Pause (press again to resume) | Esc or P | Menu (Options on PlayStation) |
| Ghost on/off | G | LB |
| Racing line (off / braking / full) | L | Y (△) |
| Hide HUD | H | — |
| Graphics tuner (a Mac sends F2 to the screen brightness, so use T) | T or F2 | — |

**Damage** (Settings, under Driving assists) has three modes:
- **Full:** crashes hurt the engine, aero and steering, and the body dents.
- **Visual only:** the body dents, but the car drives as new.
- **Off:** crashes do not damage the car.

The gamepad column uses the Xbox names. A PlayStation controller (DualShock 4 or DualSense, USB or Bluetooth) works with the same buttons: RT/LT = R2/L2, A/B/X/Y = ✕/○/□/△, LB/RB = L1/R1, View = Share (PS4) or Create (PS5), Menu = Options. When a PlayStation controller is connected, the menus, hints and controls screen show its symbols and layout. Press a button once after you connect a controller, because the browser shows a gamepad to the page only after a press. Chrome, Edge and Safari read both controllers in the standard mapping. Firefox can read a PlayStation controller in a different mapping.

## What is real

- **Track:** the centreline comes from the OpenStreetMap ways named by corner. It is scaled to the official 6.213 km.
- **Elevation:** a monotone curve runs through the NSW Spatial Services 2 m contour crossings (about 1 m RMS), with SRTM 30 m only inside the 2 m bands, calibrated to the published 174 m range. Vertical curves are limited to what a Gen3 car can take at racing speed (crests at most 0.45 g of unloading, dips at most 0.8 g of compression), because the data cannot resolve sharper shapes. The steepest grade is about −16 %, on the drop from the Dipper towards Forrest's Elbow.
- **Altitude:** the HUD shows height above sea level from the elevation data: about 872 m at the top. The often published 862 m is about 10 m below what the NSW contours, SRTM and Copernicus show (`docs/research/circuit-facts.md`).
- **Walls, sand traps and fences:** these come from the OSM barrier and sand polygons. Tyre walls are placed where the research found them.
- **Trackside features:** buildings (extruded from their real footprints), grandstands, the pit complex, 1,304 camp pitches, marshal posts, big screens, footbridges, car parks, mapped trees and the white-stone "MOUNT PANORAMA" sign come from OSM.
- **Cars:** dimensions, mass, power (447 kW rated, ×0.92 altitude derate), gearing, aero (ClA 0.89) and shift times come from `docs/research/car-specs.md`. The Supra uses Toyota's 5.2 L quad-cam V8 (Lexus 2UR-GSE based) with its own firing order and engine sound. Parity rules give the three cars the same power, so they lap in about the same time. All liveries are fictional.
- **Validation:** with the measured car (`MEASURED_HANDLING`), the ideal lap of the racing-line profile is 2:05.7. The real Gen3 pole is 2:04.0, and the race lap record is 2:06.7.
- **Game feel:** the game uses the handling that the user tuned (`DEFAULT_HANDLING` in `src/config/handling.ts`): 20 % more tyre grip, 10 % more rear grip and downforce, and a softer, more forgiving limit. With it, the ideal lap is 1:57.5, and the test AI (90 % of the grip) laps both cars cleanly in about 2:04.

## Racing line

Press **L** to cycle the line: off, braking zones only, full line.
- **Red:** brake now.
- **Yellow:** lift, or brush the brakes.
- **Green:** accelerate.

The colours and the HUD "next corner" speed use a profile that a real driver can hold (92 % of the grip, braking in a straight line). A test driver that only obeys the colours laps both cars without contact (`tests/line-follower.test.ts`).

## HUD

- Broadcast-style timing tower (lap, your live entry against your best lap, sectors).
- A delta bar at the top centre (green when faster, red when slower) and a start-light strip during the countdown. The grid gantry lights up at the same time.
- Speed, gear, rpm and shift lights, the next-corner speed, the track map with corner name and altitude, damage, and pedal and steering inputs.
- Fuel comes from the simulation: a 132 L tank, 0.75 kg per litre and throttle-dependent burn. Sessions start at the calibrated 80 L reference load; recovery preserves fuel and Restart refills it. Laps left appears after a complete lap. Tyre temperatures and wear remain display-only estimates from slip and load (`src/hud/tyre-fuel-model.ts`).

## Cockpit

The cockpit view has a live rear-view mirror (a small second render at half rate, without your own car) and a working dash display. In this view the timing tower moves below the mirror.

## Records

Best laps, sectors, the delta trace and the ghost are saved per car in the browser (localStorage key `bathurst.records.v2.<car>`). A lap counts only after you drive at least 90 % of it forwards. The standing-start lap (from the grid) is shown, but it never becomes your best lap, delta reference or ghost. Version 2 drops records from older builds, because those builds could save a ghost that replayed too fast.

## Play on a phone

The game runs in the phone's web browser (Safari on iPhone, Chrome on Android). It plays in landscape only: in portrait, a note asks you to turn the phone, and a running race pauses.

1. Open the game's web address on the phone.
2. Turn the phone sideways.
3. For full screen, tap **Share > Add to Home Screen**, then start the game from the new icon.

Touch controls show while you race, after your first touch:

| Control | Use |
|---|---|
| Steer | Put your left thumb down anywhere on the left half of the screen, then drag it sideways. |
| Throttle and brake | Use the two pedals at the bottom right. Slide your thumb from one pedal to the other. |
| II | Pause. |
| View | Change the camera. |

- A Bluetooth controller (PS5, PS4 or Xbox) also works on a phone. The touch controls hide while you use it.
- Phones start on **Medium** graphics. If the game stutters, set **Low** in **Settings > Graphics and audio**.
- The phone version is tested in Chrome's iPhone emulation only. Real iPhone speed and memory are not tested yet.

## Tune the handling

The Handling tab and the graphics tuner are dev tools. They show in local builds and on Vercel preview deployments, but not on the production deployment.

1. Open **Settings** from the title screen or the pause menu.
2. Press **LB / RB** (L1 / R1) or **Q / E** to go to the **Handling** tab.
3. Select a value with up and down. Change it with left and right.

The car feels a change at once, and the game saves it. The taller tick under each meter shows the default. **Reset handling** puts all values back to the defaults. The help text for each value gives the measured car's value.

| Value | Effect |
|---|---|
| Tyre grip | Grip of all four tyres (1.00 = the measured car). |
| Grip in a slide | Grip that stays when the car slides (0.59 = the measured car). Higher = slides are easier to catch. |
| Rear grip | Above 1.00 = a more stable rear. Below 1.00 = a looser rear. |
| Peak slip angle | Higher = the grip limit comes on more gently. |
| Downforce | Grip at high speed. |
| Steering speed | How fast the front wheels turn to the steering input. |

The racing-line colours and corner-speed hints follow handling and fuel load once per simulation second. Tyre temperature on the HUD is for display only: it does not change the grip.

## Menus

Every build has **Settings > Graphics and audio > Frame rate limit** (30, 60, 120 or Max).
Every build also has **Settings > Steering**: a sensitivity for each device (controller, keyboard and touch), from 50 % to 200 %. A higher controller value gives more steering near the centre of the stick, and full stick is always full lock. A higher keyboard value turns the wheel faster. A higher touch value needs a shorter thumb drag for full lock.

- Up and down move between items. Left and right change a value, or move to the button beside.
- **LB / RB** (L1 / R1) or **Q / E** change the Settings tab.

## Tune the graphics

1. Press **T** in the game (or **F2**, or select **Graphics tuner** in Settings > Graphics and audio). Use the mouse.
2. Move the sliders. Lighting, sky, fog, colour grade and camera change at once.
3. For world content (tree density, terrain colour noise, rubber groove), click **Rebuild world**.
4. Click **Save as my default** to keep your settings.
5. Click **Copy settings (JSON)** to share only the values that you changed.

All visual values live in a small set of config files:
- `src/config/graphics.ts`: lighting, colour grade, world density.
- `src/art/palette.ts`: colours.
- `src/car/models/look.ts`: cars.
- `src/props/look.ts`: trees and props.
- `src/hud/theme.css`: HUD.

## Project layout

| Path | Contents |
|---|---|
| `scripts/` | Track data builders (OSM, SRTM, contours), screenshot, play and evidence tools |
| `src/track/` | Track model, layout, racing line, speed profile, kerbs |
| `src/physics/` | Tyres, suspension, powertrain, collisions, damage |
| `src/world/` | Terrain, road, barriers, sky and lighting, scenery placement |
| `src/car/models/` | Generated Camaro, Mustang and Supra models |
| `src/props/` | Generated trees, people, tents, buildings and structures |
| `src/hud/`, `src/ui/` | Broadcast-style HUD and menus |
| `src/audio/` | Procedural V8 engine, tyre and impact sound |
| `src/game/` | Game loop, race session, cameras, input bridge |
| `docs/references/` | 642 checked reference links |
| `docs/research/` | Circuit facts and car specs, with sources |

## Verify

```bash
npm test                                     # 130+ unit tests (physics lap test, timing, ghost, input, HUD, props, cars, audio)
node scripts/capture-evidence.mjs artifacts/review/latest   # frozen evidence set + metrics.json
```

The independent review rubric is in `docs/VERIFICATION.md`.

## Data credits

- © OpenStreetMap contributors (ODbL).
- SRTM via opentopodata.org.
- NSW Spatial Services topographic contours.

The cars and liveries are generic and do not use real team or sponsor branding.
