import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { AttractMode } from '@/game/attract-mode';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { RaceSession } from '@/game/race-session';
import { TyreFuelPanel } from '@/hud/tyre-fuel-panel';
import { tyreBand } from '@/hud/tyre-fuel-model';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import { adjust } from '@/ui/screen';
import { CarSelectScreen } from '@/ui/screens/car-select';
import { TouchElement } from './touch-dom-fixture';

class MenuElement extends TouchElement {
  hidden = false;
  getAttribute(key: string): string | null { return this.attributes[key] ?? null; }
  replaceChildren(...children: Array<TouchElement | string>): void {
    this.children.length = 0;
    this.text.length = 0;
    this.append(...children);
  }
}
const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
function entity(): CarEntity {
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  vehicle.reset(900, 0);
  return {
    vehicle, livery: { number: 6, primary: 0xff0000 },
    model: { root: new THREE.Object3D(), dispose() {} },
    sync() {}, repair: () => vehicle.repair(), reset: (s: number, d: number) => vehicle.reset(s, d),
    simulate: (input: VehicleInput, dt: number, step?: (input: VehicleInput) => void) => {
      step?.(input); return vehicle.step(input, dt);
    },
  } as unknown as CarEntity;
}
afterEach(() => vi.unstubAllGlobals());

describe('tyre runtime wiring without a renderer', () => {
  it('shows the real temperatures and tread, removes EST and uses the selected temperature window', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new MenuElement(tag) });
    const car = entity(), session = new RaceSession('camaro', track, line, car, 'hard');
    car.vehicle.stint.reset({ compound: 'hard', tempC: 108, wear: 0.3, fuelL: 20 });
    const state = buildHudState(session, computeSpeedProfile(track, line, car.vehicle.spec), DEFAULT_SETTINGS, 60, null);
    const panel = new TyreFuelPanel();
    panel.update(state);
    const root = panel.el as unknown as MenuElement;
    expect(root.find('hud-chip--est')).toHaveProperty('hidden', true);
    expect(root.attributes['aria-label']).toBe('Tyres, brakes and fuel');
    expect(root.find('hud-tyre__t').textContent).toBe('108');
    expect(root.find('hud-tyre__life-fill').properties['--f']).toBe('0.7');
    expect(root.find('hud-tyre').dataset.band).toBe('ok');
    expect(tyreBand(108, 'soft')).toBe('hot');
    expect(tyreBand(108, 'hard')).toBe('ok');
    expect(car.vehicle.stint.tyres[0].tempC).toBe(108);
    expect(car.vehicle.stint.tyres[0].wear).toBe(0.3);
  });

  it('selects soft or hard for the next session without changing a running stint', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new MenuElement(tag) });
    const car = entity(), race = new RaceSession('camaro', track, line, car);
    race.placeOnGrid();
    const start = vi.fn(), preview = vi.fn();
    const screen = new CarSelectScreen({ start, preview, back() {} });
    const items = screen.items();
    expect(items[2].getAttribute('aria-label')).toContain('Soft');
    expect(adjust(items[2], 1)).toBe(true);
    expect(items[2].getAttribute('aria-label')).toContain('Hard');
    expect(car.vehicle.stint.tyreModel.compound).toBe('soft');
    (items[3] as unknown as MenuElement).dispatch('click');
    expect(start).toHaveBeenLastCalledWith('camaro', 0, 'hard');
    adjust(items[2], -1);
    (items[3] as unknown as MenuElement).dispatch('click');
    expect(start).toHaveBeenLastCalledWith('camaro', 0, 'soft');
    expect(preview).not.toHaveBeenCalled();
  });

  it('fits warm fresh tyres and 80 L when the title demo starts and every time it loops', () => {
    const car = entity(), v = car.vehicle;
    v.stint.reset({ fuelL: 12, tempC: 52, wear: 0.5 });
    const attract = new AttractMode(new THREE.Scene(), new THREE.PerspectiveCamera());
    attract.set(car, line);
    expect(v.stint.fuel.litres).toBe(80);
    expect(v.stint.tyres[0].tempC).toBe(95);
    v.stint.reset({ fuelL: 15, tempC: 52, wear: 0.5 });
    v.stint.placeOnTrack(track.startLineS - 1);
    v.stint.advance(v.telemetry, 1 / 360, track.startLineS + 1, track.startLineS, track.length);
    attract.frame(1 / 360, true, () => {}, new THREE.Vector3());
    expect(v.stint.fuel.litres).toBeGreaterThan(79.99);
    expect(v.stint.tyres[0].tempC).toBeGreaterThan(94.9);
    expect(v.stint.tyres[0].wear).toBeLessThan(0.001);
  });
});
