// Builds the switch-scanning hierarchy from the page:
//   landmarks (main, nav, header, form, regions…) → sections (by heading) → controls (DOM order)
// Single-child groups collapse; long lists are chunked so no level has more than ~10 entries.
import { INTERACTIVE_SELECTOR, isExcluded } from '../targets/scanner';

export interface ScanNode {
  kind: 'group' | 'item';
  label: string;
  /** Items: the control to activate. Groups: the landmark/container (for highlighting), if any. */
  el: Element | null;
  children: ScanNode[];
  /** Short type word for breadcrumbs ("Link", "Button", "Field", …). */
  role: string;
}

export const LANDMARK_SELECTOR = [
  'main', 'nav', 'header', 'footer', 'aside', 'form', 'dialog[open]',
  '[role="main"]', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
  '[role="search"]', '[role="form"]', '[role="region"]', '[role="dialog"]',
  'section[aria-label]', 'section[aria-labelledby]',
].join(',');

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
const MAX_GROUP = 10;
const CHUNK = 8;

const clean = (s: string | null | undefined, max = 60) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function textFromIds(ids: string | null): string {
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

/** A practical approximation of the accessible name. */
export function accessibleName(el: Element): string {
  const aria = clean(el.getAttribute('aria-label')) || clean(textFromIds(el.getAttribute('aria-labelledby')));
  if (aria) return aria;
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const label = el.labels?.[0];
    if (label) return clean(label.textContent);
    if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) return clean(el.value);
    return clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title')) || clean(el.getAttribute('name'));
  }
  const text = clean(el.textContent);
  if (text) return text;
  const img = el.querySelector('img[alt]');
  return clean(img?.getAttribute('alt')) || clean(el.getAttribute('title')) || '';
}

export function roleWord(el: Element): string {
  const role = el.getAttribute('role');
  if (role) {
    const map: Record<string, string> = { link: 'Link', button: 'Button', checkbox: 'Checkbox', radio: 'Option', tab: 'Tab', menuitem: 'Menu item', option: 'Option', switch: 'Switch' };
    if (map[role]) return map[role];
  }
  if (el instanceof HTMLAnchorElement) return 'Link';
  if (el instanceof HTMLButtonElement || el.tagName === 'SUMMARY') return 'Button';
  if (el instanceof HTMLSelectElement) return 'List';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'Checkbox';
    if (el.type === 'radio') return 'Option';
    if (['button', 'submit', 'reset'].includes(el.type)) return 'Button';
    return 'Field';
  }
  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return 'Field';
  if (el instanceof HTMLLabelElement) return 'Choice';
  return 'Item';
}

function landmarkLabel(el: Element): string {
  const name = clean(el.getAttribute('aria-label')) || clean(textFromIds(el.getAttribute('aria-labelledby')));
  const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
  const words: Record<string, string> = {
    main: 'Main', nav: 'Navigation', navigation: 'Navigation', header: 'Header', banner: 'Header', footer: 'Footer',
    contentinfo: 'Footer', aside: 'Sidebar', complementary: 'Sidebar', form: 'Form', search: 'Search', region: 'Region',
    section: 'Region', dialog: 'Dialog',
  };
  const word = words[role] ?? 'Region';
  return name ? (name.toLowerCase().includes(word.toLowerCase()) ? name : `${word}: ${name}`) : word;
}

const item = (el: Element): ScanNode => ({ kind: 'item', label: accessibleName(el) || roleWord(el), el, children: [], role: roleWord(el) });

/** Split long lists into sub-groups of CHUNK ("Links 1–8"), recursively. */
function chunk(nodes: ScanNode[], noun: string): ScanNode[] {
  if (nodes.length <= MAX_GROUP) return nodes;
  const groups: ScanNode[] = [];
  for (let i = 0; i < nodes.length; i += CHUNK) {
    const part = nodes.slice(i, i + CHUNK);
    groups.push({ kind: 'group', label: `${noun} ${i + 1}–${i + part.length}`, el: null, children: part, role: 'Group' });
  }
  return chunk(groups, 'Groups');
}

