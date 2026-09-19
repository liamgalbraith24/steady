// Exercises Steady on real sites (spec: news site, web form, hover-menu app) and reports
// console warnings/errors from Steady plus main-thread cost. Needs network access.
//   STEADY_CHROME=<chrome-for-testing> node scripts/realsites.mjs [seconds-per-site]
import { chromium } from '@playwright/test';
import path from 'node:path';

const ext = path.resolve(import.meta.dirname, '../dist');
const seconds = Number(process.argv[2] ?? 60);
const SITES = [
  ['news', 'https://www.theguardian.com/international'],
  ['form', 'https://httpbin.org/forms/post'],
  ['hover-menu', 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/'],
];

const ctx = await chromium.launchPersistentContext('', {
  ...(process.env.STEADY_CHROME ? { executablePath: process.env.STEADY_CHROME } : { channel: 'chromium' }),
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

async function steadyPerf(page) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', (e) => contexts.push(e.context));
  await cdp.send('Runtime.enable');
  await new Promise((r) => setTimeout(r, 300));
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const own = contexts.find((c) => c.auxData?.type === 'isolated' && c.auxData?.frameId === frameTree.frame.id && c.name.startsWith('Steady'));
  if (!own) return null;
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'globalThis.__steady?.perf()', contextId: own.id, returnByValue: true });
  return result.value;
}

const report = [];
for (const [kind, url] of SITES) {
  const page = await ctx.newPage();
  const messages = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && /steady/i.test(m.text())) messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => /steady/i.test(String(e.stack)) && messages.push(`pageerror: ${e.message}`));
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  } catch (e) {
    report.push({ kind, url, error: `could not load: ${e.message.split('\n')[0]}` });
    continue;
  }
  await page.waitForTimeout(2500);
  const end = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < end) {
    // Wander over the page like a user reading and pointing, scrolling now and then.
    const x = 80 + ((i * 137) % 1120);
    const y = 80 + ((i * 89) % 640);
    await page.mouse.move(x, y, { steps: 15 });
    await page.waitForTimeout(250);
    if (i % 12 === 11) await page.mouse.wheel(0, 500);
    i++;
  }
  const perf = await steadyPerf(page);
  report.push({ kind, url, steadyMessages: messages, perf });
  await page.close();
}
await ctx.close();
console.log(JSON.stringify(report, null, 2));
