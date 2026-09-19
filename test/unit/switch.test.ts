// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwitchSource } from '../../src/content/input/SwitchSource';
import type { IntentEvent } from '../../src/content/input/InputSource';
import { DEFAULT_SWITCH, type SwitchConfig } from '../../src/shared/settings';

// Keyboard events created in tests are untrusted and ignored by SwitchSource (by design),
// so drive its press/release logic directly.
type Driver = { press(w: 'advance' | 'select'): void; release(w: 'advance' | 'select'): void };

function setup(cfg: Partial<SwitchConfig> = {}) {
  const src = new SwitchSource({ ...DEFAULT_SWITCH, ...cfg });
  const events: IntentEvent['kind'][] = [];
  src.onIntent((e) => events.push(e.kind));
  src.start();
  return { src, drv: src as unknown as Driver, events };
}

describe('SwitchSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('one switch: short press moves on, long press selects', () => {
    const { drv, events, src } = setup({ longPressMs: 600 });
    drv.press('advance');
    vi.advanceTimersByTime(200);
    drv.release('advance');
    expect(events).toEqual(['scanNext']);
    drv.press('advance');
    vi.advanceTimersByTime(650); // selects as soon as the long press is reached
    expect(events).toEqual(['scanNext', 'activate']);
    drv.release('advance');
    expect(events).toEqual(['scanNext', 'activate']); // release after a long press does nothing
    src.stop();
  });

  it('two switches: first moves on, second selects', () => {
    const { drv, events, src } = setup({ selectKey: 'Enter' });
    drv.press('advance');
    drv.release('advance');
    drv.press('select');
    drv.release('select');
    expect(events).toEqual(['scanNext', 'activate']);
    src.stop();
  });

  it('automatic scanning advances on a timer and any press selects', () => {
    const { drv, events, src } = setup({ mode: 'auto', scanIntervalMs: 1000 });
    vi.advanceTimersByTime(3100);
    expect(events).toEqual(['scanNext', 'scanNext', 'scanNext']);
    drv.press('advance');
    expect(events.at(-1)).toBe('activate');
    // Timer restarts after a selection: nothing for the next 900 ms.
    vi.advanceTimersByTime(900);
    expect(events.filter((e) => e === 'scanNext')).toHaveLength(3);
    vi.advanceTimersByTime(200);
    expect(events.filter((e) => e === 'scanNext')).toHaveLength(4);
    src.stop();
    vi.advanceTimersByTime(5000);
    expect(events.filter((e) => e === 'scanNext')).toHaveLength(4);
  });
});
