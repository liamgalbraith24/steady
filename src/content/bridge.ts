// window.postMessage bridge between the demo page and Steady. Only active on the
// demo page's hosts (see shared/config.ts): elsewhere, pages cannot detect Steady.
//
// Everything the page can do here is tab-local and temporary: pause Steady for a
// baseline condition, pick a profile for this tab, add simulated tremor, and drop
// task markers into the (opt-in) study log. It can never change stored settings.
import * as z from 'zod/mini';
import { isDemoPage } from '../shared/config';
import type { Profile } from '../shared/settings';
import type { SteadyHost } from './index';

export const BRIDGE_PAGE = 'steady-demo';
export const BRIDGE_EXT = 'steady-ext';

const PageMessage = z.discriminatedUnion('type', [
  z.object({ source: z.literal(BRIDGE_PAGE), type: z.literal('HELLO') }),
  z.object({ source: z.literal(BRIDGE_PAGE), type: z.literal('GET_PERF') }),
  z.object({ source: z.literal(BRIDGE_PAGE), type: z.literal('SET_SUSPENDED'), suspended: z.boolean() }),
  z.object({ source: z.literal(BRIDGE_PAGE), type: z.literal('SET_PROFILE'), profileId: z.nullable(z.string()) }),
  z.object({
    source: z.literal(BRIDGE_PAGE),
    type: z.literal('SET_SIM_TREMOR'),
    amplitudePx: z.number().check(z.gte(0), z.lte(40)),
  }),
  z.object({
    source: z.literal(BRIDGE_PAGE),
    type: z.literal('TASK_MARKER'),
    kind: z.string().check(z.maxLength(64)),
    data: z.optional(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  }),
]);

export interface BridgeState {
  source: typeof BRIDGE_EXT;
  type: 'STATE';
  running: boolean;
  suspendedBy: string | null;
  profileId: string | null;
  profiles: { id: string; name: string; dwell: boolean; filter: Profile['filter'] }[];
}

export class DemoBridge {
  private active = false;

  constructor(private readonly host: SteadyHost) {}

  start() {
    if (!isDemoPage(location)) return;
    this.active = true;
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const r = PageMessage.safeParse(e.data);
      if (!r.success) return;
      const m = r.data;
      switch (m.type) {
        case 'HELLO':
          break;
        case 'GET_PERF':
          window.postMessage({ source: BRIDGE_EXT, type: 'PERF', perf: this.host.perf() }, location.origin);
          return;
        case 'SET_SUSPENDED':
          this.host.setPageSuspended(m.suspended);
          break;
        case 'SET_PROFILE':
          this.host.setPageProfile(m.profileId);
          break;
        case 'SET_SIM_TREMOR':
          this.host.setSimulatedTremor(m.amplitudePx);
          break;
        case 'TASK_MARKER':
          this.host.log(`task:${m.kind}`, m.data);
          break;
      }
      this.announce();
    });
    this.announce();
  }

  announce() {
    if (!this.active) return;
    const p = this.host.profile();
    const state: BridgeState = {
      source: BRIDGE_EXT,
      type: 'STATE',
      running: this.host.ping().running,
      suspendedBy: this.host.suspendedBy(),
      profileId: p?.id ?? null,
      profiles: this.host.profiles.map((x) => ({ id: x.id, name: x.name, dwell: x.dwell.enabled, filter: x.filter })),
    };
    window.postMessage(state, location.origin);
  }
}
