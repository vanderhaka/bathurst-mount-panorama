import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULTS, installPadFixture, checkSetupView, checkLive } from './verify-setup.mjs';

test('inactive fixture forwards original Gamepad API receiver and return unchanged', () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), oldWindow = globalThis.window;
  const native = [{ id: 'Physical pad', connected: true }]; let receiver, calls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads() { receiver = this; calls++; return native; } } });
  globalThis.window = {};
  try {
    installPadFixture(); assert.equal(navigator.getGamepads(), native); assert.equal(receiver, navigator); assert.equal(calls, 1);
    window.__setupPadFixture.enabled = true; window.__setupPadFixture.pressed = [10, 11, 5, 3];
    const pads = navigator.getGamepads(); assert.equal(calls, 2); assert.equal(pads[1], native[0]);
    assert.equal(pads[0].mapping, 'standard'); assert.equal(pads[0].buttons.length, 17);
    assert.deepEqual(pads[0].buttons.map((button, index) => button.pressed ? index : null).filter(index => index !== null), [3, 5, 10, 11]);
    assert.ok(pads[0].buttons.filter(button => button.pressed).every(button => button.value === 1));
    assert.deepEqual(pads[0].axes, [0, 0, 0, 0]);
    window.__setupPadFixture.enabled = false; assert.equal(navigator.getGamepads(), native);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

const labels = ['Brake bias', 'Front anti-roll bar', 'Rear anti-roll bar', 'Front tyre pressure', 'Rear tyre pressure'];
function view() {
  return { tab: 'Setup', car: 'camaro', name: 'Camaro ZL1', doneVisible: true, tabs: ['Driving assists', 'Setup'],
    rows: Object.entries(DEFAULTS).map(([, value], i) => ({ label: labels[i], value, changed: 'false',
      text: ['60.0% front', '52 kN/m', '26 kN/m', '150 kPa · 21.8 psi', '150 kPa · 21.8 psi'][i] })) };
}
test('Setup checks exact car, values, units, default indicators and reachable Done', () => {
  assert.deepEqual(checkSetupView(view(), 'camaro', DEFAULTS).setup, DEFAULTS);
  for (const alter of [v => v.car = 'mustang', v => v.rows[3].value = 155, v => v.rows[3].text = '150 psi',
    v => v.rows[0].changed = 'true', v => v.doneVisible = false, v => v.rows.reverse()]) {
    const changed = view(); alter(changed); assert.throws(() => checkSetupView(changed, 'camaro', DEFAULTS));
  }
});
test('live checks reject stale setups, wrong active cars and mutated source specifications', () => {
  const actual = { state: 'race', car: 'camaro', setup: { ...DEFAULTS, brakeBiasFront: .605 }, specBias: .6 };
  checkLive(actual, 'camaro', { ...DEFAULTS, brakeBiasFront: .605 });
  assert.throws(() => checkLive(actual, 'camaro', DEFAULTS));
  assert.throws(() => checkLive(actual, 'mustang', actual.setup));
  assert.throws(() => checkLive({ ...actual, specBias: .605 }, 'camaro', actual.setup));
  assert.throws(() => checkLive({ ...actual, state: 'paused' }, 'camaro', actual.setup));
});
