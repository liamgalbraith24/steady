// Shadow-DOM overlay: ghost cursor, highlight ring, dwell ring, resting badge,
// scan outline + breadcrumb, notices drawer, and the select-option picker.
// The host is a fixed, pointer-events:none layer; only the panels take input.
import css from './overlay.css';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const place = (e: HTMLElement | SVGElement, x: number, y: number) => {
  e.style.transform = `translate(${Math.round(x * 10) / 10}px, ${Math.round(y * 10) / 10}px)`;
};

export interface Notice {
  id: number;
  text: string;
  at: Date;
}

export class Overlay {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly layer: HTMLElement;
  private readonly ghost: SVGElement;
  private readonly raw: HTMLElement;
  private readonly hl: HTMLElement;
  private readonly dwell: SVGElement;
  private readonly dwellProgress: SVGElement;
  private readonly rest: HTMLElement;
  private readonly scan: HTMLElement;
  private readonly crumb: HTMLElement;
  private drawer: HTMLElement | null = null;
  private picker: HTMLElement | null = null;
  private notices: Notice[] = [];
  private noticeSeq = 0;
  private cursorStyle: HTMLStyleElement | null = null;

  constructor() {
    this.host = document.createElement('div');
    // Neutralise anything the page's CSS might apply to a bare <div>, and the UA popover styles.
    this.host.style.cssText =
      'all:initial !important;position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;' +
      'margin:0 !important;padding:0 !important;border:0 !important;background:transparent !important;' +
      'pointer-events:none !important;z-index:2147483647 !important;overflow:visible !important;' +
      'max-width:none !important;max-height:none !important;display:block !important;';
    this.root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css;
    this.layer = el('div', 'layer');
    this.root.append(style, this.layer);

    this.ghost = svg('svg', { class: 'ghost', viewBox: '0 0 28 28', 'aria-hidden': 'true' });
    this.ghost.append(
      svg('path', {
        d: 'M3 2 L3 23 L8.5 17.5 L12.5 26 L16.5 24.2 L12.6 16 L20 16 Z',
        fill: '#111',
        stroke: '#fff',
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      }),
    );
    this.raw = el('div', 'raw');
    this.hl = el('div', 'hl');
    this.dwell = svg('svg', { class: 'dwell', viewBox: '0 0 52 52', 'aria-hidden': 'true' });
    this.dwellProgress = svg('circle', { class: 'progress', cx: 26, cy: 26, r: RING_R, 'stroke-dasharray': RING_C });
    this.dwell.append(
      svg('circle', { class: 'track', cx: 26, cy: 26, r: RING_R }),
      svg('circle', { class: 'edge', cx: 26, cy: 26, r: RING_R + 5 }),
      svg('circle', { class: 'edge', cx: 26, cy: 26, r: RING_R - 5 }),
      this.dwellProgress,
    );
    this.rest = el('div', 'rest', 'Resting — move to continue');
    this.scan = el('div', 'scan');
    this.crumb = el('div', 'crumb');
    this.crumb.setAttribute('role', 'status');
    this.crumb.setAttribute('aria-live', 'polite');
    for (const e of [this.hl, this.scan, this.dwell, this.rest, this.raw, this.ghost, this.crumb]) {
      this.hide(e);
      this.layer.append(e);
    }
  }

  mount() {
    document.documentElement.append(this.host);
    this.raise();
  }

  /** Move the overlay to the top layer (above modal dialogs and popovers), where supported. */
  raise() {
    try {
      if (!('showPopover' in this.host)) return;
      if (!this.host.hasAttribute('popover')) this.host.setAttribute('popover', 'manual');
      if (this.host.matches(':popover-open')) this.host.hidePopover();
      this.host.showPopover();
    } catch {
      // Not connected yet, or popover unsupported: the z-index still applies.
    }
  }

  destroy() {
    this.setSystemCursorHidden(false);
    this.host.remove();
  }

  contains(node: EventTarget | null): boolean {
    return node === this.host || (node instanceof Node && this.root.contains(node));
  }

  private hide(e: HTMLElement | SVGElement) {
    e.style.display = 'none';
  }
  private show(e: HTMLElement | SVGElement) {
    e.style.display = '';
  }

  // --- Cursor -----------------------------------------------------------------

  setGhost(p: { x: number; y: number } | null) {
    if (!p) return this.hide(this.ghost);
    this.show(this.ghost);
    place(this.ghost, p.x - 3, p.y - 2);
  }

  setRaw(p: { x: number; y: number } | null) {
    if (!p) return this.hide(this.raw);
    this.show(this.raw);
    place(this.raw, p.x, p.y);
  }

  setSystemCursorHidden(hidden: boolean) {
    if (hidden && !this.cursorStyle) {
      this.cursorStyle = document.createElement('style');
      this.cursorStyle.textContent = 'html, html *, html *::before, html *::after { cursor: none !important; }';
      (document.head ?? document.documentElement).append(this.cursorStyle);
    } else if (!hidden && this.cursorStyle) {
      this.cursorStyle.remove();
      this.cursorStyle = null;
    }
  }

