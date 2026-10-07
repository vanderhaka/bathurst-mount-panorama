# Mount Panorama (Bathurst) – circuit facts for an authentic track build

Compiled 2026-10-07. Complements the OSM centreline in `data/raw/osm-circuit.json`.

## Conventions and confidence tags

- **s (chainage)** = metres along the lap from the start of the OSM way "Pit Straight" (east end, Murray's exit), in race direction. Lap = 6,204 m in a flat local projection (OSM sum 6,198 m; official 6,213 m).
- **L / R** are always relative to the direction of travel (race direction, anti-clockwise seen from above).
- Tags: **[S]** published source (URL in Sources), **[OSM]** read directly from the Overpass pull, **[DEM]** derived from elevation data, **[DER]** derived by me from OSM geometry (curvature, wall offsets), **[EST]** estimate or inference, flagged as unverified.
- Data files: `data/raw/osm-features.json` (Overpass, `out geom;`), `data/raw/nsw-contour-crossings.json` (lap x NSW 2 m contours), `data/raw/elevation-profile.csv` (25 m profile, plus SRTM30 and Copernicus90 every 100 m as cross-checks).

---

## 1. Elevation

### Headline numbers
| Fact | Value | Basis |
|---|---|---|
| Vertical difference, highest to lowest point | **174 m** (571 ft) | [S] Wikipedia Mount Panorama Circuit |
| Published highest point | **862 m ASL, Sulman Park** | [S] Bathurst Regional Council "Track Facts" |
| Lowest point of the circuit | **Murray's Corner** (Pit Straight end) | [S] Wikipedia; [DEM] confirms (s ≈ 6165–6204) |
| Steepest grade | **1:6.13 (16.3 %)**; The Cutting exit "1 in 6" | [S] Wikipedia |
| Mount Panorama summit (hill, not track) | 881 m, OSM peak node (-33.45967, 149.54812) | [S] PeakVisor; [OSM] natural=peak |

**Datum discrepancy [DEM]:** three independent sources put the top plateau at about 870–876 m, not 862 m: NSW 2 m contours 872 m (s 2944–3055), SRTM30 max 875 m, Copernicus90 max 876 m. The lowest DEM values are 698–702 m at Murray's. DEM range is 172–177 m, which agrees with 174 m; the published absolute figures (862 / ~688) appear to be about 10 m low. **Recommendation:** model relative heights, Murray's = 0 m, top plateau = +172 to +174 m. Absolute ASL is cosmetic.

### Derived profile (NSW contours, cross-checked)
Method: lap centreline intersected with NSW Spatial Services contours (2 m interval, vertical accuracy class 5 m); linear interpolation between crossings. Cross-check at 100 m spacing: RMSE 3.2 m vs SRTM30, 6.1 m vs Copernicus90, mean bias +1.7 / +0.6 m.

| Section | s range | Elev start → end (m) | Net | Avg grade | Notes |
|---|---|---|---|---|---|
| Pit Straight | 0–447 | 702 → 711 | +9 | +2.0 % | gently uphill all the way |
| Hell Corner | 447–506 | 711 → 714 | +3 | +5 % | |
| Mountain Straight | 506–1561 | 714 → 766 | +52 | +4.9 % | steepens to ≈10–11 % in the last 100 m; grade flattens to a bench ≈ s 1180–1360 at ≈750 m (Wikipedia describes a crest "halfway up") |
| Griffins Bend | 1561–1766 | 766 → 790 | +24 | +11.8 % | steep, off-camber |
| The Cutting | 1766–2199 | 790 → 838 | +48 | +11.2 % | steepest uphill, ≈ +15 % near s 1870–1920 |
| Reid Park | 2199–2521 | 838 → 867 | +29 | +8.9 % | ≈ +13 % near s 2370 |
| Sulman Park | 2521–2879 | 867 → 870 | +3 | ≈ 0 | small dip then rise near s 2740–2840 |
| McPhillamy Park | 2879–3167 | 870 → 870 | 0 | 0 | **highest point ≈ 872 m at s ≈ 2950–3020** (crest before the blind turn-in) |
| Skyline approach | 3167–3384 | 870 → 865 | -5 | -2 % | crest then the drop starts at ≈ s 3385 |
| The Esses | 3384–3910 | 865 → 810 | -56 | -10.6 % | steepest downhill ≈ -16 % at the Dipper (s 3594–3645, 840 → 832 m) |
| Forrest's Elbow | 3910–4037 | 810 → 789 | -21 | -14.5 % | "severely downhill" [S] |
| Conrod Straight, part 1 | 4037–5279 | 789 → 721 | -68 | -5.5 % | first ≈ 350 m is ≈ -11 %; ≈ -6.5 % to s 4620 |
| The Chase | 5279–5737 | 721 → 717 | -4 | | hollow, see below |
| Conrod Straight, part 2 | 5737–6136 | 717 → 701 | -16 | -4.0 % | |
| Murray's Corner | 6136–6204 | 701 → 700 | -1 | | **lowest point ≈ 700 m** |

**Start/finish elevation [DEM]:** finish line (s ≈ 93) ≈ 705 m (SRTM30 706); standing-start line (s ≈ 244) ≈ 707 m; Murray's exit ≈ 702 m.

### Humps, crests and dips (Conrod, Chase, top) [DEM] unless noted
- **Conrod Straight is a roller-coaster with two distinct crests, the second rebuilt in 1987** [S] Wikipedia. In the profile: steep drop off Forrest's Elbow, a **dip ≈ 736 m at s ≈ 4650–4690**, **crest ≈ 740–741 m at s ≈ 4830–4870** (a rise of only ≈ 4–5 m over ≈ 150 m), then ≈ -6 % down to a **second crest ≈ 722 m at s ≈ 5247**, directly before the Chase kink (T20). The 2 m contours cannot resolve bumps smaller than ≈ 2 m, so real crests may be sharper than this. [EST] second crest = the one rebuilt in 1987.
- **The Chase sits in a hollow [S] sim-guide description "downhill then uphill"**: from the 722 m crest down to a **low of ≈ 710 m at s ≈ 5470–5530**, then climbing ≈ 8 m (≈ +4 %) to ≈ 718 m at s ≈ 5690 (T22 exit), then ≈ -4 % down to Murray's.
- **Skyline / Esses:** plateau 870 m → 865 m at the Skyline turn-in (s 3385) → plunge ≈ -12 to -14 % through the first three Esses corners → ≈ -16 % at the Dipper. Wikipedia: Skyline is named for the look "upwards at the corner from below".
- **McPhillamy:** crest at s ≈ 2980–3020 precedes the turn-in, making T10 blind [S] Wikipedia.
- **Pre-aero era:** drivers lifted for a crest halfway up the Mountain Straight [S] Wikipedia (citation-needed in source).

---

## 2. Track width, camber, banking

### Width
No published width figures found. Verified qualitative statements: "tight, narrow section across the top of the mountain" [S] Wikipedia; the summit section is "barely two lanes wide with concrete walls hard on both sides" [S] racetrackworld.com; Esses are "a narrow concrete chute" [S] tracknation.au.

**Wall-to-wall width [DER]** from OSM `barrier=wall` ways (min offset of each wall from the centreline per 10 m bin, left + right, only bins with both walls). Accuracy ±2–3 m; centreline not guaranteed to be centred.

| Section | Median wall-to-wall (m) | p10–p90 | Note |
|---|---|---|---|
| Pit Straight | 15.8 | 14.4–17.8 | left wall 5.7 m = pit wall, right barrier ≈ 10 m (grass verge widened 2013 [S]) |
| Mountain Straight | 17.2 | 14.5–27.5 | open gaps |
| Griffins Bend | 15.2 | 12.8–19.1 | |
| The Cutting | **10.8** | 10.2–12.0 | narrowest |
| Reid Park | 11.3 | 11.1–12.7 | |
| Sulman Park | 13.0 | 12.5–18.2 | |
| McPhillamy Park | 18.2 | 13.1–23.6 | outside open (sand trap) |
| Skyline approach | 12.8 | 10.6–23.9 | |
| The Esses | **11.2** | 10.3–22.4 | |
| Forrest's Elbow | 11.9 | 10.4–14.1 | |
| Conrod Straight (both parts) | 17.0 / 16.6 | 15.0–19.5 | |
| The Chase | 16.8 | 15.3–27.7 | large open runoff either side |

[EST] Paved width is probably 2–3 m less than wall-to-wall (edge line, kerb, verge): ≈ 8–9 m across the top (Cutting, Reid Park, Esses, Elbow), ≈ 12–14 m on the straights. Treat "narrow ≈ 8 m" as plausible for the narrowest points, but verify against reference imagery before locking numbers.

### Pit lane
OSM `Pit Lane` ways run on the **left (south)** of Pit Straight at 8–11 m from the centreline. Entry leaves Conrod at **s ≈ 6010** (-33.44123, 149.56086), exit merges onto the Mountain Straight at **s ≈ 622** (-33.44029, 149.55545), about 116 m after Hell Corner. Pit lane ≈ 816 m. [OSM][DER]

### Camber / surface character [S]
- Hell Corner: "helpful camber" (sidepodcast).
- **Griffins Bend: negatively cambered / off-camber**, exit camber pushes drivers to the outer wall (Wikipedia, Wikipedia Bathurst 1000, sidepodcast). Peter Brock: "extraordinarily steep" with significant camber (crash.net).
- The Cutting: a bump on the climb forces an early 2nd-to-3rd upshift (crash.net, Brock).
- Quarry Corner (T5): "the circuit briefly flattens at the apex" [S] Wikipedia.
- Sulman Park: metal drainage grate on the outside apron at the point of maximum load ("The Grate") [S] Wikipedia.
- **Forrest's Elbow: "severely downhill and adverse camber"**; line drifts to the outside wall on exit [S] Wikipedia.
- Dipper: originally a dip in the surface and a steep drop beside the road (now walled) [S] Wikipedia.
- Conrod: "prefer centre/left … to prevent car bouncing" [S] Brock (crash.net).
- Whole circuit was resurfaced between the 2013 and 2014 races [S] Wikipedia Bathurst 1000; new tarmac at turn 2 broke up in the 2014 race (lithgowmercury.com.au); resurfacing again budgeted 2024/25 [S] v8sleuth, speedcafe.

### Banking
No sourced banking at Murray's or The Chase (roads read as crowned/flat tarmac [EST]). Earth **banks/embankments** beside the road: Reid Park entry ("under bank entrance") and Skyline ("hard braking under right embankment") [S] Brock (crash.net); at McPhillamy an earth bank just off the outside was cut back ≈ 30 m before 1985 to make room for a sand trap and concrete wall [S] Wikipedia.

---

## 3. Corner list (23 turns)

**Turn numbering.** Hell Corner = T1 and Murray's = T23 are firm [S] Wikipedia Bathurst 1000. Curvature analysis of the OSM centreline [DER] finds exactly **23 corners**, and their order matches published descriptions: Esses = Skyline R, then L R **L(Dipper)** R L R, then L(Forrest's Elbow) [S] unique cars / sidepodcast; Hell Corner measures 89° (published ≈ 90°). OSM marshal posts 19.0, 20.0, 21.0, 22.0, 23.0 sit on my T19–T23 [OSM]. T7–T17 numbering is **medium confidence**; sim guides disagree (one labels "Turn 18" as the Dipper, but describes it as leading onto the longest straight, which is Forrest's Elbow). Use names in the UI if unsure. Radii are coarse because OSM nodes are hand-digitised (±30 %).

### Geometry [DER] + elevation [DEM]
| T | Name | Dir | s range | Apex lat, lon | Turn ° | Rmin / Rmed (m) | Elev (m) | Grade |
|---|---|---|---|---|---|---|---|---|
| 1 | Hell Corner | L | 440–505 | -33.43905, 149.55576 | 89 | 33 / 38 | 712 | +5 % |
| 2 | Griffins Bend | R | 1555–1715 | -33.44880, 149.55363 | 107 | 60 / 78 | 769 | +11 % |
| 3 | The Cutting (1st left) | L | 1965–2040 | -33.44782, 149.54981 | 42 | 68 / 132 | 814 | +10 % |
| 4 | The Cutting (2nd left) | L | 2060–2140 | -33.44810, 149.54872 | 112 | 32 / 38 | 826 | +14 % |
| 5 | Quarry Corner | R | 2205–2280 | -33.44932, 149.54950 | 43 | 89 / 95 | 842 | +6 % |
| 6 | Reid Park (loaded right) | R | 2385–2460 | -33.45075, 149.54917 | 50 | 73 / 85 | 857 | +12 % |
| 7 | Reid Park (open left) | L | 2500–2535 | -33.45119, 149.54830 | 16 | 129 / 147 | 867 | +7 % |
| 8 | Sulman Park (1st) | L | 2650–2685 | -33.45215, 149.54718 | 16 | 126 / 138 | 870 | -1 % |
| 9 | Sulman Park (the Grate) | L | 2760–2860 | -33.45326, 149.54676 | 45 | 114 / 136 | 869 | +2 % |
| 10 | McPhillamy Park | L | 3035–3150 | -33.45564, 149.54876 | 52 | 91 / 142 | 870 | -2 % |
| 11 | Brock's Skyline | R | 3385–3430 | -33.45575, 149.55177 | 27 | 85 / 106 | 862 | -12 % |
| 12 | Esses 1 | L | 3450–3505 | -33.45602, 149.55239 | 41 | 66 / 77 | 854 | -14 % |
| 13 | Esses 2 | R | 3520–3590 | -33.45599, 149.55308 | 76 | 42 / 63 | 848 | -12 % |
| 14 | **The Dipper** | L | 3600–3640 | -33.45648, 149.55359 | 69 | **28** / 43 | 837 | -16 % |
| 15 | Esses 4 | R | 3650–3695 | -33.45656, 149.55417 | 43 | 48 / 64 | 828 | -12 % |
| 16 | Esses 5 | L | 3765–3800 | -33.45723, 149.55510 | 18 | 106 / 119 | 816 | -10 % |
| 17 | Esses 6 | R | 3835–3890 | -33.45752, 149.55583 | 37 | 71 / 92 | 811 | -6 % |
| 18 | Forrest's Elbow | L | 3945–4030 | -33.45842, 149.55664 | 120 | 31 / 38 | 795 | -14 % |
| 19 | Conrod kink | L | 4200–4230 | -33.45681, 149.55799 | 13 | 143 / 158 | 768 | -11 % |
| 20 | The Chase kink | R | 5315–5345 | -33.44692, 149.55986 | 13 | 143 / 170 | 720 | -3 % |
| 21 | The Chase (tight left) | L | 5580–5635 | -33.44462, 149.56107 | 68 | 33 / 50 | 716 | +4 % |
| 22 | The Chase exit | R | 5660–5745 | -33.44381, 149.56044 | 50 | 84 / 101 | 718 | -1 % |
| 23 | Murray's Corner | L | 6150–6200 | -33.43977, 149.56108 | 73 (≈ 90 published) | 28 / 36 | 700 | -1 % |

OSM also carries corner name nodes that agree: The Dipper (-33.45652, 149.55367, s 3624), The Esses (-33.45599, 149.55293), Forrest's Elbow (-33.45842, 149.55658), The Chase (-33.44653, 149.56006), Murray's Corner (-33.43975, 149.56107) [OSM].

### Character, speed and what is on the outside
Outside of a left-hander = right side, and vice versa. Wall/fence/sand data is [OSM] (offsets from centreline); speeds and incidents are [S].

| T | Character and speed [S] | Outside / runoff (and inside) |
|---|---|---|
| 1 Hell | 90° left, approached at 200+ km/h in 4th, braking to 2nd (uniquecars). Name from a tree stump. | **Sand trap** on the outside R (OSM polygon s 485–536, 8–27 m off, 656 m²), extended 2018 [S speedcafe]; wall ≈ 20 m behind, fence ≈ 17 m. Inside L wall ≈ 7.7 m (64 % coverage). Grandstand 12 at 46 m R, Marshal Point 1.0. |
| 2 Griffins | Uphill, tightening right, braking from ≈ 250 to 160 km/h (Brock); off-camber exit; thick growth on the inside obscures sightlines (RaceTorque). | Concrete wall both sides (8.4 m out, 7.6 m in). **Tyre barrier** at "Corner 2" slated for renewal (speedcafe). Boardwalk begins here. Houses ≈ 100 m L. |
| 3–4 Cutting | Pair of lefts, second nearly a hairpin; blind; Cutting exit 1 in 6; 180–190 km/h entry (Brock). Road cut through rock. | **Concrete walls both sides at ≈ 5–6 m**, "funnel effect" (Motor Sport). Houses at 22–48 m on the right (north side), scrub polygon 5 m R. |
| 5 Quarry | Right-hander right after the Cutting; flattens at the apex. | Outside L: concrete wall (5.3 m); quarry below the outside wall; wall installed 1979, before that railway sleepers and fence posts (Wikipedia). |
| 6–7 Reid Park | Loaded right, then open left; embankment at entry. | Walls 5–6 m both sides; from T7 a **catch fence** runs behind the right-hand wall (OSM fence 12–15 m R, ≈ 100 % of Reid Park–Sulman). Scrub polygon 6 m L. Walls took heavy hits (Bartlett 1982, Bright 2014). |
| 8–9 Sulman | Rising left sweep; metal grate on outside apron. | Wall 6–8 m + catch fence R (≈ 14 m). Reid Sulman Campground 26 m R. |
| 10 McPhillamy | Fast downhill left, blind over crest, ≈ 200 km/h, "virtually flat in 4th" (uniquecars). Inside kerb is a clip risk. | **Large sand trap** on the outside R in front of the campers (OSM s 3083–3265, 7–38 m off, 3,836 m²) plus concrete retaining wall and catch fence ≈ 24 m; sand trap enlarged over time (Wikipedia). Inside L wall 6.4 m. |
| 11 Skyline | Short straight from McPhillamy; sharply descending right over a blind crest; enter at ≈ 220 km/h (Wikipedia). | Walls 5.0 m (L) / 6.3 m (R). A barrier at the top was shortened by 6 m in 2018 (speedcafe). Boardwalk lookout 6 m off the road. "Control Tower" 15 m R. |
| 12–17 Esses | Narrow concrete chute: L R **L(Dipper)** R L R; second gear through the Esses (uniquecars). Inside wheels lift at the Dipper. No verified corner speeds. | Walls 4.5–7.5 m both sides; catch fence R at 14–22 m. **Inside of T12 (L) was a deep gravel trap since 1980, now sealed with kerb, grass strip and paved** [S crash.net] (OSM: no wall on L at s 3450–3510). **Dipper: two rows of tyres under a rubber belt in front of the concrete wall on the outside (R), added 2017** [S supercars.com]; **catch fence above the Dipper** [S RaceTorque]. Dense bush/wood polygons 4–5 m from the road at s ≈ 3680–3800. |
| 18 Forrest's | Tight descending left, ≈ 120°, second gear; leads onto Conrod. | Outside R wall 6.6 m, line drifts to it; **tyre barrier/wall** on exit (Johnson 1983, Lowndes 2001); grove of trees beyond (Johnson 1983). Bathurst Light Car Club 30 m L. |
| 19 Conrod kink | Flat-out left, ≈ 13°. | Walls 7–8 m both sides. |
| 20 Chase kink | "Fastest corner in touring car racing", cars at ≈ 290–300 km/h at entry (Wikipedia). | **Big sand trap on the outside L** (OSM s 5360–5676, 8–67 m off, 10,238 m²) with tyre wall at its end (Watson 1994); concrete barrier added 2013. Walls both sides ≈ 8–10 m. Chase tunnel (Ray Bant Dr) passes under the road here. |
| 21 Chase left | Sharp left ≈ 120 km/h (Wikipedia); hollow, uphill exit. | **Gravel trap on the outside R** (s 5613–5795, 21–129 m, 7,120 m²) behind a **tyre wall with conveyor-belt front, in front of Rydges hotel**; a gap cut through the barrier at the gravel exit (speedcafe 2018). Inside largely open. |
| 22 Chase exit | Right-hander back onto Conrod. | Outside L sand (s 5687–5886, 3,863 m²) then a further sand strip on L (s 5945–6116, 2,039 m²). |
| 23 Murray's | 90° left, hard braking, overtaking spot; slowest point per Wikipedia Bathurst 1000. | **Large outside sand/gravel trap R** (OSM 1,562 m² straddling the Pit Straight start, up to 72 m deep), shortened by 20 m in 2018 (speedcafe). Wall R 11.7 m, fence R ≈ 24 m. Museum 58–73 m beyond. |

Corner speeds also [S]: Mountain Straight ≈ 255 km/h (Wikipedia Bathurst 1000; some sources claim 290, uncited); Conrod up to ≈ 300 km/h; Chase exit ≈ 130 km/h.

---

## 4. Barriers and runoff

### General [S]
- "Concrete barriers put alongside the entire perimeter"; runoff increased where possible, **gravel traps where not** (racingcircuits.info). US-style concrete walls lining the circuit since 1987; gravel traps at McPhillamy and The Chase (Motor Sport 2001).
- 2013: 850 m of concrete barrier along Pit Straight and The Chase, 570 m of debris fencing and 670 m of spectator fencing on Pit Straight, FIA debris fence, grass verge widened on the right (supercars.com, speedcafe).
- **SAFER barriers: none installed as of Feb 2014**; Jason Bright asked for ≈ 3–4 × 50 m sections at Reid Park, outside lines and below Skyline (speedcafe). No later installation confirmed. [OSM mapping does not show them.]
- 2024/25 council plans: $7.65 m resurfacing, $1.7 m tyre-wall renewal, $1 m Conrod tunnel approaches, $150 k debris/fauna fencing (speedcafe, v8sleuth).

### Concrete wall coverage along the lap [OSM + DER]
`barrier=wall` ways lie 4–10 m from the centreline almost all the way round. Percent of 10 m bins with a wall within 15 m; median offset in brackets. (L/R = left/right of travel.)

| Section | L wall | R wall |
|---|---|---|
| Pit Straight | 93 % (5.7 m, pit wall) | 93 % (10.3 m) |
| Hell Corner | 71 % | **43 %** (sand trap) |
| Mountain Straight | **63 %** (gap s ≈ 490–900: pit exit merge, Paddock access) | 98 % (7.9 m) |
| Griffins Bend → Forrest's Elbow | ≈ 100 % (5–8 m) except Skyline-end/Esses gaps below | ≈ 100 % except McPhillamy |
| McPhillamy | 100 % | **70 %** (sand trap, s 3090–3260) |
| Skyline approach | 100 % | **57 %** |
| The Esses | 89 % (gap s 3450–3510, sealed gravel trap) | 100 % |
| Conrod part 1 | 100 % (8.1 m) | 99 % (8.6 m) |
| The Chase | **28 %** | **72 %** |
| Conrod part 2 | 49 % | 90 % |
| Murray's | **0 %** | 50 % |

Gaps (no wall within 15 m): L s 490–900, 3450–3510, 5360–5710, 5930–6210; R s 470–520, 3090–3260, 5610–5770, 6170–6210. OSM does not record material, so some "wall" ways may be retaining walls rather than concrete barriers [EST].

### Fences [OSM]
- Right-hand fence 12–24 m off the centreline along Reid Park → Forrest's Elbow (≈ 100 % at Reid, Sulman, Esses; 77 % McPhillamy/Elbow; 61 % Skyline) = catch fence behind the wall.
- Pit Straight: right-hand fence ≈ 15 m (debris/spectator fencing).
- No fence mapped on Conrod part 1 or the Chase; the Mountain Straight has fauna fencing near 196 Mountain Straight (Council fauna strategy, 2011) [S].

### Sand/gravel traps [OSM natural=sand, 8 polygons; plus 3 `shingle` polygons]
| id | Where | Side | s range | Offset (m) | Area (m²) |
|---|---|---|---|---|---|
| w145671930 | Murray's exit / Pit Straight start | R | ≈ 3–45 | 8–72 | 1,562 |
| w145671950 | Murray's, pit-entry side | L | ≈ 6150–6173 | 10–33 | 818 |
| w145671934 | Hell Corner exit | R | 485–536 | 8–27 | 656 |
| w145671941 | McPhillamy Park | R | 3083–3265 | 7–38 | 3,836 |
| w145671955 | Chase kink / T20 outside | L | 5360–5676 | 8–67 | 10,238 |
| w145671936 | Chase T21 outside (Rydges side) | R | 5613–5795 | 21–129 | 7,120 |
| w145671953 | After T22 | L | 5687–5886 | 8–38 | 3,863 |
| w145671940 | Conrod part 2 | L | 5945–6116 | 12–28 | 2,039 |

(`shingle` w1356187759/60/63 at The Cutting are 74–139 m off the road on the R, 455–863 m²: quarry area, not trackside.)

### Tyre walls (not in OSM) [S]
Dipper outside (2017); The Chase right side in front of Rydges, conveyor-belt cover (2013/2018); Griffins Bend "Corner 2"; Forrest's Elbow exit; Chase kink sand-trap end (Watson 1994 crash).

---

## 5. Kerbs

**No source found for kerb colours or kerb type per corner.** What is sourced:
- "Painted saw-toothed curbs and advertising billboards" along the street-circuit layout [S] Yahoo Autos.
- McPhillamy has inside kerbing that can be clipped [S] Wikipedia; the sealed inside of the Esses has kerbing, a grass strip behind it, then sealing [S] crash.net.
- 2025 funding promise includes "kerb replacements" [S] search summary; no detail.
- **Red/white colours and which corners have large "sausage" kerbs: unverified.** [EST] Use low red/white sawtooth at inside apices (T1, T2, T4, T10, Esses insides, T18, T21, T23) as a default, and confirm from onboard footage or street imagery.

---

## 6. Landmarks

Coordinates are WGS84 centroids from the Overpass pull unless marked.

| Landmark | lat, lon | s, side, offset | Source/notes |
|---|---|---|---|
| **Finish line** | -33.43949, 149.55984 | s 93 | [OSM node]; pit bays all lie after it [S Wikipedia] |
| **Standing-start line** | -33.43927, 149.55824 | s 244 | [OSM node]; 151 m from finish vs 143 m official [S] |
| **Pit / race control complex** | -33.43959, 149.55816 | s 100–407, L 20–45 m | [OSM] unnamed building, 5,293 m², ≈ 306 m long. 36 pit bays each 15 × 8 m, control tower, media centre (2004, $24 m) [S crash.net, racingcircuits.info] |
| Pit entry / exit | -33.44123, 149.56086 / -33.44029, 149.55545 | s 6010 / 622 | [OSM] Pit Lane ways |
| **Pit Straight footbridge** over the finish line | -33.43937, 149.55982 → -33.43982, 149.55973 | s ≈ 98, crosses, steps both ends | [OSM] private footway; "pedestrian bridge above the finish line" used for fireworks [S RaceTorque]; "luridly sponsored footbridge" [S Yahoo]; lift added 2013 [S supercars.com] |
| Grandstands (Pit Straight, north side R) | -33.43927, 149.56068 (T1); -33.43912, 149.55932 (T7); **-33.43904, 149.55866 (Grandstand 8, permanent, semi-covered, 488 m²)**; -33.43886, 149.55754 (T10, 1,475 m²) | s 42–316, R 23–37 m | [OSM] |
| Hell Corner grandstands | -33.43936, 149.55506 (#12); -33.43947, 149.55605 (corporate, L) | s 507–548 | [OSM] temporary |
| Start lights gantry | not found | | no source; [EST] temporary overhead rig on the grid |
| Chase tunnel (Ray Bant Dr) | -33.44696, 149.56000 | s ≈ 5328, max height 3.1 m | [OSM tunnel=yes]; "tunnel under the entry to the Chase" [S RaceTorque]; pit complex reachable via it [S Council FAQ] |
| Conrod footbridge | -33.44225, 149.56048 → -33.44230, 149.56085 | s ≈ 5893, 34 m, crosses | [OSM] private; role unverified (Wikipedia mentions a "spectator bridge" near the Chase crest, which does not match this s) |
| Advertising/pedestrian bridge over Mountain Straight near Hell Corner | not in OSM | | **not verified**; only stair fragments near Hell Corner (s 480–499, one side) |
| **National Motor Racing Museum** | -33.44004, 149.56188 | s 6152, R 58–73 m, 2,774 m² | [OSM] Murray's Corner |
| Peter Brock statue / Winners Plaques | -33.43944, 149.56216 / -33.43949, 149.56219 | R 106 m | [OSM]; statue outside the museum [S Wikipedia] |
| Rydges Mount Panorama (4 levels) | -33.44268, 149.56137 | s 5953, R 31 m | [OSM]; 129 rooms, opened 2006 [S racingcircuits.info] |
| Bathurst Light Car Club | -33.45721, 149.55721 | s 4138, L 30–44 m | [OSM]; boardwalk (1.7 km, Griffins Bend → here) [S Council FAQ] |
| Brock's Skyline node / "Control Tower" (2 levels) | -33.45571, 149.55149 / -33.45588, 149.55134 | s 3363–3384 | [OSM] |
| **"Mount Panorama" stone sign** | centre -33.45514, 149.55185 | L ≈ 40–70 m of Skyline/Esses start | [OSM relation r11770469]: 20 member ways, white stone, ≈ 165 × 85 m |
| McPhillamy Park Lookout / boardwalk viewpoint | -33.45620, 149.55097 / -33.45558, 149.55073 | R 55 m | [OSM] |
| Mount Panorama summit | -33.45967, 149.54812 | 452 m R of the track | [OSM] 881 m |
| Comms/TV lattice towers | -33.45014, 149.54759; -33.45044, 149.54716 (SBS/ABC/Telstra); -33.45004, 149.54705 (Optus/Vodafone/NBN); -33.45095, 149.54507 | s 2510–2670, R 130–240 m | [OSM] near Reid/Sulman |
| Campgrounds | Paddock -33.44208, 149.55657 (408 pitches, 26 m L of Mountain Straight); Max Cameron ≈ -33.43636, 149.55507 (≈ 230 pitches over A/B/C, 145 m R of Hell Corner); Reid Sulman -33.45098, 149.54513 (47+); McPhillamy -33.45679, 149.54814 + A/B (≈ 130+); Enduro -33.44877, 149.56152 (361); Chase/Orchard -33.44476, 149.56354 etc. | | [OSM] 1,304 `camp_pitch` nodes mapped |
| Houses on/near the circuit | Mountain Straight 3 (s 1079–1235); Cutting 6 (right, 22–113 m); Conrod 12 (s 4292–5176, both sides at 15–109 m) | | [OSM] 22 houses ≤ 120 m; "about 40 houses, a winery, a gun club" [S Yahoo]; "residences accessible only from the circuit" [S Wikipedia] |
| The Mount Restaurant / vineyards | -33.44870, 149.55452 (62 m L, s 1552); vineyards 20–96 m L at s 1236–1352 | | [OSM] |
| Summerset Orchard (fig, pear) | -33.45233, 149.55734 | s 4579, L 11 m | [OSM] on Conrod |
| 8 temporary Supercars big screens | e.g. -33.44286, 149.56028; -33.44612, 149.56086; -33.43959, 149.55878 | | [OSM man_made=video_wall] |
| Marshal posts (34 in OSM) | one every ≈ 100–300 m; numbered 1.0 (Hell) → 23.0 (Murray's) | | [OSM] posts sit 5–12 m from the road, mostly on the outside |

---

## 7. Overpass pull (within 2 km of -33.447, 149.557)

File: `data/raw/osm-features.json`, 9.5 MB, `out geom;`, base timestamp 2026-10-07T02:51Z. Query was `nwr` filters on building, barrier, natural, landuse, man_made, bridge, leisure, tourism, amenity, highway∈{footway,path,steps,track,service,cycleway}, and any `name`. A second small query (tunnel, width, advertising, traffic_calming, memorial, historic, emergency) was analysed but not saved.

**3,293 elements** (2,979 ways, 285 nodes, 29 relations); 1,620 carry a name.

| Key | Count | Breakdown |
|---|---|---|
| building | 358 | yes 249, house 54, school 16, roof 10, shed 10, service 7, **grandstand 6**, college 3, hotel/kindergarten/garage 1 each |
| barrier | 210 | gate 70, **wall 69**, **fence 54**, hedge 7, entrance 3, bollard 3, cattle_grid 3 |
| natural | 173 | tree 97, water 18, shrub 12, tree_row 12, **wood 10**, grassland 9, **sand 8**, scrub 3, shingle 3, peak 1 |
| landuse | 35 | grass 14, residential 4, industrial 4, recreation_ground 3, farmland 2, **vineyard 2**, meadow 2, orchard 1, landfill 1 |
| man_made | 44 | storage_tank 16, **video_wall 8**, water_tap 7, surveillance 6, **tower 5**, antenna 1 |
| bridge | 24 | yes 20 (incl. 2 over the circuit), boardwalk 4 |
| tourism | 1,333 | camp_pitch 1,304, camp_site 18, viewpoint 4, attraction 2, museum 2, hotel/motel/caravan_site |
| amenity | 155 | parking 47, shelter 38 (34 are marshal posts), toilets 31, shower 12 |
| leisure | 46 | pitch 23, park 6, playground 5, track 2, nature_reserve 1 |
| highway | | service 578, footway 172, track 70, residential 62, steps 28 |

Vegetation polygons near the track [OSM]: `wood` at the Esses on both sides (w276427146, 36 pts, 5 m R at s ≈ 3680; w276427144, 41 pts, 4 m L at s ≈ 3765), Conrod start (w306191958, 12 m R), plus others 100–150 m off; `scrub` at The Cutting (w276427209, 5 m R) and Reid Park (w276427141, 6 m L); `grassland` at McPhillamy/Skyline/Esses on the left (r4085204, 7 m L, plus six small patches 44–91 m L). 97 single `natural=tree` nodes: lines of single trees 17–28 m off the Mountain Straight (right side), trees along Conrod right side near s 5190–5260 (10 nodes, 11–27 m).

Named features with centroids are in Section 6. Other named items: Max Cameron / Paddock / Reid Sulman / McPhillamy / Chase / Orchard / Enduro campgrounds, Police Compound (-33.45423, 149.54677), Paddock Security (-33.44144, 149.55578), Fuel Bunker (-33.44110, 149.56001), Mountain Shuttle Bus stops (-33.43854, 149.55890; -33.45091, 149.54778), Boundary Road Reserve (-33.43049, 149.55076), Wahluu Mount Panorama Site (landuse=aboriginal_lands, -33.45945, 149.54824), "see kangaroos here" viewpoint (-33.43302, 149.55229).

---

## 8. Visual character (art direction)

### Facts [S]
- Vegetation across most of the precinct is **White Box – Yellow Box – Blakely's Red Gum Woodland and Tablelands Basalt Forest** (both Endangered Ecological Communities); groundcover moderate to very dense, **dominated by perennial native grasses**; weeds include Phalaris, Paspalidium, saffron thistle, serrated tussock; exotic hawthorn and blackberry in the woodland (Council Fauna Management Strategy, May 2012). Green grass was available even in August after severe frosts. Boundary Road Reserve nearby: Yellow Box / Blakely's Red Gum grassy woodland.
- Wildlife: Eastern Grey Kangaroo (dominant), Common Wallaroo, Red-necked and Swamp Wallaby, wombat, koala, emu; they move to open grassy woodland to graze in the late afternoon (same strategy). Kangaroos on track caused incidents in 2004, 2005, 2007, 2010.
- Mountain Straight: residential driveways, "alternating sunlight and tree shade" (Motor Sport 2001). Venue feel: "painted saw-toothed curbs and advertising billboards", sponsored footbridge, warm still mornings with birdsong (Yahoo Autos).
- October weather, Bathurst NSW: average high 19 °C, low 7 °C, 61.8 mm rain, 6 rainy days, 231 sunshine hours (weatherapi.com). Rain or fog descending on the mountain has slowed or stopped races (RaceTorque).

### Light on an October race day [DER, computed, geometric, 11 Oct 2026, AEDT]
Sunrise ≈ 06:30, sunset ≈ 19:10. Sun elevation/azimuth: 11:00 → 53° / NE (50°); 13:00 → 63° / due north (354°); 15:00 → 50° / WNW (304°); 17:00 → 26° / W (280°); 18:00 → 14° / W. Note the Pit Straight runs east to west: late afternoon sun is **directly in the drivers' eyes on the Pit Straight**, shadows fall east. Midday sun is high and due north, so it is ahead of cars running up Conrod.

### Estimates (not sourced; confirm against photos) [EST]
- Spring grass: fresh green with olive-straw patches (native tussock plus dried weeds); darker green under trees; brown/ochre bare patches in campgrounds and runoff.
- Trees: grey-green to blue-green eucalypt canopy (box and red gum; basalt-forest gums such as ribbon gum are likely but not verified), rounded crowns, rough-barked boxes; some scattered pines and exotic windbreaks near houses; dense scrub at Cutting/Reid/Esses; hawthorn/blackberry thickets at the edges.
- Soil/rock: basalt-influenced "tablelands basalt" suggests dark brown to red-brown soil and grey rock in the Cutting face; sand traps are pale tan.
- Sky: crisp spring blue with fast cumulus; cool, clean light; frost-pale grass in the morning.

### What the driver sees, by section [DER/DEM + S, descriptive]
- **Pit Straight (702–711 m):** Wide, flat, uphill grandstands on the right, long pit complex and pit wall on the left, footbridge across the finish line, then Hell Corner at the base of the mountain with grassy paddocks behind the fence.
- **Hell Corner / Mountain Straight:** Sand run-off on the outside, then a long, straight, climbing run between concrete walls; houses, driveways, vineyards and individual trees on both sides; the whole mountain looms ahead. Subtle benches in the grade around two-thirds up.
- **Griffins Bend / The Cutting:** A sweeping off-camber right at the top of the straight into a rock-walled left with concrete walls just 5 m away; steep climb, scrub on the right, houses above.
- **Reid Park / Sulman Park:** Climbing through open woodland and grass, concrete walls with catch fence behind, campgrounds and lattice comms towers to the right, embankments at the entries.
- **McPhillamy Park:** Open grassy hilltop, camping and crowds on the outside beyond the sand trap, blind crest, then Skyline's right-hander as the road drops away with the Bathurst plain below.
- **Skyline → Esses → Dipper → Forrest's Elbow:** Narrow concrete chute descending 50+ m, walls on both sides, catch fence above, bush on the inside; steepest section of the lap; the Mount Panorama stone sign on the slope to the left near the start.
- **Conrod Straight:** Long, wide, undulating descent between concrete walls, orchard and houses to the left, trees and Enduro camping to the right, a hump ≈ 800 m after Forrest's Elbow, then a crest and the Chase tunnel at the bottom.
- **The Chase:** Hollow with large sand/gravel runoff and tyre wall, Rydges hotel behind on the right, then a climb and the run down to Murray's with the museum and Peter Brock statue on the outside.

---

## 9. Open items

1. Official turn numbers T7–T17 (see Section 3 note).
2. Kerb colours/types, SAFER barrier status since 2014, and current tyre-wall layout.
3. Real paved widths; my wall-to-wall values are derived.
4. Whether bridges exist over the Mountain Straight near Hell Corner and over the Chase kink (none mapped in OSM).
5. Start-lights gantry details.
6. Absolute elevation (862 m published vs ≈ 872 m DEM).

---

## Sources (all URLs were opened or returned by search in this session)

- https://en.wikipedia.org/wiki/Mount_Panorama_Circuit
- https://en.wikipedia.org/wiki/Bathurst_1000
- https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/About-the-Mount/Track-Facts
- https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/About-the-Mount/The-Circuit
- https://www.bathurst.nsw.gov.au/Services/Facilities/Mount-Panorama/Freqently-Asked-Questions
- https://www.bathurst.nsw.gov.au/files/assets/public/v/1/council/plans-policies/mount-panorama-fauna-management-strategy.pdf
- https://www.supercars.com/news/supercars-news-2025-bathurst-1000-corner-names-mount-panorama-explained
- https://www.supercars.com/news/safety-upgrades-boost-mount-panorama
- https://www.supercars.com:443/news/championship/new-bathurst-barrier-installed
- https://www.lithgowmercury.com.au/story/2619409/resurfaced-track-derided-after-bathurst-1000-suspended (search result summary only)
- https://www.v8sleuth.com.au/how-bathursts-corners-got-their-names/
- https://www.v8sleuth.com.au/mount-panorama-set-for-full-track-resurfacing/
- https://www.uniquecarsandparts.com/bathurst_circuit.htm
- https://sidepodcast.com/post/track-back-mount-panorama-in-bathurst
- https://www.crash.net/v8/news/103633/1/peter-brocks-lap-of-mount-panorama-bathurst
- https://www.crash.net/v8/news/153293/1/safer-esses-gain-approval-ahead-of-bathurst
- https://www.crash.net/v8/news/104357/1/added-appeal-to-bathurst-paddock-pass
- https://www.motorsportmagazine.com/archive/article/february-2001/50/track-test-bathurst/
- https://autos.yahoo.com/ve-mountaintop-191100584.html
- https://www.theracetorque.com/2024/10/bathurst-1000-mega-notebook/
- https://www.theracetorque.com/2023/10/bathurst-1000-marshals-eye-view/
- https://speedcafe.com/?p=421211 (2018 track changes) and https://speedcafe.com/?p=186755 (2013 upgrades)
- https://speedcafe.com/bright-calls-safer-barriers-bathurst/ and https://speedcafe.com/mount-panorama-set-for-full-resurface/
- https://www.racingcircuits.info/australasia/australia/bathurst-mount-panorama.html
- https://racetrackworld.com/australasia-race-tracks/australia-race-tracks/bathurst-mount-panorama-circuit/
- https://tracknation.au/blogs/welcome-to-tracknation/mt-panorama-circuit-map
- https://steamcommunity.com/sharedfiles/filedetails/?id=1991171144 and https://www.virtualracecarengineer.com/bathurst-mt-panorama-setup-guide/ (sim guides, turn numbering)
- https://peakvisor.com/peak/mount-panorama.html
- https://www.bathurstregion.com.au/discover-boundary-road-reserve/
- https://www.weatherapi.com/history/october/q/bathurst-128097
- Data: https://overpass-api.de/api/interpreter; https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme/MapServer/2 (contours); https://api.opentopodata.org/v1/srtm30m; https://api.open-meteo.com/v1/elevation
- Excluded as irrelevant: the ForestrySA "Mount Panorama NFR" plan (South Australia, a different hill).
