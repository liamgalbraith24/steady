// Options page: plain TypeScript, no framework. Controls declare what they edit with
// `data-path` (a path into the profile being edited) or `data-global` (a path into
// Settings); this file binds them generically and autosaves.
import {
  activeProfile,
  defaultSettings,
  exportSettings,
  importSettings,
  toOrigin,
  type Profile,
  type Settings,
} from '../shared/settings';
import { loadSettings, onSettingsChanged, saveSettings, SettingsSaveError } from '../shared/storage';
import { TraceCanvas } from '../shared/traceCanvas';
import { MAX_PROFILES, addDuplicate, getPath, removeProfile, setPath, updateProfile } from './profiles';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings = defaultSettings();
let editingId = settings.activeProfileId;
let lastSavedJson = '';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const status = $('save-status');

function editing(): Profile {
  return settings.profiles.find((p) => p.id === editingId) ?? activeProfile(settings);
}

// ---------------------------------------------------------------------------
// Saving

function scheduleSave() {
  clearTimeout(saveTimer);
  status.textContent = 'Saving…';
  saveTimer = setTimeout(save, 250);
}

async function save() {
  try {
    await saveSettings(settings);
    lastSavedJson = JSON.stringify(settings);
    status.textContent = `All changes saved (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`;
    status.classList.remove('error');
  } catch (e) {
    status.textContent = e instanceof SettingsSaveError ? e.message : 'Could not save settings.';
    status.classList.add('error');
  }
}

function commit(next: Settings) {
  settings = next;
  render();
  scheduleSave();
}

// ---------------------------------------------------------------------------
// Rendering

const formatNumber = (v: number) => (Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(4) : String(Math.round(v * 100) / 100));

function sliderToValue(input: HTMLInputElement): number {
  const v = Number(input.value);
  return input.hasAttribute('data-invert') ? Number(input.min) + Number(input.max) - v : v;
}

function valueToSlider(input: HTMLInputElement, v: number): string {
  return String(input.hasAttribute('data-invert') ? Number(input.min) + Number(input.max) - v : v);
}

function renderControl(el: HTMLInputElement | HTMLSelectElement, value: unknown) {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
  else if (el instanceof HTMLInputElement && el.type === 'range') {
    if (typeof value === 'number') el.value = valueToSlider(el, value);
    const out = document.querySelector<HTMLOutputElement>(`output[for="${el.id}"]`);
    if (out) out.textContent = `${formatNumber(sliderToValue(el))}${out.dataset.unit ?? ''}`;
    el.setAttribute('aria-valuetext', `${formatNumber(sliderToValue(el))}${out?.dataset.unit ?? ''}`);
  } else if (document.activeElement !== el) el.value = value === undefined ? '' : String(value);
}

function keyName(code: string | undefined): string {
  if (!code) return 'None';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function renderSiteList(listId: string, origins: string[], remove: (o: string) => void, emptyText: string) {
  const list = $(listId);
  list.replaceChildren();
  if (!origins.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = emptyText;
    list.append(li);
    return;
  }
  for (const origin of origins) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = origin;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.textContent = 'Remove';
    btn.setAttribute('aria-label', `Remove ${origin}`);
    btn.addEventListener('click', () => remove(origin));
    li.append(span, btn);
    list.append(li);
  }
}

