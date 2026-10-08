// Implements the CarModel contract on top of the built parts.
import * as THREE from 'three';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import type { CarModel, CarModelOptions, WheelIndex } from '@/types/car-model';
import { buildCarParts, type CarParts } from '@/car/models/car-parts';
import { disposeMaterials } from '@/car/models/car-materials';
import { registerCarLook, setTailGlow, writeMaterials } from '@/car/models/look';
import { createDamage } from '@/car/models/damage';
import { makeCurve } from '@/car/models/curves';
import { paintDisplayLive } from '@/car/models/livery-texture';
import { dashRpm, paintAnalogue } from '@/car/models/display-analogue';
import { poseGearLever } from '@/car/models/interior-classic';
import { liveryAtlasSize } from '@/car/models/texture-quality';
import type { Ctx } from '@/car/models/livery-canvas';

const COCKPIT_PITCH = 0.087;

function anchors(parts: CarParts): { cockpit: THREE.Object3D; bonnet: THREE.Object3D; exhausts: THREE.Object3D[] } {
  const { profile, body, zFront } = parts;
  // Anchors are oriented like three.js cameras (looking down their local -Z), so a
  // camera that copies an anchor's world transform looks along the car's +Z.
  const cockpit = new THREE.Object3D();
  cockpit.name = 'cockpit-camera';
  cockpit.position.set(...profile.eye);
  // Pitched 5 degrees down (yaw applied after pitch) so the horizon sits ~42 % from
  // the top of the frame and the bonnet shows over the dash.
  cockpit.rotation.set(-COCKPIT_PITCH, Math.PI, 0, 'YXZ');
  const bonnet = new THREE.Object3D();
  bonnet.name = 'bonnet-camera';
  // Ahead of every bonnet vent (no slats right in front of the lens), 14 cm above the
  // surface, pitched 3 degrees down: a clean strip of bonnet, its front edge, then the road.
  const ventEnd = Math.max(profile.z.cowl, ...profile.art.bonnetVents.flat().map((v) => v[1]));
  const zB = Math.min(ventEnd + 0.14, zFront - 0.45);
  const dome = profile.curves.domeH ? makeCurve(profile.curves.domeH)(zB) : 0;
  bonnet.position.set(0, makeCurve(profile.curves.topY)(zB) + dome + 0.14, zB);
  bonnet.rotation.set(-0.052, Math.PI, 0, 'YXZ');
  body.add(cockpit, bonnet);
  const exhausts = [1, -1].map((s) => {
    const o = new THREE.Object3D();
    o.name = s > 0 ? 'exhaust-left' : 'exhaust-right';
    o.position.set(s * 0.95, 0.108, profile.exhaustZ);
    o.lookAt(o.position.clone().add(new THREE.Vector3(s, -0.12, 0))); // local +Z = flow direction
    body.add(o);
    return o;
  });
  return { cockpit, bonnet, exhausts };
}

/** Outer shell: drawn first with depth writes, so nothing inside shows through the ghost. */
const GHOST_SHELL = new Set(['paint', 'paint-face', 'paint-flares', 'glass', 'glass-tinted', 'banner']);
/** Inner parts hidden in ghost mode (they only clutter a see-through car). */
const GHOST_HIDDEN = new Set(['underside', 'disc', 'caliper', 'grille-recess']);

function ghostSwap(root: THREE.Object3D, ghost: THREE.Material, on: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (on) {
      if (!o.userData.look) o.userData.look = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, visible: o.visible, order: o.renderOrder };
      o.material = Array.isArray(o.material) ? o.material.map(() => ghost) : ghost;
      o.castShadow = false;
      o.receiveShadow = false;
      if (GHOST_HIDDEN.has(o.name)) o.visible = false;
      if (GHOST_SHELL.has(o.name)) o.renderOrder = -1;
    } else if (o.userData.look) {
      const l = o.userData.look;
      o.material = l.material;
      o.castShadow = l.cast;
      o.receiveShadow = l.receive;
      o.visible = l.visible;
      o.renderOrder = l.order;
      delete o.userData.look;
    }
  });
}