  // --- Target highlight ---------------------------------------------------------

  setHighlight(r: Rect | null, style: 'ring' | 'fill' = 'ring', growPx = 0) {
    if (!r) return this.hide(this.hl);
    this.show(this.hl);
    const pad = 3 + growPx;
    this.hl.classList.toggle('fill', style === 'fill');
    this.hl.style.width = `${r.width + pad * 2}px`;
    this.hl.style.height = `${r.height + pad * 2}px`;
    place(this.hl, r.left - pad, r.top - pad);
  }

  // --- Dwell --------------------------------------------------------------------

  setDwell(p: { x: number; y: number } | null, progress: number) {
    if (!p) return this.hide(this.dwell);
    this.show(this.dwell);
    place(this.dwell, p.x + 22, p.y + 22);
    this.dwellProgress.setAttribute('stroke-dashoffset', String(RING_C * (1 - Math.min(1, Math.max(0, progress)))));
  }

  setResting(p: { x: number; y: number } | null) {
    if (!p) return this.hide(this.rest);
    this.show(this.rest);
    const x = Math.min(p.x + 18, window.innerWidth - 230);
    place(this.rest, Math.max(4, x), p.y + 26);
  }

  // --- Switch scanning ------------------------------------------------------------

  setScan(r: Rect | null, breadcrumb: string | null) {
    if (!r) this.hide(this.scan);
    else {
      this.show(this.scan);
      this.scan.style.width = `${r.width + 12}px`;
      this.scan.style.height = `${r.height + 12}px`;
      place(this.scan, r.left - 6, r.top - 6);
    }
    if (!breadcrumb) this.hide(this.crumb);
    else {
      this.show(this.crumb);
      if (this.crumb.textContent !== breadcrumb) this.crumb.textContent = breadcrumb;
    }
  }

  // --- Notices drawer (F4 toast pausing) --------------------------------------------

  addNotice(text: string) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!clean || this.notices.some((n) => n.text === clean)) return;
    this.notices.push({ id: ++this.noticeSeq, text: clean, at: new Date() });
    if (this.notices.length > 20) this.notices.shift();
    this.renderDrawer();
  }

  get noticeTexts(): string[] {
    return this.notices.map((n) => n.text);
  }

  private dismissNotice(id: number | 'all') {
    this.notices = id === 'all' ? [] : this.notices.filter((n) => n.id !== id);
    this.renderDrawer();
  }

  private renderDrawer() {
    if (!this.notices.length) {
      this.drawer?.remove();
      this.drawer = null;
      return;
    }
    if (!this.drawer) {
      this.drawer = el('section', 'panel drawer');
      this.drawer.setAttribute('role', 'region');
      this.drawer.setAttribute('aria-label', 'Steady: saved page messages');
      this.layer.append(this.drawer);
    }
    const header = el('header');
    const h = el('h2', undefined, `Page messages (${this.notices.length})`);
    const all = el('button', 'secondary', 'Dismiss all');
    all.type = 'button';
    all.addEventListener('click', () => this.dismissNotice('all'));
    header.append(h, all);
    const list = el('ul');
    for (const n of this.notices) {
      const li = el('li');
      const body = el('div');
      const time = el('time', undefined, n.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      body.append(el('p', undefined, n.text), time);
      const btn = el('button', 'secondary', 'Dismiss');
      btn.type = 'button';
      btn.setAttribute('aria-label', `Dismiss: ${n.text.slice(0, 60)}`);
      btn.addEventListener('click', () => this.dismissNotice(n.id));
      li.append(body, btn);
      list.append(li);
    }
    this.drawer.replaceChildren(header, list);
  }

  // --- Select picker (fallback when showPicker() is unavailable) ------------------------

  get pickerOpen() {
    return !!this.picker;
  }

  showSelectPicker(select: HTMLSelectElement, label: string, onDone: (chosen: boolean) => void) {
    this.closePicker();
    const panel = el('section', 'panel picker');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', `Choose: ${label}`);
    const h = el('h2', undefined, `Choose: ${label}`);
    const opts = el('div', 'options');
    Array.from(select.options).forEach((o, i) => {
      if (o.disabled || o.hidden) return;
      const b = el('button', o.selected ? '' : 'secondary', o.text || o.value || '(empty)');
      b.type = 'button';
      b.setAttribute('aria-current', String(o.selected));
      b.addEventListener('click', () => {
        select.selectedIndex = i;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        this.closePicker();
        onDone(true);
      });
      opts.append(b);
    });
    const footer = el('footer');
    const cancel = el('button', 'secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      this.closePicker();
      onDone(false);
    });
    footer.append(cancel);
    panel.append(h, opts, footer);
    this.layer.append(panel);
    this.picker = panel;
  }

  closePicker() {
    this.picker?.remove();
    this.picker = null;
  }

  /** Steady's own interactive controls, so they can be snapped to, dwelled on, and scanned. */
  interactiveElements(): HTMLElement[] {
    const scope = this.picker ?? this.layer;
    return Array.from(scope.querySelectorAll<HTMLElement>('button'));
  }
}
