import type { FilterConfig } from '../shared/settings';

// Page side of the demo bridge (see src/content/bridge.ts). Without the extension
// (or on a host the bridge does not trust) `state` stays null and the demo runs
// its baseline-only mode.
export interface SteadyState {
  running: boolean;
  suspendedBy: string | null;
  profileId: string | null;
  profiles: { id: string; name: string; dwell: boolean; filter: FilterConfig }[];
}

type Listener = (s: SteadyState | null) => void;

export class SteadyClient {
  state: SteadyState | null = null;
  private listeners: Listener[] = [];

  constructor() {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as { source?: string; type?: string } & Partial<SteadyState>;
      if (d?.source !== 'steady-ext' || d.type !== 'STATE') return;
      this.state = {
        running: !!d.running,
        suspendedBy: d.suspendedBy ?? null,
        profileId: d.profileId ?? null,
        profiles: Array.isArray(d.profiles) ? d.profiles : [],
      };
      this.listeners.forEach((l) => l(this.state));
    });
    this.send({ type: 'HELLO' });
  }

  get present() {
    return this.state !== null;
  }

  get running() {
    return !!this.state?.running;
  }

  onChange(l: Listener) {
    this.listeners.push(l);
  }

  private send(msg: Record<string, unknown>) {
    window.postMessage({ source: 'steady-demo', ...msg }, location.origin);
  }

  setSuspended(suspended: boolean) {
    this.send({ type: 'SET_SUSPENDED', suspended });
  }
  setProfile(profileId: string | null) {
    this.send({ type: 'SET_PROFILE', profileId });
  }
  setSimTremor(amplitudePx: number) {
    this.send({ type: 'SET_SIM_TREMOR', amplitudePx });
  }
  marker(kind: string, data?: Record<string, string | number | boolean | null>) {
    this.send({ type: 'TASK_MARKER', kind, data });
  }

  /** Resolves once Steady has announced itself, or after `ms` without it. */
  ready(ms = 1500): Promise<SteadyState | null> {
    if (this.state) return Promise.resolve(this.state);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), ms);
      this.onChange((s) => {
        clearTimeout(t);
        resolve(s);
      });
    });
  }
}
