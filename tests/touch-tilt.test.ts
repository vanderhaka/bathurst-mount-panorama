import { describe, expect, it } from 'vitest';
import { TiltSteering, screenRoll, type OrientationHost } from '@/input/tilt-steering';

class Host extends EventTarget implements OrientationHost {
  isSecureContext = true;
  screen = { orientation: { angle: 90 } };
  requests = 0;
  inTap = false;
  requestedInTap = false;
  DeviceOrientationEvent: OrientationHost['DeviceOrientationEvent'] = { requestPermission: () => {
    this.requests++;
    this.requestedInTap = this.inTap;
    return Promise.resolve('granted');
  } };
  reading(beta: number | null, gamma: number | null) {
    this.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
  }
}

describe('tilt permission and screen coordinates', () => {
  it('makes no sensor request while constructed, activated, calibrated or updated', async () => {
    const h = new Host(), t = new TiltSteering(h);
    t.setActive(true);
    t.calibrate();
    expect(t.update(1 / 60, 1)).toBe(0);
    expect(h.requests).toBe(0);
    h.inTap = true;
    const pending = t.enableFromTap();
    h.inTap = false;
    expect(h.requests).toBe(1);
    expect(h.requestedInTap).toBe(true);
    await pending;
    expect(t.status).toBe('granted');
    expect(t.ready).toBe(false);
    t.dispose();
  });

  it('centres on a tap, steers in both landscape rotations and re-centres', async () => {
    for (const angle of [90, -90]) {
      const h = new Host();
      h.screen.orientation.angle = angle;
      const t = new TiltSteering(h);
      t.setActive(true);
      await t.enableFromTap();
      h.reading(0, Math.sign(angle) * 90);
      expect(t.update(0.2, 1)).toBeCloseTo(0);
      h.reading(Math.sign(angle) * 24, Math.sign(angle) * 90);
      expect(t.update(0.2, 1)).toBeGreaterThan(0.9); // screen right edge raised = left
      await t.enableFromTap();
      h.reading(Math.sign(angle) * 10, Math.sign(angle) * 90);
      expect(t.update(0.2, 1)).toBeCloseTo(0);
      t.dispose();
    }
    expect(screenRoll(60, 0, 0)).toBeCloseTo(0);
    expect(screenRoll(0, 0, 90)).toBeCloseTo(0); // flat: no sideways tilt, so straight ahead
  });

  it('filters jitter, scales sensitivity, ignores missing values and drops stale data', async () => {
    const h = new Host(), t = new TiltSteering(h);
    t.setActive(true);
    await t.enableFromTap();
    h.reading(0, 90);
    h.reading(0.8, 90);
    expect(t.update(1 / 60, 1)).toBe(0);
    h.reading(12, 90);
    const half = t.update(1 / 60, 1);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
    h.reading(null, null);
    expect(t.update(0.02, 2)).toBeGreaterThan(half);
    expect(t.update(1, 1)).toBe(0);
    expect(t.ready).toBe(false);
    t.dispose();
  });

  it('recalibrates after screen rotation and stops sensor input when inactive/disposed', async () => {
    const h = new Host(), t = new TiltSteering(h);
    t.setActive(true);
    await t.enableFromTap();
    h.reading(0, 90);
    h.reading(24, 90);
    expect(t.update(0.2, 1)).toBeGreaterThan(0.8);
    h.screen.orientation.angle = -90;
    h.reading(0, -90);
    expect(t.update(0.1, 1)).toBeCloseTo(0);
    t.setActive(false);
    h.reading(24, -90);
    expect(t.ready).toBe(false);
    expect(t.update(0.1, 1)).toBe(0);
    t.dispose();
  });

  it('handles denied, rejected, unsupported and insecure access without throwing', async () => {
    for (const response of ['denied', 'reject', 'unsupported', 'insecure'] as const) {
      const h = new Host();
      if (response === 'denied') h.DeviceOrientationEvent = { requestPermission: () => Promise.resolve('denied') };
      if (response === 'reject') h.DeviceOrientationEvent = { requestPermission: () => Promise.reject(new Error('denied')) };
      if (response === 'unsupported') h.DeviceOrientationEvent = undefined;
      if (response === 'insecure') h.isSecureContext = false;
      const t = new TiltSteering(h);
      t.setActive(true);
      await t.enableFromTap();
      expect(t.status).toBe(response === 'denied' || response === 'reject' ? 'denied' : 'unavailable');
      h.reading(24, 90);
      expect(t.update(0.1, 1)).toBe(0);
      t.dispose();
    }
  });

  it('supports browsers without requestPermission and never asks again on a re-centre tap', async () => {
    const h = new Host();
    h.DeviceOrientationEvent = {};
    const t = new TiltSteering(h);
    t.setActive(true);
    await t.enableFromTap();
    h.reading(0, 90);
    expect(t.ready).toBe(true);
    await t.enableFromTap();
    expect(t.ready).toBe(false);
    expect(h.requests).toBe(0);
    t.dispose();
  });

  /** A Host reading for a phone in landscape (angle 90, turned counter-clockwise as W3C reports it): `right` is the
   * sideways part of gravity, `up` the part toward the top of the screen (smaller = held flatter). */
  function landscape(h: Host, right: number, up: number): void {
    const b = Math.asin(-right), g = Math.asin(Math.max(-1, Math.min(1, -up / Math.cos(b))));
    h.reading(b / (Math.PI / 180), g / (Math.PI / 180));
  }

  it('is straight ahead when level, however the race started', async () => {
    const h = new Host(), t = new TiltSteering(h);
    t.setActive(true);
    await t.enableFromTap();
    t.setActive(false);
    // The race starts with the phone tilted 8 degrees (a thumb still on the Start button)...
    t.setActive(true);
    landscape(h, Math.sin(8 * Math.PI / 180), 0.9);
    expect(t.update(0.3, 1)).toBeGreaterThan(0.2);
    // ...and holding it level drives straight, not off to one side.
    landscape(h, 0, 0.9);
    expect(t.update(0.5, 1)).toBeCloseTo(0, 3);
    t.dispose();
  });

  it('steers the same for the same sideways tilt, upright or held nearly flat', async () => {
    const results: number[] = [];
    for (const pitchDeg of [0, 45, 70, 85]) {
      const h = new Host(), t = new TiltSteering(h);
      t.setActive(true);
      await t.enableFromTap();
      t.setActive(false);
      t.setActive(true);
      const right = Math.sin(6 * Math.PI / 180);
      landscape(h, right, Math.sqrt(1 - right * right) * Math.cos(pitchDeg * Math.PI / 180));
      results.push(t.update(0.5, 1));
      t.dispose();
    }
    for (const r of results) expect(r).toBeCloseTo(results[0], 3);
    expect(results[0]).toBeGreaterThan(0.15);
    expect(results[0]).toBeLessThan(0.25);
  });

  it('reads both landscape angle conventions the same way round', async () => {
    const steerFor = async (gammaUpright: number) => {
      const h = new Host(), t = new TiltSteering(h);
      t.setActive(true);
      await t.enableFromTap();
      t.setActive(false);
      t.setActive(true);
      h.reading(0, gammaUpright);
      t.update(0.2, 1);
      // Raise the right edge of the screen by 20 degrees. With the top of the screen at device +x (gamma -90) the
      // right edge is device -y; with it at device -x (gamma +90) the right edge is device +y.
      h.reading(gammaUpright < 0 ? -20 : 20, gammaUpright);
      return t.update(0.5, 1);
    };
    const w3c = await steerFor(-90), flipped = await steerFor(90);
    expect(w3c).toBeGreaterThan(0.7);
    expect(flipped).toBeCloseTo(w3c, 6);
  });

  it('limits a Centre tilt tap to 15 degrees from level', async () => {
    const h = new Host(), t = new TiltSteering(h);
    t.setActive(true);
    await t.enableFromTap();
    landscape(h, Math.sin(40 * Math.PI / 180), 0.6);
    landscape(h, Math.sin(15 * Math.PI / 180), 0.9);
    expect(t.update(0.5, 1)).toBeCloseTo(0, 3);
    t.dispose();
  });
});
