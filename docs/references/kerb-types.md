# Kerb contact data for item 3.8

The five inside kerb placements were checked against NSW Spatial Services aerial
images on 8 October 2026. The service does not establish millimetre heights, and
its image acquisition date was not returned. Widths and run lengths below are
approximate game values. They are not a survey or a verified modern sausage-kerb
inventory. This preserves the uncertainty recorded in circuit-facts.md.

Source service: [NSW Spatial Services best imagery](https://maps.six.nsw.gov.au/arcgis/rest/services/sixmaps/LPI_Imagery_Best/MapServer).
[NSW access and CC BY terms](https://www.nsw.gov.au/sandbox-and-archive/web-services-to-view-data).
[Current export API](https://maps.six.nsw.gov.au/arcgis/sdk/rest/02ss/02ss00000062000000.htm).
The frozen review includes the exact export URLs, downloaded image hashes and
five independently inspected images in references/aerial-manifest.json.

| Corner | Inside | Width policy | Profile | Reference observation and limit |
| --- | --- | --- | --- | --- |
| Hell Corner T1 | Left | 1.05 m before the existing barrier clamp | Flat | Red/white inside strip follows the apex; the current track's barrier clearance limits the apex width to 0.40 m. Height unmeasured. |
| Griffins Bend T2 | Right | 0.85 m | Flat | Narrow inside strip against the trees, with outside wall across the road. Width is approximate; height unmeasured. |
| McPhillamy Park T10 | Left | 1.05 m | Flat | Red/white inside edge and the opposite outside exit strip are visible. Height unmeasured. |
| The Chase T21 | Left | 2.00 m | Raised | Retains item 1.4's broad inside apron and existing 65 mm profile. Official 2024 pole onboard at 1:50 shows the inside painted kerb; neither image measures height. |
| Murray's Corner T23 | Left | 1.05 m | Flat | Inside strip wraps the left turn onto Pit Straight. Height unmeasured. |

For the Chase, the other source is [Supercars official 2024 pole onboard](https://www.youtube.com/watch?v=jMvou-SqwHc).
For Murray's, [Shane's 10 October 2014 photograph](https://commons.wikimedia.org/wiki/File:Murray%27s_Corner_Mount_Panorama.jpg)
(CC BY-SA 2.0) adds a ground-level view but is historical. These are placement
references, not height surveys. Local 2024 onboard frames from the existing
realism reference set were also inspected.

The profile estimates are 12 mm maximum for flat kerbs, joining the road without
a vertical step, and the pre-existing 65 mm road-side shoulder for raised kerbs.
The raised profile is a conservative existing profile, not a newly verified
large sausage kerb. Both lower toward the outside edge. Exact peak height needs
current ground-level footage or a survey before claiming real height acceptance.

`src/track/kerb-data.ts` records the five per-corner policies. `placeKerbs` applies
those policies to the existing line-based layout, clamps against barriers and
tapers the width once. The resulting width and type arrays feed both mesh and
wheel contact. The mesh includes the zero-width end cap so it covers the same
longitudinal interval used by interpolated contact. Existing automatic placement
is retained at other corners and outside exits, with the flat profile.

`kerbHeightAt` supplies wheel ground and the reset settle plane. `kerbCrossfallAt`
supplies lateral ground reaction from the same cross-section. The old generic
kerb sine bump is removed; other surfaces retain their existing bump behavior.

CPU tests compare seven real mesh samples across each of the five inside kerbs,
check actual surface classification, seam interpolation, taper/end caps, slope
and flat road-edge continuity, and drive an actual car across matched flat and
raised layouts. Existing AI, line-following, handling and control mappings are
unchanged. Browser/GPU visual and driving acceptance belongs to the root review.