function group(label: string, el: Element | null, children: ScanNode[]): ScanNode | null {
  if (!children.length) return null;
  if (children.length === 1) return children[0]!;
  return { kind: 'group', label, el, children: chunk(children, 'Items'), role: 'Group' };
}

export interface BuildOptions {
  /** Is the element rendered and usable? (Layout checks are injected so tests can run in jsdom.) */
  usable: (el: Element) => boolean;
  /** Extra targets (Steady's notices drawer) appended as their own group. */
  extra?: { label: string; els: Element[] };
}

export function buildScanTree(doc: Document, opts: BuildOptions): ScanNode {
  const all = Array.from(doc.querySelectorAll(INTERACTIVE_SELECTOR)).filter((el) => !isExcluded(el) && opts.usable(el));
  const set = new Set(all);
  const items = all.filter((el) => {
    // Keep the outermost of nested controls (e.g. a button inside a link).
    for (let a = el.parentElement; a; a = a.parentElement) if (set.has(a)) return false;
    // A <label for=x> duplicates its control; keep the control.
    if (el instanceof HTMLLabelElement && el.control && set.has(el.control)) return false;
    return true;
  });

  // A modal dialog confines scanning to itself.
  const modal = doc.querySelector('dialog[open][aria-modal="true"], dialog:modal, [role="dialog"][aria-modal="true"]:not([hidden])');
  const scoped = modal ? items.filter((el) => modal.contains(el)) : items;

  // Outermost landmark for each item.
  const outermost = (el: Element): Element | null => {
    let found: Element | null = null;
    for (let a = el.parentElement; a; a = a.parentElement) if (a.matches(LANDMARK_SELECTOR)) found = a;
    return found;
  };
  const byLandmark = new Map<Element | null, Element[]>();
  for (const el of scoped) {
    const lm = modal ?? outermost(el);
    byLandmark.set(lm, [...(byLandmark.get(lm) ?? []), el]);
  }

  const top: ScanNode[] = [];
  for (const [lm, els] of byLandmark) {
    // Sections: items grouped by the nearest preceding heading inside the landmark.
    const container = lm ?? doc.body;
    const headings = Array.from(container.querySelectorAll(HEADING_SELECTOR)).filter((h) => opts.usable(h));
    const sections = new Map<Element | null, Element[]>();
    for (const el of els) {
      let heading: Element | null = null;
      for (const h of headings) {
        if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) heading = h;
        else break;
      }
      sections.set(heading, [...(sections.get(heading) ?? []), el]);
    }
    const sectionNodes: ScanNode[] = [];
    for (const [h, sEls] of sections) {
      const label = h ? clean(h.textContent) || 'Section' : lm ? `Top of ${landmarkLabel(lm)}` : 'Other controls';
      const g = group(label, null, sEls.map(item));
      if (g) sectionNodes.push(g);
    }
    if (!lm) {
      top.push(...sectionNodes);
      continue;
    }
    // A landmark with a single section needs no extra level.
    const only = sectionNodes.length === 1 ? sectionNodes[0]! : null;
    const g = group(landmarkLabel(lm), lm, only && only.kind === 'group' ? only.children : sectionNodes);
    if (g) top.push(g);
  }

  if (opts.extra?.els.length) {
    const g = group(opts.extra.label, null, opts.extra.els.map(item));
    if (g) top.push(g);
  }

  const root: ScanNode = { kind: 'group', label: modal ? landmarkLabel(modal) : 'Page', el: null, children: chunk(top, 'Areas'), role: 'Group' };
  // A root with a single group: start inside it.
  if (root.children.length === 1 && root.children[0]!.kind === 'group') return root.children[0]!;
  return root;
}

/** Leaf count, for labels like "Navigation (14 items)". */
export function countItems(n: ScanNode): number {
  return n.kind === 'item' ? 1 : n.children.reduce((a, c) => a + countItems(c), 0);
}
