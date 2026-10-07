import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { buildCacheManifest } from './offline-manifest';
import { createWorkerSource, workerCode } from '../src/offline/worker-runtime';

export function offlinePlugin(): Plugin {
  let base = '/';
  let publicDir = '';
  return {
    name: 'bathurst-offline', apply: 'build', enforce: 'post',
    configResolved(config) { base = config.base; publicDir = config.publicDir; },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const publicFiles = Object.fromEntries(['manifest.webmanifest', 'icon-180.png', 'icon-512.png'].map((name) => [name, readFileSync(resolve(publicDir, name))]));
        const manifest = buildCacheManifest(bundle, publicFiles, base, workerCode());
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: createWorkerSource(manifest) });
      },
    },
  };
}
