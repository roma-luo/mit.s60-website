#!/usr/bin/env node
/* build-index.mjs — build artifacts for the memory vault:
 *   content/manifest.json  — entries generated from .md front matter
 *   content/index.json     — chunks (+ vectors when OPENAI_API_KEY is set)
 *                            + tf/df for BM25, for /api/recall hybrid search
 *
 * Incremental: a chunk is re-embedded only when its sha1 changes
 * (content/.embed-cache.json). Without OPENAI_API_KEY the script still
 * emits everything except vectors (BM25-only index) with a warning —
 * Vercel supplies the key at build time.
 *
 * Zero dependencies by design: the front-matter parser is hand-rolled
 * (flat `key: value`, inline `[a, b]` arrays, single-line values only).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokenize } from '../lib/tokens.js';
import { embeddingsUrl, embedModel } from '../lib/embed.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONTENT = path.join(ROOT, 'content');
const MANIFEST = path.join(CONTENT, 'manifest.json');
const INDEX = path.join(CONTENT, 'index.json');
const CACHE = path.join(CONTENT, '.embed-cache.json');

const EMBED_DIMS = 512;
const CHUNK_MAX = 1200;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH = 100;

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
    const entry = {
      id: fm.id || rel.replace(/\.md$/, ''),
      label: fm.label || deriveLabel(title),
      title,
      section: fm.section || (rel.includes('/') ? rel.split('/')[0] : ''),
      tags,
      keywords: fm.keywords || tags,
      file: 'content/' + rel,
      answer: fm.answer || firstParagraph(body)
    };
    // attachments (recordings etc.) pass through; URLs resolve against the
    // doc's own directory at display time
    if (fm.attachments && fm.attachments.length) entry.attachments = fm.attachments;
    entries.push(entry);
  }
  entries.sort((a, b) => a.file.localeCompare(b.file));
  return entries;
}

/* split long text at paragraph boundaries when possible, hard-cut
 * otherwise, with a CHUNK_OVERLAP-char tail carried into the next part */
export function splitLong(text, max = CHUNK_MAX, overlap = CHUNK_OVERLAP) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = max; // no good paragraph break: hard cut
    parts.push(rest.slice(0, cut));
    rest = rest.slice(Math.max(0, cut - overlap));
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}

/* one doc → retrieval chunks: split by `## ` headings (content before the
 * first heading is its own section), over-long sections split with overlap;
 * every chunk is prefixed "title > heading" for embedding context */
export function chunkDoc(title, body) {
  const sections = [];
  let cur = { heading: '', lines: [] };
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) { sections.push(cur); cur = { heading: m[1].trim(), lines: [] }; }
    else cur.lines.push(line);
  }
  sections.push(cur);

  const chunks = [];
  for (const s of sections) {
    const text = s.lines.join('\n').trim();
    if (!text) continue;
    for (const part of text.length <= CHUNK_MAX ? [text] : splitLong(text)) {
      chunks.push({ heading: s.heading, text: part, prefixed: `${title} > ${s.heading}\n${part}` });
    }
  }
  return chunks;
}

const sha1 = s => createHash('sha1').update(s).digest('hex');
const round5 = v => Math.round(v * 1e5) / 1e5;

async function embedBatch(texts, key) {
  const res = await fetch(embeddingsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: embedModel(), input: texts, dimensions: EMBED_DIMS })
  });
  if (!res.ok) throw new Error('openai embeddings http ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return data.data.map(d => d.embedding.map(round5));
}

async function main() {
  /* ---- manifest */
  const persona = JSON.parse(await readFile(path.join(CONTENT, 'persona.json'), 'utf8'));
  const entries = await buildEntries();
  await writeFile(MANIFEST, JSON.stringify({ persona, entries }, null, 2) + '\n');
  console.log(`manifest: ${entries.length} entries`);

  /* ---- chunks */
  const chunks = [];
  for (const e of entries) {
    const { body } = parseFrontMatter(await readFile(path.join(ROOT, e.file), 'utf8'));
    chunkDoc(e.title, body).forEach((c, i) => {
      chunks.push({ id: `${e.id}#${i}`, docId: e.id, heading: c.heading, text: c.text, prefixed: c.prefixed, sha: sha1(c.prefixed) });
    });
  }
  console.log(`chunks: ${chunks.length} from ${entries.length} docs`);

  /* ---- incremental embedding */
  let cache = {};
  try { cache = JSON.parse(await readFile(CACHE, 'utf8')); } catch (e) { /* first run */ }
  const key = process.env.OPENAI_API_KEY || '';
  const stale = chunks.filter(c => !cache[c.id] || cache[c.id].sha !== c.sha);
  let embedded = 0;
  if (!stale.length) {
    console.log('embeddings: all chunks cached, nothing to do');
  } else if (!key) {
    console.warn(`WARNING: OPENAI_API_KEY not set — building BM25-only index (${stale.length} chunks un-embedded). Set it and re-run to add vectors.`);
  } else {
    try {
      console.log(`embedding via ${new URL(embeddingsUrl()).host} model ${embedModel()}`);
      for (let i = 0; i < stale.length; i += EMBED_BATCH) {
        const batch = stale.slice(i, i + EMBED_BATCH);
        const vecs = await embedBatch(batch.map(c => c.prefixed), key);
        batch.forEach((c, j) => { cache[c.id] = { sha: c.sha, vec: vecs[j] }; });
        embedded += batch.length;
        console.log(`embedded ${embedded}/${stale.length}`);
      }
    } catch (err) {
      // a bad key / quota / network must never break the build
      console.warn(`WARNING: embedding failed (${err.message}) — continuing BM25-only.`);
    }
  }

  /* ---- index.json: chunks (+vecs when cached) + tf/df for BM25 */
  const outChunks = chunks.map(c => {
    const tf = {};
    for (const t of tokenize(c.prefixed)) tf[t] = (tf[t] || 0) + 1;
    const cached = cache[c.id];
    const out = { id: c.id, docId: c.docId, heading: c.heading, text: c.text, tf };
    if (cached && cached.sha === c.sha && cached.vec) out.vec = cached.vec;
    return out;
  });
  const df = {};
  for (const c of outChunks) for (const t of Object.keys(c.tf)) df[t] = (df[t] || 0) + 1;
  const index = {
    model: embedModel(),
    dims: EMBED_DIMS,
    builtAt: new Date().toISOString(),
    chunks: outChunks,
    df,
    n: outChunks.length
  };
  await writeFile(INDEX, JSON.stringify(index));
  await writeFile(CACHE, JSON.stringify(cache));
  const vecd = outChunks.filter(c => c.vec).length;
  console.log(`index: ${outChunks.length} chunks (${vecd} with vectors) → ${path.relative(ROOT, INDEX)}`);
  console.log(`embedded ${embedded} / skipped ${chunks.length - embedded}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(err => { console.error(err); process.exit(1); });
