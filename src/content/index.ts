// Content-script bootstrap. Decides whether Steady should run in this frame and
// owns the Pipeline's lifecycle. Everything that touches the page is wrapped so
// that a failure disables Steady on this page instead of breaking it (fail open).
import { parseMessage, sendToBackground, type MessageOf, type PingReply } from '../shared/messages';
import { activeProfile, migrate, toOrigin, type Profile, type Settings } from '../shared/settings';
import { SETTINGS_KEY } from '../shared/storage';
import { DemoBridge } from './bridge';
import { Pipeline } from './pipeline';
import { StudyLogger } from '../shared/logging';

class Steady {
  private settings: Settings | null = null;
  private panicked = false;
  /** Set by the demo page through the bridge; tab-local and never persisted. */
  private pageSuspended = false;
  private pageProfileId: string | null = null;
  private pipeline: Pipeline | null = null;
  private readonly logger = new StudyLogger((events) => void sendToBackground({ type: 'LOG_EVENT', events }));
  private readonly bridge: DemoBridge | null = window === window.top ? new DemoBridge(this) : null;

  /** The origin used for per-site settings: the top-level page's, even inside iframes. */
  readonly siteOrigin: string | null = (() => {
    const ancestors = location.ancestorOrigins;
    const top = ancestors && ancestors.length ? ancestors[ancestors.length - 1] : location.href;
    return toOrigin(top) ?? (location.protocol === 'file:' ? 'file://' : null);
  })();

  async start() {
    chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const msg = parseMessage(raw);
      if (!msg) return false;
      if (msg.type === 'SETTINGS_UPDATED') {
        console.debug(`Steady: settings updated (profile "${activeProfile(msg.settings).name}")`);
        this.setSettings(msg.settings);
      } else if (msg.type === 'TAB_STATE') {
        this.panicked = msg.panicked;
        console.info(`Steady ${msg.panicked ? 'turned off' : 'turned back on'} in this tab.`);
        this.apply();
      } else if (msg.type === 'PING') {
        if (window !== window.top) return false; // only the top frame answers
        sendResponse(this.ping());
      }
      return false;
    });
    const [stored, tabState] = await Promise.all([
      chrome.storage.sync.get(SETTINGS_KEY).catch(() => ({}) as Record<string, unknown>),
      sendToBackground<MessageOf<'TAB_STATE'>>({ type: 'GET_TAB_STATE' }),
    ]);
    this.panicked = tabState?.panicked ?? false;
    this.setSettings(migrate((stored as Record<string, unknown>)[SETTINGS_KEY]));
    this.bridge?.start();
  }

  private setSettings(s: Settings) {
    this.settings = s;
    this.logger.setEnabled(s.studyLogging.enabled);
    this.apply();
    this.bridge?.announce();
  }

  profile(): Profile | null {
    if (!this.settings) return null;
    const override = this.pageProfileId && this.settings.profiles.find((p) => p.id === this.pageProfileId);
    return override || activeProfile(this.settings);
  }

  get profiles(): Profile[] {
    return this.settings?.profiles ?? [];
  }

  suspendedBy(): PingReply['suspendedBy'] {
    const s = this.settings;
    if (!s) return null;
    if (this.panicked) return 'panic';
    if (!s.enabled) return 'global';
    if (this.siteOrigin && s.disabledOrigins.includes(this.siteOrigin)) return 'site';
    if (this.failed) return 'error';
    if (this.pageSuspended) return 'page';
    return null;
  }

  perf() {
    return this.pipeline?.perfSummary() ?? null;
  }

  ping(): PingReply {
    return { running: !!this.pipeline, suspendedBy: this.suspendedBy(), profileName: this.profile()?.name ?? '' };
  }

  // --- Called by the demo bridge ---------------------------------------------
  setPageSuspended(v: boolean) {
    this.pageSuspended = v;
    this.apply();
  }
  setPageProfile(id: string | null) {
    this.pageProfileId = id;
    this.apply();
  }
  setSimulatedTremor(amplitudePx: number) {
    this.simTremor = amplitudePx;
    this.pipeline?.setSimulatedTremor(amplitudePx);
  }
  log(kind: string, data?: Record<string, string | number | boolean | null>) {
    this.logger.log(kind, data);
  }
  private simTremor = 0;
  private failed = false;

  private apply() {
    try {
      const profile = this.profile();
      const shouldRun = !!profile && this.suspendedBy() === null && this.frameIsWorthRunning();
      if (!shouldRun) {
        this.stopPipeline();
      } else if (!this.pipeline) {
        this.pipeline = new Pipeline(profile, {
          logger: this.logger,
          doubleClick: () => !!this.siteOrigin && !!this.settings?.doubleClickOrigins.includes(this.siteOrigin),
          onFatal: (err) => this.fail(err),
        });
        this.pipeline.setSimulatedTremor(this.simTremor);
        this.pipeline.start();
        this.logger.log('pipelineStart', { profile: profile.name, filter: profile.filter.type, input: profile.input.source });
      } else {
        this.pipeline.setProfile(profile);
        this.logger.log('profileApplied', { profile: profile.name, filter: profile.filter.type, input: profile.input.source });
      }
    } catch (err) {
      this.fail(err);
    }
    this.bridge?.announce();
  }

  private stopPipeline() {
    if (!this.pipeline) return;
    try {
      this.pipeline.destroy();
    } catch {}
    this.pipeline = null;
    this.logger.log('pipelineStop');
  }

  /** Any unexpected error: tear everything down so the page behaves as if Steady were absent. */
  private fail(err: unknown) {
    console.warn('Steady hit an error and turned itself off on this page. The page is unaffected.', err);
    this.stopPipeline();
    this.failed = true;
  }

  /** Tiny frames (ads, trackers) are not worth a pipeline. */
  private frameIsWorthRunning(): boolean {
    return window === window.top || (window.innerWidth >= 80 && window.innerHeight >= 60);
  }
}

export type SteadyHost = Steady;

try {
  console.info('Steady loaded');
  void new Steady().start().catch((err) => console.warn('Steady failed to start; the page is unaffected.', err));
} catch (err) {
  console.warn('Steady failed to start; the page is unaffected.', err);
}
