// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexHull, headingToward, pointInConvexPolygon, unionRect } from '../../src/content/timepressure/geometry';
import { HoverPersistence, ToastWatcher } from '../../src/content/timepressure/neutralizer';

describe('triangle of intent', () => {
  // Trigger at the top-left; menu is a 200×300 panel to the right of it.
  const menu = { left: 200, top: 0, width: 200, height: 300 };
  const exit = { x: 150, y: 40 };

  it('builds a convex hull', () => {
    const hull = convexHull([exit, { x: 200, y: 0 }, { x: 400, y: 0 }, { x: 200, y: 300 }, { x: 400, y: 300 }, { x: 300, y: 100 }]);
    expect(hull).toHaveLength(5); // the interior point is dropped
    expect(pointInConvexPolygon({ x: 300, y: 150 }, hull)).toBe(true);
  });

  it('a diagonal path toward the menu stays inside', () => {
    for (let i = 0; i <= 10; i++) {
      const p = { x: 150 + i * 5, y: 40 + i * 15 }; // heading down-right to a lower menu item
      expect(headingToward(p, exit, menu), JSON.stringify(p)).toBe(true);
    }
  });

  it('moving away from the menu is outside', () => {
    expect(headingToward({ x: 100, y: 60 }, exit, menu)).toBe(false); // back left
    expect(headingToward({ x: 150, y: 400 }, exit, menu)).toBe(false); // straight down, below the menu
  });

  it('unions rects', () => {
    expect(unionRect([{ left: 0, top: 0, width: 10, height: 10 }, { left: 20, top: 5, width: 5, height: 20 }])).toEqual({
      left: 0,
      top: 0,
      width: 25,
      height: 25,
    });
    expect(unionRect([])).toBeNull();
  });
});

describe('HoverPersistence', () => {
  afterEach(() => vi.useRealTimers());

  function setup(holdMs = 1000) {
    document.body.innerHTML = '<li id="li"><button id="trigger">Menu</button><ul id="menu"><li><a id="item" href="#">Item</a></li></ul></li><a id="other" href="#">x</a>';
    const trigger = document.getElementById('trigger')!;
    const item = document.getElementById('item')!;
    const other = document.getElementById('other')!;
    const rects = new Map<Element, { left: number; top: number; width: number; height: number }>([
      [trigger, { left: 0, top: 0, width: 100, height: 40 }],
      [item, { left: 0, top: 40, width: 200, height: 40 }],
      [other, { left: 400, top: 0, width: 50, height: 20 }],
    ]);
    const logs: string[] = [];
    let state = { captured: null as Element | null, cursor: null as { x: number; y: number } | null };
    const hp = new HoverPersistence({ getRect: (e) => rects.get(e) ?? null, poll: () => state, log: (k) => logs.push(k) });
    hp.configure(holdMs);
    const overs: number[] = [];
    trigger.addEventListener('mouseover', () => overs.push(Date.now()));
    return { hp, trigger, item, other, logs, overs, set: (s: typeof state) => (state = s) };
  }

  it('detects a menu revealed shortly after hover, not later', () => {
    const { hp, trigger, item, logs } = setup();
    hp.noteHover(trigger, 1000);
    hp.noteRevealed([item], 2000); // 1 s later: unrelated
    expect(hp.currentTrigger).toBeNull();
    hp.noteHover(trigger, 3000, true);
    hp.noteRevealed([item], 3200);
    expect(hp.currentTrigger).toBe(trigger);
    expect(logs).toContain('hoverMenuDetected');
  });

  it('keeps the menu alive while heading toward it, and stops on reaching it', () => {
    const { hp, trigger, item } = setup();
    hp.noteHover(trigger, 0);
    hp.noteRevealed([item], 100);
    expect(hp.update(null, { x: 50, y: 42 }, 200)).toBe(true); // left the trigger, heading down
    expect(hp.isPersisting).toBe(true);
    expect(hp.update(null, { x: 60, y: 50 }, 5000)).toBe(true); // slow, but still in the triangle
    expect(hp.update(item, { x: 60, y: 60 }, 5100)).toBe(false); // reached it
    expect(hp.isPersisting).toBe(false);
  });

  it('lets the menu close hoverPersistMs after moving away', () => {
    const { hp, trigger, item, other, logs } = setup(1000);
    const leaves: string[] = [];
    trigger.addEventListener('mouseleave', () => leaves.push('leave'));
    hp.noteHover(trigger, 0);
    hp.noteRevealed([item], 100);
    expect(hp.update(null, { x: 50, y: 42 }, 200)).toBe(true);
    expect(hp.update(other, { x: 420, y: 10 }, 300)).toBe(true); // away from the menu: clock runs
    expect(hp.update(other, { x: 420, y: 10 }, 1100)).toBe(true);
    expect(hp.update(other, { x: 420, y: 10 }, 1300)).toBe(false); // > 1000 ms since leaving the triangle
    expect(leaves).toEqual(['leave']);
    expect(logs).toContain('hoverPersistEnd');
  });
});

describe('ToastWatcher', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('captures a toast that appears then is removed', async () => {
    document.body.innerHTML = '';
    const notices: string[] = [];
    const w = new ToastWatcher((t) => notices.push(t), () => false);
    w.start();
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.textContent = 'Saved your changes';
    document.body.append(toast);
    await flush();
    expect(notices).toEqual([]);
    toast.remove();
    await flush();
    expect(notices).toEqual(['Saved your changes']);
    w.stop();
  });

  it('captures text replaced inside a persistent live region, ignoring counters', async () => {
    document.body.innerHTML = '<div id="live" aria-live="polite"></div><div id="count" aria-live="polite">3</div>';
    const notices: string[] = [];
    const w = new ToastWatcher((t) => notices.push(t), () => false);
    w.start();
    const live = document.getElementById('live')!;
    live.textContent = 'Item added to basket';
    await flush();
    live.textContent = '';
    await flush();
    document.getElementById('count')!.textContent = '4';
    await flush();
    expect(notices).toEqual(['Item added to basket']);
    w.stop();
  });

  it('recognises class-named toasts only when positioned like an overlay', async () => {
    document.body.innerHTML = '';
    const notices: string[] = [];
    const w = new ToastWatcher((t) => notices.push(t), () => false);
    w.start();
    const badge = document.createElement('span');
    badge.className = 'notification-badge notification';
    badge.textContent = 'New';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.position = 'fixed';
    toast.textContent = 'Message sent';
    document.body.append(badge, toast);
    await flush();
    badge.remove();
    toast.remove();
    await flush();
    expect(notices).toEqual(['Message sent']);
    w.stop();
  });
});

describe('ToastWatcher noise', () => {
  it('does not report status text that is simply replaced', async () => {
    document.body.innerHTML = '<p id="st" role="status">Looking for the extension…</p>';
    const notices: string[] = [];
    const w = new ToastWatcher((t) => notices.push(t), () => false);
    w.start();
    document.getElementById('st')!.textContent = 'Extension found.';
    await new Promise((r) => setTimeout(r, 0));
    expect(notices).toEqual([]);
    w.stop();
  });
});
