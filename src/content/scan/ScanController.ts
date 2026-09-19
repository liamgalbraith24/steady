// Switch-scanning navigation over a ScanNode tree. Pure (the tree builder is injected).
// Inside any group the first entry is always "Back" (spec S1.4).
import { countItems, type ScanNode } from './ScanTree';

export type ScanEntry = { kind: 'back'; label: string } | { kind: 'node'; node: ScanNode };

export type SelectResult =
  | { type: 'descend' }
  | { type: 'back' }
  | { type: 'activate'; el: Element; label: string };

export class ScanController {
  private root: ScanNode;
  private path: ScanNode[] = [];
  private index = 0;

  constructor(private readonly build: () => ScanNode) {
    this.root = build();
  }

  /** Rebuild from the page and return to the top level. */
  reset() {
    this.root = this.build();
    this.path = [];
    this.index = 0;
  }

  private get group(): ScanNode {
    return this.path[this.path.length - 1] ?? this.root;
  }

  get depth() {
    return this.path.length;
  }

  entries(): ScanEntry[] {
    const nodes = this.group.children.map((node): ScanEntry => ({ kind: 'node', node }));
    if (!this.path.length) return nodes;
    const parent = this.path.length > 1 ? this.path[this.path.length - 2]!.label : 'top';
    return [{ kind: 'back', label: `Back (up to ${parent})` }, ...nodes];
  }

  get current(): ScanEntry | null {
    return this.entries()[this.index] ?? null;
  }

  next() {
    const n = this.entries().length;
    if (n) this.index = (this.index + 1) % n;
  }

  prev() {
    const n = this.entries().length;
    if (n) this.index = (this.index - 1 + n) % n;
  }

  back() {
    if (!this.path.length) return;
    const left = this.path.pop()!;
    // Land on the group we just left, so "back" doesn't lose the user's place.
    const i = this.group.children.indexOf(left);
    this.index = i < 0 ? 0 : i + (this.path.length ? 1 : 0);
  }

  select(): SelectResult | null {
    const e = this.current;
    if (!e) return null;
    if (e.kind === 'back') {
      this.back();
      return { type: 'back' };
    }
    if (e.node.kind === 'group') {
      this.path.push(e.node);
      this.index = 0;
      return { type: 'descend' };
    }
    return { type: 'activate', el: e.node.el!, label: e.node.label };
  }

  /** e.g. "Main › Article › Link 3 of 12: Read more" */
  breadcrumb(): string {
    const trail = this.path.map((p) => p.label);
    const e = this.current;
    if (!e) return [...trail, '(nothing to select)'].join(' › ');
    if (e.kind === 'back') return [...trail, e.label].join(' › ');
    const siblings = this.group.children;
    const pos = siblings.indexOf(e.node) + 1;
    const here =
      e.node.kind === 'group'
        ? `${e.node.label} (${countItems(e.node)} items)`
        : `${e.node.role} ${pos} of ${siblings.length}: ${e.node.label}`;
    return [...trail, here].join(' › ');
  }
}
