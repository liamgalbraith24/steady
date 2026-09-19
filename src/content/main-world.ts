// Runs in the page's MAIN world at document_start. Its only job is best-effort
// detection of dblclick listeners so the isolated-world content script can offer
// "single activation = double click" (spec F4 / Phase 5.3).
//
// Channel: the content script dispatches a cancelable `steady:has-dblclick` event
// on an element; we call preventDefault() if that element or a near ancestor has a
// dblclick listener. dispatchEvent() returning false is a synchronous boolean that
// crosses the world boundary without sharing any JS objects.
(() => {
  try {
    const marked = new WeakSet<EventTarget>();
    const original = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      try {
        if (type === 'dblclick') marked.add(this);
      } catch {}
      return original.call(this, type, listener, options);
    };
    document.addEventListener(
      'steady:has-dblclick',
      (e) => {
        try {
          let el: Element | null = e.target as Element;
          for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
            if (marked.has(el) || (el as HTMLElement).ondblclick || el.hasAttribute('ondblclick')) {
              e.preventDefault();
              return;
            }
          }
        } catch {}
      },
      true,
    );
  } catch {
    // Fail open: never break the page.
  }
})();
