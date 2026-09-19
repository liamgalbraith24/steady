/** A pointer position in viewport CSS pixels, with a timestamp in milliseconds. */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

export type IntentEvent =
  /** Explicit click / switch press. `native` is the trusted event that caused it, if any. */
  | { kind: 'activate'; native?: PointerEvent }
  | { kind: 'cancel' }
  | { kind: 'scanNext' }
  | { kind: 'scanPrev' };

export interface InputSource {
  start(): void;
  stop(): void;
  onSample(cb: (s: PointerSample) => void): void;
  onIntent(cb: (e: IntentEvent) => void): void;
}
