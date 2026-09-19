// Pure profile-list operations used by the options page and popup.
import { duplicateProfile, type Profile, type Settings } from '../shared/settings';

export const MAX_PROFILES = 10; // keeps the single settings item under the 8 KB sync quota

export function addDuplicate(s: Settings, id: string): { settings: Settings; newId: string } | null {
  const src = s.profiles.find((p) => p.id === id);
  if (!src || s.profiles.length >= MAX_PROFILES) return null;
  const copy = duplicateProfile(src);
  return { settings: { ...s, profiles: [...s.profiles, copy] }, newId: copy.id };
}

export function removeProfile(s: Settings, id: string): Settings | null {
  if (s.profiles.length <= 1) return null;
  const profiles = s.profiles.filter((p) => p.id !== id);
  const activeProfileId = s.activeProfileId === id ? profiles[0]!.id : s.activeProfileId;
  return { ...s, profiles, activeProfileId };
}

export function updateProfile(s: Settings, id: string, fn: (p: Profile) => void): Settings {
  const profiles = s.profiles.map((p) => {
    if (p.id !== id) return p;
    const copy = structuredClone(p);
    fn(copy);
    return copy;
  });
  return { ...s, profiles };
}

type Obj = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Obj)[k] : undefined), obj);
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj as Obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k] as Obj;
  }
  const last = keys[keys.length - 1]!;
  if (value === undefined) delete o[last];
  else o[last] = value;
}
