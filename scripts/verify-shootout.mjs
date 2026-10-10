#!/usr/bin/env node
// Native menu interactions plus a controlled 50 m/s lap fixture using the real RaceSession/LapTimer.
// The API is an explicit browser fixture. This does not verify a hosted leaderboard or manual driving.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5180/';
const output = resolve(process.argv[3] ?? 'artifacts/shootout');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const report = { api: 'Explicit browser fixture; not a hosted service', lapDriver: 'Controlled positions through real session/timer; not manual driving', checks: [] };
let submitted = 0;
let failNextSubmission = false;

async function open(viewport, fixture = true, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    navigator.getGamepads = () => [];
    if (!localStorage.getItem('bathurst.settings.v1')) localStorage.setItem('bathurst.settings.v1', JSON.stringify({ onboarded: true, steerOnboarded: true, damage: 'off', trackLimits: false, autoGears: true, touchAutoThrottle: true, quality: 'low', autoQuality: false }));
    localStorage.setItem('bathurst.quality.v1', JSON.stringify({ quality: 'low', autoQuality: false }));
  });
  if (fixture) await context.route('**/api/shootout', async route => {
    const request = route.request();
    let body = { available: true, entries: submitted ? [{ rank: 1, nickname: 'WASD Q E', car: 'camaro', timeS: 124.26 }] : [] };
    if (request.method() === 'POST') {
      const input = request.postDataJSON();
      assert.equal(input.format, 'top10');
      if (input.action === 'start') body = { attempt: { id: input.requestId, number: input.number, car: input.car, online: true, startedAt: new Date().toISOString() } };
      else {
        assert.equal(input.nickname, 'WASD Q E');
        if (failNextSubmission) {
          failNextSubmission = false;
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture connection interrupted.' }) });
          return;
        }
        submitted++; body = { publication: 'published' };
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90_000 });
  return { context, page };
}

const screen = (page, id) => page.locator(`.mn-screen--${id}`);
const press = async (page, name) => { await page.getByRole('button', { name, exact: true }).click(); };
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: resolve(output, `${name}.png`) }); };
const ledger = page => page.evaluate(() => JSON.parse(localStorage.getItem('bathurst.shootout.v1') ?? 'null'));
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); };

async function advance(page, target) {
  return page.evaluate(targetPhase => {
    const game = window.__game;
    game.state = 'paused'; // The fixture owns stepping so animation frames cannot move the car.
    const session = game.race.session;
    const vehicle = game.race.player.vehicle;
    while (!session.racing) session.updateLights(0.1);
    for (const wheel of vehicle.wheels) wheel.surface = 'road';
    for (let step = 0; step < 10_000 && session.shootout.phase !== targetPhase; step++) {
      vehicle.tp.s = session.track.wrapS(vehicle.tp.s + 50 / 30);
      session.update(1 / 30);
    }
    game.state = 'race'; // The next real game frame allocates or shows the result.
    return session.shootout.phase;
  }, target);
}

async function startMode(page, label) {
  await press(page, label);
  await screen(page, 'shootout').waitFor({ state: 'visible' });
  await press(page, 'Choose car');
  await screen(page, 'car').waitFor({ state: 'visible' });
  await press(page, 'Start warm-up');
  await page.waitForFunction(() => window.__game.state === 'race');
}

async function expireLap(page) {
  return page.evaluate(() => {
    const game = window.__game;
    game.state = 'paused';
    const session = game.race.session;
    while (!session.racing) session.updateLights(0.1);
    for (const wheel of game.race.player.vehicle.wheels) wheel.surface = 'road';
    session.update(599 - session.timer.lapTime);
    const before = session.shootout.phase;
    session.update(1);
    const after = session.shootout;
    game.state = 'race';
    return { before, after };
  });
}

