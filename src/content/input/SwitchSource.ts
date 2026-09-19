// Switch input for scanning. A "switch" is a key (KeyboardEvent.code, e.g. Space —
// most USB accessibility switches present as a keyboard key) or gamepad button 0/1.
//
//  One switch, manual:  short press = next, long press (≥ longPressMs) = select
//  Two switches, manual: switch 1 = next, switch 2 = select
//  Automatic (either):   Steady moves on every scanIntervalMs; any press = select
import type { SwitchConfig } from '../../shared/settings';
import type { InputSource, IntentEvent, PointerSample } from './InputSource';

export class SwitchSource implements InputSource {
  private intentCb: (e: IntentEvent) => void = () => {};
  private downAt: number | null = null;
  private longTimer: ReturnType<typeof setTimeout> | undefined;
  private longFired = false;
  private autoTimer: ReturnType<typeof setInterval> | undefined;
  private padFrame = 0;
  private padPrev: boolean[] = [];
  private running = false;

  constructor(private cfg: SwitchConfig) {}

  start() {
    this.running = true;
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('keypress', this.swallow, { capture: true });
    window.addEventListener('gamepadconnected', this.onPad);
    if (typeof navigator.getGamepads === 'function' && navigator.getGamepads().some(Boolean)) this.onPad();
    this.restartAuto();
  }

  stop() {
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onKeyUp, { capture: true });
    window.removeEventListener('keypress', this.swallow, { capture: true });
    window.removeEventListener('gamepadconnected', this.onPad);
    clearTimeout(this.longTimer);
    clearInterval(this.autoTimer);
    cancelAnimationFrame(this.padFrame);
  }

  onSample(_cb: (s: PointerSample) => void) {
    // Switch input has no pointer position.
  }

  onIntent(cb: (e: IntentEvent) => void) {
    this.intentCb = cb;
  }

  /** Call after anything that should restart the automatic scan timing (e.g. a selection). */
  restartAuto() {
    clearInterval(this.autoTimer);
    if (this.running && this.cfg.mode === 'auto') {
      this.autoTimer = setInterval(() => this.intentCb({ kind: 'scanNext' }), this.cfg.scanIntervalMs);
    }
  }

  private emit(kind: 'scanNext' | 'activate') {
    this.intentCb({ kind });
    if (kind === 'activate') this.restartAuto();
  }

  private isSwitchKey(e: KeyboardEvent): 'advance' | 'select' | null {
    if (e.code === this.cfg.key) return 'advance';
    if (this.cfg.selectKey && e.code === this.cfg.selectKey) return 'select';
    return null;
  }

  private readonly swallow = (e: KeyboardEvent) => {
    if (e.isTrusted && this.isSwitchKey(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    if (e.key === 'Escape') {
      this.intentCb({ kind: 'cancel' });
      return;
    }
    const which = this.isSwitchKey(e);
    if (!which) return;
    e.preventDefault(); // e.g. Space would scroll the page
    e.stopImmediatePropagation();
    if (e.repeat) return;
    this.press(which);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    const which = this.isSwitchKey(e);
    if (!which) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.release(which);
  };

  private press(which: 'advance' | 'select') {
    if (this.cfg.mode === 'auto' || which === 'select') {
      this.emit('activate');
      return;
    }
    if (this.cfg.selectKey) {
      this.emit('scanNext'); // two-switch manual: switch 1 only moves on
      return;
    }
    // One switch, manual: decide on release, or when the long press is reached.
    this.downAt = performance.now();
    this.longFired = false;
    clearTimeout(this.longTimer);
    this.longTimer = setTimeout(() => {
      this.longFired = true;
      this.emit('activate');
    }, this.cfg.longPressMs);
  }

  private release(which: 'advance' | 'select') {
    if (which !== 'advance' || this.cfg.mode === 'auto' || this.cfg.selectKey) return;
    if (this.downAt === null) return;
    clearTimeout(this.longTimer);
    this.downAt = null;
    if (!this.longFired) this.emit('scanNext');
  }

  // Gamepad: button 0 behaves like the switch key, button 1 like the select key.
  private readonly onPad = () => {
    if (this.padFrame || !this.running) return;
    const poll = () => {
      const pad = navigator.getGamepads().find((p) => p && p.connected);
      if (pad) {
        const now = pad.buttons.slice(0, 2).map((b) => b.pressed);
        now.forEach((pressed, i) => {
          if (pressed === (this.padPrev[i] ?? false)) return;
          const which = i === 0 ? 'advance' : 'select';
          if (pressed) this.press(which);
          else this.release(which);
        });
        this.padPrev = now;
      }
      this.padFrame = this.running ? requestAnimationFrame(poll) : 0;
    };
    this.padFrame = requestAnimationFrame(poll);
  };
}
