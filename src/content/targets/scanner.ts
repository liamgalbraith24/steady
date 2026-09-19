// Finds interactive elements in the viewport and keeps them in a grid-bucketed
// spatial index for fast nearest-target queries.
//
// Cost model: querySelectorAll runs only when the DOM changes (MutationObserver,
// debounced 100 ms); an IntersectionObserver tracks which matches are near the
// viewport, so a rebuild measures only those (~dozens), not every link on the page.
// The expensive `cursor: pointer` heuristic runs separately, sampled on a grid of
// viewport points during idle time.
import type { Rect } from '../overlay/overlay';

export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  ...['button', 'link', 'checkbox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'switch'].map(
    (r) => `[role="${r}"]`,
  ),
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
].join(',');

/** Exclusions that do not need layout: disabled, hidden from AT, inert, or not a real target. */
export function isExcluded(el: Element): boolean {
  if (el === document.documentElement || el === document.body) return true;
  if ((el as HTMLButtonElement).disabled === true || el.matches(':disabled')) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.closest('[aria-hidden="true"], [inert]')) return true;
  if (el instanceof HTMLLabelElement && !el.control) return true; // only labels that forward to a control
  if (el instanceof HTMLElement && el.hidden) return true;
  return false;
}

export function matchesInteractive(el: Element): boolean {
  return el.matches(INTERACTIVE_SELECTOR) && !isExcluded(el);
}

export interface Candidate {
  el: Element;
  rect: Rect;
  area: number;
}

const CELL = 64;
// Offset so cells left of / above the viewport (negative indices) get unique keys.
const cellKey = (cx: number, cy: number) => (cx + 4096) * 16384 + (cy + 4096);

function isRendered(el: Element, r: DOMRect): boolean {
  if (r.width < 2 || r.height < 2) return false;
  const opts = { opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true };
  return typeof el.checkVisibility === 'function' ? el.checkVisibility(opts) : true;
}

export interface ScannerOptions {
  /** Steady's own overlay controls (they live in a shadow root the selector cannot see). */
  extra?: () => Element[];
  /** Called after each re-measure with the elements that became candidates since the previous one. */
  onRebuild?: (added: Element[]) => void;
  /** Wraps each rebuild for timing. */
  time?: <T>(fn: () => T) => T;
}

export class TargetScanner {
  candidates: Candidate[] = [];
  private grid = new Map<number, Candidate[]>();
  private readonly near = new Set<Element>();
  private readonly observed = new WeakSet<Element>();
  private pointerExtras = new Set<Element>();
  private io: IntersectionObserver | null = null;
  private mo: MutationObserver | null = null;
  private mutationTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private pointerTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPointerSample = -Infinity;
  private running = false;
  /** Duration of the most recent full rebuild (query + measure), ms. */
  lastRebuildMs = 0;

  constructor(private readonly opts: ScannerOptions = {}) {}