try {
  if (!process.argv.includes('--timeout-only')) {
    const { page, context } = await open({ width: 1440, height: 900 });
    await shot(page, 'title-desktop');
    await press(page, 'Shootout Arcade');
    check('Arcade introduction says unlimited and no official score', /Unlimited runs/.test(await screen(page, 'shootout').innerText()));
    await shot(page, 'arcade-intro-desktop');
    check('Arcade hides competition-only controls and leaderboard', !await page.getByRole('button', { name: 'Finish last result', exact: true }).isVisible() && !await page.locator('.mn-shootout-board').isVisible());
    await press(page, 'Choose car');
    const cars = [];
    for (let i = 0; i < 4; i++) { cars.push(await page.evaluate(() => window.__game.attract.model.kind ?? document.querySelector('.mn-car__name').textContent)); await page.keyboard.press('ArrowRight'); }
    check('Car picker cycles Camaro, Mustang, Supra without Torana', new Set(cars).size === 3 && !cars.some(c => /Torana|A9X/i.test(c)));
    // Restore Camaro after the fourth step (picker now on Mustang).
    await page.keyboard.press('ArrowLeft');
    await press(page, 'Start warm-up');
    const rules = await page.evaluate(() => ({ mode: window.__game.race.session.mode, damage: window.__game.settings.damage, limits: window.__game.settings.trackLimits, gears: window.__game.settings.autoGears, assists: window.__game.settings.abs && window.__game.settings.tractionControl && window.__game.settings.steeringAssist, autoThrottle: window.__game.settings.touchAutoThrottle }));
    // Auto-throttle is a control choice, not a rule: the saved preference (on) stays.
    check('Arcade uses full damage, track limits, automatic gears and the stability aids', rules.mode === 'shootoutArcade' && rules.damage === 'full' && rules.limits && rules.gears && rules.assists && rules.autoThrottle);
    await page.evaluate(() => { window.__game.settings.hudSize = 'minimal'; });
    await page.locator('.bx-hud[data-size="minimal"] .hud-minimal').waitFor({ state: 'visible' });
    const clearMinimal = await page.evaluate(() => {
      const minimal = document.querySelector('.hud-minimal').getBoundingClientRect();
      const status = document.querySelector('.hud-shootout').getBoundingClientRect();
      return status.bottom <= minimal.top && status.left >= 0 && status.right <= innerWidth && status.top >= 0;
    });
    check('Shootout status leaves minimal speed, gear and lap fully visible', clearMinimal);
    await shot(page, 'arcade-minimal-desktop');
    await page.evaluate(() => { window.__game.settings.hudSize = 'full'; });
    await page.locator('.bx-hud[data-size="full"]').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await screen(page, 'pause').waitFor({ state: 'visible' });
    await press(page, 'Restart warm-up');
    check('Arcade warm-up restart creates no competition ledger', await ledger(page) === null);
    check('Arcade completes warm-up before timed lap', await advance(page, 'ready') === 'ready');
    await page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
    check('Arcade flying lap has no competition attempt', await page.evaluate(() => window.__game.race.session.shootout.attempt === null));
    await shot(page, 'arcade-timed-desktop');
    check('Arcade stops after one flying lap', await advance(page, 'finished') === 'finished');
    await screen(page, 'shootoutResult').waitFor({ state: 'visible' });
    check('Arcade result offers unlimited repeat and no nickname', await page.getByRole('button', { name: 'Another warm-up', exact: true }).isVisible() && !await page.locator('#shootout-nickname').isVisible());
    await shot(page, 'arcade-result-desktop');
    await press(page, 'Main menu');
    const restored = await page.evaluate(() => ({ live: window.__game.settings, saved: JSON.parse(localStorage.getItem('bathurst.settings.v1')) }));
    check('Time-trial preferences restored after pro Shootout', restored.live.damage === 'off' && restored.saved.damage === 'off' && restored.live.autoGears && restored.live.touchAutoThrottle && restored.saved.touchAutoThrottle && !restored.live.trackLimits);
    await press(page, 'Shootout Top 10');
    await page.waitForFunction(() => !document.querySelector('.mn-screen--shootout .mn-btn--primary').disabled);
    await shot(page, 'top10-intro-desktop');
    await press(page, 'Choose car'); await press(page, 'Start warm-up');
    check('Top 10 warm-up does not allocate an attempt', await ledger(page) === null);
    await page.keyboard.press('Escape'); await screen(page, 'pause').waitFor({ state: 'visible' });
    check('Warm-up pause explains free restart and quit', /uses no competition attempt/.test(await screen(page, 'pause').innerText()));
    await press(page, 'Restart warm-up');
    check('Top 10 warm-up restart remains free', await ledger(page) === null);
    check('Top 10 finishes warm-up at line', await advance(page, 'ready') === 'ready');
    await page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
    check('Crossing into timed lap durably consumes one attempt', (await ledger(page)).attempts.length === 1);
    await shot(page, 'top10-timed-desktop');
    await advance(page, 'finished'); await screen(page, 'shootoutResult').waitFor({ state: 'visible' });
    await page.locator('#shootout-nickname').fill('W');
    await page.keyboard.type('ASD Q E');
    await page.keyboard.press('Backspace'); await page.keyboard.type('E');
    check('Nickname accepts WASD Q E, spaces and Backspace as normal text', await page.locator('#shootout-nickname').inputValue() === 'WASD Q E');
    await press(page, 'Skip leaderboard');
    check('Skip warns about lost recognition and used attempt before acting', /not count as a leaderboard score/.test(await page.locator('.mn-shootout-warning').innerText()) && (await ledger(page)).attempts.length === 1 && submitted === 0);
    await shot(page, 'skip-warning-desktop');
    await press(page, 'Keep my score');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.mn-screen--shootoutResult .mn-shootout-status').textContent.includes('Score submitted'));
    check('Native Enter submits nickname and shows confirmation', submitted === 1);
    await press(page, 'Next warm-up'); await press(page, 'Start warm-up');
    check('Every new competition attempt starts with a fresh warm-up', await page.evaluate(() => window.__game.race.session.shootout.phase === 'warmup') && (await ledger(page)).attempts.length === 1);
    await advance(page, 'ready'); await page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
    await page.keyboard.press('Escape'); await screen(page, 'pause').waitFor({ state: 'visible' });
    await press(page, 'Quit to menu');
    check('Quitting a started timed lap keeps the attempt consumed', (await ledger(page)).attempts.length === 2);
    await startMode(page, 'Shootout Top 10');
    await advance(page, 'ready'); await page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
    await advance(page, 'finished'); await screen(page, 'shootoutResult').waitFor({ state: 'visible' });
    await press(page, 'Skip leaderboard'); await press(page, 'Skip this score');
    check('Confirmed nickname skip leaves no score but consumes third attempt', submitted === 1 && (await ledger(page)).attempts.length === 3);
    check('No fourth competition warm-up offered from result', await page.getByRole('button', { name: 'Next warm-up', exact: true }).isDisabled());
    await shot(page, 'exhausted-result-desktop');
    await page.reload(); await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90_000 });
    await press(page, 'Shootout Top 10');
    check('Reload retains the three-attempt limit', (await ledger(page)).attempts.length === 3 && await page.getByRole('button', { name: 'Choose car', exact: true }).isDisabled());
    await shot(page, 'exhausted-intro-desktop');
    await press(page, 'Practice in Arcade'); await press(page, 'Choose car'); await press(page, 'Start warm-up');
    check('Arcade stays available after all competition attempts are used', await page.evaluate(() => window.__game.race.session.mode === 'shootoutArcade') && (await ledger(page)).attempts.length === 3);
    await context.close();

    const queued = await open({ width: 1440, height: 900 });
    await startMode(queued.page, 'Shootout Top 10');
    await advance(queued.page, 'ready'); await queued.page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
    await advance(queued.page, 'finished'); await screen(queued.page, 'shootoutResult').waitFor({ state: 'visible' });
    await queued.page.locator('#shootout-nickname').fill('WASD Q E');
    failNextSubmission = true;
    await press(queued.page, 'Submit to leaderboard');
    await queued.page.getByRole('button', { name: 'Retry submission', exact: true }).waitFor({ state: 'visible' });
    check('Queued score offers retry and Main menu, with no impossible skip', !await queued.page.getByRole('button', { name: 'Skip leaderboard', exact: true }).isVisible() && await queued.page.getByRole('button', { name: 'Main menu', exact: true }).isVisible());
    await press(queued.page, 'Main menu'); await press(queued.page, 'Shootout Top 10'); await press(queued.page, 'Finish last result');
    await press(queued.page, 'Retry submission');
    await queued.page.waitForFunction(() => document.querySelector('.mn-screen--shootoutResult .mn-shootout-status').textContent.includes('Score submitted'));
    check('Queued score resumes and publishes with the same used attempt', (await ledger(queued.page)).attempts.length === 1 && submitted === 2);
    await queued.context.close();

    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
      const phone = await open(viewport, true, true);
      await press(phone.page, 'Shootout Top 10');
      await phone.page.waitForTimeout(100);
      await shot(phone.page, `top10-intro-${viewport.width}x${viewport.height}`);
      const layout = await phone.page.locator('.mn-panel--shootout').evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: innerWidth, height: innerHeight }; });
      check(`Introduction fits ${viewport.width}x${viewport.height} phone viewport`, layout.left >= 0 && layout.right <= layout.width && layout.top >= 0 && layout.bottom <= layout.height);
      const firstStep = await phone.page.locator('.mn-shootout-steps li').first().evaluate(el => {
        const step = el.getBoundingClientRect(), columns = document.querySelector('.mn-shootout-columns').getBoundingClientRect();
        return step.top >= columns.top - 1 && step.bottom <= columns.bottom + 1;
      });
      check(`Step 01 is visible on introduction at ${viewport.width}x${viewport.height}`, firstStep);
      await phone.page.getByRole('button', { name: 'Choose car', exact: true }).tap();
      await phone.page.getByRole('button', { name: 'Start warm-up', exact: true }).tap();
      await phone.page.getByRole('button', { name: 'Shift up', exact: true }).waitFor({ state: 'visible' });
      await phone.page.getByRole('button', { name: 'Shift up', exact: true }).tap();
      await phone.page.waitForFunction(() => window.__game.race.player.vehicle.pt.gear === 2);
      await phone.page.waitForTimeout(250);
      await phone.page.getByRole('button', { name: 'Shift down', exact: true }).tap();
      await phone.page.waitForFunction(() => window.__game.race.player.vehicle.pt.gear === 1);
      check(`Touch gear buttons shift the real pro car at ${viewport.width}x${viewport.height}`, true);
      await shot(phone.page, `pro-touch-${viewport.width}x${viewport.height}`);
      if (viewport.width === 844) {
        await phone.page.setViewportSize({ width: 390, height: 844 });
        await phone.page.locator('#rotate').waitFor({ state: 'visible' });
        await phone.page.waitForFunction(() => window.__game.state === 'paused', null, { timeout: 3000 });
        check('Portrait phone shows rotation guidance and pauses the lap', await phone.page.evaluate(() => window.__game.state === 'paused'));
        await shot(phone.page, 'phone-portrait-rotation');
      }
      await phone.context.close();
    }
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 667, height: 375 }]) {
    for (const mode of ['Shootout Top 10', 'Shootout Arcade']) {
      const run = await open(viewport, true, viewport.width === 667);
      await startMode(run.page, mode);
      const intro = await run.page.evaluate(() => document.querySelector('.mn-screen--shootout').textContent);
      check(`${mode} introduction explains the 10-minute lap limit`, intro.includes('10-minute limit'));
      for (const phase of ['warmup', 'timed']) {
        if (phase === 'timed') {
          await press(run.page, mode === 'Shootout Top 10' ? 'Restart warm-up' : 'Another warm-up');
          await press(run.page, 'Start warm-up');
          await advance(run.page, 'ready');
          await run.page.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
        }
        const result = await expireLap(run.page);
        check(`${mode} ${phase} runs below 10 minutes and stops at the limit`, result.before === phase && result.after.phase === 'finished' && result.after.outcome.kind === 'invalid' && result.after.outcome.timeS === null);
        await screen(run.page, 'shootoutResult').waitFor({ state: 'visible' });
        const copy = await screen(run.page, 'shootoutResult').innerText();
        check(`${mode} ${phase} timeout clearly ends with no nickname submission`, /Shootout session ended/i.test(copy) && copy.includes('10-minute lap limit reached') && /No score/i.test(copy) && !await run.page.locator('#shootout-nickname').isVisible() && await run.page.getByRole('button', { name: 'Main menu', exact: true }).isVisible());
        const attempts = await ledger(run.page);
        check(`${mode} ${phase} timeout preserves correct attempt use`, mode === 'Shootout Arcade' ? attempts === null : phase === 'warmup' ? attempts === null && copy.includes('No competition attempt used') : attempts.attempts.length === 1 && copy.includes('Attempt 1 of 3 used'));
        const frozen = await run.page.evaluate(() => {
          const session = window.__game.race.session;
          const clock = session.timer.lapTime;
          session.update(2);
          return window.__game.state === 'paused' && session.timer.lapTime === clock;
        });
        check(`${mode} ${phase} timeout freezes session at ${viewport.width}x${viewport.height}`, frozen);
        const menuBounds = await run.page.getByRole('button', { name: 'Main menu', exact: true }).evaluate(el => {
          const b = el.getBoundingClientRect();
          return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
        });
        check(`${mode} ${phase} timeout exit is visible at ${viewport.width}x${viewport.height}`, menuBounds);
        await shot(run.page, `timeout-${mode === 'Shootout Top 10' ? 'top10' : 'arcade'}-${phase}-${viewport.width}x${viewport.height}`);
      }
      await press(run.page, 'Main menu');
      await screen(run.page, 'title').waitFor({ state: 'visible' });
      check(`${mode} timeout returns to Main menu at ${viewport.width}x${viewport.height}`, true);
      await run.context.close();
    }
  }
  if (!process.argv.includes('--timeout-only')) {
    const offline = await open({ width: 1440, height: 900 }, false);
    await offline.context.route('**/api/shootout', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ available: false, entries: [] }) }));
    await press(offline.page, 'Shootout Top 10');
    await offline.page.waitForFunction(() => document.querySelector('.mn-shootout-status').textContent.includes('not connected'));
    check('Unconfigured competition is clearly unavailable and offers Arcade', await offline.page.getByRole('button', { name: 'Choose car', exact: true }).isDisabled() && await offline.page.getByRole('button', { name: 'Practice in Arcade', exact: true }).isVisible());
    await shot(offline.page, 'unconfigured-desktop');
    await offline.context.close();
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
