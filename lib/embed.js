/* embed.js — query embedding for /api/recall. OpenAI text-embedding-3-small
 * (dims 512, same as the build-time index). Switching providers means
 * editing this one file. Returns null when OPENAI_API_KEY is not set so
 * callers fall back to BM25-only search. */
const MODEL = 'text-embedding-3-small';
const DIMS = 512;

export async function embedQuery(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: MODEL, input: text, dimensions: DIMS })
  });
  if (!res.ok) throw new Error('openai embeddings http ' + res.status);
  const data = await res.json();
  return data.data[0].embedding;
}
