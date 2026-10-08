import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraRig, type CameraTarget } from '@/camera/camera-rig';
import { HeadMotion } from '@/camera/head-motion';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import { adjustSetting, ALL_FIELDS, valueLabel } from '@/ui/settings-model';

const track = new Track();
function target(): CameraTarget {
  const cockpit = new THREE.Object3D();
  cockpit.position.set(2, 1.2, 3);
  cockpit.rotation.y = Math.PI;
  cockpit.updateMatrixWorld();
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), heading: 0,
    speed: 30, cockpit, bonnet: cockpit.clone(), s: 0, gLong: 0.8, gLat: 1.5, headMotion: 1 };
}
function advance(rig: CameraRig, t: CameraTarget): void {
  for (let i = 0; i < 120; i++) rig.update(t, 1 / 120);
}
afterEach(() => vi.unstubAllGlobals());

describe('measured cockpit head movement', () => {
  it('moves opposite acceleration in car coordinates and leans with it', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, track);
    rig.mode = 'cockpit';
    const t = target();
    advance(rig, t);
    expect(camera.position.x).toBeLessThan(t.cockpit.position.x); // +g left: head moves right
    expect(camera.position.z).toBeLessThan(t.cockpit.position.z); // acceleration: head moves back
    expect(camera.quaternion.angleTo(t.cockpit.quaternion)).toBeGreaterThan(0.015);
    const head = new HeadMotion().update(-1.5, -1, 1, 1 / 30);
    expect(head.x).toBeLessThan(0);
    expect(head.z).toBeLessThan(0); // braking: head moves towards the windscreen
    expect(head.pitch).toBeLessThan(0);
    expect(head.roll).toBeGreaterThan(0);
  });

  it('zero removes g-force offset, lean and cockpit shake immediately', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, track);
    rig.mode = 'cockpit';
    const t = target();
    advance(rig, t);
    rig.addShake(1);
    rig.update({ ...t, headMotion: 0 }, 1 / 60);
    expect(camera.position.distanceTo(t.cockpit.position)).toBe(0);
    expect(camera.quaternion.angleTo(t.cockpit.quaternion)).toBe(0);
    rig.lookBack = true;
    rig.update({ ...t, headMotion: 0 }, 1 / 60);
    const rear = camera.position.clone();
    rig.addShake(1);
    rig.update({ ...t, headMotion: 0 }, 1 / 60);
    expect(camera.position.distanceTo(rear)).toBe(0);
  });

  it('scales with amount, settles without frame-rate dependence and bounds spikes', () => {
    const run = (hz: number, amount: number) => {
      const head = new HeadMotion();
      for (let i = 0; i < hz; i++) head.update(1, 2, amount, 1 / hz);
      return { ...head.pose };
    };
    const full = run(30, 1), half = run(120, 0.5);
    expect(half.x).toBeCloseTo(full.x / 2, 10);
    expect(half.z).toBeCloseTo(full.z / 2, 10);
    expect(half.roll).toBeCloseTo(full.roll / 2, 10);
    const spike = new HeadMotion();
    for (let i = 0; i < 120; i++) spike.update(1000, -1000, 5, 1 / 60);
    expect(Math.abs(spike.pose.x)).toBeLessThanOrEqual(0.075);
    expect(Math.abs(spike.pose.z)).toBeLessThanOrEqual(0.09);
    expect(Math.abs(spike.pose.roll)).toBeLessThanOrEqual(0.075);
    const invalid = spike.update(Number.NaN, Number.POSITIVE_INFINITY, 0, Number.NaN);
    expect(Object.values(invalid)).toEqual([0, 0, 0, 0]);
  });

  it('leaves bonnet/chase/TV camera transforms independent of g-forces and amount', () => {
    for (const mode of ['bonnet', 'chase', 'chaseFar', 'tv'] as const) {
      const a = new CameraRig(new THREE.PerspectiveCamera(), track);
      const b = new CameraRig(new THREE.PerspectiveCamera(), track);
      a.mode = b.mode = mode;
      const t = target();
      advance(a, t);
      advance(b, { ...t, gLong: -3, gLat: -3, headMotion: 0 });
      expect(a.camera.position.distanceTo(b.camera.position)).toBe(0);
      expect(a.camera.quaternion.angleTo(b.camera.quaternion)).toBeLessThan(1e-7);
    }
  });
});

describe('head movement setting', () => {
  it('offers a clamped percentage range whose zero reads Off', () => {
    const field = ALL_FIELDS.find((f) => f.key === 'headMotion');
    expect(field?.kind).toBe('range');
    if (!field) throw new Error('missing head motion setting');
    expect(adjustSetting({ ...DEFAULT_SETTINGS, headMotion: 0 }, field, -1).headMotion).toBe(0);
    expect(adjustSetting({ ...DEFAULT_SETTINGS, headMotion: 1 }, field, 1).headMotion).toBe(1);
    expect(valueLabel(field, { ...DEFAULT_SETTINGS, headMotion: 0 })).toBe('Off');
    expect(valueLabel(field, { ...DEFAULT_SETTINGS, headMotion: 0.5 })).toBe('50%');
  });

  it('persists off and upgrades legacy settings; clamps malformed stored amounts', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value) });
    saveSettings({ ...DEFAULT_SETTINGS, headMotion: 0, phoneVibration: false, touchMode: 'buttons',
      touchAnalogThrottle: true, touchAutoThrottle: true, touchLeftHanded: true });
    expect(loadSettings()).toMatchObject({ headMotion: 0, phoneVibration: false, touchMode: 'buttons',
      touchAnalogThrottle: true, touchAutoThrottle: true, touchLeftHanded: true });
    values.set('bathurst.settings.v1', JSON.stringify({ quality: 'low' }));
    expect(loadSettings().headMotion).toBe(DEFAULT_SETTINGS.headMotion);
    expect(loadSettings().quality).toBe('low');
    for (const [raw, expected] of [[5, 1], [-1, 0], ['bad', DEFAULT_SETTINGS.headMotion], [null, DEFAULT_SETTINGS.headMotion]] as const) {
      values.set('bathurst.settings.v1', JSON.stringify({ headMotion: raw }));
      expect(loadSettings().headMotion).toBe(expected);
    }
  });
});
