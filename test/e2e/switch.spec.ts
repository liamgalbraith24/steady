import { test, expect } from './fixtures';
import { OverlayProbe } from './overlay';
import type { Page, Worker } from '@playwright/test';

async function useSwitch(sw: Worker, cfg: Record<string, unknown>) {
  await sw.evaluate(async (c) => {
    type S = { profiles: { input: { source: string; switch?: Record<string, unknown> } }[] };
    let s: S | undefined;
    for (let i = 0; !s && i < 50; i++) {
      s = (await chrome.storage.sync.get('settings')).settings as S | undefined;
      if (!s) await new Promise((r) => setTimeout(r, 50));
    }
    for (const p of s!.profiles) p.input = { ...p.input, source: 'switch', switch: { key: 'Space', mode: 'manual', scanIntervalMs: 1500, longPressMs: 600, ...c } };
    await chrome.storage.sync.set({ settings: s });
  }, cfg);
}

async function open(page: Page) {
  const loaded = page.waitForEvent('console', (m) => m.text().includes('Steady loaded'));
  await page.goto('/fixtures/switch.html');
  await loaded;
  await page.waitForTimeout(400);
  const probe = await OverlayProbe.attach(page);
  await probe.resolve(['crumb', 'scan']);
  return probe;
}

const tap = async (page: Page, key = 'Space') => {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
  await page.waitForTimeout(60);
};
const hold = async (page: Page) => {
  await page.keyboard.down('Space');
  await page.waitForTimeout(750);
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
};
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { clicks: string[] }).clicks);
const crumb = async (probe: OverlayProbe) => (await probe.box('crumb'))?.text;

test('one switch: short press scans, long press selects, with a breadcrumb', async ({ context, serviceWorker }) => {
  await useSwitch(serviceWorker, {});
  const page = await context.newPage();
  const probe = await open(page);
  expect(await crumb(probe)).toBe('Header (3 items)');
  expect((await probe.box('scan'))?.visible).toBe(true);
  await tap(page); // → Main
  expect(await crumb(probe)).toBe('Main (3 items)');
  await hold(page); // descend
  expect(await crumb(probe)).toBe('Main › Back (up to top)');
  await tap(page); // → Orders
  await hold(page);
  await tap(page); // → Save
  expect(await crumb(probe)).toBe('Main › Orders › Button 1 of 2: Save');
  await hold(page);
  expect(await clicks(page)).toEqual(['save']);
  // Space never scrolled the page or typed anything.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(500);
  expect(await crumb(probe)).toBe('Header (3 items)'); // back to the top after selecting
});

test('two switches: Space moves on, Enter selects; Escape goes back up', async ({ context, serviceWorker }) => {
  await useSwitch(serviceWorker, { selectKey: 'Enter' });
  const page = await context.newPage();
  const probe = await open(page);
  await tap(page, 'Enter'); // into Header
  await tap(page); // Alpha
  await tap(page); // Beta
  expect(await crumb(probe)).toBe('Header › Link 2 of 3: Beta');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  expect(await crumb(probe)).toBe('Header (3 items)');
  await tap(page, 'Enter');
  await tap(page);
  await tap(page, 'Enter');
  expect(await clicks(page)).toEqual(['Alpha']);
});

test('automatic scanning moves on by itself; a press selects', async ({ context, serviceWorker }) => {
  await useSwitch(serviceWorker, { mode: 'auto', scanIntervalMs: 500 });
  const page = await context.newPage();
  const probe = await open(page);
  const first = await crumb(probe);
  await page.waitForTimeout(560); // one automatic step (the timer started at page load)
  const second = await crumb(probe);
  expect(second).not.toBe(first);
  expect(['Header (3 items)', 'Main (3 items)']).toContain(second);
  await tap(page); // select → descend into the highlighted group
  expect(['Header › Back (up to top)', 'Main › Back (up to top)']).toContain(await crumb(probe));
});

test('a <select> opens Steady\'s option list, which is scanned too', async ({ context, serviceWorker }) => {
  await useSwitch(serviceWorker, { selectKey: 'Enter' });
  const page = await context.newPage();
  const probe = await open(page);
  await tap(page); // Main
  await tap(page, 'Enter');
  await tap(page); // Orders
  await tap(page); // Size (the lone control under "Details" collapses to the item)
  expect(await crumb(probe)).toBe('Main › List 2 of 2: Size'); // "of N" counts controls, not the Back entry
  await tap(page, 'Enter');
  await page.waitForTimeout(500); // tree rebuilds around the picker
  await probe.resolve(['crumb']);
  expect(await crumb(probe)).toBe('Option 1 of 4: Small'); // 3 options + Cancel
  await tap(page);
  await tap(page);
  await tap(page, 'Enter');
  await expect(page.locator('#size')).toHaveValue('Large');
});
