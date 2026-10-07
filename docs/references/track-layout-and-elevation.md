# Track layout and elevation

Facts, maps and guides for the shape of the Mount Panorama Circuit in Bathurst, NSW. Ground-truth numbers to build against: 6.213 km lap, 23 turns, anti-clockwise, 174 m vertical difference between the pit straight and Skyline (highest point 862 m above sea level), steepest grade about 1:6.13, Mountain Straight 1.111 km and Conrod Straight 1.916 km (interrupted by The Chase since 1987). Timing is commonly described as three sectors: control line to The Cutting, across the top to Forrest's Elbow, then Conrod Straight and back to the line. The file lists official facts, corner guides, Wikimedia Commons maps, OpenStreetMap objects and coordinate links for each corner (the Google Maps and OSM coordinate links are constructed from OSM node coordinates), elevation and laser-scan data sources, sim-racing versions of the track, and video track guides.

Descriptions of photos and videos are written from page titles, captions and metadata; the media itself was not downloaded, so check the framing before relying on a specific angle. Every URL was fetched or came from a search result when this library was compiled (2026-10-07); a few sites (for example artstation.com, bathurst.nsw.gov.au, cgtrader.com, fandom.com) refuse automated requests with 403 or 202 responses but did appear in search results.

**Reference count: 78**

## Overview, official facts and corner guides (17)

