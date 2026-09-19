// Study session state for the demo page. Persisted in localStorage (so a reload
// does not lose data) and exported as JSON. Nothing leaves the browser.

export type Condition = 'steady' | 'baseline';

export interface FittsTrial {
  condition: Condition;
  block: number;
  widthPx: number;
  amplitudePx: number;
  trial: number;
  from: number;
  to: number;
  movementMs: number;
  hit: boolean;
  /** Where the selection happened (null for keyboard selections). */
  endX: number | null;
  endY: number | null;
  /** Signed deviation along the task axis from the target centre, px. */
  dx: number | null;
  /** Actual movement distance along the task axis (from the previous endpoint), px. */
  ae: number | null;
  input: 'pointer' | 'keyboard';
  tremorPx: number;
  t: string;
}

export interface TaskResult {
  task: 'form' | 'hoverMenu' | 'modal';
  condition: Condition;
  durationMs: number;
  errors: number;
  completed: boolean;
  details: Record<string, string | number | boolean>;
  tremorPx: number;
  t: string;
}

export interface QuestionnaireResult {
  kind: 'sus' | 'tlx';
  condition: Condition;
  answers: Record<string, number>;
  score: number;
  t: string;
}

export interface Session {
  format: 'steady-demo-session';
  version: 1;
  participantId: string;
  createdAt: string;
  conditionOrder: [Condition, Condition];
  steadyProfile: string | null;
  fitts: FittsTrial[];
  tasks: TaskResult[];
  questionnaires: QuestionnaireResult[];
  notes: string;
}

const KEY = 'steady-demo-session';

export function newSession(participantId = ''): Session {
  return {
    format: 'steady-demo-session',
    version: 1,
    participantId,
    createdAt: new Date().toISOString(),
    conditionOrder: ['steady', 'baseline'],
    steadyProfile: null,
    fitts: [],
    tasks: [],
    questionnaires: [],
    notes: '',
  };
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Session;
      if (s.format === 'steady-demo-session') return s;
    }
  } catch {}
  return newSession();
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function downloadJson(filename: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Deterministic PRNG so condition/block order is reproducible from the participant ID. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
