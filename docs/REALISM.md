# Realism Index

The frozen baseline is commit `3f157e94f4053893c766601a658d02df4dd824dc`.
Evidence: `artifacts/review/realism-baseline/`. Later rounds use the same
15 viewpoints, aspect sheet and the two briefs below. The user's score is pending.
Delivery for this overnight run is **preview only**, per the user's latest instruction.

## Scoring sheet

Score each visible aspect from 0 to 10 against the paired photograph. Environment
viewpoints use light/atmosphere, road/kerbs, terrain/grass, trees/bush,
structures/distance and image quality. Car close-ups use light/material response,
car shape/materials/detail and image quality; the harness floor is not terrain.
The viewpoint score is the mean of applicable aspects. Each of the 15 viewpoints
has equal weight. A reviewer's index is the mean viewpoint score multiplied by 10.
The reported index is the mean of the two reviewers. User score: **pending**.
0 means no resemblance, 5 means a recognisable but plainly stylised game, 7.5
means the agreed art-direction ceiling, and 10 means indistinguishable from the photo.
Different reference angles and eras are limitations, not reasons to award extra points.
The Phase 1 target is `min(75, baseline + 0.5 × (100 − baseline))`.

## Fixed brief: sim-racing player

> You are an experienced sim-racing player independently judging generated
> Mount Panorama graphics against real photographs. Read the scoring sheet above
> and the reference manifest. Inspect every one of the 12 corner captures and
> 3 car close-ups, together with its paired reference. Score the applicable aspects
> 0–10 using the stated anchors, giving a brief visible reason for each viewpoint.
> Focus on how the real circuit reads at driving distance, believable road and kerbs,
> recognisable Australian vegetation, car proportions and stable image quality.
> Ignore HUD design, feature count and builder claims. Do not infer unseen detail.
> Report all aspect scores, each viewpoint mean, your arithmetic Realism Index,
> the three largest visible gaps and any uncertain photo pairing. Do not read other
> reviewer scores or earlier scores. Do not edit game source or run GPU benchmarks.

## Fixed brief: photographer

> You are a photographer independently judging generated Mount Panorama graphics
> against real photographs. Read the scoring sheet above and the reference manifest.
> Inspect every one of the 12 corner captures and 3 car close-ups, together with its
> paired reference. Score the applicable aspects 0–10 using the stated anchors,
> giving a brief visible reason for each viewpoint. Focus on the direction and softness
> of light, atmospheric depth, colour relationships, plausible material response,
> organic silhouettes and image artefacts. Ignore HUD design, feature count and
> builder claims. Do not infer unseen detail. Report all aspect scores, each viewpoint
> mean, your arithmetic Realism Index, the three largest visible gaps and any uncertain
> photo pairing. Do not read other reviewer scores or earlier scores. Do not edit game
> source or run GPU benchmarks.

## Viewpoints and references

The 15 fixed pairs are in [REALISM-PAIRS.md](references/REALISM-PAIRS.md).
Local metadata: `artifacts/review/realism-baseline/references/matched-manifest.json`.
Environment photos are official onboard stills in the same racing direction; cockpit
framing and windshield obstruction differ from the chase camera. Those limits apply
to every round. Scores below record independent inspection of all 15 pairs.

## Baseline scores

Two-reviewer Realism Index: **44.09 / 100**. Phase 1 target: **72.05 / 100**.
Sim-racing player: 42.11; photographer: 46.07. User: **pending**.

| Viewpoint | Player (0–10) | Photographer (0–10) |
|---|---:|---:|
| 10-hell-corner | 4.25 | 4.58 |
| 11-mountain-straight | 4.25 | 4.67 |
| 12-griffins-bend | 4.00 | 4.50 |
| 13-the-cutting | 4.25 | 4.62 |
| 14-reid-park | 3.92 | 4.40 |
| 15-mcphillamy-park | 4.33 | 4.58 |
| 16-skyline | 3.92 | 4.50 |
| 17-the-dipper | 3.92 | 4.58 |
| 18-forrests-elbow | 3.83 | 4.58 |
| 19-conrod-straight | 4.25 | 4.42 |
| 20-the-chase | 4.17 | 4.42 |
| 21-murrays-corner | 4.25 | 4.58 |
| car-camaro | 4.67 | 4.83 |
| car-mustang | 4.67 | 4.83 |
| car-supra | 4.50 | 5.00 |

Full aspect scores and visible reasons: `player-review.json` and
`photographer-review.json` in the baseline evidence directory. Obstructed aspects
are null and excluded from that viewpoint mean. Static captures cannot establish
temporal shimmer. Both reviewers identify opaque repetitive foliage, uniform ground
and simplified materials as the largest visible gaps.

## Performance

Measurements count rendered frames, with `EXT_disjoint_timer_query_webgl2` GPU
elapsed time when supported. Statistics include all scene/post passes in the frame.
Desktop is 1920 × 1080 on an Apple M3 Max; phone captures are Chrome emulation at
844 × 390, 3× device pixels. Emulation measures this Mac, not an iPhone's GPU.
The four points are Pit Straight (s=200), Mountain Straight (1200), Skyline (3330)
and Conrod (4600). Baseline JSON records all three desktop tiers and Medium/Low
phone emulation. Real iPhone Medium baseline: **pending**.

