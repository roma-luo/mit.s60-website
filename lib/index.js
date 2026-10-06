/* index.js: loader for the build-time search index (content/index.json).
 * Module-level cache, reused across invocations; a cheap mtime check
 * re-reads it when the file changes, so a long-running local server picks
 * up `npm run build:index` without a restart (on Vercel it never changes). */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

let cache = null;
let cachedPath = null;
let cachedMtime = 0;

export async function loadIndex() {
  if (cache) {
    try {
      if ((await stat(cachedPath)).mtimeMs === cachedMtime) return cache;
    } catch (e) { return cache; }   // can't stat (bundle quirks): keep what we have
  }
  const candidates = [
    new URL('../content/index.json', import.meta.url),   // local dev / tests
    path.join(process.cwd(), 'content', 'index.json')    // serverless bundle
  ];
  let lastErr = null;
  for (const p of candidates) {
    try {
      const mtime = (await stat(p)).mtimeMs;
      cache = JSON.parse(await readFile(p, 'utf8'));
      cachedPath = p;
      cachedMtime = mtime;
      return cache;
    } catch (e) { lastErr = e; }
  }
  if (cache) return cache;
  throw lastErr || new Error('index.json not found');
}
