import { test, expect } from './fixtures';
import { OverlayProbe } from './overlay';
import type { Page } from '@playwright/test';

async function open(page: Page) {
  const loaded = page.waitForEvent('console', (m) => m.text().includes('Steady loaded'));
  await page.goto('/fixtures/menu.html');
  await loaded;
  await page.waitForTimeout(300);
}
const menuOpen = (page: Page) => page.locator('#sub').isVisible();

test('leaving the trigger toward the menu keeps it open', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(160, 300);
  await page.mouse.move(130, 120, { steps: 10 }); // onto "Products"
  await page.waitForTimeout(600);
  expect(await menuOpen(page)).toBe(true);
  // Travel slowly and diagonally toward "Phones" (3rd item, lower right), crossing the gap.
  const phones = (await page.locator('#i3').boundingBox())!;
  const target = { x: phones.x + phones.width * 0.8, y: phones.y + phones.height / 2 };
  let openThroughout = true;
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(130 + ((target.x - 130) * i) / 20, 120 + ((target.y - 120) * i) / 20);
    await page.waitForTimeout(40);
    if (!(await menuOpen(page))) openThroughout = false;
  }
  expect(openThroughout).toBe(true);
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(['i3']);
});

test('without Steady the same path closes the menu (control)', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await open(page);
  await page.bringToFront();
  const tabId = await serviceWorker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate((id) => chrome.runtime.sendMessage({ type: 'PANIC_TOGGLE', tabId: id }), tabId);
  await popup.close();
  await page.mouse.move(130, 120, { steps: 5 });
  await page.waitForTimeout(200);
  expect(await menuOpen(page)).toBe(true);
  await page.mouse.move(135, 143, { steps: 2 }); // into the gap
  expect(await menuOpen(page)).toBe(false);
});

test('leaving away from the menu closes it after hoverPersistMs', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(130, 120, { steps: 10 });
  await page.waitForTimeout(600);
  expect(await menuOpen(page)).toBe(true);
  await page.mouse.move(130, 60, { steps: 3 }); // straight up, away from the menu below
  await page.waitForTimeout(400);
  expect(await menuOpen(page)).toBe(true); // held (mild profile: 1500 ms)
  await page.waitForTimeout(1800);
  expect(await menuOpen(page)).toBe(false);
});

test('a toast that disappears after 3 s stays readable in the notices drawer', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(730, 415, { steps: 5 });
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.toast')).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.locator('.toast')).toHaveCount(0);
  const probe = await OverlayProbe.attach(page);
  expect(await probe.resolve(['drawer'])).toEqual(['drawer']);
  const drawer = await probe.box('drawer');
  expect(drawer?.text).toContain('Your changes were saved.');
  await page.waitForTimeout(3000); // still there: nothing in Steady's UI auto-dismisses
  expect((await probe.box('drawer'))?.text).toContain('Your changes were saved.');
});

test('"one activation = double click" works only on sites the user listed', async ({ context, serviceWorker }) => {
  const enable = async (origins: string[]) =>
    serviceWorker.evaluate(async (o) => {
      let { settings } = await chrome.storage.sync.get('settings');
      for (let i = 0; !settings && i < 50; i++) {
        await new Promise((r) => setTimeout(r, 50)); // onInstalled writes the defaults
        ({ settings } = await chrome.storage.sync.get('settings'));
      }
      for (const p of settings.profiles) p.timePressure.synthesizeDoubleClick = true;
      settings.doubleClickOrigins = o;
      await chrome.storage.sync.set({ settings });
    }, origins);
  const tryDouble = async () => {
    const page = await context.newPage();
    await open(page);
    await page.mouse.move(180, 470, { steps: 5 }); // 30 px below the file item
    await page.waitForTimeout(500);
    await page.mouse.down();
    await page.mouse.up();
    const got = await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks);
    await page.close();
    return got;
  };
  await enable([]);
  expect(await tryDouble()).toEqual([]);
  await enable(['http://localhost:4173']);
  expect(await tryDouble()).toEqual(['dblclick']);
});
