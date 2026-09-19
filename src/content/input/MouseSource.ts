// Mouse / pen / trackpad input. Emits a sample per trusted pointermove and an
// `activate` intent per primary-button pointerdown (carrying the native event so
// the pipeline can redirect the click to the captured target).
import type { InputSource, IntentEvent, PointerSample } from './InputSource';

export class MouseSource implements InputSource {
  private sampleCb: (s: PointerSample) => void = () => {};
  private intentCb: (e: IntentEvent) => void = () => {};
  private leaveCb: () => void = () => {};

  private readonly onMove = (e: PointerEvent) => {
    if (!e.isTrusted || e.pointerType === 'touch') return;
    this.sampleCb({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  };
  private readonly onDown = (e: PointerEvent) => {
    if (!e.isTrusted || e.button !== 0 || e.pointerType === 'touch') return;
    this.intentCb({ kind: 'activate', native: e });
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.isTrusted && e.key === 'Escape') this.intentCb({ kind: 'cancel' });
  };
  private readonly onOut = (e: MouseEvent) => {
    if (e.isTrusted && !e.relatedTarget) this.leaveCb();
  };

  start() {
    // Capture phase on window so we see events before most page handlers.
    window.addEventListener('pointermove', this.onMove, { capture: true, passive: true });
    window.addEventListener('pointerdown', this.onDown, { capture: true });
    window.addEventListener('keydown', this.onKey, { capture: true });
    document.addEventListener('mouseout', this.onOut, { capture: true, passive: true });
  }

  stop() {
    window.removeEventListener('pointermove', this.onMove, { capture: true });
    window.removeEventListener('pointerdown', this.onDown, { capture: true });
    window.removeEventListener('keydown', this.onKey, { capture: true });
    document.removeEventListener('mouseout', this.onOut, { capture: true });
  }

  onSample(cb: (s: PointerSample) => void) {
    this.sampleCb = cb;
  }
  onIntent(cb: (e: IntentEvent) => void) {
    this.intentCb = cb;
  }
  /** The pointer left the document (e.g. into an iframe or off the window). */
  onLeave(cb: () => void) {
    this.leaveCb = cb;
  }
}
