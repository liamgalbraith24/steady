// Demo and study page entry point.
import { TraceCanvas } from '../shared/traceCanvas';
import { defaultProfiles, type FilterConfig } from '../shared/settings';
import { FittsRunner } from './fitts';
import { conditionThroughput, summarizeAll } from './fittsMath';
import { PageTremor } from './pageTremor';
import { conditionLabel, setupQuestionnaires } from './questionnaires';
import { downloadJson, loadSession, newSession, saveSession, seededRandom, type Condition } from './session';
import { SteadyClient } from './steadyClient';
import { Tasks } from './tasks';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const steady = new SteadyClient();
const pageTremor = new PageTremor();
let session = loadSession();
let condition: Condition = 'baseline';

const tremorInput = $<HTMLInputElement>('cal-tremor');
const tremorPx = () => Number(tremorInput.value);

// --- Steady status and condition -------------------------------------------------

function renderStatus() {
  const s = steady.state;
  const el = $('steady-status');
  if (!s) el.textContent = 'Steady extension not detected: tasks run without it (baseline).';
  else if (!s.running) el.textContent = `Steady is installed but paused on this page${s.suspendedBy === 'page' ? ' (baseline condition)' : ''}.`;
  else el.textContent = `Steady is on, using "${s.profiles.find((p) => p.id === s.profileId)?.name ?? 'unknown'}".`;
  const steadyRadio = $<HTMLInputElement>('cond-steady');
  steadyRadio.disabled = !s;
  if (!s && condition === 'steady') setCondition('baseline');
}

function setCondition(c: Condition) {
  condition = c;
  $<HTMLInputElement>(c === 'steady' ? 'cond-steady' : 'cond-baseline').checked = true;
  steady.setSuspended(c === 'baseline');
  steady.marker('condition', { condition: c });
}

document.querySelectorAll<HTMLInputElement>('input[name="condition"]').forEach((r) =>
  r.addEventListener('change', () => r.checked && setCondition(r.value as Condition)),
);

// --- Calibration ----------------------------------------------------------------

const profileSelect = $<HTMLSelectElement>('cal-profile');

/** The trace uses the filter of the profile Steady is using (or the "strong" default). */
function traceFilter(): FilterConfig {
  const s = steady.state;
  return s?.profiles.find((p) => p.id === s.profileId)?.filter ?? defaultProfiles()[1]!.filter;
}

const trace = new TraceCanvas($<HTMLCanvasElement>('cal-trace'), {
  getFilter: traceFilter,
  getTremorAmplitude: tremorPx,
  onSummary: (t) => ($('cal-trace-caption').textContent = t),
});
$('cal-play').addEventListener('click', () => void trace.play());

function applyTremor() {
  const px = tremorPx();
  $('cal-tremor-out').textContent = `${px} px`;
  tremorInput.setAttribute('aria-valuetext', `${px} pixels`);
  // Steady running → Steady simulates (so its filter sees the shake). Otherwise the page does.
  if (steady.running) {
    steady.setSimTremor(px);
    pageTremor.set(0);
  } else {
    steady.setSimTremor(0);
    pageTremor.set(px);
  }
}
tremorInput.addEventListener('input', applyTremor);

function renderProfiles() {
  const s = steady.state;
  if (!s || !s.profiles.length) {
    profileSelect.disabled = true;
    return;
  }
  profileSelect.disabled = false;
  profileSelect.replaceChildren(
    ...s.profiles.map((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      return o;
    }),
  );
  profileSelect.value = s.profileId ?? '';
}
profileSelect.addEventListener('change', () => steady.setProfile(profileSelect.value));

let wasRunning: boolean | null = null;
steady.onChange(() => {
  renderStatus();
  renderProfiles();
  trace.refresh();
  if (steady.state?.profileId && session.steadyProfile !== steady.state.profileId) {
    session.steadyProfile = steady.state.profileId;
    saveSession(session);
  }
  if (wasRunning !== steady.running) {
    wasRunning = steady.running;
    applyTremor(); // hand the simulation over between page and Steady
  }
});

// --- Session ----------------------------------------------------------------------

const participant = $<HTMLInputElement>('participant');
const order = $<HTMLSelectElement>('order');
const notes = $<HTMLTextAreaElement>('notes');

function renderSession() {
  participant.value = session.participantId;
  order.value = session.conditionOrder.join(',');
  notes.value = session.notes;
  $('session-summary').textContent =
    `Stored in this browser: ${session.fitts.length} pointing trials, ${session.tasks.length} task results, ` +
    `${session.questionnaires.length} questionnaires.`;
}
function update(mutate: () => void) {
  mutate();
  saveSession(session);
  renderSession();
  renderResults();
}
participant.addEventListener('input', () => update(() => (session.participantId = participant.value.trim().slice(0, 64))));
order.addEventListener('change', () => {
  update(() => (session.conditionOrder = order.value.split(',') as [Condition, Condition]));
  if (steady.present) setCondition(session.conditionOrder[0]);
});
notes.addEventListener('input', () => {
  session.notes = notes.value;
  saveSession(session);
});

// --- Pointing task --------------------------------------------------------------------

