# Gold Coast preview reference

Researched 2026-10-08. Build the **Surfers Paradise Street Circuit layout used by the 2025 Boost Mobile Gold Coast 500: 2.960 km, 15 turns, anticlockwise**. It is the most recent event actually run. The 2026 round (23-25 October) has not happened yet, and neither [its event page](https://www.supercars.com/events/2026-gold-coast) nor any other source found announces a layout change. The original 4.470 km, 20-turn IndyCar layout (1991-2009) is excluded.

## Controlling official sources

- [Supercars 2026 event page](https://www.supercars.com/events/2026-gold-coast) lists 2.96 km, 85 laps / 250 km and 23-25 October 2026. It still shows an older lap record, **1:10.0480 (D. Reynolds, 2013)**.
- [Supercars circuit page](https://www.supercars.com/circuit/surfers-paradise-street-circuit) gives **anti-clockwise**, length rounded to 3.0 km, average speed 156 km/h, top speed 265 km/h, **Gen3 race lap record 1:08.8255 (Chaz Mostert, 2025)** and "a major track change in 2010".
- [Organiser 2025 numbered map](https://d35kvm5iuwjt9t.cloudfront.net/pdf/GOLDIE25_Trackmap.pdf) (A3 PDF) labels **T1-3, T4 Pizza Hut Hairpin, T8 (beach chicane), T11 Hino Corner, T12 Repco Corner, T13 Coates Corner, T14 Boost Mobile Hairpin**, the "Boost Mobile Pit Straight" on the Gold Coast Highway, and every temporary stand. It says it is indicative and not to scale. The [2023-dated map](https://d35kvm5iuwjt9t.cloudfront.net/pdf/GOLDIE22_Trackmap.pdf) shows the same route.
- [Wikipedia: Surfers Paradise Street Circuit](https://en.wikipedia.org/wiki/Surfers_Paradise_Street_Circuit) gives 2.960 km and **15 turns** for the 2010-present layout, 4.470 km / 20 turns for 1991-2009, and the 2010 change: the Turn 2 chicane became a left-hand hairpin that rejoins the old track at the Esses. [racingcircuits.info](https://racingcircuits.info/australasia/australia/surfers-paradise.html) adds that the run into the hairpin was narrowed in 2013 because of the light rail, with no change in lap length.
- Corner-number evidence from Supercars news: [Turn 1-2-3 front chicane and Turn 6-7-8-9-10 beach chicane](https://www.supercars.com/news/lowndes-the-key-to-mastering-surfers-paradise), [kerb sensors at T2, T7/T9 (right) and T8/T10 (left)](https://www.supercars.com/news/gold-coast-chicanes-kerbs-a-big-challenge), [2025 resurfacing at Turn 4 to Turn 6 and Turn 11](https://www.supercars.com/news/supercars-news-2025-gold-coast-practice-1-lap-record-speed-broc-feeney-reaction-resurface), [a Turn 15 tyre bundle (2017)](https://www.supercars.com/news/whincup-breaks-record-to-top-final-practice), [a "five-part back chicane"](https://www.supercars.com/news/hino-track-guide-vodafone-gold-coast-600) and [four apexes at 140 km/h](https://www.supercars.com/news/engineer-preview-castrol-gold-coast-600).
- [Supercars track build 2024](https://www.supercars.com/news/supercars-news-2024-track-build-underway-boost-mobile-gold-coast-500): "six kilometres of concrete barriers and fencing", fencing started along the Gold Coast Highway and Surfers Paradise Boulevard, and the pit lane "will appear along the Gold Coast Highway".

Official maps are cached for research under `artifacts/review/gold-coast/references/` (`official-GOLDIE25_Trackmap.pdf`, `official-GOLDIE22_Trackmap.pdf`, rendered PNGs, `official-supercars-track-map.svg`). They are reference material only; no open reuse license was found. Only centreline coordinates and label positions extracted from the 2025 PDF (`schematic-2025.json`) feed the data.

## Reusable centerline

- [Coordinate JSON](../../artifacts/review/gold-coast/references/gold-coast-coordinates.json): anticlockwise local coordinates, turn markers, raw/official chainages, route segments, patch statistics, map-fit residuals and the projection.
- [GeoJSON](../../artifacts/review/gold-coast/references/gold-coast-centerline.geojson): the same closed route in WGS84. Points inside the patches below are derived, not raw OSM vertices.
- [OSM source subset](../../artifacts/review/gold-coast/references/osm-gold-coast-circuit.json) (tracked as `data/raw/gold-coast-osm-circuit.json`): 24 chained ways plus the pit-lane way, via the public [Overpass API](https://overpass-api.de/api/interpreter) on 2026-10-08.
- [Reproduction scripts](../../artifacts/review/gold-coast/references/derive-geometry.py): `fetch-sources.py` (OSM), `extract-schematic.py` (needs poppler; reads the cached PDF), `derive-geometry.py` (standard library only; writes both tracked JSON files), `elevation.py`, `fetch-environment.py`, `environment-positions.py`, `make-reference-plot.py` and `make-manifest.py`. `derive-geometry.py` asserts connected shared nodes, closure, orientation, nonzero segments and no proper self-crossings.
- [Source manifest](../../artifacts/review/gold-coast/references/source-manifest.json) records URLs, retrieval date, licensing and SHA-256 hashes.

`pointsXZ` is raw projected metres, **X east and Z south**. `pointsXZOfficial` applies one uniform factor of **0.9889891833632268**, changing the measured length **2992.954877 m** to the official **2960 m**. The runtime file first held these 583 points (the closing repeat of the first point is omitted, as in the Adelaide file; `pointCountIncludingClosure` is 584). After the [aerial-photo re-fit](#re-fit-from-queensland-aerial-photos) it holds 776 points at official scale and no longer matches the coordinate files above. The loop begins at `[0, 0]` at the estimated timing line: latitude **-27.985477895428858**, longitude **153.42675693540406**. That is the mid-point of the OSM pit-lane service way [179722656](https://www.openstreetmap.org/way/179722656) (`highway=service`, `sport=motor`, 601 m long) projected onto the pit straight, 21.9 m away. It is an estimate; no source surveys the line. `finishLineS = 0` is therefore an estimate.

### What OSM could and could not give

OSM has **no raceway ways and no circuit relation with chicanes** for this circuit. [Relation 9325885](https://www.openstreetmap.org/relation/9325885) ("Surfers Paradise VASC Circuit", note "During GC600 Race only") lists the public roads in an unreliable member order. Those road centrelines are straight, or are junction polylines with 80-100 degree vertices, and they contain neither chicane. The race route therefore uses two sources:

1. **OSM road centreline, used directly** on the pit straight and most of Main Beach Parade: about 1,460 m, 49 % of the lap (s 2621-2960 and 0-431, 918-1349, 1583-1838). The race uses the south-east-bound carriageway of the dual Gold Coast Highway (way 22915200 and neighbours). The pit-lane way lies 16-22 m to its north-east and the other carriageway lies about 20 m to its south-west; the fitted map line sits within 2 m of the south-east carriageway there.
2. **The organiser's 2025 map centreline, fitted to OSM**, for T1-T5, T6-T10 and T11-T15: about 1,500 m, 51 % of the lap. The map's Bezier centreline is a good plan: one similarity fit to five OSM junction nodes (T4, T11, T12, T13, T14) leaves **0.8-5.0 m** residuals and a scale of **1.1524 m per PDF point, 0.96 % from the scale implied by 2.96 km**. Each patch starts and ends where the fit is within 11 m of the OSM line, and is blended into it (smoothstep) so it joins exactly. Join tangent mismatches are -3.3 to 0.9 degrees; the patches stay within 5.4, 10.2 and 12.5 m of the OSM line they replace.

   | Patch | Turns | Replaces OSM ways (kept only as alignment guide) |
   |---|---|---|
   | front chicane to T5 | T1-T5, s 431-918 | 22915039 tail, 670483883, 670483885, 22915126, 252989001, 1452193831, 1452193842, 1452193841, 520180668, 1452178843 head |
   | beach chicane | T6-T10, s 1349-1583 | the straight part of 1452178841 |
   | T11 to final corner | T11-T15, s 1838-2621 | 27768096 tail, 24314788, 737489999, 737489998, 24314826, 670483895, 258848231, 670483887 |

Where the chicanes sit along the 1.1 km Main Beach Parade straight is the weakest figure: the map is not to scale and two landmark methods (Higman Street and Cable Street) disagree by about 40 m, so the beach chicane position carried **about +/-40 m**. The [aerial-photo re-fit](#re-fit-from-queensland-aerial-photos) has since fixed its position. Chicane shapes (T1-T3 lateral swing about 20 m, T6-T10 about 12 m peak to peak) come from the map and are estimates; they were not smoothed. After the game's own 3 m smoothing the tightest corners measure T12 13.6 m, T14 17.7 m, T13 19.1 m, T4 19.2 m, T11 24.7 m, and the chicane corners 39-52 m radius.

OSM way chain in race order, starting at the pit-straight origin (all `highway` ways; * = vertices kept in the output):

1. [22915200](https://www.openstreetmap.org/way/22915200)* Gold Coast Highway (south-east-bound carriageway), pit straight through the timing line.
2. [22915022](https://www.openstreetmap.org/way/22915022)* and [22915040](https://www.openstreetmap.org/way/22915040)* Gold Coast Highway bend.
3. [22915039](https://www.openstreetmap.org/way/22915039)* Ferny Avenue, then [670483883](https://www.openstreetmap.org/way/670483883), [670483885](https://www.openstreetmap.org/way/670483885), [22915126](https://www.openstreetmap.org/way/22915126): the Ferny Avenue junction where the front chicane sits.
4. [252989001](https://www.openstreetmap.org/way/252989001), [1452193831](https://www.openstreetmap.org/way/1452193831) Surfers Paradise Boulevard to the hairpin; [1452193842](https://www.openstreetmap.org/way/1452193842), [1452193841](https://www.openstreetmap.org/way/1452193841), [520180668](https://www.openstreetmap.org/way/520180668) Main Beach Parade south end (traversed in reverse).
5. [1452178843](https://www.openstreetmap.org/way/1452178843)*, [1452178842](https://www.openstreetmap.org/way/1452178842)*, [1452178841](https://www.openstreetmap.org/way/1452178841)* Main Beach Parade north-bound (reverse), then [27768096](https://www.openstreetmap.org/way/27768096)* to Breaker Street.
6. [24314788](https://www.openstreetmap.org/way/24314788) Breaker Street west, [737489999](https://www.openstreetmap.org/way/737489999) (shared stub, trimmed at node 6904777903), [737489998](https://www.openstreetmap.org/way/737489998) Serisier Avenue (reverse), [24314826](https://www.openstreetmap.org/way/24314826) Hill Parade (reverse).
7. [670483895](https://www.openstreetmap.org/way/670483895), [258848231](https://www.openstreetmap.org/way/258848231) Tedder Avenue, then [670483887](https://www.openstreetmap.org/way/670483887), [22915201](https://www.openstreetmap.org/way/22915201)* back onto the Gold Coast Highway.

## Turn signs and approximate bend markers

The organiser's map names only T1-3, T4, T8 and T11-T14. **T5, T6/T7/T9/T10 and T15 are inferred**: T6-T10 is the five-part beach chicane in Supercars' own guides (the map's "T8" label sits on its third bend, and the kerb-sensor sides in the sources match the bend directions R/L/R/L for T7-T10); T5 is the flat left after the hairpin (the 2025 resurfacing ran "Turn 4 through to Turn 6"); T15 is the long left onto the pit straight (a 2017 report cites a Turn 15 tyre bundle, and 15 matches Wikipedia). Supercars' circuit text lists T4 and T15 as the slowest points; the map geometry makes **T14 the tight corner** and T15 a wide sweep, so treat the T14/T15 split as approximate. The map's T1-3 label sits on the middle bend, which supports left-right-left. Names below are street/section descriptions or the map's sponsor labels, not formal corner names. `S` is metres from the estimated timing origin after uniform length calibration. `S` and indices are from the runtime file after the aerial-photo re-fit; indices address its point array, before any resampling.

| Turn | Direction | Description | Point index | Approximate S (m) |
|---|---|---|---:|---:|
| T1 | Left | Front chicane (Ferny Avenue junction) | 51 | 534.419 |
| T2 | Right | Front chicane, central corner | 57 | 550.342 |
| T3 | Left | Front chicane exit, Surfers Paradise Boulevard | 83 | 608.064 |
| T4 | Left | Pizza Hut Hairpin, into Main Beach Parade | 168 | 764.309 |
| T5 | Left | Flat left after the hairpin (inferred) | 212 | 850.891 |
| T6 | Left | Beach chicane (first bend) | 316 | 1415.166 |
| T7 | Right | Beach chicane | 329 | 1443.031 |
| T8 | Left | Beach chicane (map label T8) | 347 | 1477.863 |
| T9 | Right | Beach chicane | 367 | 1515.681 |
| T10 | Left | Beach chicane (last numbered bend) | 383 | 1549.517 |
| T11 | Left | Hino Corner, Main Beach Parade to Breaker Street | 456 | 1914.753 |
| T12 | Left | Repco Corner, Breaker Street to Serisier Avenue | 525 | 2110.807 |
| T13 | Right | Coates Corner, onto Hill Parade | 564 | 2200.374 |
| T14 | Left | Boost Mobile Hairpin, Hill Parade to Tedder Avenue | 686 | 2443.202 |
| T15 | Left | Long left from Tedder Avenue onto the pit straight (inferred) | 712 | 2491.966 |

A further unnumbered right bend (about 37 degrees) closes the beach chicane after T10, and a gentle right of about 40 degrees on Hill Parade leads into T14. The pit straight, from T15 to T1, is about 980 m. Route by street (official S): pit straight / Gold Coast Highway 2492-534, front chicane at Ferny Avenue 534-608, Surfers Paradise Boulevard 608-764, Main Beach Parade 764-1915, Breaker Street 1915-2111, Serisier Avenue 2111-2200, Hill Parade 2200-2443, Tedder Avenue 2443-2492. HUD stretches in the game, each starting just after the junction it is named for: Pit Straight 0, Front Chicane 440, Surfers Paradise Boulevard 640, Main Beach Parade 790, Beach Chicane 1350, Main Beach Parade North 1590, Breaker Street 1940, Serisier Avenue 2140, Hill Parade 2215, Tedder Avenue 2465, Pit Straight 2560.

Suggested **gameplay sector estimates**, not official timing-loop positions (no sector data was found): `0-900 m` pit straight, front chicane and the hairpin, `900-1960 m` Main Beach Parade, beach chicane and Hino Corner, `1960-2960 m` Breaker Street, T12-T15 and the pit straight. These are `sectorStarts: [900, 1960]`.

![OSM and map-derived anticlockwise route with numbered turns, pit lane, stands, coastline and towers](../../artifacts/review/gold-coast/references/gold-coast-topology.png)

## Pace, measurement limits and attribution

Official 2025 Repco Supercars results (best lap per driver; session pages carry no practice number, so sessions are named by day and time):

- [Friday 24 Oct, 12:40, 30 min](https://www.supercars.com/results/2025/2025-gold-coast/P4) (24 drivers): **1:09.266 (Will Brown) to 1:10.797**.
- [Friday 24 Oct, 15:25, 30 min](https://www.supercars.com/results/2025/2025-gold-coast/P7): 1:08.573 (Cam Waters) to 1:09.818.
- [Saturday 25 Oct qualifying, 11:00, 30 min](https://www.supercars.com/results/2025/2025-gold-coast/Q4): **1:08.286 (Matthew Payne) to 1:10.437**; [Sunday qualifying, 10:00](https://www.supercars.com/results/2025/2025-gold-coast/Q6): 1:08.326 to 1:09.251 (23 drivers).
- Top-10 shootouts ([Q5](https://www.supercars.com/results/2025/2025-gold-coast/Q5), [Q7](https://www.supercars.com/results/2025/2025-gold-coast/Q7)): pole laps 1:09.159 (Ryan Wood) and 1:09.199 (Broc Feeney).

That is a roughly **68-71 second** pace reference for experienced Gen3 drivers, about 150-157 km/h average. The circuit page's **Gen3 race lap record is 1:08.8255 (Chaz Mostert, 2025)**; the event page still shows 1:10.0480 (D. Reynolds, 2013). Keep the session-versus-race distinction; the 2025 surface and soft Dunlop tyre made 2025 faster than earlier years.

Tracked source: `data/raw/gold-coast-osm-circuit.json`; distributed derived geometry: `public/data/gold-coast-centerline.json`, byte-identical to `src/track/data/gold-coast.json` (ODbL). The runtime resamples at 4 m after the same 3 m Gaussian smoothing used by the Bathurst builder, then normalizes the loop to 2,960 m. The standing-start line is estimated at 100 m after the estimated timing line (the Adelaide convention; no source locates the grid).

The coordinates supply horizontal route geometry only. Elevation, banking, road width, kerb dimensions, barrier offsets, grip and the exact timing-loop position are **unmeasured**. The T1-T3 and T6-T10 shapes, the T14/T15 split and the carriageway choice (+/-12 m) are estimates, as is every position in the Environment section. Do not transfer Bathurst's mountain elevation or its named corners.

### Displayed altitude above sea level

Looked up 2026-10-08 through [OpenTopoData](https://www.opentopodata.org), `api.opentopodata.org/v1/<dataset>?locations=<lat>,<lon>`, the same service and method as Adelaide:

| Dataset | At the estimated start line (-27.985478, 153.426757) | 21 points spaced around the lap |
|---|---:|---|
| SRTM 30 m (`srtm30m`) | **7 m** | 0 to 22 m, mean 6.7 m |
| ASTER GDEM 30 m (`aster30m`) | 14 m | 0 to 35 m, mean 14.9 m |

Use `elevationBaseM = 7` with the `(EST)` marker: the SRTM reading at the start line, as for Bathurst and Adelaide. Both datasets are surface models with several metres of vertical error and include buildings and trees, and they disagree by 7 m here. The model stays flat.

## Environment (positions for the world builder)

Frame: **x east, z south, metres from the estimated timing line, game scale** (`scaleToOfficial` applied). The start straight points toward bearing **148 degrees** (south-east). Machine-readable copy: `environment-positions.json`. Positions are read from OSM or from the 2025 numbered map, which is not to scale; treat map-derived ones as **+/-25 m estimates**.

- **Sea and beach.** The Pacific coast (OSM coastline) runs along bearing 345/165 degrees, so open sea lies to the east-north-east (about 75 degrees). The nearest coast point is **389 m from the timing line at bearing 81 degrees**, at about x 384, z -62. Main Beach Parade is **88-206 m inland of the coastline**, with a sand and park strip between. Driving north along Main Beach Parade (T4 to T11) the **sea is on the driver's right**, about 90-200 m away. The beach chicane sits on that strip, and its tyre bundles and the Beach Chicane Club suite (map "CC") are on the sea side.
- **Nerang River / Broadwater.** OSM carries the `Nerang River` waterway and a very large `natural=water` relation ([6168517](https://www.openstreetmap.org/relation/6168517)). The water lies **inside the lap, to the driver's left** along Main Beach Parade (OSM shoreline about x 245, 45-75 m west of the line between z -70 and z 270) and touches Hill Parade at T13 (within 10 m, about x 0, z -340). South-west of the pit straight, beyond Commodore Drive, is the Paradise Waters canal estate (OSM flowline "Paradise Waters", x -800 to -200). The Broadwater proper is the same estuary opening to the north-west, off the lap. The map draws the infield lagoon between the pit straight and Main Beach Parade, with the paddock on the pit-straight shore.
- **High-rise towers.** All are **off the lap on the inland side except the Main Beach residential cluster beside the track**. Landmark towers lie south, straight down the pit-straight line (bearing 168-179 degrees): [Q1](https://www.openstreetmap.org/way/188325694) **322.5 m** (78 floors) at x 289, z 2275; Soul 243 m at x 366, z 1749; Hilton Surfers Orchid tower 187.9 m near x 189, z 1718; Circle on Cavill South 158 m at x 30, z 1720 (heights: [Wikipedia list](https://en.wikipedia.org/wiki/List_of_tallest_buildings_on_the_Gold_Coast); positions from OSM). Residential towers close to the track (OSM `building:levels`; height about levels x 3.2 m, an estimate): Midwater 40 levels (x 211, z -191, 42 m off the line), Silverpoint 30 (197, -301), Pearl 30 (190, -515), Spinnaker 30 (171, -556), Sunbird 21 (185, -437) along the Main Beach Parade/Breaker Street stretch; Contessa 35 (58, -337), Axis 27 (-103, -396), Malibu 21 (-180, -424), White 31 (-42, -588) on the infield side of Hill Parade; Atlantis East 36 (61, 331) and West 36 (-39, 314) beside the pit straight near T1; Golden Gate Resort 32 (187, 680) and Hi Surf 27 (297, 762) at the hairpin; Capricorn One 23 (231, 398). A 130 m building tagged in OSM sits at about x 202, z 791. Tall buildings are a continuous high-rise wall along the whole inland skyline; the beach side is low.
- **Trees.** OSM maps only five individual trees (x 331-377, z 573-957, no species). The numbered map draws a double row of palms along the pit-straight median, tree clusters in the infield parkland and grass around the lagoon; these are drawn symbols, not species data. No source verified palm versus other species; treat them as an estimate.
- **Walls and fences.** Supercars reports "six kilometres of concrete barriers and fencing" for a 2.96 km lap, which is concrete wall on **both sides along the whole lap**, topped by debris/catch fencing (fencing began on the Gold Coast Highway and Surfers Paradise Boulevard). A 2015 engineering preview calls them "unforgiving concrete walls". Tyre bundles are reported at T1 (driver's left), the beach chicane, T13 and T15. Large kerbs line the chicanes.
- **Pit lane and pit building.** The pit lane is along the Gold Coast Highway on the **driver's left (north-east) side** of the straight, OSM way 179722656: 601 m long, from chainage about **-298 m (pit entry, x -176, z -240) to +294 m (pit exit, x 140, z 260)** and 16-22 m from the track centreline. The pit garage suites and lounges ("PGS", "TSL", "PPH", "MBL", "PES" on the map) run behind it on the infield side, about **35 m behind the pit-lane centreline (roughly 70 m from the track)**, centred near x 105, z 43 and x 72, z -13; the Supercars Paddock Club (SPC) is near x 157, z 146 and the Sports Lounge (SL) near x 151, z 282.
- **Grandstands and fan stands** (2025 map labels; type from the map legend; `chainage` is distance along the lap, `side` is relative to the driver):

  | Stand | Type | x | z | Chainage (m) | Side (m off the line) |
  |---|---|---:|---:|---:|---|
  | S10 | fan stand + accessible platform | -137 | -218 | 2703 | left (18) |
  | S11 | fan stand | -112 | -115 | 2801 | right (22) |
  | S12, S13, S14 | grandstands | -85, -48, -11 | -76, -30, 26 | 2848, 2907, 15 | right (24, 21, 24) |
  | S5 | fan stand | 174 | 409 | 445 | left (14) |
  | S15 | grandstand | 149 | 578 | 611 | right (29) |
  | S18 | fan stand + accessible platform | 311 | 471 | 1017 | right (20) |
  | S19 | fan stand | 324 | 208 | 1282 | right (16) |
  | S7 | fan stand | 286 | 147 | 1342 | left (25) |
  | S22A, S22 | grandstands | 297, 315 | -72, -30 | 1574, 1522 | right (9, 11) |
  | S23 | grandstand | -257 | -424 | 2465 | right (25) |

  The main grandstand row (S11-S14) faces the pit lane across the pit straight on the outer, south-west side. S10 sits ahead of it at the pit-straight start and the map draws it as an accessible viewing platform; its side is the least certain.

OSM data and these derived coordinate datasets are **ODbL 1.0**. Retain the source dataset and license with the geometry and display **© OpenStreetMap contributors**, linked to [OSM copyright/licensing](https://www.openstreetmap.org/copyright). Link the distributed data to the [ODbL license](https://opendatacommons.org/licenses/odbl/1-0/). This data licensing does not automatically relicense unrelated game code. The cached organiser and Supercars maps have separate copyright and remain research references; the map-derived centreline is a measurement of the route, not a copy of the artwork.

Final geometry hashes:

- `gold-coast-coordinates.json`: `4b5c3bcb80371ccab64a1a860b0755d1d95c2ee5b3acdd7abaf2668d0ab97ae9`
- `gold-coast-centerline.geojson`: `db82af50f6d48246ea13339cb8f2a012ac1955312401ca0460c2f65ac2e51264`
- `src/track/data/gold-coast.json` and `public/data/gold-coast-centerline.json`: `61d3f44367fe8edca7c8e1de842d57e40d1218035563e84000427a02e7206e32` before the re-fit, `6ef3f9b4fb72fcfcd6b95f14a931121e9a0730fb92f8f6a2d5f809f67a08aa8c` after it

Validation: exact closure by shared node, 584 points including closure (777 after the re-fit), **anticlockwise** projected signed area **-276071.391 m²** (-273556.044 m² after the re-fit) (negative in the x-east, z-south frame, where Adelaide's clockwise route is positive), zero zero-length edges and zero proper self-intersections. This research does not prove runtime rendering, handling or deployment.

## Re-fit from Queensland aerial photos

Re-fitted 2026-10-08. The State of Queensland publishes 10 cm aerial photos of the Gold Coast through its [TimeSeries AerialOrtho image service](https://spatial-img.information.qld.gov.au/arcgis/rest/services/TimeSeries/AerialOrtho_AllUsers/ImageServer). This re-fit uses the projects `Gold_Coast_2014_10cm_SISP_LGA` and `Gold_Coast_LGA_2022_10cm_SISP`. The photos are licensed CC BY 4.0. They served for measurement only; the game ships no imagery.

> Includes material © State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development), CC BY 4.0

**Method.** The centreline was sampled every few metres. At each sample, the offset to the race carriageway's centre was measured across the photo. The evidence was barrier lines, painted kerbs and the paved edges. Only valid samples were kept. They were median-filtered over +/-8 m, then smoothed with a 4 m Gaussian, and gaps were interpolated. The correction applies in full inside each stretch and tapers to zero over 30 m at both ends. For the beach chicane, the photos show a permanent bulge in the road, painted kerbs and stand frames. These fixed the chicane's position and its lateral extremes, and the five bends were re-placed between them. The scripts and per-sample offsets are in `artifacts/review/gold-coast/measure/` (`refit-centreline.py`, `offsets_per_sample.csv`, `beach_chicane_features.csv`, overlays in `refit/`). The image fetcher is `artifacts/review/gold-coast/references/web/fetch-qld-imagery.py`. The runtime JSON records the same in `meta.refit`.

| Stretch (old S) | Before | After |
|---|---|---|
| Surfers Paradise Boulevard, s 633-745 | Line on the tram tracks, 9-11 m off the race carriageway | On the carriageway |
| T4 Pizza Hut Hairpin apex | 10-12 m off | On the 2014 asphalt ridge (low confidence) |
| Beach chicane T6-T10 | About 50 m early and too wide | Apexes at s 1415-1550, lateral swing -5.1 to +7 m |
| Hill Parade and the T14 approach | 3-5 m off | On the carriageway |

Across the corrected stretches, the remaining offset to the measured centre has a median of 0.2-0.4 m. The maximum is 1.88 m on confident samples, and three low-confidence samples reach 3.85 m. The measured loop is 2,974.3 m before scaling to the official 2,960 m (scale 0.995194, previously 0.98899). Autopilot laps after the re-fit take 68.55-68.87 s, against the real 68.3-70.8 s.

**Still estimates.**

- **T4 apex.** The junction is open. The 2022 photo shows no race barriers, so the apex follows the centre of the turning carriageway in the 2014 photo.
- **Beach chicane block shape.** The shape between the measured extremes is an estimate, because no top-down race-weekend photo of the chicane was found.
- **T1-T2.** The front chicane keeps the map shape. Temporary barriers build it across a wide road, so the road centre in the photos is not the race line. The line sits a median 4.0 m (at most 7.5 m) from that road centre.
- **T11 and T12.** These keep the map fit. The photos put them a median 0.3 m (T11) and 1.9 m (T12) from the carriageway centre, so they were left unchanged.
- **Topology figure.** `gold-coast-topology.png` above still shows the route before the re-fit.

## Runtime world (implemented 2026-10-08)

The game uses this research as follows. Each item is an estimate unless it says otherwise.

- **Environment data.** `src/track/data/gold-coast-environment.json` (ODbL, about 20 KB) holds the ocean coastline, the Nerang River ring, Macintosh Island as a hole in that ring, the island pond (relation 6067956) and 131 OSM buildings with 8 or more levels or 25 m or more height. `artifacts/review/gold-coast/references/derive-environment.mjs` rebuilds it from the cached extracts without network access.
- **Macintosh Island.** OSM maps the island at about 0.6 km². The pit straight runs on it, and the lap crosses the channel near s 400 and s 2620. The road corridor stays at ground height at both crossings, so they read as causeways. The game has no bridge models.
- **Sea and beach.** The sea surface starts at the OSM coastline. The 55 m before the coastline is sand. The infield channel at z = 0 is about 67 m wide.
- **Skyline.** 124 OSM towers fit on the High tier, Q1 among them at 323 m (OSM height tag). Footprints are size-class estimates; OSM gives only the building centres. Mid-rise street blocks (27 on High) are generated and kept off the island, the lap's infield and the 120 m before the coast.
- **Trackside.** Palms (coconut and foxtail) are generated; the species is not verified. 12 of the 13 mapped stands fit; S22 does not fit beside S22A. Two of the three pit garage rows fit. Widths, runoff and tyre-stack positions are gameplay estimates.