| Baseline tier | fps at all four points | GPU ms range | Draw calls range | Triangles range |
|---|---:|---:|---:|---:|
| Desktop High | 60 | 5.49–5.79 | 113–177 | 921,620–1,023,018 |
| Desktop Medium | 60 | 5.30–5.99 | 113–176 | 882,741–996,504 |
| Desktop Low | 60 | 2.28–2.85 | 112–175 | 806,335–965,430 |
| Phone emulation Medium | 60 | 2.49–3.84 | 114–176 | 903,617–1,011,374 |
| Phone emulation Low | 60 | 2.01–2.77 | 113–175 | 821,963–975,904 |

Before Phase 1, phone emulation first-load encoded bytes: **594,963**; transferred
bytes: **602,163**. Estimated live GPU allocation: **114,520,660 bytes**.
The allocation estimate includes observed texture/renderbuffer formats and samples;
it excludes driver overhead and the default framebuffer. See `resources-phone.json`.

## Item 1.2: tone mapping comparison

Two fresh reviewers reused the fixed briefs and inspected all 12 environment pairs
under each operator. Cars are excluded from this operator comparison; it is not a
new full Realism Index. User score remains **pending**.

| Operator | Player environment index | Photographer environment index | Mean |
|---|---:|---:|---:|
| ACES | 41.11 | 41.33 | 41.22 |
| AgX | 43.10 | 42.74 | 42.92 |
| Neutral | 41.33 | 40.63 | 40.98 |

AgX is the default because both reviewers preferred its grey asphalt, restrained
highlights and muted vegetation. Their larger remaining gaps concern tree forms,
terrain variation and local material depth, addressed by the next plan items.
Full aspect scores, visible reasons and pairing limitations are in
`artifacts/review/item-1.2/tone-player.json` and `tone-photographer.json`.
The date is 11 October 2026 at 15:00 AEDT (D2): solar elevation 49.50°, bearing 303.79°.

## Item 1.8: rejected car candidate

Two fresh reviewers reused the fixed briefs and inspected all 15 pairs. The
unshipped candidate scored **49.16 / 100** (player 50.58, photographer 47.74).
User: **pending**. This is a rejected candidate round, not the current release score.

| Viewpoint | Player (0–10) | Photographer (0–10) |
|---|---:|---:|
| 10-hell-corner | 5.18 | 4.72 |
| 11-mountain-straight | 4.93 | 4.70 |
| 12-griffins-bend | 4.88 | 4.63 |
| 13-the-cutting | 4.65 | 4.55 |
| 14-reid-park | 4.78 | 4.60 |
| 15-mcphillamy-park | 4.98 | 4.60 |
| 16-skyline | 4.95 | 4.72 |
| 17-the-dipper | 4.73 | 4.60 |
| 18-forrests-elbow | 4.75 | 4.57 |
| 19-conrod-straight | 5.05 | 4.90 |
| 20-the-chase | 5.22 | 4.67 |
| 21-murrays-corner | 5.15 | 4.92 |
| car-camaro | 5.43 | 5.03 |
| car-mustang | 5.57 | 5.13 |
| car-supra | 5.60 | 5.27 |

Glazing, paint/metal response, then smoother arches/wheels were three focused
fixes. The final car means remained 5.50/5.63/5.67 for the player and
5.07/5.17/5.30 for the photographer, below the 7.205 target. Body sculpture,
fascia detail and wheel material response remain the gaps. The candidate stayed
within 40,000 triangles and 27 draws per car, but failed the required visual gate,
so all item 1.8 source changes were discarded. Reports, nine fix captures and
rejected source are in `artifacts/review/item-1.8/`.

## Phase 1 release round (item 1.12)

Two-reviewer index: **51.92 / 100** (baseline 44.09; target 72.05).
Player: 55.53; photographer: 48.31. User: **pending**.
Status: **awaiting the user's review**. The target is not reached; no acceptance
is inferred. No tuner values have been adopted as defaults.

Fresh independent reviewers used the fixed briefs above and inspected all 15
photo pairs at original resolution. Raw aspect scores, null exclusions, visible reasons
and arithmetic: `artifacts/review/item-1.12/{player,photographer}-review.json`.
Frozen environment captures: `artifacts/review/item-1.11/after/`; car close-ups:
`artifacts/review/item-1.12/after/`. Stills do not establish temporal stability.

| Viewpoint | Player (0–10) | Photographer (0–10) |
|---|---:|---:|
| 10-hell-corner | 5.53 | 4.75 |
| 11-mountain-straight | 5.53 | 4.75 |
| 12-griffins-bend | 5.50 | 4.50 |
| 13-the-cutting | 5.47 | 4.62 |
| 14-reid-park | 5.30 | 4.50 |
| 15-mcphillamy-park | 5.48 | 4.58 |
| 16-skyline | 5.38 | 4.58 |
| 17-the-dipper | 5.58 | 4.58 |
| 18-forrests-elbow | 5.33 | 4.67 |
| 19-conrod-straight | 5.17 | 4.33 |
| 20-the-chase | 5.46 | 4.67 |
| 21-murrays-corner | 5.64 | 4.58 |
| car-camaro | 5.93 | 5.67 |
| car-mustang | 6.03 | 5.67 |
| car-supra | 5.93 | 6.00 |

Both reviewers identify organic vegetation, ground/distant landscape variation
and light/material response as the largest gaps. Photo camera position and cockpit
obstruction remain limitations. Car geometry and materials stay at the shipped
baseline after item 1.8 was rejected. The user can accept this result or request a
focused follow-up; lower measured performance tiers and physics work proceed.