- [Wikipedia: Mount Panorama Circuit](https://en.wikipedia.org/wiki/Mount_Panorama_Circuit) — Baseline facts for the model: 6.213 km, 174 m vertical difference, steepest grade about 1:6.13, anti-clockwise, plus a corner-by-corner list (Hell Corner through Murray's Corner) and the 1987 addition of The Chase.
- [Bathurst Regional Council: Track Facts](https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/About-the-Mount/Track-Facts) — Circuit owner's numbers: 23 turns, highest point 862 m ASL, Conrod Straight 1.916 km, Mountain Straight 1.111 km, steepest grade 1:6.13. Use these as ground-truth lengths when scaling the spline.
- [Bathurst Regional Council: The Circuit](https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/About-the-Mount/The-Circuit) — Council's own description of the circuit sections (the owner and operator of the track), useful for naming and ordering sections consistently with official wording.
- [Bathurst Regional Council: Mount Panorama track page](https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/Track) — Official landing page for the circuit with the public-road rules (60 km/h non-race days) that explain why the track has driveways, houses and road signage.
- [V8 Sleuth: How Bathurst's corners got their names](https://www.v8sleuth.com.au/how-bathursts-corners-got-their-names/) — Origin of each corner name (Hell Corner and the tree stump, Griffin, Reid, Sulman, McPhillamy, Skyline renamed for Brock in 1997, Forrest's Elbow, Conrod's 1939 con-rod failure, The Chase, Murray's Corner formerly Pit Corner); good source for sign text and tooltips.
- [Supercars.com: who are Griffin, Reid, Sulman, McPhillamy, Forrest, Murray?](https://www.supercars.com/news/supercars-news-2025-bathurst-1000-corner-names-mount-panorama-explained) — Official explainer of the corner names including why it is The Cutting and The Esses; use for in-game corner name copy.
- [The Drive: how to drive one of the world's most savage road courses](https://www.thedrive.com/cars-101/32271/how-to-drive-one-of-the-worlds-most-insane-road-courses) — Narrative corner-by-corner walk of a lap with gears and speeds (e.g. 2nd-gear Hell Corner after 200 km/h in 4th, first-gear Cutting); good for tuning braking zones and gear choice.
- [Motor Sport Magazine: Track test, Bathurst (Feb 2001)](https://www.motorsportmagazine.com/archive/article/february-2001/50/track-test-bathurst/) — Period track test of the circuit (Feb 2001) written by a driver; useful for how the walls, camber and blind crests felt before later changes.
- [Sidepodcast: Track Back, Mount Panorama](https://sidepodcast.com/post/track-back-mount-panorama-in-bathurst) — Overview piece in a series on great circuits; covers layout, the public-road nature and corner personalities.
- [Paradigm Shift Racing: Mount Panorama track guide map](https://www.paradigmshiftracing.com/mount-panorama-track-guide-map.html) — Annotated driver-coaching map and notes of the circuit with corner-by-corner lines; useful as a visual for racing-line overlays.
- [Track Titan: Mount Panorama track guide](https://www.tracktitan.io/post/mount-panorama-track-guide) — Introductory sim-racing guide (named sections, 300+ km/h on Conrod, the Chase); pair with the telemetry-based hot-lap analysis pages for numbers.
- [Track Titan: Mercedes-AMG GT3 hot-lap analysis](https://www.tracktitan.io/post/mercedes-amg-gt3-evo-mount-panorama-hymo-hot-lap-analysis) — Corner-by-corner hot-lap analysis for Mount Panorama from telemetry; use it to sanity-check braking points, minimum speeds and where time is won.
- [Track Titan: Audi R8 LMS EVO II hot-lap analysis](https://www.tracktitan.io/post/audi-r8-lms-evo-ii-mount-panorama-hymo-analysis) — A second telemetry-driven lap breakdown for the same circuit, giving a cross-check for speeds and line choices through the Esses and Dipper.
- [Mighty Car Mods: why Bathurst is Australia's most epic race track](https://mightycarmods.com/blogs/news/why-bathurst-is-australias-most-epic-race-track) — Fan-oriented explainer of the circuit's character, gradients and corners; good for tone and context.
- [ExplorOz: Mount Panorama Motor Racing Circuit](https://www.exploroz.com/places/98259/nsw+mount-panorama-motor-racing-circuit) — Visitor-facing listing for Mount Panorama Motor Racing Circuit (driving the circuit on non-race days).
- [GTPlanet: why Mount Panorama is one of the world's greatest circuits](https://www.gtplanet.net/why-mount-panorama-is-one-of-the-worlds-greatest-circuits/) — Sim-racing community write-up covering each section's challenge; useful for what players expect to feel at Skyline, the Dipper and the Chase.
- [Supercars.com: what you need to know about the Bathurst 1000](https://www.supercars.com/news/what-you-need-to-know-supercheap-auto-bathurst-1000) — Official race-weekend primer with distance, lap count context and track terminology for the HUD.

## Maps, diagrams and data files (9)

- [Wikimedia Commons: Mount Panorama Circuit category](https://commons.wikimedia.org/wiki/Category:Mount_Panorama_Circuit) — Entry point to all freely licensed Mount Panorama photos, maps and event categories (Bathurst 1000, 12 Hour, museum).
- [Commons: track map SVG](https://commons.wikimedia.org/wiki/File:Mount_Panorama_street_racing_circuit_in_Australia.svg) — Vector circuit map (1495x849) showing the layout with The Chase noted as added in 1986; ideal to trace as a minimap outline.
- [Commons: 1987 layout map](https://commons.wikimedia.org/wiki/File:MountPanoramaCircuit1987.png) — Map of the circuit as it stands since the Chase was added; compare against the pre-1987 straight Conrod.
- [Commons: 1938-1986 layout map](https://commons.wikimedia.org/wiki/File:Mount_Panorama_1938-1986.png) — Original layout without the Chase chicane; confirms the geometry of Conrod before the 1987 change.
- [Commons: circuit map overview](https://commons.wikimedia.org/wiki/File:Mount_Panorama_Circuit_Map_Overview.PNG) — Simple overview map with corner positions; useful for quick checks of corner order.
- [Commons: circuit map](https://commons.wikimedia.org/wiki/File:Mount_Panorama_Circuit_Map.png) — Low-resolution track diagram suitable for checking orientation (anti-clockwise, pit straight on the lowest part).
- [Commons: Bathurst 1000 Mount Panorama map](https://commons.wikimedia.org/wiki/File:Bathurst_1000_mount_panorama.PNG) — Tall portrait map (1000x1533) of the circuit that gives the best sense of the north-south orientation of the whole mountain.
- [Commons: circuit maps category](https://commons.wikimedia.org/wiki/Category:Mount_Panorama_Circuit_circuit_maps) — All circuit-map files in one place, including historical layouts.
- [Wikidata: Mount Panorama Circuit](https://www.wikidata.org/wiki/Q1950645) — Structured data record (coordinates, length, opening year) that can be pulled by script for the project's metadata.

## Satellite, aerial and coordinate links for specific corners (21)

- [OSM relation: Mount Panorama Circuit](https://www.openstreetmap.org/relation/6942508) — The circuit as an OpenStreetMap relation; the member ways give a centreline you can sample for the spline and then drape on terrain heights.
- [OSM way: Pit Straight](https://www.openstreetmap.org/way/306192512) — Mapped centreline of the pit straight at roughly -33.4393, 149.5585, the lowest part of the lap.
- [OSM way: Hell Corner](https://www.openstreetmap.org/way/414156370) — Mapped geometry of Hell Corner (turn 1) near -33.4391, 149.5557; use to check the corner radius against satellite imagery.
- [OSM way: Mountain Straight](https://www.openstreetmap.org/way/30111085) — The 1.1 km climb from Hell Corner toward Griffins Bend as an OSM way for length checks.
- [OSM node: Griffins Bend](https://www.openstreetmap.org/node/4056397188) — Point label for Griffins Bend at approx -33.4491, 149.5531, handy for placing the corner sign and braking boards.
- [OSM way: The Cutting](https://www.openstreetmap.org/way/306192500) — Mapped way for The Cutting near -33.4483, 149.5503, the narrow rock-cut uphill section.
- [OSM way: Reid Park](https://www.openstreetmap.org/way/306192503) — Mapped Reid Park section near -33.45, 149.5489 on the climb across the top of the mountain.
- [OSM way: Sulman Park](https://www.openstreetmap.org/way/414156376) — Mapped Sulman Park near -33.4526, 149.5475, the area around the highest point of the circuit.
- [OSM way: McPhillamy Park](https://www.openstreetmap.org/way/306192504) — Mapped McPhillamy Park near -33.4548, 149.5481 at the southern end of the ridge.
- [OSM way: Conrod Straight](https://www.openstreetmap.org/way/306192514) — Mapped Conrod Straight (one of two OSM ways for it) near -33.4419, 149.5608; measure against the 1.916 km official length.
- [OSM way: The Chase](https://www.openstreetmap.org/way/306192513) — The Chase chicane way near -33.4455, 149.5604, a flat-out three-turn chicane mid-Conrod.
- [OSM way: Murrays Corner](https://www.openstreetmap.org/way/306192511) — Murray's Corner way near -33.4399, 149.5611, the 90 degree left that ends Conrod and leads onto pit straight.
- [OSM way: Pit Lane](https://www.openstreetmap.org/way/37594848) — Mapped pit lane service way near -33.4404, 149.5604; use for the pit entry/exit layout and limit lines.
- [Google Maps satellite: Hell Corner](https://www.google.com/maps/@-33.4391,149.5557,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM Hell Corner way centre (-33.4391, 149.5557); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: Griffins Bend](https://www.google.com/maps/@-33.4491,149.5531,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM Griffins Bend node (-33.4491, 149.5531); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: The Cutting](https://www.google.com/maps/@-33.4481,149.5487,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM The Cutting node (-33.4481, 149.5487); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: Sulman Park / Skyline area](https://www.google.com/maps/@-33.4532,149.5468,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM Sulman Park node (-33.4532, 149.5468); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: The Chase](https://www.google.com/maps/@-33.4465,149.5601,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM The Chase node (-33.4465, 149.5601); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: Murray's Corner](https://www.google.com/maps/@-33.4397,149.5611,18z/data=!3m1!1e3) — Satellite-view coordinate link built from the OSM Murray's Corner node (-33.4397, 149.5611); use it to check the barriers, run-off and surrounding terrain at this point. Link is constructed from OSM coordinates, not a saved Google Maps place.
- [Google Maps satellite: whole circuit](https://www.google.com/maps/@-33.4487,149.5539,15z/data=!3m1!1e3) — Satellite-view coordinate link at the OSM circuit relation centre (-33.4487, 149.5539), zoom 15, so the whole loop and the surrounding Bathurst suburbs are visible at once (constructed from OSM coordinates).
- [OpenStreetMap: whole circuit view](https://www.openstreetmap.org/#map=16/-33.4487/149.5539) — Slippy-map view centred on the circuit; toggle layers to see footpaths, campgrounds and the pit complex in context.

## Elevation, scanning and terrain data sources (8)

- [Mining.com: Maptek I-Site models Mount Panorama](https://www.mining.com/web/maptek-i-site-3d-technology-used-to-model-mount-panorama-race-circuit/) — Describes the vehicle-mounted laser scan used for iRacing (scans about every 100 m to cope with the gradient); explains why real elevation data exists at sub-centimetre accuracy.
- [LIDAR Magazine: Maptek I-Site models Mount Panorama](https://lidarmag.com/2013/10/31/maptek-i-site-3d-technology-used-to-model-mount-panorama-race-circuit/) — Same laser-scan project from the LiDAR industry side, including how the scan data fed the sim track.
- [bsimracing: iRacing Bathurst Mount Panorama released](https://bsimracing.com/iracing-bathurst-mount-panorama-released) — Release news for the laser-scanned iRacing track; confirms the 1:6 grade exit of The Cutting and the distinct crests of Conrod Straight as features worth reproducing.
- [bsimracing: iRacing Bathurst laser scan previews](https://www.bsimracing.com/iracing-bathurst-laser-scan-previews/) — Preview screenshots of the scanned track that show asphalt patches, wall joints and kerb detail to copy.
- [ELVIS: Elevation Information System (Geoscience Australia)](https://elevation.fsdf.org.au/) — Free Australian LiDAR and DEM download portal; search the Bathurst area for a 1 m or 5 m DEM to derive real heights along the OSM centreline.
- [NSW Spatial Services portal](https://portal.spatial.nsw.gov.au/portal/apps/sites/#/homepage) — State spatial data portal with imagery and elevation layers for NSW; a source for authoritative heights and aerial imagery around Bathurst.
- [iRacing: Mount Panorama Circuit](https://www.iracing.com/tracks/mount-panorama-circuit/) — Official iRacing product page for the laser-scanned Mount Panorama; screenshots and layout details to compare against.
- [Sim Racing Wiki: Mount Panorama Circuit (iRacing)](https://simracing.wiki/Bathurst) — Community wiki entry listing iRacing layouts, length and notable corners.

## Other sim-racing and game versions of the track (8)

- [Traxion.gg: Mount Panorama ACC track guide](https://traxion.gg/watch-mount-panorama-assetto-corsa-competizione-track-guide/) — Video track guide write-up for Assetto Corsa Competizione's laser-scanned Bathurst.
- [WhichCar: ACC gets high-def Bathurst DLC](https://www.whichcar.com.au/news/assetto-corsa-competizione-finally-gets-high-def-bathurst-dlc) — Reports on the ACC Intercontinental GT Pack Bathurst and its scan-based fidelity.
- [Traxion.gg: Automobilista 2 historical pack includes 1983 Bathurst](https://traxion.gg/automobilista-2s-historical-track-pack-pt1-includes-estoril-bathurst-and-jerez/) — Notes the 1983 layout without The Chase, a handy reference for the pre-1987 geometry.
- [bsimracing: rFactor 2 Bathurst available](https://www.bsimracing.com/rfactor-2-bathurst-available/) — Release note for a laser-scanned Bathurst for rFactor 2 (free third-party-affiliate track).
- [Xbox Wire: Bringing Mount Panorama to Forza Motorsport 5](https://news.xbox.com/en-us/2013/10/11/games-forza-motorsport-5-mt-panorama/) — Developer Q&A on translating the circuit into a game, including what the team prioritised.
- [Traxion.gg: Forza Motorsport update brings back Bathurst](https://traxion.gg/australia-themed-forza-motorsport-update-brings-back-bathurst) — News on Mount Panorama arriving in current Forza Motorsport.
- [Forza Wiki: Mount Panorama Circuit](https://forza.fandom.com/wiki/Mount_Panorama_Circuit) — Which Forza titles include the track and their layout variants.
- [Traxion.gg: GT7 daily races, the many ways to climb Mount Panorama](https://traxion.gg/your-guide-to-gran-turismo-7s-daily-races-w-c-8th-may-the-many-ways-to-climb-mount-panorama/) — Gran Turismo 7 angle: light-pole braking cue for Hell Corner and sector split advice.

## Sector structure and lap timing (2)

- [Crash.net: V8 Supercar Bathurst qualifying times](https://www.crash.net/v8/results/103526/1/aussie-v8-qualifying-times-bathurst) — Example of qualifying times used to calibrate lap-time targets for a Supercars car on this track.
- [Supercars.com: 2024 Bathurst 1000 practice 1 report](https://www.supercars.com/news/2024-bathurst-1000-supercars-results-report-practice-1-matt-payne-fastest) — Gen3-era Bathurst 1000 practice 1 report with session times; use the times to sanity-check the pace of your Camaro and Mustang models.

## Video: track guides and lap breakdowns (13)

- [TENmotorsport: There's nothing like it, this is Mount Panorama (9:37)](https://www.youtube.com/watch?v=YGykmw1M_Y4) — Long-form cinematic piece with onboards and aerials of every section; use for camber, wall proximity and the scale of the mountain.
- [Sambo iRacing: Porsche Cup Bathurst guide (10:49)](https://www.youtube.com/watch?v=jHmn6Ln7N0Y) — Current iRacing corner-by-corner guide with braking markers and lines for each section.
- [Next Level Racing: Track guide, iRacing Supercars at Mt Panorama (2:33)](https://www.youtube.com/watch?v=xte9VRvQ_h8) — Short guide specific to the iRacing Supercars at Bathurst, the closest sim reference for Gen3-style lines.
- [Shawn McNamara: Bathurst Season 28 track guide (32:58)](https://www.youtube.com/watch?v=YJfMTbUtfZs) — Detailed iRacing season track guide; slow chapters to read braking and apex points per corner.
- [TraxionGG: How to be fast at Mount Panorama on ACC (10:00)](https://www.youtube.com/watch?v=asiaf1X0lCs) — ACC track guide with lines and references for the laser-scanned layout.
- [Unleashed Drivers: Bathurst lap guide ACC, 1:59.337 (6:48)](https://www.youtube.com/watch?v=ZMGSrbWZadg) — Lap guide on a quick GT3 lap with corner callouts.
- [Track Titan: How to be fast at Bathurst (8:21)](https://www.youtube.com/watch?v=zxNzuucN92Q) — Coaching video that explains the lap by section; pairs with the written guide.
- [OverTake: How to master Bathurst, Emree's ultimate track guide (10:11)](https://www.youtube.com/watch?v=UmQLUpyccCE) — Corner-by-corner guide by a sim racer with in-car footage.
- [Yorkie065: Bathurst in-depth track guide (18:22)](https://www.youtube.com/watch?v=xNnjoAV4TRA) — Long in-depth guide with commentary on each corner and common mistakes.
- [Digit Racing: Gran Turismo 7 Mount Panorama track guide (5:48)](https://www.youtube.com/watch?v=5f6oag1-Lyo) — GT7 guide showing how a console sim presents the corners and what cues players use.
- [Supercars: Greg Murphy guided lap of Mount Panorama (3:48)](https://www.youtube.com/watch?v=faz0o7k4zGQ) — Official onboard where a Bathurst champion narrates each corner; ideal for ordering and driving priorities.
- [Supercars: McLaughlin first 2:03 at Mount Panorama (3:14)](https://www.youtube.com/watch?v=1jHUjT02OhY) — Famous record-breaking onboard lap in a V8 Supercar; full lap view of line, speed and cockpit camera.
- [Supercars: Mostert's record 2:03.373 lap (3:14)](https://www.youtube.com/watch?v=OuLfT-lsz_8) — Official onboard of the record 2:03.373 qualifying lap from 2021 (Gen2 era); a full-lap view of line, speed and the cockpit camera.
