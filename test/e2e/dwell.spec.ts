import { test, expect } from './fixtures';
import { OverlayProbe, useProfile } from './overlay';
import type { Page } from '@playwright/test';

// Rest mode profile: dwell 1200 ms, rest-zone radius 12 px, snap radius 60 px.
async function open(page: Page) {
  const loaded = page.waitForEvent('console', (m) => m.text().includes('Steady loaded'));
  await page.goto('/fixtures/snap.html');
  await loaded;
  await page.waitForTimeout(300);
  await useProfile(page, 'rest');
}
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { clicks: { id: string }[] }).clicks.map((c) => c.id));

test('holding over a target for dwellMs activates it, with a visible countdown', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  const probe = await OverlayProbe.attach(page);
  await page.mouse.move(140, 300);
  await page.mouse.move(140, 150, { steps: 8 }); // 10 px below button A
  await page.waitForTimeout(600);
  await probe.resolve(['dwell']);
  expect((await probe.box('dwell'))?.visible).toBe(true);
  expect(await clicks(page)).toEqual([]);
  await page.waitForTimeout(1600);
  expect(await clicks(page)).toEqual(['a']);
  await page.waitForTimeout(1500);
  expect(await clicks(page)).toEqual(['a']); // no repeat without moving
});

test('moving away at 80% of the dwell does not click, and the ring resets', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(140, 300);
  await page.mouse.move(140, 120, { steps: 4 });
  await page.waitForTimeout(400); // ghost settles on A (strong filter)
  await page.waitForTimeout(1200 * 0.8 - 400);
  await page.mouse.move(700, 650, { steps: 3 }); // blank space
  await page.waitForTimeout(2500);
  expect(await clicks(page)).toEqual([]);
  const probe = await OverlayProbe.attach(page);
  await probe.resolve(['dwell']);
  expect((await probe.box('dwell'))?.visible).toBe(false);
});

test('resting on blank space for 5 s then drifting 3 px clicks nothing', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  // Blank point 30 px outside the "Far" button (600–660 × 400–430), within snap radius
  // after a 3 px drift would still be blank, but we make sure nothing fires either way.
  await page.mouse.move(900, 700, { steps: 5 });
  await page.waitForTimeout(5000);
  const probe = await OverlayProbe.attach(page);
  await probe.resolve(['rest']);
  expect((await probe.box('rest'))?.visible).toBe(true);
  await page.mouse.move(903, 700);
  await page.waitForTimeout(3000);
  expect(await clicks(page)).toEqual([]);
});

test('Esc cancels the current dwell', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  await page.mouse.move(140, 300);
  await page.mouse.move(140, 120, { steps: 4 });
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  expect(await clicks(page)).toEqual([]);
});

test('dwell on a text field focuses it once; dwelling again does nothing', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  // #name input at (100, 400).
  await page.mouse.move(120, 500);
  await page.mouse.move(130, 410, { steps: 6 });
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('name');
  // Move away (> radius) and back onto the field: a second dwell must not re-focus.
  await page.mouse.move(170, 410, { steps: 3 });
  await page.waitForTimeout(2200);
  expect(await page.evaluate(() => (window as unknown as { focusCount: number }).focusCount)).toBe(1);
});

test('dwell on a <select> opens Steady\'s option picker, and dwell picks an option', async ({ context }) => {
  const page = await context.newPage();
  await open(page);
  const box = await page.locator('#sel').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 60);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 6 });
  await page.waitForTimeout(2200);
  const probe = await OverlayProbe.attach(page);
  expect(await probe.resolve(['options'])).toEqual(['options']);
  const options = await probe.children('options');
  expect(options.map((o) => o.text)).toEqual(['Red', 'Green', 'Blue']);
  const green = options[1]!;
  await page.mouse.move(green.x + green.w / 2, green.y + green.h / 2, { steps: 8 });
  await page.waitForTimeout(2400);
  expect(await page.locator('#sel').inputValue()).toBe('Green');
  expect(await probe.resolve(['options'])).toEqual([]); // picker closed
});
