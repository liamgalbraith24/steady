import { describe, expect, it } from 'vitest';
import {
  SETTINGS_VERSION,
  activeProfile,
  defaultSettings,
  duplicateProfile,
  exportSettings,
  importSettings,
  migrate,
  parseSettings,
  toOrigin,
} from '../../src/shared/settings';

describe('migrate', () => {
  it('returns defaults for an empty store', () => {
    for (const empty of [undefined, null, {}, 'garbage', 42, []]) {
      const s = migrate(empty);
      expect(s).toEqual(defaultSettings());
    }
  });

  it('ships the three default profiles', () => {
    const names = defaultSettings().profiles.map((p) => p.name);
    expect(names).toEqual(['Steady (mild)', 'Steady (strong)', 'Rest mode']);
    const rest = defaultSettings().profiles.find((p) => p.id === 'rest')!;
    expect(rest.dwell.enabled).toBe(true);
    const mild = defaultSettings().profiles.find((p) => p.id === 'mild')!;
    expect(rest.filter.minCutoff).toBeLessThan(mild.filter.minCutoff); // "filter strong"
  });

  it('upgrades version 1 settings', () => {
    const v1 = {
      version: 1,
      enabled: false,
      smoothing: 'strong',
      snapRadius: 55,
      dwellMs: 900,
      disabledSites: ['https://example.com'],
    };
    const s = migrate(v1);
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(s.enabled).toBe(false);
    expect(s.disabledOrigins).toEqual(['https://example.com']);
    const p = activeProfile(s);
    expect(p.name).toBe('My profile');
    expect(p.targetAssist.snapRadiusPx).toBe(55);
    expect(p.dwell).toMatchObject({ enabled: true, dwellMs: 900 });
    expect(p.filter.minCutoff).toBe(0.4); // strong template
    // Defaults are still available alongside the migrated profile.
    expect(s.profiles).toHaveLength(4);
  });

  it('maps v1 "off" smoothing and null dwell', () => {
    const s = migrate({ version: 1, enabled: true, smoothing: 'off', snapRadius: 999, dwellMs: null, disabledSites: [] });
    const p = activeProfile(s);
    expect(p.filter.type).toBe('none');
    expect(p.dwell.enabled).toBe(false);
    expect(p.targetAssist.snapRadiusPx).toBe(200); // clamped
  });

  it('round-trips current settings unchanged', () => {
    const s = defaultSettings();
    s.activeProfileId = 'rest';
    expect(migrate(structuredClone(s))).toEqual(s);
  });

  it('repairs a partially invalid current-version store', () => {
    const s = defaultSettings() as unknown as Record<string, unknown>;
    const profiles = structuredClone(s.profiles) as Record<string, unknown>[];
    delete (profiles[0] as { dwell?: unknown }).dwell; // missing section → filled from defaults
    profiles[1] = { id: 'bad' }; // unrecoverable → repaired from defaults
    const repaired = migrate({ ...s, profiles, activeProfileId: 'nope', disabledOrigins: ['a', 3] });
    expect(repaired.profiles[0]!.dwell.dwellMs).toBe(1000);
    expect(repaired.activeProfileId).toBe(repaired.profiles[0]!.id);
    expect(repaired.disabledOrigins).toEqual(['a']);
  });

  it('removes duplicate profile ids', () => {
    const s = defaultSettings();
    s.profiles.push(structuredClone(s.profiles[0]!));
    expect(migrate(s).profiles).toHaveLength(3);
  });

  it('falls back to defaults for unknown future versions', () => {
    expect(migrate({ version: 99, profiles: [] })).toEqual(defaultSettings());
  });
});

describe('import / export', () => {
  it('round-trips an export', () => {
    const s = defaultSettings();
    s.profiles.push(duplicateProfile(s.profiles[0]!, 'Evening'));
    const r = importSettings(exportSettings(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.settings).toEqual(s);
  });

  it('rejects malformed files with a readable error', () => {
    const cases = [
      'not json {',
      '[]',
      JSON.stringify({ version: 2 }),
      JSON.stringify({ ...defaultSettings(), activeProfileId: 'missing' }),
      JSON.stringify({ format: 'steady-settings', settings: { ...defaultSettings(), profiles: [] } }),
      JSON.stringify({ version: 7 }),
    ];
    for (const text of cases) {
      const r = importSettings(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });

  it('rejects out-of-range values', () => {
    const s = defaultSettings();
    s.profiles[0]!.dwell.dwellMs = 10;
    const r = parseSettings(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('dwellMs');
  });
});

describe('helpers', () => {
  it('duplicates profiles with a fresh id', () => {
    const p = defaultSettings().profiles[0]!;
    const d = duplicateProfile(p);
    expect(d.id).not.toBe(p.id);
    expect(d.name).toBe('Steady (mild) (copy)');
    d.filter.beta = 0.5;
    expect(p.filter.beta).not.toBe(0.5);
  });

  it('normalises origins', () => {
    expect(toOrigin('https://news.example.com/a/b?c')).toBe('https://news.example.com');
    expect(toOrigin('file:///C:/x.html')).toBe('file://');
    expect(toOrigin('chrome://extensions')).toBeNull();
    expect(toOrigin(undefined)).toBeNull();
  });
});
