// Settings schema, defaults, and migration. Every context (background, content,
// options, popup) reads settings through `migrate()`, so a malformed or old store
// can never crash a page — it degrades to defaults (principle 4: fail open).
import * as z from 'zod/mini';

export const SETTINGS_VERSION = 2;

const num = (min: number, max: number) => z.number().check(z.gte(min), z.lte(max));

export const FilterSchema = z.object({
  type: z.enum(['oneEuro', 'exponential', 'none']),
  /** 1€ minimum cutoff frequency (Hz). Lower = smoother when moving slowly. */
  minCutoff: num(0.01, 10),
  /** 1€ speed coefficient. Higher = less lag when moving fast. */
  beta: num(0, 1),
  /** Exponential smoothing factor (0–1]; used when type = 'exponential'. */
  alpha: z.optional(num(0.01, 1)),
});

export const CursorSchema = z.object({
  /** Draw Steady's filtered "ghost" cursor. */
  showGhost: z.boolean(),
  /** Hide the system cursor so only the ghost cursor is visible. */
  hideSystemCursor: z.boolean(),
});

export const TargetAssistSchema = z.object({
  enabled: z.boolean(),
  snapRadiusPx: num(0, 200),
  highlightStyle: z.enum(['ring', 'fill']),
  magnify: z.boolean(),
  magnifyScale: num(1, 3),
});

export const DwellSchema = z.object({
  enabled: z.boolean(),
  dwellMs: num(300, 5000),
  restZoneEnabled: z.boolean(),
  restZoneRadiusPx: num(2, 80),
  showCountdown: z.boolean(),
});

export const TimePressureSchema = z.object({
  persistHoverMenus: z.boolean(),
  pauseToasts: z.boolean(),
  synthesizeDoubleClick: z.boolean(),
  hoverPersistMs: num(0, 10000),
});

export const HeadtrackSchema = z.object({
  gain: num(0.1, 10),
  deadZonePx: num(0, 100),
  mirror: z.boolean(),
});

export const SwitchSchema = z.object({
  /** KeyboardEvent.code of the (advance) switch, e.g. "Space". */
  key: z.string().check(z.minLength(1), z.maxLength(40)),
  /** Optional second switch (KeyboardEvent.code). When set: key = advance, selectKey = select. */
  selectKey: z.optional(z.string().check(z.maxLength(40))),
  mode: z.enum(['manual', 'auto']),
  scanIntervalMs: num(400, 10000),
  longPressMs: num(200, 3000),
});

export const ProfileSchema = z.object({
  id: z.string().check(z.minLength(1), z.maxLength(64)),
  name: z.string().check(z.minLength(1), z.maxLength(60)),
  filter: FilterSchema,
  cursor: CursorSchema,
  targetAssist: TargetAssistSchema,
  dwell: DwellSchema,
  timePressure: TimePressureSchema,
  input: z.object({
    source: z.enum(['mouse', 'headtrack', 'switch']),
    headtrack: z.optional(HeadtrackSchema),
    switch: z.optional(SwitchSchema),
  }),
});

export const SettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  activeProfileId: z.string(),
  profiles: z.array(ProfileSchema).check(z.minLength(1), z.maxLength(20)),
  enabled: z.boolean(),
  /** Origins where the user turned Steady off. */
  disabledOrigins: z.array(z.string()),
  /** Origins where a single activation also sends a double click (F4). */
  doubleClickOrigins: z.array(z.string()),
  studyLogging: z.object({
    enabled: z.boolean(),
    participantId: z.optional(z.string().check(z.maxLength(64))),
  }),
});

export type FilterConfig = z.infer<typeof FilterSchema>;
export type SwitchConfig = z.infer<typeof SwitchSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------
// Defaults

export const DEFAULT_SWITCH: SwitchConfig = {
  key: 'Space',
  mode: 'manual',
  scanIntervalMs: 1500,
  longPressMs: 600,
};

