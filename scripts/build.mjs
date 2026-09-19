// Build script: bundles each extension context with esbuild and copies static files.
// Why esbuild instead of Vite + @crxjs: see docs/DESIGN_LOG.md (Phase 0).
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const watch = process.argv.includes('--watch');
const dist = path.join(root, 'dist');
const distDemo = path.join(root, 'dist-demo');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  loader: { '.css': 'text' },
  logLevel: 'info',
  legalComments: 'none',
};

const extensionEntries = {
  background: 'src/background/service-worker.ts',
  content: 'src/content/index.ts',
  'main-world': 'src/content/main-world.ts',
  'options/options': 'src/options/options.ts',
  'popup/popup': 'src/popup/popup.ts',
};

async function copyStatic() {
  await mkdir(path.join(dist, 'options'), { recursive: true });
  await mkdir(path.join(dist, 'popup'), { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const f of ['options/options.html', 'options/options.css', 'popup/popup.html', 'popup/popup.css']) {
    await cp(path.join(root, 'src', f), path.join(dist, f));
  }
  await cp(path.join(root, 'src/shared/ui.css'), path.join(dist, 'shared/ui.css'), { recursive: true });
  if (existsSync(path.join(root, 'src/icons'))) {
    await cp(path.join(root, 'src/icons'), path.join(dist, 'icons'), { recursive: true });
  }
  await mkdir(distDemo, { recursive: true });
  for (const f of ['index.html', 'demo.css', 'privacy.html', 'news.html']) {
    if (existsSync(path.join(root, 'src/demo', f))) await cp(path.join(root, 'src/demo', f), path.join(distDemo, f));
  }
  if (existsSync(path.join(root, 'src/icons/icon-128.png'))) {
    await cp(path.join(root, 'src/icons/icon-128.png'), path.join(distDemo, 'icon-128.png'));
  }
}

const copyPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await copyStatic();
    });
  },
};

if (!watch) {
  await rm(dist, { recursive: true, force: true });
  await rm(distDemo, { recursive: true, force: true });
}

const ctxs = await Promise.all([
  esbuild.context({ ...common, entryPoints: extensionEntries, outdir: dist, plugins: [copyPlugin] }),
  esbuild.context({ ...common, entryPoints: { demo: 'src/demo/demo.ts' }, outdir: distDemo }),
]);

if (watch) {
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('Watching for changes…');
} else {
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.dispose()));
}