  start() {
    this.running = true;
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.near.add(e.target);
          else this.near.delete(e.target);
        }
        this.schedule();
      },
      { rootMargin: '150px' },
    );
    this.mo = new MutationObserver(() => {
      clearTimeout(this.mutationTimer);
      this.mutationTimer = setTimeout(() => this.fullRebuild(), 100);
    });
    this.mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-hidden', 'aria-disabled', 'aria-expanded', 'open', 'inert'],
    });
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    this.fullRebuild();
  }

  stop() {
    this.running = false;
    this.io?.disconnect();
    this.mo?.disconnect();
    clearTimeout(this.mutationTimer);
    cancelAnimationFrame(this.frame);
    clearTimeout(this.pointerTimer);
    window.removeEventListener('scroll', this.onScroll, { capture: true });
    window.removeEventListener('resize', this.onScroll);
    this.candidates = [];
    this.grid.clear();
  }

  private readonly onScroll = () => this.schedule();

  /** Re-measure on the next frame (scroll, resize, visibility changes). */
  schedule() {
    if (this.running && !this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.measure();
        this.schedulePointerSampling(); // scrolling reveals new div-buttons
      });
    }
  }

  /** Re-query the DOM (after mutations) and re-measure. */
  fullRebuild() {
    if (!this.running) return;
    const time = this.opts.time ?? ((fn) => fn());
    const t0 = performance.now();
    time(() => {
      for (const el of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (!this.observed.has(el)) {
          this.observed.add(el);
          this.io!.observe(el);
        }
      }
      this.measure();
    });
    this.lastRebuildMs = performance.now() - t0;
    this.schedulePointerSampling();
  }

  private measure() {
    const prev = new Set(this.candidates.map((c) => c.el));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next: Candidate[] = [];
    const consider = (el: Element, checkExcluded: boolean) => {
      if (!el.isConnected || (checkExcluded && isExcluded(el))) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return;
      if (!isRendered(el, r)) return;
      next.push({ el, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, area: r.width * r.height });
    };
    for (const el of this.near) consider(el, true);
    for (const el of this.pointerExtras) if (!this.near.has(el)) consider(el, true);
    for (const el of this.opts.extra?.() ?? []) consider(el, false);
    this.candidates = next;
    this.index();
    this.opts.onRebuild?.(next.filter((c) => !prev.has(c.el)).map((c) => c.el));
  }

  private index() {
    this.grid.clear();
    for (const c of this.candidates) {
      const x0 = Math.floor(c.rect.left / CELL);
      const x1 = Math.floor((c.rect.left + c.rect.width) / CELL);
      const y0 = Math.floor(c.rect.top / CELL);
      const y1 = Math.floor((c.rect.top + c.rect.height) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = cellKey(cx, cy);
          const bucket = this.grid.get(k);
          if (bucket) bucket.push(c);
          else this.grid.set(k, [c]);
        }
      }
    }
  }

  /** Candidates whose bounding box may be within `radius` of (x, y). */
  query(x: number, y: number, radius: number): Candidate[] {
    const out = new Set<Candidate>();
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const y0 = Math.floor((y - radius) / CELL);
    const y1 = Math.floor((y + radius) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.grid.get(cellKey(cx, cy));
        if (bucket) for (const c of bucket) out.add(c);
      }
    }
    return [...out];
  }

  /** Fresh candidate record for an element, if it is still a candidate. */
  find(el: Element): Candidate | undefined {
    return this.candidates.find((c) => c.el === el);
  }

  // --- cursor: pointer heuristic -------------------------------------------------

  /** At most one sampling pass every 500 ms, run when the main thread is idle. */
  private schedulePointerSampling() {
    if (this.pointerTimer !== undefined || !this.running) return;
    const wait = Math.max(0, 500 - (performance.now() - this.lastPointerSample));
    this.pointerTimer = setTimeout(() => {
      const run = () => {
        this.pointerTimer = undefined;
        this.lastPointerSample = performance.now();
        this.samplePointerCursors();
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
      else run();
    }, wait);
  }

  /**
   * Elements styled `cursor: pointer` without semantic markup (div-buttons). Found by
   * hit-testing a 48 px grid of viewport points, so cost is bounded by viewport size,
   * not DOM size. Budget: 6 ms.
   */
  private samplePointerCursors() {
    if (!this.running) return;
    const start = performance.now();
    const found = new Set<Element>();
    const seen = new Set<Element>();
    const step = 48;
    outer: for (let y = step / 2; y < window.innerHeight; y += step) {
      for (let x = step / 2; x < window.innerWidth; x += step) {
        if (performance.now() - start > 6) break outer;
        let el = document.elementFromPoint(x, y);
        // Walk up to the outermost ancestor that still has cursor: pointer.
        let best: Element | null = null;
        for (let depth = 0; el && depth < 6 && el !== document.body; depth++, el = el.parentElement) {
          if (seen.has(el)) {
            best = null;
            break;
          }
          seen.add(el);
          if (getComputedStyle(el).cursor === 'pointer') best = el;
          else if (best) break;
        }
        if (best && !best.matches(INTERACTIVE_SELECTOR) && !best.closest(INTERACTIVE_SELECTOR)) found.add(best);
      }
    }
    const changed = found.size !== this.pointerExtras.size || [...found].some((e) => !this.pointerExtras.has(e));
    this.pointerExtras = found;
    if (changed) this.schedule();
  }
}
