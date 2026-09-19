// Time-pressure neutralisation (F4, WCAG 2.2.1 Timing Adjustable):
//  • HoverPersistence — hover menus stay open while the cursor travels toward them.
//  • ToastWatcher     — transient page messages are copied into Steady's notices drawer.
// (Double click → single activation lives in dispatch.ts.)
import { hoverOver } from '../dispatch';
import type { Rect } from '../overlay/overlay';
import { headingToward, unionRect, type Pt } from './geometry';

/** Menus appear within this long of the hover (spec: 300 ms) + scanner debounce (100 ms) + a frame. */
const REVEAL_WINDOW_MS = 450;
const REDISPATCH_MS = 100;

export interface HoverPersistenceOptions {
  getRect: (el: Element) => Rect | null;
  /** Current captured element and cursor, polled while a menu is being held open. */
  poll: () => { captured: Element | null; cursor: Pt | null };
  log: (kind: string, data?: Record<string, string | number | boolean | null>) => void;
}

export class HoverPersistence {
  private hoverEl: Element | null = null;
  private hoverAt = -Infinity;
  private trigger: Element | null = null;
  private revealed: Element[] = [];
  private persisting = false;
  private exit: Pt | null = null;
  private leftAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private holdMs = 1500;

  constructor(private readonly opts: HoverPersistenceOptions) {}

  configure(holdMs: number) {
    this.holdMs = holdMs;
  }

  get isPersisting() {
    return this.persisting;
  }

  get currentTrigger() {
    return this.trigger;
  }

  /** The cursor (ghost or real) started hovering `el`. */
  noteHover(el: Element | null, t: number, force = false) {
    if (el === this.hoverEl && !force) return;
    this.hoverEl = el;
    this.hoverAt = t;
  }

  /** Scanner diff: `added` candidates just became visible. */
  noteRevealed(added: Element[], t: number) {
    if (!this.hoverEl || !added.length || t - this.hoverAt > REVEAL_WINDOW_MS) return;
    if (this.trigger === this.hoverEl) {
      this.revealed = [...new Set([...this.revealed, ...added])];
      return;
    }
    this.trigger = this.hoverEl;
    this.revealed = added;
    this.opts.log('hoverMenuDetected', { items: added.length });
  }

  private menuRect(): Rect | null {
    this.revealed = this.revealed.filter((e) => e.isConnected);
    return unionRect(this.revealed.map((e) => this.opts.getRect(e)).filter((r): r is Rect => !!r && r.width > 0));
  }

  /**
   * Called on every capture change and cursor move.
   * @returns true if Steady is keeping a menu open (callers should not send a leave to the trigger).
   */
  update(captured: Element | null, cursor: Pt | null, t: number): boolean {
    const trigger = this.trigger;
    if (!trigger || !trigger.isConnected) return this.stop(false);
    const onTrigger = captured === trigger || (captured !== null && trigger.contains(captured));
    const inMenu = captured !== null && this.revealed.some((m) => m === captured || m.contains(captured));
    if (onTrigger || inMenu) {
      // Reached the menu (or came back): native/normal hover takes over again.
      if (this.persisting) this.opts.log('hoverPersistEnd', { reason: inMenu ? 'reached-menu' : 'returned' });
      this.persisting = false;
      clearInterval(this.timer);
      this.timer = undefined;
      return false;
    }
    const menu = this.menuRect();
    if (!menu || !cursor) return this.stop(true);
    if (!this.persisting) {
      this.persisting = true;
      this.exit = cursor;
      this.leftAt = t;
      this.opts.log('hoverPersistStart');
      this.keepAlive();
      this.timer = setInterval(() => {
        const { captured: c, cursor: p } = this.opts.poll();
        if (this.update(c, p, performance.now())) this.keepAlive();
      }, REDISPATCH_MS);
    }
    if (headingToward(cursor, this.exit!, menu)) {
      this.leftAt = t; // still on its way: keep the clock from running out
      return true;
    }
    if (t - this.leftAt > this.holdMs) return this.stop(true);
    return true;
  }

  /** Re-assert hover on the trigger (after the page reacts to the real pointer leaving). */
  keepAlive() {
    if (!this.persisting || !this.trigger?.isConnected) return;
    try {
      hoverOver(this.trigger);
    } catch {}
  }

