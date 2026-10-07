import { createHash } from 'node:crypto';
import type { OfflineManifest } from '@/offline/worker-runtime';

export interface EmittedFile {
  type: 'chunk' | 'asset';
  fileName: string;
  source?: string | Uint8Array;
  code?: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  dynamicImports?: string[];
  viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> };
}

/** Walk the real HTML entry graph, including lazy chunks and Vite's CSS/font metadata. */
export function buildCacheManifest(bundle: Readonly<Record<string, EmittedFile>>, publicFiles: Readonly<Record<string, string | Uint8Array>>, base: string, workerCode: string): OfflineManifest {
  const files = new Map<string, string | Uint8Array>();
  const visit = (name: string): void => {
    if (files.has(name)) return;
    const output = bundle[name];
    const content = output?.type === 'chunk' ? output.code : output?.source ?? publicFiles[name];
    if (content === undefined) throw new Error(`Offline dependency missing from build: ${name}`);
    files.set(name, content);
    for (const next of [...(output?.imports ?? []), ...(output?.dynamicImports ?? []), ...(output?.viteMetadata?.importedCss ?? []), ...(output?.viteMetadata?.importedAssets ?? [])]) visit(next);
  };
  const entries = Object.values(bundle).filter((file) => file.type === 'chunk' && file.isEntry && file.facadeModuleId?.replaceAll('\\', '/').endsWith('/index.html'));
  if (entries.length !== 1) throw new Error('Offline cache needs the main index.html entry.');
  visit('index.html');
  visit(entries[0].fileName);
  for (const name of Object.keys(publicFiles)) visit(name);
  const sorted = [...files.keys()].sort();
  const hash = createHash('sha256').update(workerCode).update(base);
  for (const name of sorted) hash.update(name).update('\0').update(files.get(name)!).update('\0');
  return { cacheName: `bathurst-game-${hash.digest('hex').slice(0, 20)}`, rootPath: base, files: [base, ...sorted.map((name) => base + name)].sort() };
}
