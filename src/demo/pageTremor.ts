// Baseline tremor simulation, used when Steady is absent or paused. The page draws
// its own jittering cursor and redirects each click to whatever is under the
// jittered point, so "unaided with tremor" can be demonstrated and measured.
// (When Steady is running, the demo hands the simulation to Steady instead, so
// Steady's filter sees the jittered signal.)
import { tremorOffset } from '../shared/tremor';

export class PageTremor {
  private amplitude = 0;
  private real: { x: number; y: number } | null = null;
  private jittered: { x: number; y: number } | null = null;
  private frame = 0;
  private readonly cursor: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private redirecting = false;

  constructor() {
    this.cursor = document.createElement('div');
    this.cursor.className = 'sim-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.style = document.createElement('style');
    this.style.textContent = 'html.sim-tremor, html.sim-tremor * { cursor: none !important; }';
    document.head.append(this.style);
    document.body.append(this.cursor);
    window.addEventListener('pointermove', (e) => (this.real = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });
    // Registered before Steady's content script (which loads at document_idle), so when
    // the page simulation is on it sees clicks first.
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const) {
      window.addEventListener(type, (e) => this.intercept(e as MouseEvent), { capture: true });
    }
  }

  get active() {
    return this.amplitude > 0;
  }

  set(amplitudePx: number) {
    this.amplitude = amplitudePx;
    document.documentElement.classList.toggle('sim-tremor', amplitudePx > 0);
    cancelAnimationFrame(this.frame);
    this.cursor.style.display = amplitudePx > 0 ? 'block' : 'none';
    if (amplitudePx > 0) {
      const tick = (now: number) => {
        if (this.real) {
          const { dx, dy } = tremorOffset(now, { amplitudePx: this.amplitude, frequencyHz: 5 });
          this.jittered = { x: this.real.x + dx, y: this.real.y + dy };
          this.cursor.style.transform = `translate(${this.jittered.x}px, ${this.jittered.y}px)`;
        }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    }
  }

  private intercept(e: MouseEvent) {
    if (!this.active || !e.isTrusted || !this.jittered || this.redirecting) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Replay the event at the jittered point.
    const { x, y } = this.jittered;
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    this.redirecting = true;
    try {
      const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window };
      const Ctor = e.type.startsWith('pointer') ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Ctor(e.type, { ...init, ...(Ctor === PointerEvent ? { pointerType: 'mouse', isPrimary: true } : {}) }));
      if (e.type === 'mousedown') {
        const focusable = (target as Element).closest<HTMLElement>('input, select, textarea, button, a[href], [tabindex]');
        if (focusable) focusable.focus();
        else (document.activeElement as HTMLElement | null)?.blur?.();
      }
    } finally {
      this.redirecting = false;
    }
  }
}