const fitts = new FittsRunner({
  area: $('fitts-area'),
  status: $('fitts-status'),
  condition: () => condition,
  tremorPx,
  onTrial: (t) => {
    session.fitts.push(t);
    saveSession(session);
    steady.marker('fittsTrial', { block: t.block, trial: t.trial, hit: t.hit, mt: t.movementMs, w: t.widthPx, a: t.amplitudePx });
  },
  onFinish: (completed) => {
    $<HTMLButtonElement>('fitts-start').disabled = false;
    $<HTMLButtonElement>('fitts-stop').disabled = true;
    steady.marker('fittsEnd', { completed });
    renderSession();
    renderResults();
  },
});
$('fitts-start').addEventListener('click', () => {
  $<HTMLButtonElement>('fitts-start').disabled = true;
  $<HTMLButtonElement>('fitts-stop').disabled = false;
  steady.marker('fittsStart', { condition });
  fitts.start(seededRandom(`${session.participantId}|${condition}`));
  $('fitts-area').scrollIntoView({ block: 'nearest' });
});
$('fitts-stop').addEventListener('click', () => fitts.stop(false));

// --- Everyday tasks and questionnaires ---------------------------------------------------

new Tasks({
  condition: () => condition,
  tremorPx,
  onResult: (r) => update(() => session.tasks.push(r)),
  marker: (k, d) => steady.marker(k, d),
});

setupQuestionnaires(
  () => condition,
  (r) => update(() => session.questionnaires.push(r)),
);

// --- Results ------------------------------------------------------------------------------

const fmt = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits));

function table(caption: string, head: string[], rows: (string | number)[][]): HTMLTableElement {
  const t = document.createElement('table');
  const c = t.createCaption();
  c.textContent = caption;
  const thead = t.createTHead().insertRow();
  for (const h of head) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    thead.append(th);
  }
  const body = t.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    r.forEach((v) => (tr.insertCell().textContent = String(v)));
  }
  return t;
}

function computeSummary() {
  const blocks = summarizeAll(session.fitts);
  return {
    fittsBlocks: blocks,
    fittsByCondition: (['steady', 'baseline'] as const).map((c) => ({ condition: c, ...conditionThroughput(blocks, c) })),
  };
}

function renderResults() {
  const body = $('results-body');
  body.replaceChildren();
  const { fittsBlocks, fittsByCondition } = computeSummary();
  const any = session.fitts.length || session.tasks.length || session.questionnaires.length;
  if (!any) {
    const p = document.createElement('p');
    p.textContent = 'No results yet.';
    body.append(p);
    return;
  }
  if (fittsBlocks.length) {
    body.append(
      table(
        'Pointing: by condition',
        ['Condition', 'Rounds', 'Throughput (nominal, bits/s)', 'Throughput (effective, bits/s)', 'Error rate'],
        fittsByCondition
          .filter((c) => c.blocks)
          .map((c) => [conditionLabel(c.condition), c.blocks, fmt(c.tpNominal), fmt(c.tpEffective), `${fmt(c.errorRate * 100, 0)}%`]),
      ),
      table(
        'Pointing: by round',
        ['Condition', 'Width', 'Distance', 'Trials', 'ID (bits)', 'Mean time (ms)', 'Errors', 'TP nominal', 'TP effective'],
        fittsBlocks.map((b) => [
          conditionLabel(b.condition),
          b.widthPx,
          b.amplitudePx,
          b.trials,
          fmt(b.idNominal),
          Math.round(b.meanMtMs),
          `${fmt(b.errorRate * 100, 0)}%`,
          fmt(b.tpNominal),
          fmt(b.tpEffective),
        ]),
      ),
    );
  }
  if (session.tasks.length) {
    body.append(
      table(
        'Everyday tasks',
        ['Task', 'Condition', 'Completed', 'Time (s)', 'Errors'],
        session.tasks.map((t) => [t.task, conditionLabel(t.condition), t.completed ? 'yes' : 'no', fmt(t.durationMs / 1000, 1), t.errors]),
      ),
    );
  }
  if (session.questionnaires.length) {
    body.append(
      table(
        'Questionnaires',
        ['Questionnaire', 'Condition', 'Score'],
        session.questionnaires.map((q) => [q.kind === 'sus' ? 'SUS (0–100, higher is better)' : 'Raw TLX (0–100, lower is better)', conditionLabel(q.condition), fmt(q.score, 1)]),
      ),
    );
  }
}

$('export').addEventListener('click', () => {
  const id = session.participantId || 'anonymous';
  downloadJson(`steady-session-${id}-${new Date().toISOString().slice(0, 10)}.json`, {
    ...session,
    exportedAt: new Date().toISOString(),
    summary: computeSummary(),
  });
});
$('clear').addEventListener('click', () => {
  $('clear-confirm').hidden = false;
  $('clear-no').focus();
});
$('clear-no').addEventListener('click', () => {
  $('clear-confirm').hidden = true;
  $('clear').focus();
});
$('clear-yes').addEventListener('click', () => {
  session = newSession();
  saveSession(session);
  $('clear-confirm').hidden = true;
  renderSession();
  renderResults();
  $('participant').focus();
});

// --- Boot ------------------------------------------------------------------------------------

renderSession();
renderResults();
setCondition('baseline');
void steady.ready().then((s) => {
  renderStatus();
  if (s) setCondition(session.conditionOrder[0]);
});
