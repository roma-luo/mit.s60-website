/* search.js — hybrid retrieval over the build-time index:
 * BM25 top-k (always) + cosine top-k (when the query embedded and chunks
 * carry vectors), fused with Reciprocal Rank Fusion; at most 2 chunks per
 * docId; returns k hits. BM25-only when no vectors are present.
 *
 *   search(index, qvec, query, k=6) → [{ docId, heading, text, score }]
 */
import { tokenize } from './tokens.js';

const K1 = 1.5;
const B = 0.75;
const RRF_K = 60;
const PER_DOC = 2;

// lazily compute per-chunk doc length and vector norms, cached on the index
function prepare(index) {
  if (index.__prepared) return;
  let total = 0;
  for (const c of index.chunks) {
    c.len = 0;
    for (const n of Object.values(c.tf)) c.len += n;
    total += c.len;
    if (c.vec) {
      let s = 0;
      for (const v of c.vec) s += v * v;
      c.vnorm = Math.sqrt(s) || 1;
    }
  }
  index.avgdl = total / Math.max(1, index.chunks.length);
  index.__prepared = true;
}

function bm25Ranks(index, qTokens) {
  const { chunks, df, n } = index;
  const scored = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    let s = 0;
    for (const t of qTokens) {
      const tf = c.tf[t];
      if (!tf) continue;
      const dft = df[t] || 0;
      const idf = Math.log(1 + (n - dft + 0.5) / (dft + 0.5));
      s += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * c.len / index.avgdl));
    }
    if (s > 0) scored.push({ i, s });
  }
  return scored.sort((a, b) => b.s - a.s);
}

function cosineRanks(index, qvec) {
  let qn = 0;
  for (const v of qvec) qn += v * v;
  qn = Math.sqrt(qn) || 1;
  const scored = [];
  for (let i = 0; i < index.chunks.length; i++) {
    const c = index.chunks[i];
    if (!c.vec) continue;
    let dot = 0;
    for (let d = 0; d < qvec.length; d++) dot += qvec[d] * c.vec[d];
    const s = dot / (qn * c.vnorm);
    if (s > 0) scored.push({ i, s });
  }
  return scored.sort((a, b) => b.s - a.s);
}

export function search(index, qvec, query, k = 6) {
  prepare(index);
  const rankings = [bm25Ranks(index, tokenize(query))];
  if (qvec) rankings.push(cosineRanks(index, qvec));

  // RRF fusion (a single ranking keeps its own order)
  const rrf = new Map();
  for (const ranks of rankings) {
    ranks.forEach((r, rank) => rrf.set(r.i, (rrf.get(r.i) || 0) + 1 / (RRF_K + rank + 1)));
  }
  const fused = [...rrf.entries()].sort((a, b) => b[1] - a[1]);

  const perDoc = new Map();
  const out = [];
  for (const [i, score] of fused) {
    const c = index.chunks[i];
    const seen = perDoc.get(c.docId) || 0;
    if (seen >= PER_DOC) continue;
    perDoc.set(c.docId, seen + 1);
    out.push({ docId: c.docId, heading: c.heading, text: c.text, score });
    if (out.length >= k) break;
  }
  return out;
}