function render() {
  const p = editing();
  editingId = p.id;

  const select = $<HTMLSelectElement>('profile-select');
  select.replaceChildren(
    ...settings.profiles.map((pr) => {
      const o = document.createElement('option');
      o.value = pr.id;
      o.textContent = pr.id === settings.activeProfileId ? `${pr.name} (in use)` : pr.name;
      return o;
    }),
  );
  select.value = p.id;
  const isActive = p.id === settings.activeProfileId;
  $('active-note').textContent = isActive
    ? `"${p.name}" is the profile Steady is using now.`
    : `Steady is using "${activeProfile(settings).name}". Changes here apply when you switch to "${p.name}".`;
  $<HTMLButtonElement>('make-active').disabled = isActive;
  $<HTMLButtonElement>('delete').disabled = settings.profiles.length <= 1;
  $<HTMLButtonElement>('duplicate').disabled = settings.profiles.length >= MAX_PROFILES;
  const nameInput = $<HTMLInputElement>('profile-name');
  if (document.activeElement !== nameInput) nameInput.value = p.name;

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path]').forEach((el) => {
    renderControl(el, getPath(p, el.dataset.path!));
  });
  document.querySelectorAll<HTMLInputElement>('[data-global]').forEach((el) => {
    renderControl(el, getPath(settings, el.dataset.global!));
  });
  document.querySelectorAll<HTMLElement>('[data-show-when]').forEach((el) => {
    const [path, want] = el.dataset.showWhen!.split('=');
    el.hidden = String(getPath(p, path!)) !== want;
  });
  $('sw-key-value').textContent = keyName(p.input.switch?.key);
  $('sw-select-value').textContent = keyName(p.input.switch?.selectKey);
  $<HTMLButtonElement>('sw-select-clear').disabled = !p.input.switch?.selectKey;

  renderSiteList(
    'disabled-list',
    settings.disabledOrigins,
    (o) => commit({ ...settings, disabledOrigins: settings.disabledOrigins.filter((x) => x !== o) }),
    'None. Turn Steady off for a site from the Steady toolbar button.',
  );
  renderSiteList(
    'dbl-list',
    settings.doubleClickOrigins,
    (o) => commit({ ...settings, doubleClickOrigins: settings.doubleClickOrigins.filter((x) => x !== o) }),
    'None.',
  );
  trace?.refresh();
}

// ---------------------------------------------------------------------------
// Control bindings

function readControl(el: HTMLInputElement | HTMLSelectElement): unknown {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
  if (el instanceof HTMLInputElement && el.type === 'range') return sliderToValue(el);
  if (el instanceof HTMLInputElement && el.type === 'text') return el.value.trim() || undefined;
  return el.value;
}

document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-path]').forEach((el) => {
  el.addEventListener(el instanceof HTMLInputElement && el.type === 'range' ? 'input' : 'change', () => {
    const path = el.dataset.path!;
    commit(updateProfile(settings, editingId, (p) => setPath(p, path, readControl(el))));
  });
});

document.querySelectorAll<HTMLInputElement>('[data-global]').forEach((el) => {
  el.addEventListener(el.type === 'text' ? 'input' : 'change', () => {
    const next = structuredClone(settings);
    setPath(next, el.dataset.global!, readControl(el));
    commit(next);
  });
});

$<HTMLSelectElement>('profile-select').addEventListener('change', (e) => {
  editingId = (e.target as HTMLSelectElement).value;
  hideConfirm('delete-confirm');
  render();
});

$('make-active').addEventListener('click', () => {
  commit({ ...settings, activeProfileId: editingId });
  status.textContent = `Now using "${editing().name}".`;
});

$('duplicate').addEventListener('click', () => {
  const r = addDuplicate(settings, editingId);
  if (!r) return;
  editingId = r.newId;
  commit(r.settings);
  $('profile-name').focus();
});

$<HTMLInputElement>('profile-name').addEventListener('input', (e) => {
  const name = (e.target as HTMLInputElement).value.trim();
  if (!name) return; // keep the old name until something is typed
  commit(updateProfile(settings, editingId, (p) => (p.name = name.slice(0, 60))));
});

// Inline confirmations (no dialogs, nothing times out).
function showConfirm(id: string, focusId: string) {
  $(id).hidden = false;
  $(focusId).focus();
}
function hideConfirm(id: string, returnFocusId?: string) {
  $(id).hidden = true;
  if (returnFocusId) $(returnFocusId).focus();
}

$('delete').addEventListener('click', () => {
  $('delete-question').textContent = `Delete the profile "${editing().name}"? This cannot be undone.`;
  showConfirm('delete-confirm', 'delete-no');
});
$('delete-no').addEventListener('click', () => hideConfirm('delete-confirm', 'delete'));
$('delete-yes').addEventListener('click', () => {
  const name = editing().name;
  const next = removeProfile(settings, editingId);
  hideConfirm('delete-confirm');
  if (!next) return;
  editingId = next.activeProfileId;
  commit(next);
  status.textContent = `Deleted "${name}".`;
  $('profile-select').focus();
});

