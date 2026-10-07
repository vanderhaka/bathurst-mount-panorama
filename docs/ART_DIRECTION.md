# Art direction — Mount Panorama (about 75 % of the way to photoreal)

## Target look

The target is about **75 / 100 on the Realism Index**: a game whose daylight,
materials, surface detail and Australian landscape read as the real place.
Medium-poly geometry may show at close range. Shape, metre-scale dimensions
and silhouettes take priority over adding polygons.

- Use physically based lighting and materials, sky-derived environment reflections,
  measured solar direction and restrained tone mapping. October race-day afternoon
  is the default; the graphics tuner can change the time live.
- Generated normal, roughness, colour and detail maps are allowed. No photographic
  textures or downloaded assets enter the runtime. Reference photographs are for review.
- Smooth terrain and car-body normals are allowed. Keep real hard edges at creases,
  kerbs and structural joints. Rocks and selected built objects may stay faceted.
- Procedural detail should appear at 5–50 m without obvious stretching or repetition.
  Whole-period noise and wrap-safe seams are required for tiling maps.
- Preserve one connected, rounded, ragged eucalyptus crown at every LOD. Small
  edge gaps are acceptable; separated parasol pads and spherical lollipops are not.
- Every feature has a per-tier switch in `QUALITY` and an appropriate tuner value.
  Expensive effects start on High; phone tiers prioritise stable frame time.

## Rules that stay

1. Organic and vehicle forms use lofts, extrusions or displaced meshes, not stacked
   boxes, capsules or spheres. Geometry must match the reference silhouette.
2. All visible asset classes share the quality bar: environment, props and cars.
3. Materials for instance-coloured meshes start white; never tint the palette twice.
4. Use real metres and the measured data in `docs/research/`: current car dimensions
   stay unchanged; walls about 1.1 m, fences 3–4 m and eucalypts 12–25 m.
5. No real brand logos or sponsor names. Preserve the three generated car shapes and
   their existing fictional liveries. References may depict real sponsor liveries.
6. Preserve the user-tuned handling, control mapping and `DEV_TOOLS` gating.

## Geometry and frame budgets

| Asset | Near (LOD0) | Far (LOD1) |
|---|---|---|
| Player car (exterior + interior) | ≤ 40k triangles | ≤ 6k triangles |
| Eucalyptus tree | 200–450 triangles | ≤ 60 triangles |
| Small prop (post, tyre stack, sign) | ≤ 300 triangles | — |
| Tent / car / caravan | ≤ 800 triangles | — |
| Unique structure (pit building, grandstand) | ≤ 15k triangles | — |

Target fewer than 250 draw calls in the race view. Appendix B of `docs/PLAN.md`
is the frame-rate contract: High at 1080p on an Apple M-series laptop ≥ 60 fps,
Medium on the user's iPhone ≥ 50 fps, and Low on an older phone ≥ 30 fps.
Phone emulation is a separate measurement and never proves an iPhone budget.

## Texture memory budgets

| Tier | Total resident texture / render-target budget | Detail maps | Livery atlas | Environment |
|---|---:|---:|---:|---:|
| Low | ≤ 64 MiB | ≤ 256² | ≤ 512² | ≤ 128² cube faces |
| Medium | ≤ 128 MiB | ≤ 512² | ≤ 1024² | ≤ 128² cube faces |
| High | ≤ 256 MiB | ≤ 1024² | ≤ 2048² | ≤ 256² cube faces |

Count mip chains, colour/depth attachments, multisample storage and shadow maps.
Reuse maps and atlases. Dispose replaced targets and unused textures. Texture memory
estimates must state their format/sample assumptions; renderer texture counts alone
are not memory measurements. These are ceilings, not allocations to fill.

## Palette

Keep the established greens and warm dry grass, pale clay and grey-green gums;
procedural material variation may refine them toward the photographs. Asphalt is
neutral dark grey, with a darker, smoother rubber groove. Kerb red/white and wall
concrete keep the existing palette, with generated wear and dirt.

## Three reference pairs: what 75 % means

Use the verified photographs and game captures in `docs/REALISM.md`:

| Pair | Match | May remain stylised |
|---|---|---|
| [Skyline game / real crest](references/REALISM-PAIRS.md#environment-pairs) | Dropping road, distant plain and haze, grey-green oval crowns, sky luminance | Medium-poly branch and distant-building geometry; generated leaf cards |
| [Hell Corner game / real track](references/REALISM-PAIRS.md#environment-pairs) | Rough aggregate, rubber and kerb wear, grounded walls, plausible sunlight | Small cracks and fictional wall panels; crowd faces at driving distance |
| [Camaro game / real Gen3 car](references/REALISM-PAIRS.md#car-pairs) | Body proportions, clearcoat glints, rubber/carbon/glass response and panel creases | Generated livery, bounded polygon count and simplified unseen engine components |

These pairs define a direction, not a claim that the baseline already reaches it.
The same references and fixed reviewer briefs measure later rounds.

## Verification

Capture before and after from a frozen preview, including the 15 Realism Index
viewpoints and the four performance points. Inspect close-ups and game-distance
screenshots. Keep photo-pair limitations visible. Generated maps must tile, effects
must respect the quality table, and real-device checks stay pending until observed.