  private stop(sendLeave: boolean): false {
    const trigger = this.trigger;
    const was = this.persisting;
    clearInterval(this.timer);
    this.timer = undefined;
    this.persisting = false;
    this.trigger = null;
    this.revealed = [];
    this.exit = null;
    if (was && sendLeave && trigger?.isConnected) {
      for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
        trigger.dispatchEvent(new MouseEvent(type, { bubbles: type.endsWith('out'), cancelable: true, composed: true }));
      }
      trigger.parentElement?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    }
    if (was) this.opts.log('hoverPersistEnd', { reason: 'timeout' });
    return false;
  }

  destroy() {
    clearInterval(this.timer);
  }
}

// ---------------------------------------------------------------------------

const ROLE_SELECTOR = '[role="alert"], [role="status"], [aria-live="polite"], [aria-live="assertive"]';
const CLASS_PATTERN = /(^|[\s_-])(toast|snackbar|notification|notice|flash|alert|growl)([\s_-]|$)/i;
/** Messages that stayed longer than this were not transient. */
const MAX_TRANSIENT_MS = 60_000;

interface Tracked {
  text: string;
  since: number;
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isToastLike(el: Element): boolean {
  if (el.matches(ROLE_SELECTOR)) return true;
  if (!CLASS_PATTERN.test(el.getAttribute('class') ?? '')) return false;
  // Class names alone are noisy ("notification" badges): require an overlay-ish position.
  const pos = getComputedStyle(el).position;
  return pos === 'fixed' || pos === 'absolute' || pos === 'sticky';
}

/**
 * Watches for page messages that appear and are then removed, hidden, or replaced,
 * and hands their text to `onNotice`. It never stops the page removing its toast.
 */
export class ToastWatcher {
  private readonly tracked = new Map<Element, Tracked>();
  private mo: MutationObserver | null = null;

  constructor(
    private readonly onNotice: (text: string) => void,
    private readonly isOwn: (node: Node) => boolean,
  ) {}

  start() {
    for (const el of document.querySelectorAll(ROLE_SELECTOR)) this.track(el);
    this.mo = new MutationObserver((records) => {
      try {
        this.onMutations(records);
      } catch {}
    });
    this.mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'role', 'aria-live'],
    });
  }

  stop() {
    this.mo?.disconnect();
    this.tracked.clear();
  }

  private track(el: Element) {
    if (this.isOwn(el) || this.tracked.has(el)) return;
    this.tracked.set(el, { text: textOf(el), since: Date.now() });
  }

  private report(el: Element, text: string) {
    const t = this.tracked.get(el);
    if (!text || text.length < 2 || /^[\d\s.,:%/-]+$/.test(text)) return; // counters, progress, clocks
    if (t && Date.now() - t.since > MAX_TRANSIENT_MS) return;
    this.onNotice(text);
  }

  private onMutations(records: MutationRecord[]) {
    const touched = new Set<Element>();
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element) || this.isOwn(n)) continue;
        if (isToastLike(n)) this.track(n);
        for (const d of n.querySelectorAll(ROLE_SELECTOR)) this.track(d);
        // Toast libraries often add a wrapper, then the styled element one level down.
        for (const d of Array.from(n.children).slice(0, 5)) if (isToastLike(d)) this.track(d);
      }
      for (const n of r.removedNodes) {
        if (!(n instanceof Element)) continue;
        for (const [el, info] of this.tracked) {
          if (el === n || n.contains(el)) {
            this.report(el, info.text);
            this.tracked.delete(el);
          }
        }
      }
      const target = r.target instanceof Element ? r.target : r.target.parentElement;
      if (target) touched.add(target);
    }
    // Content or visibility changes inside tracked regions.
    for (const [el, info] of this.tracked) {
      if (!el.isConnected) {
        this.report(el, info.text);
        this.tracked.delete(el);
        continue;
      }
      if (![...touched].some((t) => el === t || el.contains(t) || t.contains(el))) continue;
      const visible = el.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true;
      const text = visible ? textOf(el) : '';
      if (text === info.text) continue;
      // The old message went away (hidden or cleared). Text *replaced* by new text is not
      // reported: persistent status regions ("3 results", "Loading…" → "Ready") update
      // constantly, and the user can still read the current text.
      if (info.text && !text) this.report(el, info.text);
      info.text = text;
      info.since = Date.now();
    }
  }
}
