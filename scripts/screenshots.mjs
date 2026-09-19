// Captures 1280×800 Chrome Web Store / README screenshots into docs/store/.
//   npm run build && STEADY_CHROME=<chrome-for-testing> node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ext = path.join(root, 'dist');
const out = path.join(root, 'docs/store');
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const base = 'http://localhost:4173';

const ctx = await chromium.launchPersistentContext('', {
  ...(process.env.STEADY_CHROME ? { executablePath: process.env.STEADY_CHROME } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const bridge = (page, msg) => page.evaluate((m) => window.postMessage({ source: 'steady-demo', ...m }, location.origin), msg);

try {
  // 1. Tremor smoothing: red dot = raw (simulated 10 px tremor), black arrow = Steady's cursor.
  const demo = await ctx.newPage();
  await demo.goto(`${base}/index.html`);
  await demo.locator('#steady-status').filter({ hasText: 'Steady is on' }).waitFor();
  await bridge(demo, { type: 'SET_PROFILE', profileId: 'strong' });
  await demo.locator('#cal-tremor').fill('10');
  await demo.mouse.move(300, 470);
  for (let i = 1; i <= 60; i++) {
    await demo.mouse.move(300 + i * 7, 470 + Math.sin(i / 9) * 40);
    await demo.waitForTimeout(25);
  }
  await demo.waitForTimeout(700); // hold still: the red dot keeps shaking, the arrow does not
  await shot(demo, '1-tremor-smoothing');

  // 2. Target snap: ring on the nearest control, cursor in the gap.
  await demo.locator('#cal-tremor').fill('0');
  await demo.locator('#pointing').scrollIntoViewIfNeeded();
  await demo.locator('#fitts-start').click();
  const target = await demo.locator('.fitts-target.current').boundingBox();
  await demo.mouse.move(target.x + target.width + 28, target.y + target.height + 20, { steps: 20 });
  await demo.waitForTimeout(900);
  await shot(demo, '2-target-snap');
  await demo.locator('#fitts-stop').click();

  // 3. Dwell click countdown on the form task (Rest mode).
  await bridge(demo, { type: 'SET_PROFILE', profileId: 'rest' });
  await demo.locator('[data-task="form"]').click();
  await demo.locator('#f-email').scrollIntoViewIfNeeded();
  const email = await demo.locator('#f-email').boundingBox();
  await demo.mouse.move(email.x + 60, email.y + email.height / 2, { steps: 20 });
  await demo.waitForTimeout(800);
  await shot(demo, '3-dwell-click');

  // 4. Switch scanning breadcrumb (fixture page).
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    settings.activeProfileId = 'mild';
    settings.profiles.find((p) => p.id === 'mild').input.source = 'switch';
    await chrome.storage.sync.set({ settings });
  });
  const sp = await ctx.newPage();
  await sp.goto(`${base}/fixtures/news.html`);
  await sp.waitForTimeout(800);
  // hold = select, tap = next: Header › Items 1–8 › Link 2 of 8
  for (const press of ['hold', 'tap', 'hold', 'tap', 'tap']) {
    await sp.keyboard.down('Space');
    await sp.waitForTimeout(press === 'hold' ? 750 : 60);
    await sp.keyboard.up('Space');
    await sp.waitForTimeout(120);
  }
  await sp.waitForTimeout(300);
  await shot(sp, '4-switch-scanning');
  await sw.evaluate(async () => {
    const { settings } = await chrome.storage.sync.get('settings');
    settings.profiles.find((p) => p.id === 'mild').input.source = 'mouse';
    await chrome.storage.sync.set({ settings });
  });

  // 5. Settings page.
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await opt.waitForTimeout(400);
  await opt.locator('#h-filter').scrollIntoViewIfNeeded();
  await opt.locator('#trace-play').click();
  await opt.waitForTimeout(4300);
  await shot(opt, '5-settings');
  console.log(`Screenshots written to ${path.relative(root, out)}/`);
} finally {
  await ctx.close();
  server.kill();
}
