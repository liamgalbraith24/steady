// Switch-scanning mode: turns switch intents into scan navigation, draws the scan
// outline and breadcrumb, and hands selected controls back to the pipeline to activate.
import type { IntentEvent } from '../input/InputSource';
import { hoverTransition } from '../dispatch';
import type { Overlay, Rect } from '../overlay/overlay';
import { unionRect } from '../timepressure/geometry';
import { ScanController } from './ScanController';
import { buildScanTree, type ScanNode } from './ScanTree';

/** After an activation, give the page a moment to react before rebuilding the tree. */
const RESET_AFTER_ACTIVATE_MS = 350;

export interface ScanModeHooks {
  activate: (el: Element) => void;
  log: (kind: string, data?: Record<string, string | number | boolean | null>) => void;
  /** Called after an activation (e.g. to restart automatic scan timing). */
  afterSelect?: () => void;
}

function usable(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
}

function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export class ScanMode {
  private readonly ctrl: ScanController;
  private hovered: Element | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly overlay: Overlay,
    private readonly hooks: ScanModeHooks,
  ) {
    this.ctrl = new ScanController(() => this.build());
  }

  private build(): ScanNode {
    if (this.overlay.pickerOpen) {
      const buttons = this.overlay.interactiveElements();
      return {
        kind: 'group',
        label: 'Choose an option',
        el: null,
        role: 'Group',
        children: buttons.map((b) => ({
          kind: 'item',
          label: (b.textContent ?? '').trim(),
          el: b,
          children: [],
          role: b.closest('.options') ? 'Option' : 'Button',
        })),
      };
    }
    const drawer = this.overlay.interactiveElements();
    return buildScanTree(document, { usable, extra: { label: 'Steady: page messages', els: drawer } });
  }

  start() {
    this.ctrl.reset();
    this.changed();
  }

  onIntent(e: IntentEvent) {
    switch (e.kind) {
      case 'scanNext':
        this.ctrl.next();
        break;
      case 'scanPrev':
        this.ctrl.prev();
        break;
      case 'cancel':
        if (this.overlay.pickerOpen) {
          this.overlay.closePicker();
          this.ctrl.reset();
        } else this.ctrl.back();
        break;
      case 'activate': {
        const r = this.ctrl.select();
        if (!r) break;
        this.hooks.log('scanSelect', { type: r.type, depth: this.ctrl.depth });
        if (r.type === 'activate') {
          this.hooks.activate(r.el);
          this.hooks.afterSelect?.();
          this.resetSoon();
        }
        break;
      }
    }
    this.changed();
  }

  /** Rebuild the tree shortly (after an activation, or when a picker opens or closes). */
  resetSoon() {
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.ctrl.reset();
      this.changed();
    }, RESET_AFTER_ACTIVATE_MS);
  }

  private changed() {
    const e = this.ctrl.current;
    if (e?.kind === 'node' && e.node.kind === 'item' && e.node.el) {
      // Hover the highlighted control so hover menus open for switch users too. Hover is
      // only moved when another *control* is highlighted, so a menu opened by hovering its
      // trigger stays open while the user scans into it.
      if (!this.overlay.contains(e.node.el)) {
        hoverTransition(this.hovered, e.node.el);
        this.hovered = e.node.el;
      }
      e.node.el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (e?.kind === 'node' && e.node.kind === 'group') {
      const first = firstItem(e.node);
      const r = first?.getBoundingClientRect();
      if (first && r && (r.bottom < 0 || r.top > window.innerHeight)) first.scrollIntoView?.({ block: 'center' });
    }
    this.render();
  }

  private rectOf(node: ScanNode): Rect | null {
    if (node.el && node.el.isConnected) return toRect(node.el.getBoundingClientRect());
    const rects: Rect[] = [];
    const walk = (n: ScanNode) => {
      if (n.kind === 'item' && n.el?.isConnected) rects.push(toRect(n.el.getBoundingClientRect()));
      n.children.forEach(walk);
    };
    walk(node);
    return unionRect(rects);
  }

  render() {
    const e = this.ctrl.current;
    const crumb = this.ctrl.breadcrumb();
    if (!e) return this.overlay.setScan(null, crumb);
    if (e.kind === 'back') {
      this.overlay.setScan(null, crumb);
      return;
    }
    this.overlay.setScan(this.rectOf(e.node), crumb);
  }

  destroy() {
    clearTimeout(this.resetTimer);
    if (this.hovered) hoverTransition(this.hovered, null);
    this.overlay.setScan(null, null);
  }
}

function firstItem(n: ScanNode): Element | null {
  if (n.kind === 'item') return n.el;
  for (const c of n.children) {
    const f = firstItem(c);
    if (f) return f;
  }
  return null;
}
