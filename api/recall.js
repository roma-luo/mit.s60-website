/* /api/recall — hybrid memory search for the agent loop.
 *   POST { "query": "...", "k": 6 }  →  { hits: [{ docId, heading, text, score }] }
 * Keyless path works too: no OPENAI_API_KEY → BM25-only hits. Any failure
 * returns { hits: [] } (never a 5xx) so the client falls back to keyword
 * search quietly. Naive per-IP rate limit: 30 req/min.
 */
import { loadIndex } from '../lib/index.js';
import { embedQuery } from '../lib/embed.js';
import { search } from '../lib/search.js';

const RATE = 30;
const WINDOW_MS = 60000;
const buckets = new Map();

function limited(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { t: now, n: 0 };
  if (now - b.t > WINDOW_MS) { b.t = now; b.n = 0; }
  b.n += 1;
  buckets.set(ip, b);
  return b.n > RATE;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ hits: [] });
  try {
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'anon')
      .split(',')[0].trim();
    if (limited(ip)) return res.status(429).json({ hits: [] });

    const body = req.body || {};
    const query = String(body.query || '').slice(0, 500).trim();
    if (!query) return res.status(200).json({ hits: [] });
    const k = Math.min(12, Math.max(1, parseInt(body.k, 10) || 6));

    const index = await loadIndex();
    let qvec = null;
    try { qvec = await embedQuery(query); }
    catch (e) { console.warn('recall: embed failed, BM25-only:', e.message); }

    res.status(200).json({ hits: search(index, qvec, query, k) });
  } catch (e) {
    console.error('recall failed:', e);
    res.status(200).json({ hits: [] });
  }
}
