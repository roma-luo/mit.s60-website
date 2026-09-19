/* Rag — vector memory for live mode. Memory docs are embedded locally via
 * Ollama (nomic-embed-text) at startup; retrieval is cosine similarity.
 * Static mode never touches this — it keeps using Memory.search (keywords).
 *
 *   await Rag.init()             — embed every manifest doc (call once)
 *   await Rag.search(query, k=3) — [{ entry, score }]
 */
const Rag = (() => {
  const HOST = 'http://localhost:11434';
  const EMBED_MODEL = 'nomic-embed-text';
  const MAX_BODY = 2000;
  const vectors = []; // { entry, vec }
  let ready = false;

  async function embed(input) {
    const res = await fetch(HOST + '/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input })
    });
    if (!res.ok) throw new Error('embed http ' + res.status);
    return (await res.json()).embeddings;
  }

  async function init() {
    const texts = [];
    for (const e of Memory.entries) {
      const body = await Memory.fetchDoc(e);
      texts.push(e.title + '\n' + (e.answer || '') + '\n' + body.slice(0, MAX_BODY));
    }
    const embs = await embed(texts);
    for (let i = 0; i < Memory.entries.length; i++) {
      vectors.push({ entry: Memory.entries[i], vec: embs[i] });
    }
    ready = true;
  }

  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = a => Math.sqrt(dot(a, a));

  async function search(query, k = 3) {
    if (!ready) throw new Error('rag not initialised');
    const [qv] = await embed([query]);
    const nq = norm(qv);
    return vectors
      .map(v => ({ entry: v.entry, score: dot(qv, v.vec) / (nq * norm(v.vec) || 1) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  return { init, search, get ready() { return ready; } };
})();
