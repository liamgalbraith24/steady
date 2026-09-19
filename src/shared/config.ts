// Build-time constants.

/**
 * Pages allowed to talk to Steady through the demo bridge (see content/bridge.ts).
 * Revealing that Steady is installed — or a user's profile names — to an arbitrary
 * website would disclose that the user relies on assistive technology, so the bridge
 * is limited to the demo page's own hosts.
 *
 * TODO(owner): add your GitHub Pages origin once the repo is published,
 * e.g. 'https://<username>.github.io'. The pathname must also start with DEMO_PATH_PREFIX.
 */
export const DEMO_ORIGINS: readonly string[] = ['http://localhost:4173', 'http://127.0.0.1:4173'];

/** On hosted origins (not localhost), the demo must live under this path. */
export const DEMO_PATH_PREFIX = '/steady';

export function isDemoPage(loc: Pick<Location, 'origin' | 'pathname'>): boolean {
  if (!DEMO_ORIGINS.includes(loc.origin)) return false;
  const local = loc.origin.startsWith('http://localhost') || loc.origin.startsWith('http://127.0.0.1');
  return local || loc.pathname.startsWith(DEMO_PATH_PREFIX);
}
