# Bathurst reference library

Reference links for the Mount Panorama (Bathurst, NSW) browser racing game: three.js, medium-poly art style, a broadcast and sim-racing style HUD, and two cars (Gen3 Supercars Chevrolet Camaro ZL1 and Ford Mustang GT). Every entry is one line in the form `- [Title](URL) — what it shows and why it is useful`. Only links, no downloaded media.

## Index

| File | References | Scope |
|---|---:|---|
| [track-layout-and-elevation.md](track-layout-and-elevation.md) | 78 | Official facts, corner guides, maps, OSM and coordinate links, elevation and laser-scan sources, sim-racing versions, track-guide videos |
| [corners-visual.md](corners-visual.md) | 71 | Photos, videos and articles for every named section in lap order, pit lane included |
| [landmarks-and-scenery.md](landmarks-and-scenery.md) | 101 | Pit complex, grandstands, bridges, camping, houses, museum, boardwalk, barriers, vegetation, weather, town |
| [cars-camaro-mustang.md](cars-camaro-mustang.md) | 114 | Gen3 Camaro ZL1 and Mustang GT: specs, photos, road-car body references, cockpit/MoTeC, onboards, sound |
| [hud-and-ui.md](hud-and-ui.md) | 73 | Supercars TV graphics, native and overlay sim HUDs, MoTeC dashes, shift lights, minimaps, timing data, typography |
| [art-style-medium-poly.md](art-style-medium-poly.md) | 84 | Stylized muscle cars, low-poly tracks, eucalyptus trees, free asset libraries, three.js racing demos, look-dev |
| [techniques-and-physics.md](techniques-and-physics.md) | 121 | Car physics, racing line, procedural roads and terrain, three.js performance, WebAudio, Gamepad, ghosts, lap timing |
| **TOTAL** | **642** | Counted from the files with `grep -c '^- \['`; 642 distinct URLs, no URL repeated across files |

Count check: `cd docs/references && for f in track-layout-and-elevation corners-visual landmarks-and-scenery cars-camaro-mustang hud-and-ui art-style-medium-poly techniques-and-physics; do echo $f $(grep -c '^- \[' $f.md); done`

## Start here (the ten most useful)

1. [OpenStreetMap relation: Mount Panorama Circuit](https://www.openstreetmap.org/relation/6942508) — Real circuit geometry as a relation; its member ways give a centreline to sample for the spline. The track file also lists OSM ways and nodes for every corner, the pit lane, grandstands, campgrounds and bridges.
2. [Bathurst Regional Council: Track Facts](https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/About-the-Mount/Track-Facts) — Owner-published ground truth (6.213 km, 23 turns, 862 m highest point, Conrod 1.916 km, Mountain Straight 1.111 km, 1:6.13 steepest grade) to scale the model against.
3. [ELVIS: Elevation Information System](https://elevation.fsdf.org.au/) — Free Australian LiDAR/DEM downloads, the practical source for real heights to drape the centreline over (the 174 m climb is the track's defining feature).
4. [Commons: track map SVG](https://commons.wikimedia.org/wiki/File:Mount_Panorama_street_racing_circuit_in_Australia.svg) — Vector circuit map that can be traced for the minimap and for checking corner order and The Chase position.
5. [Supercars: Greg Murphy guided lap of Mount Panorama](https://www.youtube.com/watch?v=faz0o7k4zGQ) — Official narrated onboard lap: corner order, what each corner asks of the driver, and the pace of a lap.
6. [WhichCar: Gen3 Camaro and Mustang technical details](https://www.whichcar.com.au/features/here-s-all-the-technical-details-on-the-gen3-supercars-ford-mustang-and-chevrolet-camaro) — Wheelbase, wheel size, tyre dimensions and engine notes for both cars in one place (cross-check numbers against the Supercars.com articles).
7. [Commons: Broc Feeney's Camaro Supercar, parade](https://commons.wikimedia.org/wiki/File:Broc_Feeney's_Chevrolet_Camaro_Supercar_at_the_2025_Adelaide_Grand_Final_Parade_-_01.jpg) and [Commons: Cameron Waters's Mustang Supercar, parade](https://commons.wikimedia.org/wiki/File:Cameron_Waters's_Ford_Mustang_Supercar_at_the_2025_Adelaide_Grand_Final_Parade_-_01.jpg) — High-resolution freely licensed photos of static Gen3 cars in numbered series, the best body-shape references for modelling.
8. [Supercars: 360 onboard, Gen3 Camaro attacks the Mountain](https://www.youtube.com/watch?v=PKrtTod9LGo) — 360-degree 4K onboard of the Camaro at Bathurst (the Mustang equivalent is in the cars file): cockpit, dash, sightlines and speed.
9. [TUM FTM: global_racetrajectory_optimization](https://github.com/TUMFTM/global_racetrajectory_optimization) — Minimum-curvature raceline code to generate the AI and ghost reference line from a centreline with track widths.
10. [Marco Monster: Car Physics for Games](https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html) — The standard game-oriented explanation of tyre forces, weight transfer and drag; pair with Edy's Pacejka guide in the techniques file.

## How the library was compiled and checked

- Sources: web search results, pages fetched directly, the Wikimedia Commons API (category listings and file descriptions), the OpenStreetMap Overpass API (named circuit features and their coordinates), YouTube search result pages (video IDs and titles), and direct fetches of documentation pages that were then confirmed to exist.
- Every URL was requested on 2026-10-07. Almost all returned HTTP 200 (YouTube links were checked through oEmbed). Sites that block automated clients returned 403 or 202 (for example artstation.com, bathurst.nsw.gov.au, cgtrader.com, fandom.com); those links are kept only because they appeared in search results. Dead or redirecting-to-homepage links were removed, and redirected links were replaced with their final URL.
- Descriptions of photos and videos come from titles, captions and metadata; the media was not downloaded or watched in full, so confirm the framing before depending on a specific angle.
- Google Maps and OpenStreetMap map links under specific corners are coordinate links built from the OSM node and way coordinates; they are not saved places.
- Name clash to watch: Reid Park is also a Townsville street circuit. Some Gen3 'Reid Park' 360 onboards in the cars file are from Townsville, not Bathurst, and are labelled that way.

## Known gaps

- The search tool reached its per-session limit part-way through, so a few topics are thinner than ideal: delta-bar and damage-indicator HUD designs, kerb colours and line-paint specifics, stylized lighting and colour-grading guides, and ArtStation or Polycount tutorials for gum trees. Starting points for each are listed in the relevant file but a follow-up pass would add depth.
- No exact elevation profile chart per corner was found; use the ELVIS or terrain-tile sources in the track and techniques files to derive one from the OSM centreline.
- Gen3 technical numbers (mass, wheelbase, power) differ slightly between articles; treat them as targets and cross-check against Supercars.com before hard-coding.
