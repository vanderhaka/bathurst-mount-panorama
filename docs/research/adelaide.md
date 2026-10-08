# Adelaide preview reference

Researched 2026-10-08. Build the current **2026 Adelaide 500 / Adelaide Grand Final Supercars layout: 3.219 km, 14 turns, clockwise**. This choice follows the requested modern Supercars circuit. The historic Formula 1 route and the proposed 2027 redevelopment are excluded. Delivery is the authorized Vercel preview branch.

## Controlling official sources

- [Supercars 2026 event](https://www.supercars.com/events/2026-adelaide) states 3.219 km in its event description; the statistics table rounds it to 3.22 km.
- [Supercars circuit page](https://www.supercars.com/circuit/adelaide-parklands-circuit) confirms clockwise direction, rounds length to 3.2 km, and provides the current outline.
- [Organiser 2026 brochure, page 7](https://assets.adelaide500.com.au/app/uploads/2026/01/22154155/2026-bp-ADL-GF-Exclusive-Brochure.pdf) supplies the numbered T1-T14 map. It expressly says the diagram is not to scale. Its current labels put **Brock Straight on Bartels Road** and **Brabham Straight on Dequetteville Terrace**.
- [Supercars: Adelaide's starting grid shake-up](https://www.supercars.com/news/adelaides-starting-grid-shake-up) identifies the opening left-right-left sequence, and the two right-angle right turns at T6/T7.
- [Supercars: Turn 8](https://www.supercars.com/news/adelaides-turn-8-the-scariest-corner-in-supercars) identifies Bartels Road / Dequetteville Terrace, its fast right turn, narrow entry and lack of exit run-off. Its 210 km/h description is a real-world profile, not a required game speed.
- [Supercars: surface and Gen3 handling](https://www.supercars.com/news/drivers-braced-for-tricky-adelaide-surface-turn-8-aero-affect) identifies T4-T7 as the staircase and T11 through the Senna section as permanent track in Victoria Park, resurfaced for the 2022 event.
- [Supercars Travel 2026 grandstands](https://travel.supercars.com/2026-adelaide-grand-final/grandstand) identifies T14 as the final hairpin.
- [Supercars: proposed 2027 redesign](https://www.supercars.com/news/supercars-news-2026-adelaide-street-circuit-revealed-motogp-track-design-layout-renders-images) describes a separate proposed circuit. Do not substitute its geometry for this preview.

Official assets are cached for research under `artifacts/review/adelaide/references/`: `official-2026-brochure.pdf`, rendered page `official-2026-track-map.png`, and `official-supercars-2026-track-map.jpg`. These images are reference material; no open reuse license was found.

## Reusable centerline

- [Coordinate JSON](../../artifacts/review/adelaide/references/adelaide-coordinates.json): clockwise local coordinates, approximate turn markers, raw/normalized chainages, provenance, validation and projection metadata.
- [GeoJSON](../../artifacts/review/adelaide/references/adelaide-centerline.geojson): the same ordered closed route in WGS84 `[longitude, latitude]`; geographic coordinates remain unscaled OSM data.
- [OSM source subset](../../artifacts/review/adelaide/references/osm-adelaide-circuit.json): original versioned ways and their coordinates. The discovery request was the public [OSM bbox API](https://api.openstreetmap.org/api/0.6/map?bbox=138.603,-34.936,138.629,-34.922); only the relevant ways are retained.
- [Reproduction script](../../artifacts/review/adelaide/references/derive-geometry.py) rebuilds both geometry files from the saved source subset using Python's standard library. It verifies connected shared nodes, closure, orientation, nonzero segment lengths and absence of proper self-crossings.
- [Source manifest](../../artifacts/review/adelaide/references/source-manifest.json) records URLs, retrieval date, licensing and SHA-256 hashes of saved artifacts.

`pointsXZ` contains raw projected metres, with **X east and Z south**. `pointsXZOfficial` applies a uniform factor of **0.9806407886338602**, changing measured horizontal OSM length **3282.547531 m** to the official **3219 m**. This calibration does not remove local mapping error. Recalibrate final lap length if later smoothing changes it.

Both arrays have **127 points, including the repeated closing point**. Drop the last point when a closed spline implementation wraps its own endpoint. The loop begins at `[0, 0]`, near the pit straight's timing area; origin is latitude **-34.93030892183902**, longitude **138.6204356864947**. That position is an estimate projected onto the mapped pit straight, not an official timing-line survey. `finishLineS = 0` is consequently a preview estimate.

The OSM [circuit relation 3121459](https://www.openstreetmap.org/relation/3121459) includes ordinary road centers and roundabout lanes. The selected detailed racing route instead chains these ways in race order:

1. [965172247](https://www.openstreetmap.org/way/965172247): pit straight toward Senna.
2. [965172244](https://www.openstreetmap.org/way/965172244): Senna and T3, trimmed at shared node `8384494124`.
3. [902723253](https://www.openstreetmap.org/way/902723253): racing centerline on Wakefield Road.
4. [902723252](https://www.openstreetmap.org/way/902723252): rounded T4 race route.
5. [902723251](https://www.openstreetmap.org/way/902723251): T4 exit, staircase, Bartels/T8, Dequetteville/T9 and Wakefield/T10.
6. [80332886](https://www.openstreetmap.org/way/80332886): park entry, beginning at shared node `8384494161`.
7. [965172249](https://www.openstreetmap.org/way/965172249): T11 and park approach.
8. [405395973](https://www.openstreetmap.org/way/405395973): T12-T14 and pit straight back to the first way.

OSM tags the three detailed street racing ways `disused:highway=raceway`; this is source tagging, not evidence that the current event is disused. Their geometry follows the race route on both official 2026 outlines. The permanent Senna sequence retains its distinct left-right-left shape rather than being smoothed into a broad curve.

## Turn signs and approximate bend markers

Use **T1-T14** as the reliable sign labels. Names below are street/section descriptions, not claims of formal corner names. Numbering comes from the official map; directions and approximate bend positions are cross-checked against the OSM route. `S` is metres from the estimated timing origin after uniform length calibration. Indices address both JSON point arrays, before any resampling.

| Turn | Direction | Description | Point index | Approximate S (m) |
|---|---|---|---:|---:|
| T1 | Left | Senna Chicane | 7 | 281.118 |
| T2 | Right | Senna Chicane | 10 | 300.275 |
| T3 | Left | Fast exit onto Wakefield Road | 14 | 427.625 |
| T4 | Right | Wakefield Road to East Terrace | 19 | 717.630 |
| T5 | Left | East Terrace to Flinders Street | 26 | 876.600 |
| T6 | Right | Flinders Street to Hutt Street | 36 | 1028.663 |
| T7 | Right | Hutt Street to Bartels Road | 49 | 1180.633 |
| T8 | Right | Bartels Road to Dequetteville Terrace | 60 | 1848.560 |
| T9 | Right | Dequetteville Terrace to Wakefield Road | 68 | 2244.248 |
| T10 | Left | Wakefield Road into Victoria Park | 74 | 2382.493 |
| T11 | Left | Victoria Park | 82 | 2491.453 |
| T12 | Left | Victoria Park | 91 | 2621.958 |
| T13 | Right | Victoria Park | 100 | 2809.222 |
| T14 | Right | Final hairpin to pit straight | 115 | 2977.718 |

These are bend markers, not surveyed racing-line apexes. T1-T3 form the opening left-right-left sequence; T4-T7 must retain right-left-right-right. T8 leads southeast along Dequetteville Terrace, not north toward the historic F1 loop. T14 returns northwest down pit straight.

Suggested **gameplay sector estimates**, not official timing-loop positions: `0-1280 m` for the Senna/staircase section, `1280-2310 m` for Bartels/T8/Dequetteville/T9, and `2310-3219 m` for the park return, hairpin and pit straight.

![OSM-derived clockwise route with approximate numbered turn markers](../../artifacts/review/adelaide/references/adelaide-topology.png)

## Pace, measurement limits and attribution

[2025 Friday Supercars qualifying](https://www.supercars.com/results/2025/2025-adelaide/Q5) records driver-best laps from **1:18.964 to 1:21.538**. [2024 Practice 1](https://www.supercars.com/results/2024/2024-vailo-adelaide-500/P9) records driver-best laps from **1:19.683 to 1:21.036**. These are best-lap ranges in specific sessions, not the distribution of all race laps. They give a reasonable roughly 79-82 second pace reference for experienced Gen3 driving.

The circuit page lists a **Gen3 race lap record of 1:19.5219, James Golding, 2025**; the event page separately lists **1:18.6763, Chaz Mostert, 2022**. Keep the car era/session distinction rather than presenting these as interchangeable records.

Tracked source: `data/raw/adelaide-osm-circuit.json`; distributed derived geometry: `public/data/adelaide-centerline.json` (ODbL). The runtime resamples this polyline at 4 m after the same 3 m Gaussian smoothing used by the Bathurst builder, then normalizes its loop to 3,219 m. The standing-start line is estimated at 100 m after the estimated timing line, so the game times one full standing lap before flying laps.

The coordinates supply horizontal route geometry only. Elevation, banking, road width, kerb dimensions, braking boards, barrier offsets, grip and exact timing-loop positions are **unmeasured**. Any flat terrain, widths, corner speeds and scenery placement in the preview are implementation estimates. Do not transfer Bathurst's mountain elevation or its named corners into Adelaide.

OSM data and these derived coordinate datasets are **ODbL 1.0**. Retain the source dataset and license with the geometry and display **© OpenStreetMap contributors**, linked to [OSM copyright/licensing](https://www.openstreetmap.org/copyright). Link the distributed data to the [ODbL license](https://opendatacommons.org/licenses/odbl/1-0/). This data licensing does not automatically relicense unrelated game code. The cached organiser/Supercars images have separate copyright and should remain research references.

Final geometry hashes:

- `adelaide-coordinates.json`: `7cc6b0f99bb0cf4742200140ccc3998699797a9c529c893b5af019bff897071d`
- `adelaide-centerline.geojson`: `33799944c0128a8af8915bc4e3e50267d518ccf0de711454ca3a75ef5bcddc56`

Validation: exact repeated closure, 127 points, clockwise projected signed area **286213.579 m²**, zero zero-length edges and zero proper self-intersections. This research does not prove runtime rendering, handling or deployment.
