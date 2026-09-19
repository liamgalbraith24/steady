import { test, expect } from './fixtures';

test('content script loads on a page', async ({ context }) => {
  const page = await context.newPage();
  const loaded = page.waitForEvent('console', (m) => m.text().includes('Steady loaded'));
  await page.goto('/index.html');
  expect((await loaded).text()).toContain('Steady loaded');
});
