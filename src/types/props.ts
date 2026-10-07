import type * as THREE from 'three';

/**
 * Props contract. Small repeated props are delivered as ONE BufferGeometry with
 * vertex colours (attribute `color`, linear) and ONE shared material, so the
 * world builder can draw thousands of them with a single InstancedMesh.
 *
 * Frame: origin at the base centre on the ground (y = 0), +Y up, +Z = the prop's
 * "front" (the side that faces the track for signs, stands and marshal posts). Metres.
 */
export type InstancedPropKind =
  | 'eucalyptus' // tall gum tree, pale trunk, clumpy grey-green crown
  | 'eucalyptusYoung'
  | 'pine'
  | 'shrub'
  | 'rock'
  | 'grassTuft'
  | 'tyreStack' // 5-6 tyres high column for barrier walls
  | 'marshalPost' // small flag-marshal hut with roof and number board
  | 'lightPole'
  | 'flagPole'
  | 'trackPole' // catch-fence post
  | 'tvCameraTower' // scaffold tower with camera platform
  | 'spectator' // standing person; instance colour = shirt colour
  | 'spectatorSeated'
  | 'tent' // dome camping tent; instance colour = fly colour
  | 'gazebo' // pop-up shade gazebo; instance colour = canopy colour
  | 'caravan'
  | 'campervan'
  | 'roadCar' // generic parked sedan/ute; instance colour = paint
  | 'portaloo'
  | 'waterTank' // corrugated rural rainwater tank
  | 'house' // weatherboard / brick bungalow (variants vary roof colour)
  | 'shed'
  | 'billboard' // generic track-side advertising hoarding (blank panel, colour by instance)
  | 'distanceBoard'; // braking marker board, white with black chevrons, no digits

export interface PropAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Lower-detail geometry for far instances (optional). Same material. */
  lodGeometry?: THREE.BufferGeometry;
  /** True when the geometry carries per-vertex colours that should be tinted by instance colour (white areas take the tint). */
  tintable: boolean;
  castShadow: boolean;
  /** Approximate footprint radius and height (m) for placement spacing and culling. */
  radius: number;
  height: number;
  /** Triangle count of `geometry` (for budgets). */
  triangles: number;
}

/** Variant index picks a deterministic variation (shape/colour) of the same kind. */
export type GetPropAsset = (kind: InstancedPropKind, variant?: number) => PropAsset;

/** Number of distinct variants available per kind. */
export type PropVariantCount = Record<InstancedPropKind, number>;

/**
 * Unique (one-off) structures built with parameters. Each returns a Group in the
 * same frame convention (+Z faces the track). Each Group should use few materials
 * and merge geometry internally (target < 12 draw calls each).
 */
export interface StructureFactory {
  /** Pit building: garages facing +Z along X (length = along pit straight), upper corporate level, glass, roof. */
  pitBuilding(opts: { length: number; garages: number }): THREE.Group;
  /** Race-control tower (multi-storey, glass top). */
  controlTower(opts: { height: number }): THREE.Group;
  /** Covered grandstand with tiered seating facing +Z; `crowd` fills seats with simple spectators. */
  grandstand(opts: { length: number; rows: number; roof: boolean; crowd: number }): THREE.Group;
  /** Start/finish gantry spanning the track along X with start lights panel and timing board. */
  startGantry(opts: { span: number; height: number }): THREE.Group;
  /** Pedestrian / advertising bridge spanning the track along X (blank banner panels). */
  footBridge(opts: { span: number; clearance: number }): THREE.Group;
  /** Big video screen on legs. */
  videoScreen(opts: { width: number }): THREE.Group;
  /** Generic single-storey building box with roof (amenities, museum). */
  building(opts: { width: number; depth: number; height: number; style: 'amenities' | 'museum' | 'corporate' | 'shed' }): THREE.Group;
  /** Large white hillside/park letters (e.g. "MOUNT PANORAMA"), each letter extruded, facing +Z. */
  hillsideLetters(opts: { text: string; letterHeight: number }): THREE.Group;
}
