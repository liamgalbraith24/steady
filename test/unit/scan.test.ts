// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ScanController } from '../../src/content/scan/ScanController';
import { accessibleName, buildScanTree, countItems } from '../../src/content/scan/ScanTree';

const usable = () => true;

const PAGE = `
  <header><a href="/">Home</a><a href="/about">About</a></header>
  <nav aria-label="Primary">${Array.from({ length: 14 }, (_, i) => `<a href="#n${i}">Nav ${i}</a>`).join('')}</nav>
  <main>
    <h1>Article</h1>
    <a href="#r1">Read more</a><button>Like</button>
    <h2>Comments</h2>
    <label for="c">Comment</label><textarea id="c"></textarea><button>Post</button>
  </main>
  <button id="loose">Loose button</button>
`;

describe('buildScanTree', () => {
  it('groups by landmark, then heading, then controls in DOM order', () => {
    document.body.innerHTML = PAGE;
    const root = buildScanTree(document, { usable });
    expect(root.children.map((c) => c.label)).toEqual(['Header', 'Navigation: Primary', 'Main', 'Loose button']);
    const main = root.children[2]!;
    expect(main.children.map((c) => c.label)).toEqual(['Article', 'Comments']);
    expect(main.children[1]!.children.map((c) => `${c.role}:${c.label}`)).toEqual(['Field:Comment', 'Button:Post']);
    expect(countItems(root)).toBe(2 + 14 + 4 + 1); // the <label for> duplicate of the textarea is dropped
  });

  it('chunks long groups so no level has more than 10 entries', () => {
    document.body.innerHTML = PAGE;
    const nav = buildScanTree(document, { usable }).children[1]!;
    expect(nav.children.map((c) => c.label)).toEqual(['Items 1–8', 'Items 9–14']);
  });

  it('confines scanning to an open modal dialog', () => {
    document.body.innerHTML = `${PAGE}<div role="dialog" aria-modal="true" aria-label="Newsletter"><button>Close</button><button>Sign up</button></div>`;
    const root = buildScanTree(document, { usable });
    expect(root.children.map((c) => c.label)).toEqual(['Close', 'Sign up']);
  });

  it('keeps the outermost of nested controls and drops labels that duplicate a control', () => {
    document.body.innerHTML = `<a href="#"><button>Inner</button></a><label for="x">X</label><input id="x" type="checkbox"><button>B</button>`;
    const root = buildScanTree(document, { usable });
    expect(root.children.map((c) => c.el?.tagName)).toEqual(['A', 'INPUT', 'BUTTON']);
  });

  it('computes accessible names', () => {
    document.body.innerHTML = `<button aria-label="Close dialog">×</button><span id="l">Email</span><input aria-labelledby="l"><a href="#"><img alt="Logo"></a><input placeholder="Search">`;
    const [b, i, a, s] = Array.from(document.querySelectorAll('button, input, a'));
    expect([b, i, a, s].map((e) => accessibleName(e!))).toEqual(['Close dialog', 'Email', 'Logo', 'Search']);
  });
});

describe('ScanController', () => {
  it('scans, descends with Back first, activates, and shows a breadcrumb', () => {
    document.body.innerHTML = PAGE;
    const c = new ScanController(() => buildScanTree(document, { usable }));
    expect(c.breadcrumb()).toBe('Header (2 items)');
    c.next();
    c.next(); // Main
    expect(c.breadcrumb()).toBe('Main (4 items)');
    expect(c.select()).toEqual({ type: 'descend' });
    expect(c.current).toMatchObject({ kind: 'back' });
    expect(c.breadcrumb()).toBe('Main › Back (up to top)');
    c.next(); // Article
    c.select();
    c.next(); // Read more
    expect(c.breadcrumb()).toBe('Main › Article › Link 1 of 2: Read more');
    const r = c.select();
    expect(r).toMatchObject({ type: 'activate', label: 'Read more' });
  });

  it('Back returns to the group just left, and next wraps around', () => {
    document.body.innerHTML = PAGE;
    const c = new ScanController(() => buildScanTree(document, { usable }));
    c.next(); // Navigation
    c.select();
    c.select(); // Back
    expect(c.breadcrumb()).toBe('Navigation: Primary (14 items)');
    c.prev();
    c.prev();
    expect(c.breadcrumb()).toBe('Button 4 of 4: Loose button'); // wrapped around to the end
    c.reset();
    expect(c.depth).toBe(0);
  });
});
