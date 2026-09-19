// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { INTERACTIVE_SELECTOR, matchesInteractive } from '../../src/content/targets/scanner';

function build(html: string) {
  document.body.innerHTML = html;
  return Array.from(document.body.querySelectorAll('[data-t]'));
}

describe('scanner selectors', () => {
  it('includes the interactive elements named in the spec', () => {
    const els = build(`
      <a data-t href="/x">link</a>
      <button data-t>b</button>
      <input data-t type="text"><select data-t></select><textarea data-t></textarea>
      <details><summary data-t>more</summary></details>
      <div data-t role="button">r</div><span data-t role="link">l</span><div data-t role="checkbox"></div>
      <div data-t role="radio"></div><div data-t role="menuitem"></div><div data-t role="tab"></div>
      <div data-t role="option"></div><div data-t role="switch"></div>
      <div data-t tabindex="0">focusable</div><div data-t onclick="void 0">legacy</div>
      <label data-t for="i">Label</label><input id="i" type="checkbox">
      <div data-t contenteditable="true"></div>
    `);
    for (const el of els) expect(matchesInteractive(el), el.outerHTML).toBe(true);
  });

  it('excludes non-targets', () => {
    build(`
      <a id="noHref">anchor without href</a>
      <input id="hidden" type="hidden">
      <button id="disabled" disabled>x</button>
      <fieldset disabled><button id="inFieldset">x</button></fieldset>
      <div aria-hidden="true"><button id="ariaHidden">x</button></div>
      <div inert><a id="inert" href="#">x</a></div>
      <div id="neg" tabindex="-1">x</div>
      <div id="ariaDisabled" role="button" aria-disabled="true">x</div>
      <label id="orphanLabel">no control</label>
      <button id="hiddenAttr" hidden>x</button>
    `);
    for (const id of ['noHref', 'hidden', 'disabled', 'inFieldset', 'ariaHidden', 'inert', 'neg', 'ariaDisabled', 'orphanLabel', 'hiddenAttr']) {
      expect(matchesInteractive(document.getElementById(id)!), id).toBe(false);
    }
  });

  it('never matches body or html', () => {
    document.body.setAttribute('tabindex', '0');
    expect(document.body.matches(INTERACTIVE_SELECTOR)).toBe(true);
    expect(matchesInteractive(document.body)).toBe(false);
  });
});
