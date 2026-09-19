import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import path from 'node:path';

const extensionPath = path.resolve(import.meta.dirname, '../../dist');

// STEADY_CHROME lets you point at a local Chrome/Chromium binary. Branded Chrome ≥137
// ignores --load-extension unless the DisableLoadExtensionCommandLineSwitch feature is off.
const executablePath = process.env.STEADY_CHROME || undefined;

export const test = base.extend<{ context: BrowserContext; serviceWorker: Worker; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      ...(executablePath ? { executablePath } : { channel: 'chromium' }),
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
      ],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    await use(sw);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(serviceWorker.url().split('/')[2]!);
  },
});
export const expect = test.expect;
