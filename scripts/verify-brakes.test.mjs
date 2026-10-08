import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { adjustmentDirection, checkDisplay, checkFresh, checkNormal, observeBrakes } from './verify-brakes.mjs';

const discs = (tempC = 22, energyJ = 0, forceMultiplier = 1) => Array.from({ length: 4 }, () => ({ tempC, energyJ, forceMultiplier }));
const spots = () => Array.from({ length: 4 }, () => ({ severity: 0, gripMultiplier: 1 }));
const fresh = () => ({ discs: discs(), spots: spots(), tyres: Array.from({ length: 4 }, () => ({ tempC: 52, wear: 0 })), fuelL: 80, compound: 'hard' });
const normal = () => ({ laps: [0, 1, 2].map(i => ({ standing: i === 0, valid: true, timeS: 125,
  discs: discs(500 + 50 * i, 4e6 * (i + 1)), fuelL: 76 - 4 * i })), recoveries: [],
  phases: { normal: { impacts: [], peakC: 600, minForce: 1, maxSpot: 0, cooling: 200 } } });

test('reaches Off by decreasing a clamped range while preserving toggle cycling', () => {
  assert.equal(adjustmentDirection(.5, 0), 'Previous');
  assert.equal(adjustmentDirection(1, 0), 'Previous');
  assert.equal(adjustmentDirection(.5, 1), 'Next');
  assert.equal(adjustmentDirection(true, false), 'Next');
  assert.equal(adjustmentDirection(false, true), 'Next');
});

test('requires real completions, normal cooling, retained ABS tyres and no collision/fade', () => {
  assert.equal(checkNormal(normal()).peakC, 600);
  for (const change of [p => p.laps.pop(), p => p.phases.normal.impacts.push({ speed: 1 }),
    p => p.phases.normal.minForce = .9, p => p.phases.normal.maxSpot = .001,
    p => p.phases.normal.cooling = 0, p => p.recoveries.push({})]) {
    const probe = normal(); change(probe); assert.throws(() => checkNormal(probe));
  }
});

test('checks selected fresh set and actual °C/fade/glow rather than a positive brake input', () => {
  checkFresh(fresh(), 'hard'); const damaged = fresh(); damaged.spots[0].severity = .1;
  assert.throws(() => checkFresh(damaged, 'hard')); assert.throws(() => checkFresh(fresh(), 'soft'));
  const state = { references: true, profileRetained: true, discs: discs(820, 123, .8),
    hud: { front: '820', rear: '820', fading: 'true', fade: 'FADE 20%' }, discMeshes: Array(4).fill(340 / 350 * 3.2) };
  checkDisplay(state); assert.throws(() => checkDisplay({ ...state, discMeshes: Array(4).fill(0) }));
  assert.throws(() => checkDisplay({ ...state, hud: { ...state.hud, front: '819' } }));
});

test('observers preserve original receivers, arguments, results and owned persistent model state', () => {
  const state = fresh(), vin = { brake: 1 }, result = [], token = {}, calls = [];
  const v = { brakes: { discs: state.discs }, flatSpots: { tyres: state.spots }, stint: { tyres: state.tyres,
    fuel: { litres: 80 }, tyreModel: { compound: 'hard' } }, telemetry: { brake: 1 }, speed: 50, tp: { s: 1300 } };
  const car = { vehicle: v, simulate(...args) { calls.push({ receiver: this, args }); return result; } };
  const session = { update(...args) { calls.push({ receiver: this, args }); return null; },
    resetToTrack(...args) { calls.push({ receiver: this, args }); return token; }, placeOnGrid() { return token; } };
  const rig = { update() { return token; } }, before = JSON.stringify(state);
  globalThis.window = { __game: { race: { player: car, session, profiles: { ai: { speed: new Float32Array(4) } } }, rig } };
  try {
    observeBrakes(); assert.equal(car.simulate(vin, .01), result); assert.equal(session.update(.01), null);
    assert.equal(session.resetToTrack(token), token); assert.equal(rig.update(token, .01), token);
    assert.equal(calls[0].receiver, car); assert.deepEqual(calls[0].args, [vin, .01]);
    assert.equal(calls[1].receiver, session); assert.equal(calls[2].args[0], token);
    assert.equal(JSON.stringify(state), before); assert.deepEqual(window.__brakesProbe.recoveries[0].before, window.__brakesProbe.recoveries[0].after);
  } finally { delete globalThis.window; }
});

test('counts four brake instances in the existing shared disc mesh', () => {
  const state = { references: true, profileRetained: true, discs: discs(820, 123, .8),
    hud: { front: '820', rear: '820', fading: 'true', fade: 'FADE 20%' },
    discMeshes: [340 / 350 * 3.2], discInstanceCounts: [4] };
  checkDisplay(state);
  assert.throws(() => checkDisplay({ ...state, discInstanceCounts: [3] }));
  assert.throws(() => checkDisplay({ ...state, discMeshes: [0] }));
});
