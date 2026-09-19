// ISO 9241-9 multidirectional pointing task. Targets are real <button>s so that
// Steady (and any other assistive tech) treats them like any page control.
import { AMPLITUDES, TARGET_COUNT, TRIALS_PER_BLOCK, WIDTHS, isoSequence, projectEndpoint, ringPositions, type Pt } from './fittsMath';
import { shuffle, type Condition, type FittsTrial } from './session';

export interface FittsOptions {
  area: HTMLElement;
  status: HTMLElement;
  condition: () => Condition;
  tremorPx: () => number;
  onTrial: (t: FittsTrial) => void;
  onFinish: (completed: boolean) => void;
}

interface Block {
  widthPx: number;
  amplitudePx: number;
}

export class FittsRunner {
  private blocks: Block[] = [];
  private blockIndex = 0;
  private sequence: number[] = [];
  private k = 0;
  private centres: Pt[] = [];
  private buttons: HTMLButtonElement[] = [];
  private lastTime = 0;
  private lastEnd: Pt | null = null;
  private amplitude = 0;
  private running = false;

  constructor(private readonly o: FittsOptions) {
    o.area.addEventListener('click', (e) => {
      // Clicks that reach the background (not a target) are misses.
      if (this.running && e.target === o.area) this.select(null, e);
    });
  }

  get isRunning() {
    return this.running;
  }

  /** @param rand block-order RNG (seeded per participant and condition, so order is reproducible) */
  start(rand: () => number) {
    this.blocks = shuffle(
      WIDTHS.flatMap((w) => AMPLITUDES.map((a) => ({ widthPx: w, amplitudePx: a }))),
      rand,
    );
    this.blockIndex = 0;
    this.running = true;
    this.showBlock();
  }

  stop(completed = false) {
    this.running = false;
    this.o.area.replaceChildren();
    this.o.status.textContent = completed ? 'Pointing task complete. Thank you!' : 'Pointing task stopped.';
    this.o.onFinish(completed);
  }

  private showBlock() {
    const { widthPx, amplitudePx } = this.blocks[this.blockIndex]!;
    const area = this.o.area;
    const w = area.clientWidth;
    const h = area.clientHeight;
    // Shrink the ring if the area is too small (narrow screens); record the real amplitude.
    const scale = Math.min(1, (Math.min(w, h) - widthPx - 24) / amplitudePx);
    this.amplitude = Math.round(amplitudePx * scale);
    this.centres = ringPositions(TARGET_COUNT, this.amplitude, { x: w / 2, y: h / 2 });
    this.sequence = isoSequence(TARGET_COUNT, TRIALS_PER_BLOCK + 1);
    this.k = 0;
    this.lastEnd = null;
    this.buttons = this.centres.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fitts-target';
      b.style.left = `${c.x}px`;
      b.style.top = `${c.y}px`;
      b.style.width = b.style.height = `${widthPx}px`;
      b.setAttribute('aria-label', `Target ${i + 1}`);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.running) this.select(i, e);
      });
      return b;
    });
    area.replaceChildren(...this.buttons);
    this.highlight(false);
    this.o.status.textContent = `Round ${this.blockIndex + 1} of ${this.blocks.length}: click the red circle to begin.`;
  }

  private highlight(focus: boolean) {
    const current = this.sequence[this.k]!;
    this.buttons.forEach((b, i) => {
      const on = i === current;
      b.classList.toggle('current', on);
      b.tabIndex = on ? 0 : -1;
      b.setAttribute('aria-label', on ? `Target ${i + 1}, highlighted: select this one` : `Target ${i + 1}`);
    });
    if (focus) this.buttons[current]!.focus();
  }

  private select(index: number | null, e: MouseEvent) {
    const now = performance.now();
    const keyboard = e.detail === 0 && e.clientX === 0 && e.clientY === 0;
    const rect = this.o.area.getBoundingClientRect();
    const end = keyboard ? null : { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (this.k === 0) {
      // The first selection only starts the clock.
      if (index !== this.sequence[0]) return;
      this.lastTime = now;
      this.lastEnd = end;
      this.k = 1;
      this.highlight(keyboard);
      this.o.status.textContent = `Round ${this.blockIndex + 1} of ${this.blocks.length}: trial 1 of ${TRIALS_PER_BLOCK}.`;
      return;
    }
    const from = this.sequence[this.k - 1]!;
    const to = this.sequence[this.k]!;
    const proj = end ? projectEndpoint(this.centres[from]!, this.centres[to]!, end, this.lastEnd) : null;
    const { widthPx } = this.blocks[this.blockIndex]!;
    this.o.onTrial({
      condition: this.o.condition(),
      block: this.blockIndex,
      widthPx,
      amplitudePx: this.amplitude,
      trial: this.k,
      from,
      to,
      movementMs: Math.round(now - this.lastTime),
      hit: index === to,
      endX: end ? Math.round(end.x * 10) / 10 : null,
      endY: end ? Math.round(end.y * 10) / 10 : null,
      dx: proj ? Math.round(proj.dx * 10) / 10 : null,
      ae: proj ? Math.round(proj.ae * 10) / 10 : null,
      input: keyboard ? 'keyboard' : 'pointer',
      tremorPx: this.o.tremorPx(),
      t: new Date().toISOString(),
    });
    this.lastTime = now;
    this.lastEnd = end;
    this.k++;
    if (this.k > TRIALS_PER_BLOCK) {
      this.blockIndex++;
      if (this.blockIndex >= this.blocks.length) return this.stop(true);
      this.showBlock();
      if (keyboard) this.buttons[this.sequence[0]!]!.focus();
      return;
    }
    this.highlight(keyboard);
    this.o.status.textContent = `Round ${this.blockIndex + 1} of ${this.blocks.length}: trial ${this.k} of ${TRIALS_PER_BLOCK}.`;
  }
}