export const DEFAULT_HEADTRACK = { gain: 2, deadZonePx: 8, mirror: true };

const baseProfile: Omit<Profile, 'id' | 'name'> = {
  filter: { type: 'oneEuro', minCutoff: 1.0, beta: 0.005 },
  cursor: { showGhost: true, hideSystemCursor: false },
  targetAssist: { enabled: true, snapRadiusPx: 40, highlightStyle: 'ring', magnify: false, magnifyScale: 1.3 },
  dwell: { enabled: false, dwellMs: 1000, restZoneEnabled: true, restZoneRadiusPx: 12, showCountdown: true },
  timePressure: { persistHoverMenus: true, pauseToasts: true, synthesizeDoubleClick: false, hoverPersistMs: 1500 },
  input: { source: 'mouse', switch: { ...DEFAULT_SWITCH }, headtrack: { ...DEFAULT_HEADTRACK } },
};

export function defaultProfiles(): Profile[] {
  const mild: Profile = { ...structuredClone(baseProfile), id: 'mild', name: 'Steady (mild)' };
  const strong: Profile = {
    ...structuredClone(baseProfile),
    id: 'strong',
    name: 'Steady (strong)',
    filter: { type: 'oneEuro', minCutoff: 0.4, beta: 0.002 },
    cursor: { showGhost: true, hideSystemCursor: true },
    targetAssist: { ...baseProfile.targetAssist, snapRadiusPx: 60, magnify: true },
    timePressure: { ...baseProfile.timePressure, hoverPersistMs: 3000 },
  };
  const rest: Profile = {
    ...structuredClone(baseProfile),
    id: 'rest',
    name: 'Rest mode',
    filter: { type: 'oneEuro', minCutoff: 0.4, beta: 0.002 },
    cursor: { showGhost: true, hideSystemCursor: true },
    targetAssist: { ...baseProfile.targetAssist, snapRadiusPx: 60, magnify: true },
    dwell: { ...baseProfile.dwell, enabled: true, dwellMs: 1200 },
    timePressure: { ...baseProfile.timePressure, hoverPersistMs: 3000 },
  };
  return [mild, strong, rest];
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    activeProfileId: 'mild',
    profiles: defaultProfiles(),
    enabled: true,
    disabledOrigins: [],
    doubleClickOrigins: [],
    studyLogging: { enabled: false },
  };
}

// ---------------------------------------------------------------------------
// Validation and migration

export type ParseResult = { ok: true; settings: Settings } | { ok: false; error: string };

function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ');
}

/**
 * Version 1 was the prototype's flat, single-profile shape. It is kept only so
 * that `migrate()` has a real upgrade path to test.
 */
const SettingsV1Schema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  smoothing: z.enum(['off', 'mild', 'strong']),
  snapRadius: z.number(),
  dwellMs: z.nullable(z.number()),
  disabledSites: z.array(z.string()),
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function fromV1(v1: z.infer<typeof SettingsV1Schema>): Settings {
  const s = defaultSettings();
  const template = s.profiles.find((p) => p.id === (v1.smoothing === 'strong' ? 'strong' : 'mild'))!;
  const migrated: Profile = {
    ...structuredClone(template),
    id: 'migrated',
    name: 'My profile',
    filter: v1.smoothing === 'off' ? { ...template.filter, type: 'none' } : template.filter,
    targetAssist: { ...template.targetAssist, snapRadiusPx: clamp(v1.snapRadius, 0, 200) },
    dwell:
      v1.dwellMs === null
        ? { ...template.dwell, enabled: false }
        : { ...template.dwell, enabled: true, dwellMs: clamp(v1.dwellMs, 300, 5000) },
  };
  s.profiles.unshift(migrated);
  s.activeProfileId = migrated.id;
  s.enabled = v1.enabled;
  s.disabledOrigins = v1.disabledSites;
  return s;
}

