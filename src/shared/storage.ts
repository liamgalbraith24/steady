// chrome.storage.sync wrapper for settings. The whole Settings object lives under one
// key: a profile is ~700 bytes of JSON, so the 8 KB per-item sync quota allows ~10 profiles.
import { migrate, type Settings, SettingsSchema } from './settings';

export const SETTINGS_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const got = await chrome.storage.sync.get(SETTINGS_KEY);
    return migrate(got[SETTINGS_KEY]);
  } catch {
    return migrate(undefined);
  }
}

export class SettingsSaveError extends Error {}

export async function saveSettings(s: Settings): Promise<void> {
  const r = SettingsSchema.safeParse(s);
  if (!r.success) throw new SettingsSaveError('Settings are invalid and were not saved.');
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: r.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/QUOTA/i.test(msg)) {
      throw new SettingsSaveError('There is not enough sync storage for this many profiles. Delete a profile and try again.');
    }
    throw new SettingsSaveError(`Could not save settings: ${msg}`);
  }
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && SETTINGS_KEY in changes) cb(migrate(changes[SETTINGS_KEY]!.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