// Switch key capture: the next key pressed becomes the switch.
document.querySelectorAll<HTMLButtonElement>('[data-capture-key]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const path = btn.dataset.captureKey!;
    const msg = $('key-capture-status');
    msg.textContent = 'Press the key or switch you want to use. Press Escape to cancel.';
    btn.textContent = 'Waiting for a key…';
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', onKey, true);
      btn.textContent = 'Change…';
      if (e.code === 'Escape' || e.code === 'Tab') {
        msg.textContent = e.code === 'Tab' ? 'Tab cannot be a switch key; it is needed to move around.' : 'Cancelled.';
        return;
      }
      commit(updateProfile(settings, editingId, (p) => setPath(p, path, e.code)));
      msg.textContent = `Switch key set to ${keyName(e.code)}.`;
    };
    window.addEventListener('keydown', onKey, true);
  });
});
$('sw-select-clear').addEventListener('click', () => {
  commit(updateProfile(settings, editingId, (p) => setPath(p, 'input.switch.selectKey', undefined)));
  $('key-capture-status').textContent = 'Using one switch: short press moves on, long press selects.';
});

// Per-site double click list.
$<HTMLFormElement>('dbl-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('dbl-input');
  const raw = input.value.trim();
  const origin = toOrigin(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`);
  if (!origin) {
    $('dbl-error').textContent = 'Enter a web address, for example https://example.com.';
    return;
  }
  $('dbl-error').textContent = '';
  input.value = '';
  if (!settings.doubleClickOrigins.includes(origin)) {
    commit({ ...settings, doubleClickOrigins: [...settings.doubleClickOrigins, origin] });
  }
});

// ---------------------------------------------------------------------------
// Import / export / reset

$('export').addEventListener('click', () => {
  const blob = new Blob([exportSettings(settings)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `steady-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  status.textContent = 'Settings file downloaded.';
});

let pendingImport: Settings | null = null;
const fileInput = $<HTMLInputElement>('import-file');
$('import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const err = $('import-error');
  if (file.size > 256 * 1024) {
    err.textContent = 'That file is too large to be a Steady settings file. Your settings were not changed.';
    return;
  }
  const r = importSettings(await file.text());
  if (!r.ok) {
    err.textContent = `Could not import "${file.name}": ${r.error} Your settings were not changed.`;
    return;
  }
  err.textContent = '';
  pendingImport = r.settings;
  $('import-question').textContent = `"${file.name}" contains ${r.settings.profiles.length} profile(s): ${r.settings.profiles
    .map((p) => p.name)
    .join(', ')}. Replace your current settings with it?`;
  showConfirm('import-confirm', 'import-no');
});
$('import-no').addEventListener('click', () => {
  pendingImport = null;
  hideConfirm('import-confirm', 'import');
});
$('import-yes').addEventListener('click', () => {
  if (!pendingImport) return;
  editingId = pendingImport.activeProfileId;
  commit(pendingImport);
  pendingImport = null;
  hideConfirm('import-confirm', 'import');
  status.textContent = 'Settings imported.';
});

$('reset').addEventListener('click', () => showConfirm('reset-confirm', 'reset-no'));
$('reset-no').addEventListener('click', () => hideConfirm('reset-confirm', 'reset'));
$('reset-yes').addEventListener('click', () => {
  const d = defaultSettings();
  editingId = d.activeProfileId;
  commit(d);
  hideConfirm('reset-confirm', 'reset');
  status.textContent = 'Settings reset to defaults.';
});

// ---------------------------------------------------------------------------
// Trace canvas

const ampInput = $<HTMLInputElement>('trace-amp');
const tremorBox = $<HTMLInputElement>('trace-tremor');
const trace: TraceCanvas | null = new TraceCanvas($<HTMLCanvasElement>('trace'), {
  getFilter: () => editing().filter,
  getTremorAmplitude: () => (tremorBox.checked ? Number(ampInput.value) : 0),
  onSummary: (text) => ($('trace-desc').textContent = text),
});
const renderAmp = () => {
  document.querySelector('output[for="trace-amp"]')!.textContent = `${ampInput.value} px`;
  ampInput.setAttribute('aria-valuetext', `${ampInput.value} pixels`);
};
ampInput.addEventListener('input', renderAmp);
renderAmp();
$('trace-play').addEventListener('click', () => void trace.play());

// ---------------------------------------------------------------------------
// Boot

void loadSettings().then((s) => {
  settings = s;
  lastSavedJson = JSON.stringify(s);
  editingId = s.activeProfileId;
  status.textContent = 'Changes are saved automatically.';
  render();
});

// Changes made elsewhere (popup, another options tab) show up here too.
onSettingsChanged((s) => {
  const json = JSON.stringify(s);
  if (json === lastSavedJson || json === JSON.stringify(settings)) return;
  lastSavedJson = json;
  settings = s;
  render();
});
