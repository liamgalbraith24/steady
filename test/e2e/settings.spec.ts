import { test, expect } from './fixtures';
import { axeViolations } from './axe';

test('a settings change reaches the content script in another tab within 1 s', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await page.waitForTimeout(500);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await expect(options.locator('#save-status')).toContainText('saved automatically');

  const received = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('settings updated (profile "Rest mode")'),
    timeout: 5000,
  });
  const t0 = Date.now();
  await options.locator('#profile-select').selectOption('rest');
  await options.locator('#make-active').click();
  await received;
  expect(Date.now() - t0).toBeLessThan(1000);
});

test('importing a malformed file shows an error and leaves settings unchanged', async ({ context, extensionId, serviceWorker }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await expect(options.locator('#save-status')).toContainText('saved automatically');
  const before = await serviceWorker.evaluate(() => chrome.storage.sync.get('settings'));

  for (const [name, body] of [
    ['broken.json', '{ "version": 2, '],
    ['wrong.json', JSON.stringify({ version: 2, profiles: [] })],
  ] as const) {
    await options.locator('#import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(body) });
    await expect(options.locator('#import-error')).toContainText(`Could not import "${name}"`);
    await expect(options.locator('#import-error')).toContainText('Your settings were not changed');
    await expect(options.locator('#import-confirm')).toBeHidden();
  }
  const after = await serviceWorker.evaluate(() => chrome.storage.sync.get('settings'));
  expect(after).toEqual(before);
});

test('options page has no axe violations', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await expect(options.locator('#save-status')).toContainText('saved automatically');
  expect(await axeViolations(options)).toEqual([]);
  // Also with the switch-scanning section revealed.
  await options.locator('#i-source').selectOption('switch');
  expect(await axeViolations(options)).toEqual([]);
});

test('popup has no axe violations', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(popup.locator('#tab-status')).not.toContainText('Checking');
  expect(await axeViolations(popup)).toEqual([]);
});
