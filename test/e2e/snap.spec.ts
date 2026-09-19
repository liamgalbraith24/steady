import { test, expect } from './fixtures';
import { OverlayProbe, steadyPerf } from './overlay';
import type { Page } from '@playwright/test';

async function openFixture(page: Page, name: string) {
  const loaded = page.waitForEvent('console', (m) => m.text().includes('Steady loaded'));
  await page.goto(`/fixtures/${name}`);
  await loaded;
  await page.waitForTimeout(400); // scanner's first IntersectionObserver pass
}

const clicks = (page: Page) => page.evaluate(() => (window as unknown as { clicks: { id: string; trusted?: boolean }[] }).clicks);

test('clicking up to snapRadius away activates the highlighted target', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  // Button A spans x 100–180, y 100–140. Mild profile: snap radius 40 px.
  await page.mouse.move(140, 300);
  await page.mouse.move(140, 175, { steps: 10 }); // 35 px below A
  await page.waitForTimeout(600);
  const probe = await OverlayProbe.attach(page);
  await probe.resolve(['hl']);
  const hl = await probe.box('hl');
  expect(hl?.visible).toBe(true);
  expect(hl!.x).toBeLessThan(100);
  expect(hl!.x + hl!.w).toBeGreaterThan(180);
  await page.mouse.down();
  await page.mouse.up();
  expect(await clicks(page)).toEqual([{ id: 'a', trusted: false }]);
});

test('moving away before release cancels the press (pointer cancellation)', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  await page.mouse.move(140, 170, { steps: 5 });
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.mouse.move(140, 330, { steps: 10 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  expect(await clicks(page)).toEqual([]);
});

test('highlight does not flicker while hovering between adjacent buttons', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  const probe = await OverlayProbe.attach(page);
  await page.mouse.move(170, 120, { steps: 5 });
  await page.waitForTimeout(500);
  await probe.resolve(['hl']);
  // Jitter ±4 px around the 4 px gap between A (ends 180) and B (starts 184) for 1.5 s.
  const seen: number[] = [];
  for (let i = 0; i < 60; i++) {
    await page.mouse.move(182 + (i % 2 ? 4 : -4) + Math.sin(i) * 2, 120);
    const b = await probe.box('hl');
    seen.push(Math.round(b!.x));
    await page.waitForTimeout(20);
  }
  const changes = seen.filter((x, i) => i > 0 && x !== seen[i - 1]).length;
  expect(changes).toBe(0);
});

test('elements styled cursor:pointer (div buttons) are targets', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  await page.waitForTimeout(1200); // idle-time cursor:pointer sampling
  await page.mouse.move(385, 305, { steps: 5 }); // 25 px below the div button
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.mouse.up();
  expect(await clicks(page)).toEqual([{ id: 'div-button', trusted: false }]);
});

test('clicks far from any target reach the page normally (fail open)', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  await page.mouse.move(900, 650, { steps: 5 });
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.up();
  expect(await clicks(page)).toEqual([{ id: 'body' }]);
});

test('the panic toggle turns Steady off in the tab', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await openFixture(page, 'snap.html');
  await page.bringToFront();
  const tabId = await serviceWorker.evaluate(
    async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!,
  );
  // Send what the popup's panic button sends.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const off = page.waitForEvent('console', (m) => m.text().includes('Steady turned off'));
  await popup.evaluate((id) => chrome.runtime.sendMessage({ type: 'PANIC_TOGGLE', tabId: id }), tabId);
  await off;
  await page.bringToFront();
  await page.mouse.move(140, 175, { steps: 5 });
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.up();
  expect(await clicks(page)).toEqual([{ id: 'body' }]);
  const probe = await OverlayProbe.attach(page);
  expect(await probe.resolve(['ghost', 'hl'])).toEqual([]); // overlay removed entirely
});

test('scanner rebuild after a large DOM mutation stays under 16 ms (news fixture)', async ({ context }) => {
  const page = await context.newPage();
  await openFixture(page, 'news.html');
  const count = await page.evaluate(() => document.querySelectorAll('a[href], button').length);
  expect(count).toBeGreaterThan(3000);
  const results: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (window as unknown as { addMore: () => void }).addMore()); // +1800 interactive elements
    await page.waitForTimeout(400);
    results.push((await steadyPerf(page)).lastRebuildMs);
  }
  // Also sweep the pointer across the page to measure per-sample cost with a big DOM.
  for (let i = 0; i < 80; i++) await page.mouse.move(100 + i * 12, 200 + (i % 10) * 30);
  const perf = await steadyPerf(page);
  console.log(`news fixture: ${count} targets; rebuild ms after +1800 elements: ${results.join(', ')}; perf ${JSON.stringify(perf)}`);
  for (const ms of results) expect(ms).toBeLessThan(16);
  expect(perf.sample!.p95Ms).toBeLessThan(1);
});