/** Fill any missing profile fields from the defaults, so partially valid stores survive. */
function repairProfile(raw: unknown): Profile | null {
  if (!isRecord(raw)) return null;
  const base = structuredClone(baseProfile) as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...raw };
  for (const key of ['filter', 'cursor', 'targetAssist', 'dwell', 'timePressure', 'input']) {
    if (isRecord(base[key]) && isRecord(raw[key])) merged[key] = { ...base[key], ...raw[key] };
  }
  const r = ProfileSchema.safeParse(merged);
  return r.success ? r.data : null;
}

function finalize(s: Settings): Settings {
  // Ids must be unique and the active id must exist.
  const seen = new Set<string>();
  s.profiles = s.profiles.filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (!s.profiles.some((p) => p.id === s.activeProfileId)) s.activeProfileId = s.profiles[0]!.id;
  return s;
}

/**
 * Strict parse used for imports: accepts the current version or anything
 * `migrate` can upgrade, but reports errors instead of silently repairing.
 */
export function parseSettings(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: 'The file does not contain a settings object.' };
  if (raw.version === 1) {
    const v1 = SettingsV1Schema.safeParse(raw);
    if (!v1.success) return { ok: false, error: describeIssues(v1.error.issues) };
    return { ok: true, settings: fromV1(v1.data) };
  }
  if (raw.version !== SETTINGS_VERSION) {
    return { ok: false, error: `Unsupported settings version: ${String(raw.version)}.` };
  }
  const r = SettingsSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: describeIssues(r.error.issues) };
  const ids = new Set(r.data.profiles.map((p) => p.id));
  if (ids.size !== r.data.profiles.length) return { ok: false, error: 'Two profiles share the same id.' };
  if (!ids.has(r.data.activeProfileId)) return { ok: false, error: 'activeProfileId does not match any profile.' };
  return { ok: true, settings: r.data };
}

/**
 * Lenient upgrade used when reading storage. Never throws; always returns valid settings.
 */
export function migrate(raw: unknown): Settings {
  try {
    if (!isRecord(raw) || raw.version === undefined) return defaultSettings();
    const strict = parseSettings(raw);
    if (strict.ok) return finalize(strict.settings);
    if (raw.version !== SETTINGS_VERSION) return defaultSettings();
    // Current version but partly invalid: keep what we can.
    const d = defaultSettings();
    const profiles = Array.isArray(raw.profiles)
      ? raw.profiles.map(repairProfile).filter((p): p is Profile => p !== null)
      : [];
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const logging = isRecord(raw.studyLogging) ? raw.studyLogging : {};
    return finalize({
      ...d,
      profiles: profiles.length ? profiles.slice(0, 20) : d.profiles,
      activeProfileId: typeof raw.activeProfileId === 'string' ? raw.activeProfileId : d.activeProfileId,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
      disabledOrigins: strings(raw.disabledOrigins),
      doubleClickOrigins: strings(raw.doubleClickOrigins),
      studyLogging: {
        enabled: logging.enabled === true,
        ...(typeof logging.participantId === 'string' ? { participantId: logging.participantId.slice(0, 64) } : {}),
      },
    });
  } catch {
    return defaultSettings();
  }
}

// ---------------------------------------------------------------------------
// Helpers

export function activeProfile(s: Settings): Profile {
  return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0]!;
}

export function newProfileId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function duplicateProfile(p: Profile, name?: string): Profile {
  return { ...structuredClone(p), id: newProfileId(), name: (name ?? `${p.name} (copy)`).slice(0, 60) };
}

/** Normalizes a URL or origin string to an origin, or null. */
export function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return 'file://';
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export const EXPORT_FORMAT = 'steady-settings';

export function exportSettings(s: Settings): string {
  return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), settings: s }, null, 2);
}

/** Parses an exported file's text. Accepts the export wrapper or a bare settings object. */
export function importSettings(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (isRecord(json) && json.format === EXPORT_FORMAT) return parseSettings(json.settings);
  return parseSettings(json);
}
