// Reads Steady's overlay (a *closed* shadow root) through the DevTools protocol,
// which can pierce closed shadow roots. Test-only.
import type { CDPSession, Page } from '@playwright/test';

interface CdpNode {
  nodeId: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
}

export interface OverlayBox {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  text: string;
}

export class OverlayProbe {
  private objectIds = new Map<string, string>();
  private constructor(private readonly cdp: CDPSession) {}

  static async attach(page: Page): Promise<OverlayProbe> {
    const probe = new OverlayProbe(await page.context().newCDPSession(page));
    await probe.cdp.send('DOM.enable');
    await probe.cdp.send('Runtime.enable');
    return probe;
  }

  /** Re-resolve overlay elements by class name (call after the overlay is (re)created). */
  async resolve(classes: string[]) {
    const { root } = (await this.cdp.send('DOM.getDocument', { depth: -1, pierce: true })) as { root: CdpNode };
    const found = new Map<string, number>();
    const walk = (n: CdpNode) => {
      const attrs = n.attributes ?? [];
      const ci = attrs.indexOf('class');
      if (ci >= 0) {
        const cls = attrs[ci + 1]!.split(/\s+/);
        for (const c of classes) if (cls.includes(c) && !found.has(c)) found.set(c, n.nodeId);
      }
      n.shadowRoots?.forEach(walk);
      n.children?.forEach(walk);
    };
    walk(root);
    this.objectIds.clear();
    for (const [c, nodeId] of found) {
      const { object } = (await this.cdp.send('DOM.resolveNode', { nodeId })) as { object: { objectId: string } };
      this.objectIds.set(c, object.objectId);
    }
    return [...found.keys()];
  }

  async box(cls: string): Promise<OverlayBox | null> {
    const objectId = this.objectIds.get(cls);
    if (!objectId) return null;
    const { result } = (await this.cdp.send('Runtime.callFunctionOn', {
      objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        const r = this.getBoundingClientRect();
        const cs = getComputedStyle(this);
        return { x: r.x, y: r.y, w: r.width, h: r.height, visible: cs.display !== 'none' && this.isConnected, text: this.textContent || '' };
      }`,
    })) as { result: { value: OverlayBox } };
    return result.value;
  }
}

export function stdDev(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

/** Ask Steady (via the demo bridge) for its main-thread cost stats. */
export async function steadyPerf(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, { count: number; meanMs: number; p95Ms: number; maxMs: number }>>((resolve) => {
        const on = (e: MessageEvent) => {
          if (e.data?.source === 'steady-ext' && e.data.type === 'PERF') {
            window.removeEventListener('message', on);
            resolve(e.data.perf);
          }
        };
        window.addEventListener('message', on);
        window.postMessage({ source: 'steady-demo', type: 'GET_PERF' }, location.origin);
      }),
  );
}

export async function waitForSteady(page: Page) {
  await page.locator('#steady-status').filter({ hasText: 'Steady is on' }).waitFor({ timeout: 10_000 });
}
