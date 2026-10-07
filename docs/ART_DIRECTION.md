# Art direction — Mount Panorama (medium poly)

## Target look
- **Medium poly**: clean faceted forms with enough segments to read curves correctly. It is NOT low-poly cartoon (no 6-sided wheels, no boxy cars). It is NOT photoreal (no photo textures, no normal maps).
- **Shape first**: the silhouette must be right. Real proportions, real dimensions (metres), real details at the size a player sees at 5–30 m.
- **Colour from vertex colours** and a small shared palette (`src/art/palette.ts`). Textures only where geometry cannot do the job: asphalt grain, text/numbers, screens, livery graphics, catch-fence mesh.
- **Lighting**: October afternoon at Bathurst. Warm sun from the north-west (~38° high), soft sky fill, light haze. Same lighting in harness and game (`src/world/lighting.ts`, `src/world/sky.ts`). ACES tone mapping.
- **Shading**: `flatShading: true` for terrain, foliage, rocks, buildings. Car body may use smooth normals with hard edges at real creases (split normals) so paint reflections read as a car.

## Hard rules
1. Never build organic or vehicle forms from stacked primitives (boxes, capsules, spheres). Use lofted cross-sections, extrusions, or displaced meshes. A primitive-built car or tree fails review.
2. Every asset class in view must meet the same bar: environment, props AND cars.
3. When a mesh uses instance colours, its material colour is white. Never multiply a palette colour twice.
4. Real-world scale: a Gen3 Supercar is 4.97 m long and 1.2 m high. A concrete wall is ~1.1 m high; catch fence ~3–4 m; a eucalyptus 12–25 m.
5. No real brand logos or sponsor names. Car shapes may resemble the Camaro ZL1 and Mustang GT; liveries and text are generic.
6. Procedural canvas textures must tile: use periodic noise (frequencies that are whole multiples of 2π/size).

## Budgets (triangles)
| Asset | Near (LOD0) | Far (LOD1) |
|---|---|---|
| Player car (exterior + interior) | ≤ 40k | ≤ 6k (ghost / far) |
| Eucalyptus tree | 200–450 | ≤ 60 |
| Small prop (post, tyre stack, sign) | ≤ 300 | — |
| Tent / car / caravan | ≤ 800 | — |
| Unique structure (pit building, grandstand) | ≤ 15k | — |

Draw calls in the race view: target < 250. Frame time target: 60 fps at 1080p on an Apple M-series laptop with quality `high`.

## Palette summary
- Grass `#7f9a47` (light `#9bb05a`, dry `#b2a865`); clay `#a06c45`; gravel `#bfab8c`.
- Eucalyptus crown `#6f8050` / `#5c6c44` / silver `#8c9a72`; trunk `#d2c9b6`.
- Asphalt `#4a4c4f`, racing groove `#333436`, kerbs red `#c62a2a` / white `#efefea`.
- Concrete wall `#c9c5ba`; catch-fence posts `#6c7277`; tyre walls `#1d1e20` with belt covers.

## Verification
Every builder renders its work in its harness page (`harness/*.html`) and checks screenshots with `node scripts/shot.mjs`. Compare against the references in `docs/references/` at close range and at game distance.
