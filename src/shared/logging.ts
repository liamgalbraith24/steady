// Opt-in study logger. Off by default; when off, `log()` is a no-op and nothing is
// buffered. When on, events are batched and handed to `sink` (the content script
// sends them to the background, which stores them in chrome.storage.local).
// Nothing is ever sent over the network.
import type { LogEvent } from './messages';

type LogData = Record<string, string | number | boolean | null>;

const FLUSH_MS = 1000;
const RATE_WINDOW_MS = 5000;
const MAX_BUFFER = 500;

export class StudyLogger {
  private enabled = false;
  private buffer: LogEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private samples = 0;
  private windowStart = 0;

  constructor(
    private readonly sink: (events: LogEvent[]) => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.buffer = [];
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  log(kind: string, data?: LogData) {
    if (!this.enabled) return;
    const ev: LogEvent = { t: this.now(), kind, ...(data ? { data } : {}) };
    this.buffer.push(ev);
    if (this.buffer.length >= MAX_BUFFER) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  /** Count one input sample; emits a `sampleRate` event every 5 s of activity. */
  sample(source: string) {
    if (!this.enabled) return;
    const t = this.now();
    if (!this.windowStart) this.windowStart = t;
    this.samples++;
    const elapsed = t - this.windowStart;
    if (elapsed >= RATE_WINDOW_MS) {
      this.log('sampleRate', { hz: Math.round((this.samples * 1000) / elapsed), source });
      this.samples = 0;
      this.windowStart = t;
    }
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.buffer.length) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      this.sink(batch);
    } catch {}
  }
}
