// SVG path of the Mount Panorama centreline for menu artwork (same rotation as the HUD map).
import { bestFitRotation, fitTransform, project } from '@/hud/map-geometry';
import trackData from '@/track/data/mount-panorama.json';
import adelaideData from '@/track/data/adelaide.json';
import { ACTIVE_CIRCUIT } from '@/track/circuits';

export const OUTLINE_VIEWBOX = { w: 1000, h: 640 } as const;

let cached: string | null = null;

/** Closed path "M x y L ..." in a 1000 x 640 box, every 2nd point. */
export function trackOutlinePath(): string {
  if (cached) return cached;
  const outline = ACTIVE_CIRCUIT === 'adelaide' ? adelaideData.points.map(p => [p[0], p[1]] as [number, number])
    : (trackData.points as number[][]).map((p) => [p[0], p[2]] as [number, number]);
  const t = fitTransform(outline, bestFitRotation(outline, 1.5), OUTLINE_VIEWBOX.w, OUTLINE_VIEWBOX.h, 24);
  const out: [number, number] = [0, 0];
  const parts: string[] = [];
  for (let i = 0; i < outline.length; i += 2) {
    project(t, outline[i][0], outline[i][1], out);
    parts.push(`${i === 0 ? 'M' : 'L'}${out[0].toFixed(1)} ${out[1].toFixed(1)}`);
  }
  cached = `${parts.join(' ')} Z`;
  return cached;
}
