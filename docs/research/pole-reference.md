# 2025 pole reference blocker

Item 3.9 remains incomplete. The required real second and third sectors were not recovered, so no artificially timed three-sector ghost was added.

[Official Saturday Q9 results](https://www.supercars.com/results/2025/2025-bathurst-1000/Q9) identify car 38, lap 1 as **124.0413 seconds**. The decoded server payload has no sector/split fields. [Friday’s qualifying report](https://www.supercars.com/news/repco-bathurst-1000-qualifying-report-brodie-kostecki-provisonal-pole-2025-dick-johnson-racing) records **124.0307 seconds**, a different lap. The plan’s 2:04.03 combines these references; it cannot establish Saturday’s sectors.

Three retrieval approaches were tried:

1. Official Q9 results and the [shootout report](https://www.supercars.com/news/supercars-news-2025-results-bathurst-1000-top-ten-shootout-report-fastest-lap-times-video-brodie-kostecki) establish the total but expose no sector values.
2. Natsoft’s HTTP portal serves its proprietary client; HTTPS fails with SSL EOF. Historical result links return 404, and the historical live meeting’s WebSockets return `<NotFound />`. The archive UI was not operated, so these outcomes do not prove that no timing sheet exists.
3. The [official pole video](https://www.supercars.com/videos/6382610782112/history-maker:-kostecki-blazes-to-third-bathurst-pole) and [official YouTube clip](https://www.youtube.com/watch?v=TeL9NAALD78) were inspected at one-second intervals, with full frames at 54, 90 and 124 video seconds. No readable sector graphic was observed. Video timestamps are not timing-beam splits.

Evidence: `artifacts/review/item-3.9/research-report.json`, `recommendation.md` and `evidence-manifest.json`, with 69 hash-checked public source/media files. S2 and S3 remain null. The supplied S1 of 50.847 s was not independently recovered in this isolated pass and needs its original source attached.

Next step: obtain the official detailed Q9 timing export for car 38, lap 1, or a readable official graphic explicitly showing this lap’s S2 and S3. Keep the source and exact values together, then implement the target and test its actual crossings. Do not scale game sectors, split the remaining total, substitute Friday timings or infer splits from an edited video.
