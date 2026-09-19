import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { axeViolations } from './axe';
import { OverlayProbe, useProfile, waitForSteady } from './overlay';
import type { Page } from '@playwright/test';

async function dwellOn(page: Page, selector: string, ms = 2200) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(150); // let the scanner re-measure after scrolling
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(ms);
}

async function sessionData(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('steady-demo-session') ?? 'null'));
}

test('completes the demo form task using dwell only (Rest mode)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await waitForSteady(page);
  await useProfile(page, 'rest');
  await expect(page.locator('#cond-steady')).toBeChecked();

  await page.locator('#h-task-form').scrollIntoViewIfNeeded();
  await dwellOn(page, '[data-task="form"]');
  await expect(page.locator('#task-form')).toBeVisible();

  const fields: [string, string][] = [
    ['#f-name', 'Ada Lovelace'],
    ['#f-email', 'ada@example.com'],
    ['#f-phone', '0131 555 0199'],
  ];
  for (const [sel, text] of fields) {
    await dwellOn(page, sel);
    await expect(page.locator(sel)).toBeFocused();
    await page.keyboard.type(text);
  }
  // <select> via Steady's option picker.
  await dwellOn(page, '#f-city');
  const probe = await OverlayProbe.attach(page);
  expect(await probe.resolve(['options'])).toEqual(['options']);
  const glasgow = (await probe.children('options')).find((o) => o.text === 'Glasgow')!;
  await page.mouse.move(glasgow.x + glasgow.w / 2, glasgow.y + glasgow.h / 2, { steps: 12 });
  await page.waitForTimeout(2200);
  await expect(page.locator('#f-city')).toHaveValue('Glasgow');

  await dwellOn(page, '#f-message');
  await expect(page.locator('#f-message')).toBeFocused();
  await page.keyboard.type('Hello from dwell.');
  await dwellOn(page, '#f-submit');

  await expect(page.locator('#task-status')).toContainText('Done in');
  const s = await sessionData(page);
  expect(s.tasks).toHaveLength(1);
  expect(s.tasks[0]).toMatchObject({ task: 'form', condition: 'steady', completed: true, errors: 0 });
});

test('a full session can be completed with the keyboard alone, and the export contains everything', async ({ context }) => {
  test.setTimeout(180_000);
  const page = await context.newPage();
  await page.goto('/index.html');
  await waitForSteady(page);

  // Session setup and condition (baseline), all by keyboard.
  await page.locator('#participant').focus();
  await page.keyboard.type('P01');
  await page.locator('#cond-baseline').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#cond-baseline')).toBeChecked();

  // Pointing task: Start, then Tab to the highlighted target and press Enter repeatedly.
  await page.locator('#fitts-start').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // Stop
  await page.keyboard.press('Tab'); // the highlighted target (the only target in the tab order)
  for (let i = 0; i < 6 * 16; i++) await page.keyboard.press('Enter');
  await expect(page.locator('#fitts-status')).toContainText('complete');

  // a) Form.
  await page.locator('[data-task="form"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Grace Hopper');
  await page.keyboard.press('Tab');
  await page.keyboard.type('grace@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type('555 123 4567');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown'); // select: first city
  await page.keyboard.press('Tab');
  await page.keyboard.type('Hi');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-status')).toContainText('Done in');

  // b) Menu: Shop › Electronics › Headphones.
  await page.locator('[data-task="hoverMenu"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // Shop
  await page.keyboard.press('Enter'); // opens, focuses "Clothing"
  await page.keyboard.press('Tab'); // Electronics
  await page.keyboard.press('Enter'); // opens, focuses "Laptops"
  await page.keyboard.press('Tab'); // Cameras
  await page.keyboard.press('Tab'); // Headphones
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-status')).toContainText('Done in');

  // c) Modal: focus starts on the close button.
  await page.locator('[data-task="modal"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal-close')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-status')).toContainText('Done in');

  // SUS: radios are arrow-key operable; pick "4" for every item.
  for (let i = 1; i <= 10; i++) {
    await page.locator(`input[name="sus${i}"][value="3"]`).focus();
    await page.keyboard.press('ArrowRight');
  }
  await page.locator('#sus-form button[type="submit"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sus-result')).toContainText('SUS score: 50');

  // TLX: sliders with arrow keys.
  await page.locator('#tlx-physical').focus();
  await page.keyboard.press('ArrowRight');
  await page.locator('#tlx-form button[type="submit"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tlx-result')).toContainText('Raw TLX');

  // Export.
  await page.locator('#export').focus();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const data = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(data.participantId).toBe('P01');
  expect(data.fitts).toHaveLength(90);
  expect(data.fitts.every((t: { condition: string; input: string }) => t.condition === 'baseline' && t.input === 'keyboard')).toBe(true);
  expect(data.tasks.map((t: { task: string; completed: boolean }) => [t.task, t.completed])).toEqual([
    ['form', true],
    ['hoverMenu', true],
    ['modal', true],
  ]);
  expect(data.questionnaires.map((q: { kind: string }) => q.kind)).toEqual(['sus', 'tlx']);
  expect(data.summary.fittsBlocks).toHaveLength(6);
});

test('demo page has no axe violations', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await waitForSteady(page);
  expect(await axeViolations(page)).toEqual([]);
  // With task UI revealed too.
  await page.locator('[data-task="form"]').click();
  await page.locator('#fitts-start').click();
  expect(await axeViolations(page)).toEqual([]);
});
