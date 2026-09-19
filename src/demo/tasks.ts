// Realistic tasks: (a) a 5-field form, (b) a two-level hover menu, (c) a modal with a
// small close button. Each is timed from its Start button to completion.
import type { Condition, TaskResult } from './session';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface TaskOptions {
  condition: () => Condition;
  tremorPx: () => number;
  onResult: (r: TaskResult) => void;
  marker: (kind: string, data?: Record<string, string | number | boolean | null>) => void;
}

type TaskName = TaskResult['task'];

export class Tasks {
  private active: TaskName | null = null;
  private t0 = 0;
  private errors = 0;
  private details: Record<string, string | number | boolean> = {};
  private readonly status = $('task-status');

  constructor(private readonly o: TaskOptions) {
    document.querySelectorAll<HTMLButtonElement>('.task-start').forEach((b) =>
      b.addEventListener('click', () => this.start(b.dataset.task as TaskName)),
    );
    this.setupForm();
    this.setupMenu();
    this.setupModal();
  }

  private start(task: TaskName) {
    if (this.active) this.finish(false);
    this.active = task;
    this.t0 = performance.now();
    this.errors = 0;
    this.details = {};
    this.o.marker('taskStart', { task, condition: this.o.condition() });
    const names = { form: 'Form task', hoverMenu: 'Menu task', modal: 'Pop-up task' };
    this.status.textContent = `${names[task]} started.`;
    if (task === 'form') {
      const form = $<HTMLFormElement>('task-form');
      form.reset();
      $('form-error').textContent = '';
      form.hidden = false;
    } else if (task === 'hoverMenu') {
      $('task-menu').hidden = false;
      this.details.menuClosedEarly = 0;
    } else {
      $('modal-backdrop').hidden = false;
      $('modal-close').focus();
    }
  }

  private finish(completed: boolean) {
    const task = this.active;
    if (!task) return;
    this.active = null;
    const durationMs = Math.round(performance.now() - this.t0);
    const result: TaskResult = {
      task,
      condition: this.o.condition(),
      durationMs,
      errors: this.errors,
      completed,
      details: this.details,
      tremorPx: this.o.tremorPx(),
      t: new Date().toISOString(),
    };
    this.o.onResult(result);
    this.o.marker('taskEnd', { task, completed, durationMs, errors: this.errors });
    this.status.textContent = completed
      ? `Done in ${(durationMs / 1000).toFixed(1)} seconds with ${this.errors} error${this.errors === 1 ? '' : 's'}.`
      : 'Task abandoned.';
    $('task-form').hidden = true;
    $('task-menu').hidden = true;
    $('modal-backdrop').hidden = true;
  }

  // (a) Form -------------------------------------------------------------------
  private setupForm() {
    const form = $<HTMLFormElement>('task-form');
    form.addEventListener('focusin', () => {
      if (this.active === 'form') this.details.fieldFocuses = Number(this.details.fieldFocuses ?? 0) + 1;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.active !== 'form') return;
      const v = (id: string) => ($<HTMLInputElement>(id).value ?? '').trim();
      const problems: [string, string][] = [];
      if (v('f-name').length < 2) problems.push(['f-name', 'full name']);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('f-email'))) problems.push(['f-email', 'a valid email']);
      if (v('f-phone').replace(/\D/g, '').length < 7) problems.push(['f-phone', 'a phone number (at least 7 digits)']);
      if (!v('f-city')) problems.push(['f-city', 'a city']);
      if (v('f-message').length < 2) problems.push(['f-message', 'a message']);
      for (const id of ['f-name', 'f-email', 'f-phone', 'f-city', 'f-message']) {
        $(id).setAttribute('aria-invalid', String(problems.some(([p]) => p === id)));
      }
      if (problems.length) {
        this.errors++;
        $('form-error').textContent = `Please enter ${problems.map(([, label]) => label).join(', ')}.`;
        $(problems[0]![0]).focus();
        return;
      }
      this.finish(true);
    });
  }

  // (b) Two-level hover menu (strict: closes the instant the pointer leaves) --------
  private setupMenu() {
    const items = document.querySelectorAll<HTMLLIElement>('#task-menu [data-menu]');
    const setOpen = (li: HTMLLIElement, open: boolean) => {
      const btn = li.querySelector<HTMLButtonElement>(':scope > button')!;
      const sub = li.querySelector<HTMLUListElement>(':scope > ul')!;
      if (!open && !sub.hidden && this.active === 'hoverMenu') {
        this.details.menuClosedEarly = Number(this.details.menuClosedEarly ?? 0) + 1;
      }
      sub.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (!open) li.querySelectorAll<HTMLLIElement>('[data-menu]').forEach((c) => setOpen(c, false));
    };
    items.forEach((li) => {
      li.addEventListener('mouseenter', () => setOpen(li, true));
      li.addEventListener('mouseleave', () => setOpen(li, false));
      const btn = li.querySelector<HTMLButtonElement>(':scope > button')!;
      // Click / Enter / Space open the submenu, so it also works without hover. (Opening
      // rather than toggling: a mouse user's hover has usually opened it already.)
      btn.addEventListener('click', (e) => {
        setOpen(li, true);
        const keyboard = e.detail === 0;
        if (keyboard) li.querySelector<HTMLElement>(':scope > ul button, :scope > ul a')?.focus({ preventScroll: true });
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          setOpen(li, false);
          btn.focus();
          e.stopPropagation();
        }
      });
    });
    document.querySelectorAll<HTMLAnchorElement>('#task-menu [data-leaf]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.active !== 'hoverMenu') return;
        if (a.dataset.leaf === 'Headphones') {
          items.forEach((li) => setOpen(li, false));
          this.finish(true);
        } else {
          this.errors++;
          this.status.textContent = `That was "${a.dataset.leaf}". Try again: Shop › Electronics › Headphones.`;
        }
      }),
    );
  }

  // (c) Modal ------------------------------------------------------------------------
  private setupModal() {
    const backdrop = $('modal-backdrop');
    $('modal-close').addEventListener('click', () => {
      if (this.active !== 'modal') return;
      this.details.method = 'close-button';
      this.finish(true);
    });
    $('modal-cta').addEventListener('click', () => {
      if (this.active === 'modal') this.errors++;
    });
    backdrop.addEventListener('click', (e) => {
      if (this.active === 'modal' && e.target === backdrop) this.errors++; // missed the ×
    });
    backdrop.addEventListener('keydown', (e) => {
      if (this.active !== 'modal') return;
      if (e.key === 'Escape') {
        this.details.method = 'escape';
        this.finish(true);
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const f = [$('modal-close'), $('modal-cta')];
        const i = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length]!.focus();
      }
    });
  }
}
