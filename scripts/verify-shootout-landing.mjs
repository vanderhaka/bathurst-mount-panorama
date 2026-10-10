#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5180/';
const output = resolve(process.argv[3] ?? 'artifacts/shootout-landing');
const quick = process.argv.includes('--quick');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const checks = [];
const errors = [];
let attemptWrites = 0;
const cases = [
  { name: 'shared-link-after-surfers', search: '', saved: 'gold-coast', circuit: 'bathurst', heading: 'Mount Panorama' },
  { name: 'surfers-explicit-link', search: '?track=gold-coast', saved: 'bathurst', circuit: 'gold-coast', heading: 'Surfers Paradise' },
  { name: 'shared-link-after-adelaide-phone', search: '?utm_source=reddit', saved: 'adelaide', circuit: 'bathurst', heading: 'Mount Panorama', phone: true },
  { name: 'adelaide-explicit-link-phone', search: '?track=adelaide', saved: 'gold-coast', circuit: 'adelaide', heading: 'Adelaide Parklands', phone: true },
  { name: 'unknown-track', search: '?track=unknown', saved: 'gold-coast', circuit: 'bathurst', heading: 'Mount Panorama' },
  { name: 'bathurst-explicit-link', search: '?track=bathurst', saved: 'gold-coast', circuit: 'bathurst', heading: 'Mount Panorama' },
  { name: 'other-circuit-shootout-link', search: '?track=gold-coast&shootout=top10', saved: 'bathurst', circuit: 'gold-coast', heading: 'Surfers Paradise' },
  { name: 'other-circuit-arcade-link', search: '?track=adelaide&shootout=arcade', saved: 'bathurst', circuit: 'adelaide', heading: 'Adelaide Parklands' },
];

function check(name, passed, actual) {
  checks.push({ name, passed, actual });
}

try {
  for (const fixture of quick ? cases.slice(0, 2) : cases) {
    const context = await browser.newContext({ viewport: fixture.phone ? { width: 844, height: 390 } : { width: 1440, height: 900 }, hasTouch: Boolean(fixture.phone) });
    await context.addInitScript(saved => {
      navigator.getGamepads = () => [];
      localStorage.setItem('bathurst.circuit.v1', saved);
      localStorage.setItem('bathurst.settings.v1', JSON.stringify({ onboarded: true, steerOnboarded: true, quality: 'low', autoQuality: false }));
      localStorage.setItem('bathurst.quality.v1', JSON.stringify({ quality: 'low', autoQuality: false }));
    }, fixture.saved);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/shootout') attemptWrites++;
    });
    const url = new URL(baseUrl);
    url.search = fixture.search;
    await page.goto(url.href);
    await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90_000 });
    const title = page.locator('.mn-screen--title');
    const activeCircuit = await page.evaluate(() => window.__game.world.track.id);
    const titleVisible = await title.isVisible();
    check(`${fixture.name}: circuit`, activeCircuit === fixture.circuit, activeCircuit);
    check(`${fixture.name}: title`, titleVisible, titleVisible);
    check(`${fixture.name}: menu unobstructed`, !await page.locator('#rotate').isVisible());
    if (titleVisible) {
      const heading = (await title.locator('h1').innerText()).replace(/\s+/g, ' ').trim();
      check(`${fixture.name}: heading`, heading.toUpperCase() === fixture.heading.toUpperCase(), heading);
      const shootoutVisible = fixture.circuit === 'bathurst';
      for (const name of ['Shootout Top 10', 'Shootout Arcade']) {
        const count = await title.getByRole('button', { name, exact: true }).count();
        check(`${fixture.name}: ${name}`, count === (shootoutVisible ? 1 : 0), count);
      }
      const buttons = await title.locator('.mn-title-options .mn-btn').evaluateAll(nodes => nodes.map(node => ({ index: node.querySelector('.mn-btn__idx')?.textContent, label: node.querySelector('.mn-btn__label')?.textContent })));
      check(`${fixture.name}: menu numbering`, buttons.every((button, i) => button.index === String(i + 1).padStart(2, '0')), buttons);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim());
      const expectedFocus = shootoutVisible ? 'Shootout Top 10' : await title.getByRole('group', { name: /^Circuit:/ }).getAttribute('aria-label');
      check(`${fixture.name}: initial focus`, focused === expectedFocus, focused);
      check(`${fixture.name}: horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth })));
      if (!shootoutVisible) {
        const labels = [];
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('ArrowDown');
          labels.push(await page.evaluate(() => document.activeElement?.querySelector('.mn-btn__label')?.textContent));
        }
        check(`${fixture.name}: keyboard options`, labels.join(',') === 'Time trial,Settings,Controls', labels);
      }
    }
    await page.screenshot({ path: resolve(output, `${fixture.name}.png`), animations: 'disabled' });
    if ((fixture.name === 'shared-link-after-surfers' || fixture.name === 'shared-link-after-adelaide-phone') && titleVisible && activeCircuit === 'bathurst') {
      const intro = page.locator('.mn-screen--shootout');
      for (const mode of ['Shootout Arcade', 'Shootout Top 10']) {
        await title.getByRole('button', { name: mode, exact: true }).click();
        const copy = await intro.innerText();
        check(`${mode}: introduction`, await intro.isVisible() && copy.toLowerCase().includes(mode.toLowerCase()), copy);
        check(`${mode}: rules`, mode === 'Shootout Arcade' ? /Unlimited runs/i.test(copy) : /three attempts/i.test(copy) && /nickname/i.test(copy), copy);
        await page.screenshot({ path: resolve(output, `${mode === 'Shootout Arcade' ? 'arcade' : 'top10'}-intro${fixture.phone ? '-phone' : ''}.png`), animations: 'disabled' });
        await intro.getByRole('button', { name: 'Back', exact: true }).click();
      }
      for (const circuit of fixture.phone ? [] : ['adelaide', 'gold-coast', 'bathurst']) {
        await title.getByRole('button', { name: 'Next circuit', exact: true }).click();
        await page.waitForFunction(expected => window.__shotReady && window.__game?.world.track.id === expected, circuit, { timeout: 90_000 });
        const count = await title.getByRole('button', { name: 'Shootout Top 10', exact: true }).count();
        check(`Circuit switch to ${circuit}`, await page.evaluate(() => window.__game.world.track.id) === circuit && count === (circuit === 'bathurst' ? 1 : 0), { circuit, top10: count, url: page.url() });
      }
    }
    await context.close();
  }
  check('No attempt or score writes', attemptWrites === 0, attemptWrites);
  check('No browser errors', errors.length === 0, errors);
  const failures = checks.filter(item => !item.passed);
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ baseUrl, checks, errors, attemptWrites }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failures.length, failures, errors, attemptWrites }));
  assert.equal(failures.length, 0, 'Shootout landing checks');
} finally {
  await browser.close();
}
