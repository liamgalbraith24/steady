// Popup: quick profile switch, per-site toggle, panic toggle, study-log export.
import { sendToBackground, sendToTab, type LogExportReply, type MessageOf, type PingReply } from '../shared/messages';
import { toOrigin, type Settings } from '../shared/settings';
import { loadSettings, saveSettings } from '../shared/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let tab: chrome.tabs.Tab | undefined;
let origin: string | null = null;
let panicked = false;

const REASONS: Record<NonNullable<PingReply['suspendedBy']>, string> = {
  panic: 'Steady is off in this tab.',
  site: 'Steady is off on this site.',
  global: 'Steady is turned off everywhere (see All settings).',
  page: 'This page has paused Steady (for example the demo baseline condition).',
  error: 'Steady hit a problem on this page and turned itself off. Reload the page to try again.',
};

async function refreshTabStatus() {
  const statusEl = $('tab-status');
  const panicBtn = $<HTMLButtonElement>('panic');
  panicBtn.textContent = panicked ? 'Turn Steady back on in this tab' : 'Turn Steady off in this tab';
  panicBtn.className = panicked ? 'wide' : 'danger wide';
  panicBtn.disabled = tab?.id === undefined || !origin;
  if (!origin) {
    statusEl.textContent = 'Steady cannot run on this kind of page (for example browser settings pages).';
    return;
  }
  const ping = tab?.id === undefined ? undefined : await sendToTab<PingReply>(tab.id, { type: 'PING' }, 0);
  if (!ping) {
    statusEl.textContent = 'Steady is not running in this tab yet. Reload the page to start it.';
    return;
  }
  statusEl.textContent = ping.suspendedBy ? REASONS[ping.suspendedBy] : `Steady is on, using "${ping.profileName}".`;
}

function render() {
  const select = $<HTMLSelectElement>('profile');
  select.replaceChildren(
    ...settings.profiles.map((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      return o;
    }),
  );
  select.value = settings.activeProfileId;
  const siteBox = $<HTMLInputElement>('site-enabled');
  $('site-row').hidden = !origin;
  if (origin) {
    $('site-label').textContent = `Use Steady on ${origin.replace(/^https?:\/\//, '')}`;
    siteBox.checked = !settings.disabledOrigins.includes(origin);
  }
  $('study').hidden = !settings.studyLogging.enabled;
}

async function update(next: Settings) {
  settings = next;
  render();
  try {
    await saveSettings(next);
  } catch (e) {
    $('tab-status').textContent = e instanceof Error ? e.message : 'Could not save.';
  }
  setTimeout(refreshTabStatus, 150);
}

async function refreshStudy() {
  if (!settings.studyLogging.enabled) return;
  const log = await sendToBackground<LogExportReply>({ type: 'LOG_EXPORT' });
  $('study-summary').textContent = `Participant ${log?.participantId ?? '(no ID set)'}: ${
    log?.events.length ?? 0
  } events recorded on this computer.`;
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  origin = toOrigin(tab?.url);
  settings = await loadSettings();
  if (tab?.id !== undefined) {
    const st = await sendToBackground<MessageOf<'TAB_STATE'>>({ type: 'GET_TAB_STATE', tabId: tab.id });
    panicked = st?.panicked ?? false;
  }
  render();
  await refreshTabStatus();
  await refreshStudy();
}

$<HTMLSelectElement>('profile').addEventListener('change', (e) => {
  void update({ ...settings, activeProfileId: (e.target as HTMLSelectElement).value });
});

$<HTMLInputElement>('site-enabled').addEventListener('change', (e) => {
  if (!origin) return;
  const on = (e.target as HTMLInputElement).checked;
  const others = settings.disabledOrigins.filter((o) => o !== origin);
  void update({ ...settings, disabledOrigins: on ? others : [...others, origin] });
});

$('panic').addEventListener('click', async () => {
  if (tab?.id === undefined) return;
  const st = await sendToBackground<MessageOf<'TAB_STATE'>>({ type: 'PANIC_TOGGLE', tabId: tab.id });
  panicked = st?.panicked ?? !panicked;
  await refreshTabStatus();
});

$('open-options').addEventListener('click', () => void chrome.runtime.openOptionsPage());

$('log-export').addEventListener('click', async () => {
  const log = await sendToBackground<LogExportReply>({ type: 'LOG_EXPORT' });
  if (!log) return;
  const payload = { format: 'steady-study-log', exportedAt: new Date().toISOString(), ...log };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = `steady-log-${log.participantId ?? 'unknown'}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});
$('log-clear').addEventListener('click', () => {
  $('clear-confirm').hidden = false;
  $('clear-no').focus();
});
$('clear-no').addEventListener('click', () => {
  $('clear-confirm').hidden = true;
  $('log-clear').focus();
});
$('clear-yes').addEventListener('click', async () => {
  await sendToBackground({ type: 'LOG_CLEAR' });
  $('clear-confirm').hidden = true;
  $('log-clear').focus();
  await refreshStudy();
});

void init();
