/* Memory — the agent's memory vault: manifest registry + document fetch
 * + keyword search. Display is owned by UI (main.js).
 *
 *   await Memory.load()          — fetch content/manifest.json
 *   Memory.search(query)         — scored entries, best first: [{entry, score}]
 *   Memory.byId(id)
 *   Memory.label(entry)        — display label ("WEEK 01"), entry.label or derived
 *   await Memory.fetchDoc(entry) — markdown source (cached)
 *   await Memory.firstImage(entry) — first ![..](src) of the doc, resolved
 *                                    against the doc's own URL (or null)
 */
const Memory = (() => {
  let entries = [];
  let persona = {};
  const docCache = {};

  async function load() {
    const res = await fetch('content/manifest.json');
    if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
    const data = await res.json();
    entries = data.entries;
    persona = data.persona || {};
    return entries;
  }

  function byId(id) {
    return entries.find(e => e.id === id) || null;
  }

  // display label for child-node titles: entry.label when present, else the
  // title part before "—", uppercased, trailing number zero-padded ("Week 1"
  // → "WEEK 01") — new memories work without an explicit label
  function label(entry) {
    if (entry.label) return entry.label;
    const base = (entry.title.split('—')[0] || entry.title).trim().toUpperCase();
    return base.replace(/(\d+)\s*$/, m => m.padStart(2, '0'));
  }

  async function fetchDoc(entry) {
    if (!docCache[entry.id]) {
      const res = await fetch(entry.file);
      if (!res.ok) throw new Error('doc fetch failed: ' + entry.file);
      docCache[entry.id] = await res.text();
    }
    return docCache[entry.id];
  }

  // first ![alt](src) in the document; relative paths resolve against the
  // md file's own directory (subpath-safe via document.baseURI)
  async function firstImage(entry) {
    try {
      const md = await fetchDoc(entry);
      const m = md.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
      if (!m) return null;
      return new URL(m[1], new URL(entry.file, document.baseURI)).href;
    } catch (e) { return null; }
  }

  // CJK runs get bigrams; latin text gets words.
  function tokens(q) {
    q = q.toLowerCase();
    const words = q.match(/[a-z0-9']+/g) || [];
    const bigrams = [];
    for (const run of q.match(/[　-鿿豈-﫿]+/g) || []) {
      if (run.length === 1) bigrams.push(run);
      for (let i = 0; i < run.length - 1; i++) bigrams.push(run.slice(i, i + 2));
    }
    return { q, words, bigrams };
  }

  function search(query) {
    const { q, words, bigrams } = tokens(query);
    const scored = [];
    for (const e of entries) {
      let score = 0;
      for (const kw of e.keywords || []) {
        if (q.includes(kw.toLowerCase())) score += 3;
      }
      for (const tag of e.tags || []) {
        const t = tag.toLowerCase();
        if (q.includes(t) || words.includes(t) || bigrams.includes(t)) score += 2;
      }
      for (const w of e.title.toLowerCase().split(/[^a-z0-9']+/)) {
        if (w.length > 2 && words.includes(w)) score += 1;
      }
      if (score > 0) scored.push({ entry: e, score });
    }
    return scored.sort((a, b) => b.score - a.score);
  }

  return {
    load, search, byId, fetchDoc, firstImage, label,
    get entries() { return entries; },
    get persona() { return persona; }
  };
})();
