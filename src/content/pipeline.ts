// Phase 1 placeholder; the real pipeline arrives in Phase 2.
import type { Profile } from '../shared/settings';
import type { StudyLogger } from '../shared/logging';

export interface PipelineHooks {
  logger: StudyLogger;
  doubleClick: () => boolean;
  onFatal: (err: unknown) => void;
}

export class Pipeline {
  constructor(
    private profile: Profile,
    private readonly hooks: PipelineHooks,
  ) {}
  start() {}
  setProfile(p: Profile) {
    this.profile = p;
  }
  setSimulatedTremor(_px: number) {}
  destroy() {}
}
