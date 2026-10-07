import * as THREE from 'three';
import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import type { Terrain } from '@/world/terrain';
import type { SpatialMask } from '@/world/scenery/geo';
import { buildCrowdDetail, CROWD_DETAIL_PRESETS } from '@/world/crowd-detail';
import { buildDistanceLandmarks, DISTANCE_DETAIL_PRESETS, refineDistantHills } from '@/world/distance-landmarks';
import { buildTracksideDetails } from '@/world/trackside-props';
import { tracksidePlacements, TRACKSIDE_PROP_PRESETS } from '@/world/trackside-layout';
import { demHeight } from '@/world/dem';

export function createTracksideLayer(track: Track, terrain: Terrain, mask: SpatialMask, quality: QualityPreset) {
  const cfg = getGraphics(), tier = QUALITY[quality];
  const crowdEnabled = cfg.crowdDetail && tier.crowdDetail;
  const mappedTowers = cfg.tracksideDetail && tier.tracksideDetail;
  const crowds: ReturnType<typeof buildCrowdDetail>[] = [];
  let props: ReturnType<typeof buildTracksideDetails> | null = null;
  let distance: ReturnType<typeof buildDistanceLandmarks> | null = null;
  let disposed = false;
  return {
    crowdEnabled, mappedTowers,
    addCrowd(stand: THREE.Group, options: { length: number; rows: number; roof: boolean; seed: number }) {
      if (!crowdEnabled) return;
      let baseTriangles = 0;
      stand.traverse(o => { if (o instanceof THREE.Mesh) baseTriangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; });
      const crowd = buildCrowdDetail({ ...options, density: 0.65, maxTriangles: Math.max(0, 15000 - baseTriangles) }, {
        ...CROWD_DETAIL_PRESETS[quality], density: CROWD_DETAIL_PRESETS[quality].density * cfg.crowdDensity,
        motion: tier.crowdMotion ? cfg.crowdMotion : 0,
      });
      stand.add(crowd.mesh); crowds.push(crowd);
    },
    groundDetails() {
      const placements = tracksidePlacements(track, terrain, {
        ...TRACKSIDE_PROP_PRESETS[quality], enabled: mappedTowers,
        blocked: (x, z, radius) => mask.blocked(x, z, radius),
      });
      for (const p of placements) mask.add(p.x, p.z, p.radius + 0.4);
      props = buildTracksideDetails(placements, tier.crowdMotion ? cfg.flagMotion : 0);
      return props.group;
    },
    distanceDetails(): THREE.Group | null {
      if (!cfg.distantLandmarks || !tier.distantLandmarks) return null;
      distance = buildDistanceLandmarks(terrain, DISTANCE_DETAIL_PRESETS[quality]);
      // Refinement changes normals and albedo only; the surveyed silhouette stays.
      terrain.group.traverse(o => {
        if (o instanceof THREE.Mesh && o.name.includes('coarse')) refineDistantHills(o.geometry, demHeight, cfg.hillDetail * (quality === 'high' ? 1 : 0.5));
      });
      return distance.group;
    },
    update(seconds: number) {
      const live = getGraphics();
      for (const crowd of crowds) { crowd.setMotion(tier.crowdMotion ? live.crowdMotion : 0); crowd.update(seconds); }
      props?.setFlagMotion(tier.crowdMotion ? live.flagMotion : 0); props?.update(seconds);
    },
    dispose() {
      if (disposed) return; disposed = true;
      crowds.forEach(crowd => crowd.dispose()); props?.dispose(); distance?.dispose();
    },
  };
}
export type TracksideLayer = ReturnType<typeof createTracksideLayer>;
