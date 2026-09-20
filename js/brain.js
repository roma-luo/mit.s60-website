/* Brain — static, client-side brain: the no-API fallback.
 * Works on any static host with no backend. Three canned intents
 * (greeting / show-everything / not-found) + keyword search over the
 * manifest; per-topic regex rules are gone on purpose — memories grow,
 * rules don't scale, and the API path answers those queries anyway.
 *
 *   await Brain.answer(query) → { text, docIds: string[] }
 */
const Brain = (() => {
  const canned = [
    {
      match: /^(hi|hello|hey|yo|greetings|good\s(morning|afternoon|evening))\b/i,
      text: () => "Hey. I am the digital self of " + Memory.persona.name + ". Everything he has done in this course lives in me as memory. Ask me about a specific week, or about the final project ideas — or type /index to see everything I know."
    },
    {
      match: /everything|all (your )?memor|what (do|don't) you know|show (me )?all/i,
      docIds: () => Memory.entries.map(e => e.id),
      text: "Everything I have in memory, side by side."
    }
  ];

  async function answer(query) {
    for (const c of canned) {
      if (!c.match.test(query)) continue;
      const text = typeof c.text === 'function' ? c.text() : c.text;
      if (c.docIds) {
        const ids = typeof c.docIds === 'function' ? c.docIds() : c.docIds;
        const entries = ids.map(Memory.byId).filter(Boolean);
        if (entries.length) return { text, docIds: entries.map(e => e.id) };
      }
      return { text, docIds: [] };
    }

    const hits = Memory.search(query);
    if (!hits.length) {
      return {
        text: "That memory is not in me yet. Try asking about week one, or the final project ideas. You can also type /index to see everything I know.",
        docIds: []
      };
    }
    const top = hits[0].score;
    // several memories scoring close together → fan them all out
    const tied = hits.filter(h => h.score >= Math.max(2, top * 0.6)).slice(0, 3);
    if (tied.length > 1) {
      return {
        text: "I found " + tied.length + " memories that fit. Here they are.",
        docIds: tied.map(h => h.entry.id)
      };
    }
    const e = hits[0].entry;
    if (top >= 3) return { text: e.answer, docIds: [e.id] };
    return { text: "The closest memory I have is " + e.title + ". Let me pull it out for you.", docIds: [e.id] };
  }

  return { answer };
})();
