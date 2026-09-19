// Background service worker: settings initialisation and broadcast, per-tab panic
// state, and the opt-in study-log buffer. Holds no state in memory that matters:
// MV3 service workers are killed when idle, so everything lives in chrome.storage.
import { parseMessage, sendToTab, settingsUpdated, type LogEvent, type LogExportReply } from '../shared/messages';
import { SETTINGS_KEY, loadSettings, onSettingsChanged, saveSettings } from '../shared/storage';
import type { Settings } from '../shared/settings';

const PANIC_KEY = 'panicTabs';
const LOG_KEY = 'studyLog';
const MAX_LOG_EVENTS = 50_000;

// --- Settings -------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const raw = (await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
  const settings = await loadSettings();
  // Persist the migrated/default settings so every context sees the same thing.
  if (JSON.stringify(raw) !== JSON.stringify(settings)) await saveSettings(settings);
});

async function broadcast(settings: Settings) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : sendToTab(t.id, settingsUpdated(settings)))));
}

onSettingsChanged((s) => void broadcast(s));

// --- Panic toggle (per tab) -----------------------------------------------

async function panickedTabs(): Promise<Set<number>> {
  const got = await chrome.storage.session.get(PANIC_KEY);
  return new Set((got[PANIC_KEY] as number[] | undefined) ?? []);
}

async function setPanicked(tabId: number, panicked: boolean) {
  const set = await panickedTabs();
  if (panicked) set.add(tabId);
  else set.delete(tabId);
  await chrome.storage.session.set({ [PANIC_KEY]: [...set] });
  await chrome.action.setBadgeText({ tabId, text: panicked ? 'OFF' : '' }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#a4262c' }).catch(() => {});
  await sendToTab(tabId, { type: 'TAB_STATE', panicked });
}

async function togglePanic(tabId: number): Promise<boolean> {
  const next = !(await panickedTabs()).has(tabId);
  await setPanicked(tabId, next);
  return next;
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'panic-toggle') return;
  const id = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (id !== undefined) await togglePanic(id);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const set = await panickedTabs();
  if (set.delete(tabId)) await chrome.storage.session.set({ [PANIC_KEY]: [...set] });
});

// Badge text is reset on navigation; restore it for panicked tabs.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === 'loading' && (await panickedTabs()).has(tabId)) {
    await chrome.action.setBadgeText({ tabId, text: 'OFF' }).catch(() => {});
  }
});

// --- Study log (opt-in, local only) ---------------------------------------

let logQueue: Promise<unknown> = Promise.resolve();

function appendLog(events: LogEvent[]) {
  // Serialise read-modify-write so concurrent tabs cannot lose events.
  logQueue = logQueue.then(async () => {
    const settings = await loadSettings();
    if (!settings.studyLogging.enabled) return;
    const got = await chrome.storage.local.get(LOG_KEY);
    const log = ((got[LOG_KEY] as LogEvent[] | undefined) ?? []).concat(events);
    await chrome.storage.local.set({ [LOG_KEY]: log.slice(-MAX_LOG_EVENTS) });
  }).catch(() => {});
  return logQueue;
}

// --- Messages ---------------------------------------------------------------

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  // Only accept messages from our own extension's contexts.
  if (sender.id !== chrome.runtime.id) return false;
  const msg = parseMessage(raw);
  if (!msg) return false;
  switch (msg.type) {
    case 'PANIC_TOGGLE':
      void togglePanic(msg.tabId).then((panicked) => sendResponse({ type: 'TAB_STATE', panicked }));
      return true;
    case 'GET_TAB_STATE': {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (tabId === undefined) return false;
      void panickedTabs().then((s) => sendResponse({ type: 'TAB_STATE', panicked: s.has(tabId) }));
      return true;
    }
    case 'LOG_EVENT':
      void appendLog(msg.events).then(() => sendResponse(true));
      return true;
    case 'LOG_EXPORT':
      void Promise.all([loadSettings(), chrome.storage.local.get(LOG_KEY)]).then(([s, got]) => {
        const reply: LogExportReply = {
          participantId: s.studyLogging.participantId ?? null,
          events: (got[LOG_KEY] as LogEvent[] | undefined) ?? [],
        };
        sendResponse(reply);
      });
      return true;
    case 'LOG_CLEAR':
      logQueue = logQueue.then(() => chrome.storage.local.remove(LOG_KEY)).then(() => sendResponse(true));
      return true;
    default:
      return false;
  }
});
