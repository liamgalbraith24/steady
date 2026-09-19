// Demo page entry point.
import { TraceCanvas } from '../shared/traceCanvas';
import { defaultProfiles, type FilterConfig } from '../shared/settings';
import { PageTremor } from './pageTremor';
import { SteadyClient } from './steadyClient';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const steady = new SteadyClient();
export const pageTremor = new PageTremor();

// --- Steady status --------------------------------------------------------------

function renderStatus() {
  const s = steady.state;
  const el = $('steady-status');
  if (!s) el.textContent = 'Steady extension not detected: tasks run without it (baseline).';
  else if (!s.running) el.textContent = `Steady is installed but paused on this page${s.suspendedBy === 'page' ? ' (baseline condition)' : ''}.`;
  else el.textContent = `Steady is on, using "${s.profiles.find((p) => p.id === s.profileId)?.name ?? 'unknown'}".`;
}

// --- Calibration ----------------------------------------------------------------

const tremorInput = $<HTMLInputElement>('cal-tremor');
const profileSelect = $<HTMLSelectElement>('cal-profile');

/** The trace uses the filter of the profile Steady is using (or the "strong" default). */
function traceFilter(): FilterConfig {
  const s = steady.state;
  return s?.profiles.find((p) => p.id === s.profileId)?.filter ?? defaultProfiles()[1]!.filter;
}

const trace = new TraceCanvas($<HTMLCanvasElement>('cal-trace'), {
  getFilter: traceFilter,
  getTremorAmplitude: () => Number(tremorInput.value),
  onSummary: (t) => ($('cal-trace-caption').textContent = t),
});
$('cal-play').addEventListener('click', () => void trace.play());

export function applyTremor() {
  const px = Number(tremorInput.value);
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
  const current = s.profileId ?? '';
  profileSelect.replaceChildren(
    ...s.profiles.map((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      return o;
    }),
  );
  profileSelect.value = current;
}
profileSelect.addEventListener('change', () => steady.setProfile(profileSelect.value));

let wasRunning: boolean | null = null;
steady.onChange(() => {
  renderStatus();
  renderProfiles();
  trace.refresh();
  if (wasRunning !== steady.running) {
    wasRunning = steady.running;
    applyTremor(); // hand the simulation over between page and Steady
  }
});
void steady.ready().then(renderStatus);
