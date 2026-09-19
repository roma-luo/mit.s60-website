/* Memory — the agent's memory vault: manifest registry + document fetch
 * + keyword search + the "pull out" panel.
 *
 *   await Memory.load()          — fetch content/manifest.json
 *   Memory.search(query)         — scored entries, best first: [{entry, score}]
 *   Memory.byId(id)
 *   await Memory.fetchDoc(entry) — markdown source (cached)
 *   Memory.showPanel(entry) / Memory.hidePanel()
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

  async function fetchDoc(entry) {
    if (!docCache[entry.id]) {
      const res = await fetch(entry.file);
      if (!res.ok) throw new Error('doc fetch failed: ' + entry.file);
      docCache[entry.id] = await res.text();
    }
    return docCache[entry.id];
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

  function showPanel(entry) {
    const panel = document.getElementById('memory-panel');
    document.getElementById('memory-title').textContent = entry.title;
    const content = document.getElementById('memory-content');
    content.innerHTML = '<p>recalling…</p>';
    panel.classList.remove('hidden');
    fetchDoc(entry).then(md => {
      content.innerHTML = Markdown.render(md);
      content.scrollTop = 0;
    }).catch(() => {
      content.innerHTML = '<p>(this memory could not be loaded)</p>';
    });
  }

  function hidePanel() {
    document.getElementById('memory-panel').classList.add('hidden');
  }

  return {
    load, search, byId, fetchDoc, showPanel, hidePanel,
    get entries() { return entries; },
    get persona() { return persona; }
  };
})();
