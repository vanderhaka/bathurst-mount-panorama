import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveCircuit } from '@/track/circuits';
import { TitleScreen, titleHasShootout } from '@/ui/screens/title';
import { SWITCH_FADE_MS } from '@/ui/screens/title-switch';
import { stubMenuDom, type MenuNode } from './menu-dom-fixture';

beforeEach(() => { vi.useFakeTimers(); stubMenuDom(); vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setActiveCircuit('bathurst'); });

function open() {
  const switched: string[] = [];
  const started: string[] = [];
  const title = new TitleScreen({
    raceSetup: () => started.push('race'), race: () => started.push('time trial'), shootout: (m) => started.push(m), settings: () => started.push('settings'), controls() {},
    switchCircuit: (c) => switched.push(c),
  });
  const labels = (): string[] => title.items().map((el) => (el as unknown as MenuNode).textContent);
  return { title, switched, started, labels };
}

function find(node: MenuNode, cls: string): MenuNode | null {
  if (node.classList.contains(cls)) return node;
  for (const c of node.children) { const f = find(c, cls); if (f) return f; }
  return null;
}

describe('title screen per circuit', () => {
  it('offers the Shootout only on Bathurst', () => {
    expect(titleHasShootout('bathurst')).toBe(true);
    expect(titleHasShootout('adelaide')).toBe(false);
    const { title, labels } = open();
    expect(labels().join('|')).toContain('Shootout Top 10');
    expect(labels().join('|')).toContain('Shootout Arcade');
    setActiveCircuit('adelaide');
    title.render();
    expect(labels().join('|')).not.toContain('Shootout');
    expect(title.el.textContent).toContain('Adelaide');
    setActiveCircuit('bathurst');
    title.render();
    expect(labels().join('|')).toContain('Shootout Arcade');
  });

  it('shows the credit link only where a circuit has centreline data', () => {
    const { title } = open();
    const links = (): number => title.items().filter((el) => (el as unknown as MenuNode).tagName === 'a').length;
    expect(links()).toBe(0);
    setActiveCircuit('gold-coast');
    title.render();
    expect(links()).toBe(2);
  });

  it('cycling the Circuit row asks for the next circuit from the one being loaded (newest wins)', () => {
    const { title, switched } = open();
    const row = title.circuitItem() as unknown as MenuNode;
    row.click();
    row.click();
    expect(switched).toEqual(['adelaide', 'gold-coast']);
    expect(row.textContent).toContain('Surfers Paradise');
  });

  it('names the circuit being loaded in the header, so the name agrees with the map on the right', () => {
    const { title } = open();
    title.showSwitch('gold-coast', 0.3, 'Laying the asphalt');
    expect(title.el.textContent).toContain('Paradise');
    expect(title.el.textContent).toContain('Gold Coast · Queensland');
    expect(title.el.textContent).not.toContain('Panorama');
    title.endSwitch();
    expect(title.el.textContent).toContain('Panorama');
  });

  it('keeps the race buttons waiting while a circuit loads, and frees them when it ends', () => {
    const { title, started } = open();
    title.showSwitch('adelaide', 0.4, 'Laying the asphalt');
    const buttons = title.items() as unknown as MenuNode[];
    const trial = buttons.find((b) => b.textContent.includes('Time trial'))!;
    const settings = buttons.find((b) => b.textContent.includes('Settings'))!;
    expect(trial.getAttribute('aria-disabled')).toBe('true');
    trial.click();
    settings.click();
    expect(started).toEqual(['settings']);
    title.endSwitch();
    expect(trial.getAttribute('aria-disabled')).toBe('false');
    trial.click();
    expect(started).toEqual(['settings', 'time trial']);
  });

  it('fades the map out when the switch ends, and keeps it when a new switch starts during the fade', () => {
    const { title } = open();
    const map = (): MenuNode => find(title.el as unknown as MenuNode, 'mn-switch')!;
    title.showSwitch('adelaide', 0.9, 'World ready');
    title.endSwitch();
    expect(map().hidden).toBe(false);
    expect(map().getAttribute('data-leaving')).toBe('true');
    vi.advanceTimersByTime(SWITCH_FADE_MS);
    expect(map().hidden).toBe(true);
    title.showSwitch('gold-coast', 0.1, 'Reading circuit data');
    title.endSwitch();
    title.showSwitch('adelaide', 0.2, 'Reading circuit data');
    vi.advanceTimersByTime(SWITCH_FADE_MS);
    expect(map().hidden).toBe(false);
    expect(map().getAttribute('data-leaving')).toBe('false');
  });

  it('keeps the map and the waiting race buttons when the new world is in but the switch has not ended', () => {
    const { title } = open();
    const map = (): MenuNode => find(title.el as unknown as MenuNode, 'mn-switch')!;
    title.showSwitch('adelaide', 0.9, 'Placing reflections');
    setActiveCircuit('adelaide');
    title.render();
    const trial = (title.items() as unknown as MenuNode[]).find((b) => b.textContent.includes('Time trial'))!;
    expect(map().hidden).toBe(false);
    expect(map().getAttribute('data-leaving')).not.toBe('true');
    expect(trial.getAttribute('aria-disabled')).toBe('true');
    title.endSwitch();
    expect(map().getAttribute('data-leaving')).toBe('true');
    expect(trial.getAttribute('aria-disabled')).toBe('false');
  });

  it('shows the target circuit name with its progress, and goes back to the active one when cancelled', () => {
    const { title } = open();
    title.showSwitch('gold-coast', 0.5, 'Laying the asphalt');
    expect(title.el.textContent).toContain('Loading Surfers Paradise');
    expect(title.el.textContent).toContain('50%');
    title.endSwitch();
    expect((title.circuitItem() as unknown as MenuNode).textContent).toContain('Mount Panorama');
  });
});
