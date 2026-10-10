# External assets

Every non-generated runtime asset (texture, HDRI, mesh, audio sample, font beyond
the bundled set) must be listed here before it ships. Allowed licences only:
**CC0**, **CC-BY**, or **paid commercial**. Never NC or editorial-only.

| Asset | Path | Source | Author | Licence | Price | Notes |
|---|---|---|---|---|---:|---|
| Rural Asphalt Road HDRI (1k, UASTC KTX2) | `public/env/rural_asphalt_road_1k.ktx2` | [Poly Haven](https://polyhaven.com/a/rural_asphalt_road) | Alexander Scholten | CC0 | $0 | Outdoor equirect for car reflections. Tonemapped LDR from the 1k Radiance HDR, then UASTC KTX2 with mips. Streamed after first paint on Medium/High (`QUALITY.hdriEnv`). |
| Basis Universal transcoder | `public/basis/basis_transcoder.js`, `public/basis/basis_transcoder.wasm` | [Khronos / Binomial via three.js](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/libs/basis) | Binomial LLC / Khronos Group | Apache-2.0 | $0 | Required by `KTX2Loader` to decode the HDRI on WebGL. |

## Adding an asset

1. Confirm the licence is CC0, CC-BY, or a paid commercial licence that covers game
   redistribution. Reject NC and editorial-only.
2. Prefer KTX2 (UASTC or ETC1S) for colour textures and HDRIs; keep mipmaps.
3. Place files under `public/` and load them asynchronously so the first JS/CSS
   payload stays small.
4. Add a row to the table above (source URL, author, licence, price paid).
5. Wire a per-tier switch in `QUALITY` when the asset is expensive.

## Procedural (not external)

These are generated at runtime and do not need a row above: livery atlases, carbon
weave, paint flake / orange-peel, tyre sidewall/tread detail, disc face maps, terrain
and asphalt detail maps, and the procedural sky dome.
