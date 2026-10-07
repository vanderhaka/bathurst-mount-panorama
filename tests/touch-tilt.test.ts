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

  it('calibrates a neutral pose, steers in both landscape rotations and re-centres', async () => {
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
      t.calibrate();
      h.reading(Math.sign(angle) * 24, Math.sign(angle) * 90);
      expect(t.update(0.2, 1)).toBeCloseTo(0);
      t.dispose();
    }
    expect(screenRoll(60, 0, 0)).toBeCloseTo(0);
    expect(screenRoll(0, 0, 90)).toBeNull(); // flat: no useful roll reference
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
    h.reading(10, -90);
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
});
