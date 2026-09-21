/* embed.js — query embedding for /api/recall. Defaults to official OpenAI
 * (text-embedding-3-small, dims 512, same as the build-time index); relay /
 * aggregator keys point elsewhere via env:
 *   OPENAI_BASE_URL    base URL of the API (default https://api.openai.com/v1;
 *                      a missing /v1 suffix or trailing slash is normalized)
 *   OPENAI_EMBED_MODEL model name (default text-embedding-3-small)
 * Switching providers means editing this one file. Returns null when
 * OPENAI_API_KEY is not set so callers fall back to BM25-only search. */
const DIMS = 512;

export function embeddingsUrl() {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    .trim().replace(/\/+$/, '');
  return (/\/v1$/.test(base) ? base : base + '/v1') + '/embeddings';
}

export function embedModel() {
  return process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
}

export async function embedQuery(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch(embeddingsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: embedModel(), input: text, dimensions: DIMS })
  });
  if (!res.ok) throw new Error('openai embeddings http ' + res.status);
  const data = await res.json();
  return data.data[0].embedding;
}
