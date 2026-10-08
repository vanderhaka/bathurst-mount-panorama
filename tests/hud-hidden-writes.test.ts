import { afterEach, expect, it, vi } from 'vitest';
import { TyreFuelPanel } from '@/hud/tyre-fuel-panel';
import type { HudState } from '@/types/hud';
import { MenuNode, stubMenuDom } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

const brake = { tempC: 400, forceMultiplier: 1, energyJ: 0 };
const state = (brakes: boolean): HudState => ({
  speedKmh: 200, throttle: 1, brake: 0, steer: 0, tyreCompound: 'soft',
  lap: { number: 2, currentS: 30, lastS: null, bestS: null, deltaS: null, valid: true, currentSector: 0, sectors: [] },
  tyres: Array.from({ length: 4 }, () => ({ tempC: 95, wear: 0.1 })),
  fuel: { litres: 60, lapsLeft: 12 },
  brakes: brakes ? [brake, brake, brake, brake] : undefined,
} as unknown as HudState);

it('writes the tyre/fuel panel’s hidden flags only when they change, not every frame', () => {
  const doc = stubMenuDom();
  const writes = new Map<MenuNode, number>();
  doc.createElement = (tag: string): MenuNode => {
    const node = new MenuNode(tag, doc);
    let hidden = false;
    Object.defineProperty(node, 'hidden', { get: () => hidden, set: (v: boolean) => { hidden = v; writes.set(node, (writes.get(node) ?? 0) + 1); } });
    return node;
  };
  const panel = new TyreFuelPanel();
  const root = panel.el as unknown as MenuNode;
  const estimate = root.querySelectorAll('.hud-chip--est')[0], brakes = root.querySelectorAll('.hud-brakes')[0];
  for (let frame = 0; frame < 120; frame++) panel.update(state(true));
  expect(estimate.hidden).toBe(true);
  expect(brakes.hidden).toBe(false);
  expect(writes.get(estimate) ?? 0).toBeLessThanOrEqual(1);
  expect(writes.get(brakes) ?? 0).toBeLessThanOrEqual(1);
  for (let frame = 0; frame < 60; frame++) panel.update(state(false));
  expect(brakes.hidden).toBe(true);
  expect(writes.get(brakes) ?? 0).toBeLessThanOrEqual(2);
});
