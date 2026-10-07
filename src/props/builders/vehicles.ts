import { BUILDING } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinderZ } from '@/props/core/prims';
import { box } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';
import { addBody, addWheel, stationAt, type Station } from '@/props/builders/vehicle-body';

// Generic parked road cars: sedan, hatch, ute (with tonneau), 4WD wagon, station wagon.
// Paint = instance colour; glass, trim, lights and wheels keep their colours.

export const VEHICLE_VARIANTS = { roadCar: 5 } as const;

interface CarDef {
  stations: Station[];
  wheelbase: number;
  track: number;
  wheelR: number;
  rack?: boolean;
  spare?: boolean;
  tonneauFrom?: number;
}

const CARS: CarDef[] = [
  {
    // Sedan.
    stations: [
      [-2.45, 0.32, 0.64, 0, 0.86, 0],
      [-2.32, 0.24, 0.9, 0, 0.9, 0],
      [-1.62, 0.22, 0.95, 0, 0.92, 0],
      [-1.0, 0.22, 0.95, 1.4, 0.92, 0.72],
      [0.3, 0.22, 0.94, 1.44, 0.92, 0.74],
      [1.0, 0.22, 0.9, 0, 0.92, 0],
      [2.25, 0.28, 0.78, 0, 0.9, 0],
      [2.45, 0.36, 0.66, 0, 0.84, 0],
    ],
    wheelbase: 2.9,
    track: 1.58,
    wheelR: 0.33,
  },
  {
    // Hatchback.
    stations: [
      [-2.12, 0.3, 0.68, 0, 0.84, 0],
      [-2.04, 0.24, 0.92, 1.28, 0.88, 0.66],
      [-1.6, 0.22, 0.95, 1.46, 0.89, 0.72],
      [0.35, 0.22, 0.92, 1.47, 0.89, 0.73],
      [1.0, 0.22, 0.88, 0, 0.89, 0],
      [1.95, 0.28, 0.76, 0, 0.86, 0],
      [2.12, 0.36, 0.64, 0, 0.8, 0],
    ],
    wheelbase: 2.65,
    track: 1.54,
    wheelR: 0.32,
  },
  {
    // Single-cab ute with a tonneau-covered tub.
    stations: [
      [-2.65, 0.45, 0.78, 0, 0.9, 0],
      [-2.55, 0.48, 1.15, 0, 0.93, 0],
      [-0.6, 0.48, 1.15, 0, 0.93, 0],
      [-0.55, 0.45, 1.12, 1.78, 0.93, 0.78],
      [0.6, 0.42, 1.12, 1.82, 0.93, 0.8],
      [1.2, 0.42, 1.08, 0, 0.93, 0],
      [2.4, 0.45, 1.0, 0, 0.92, 0],
      [2.65, 0.5, 0.84, 0, 0.88, 0],
    ],
    wheelbase: 3.08,
    track: 1.55,
    wheelR: 0.38,
    tonneauFrom: -0.6,
  },
  {
    // Large 4WD wagon with roof rack and rear spare wheel.
    stations: [
      [-2.47, 0.45, 0.95, 0, 0.94, 0],
      [-2.4, 0.42, 1.1, 1.78, 0.97, 0.85],
      [0.6, 0.42, 1.1, 1.88, 0.98, 0.86],
      [1.25, 0.42, 1.06, 0, 0.98, 0],
      [2.25, 0.45, 1.0, 0, 0.97, 0],
      [2.47, 0.5, 0.82, 0, 0.92, 0],
    ],
    wheelbase: 2.85,
    track: 1.64,
    wheelR: 0.39,
    rack: true,
    spare: true,
  },
  {
    // Station wagon.
    stations: [
      [-2.45, 0.3, 0.7, 0, 0.86, 0],
      [-2.35, 0.24, 0.93, 1.36, 0.9, 0.7],
      [-1.9, 0.22, 0.95, 1.44, 0.92, 0.74],
      [0.3, 0.22, 0.94, 1.45, 0.92, 0.74],
      [1.0, 0.22, 0.9, 0, 0.92, 0],
      [2.25, 0.28, 0.78, 0, 0.9, 0],
      [2.45, 0.36, 0.66, 0, 0.84, 0],
    ],
    wheelbase: 2.92,
    track: 1.6,
    wheelR: 0.33,
  },
];

export function buildRoadCar(variant: number): BuiltProp {
  const def = CARS[variant % CARS.length];
  const look = PROPS_LOOK.vehicles;
  const m = new Mesher(true);
  const tonneau = def.tonneauFrom;
  addBody(m, def.stations, {
    body: 0xffffff,
    extra: tonneau === undefined ? undefined : (f) => (f.centroid.z < tonneau && f.normal.y > 0.8 ? look.trim : undefined),
  }, true);
  const s = def.stations;
  const rear = s[0][0];
  const front = s[s.length - 1][0];
  const beltF = stationAt(s, front - 0.1, 2);
  const beltR = stationAt(s, rear + 0.1, 2);
  const halfW = s[1][4];
  // Lights, grille, mirrors.
  for (const x of [-1, 1]) {
    m.add(box(0.32, 0.12, 0.06, x * (halfW - 0.24), beltF - 0.12, front - 0.02), look.headLight);
    m.add(box(0.3, 0.12, 0.06, x * (halfW - 0.22), beltR - 0.12, rear + 0.02), look.tailLight);
    const zA = s.filter((st) => st[3] > st[2]).pop()![0] + 0.45;
    m.add(box(0.1, 0.1, 0.16, x * (halfW + 0.06), stationAt(s, zA, 2) + 0.12, zA), look.trim);
  }
  m.add(box(halfW * 0.9, 0.16, 0.05, 0, beltF - 0.2, front - 0.01), look.trim);
  for (const x of [-1, 1]) {
    for (const z of [-def.wheelbase / 2, def.wheelbase / 2]) addWheel(m, x * (def.track / 2), z + (front + rear) / 2, def.wheelR, 0.24, x as 1 | -1);
  }
  if (def.rack) {
    const roof = stationAt(s, 0, 3);
    for (const x of [-0.6, 0.6]) m.add(box(0.05, 0.06, 2.4, x, roof + 0.05, -0.8), look.trim);
    m.add(box(1.2, 0.1, 1.2, 0, roof + 0.12, -1.0), BUILDING.darkGrey);
  }
  if (def.spare) m.add(cylinderZ(0.38, 0.24, 12, 0, 0.85, rear - 0.12), look.tyre);
  const g = m.build();
  g.computeBoundingBox();
  return { geometry: g, radius: Math.max(-rear, front) + 0.1 };
}

