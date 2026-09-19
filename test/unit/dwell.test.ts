import { describe, expect, it } from 'vitest';
import { DwellController, type DwellEvent } from '../../src/content/dwell/DwellController';

const cfg = { dwellMs: 1000, restZoneEnabled: true, restZoneRadiusPx: 12 };

/** Feed samples every 16 ms from t0 for `ms`, at a fixed point and target. Returns all events. */
function hold<T>(d: DwellController<T>, x: number, y: number, target: T | null, t0: number, ms: number) {
  const events: DwellEvent<T>[] = [];
  for (let t = t0; t <= t0 + ms; t += 16) {
    const e = d.update({ x, y }, target, t);
    if (e) events.push(e);
  }
  return events;
}

describe('DwellController', () => {
  it('fires after dwellMs on a target', () => {
    const d = new DwellController<string>(cfg);
    expect(hold(d, 100, 100, 'btn', 0, 990)).toEqual([]);
    expect(d.state).toBe('dwelling');
    expect(d.progress).toBeGreaterThan(0.95);
    expect(hold(d, 100, 100, 'btn', 1006, 20)).toEqual([{ type: 'fire', target: 'btn' }]);
    expect(d.state).toBe('fired');
  });

  it('tolerates drift within the rest-zone radius', () => {
    const d = new DwellController<string>(cfg);
    const events: DwellEvent<string>[] = [];
    for (let t = 0; t <= 1100; t += 16) {
      const e = d.update({ x: 100 + 4 * Math.sin(t / 50), y: 100 + 4 * Math.cos(t / 70) }, 'btn', t);
      if (e) events.push(e);
    }
    expect(events).toContainEqual({ type: 'fire', target: 'btn' });
  });

  it('moving away at 80% cancels and resets the ring', () => {
    const d = new DwellController<string>(cfg);
    hold(d, 100, 100, 'btn', 0, 800);
    expect(d.progress).toBeCloseTo(0.8, 1);
    const e = d.update({ x: 300, y: 300 }, null, 816);
    expect(e).toMatchObject({ type: 'cancel', target: 'btn', reason: 'moved' });
    expect(d.progress).toBe(0);
    expect(hold(d, 300, 300, null, 832, 1000)).toEqual([]);
  });

  it('a target change resets the timer', () => {
    const d = new DwellController<string>(cfg);
    hold(d, 100, 100, 'a', 0, 700);
    d.update({ x: 104, y: 100 }, 'b', 716);
    expect(d.progress).toBe(0);
    expect(hold(d, 104, 100, 'b', 732, 900)).toEqual([]); // only 900 ms on b
    expect(hold(d, 104, 100, 'b', 1648, 150)).toEqual([{ type: 'fire', target: 'b' }]);
  });

  it('drifting beyond the radius restarts the countdown', () => {
    const d = new DwellController<string>(cfg);
    hold(d, 100, 100, 'big', 0, 900);
    d.update({ x: 130, y: 100 }, 'big', 916); // same (large) target, but moved 30 px
    expect(d.progress).toBe(0);
    expect(hold(d, 130, 100, 'big', 932, 900)).toEqual([]);
  });

  it('does not fire twice without moving; re-arms after moving away and back', () => {
    const d = new DwellController<string>(cfg);
    expect(hold(d, 100, 100, 'btn', 0, 3000)).toEqual([{ type: 'fire', target: 'btn' }]);
    d.update({ x: 130, y: 100 }, 'btn', 3016); // still on the (wide) button but moved > R
    expect(hold(d, 130, 100, 'btn', 3032, 1100)).toEqual([{ type: 'fire', target: 'btn' }]);
  });

  it('Esc cancels the current dwell', () => {
    const d = new DwellController<string>(cfg);
    hold(d, 100, 100, 'btn', 0, 500);
    expect(d.cancel()).toMatchObject({ type: 'cancel', reason: 'escape' });
    expect(hold(d, 100, 100, 'btn', 516, 2000)).toEqual([]);
    expect(d.cancel()).toBeNull();
    // Changing target re-arms.
    expect(hold(d, 100, 100, 'other', 2600, 1100)).toEqual([{ type: 'fire', target: 'other' }]);
  });

  describe('rest zones', () => {
    it('enters resting after 2× dwellMs still on blank space', () => {
      const d = new DwellController<string>(cfg);
      expect(hold(d, 500, 500, null, 0, 1990)).toEqual([]);
      expect(hold(d, 500, 500, null, 2006, 20)).toEqual([{ type: 'restStart' }]);
      expect(d.state).toBe('resting');
    });

    it('resting 5 s on blank space, then drifting 3 px onto a target, clicks nothing', () => {
      const d = new DwellController<string>(cfg);
      hold(d, 500, 500, null, 0, 5000);
      expect(d.state).toBe('resting');
      // Drift 3 px — even onto a target — and stay there a long time.
      expect(hold(d, 503, 500, 'link', 5016, 4000)).toEqual([]);
      expect(d.state).toBe('resting');
    });

    it('leaves resting after moving at least the radius, then dwells normally', () => {
      const d = new DwellController<string>(cfg);
      hold(d, 500, 500, null, 0, 3000);
      expect(d.update({ x: 520, y: 500 }, 'link', 3016)).toEqual({ type: 'restEnd' });
      expect(d.state).toBe('dwelling');
      expect(hold(d, 520, 500, 'link', 3032, 1100)).toEqual([{ type: 'fire', target: 'link' }]);
    });

    it('does not rest while hovering a target', () => {
      const d = new DwellController<string>({ ...cfg, dwellMs: 1000 });
      hold(d, 100, 100, 'btn', 0, 5000);
      expect(d.state).toBe('fired');
    });

    it('can be turned off', () => {
      const d = new DwellController<string>({ ...cfg, restZoneEnabled: false });
      hold(d, 500, 500, null, 0, 5000);
      expect(d.state).toBe('idle');
      expect(hold(d, 503, 500, 'link', 5016, 1100)).toEqual([{ type: 'fire', target: 'link' }]);
    });
  });
});

describe('DwellController.acknowledge', () => {
  it('a physical click on the target stops the pending dwell from firing too', () => {
    const d = new DwellController<string>({ dwellMs: 1000, restZoneEnabled: true, restZoneRadiusPx: 12 });
    hold(d, 100, 100, 'btn', 0, 400);
    d.acknowledge();
    expect(hold(d, 100, 100, 'btn', 416, 2000)).toEqual([]);
  });
});
