import { test, expect } from './fixtures';
import { OverlayProbe, stdDev, steadyPerf, waitForSteady } from './overlay';

test('simulated tremor is visibly smoothed by the ghost cursor (strong profile)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/index.html');
  await waitForSteady(page);
  await page.locator('#cal-profile').selectOption('strong');
  await page.locator('#cal-tremor').fill('8');
  await page.mouse.move(300, 420);
  await page.mouse.move(320, 430, { steps: 5 });
  await page.waitForTimeout(1500); // let the filter settle on the held position

  const probe = await OverlayProbe.attach(page);
  expect(await probe.resolve(['ghost', 'raw'])).toEqual(expect.arrayContaining(['ghost', 'raw']));
  const ghost: { x: number; y: number }[] = [];
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i < 60; i++) {
    const [g, r] = await Promise.all([probe.box('ghost'), probe.box('raw')]);
    expect(g?.visible && r?.visible).toBe(true);
    ghost.push({ x: g!.x, y: g!.y });
    raw.push({ x: r!.x, y: r!.y });
    await page.waitForTimeout(17);
  }
  const spread = (pts: { x: number; y: number }[]) => Math.hypot(stdDev(pts.map((p) => p.x)), stdDev(pts.map((p) => p.y)));
  const rawSpread = spread(raw);
  const ghostSpread = spread(ghost);
  console.log(`raw spread ${rawSpread.toFixed(2)} px, ghost spread ${ghostSpread.toFixed(2)} px`);
  expect(rawSpread).toBeGreaterThan(4);
  expect(ghostSpread).toBeLessThan(rawSpread * 0.35);

  const perf = await steadyPerf(page);
  console.log('perf', JSON.stringify(perf));
  expect(perf.sample!.count).toBeGreaterThan(30);
  expect(perf.sample!.p95Ms).toBeLessThan(1);
});