export function buildCarModel(kind: CarKind, options: CarModelOptions): CarModel {
  const parts = buildCarParts(kind, options);
  const { root, body, wheels, mats, look, interior, lights } = parts;
  const a = anchors(parts);
  const generic = [parts.plastic, parts.trim, lights.head, lights.tail, ...(lights.amber ? [lights.amber] : []), ...(parts.flares ? [parts.flares] : []), ...parts.fascia, ...(parts.splitter?.meshes ?? []), ...(parts.wing?.meshes ?? [])];
  const noseTopY = makeCurve(parts.profile.curves.topY)(parts.zFront - 0.45);
  const damage = createDamage({ grid: parts.grid, shell: parts.shell, generic, splitter: parts.splitter, wing: parts.wing, lights, mats, tex: parts.tex, look, zFront: parts.zFront, zRear: parts.zRear, noseTopY });

  let brake = false;
  let glow = 0;
  let ghost = false;
  let interiorOn = true;
  const showCabin = () => {
    if (!interior) return;
    interior.cabin.visible = !ghost;
    interior.group.visible = interiorOn && !ghost;
    interior.outside.visible = !interiorOn && !ghost;
  };
  showCabin();
  let dashKey = '';
  const steerQ = new THREE.Quaternion();
  const axisZ = new THREE.Vector3(0, 0, 1);
  const model: CarModel = {
    kind,
    root,
    body,
    setQuality(quality) {
      const atlas = look.segments[options.detail ?? 'high'];
      parts.tex?.resize(...liveryAtlasSize(atlas.atlasWidth, atlas.atlasHeight, quality));
    },
    setBodyAttitude(pitch, roll, heave) {
      body.rotation.set(-pitch, 0, roll);
      body.position.y = heave;
    },
    setWheel(index: WheelIndex, spin, steer, suspension) {
      wheels.set(index, spin, steer, suspension);
    },
    setSteeringWheel(angle) {
      if (!interior) return;
      const base = interior.steering.userData.base as THREE.Quaternion;
      interior.steering.quaternion.copy(base).multiply(steerQ.setFromAxisAngle(axisZ, -angle));
    },
    setBrakeLights(on) {
      brake = on;
      setTailGlow(mats, look, on);
    },
    setBrakeGlow(level) {
      glow = Math.max(0, Math.min(1, level));
      if (mats.disc) mats.disc.emissiveIntensity = glow * look.disc.glowMax;
    },
    applyImpact: (impact) => damage.apply(impact),
    getDamageZones: () => damage.zones(),
    resetDamage: () => damage.reset(),
    setGhost(on) {
      if (on === ghost) return;
      ghost = on;
      ghostSwap(root, mats.ghost, on);
      showCabin();
    },
    setDash(state) {
      if (interior?.lever) poseGearLever(interior.lever, state.gear, CAR_SPECS[kind].gearRatios.length);
      const tex = parts.tex?.display;
      if (!tex || !interior || !interior.group.visible) return;
      // Repaint only when a shown value changes (canvas uploads are not free).
      const classic = parts.profile.cockpit === 'classic';
      const rpm = classic ? Math.round(dashRpm(CAR_SPECS[kind], state) / 50) * 50 : 0;
      const key = classic ? `${rpm}|${Math.round(state.speedKmh)}` : `${state.gear}|${Math.round(state.speedKmh)}|${Math.round(state.shiftLights * 12)}|${state.lapS === null ? '' : state.lapS.toFixed(1)}|${state.deltaS === null ? '' : state.deltaS.toFixed(2)}|${state.shiftLights >= 1 ? Math.floor(performance.now() / 90) % 2 : 0}`;
      if (key === dashKey) return;
      dashKey = key;
      const ctx = (tex.image as HTMLCanvasElement).getContext('2d') as Ctx | null;
      if (!ctx) return;
      if (classic) paintAnalogue(ctx, CAR_SPECS[kind].engine.redlineRpm, rpm, state.speedKmh);
      else paintDisplayLive(ctx, state);
      tex.needsUpdate = true;
    },
    setMirrorTexture(tex) {
      interior?.mirror.setTexture(tex);
    },
    setInteriorVisible(on) {
      interiorOn = on;
      showCabin();
    },
    cockpitCamera: a.cockpit,
    bonnetCamera: a.bonnet,
    exhausts: a.exhausts,
    dispose() {
      interior?.mirror.dispose();
      root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      disposeMaterials(mats as unknown as Record<string, THREE.Material | null>);
    },
  };
  writeMaterials(mats, look, brake, glow);
  registerCarLook(model, { look, materials: mats, brakeOn: () => brake, brakeGlow: () => glow });
  return model;
}
