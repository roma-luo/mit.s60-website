/* index.js — cold-start loader for the build-time search index
 * (content/index.json). Module-level cache: one disk read per function
 * instance, reused across invocations. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let cache = null;

export async function loadIndex() {
  if (cache) return cache;
  const candidates = [
    new URL('../content/index.json', import.meta.url),   // local dev / tests
    path.join(process.cwd(), 'content', 'index.json')    // serverless bundle
  ];
  let lastErr = null;
  for (const p of candidates) {
    try {
      cache = JSON.parse(await readFile(p, 'utf8'));
      return cache;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('index.json not found');
}
