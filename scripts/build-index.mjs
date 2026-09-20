#!/usr/bin/env node
/* build-index.mjs — generate content/manifest.json from every .md under
 * content/ (recursive). Front matter carries the metadata; the manifest is
 * a build artifact now. (Chunking + the embedding/BM25 search index land
 * in the next step.)
 *
 * Zero dependencies by design: the front-matter parser is hand-rolled
 * (flat `key: value`, inline `[a, b]` arrays, single-line values only).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');

export function parseFrontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    data[kv[1]] = v.startsWith('[') && v.endsWith(']')
      ? v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      : v;
  }
  return { data, body: src.slice(m[0].length) };
}

// label fallback: title before "—", uppercased, trailing number zero-padded
export function deriveLabel(title) {
  const base = (String(title).split('—')[0] || title).trim().toUpperCase();
  return base.replace(/(\d+)\s*$/, n => n.padStart(2, '0'));
}

// answer fallback: first plain paragraph (skips headings, quotes, tables,
// fences, hr, list items, images/links-only lines)
export function firstParagraph(body) {
  const buf = [];
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    const structural = !l || /^#|^>|^\||^```|^---|^\s*[-*]\s|^\s*\d+[.)]\s|!?\[/.test(l);
    if (structural) { if (buf.length) break; continue; }
    buf.push(l);
  }
  return buf.join(' ');
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

export async function buildEntries() {
  const entries = [];
  for await (const abs of walk(CONTENT)) {
    const rel = path.relative(CONTENT, abs).split(path.sep).join('/');
    const { data: fm, body } = parseFrontMatter(await readFile(abs, 'utf8'));
    const title = fm.title || (body.match(/^#\s+(.*)$/m) || [])[1] || rel;
    const tags = fm.tags || [];
    entries.push({
      id: fm.id || rel.replace(/\.md$/, ''),
      label: fm.label || deriveLabel(title),
      title,
      section: fm.section || (rel.includes('/') ? rel.split('/')[0] : ''),
      tags,
      keywords: fm.keywords || tags,
      file: 'content/' + rel,
      answer: fm.answer || firstParagraph(body)
    });
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  return entries;
}

async function main() {
  const persona = JSON.parse(await readFile(path.join(CONTENT, 'persona.json'), 'utf8'));
  const entries = await buildEntries();
  const manifest = { persona, entries };
  const out = path.join(CONTENT, 'manifest.json');
  await writeFile(out, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest: ${entries.length} entries → ${path.relative(ROOT, out)}`);
  for (const e of entries) console.log(`  ${e.id}  [${e.label}]  ${e.title}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(err => { console.error(err); process.exit(1); });
