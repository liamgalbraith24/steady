// Synthetic event dispatch: activation (click), hover, and double click.
// Events are untrusted (isTrusted = false). Most sites handle them, and links,
// checkboxes, labels, <summary> and buttons all run their activation behaviour on
// a synthetic click. When a trusted gesture is in progress, the page also has
// user activation (popups, showPicker, fullscreen work).

export type ActivationResult = 'clicked' | 'focused' | 'noop' | 'picker';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'datetime-local', 'month', 'time', 'week', '']);

export function isTextEntry(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

function centre(el: Element) {
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
  return { x, y };
}

function mouseInit(x: number, y: number, extra: MouseEventInit = {}): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 0,
    ...extra,
  };
}

function fire(el: Element, type: string, x: number, y: number, extra: MouseEventInit = {}): boolean {
  const init = mouseInit(x, y, extra);
  const ev = type.startsWith('pointer')
    ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true })
    : new MouseEvent(type, init);
  return el.dispatchEvent(ev);
}

function focusable(el: Element): el is HTMLElement {
  return el instanceof HTMLElement && (el.tabIndex >= 0 || el.isContentEditable || el.matches('a[href], button, input, select, textarea, summary'));
}

/** Best-effort: does el (or a near ancestor) have a dblclick listener? Answered by main-world.ts. */
export function hasDblclickListener(el: Element): boolean {
  try {
    const probe = new CustomEvent('steady:has-dblclick', { bubbles: false, cancelable: true });
    return !el.dispatchEvent(probe);
  } catch {
    return false;
  }
}

export interface ActivateOptions {
  doubleClick?: boolean;
  /** Called for <select> when the native picker cannot be opened. */
  openSelect?: (select: HTMLSelectElement) => void;
}

export function activate(el: Element, opts: ActivateOptions = {}): ActivationResult {
  const { x, y } = centre(el);
  if (isTextEntry(el)) {
    if (document.activeElement === el) return 'noop'; // a second dwell must not re-fire focus
    press(el, x, y, 1);
    (el as HTMLElement).focus();
    return 'focused';
  }
  if (el instanceof HTMLSelectElement) {
    el.focus();
    try {
      if (navigator.userActivation?.isActive && typeof el.showPicker === 'function') {
        el.showPicker();
        return 'picker';
      }
    } catch {}
    opts.openSelect?.(el);
    return 'picker';
  }
  press(el, x, y, 1);
  if (opts.doubleClick && hasDblclickListener(el)) {
    press(el, x, y, 2);
    fire(el, 'dblclick', x, y, { detail: 2 });
  }
  return 'clicked';
}

function press(el: Element, x: number, y: number, detail: number) {
  fire(el, 'pointerdown', x, y, { buttons: 1 });
  const downOk = fire(el, 'mousedown', x, y, { buttons: 1, detail });
  if (downOk && focusable(el) && document.activeElement !== el) el.focus({ preventScroll: true });
  fire(el, 'pointerup', x, y);
  fire(el, 'mouseup', x, y, { detail });
  fire(el, 'click', x, y, { detail });
}

/** Synthetic hover transition from `from` to `to` (either may be null). */
export function hoverTransition(from: Element | null, to: Element | null) {
  if (from === to) return;
  const p = to ? centre(to) : from ? centre(from) : { x: 0, y: 0 };
  if (from && from.isConnected) {
    fire(from, 'pointerout', p.x, p.y, { relatedTarget: to });
    fire(from, 'mouseout', p.x, p.y, { relatedTarget: to });
    for (const a of ancestorsNotContaining(from, to)) {
      fire(a, 'pointerleave', p.x, p.y, { bubbles: false, relatedTarget: to });
      fire(a, 'mouseleave', p.x, p.y, { bubbles: false, relatedTarget: to });
    }
  }
  if (to) hoverOver(to, from);
}

/** mouseover + mouseenter on `el` (and near ancestors not containing `from`). */
export function hoverOver(el: Element, from: Element | null = null) {
  const { x, y } = centre(el);
  fire(el, 'pointerover', x, y, { relatedTarget: from });
  fire(el, 'mouseover', x, y, { relatedTarget: from });
  for (const a of ancestorsNotContaining(el, from).reverse()) {
    fire(a, 'pointerenter', x, y, { bubbles: false, relatedTarget: from });
    fire(a, 'mouseenter', x, y, { bubbles: false, relatedTarget: from });
  }
  fire(el, 'mousemove', x, y);
}

/** el and up to 3 ancestors (never body/html) that do not contain `other`. */
function ancestorsNotContaining(el: Element, other: Element | null): Element[] {
  const out: Element[] = [];
  for (let a: Element | null = el; a && out.length < 4; a = a.parentElement) {
    if (a === document.body || a === document.documentElement) break;
    if (other && a.contains(other)) break;
    out.push(a);
  }
  return out;
}
