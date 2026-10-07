# Mount Panorama — Bathurst

A browser racing game on a real-scale Mount Panorama Circuit, Bathurst NSW, with
generated (code-only) medium-poly Gen3 Supercars: the Chevrolet Camaro ZL1 and the
Ford Mustang GT. Built with three.js, TypeScript and Vite.

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
| Change camera (chase, far chase, bonnet, cockpit, TV) | C | Y |
| Look back (hold; from the in-car views a rear roof camera) | V | B |
| Reset to track | R | View |
| Pause | Esc or P | Menu |
| Ghost on/off | G | LB |
| Racing line (off / braking / full) | L | RB |
| Hide HUD | H | — |
| Graphics tuner | F2 | — |

The gamepad column uses the Xbox names. A PlayStation controller (DualShock 4 or DualSense, USB or Bluetooth) works with the same buttons: RT/LT = R2/L2, A/B/X/Y = ✕/○/□/△, LB/RB = L1/R1, View = Share (PS4) or Create (PS5), Menu = Options. When a PlayStation controller is connected, the menus, hints and controls screen show its symbols and layout. Press a button once after you connect a controller, because the browser shows a gamepad to the page only after a press. Chrome, Edge and Safari read both controllers in the standard mapping. Firefox can read a PlayStation controller in a different mapping.

## What is real

- **Track:** the centreline comes from the OpenStreetMap ways named by corner. It is scaled to the official 6.213 km.
- **Elevation:** a monotone curve runs through the NSW Spatial Services 2 m contour crossings (about 1 m RMS), with SRTM 30 m only inside the 2 m bands, calibrated to the published 174 m range. Vertical curves are limited to what a Gen3 car can take at racing speed (crests at most 0.45 g of unloading, dips at most 0.8 g of compression), because the data cannot resolve sharper shapes. The steepest grade is about −16 %, on the drop from the Dipper towards Forrest's Elbow.
- **Altitude:** the HUD shows height above sea level from the elevation data: about 872 m at the top. The often published 862 m is about 10 m below what the NSW contours, SRTM and Copernicus show (`docs/research/circuit-facts.md`).
- **Walls, sand traps and fences:** these come from the OSM barrier and sand polygons. Tyre walls are placed where the research found them.
- **Trackside features:** buildings (extruded from their real footprints), grandstands, the pit complex, 1,304 camp pitches, marshal posts, big screens, footbridges, car parks, mapped trees and the white-stone "MOUNT PANORAMA" sign come from OSM.
- **Cars:** dimensions, mass, power (447 kW rated, ×0.92 altitude derate), gearing, aero (ClA 0.89) and shift times come from `docs/research/car-specs.md`.
- **Validation:** the ideal lap of the racing-line profile is 2:05.7. The real Gen3 pole is 2:04.0, and the race lap record is 2:06.7. The test AI uses 90 % of the grip and laps both cars cleanly (no wall contact) in about 2:12.

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
- Tyre temperatures and wear, and fuel. **These are display-only estimates.** The physics has no tyre or fuel model, so they come from slip, load and throttle (`src/hud/tyre-fuel-model.ts`).

## Cockpit

The cockpit view has a live rear-view mirror (a small second render at half rate, without your own car) and a working dash display. In this view the timing tower moves below the mirror.

## Records

Best laps, sectors, the delta trace and the ghost are saved per car in the browser (localStorage key `bathurst.records.v2.<car>`). A lap counts only after you drive at least 90 % of it forwards. The standing-start lap (from the grid) is shown, but it never becomes your best lap, delta reference or ghost. Version 2 drops records from older builds, because those builds could save a ghost that replayed too fast.

## Tune the graphics

1. Press **F2** in the game.
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
| `src/car/models/` | Generated Camaro and Mustang models |
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
