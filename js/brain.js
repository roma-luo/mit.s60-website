/* Brain — static, client-side brain: canned intents + memory retrieval.
 * Works on any static host with no backend. (Optional live mode: ollama.js.)
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
      match: /who are you|what are you|your name|who is \w+|where do you (study|go)|harvard|\bgsd\b|media lab|\bmit\b/i,
      docIds: ['self']
    },
    {
      match: /about (this|the) (site|website|page)|what is this|how (do|does) (you|this) work/i,
      docIds: ['about']
    },
    // single-idea rules come BEFORE the all-ideas rule: "idea 2" must not
    // fan out into three cards
    {
      match: /idea\s*(1|one|first)\b/i,
      docIds: ['fp-1']
    },
    {
      match: /idea\s*(2|two|second)\b/i,
      docIds: ['fp-2']
    },
    {
      match: /idea\s*(3|three|third)\b/i,
      docIds: ['fp-3']
    },
    {
      match: /(three|3|all|every)\s+(final\s+)?(project\s+)?ideas?|final project|project ideas|project proposal/i,
      docIds: ['fp-1', 'fp-2', 'fp-3'],
      text: "I have three final project directions in memory. Here they are, side by side."
    },
    {
      match: /week\s*1|week\s*one|first week/i,
      docIds: ['week1']
    }
  ];

  async function answer(query) {
    for (const c of canned) {
      if (!c.match.test(query)) continue;
      const text = typeof c.text === 'function' ? c.text() : c.text;
      if (c.docIds) {
        const entries = c.docIds.map(Memory.byId).filter(Boolean);
        if (entries.length) return { text: text || entries[0].answer, docIds: entries.map(e => e.id) };
      }
      return { text, docIds: [] };
    }

    const hits = Memory.search(query);
    if (hits.length > 0 && hits[0].score >= 3) {
      // every hit close to the top score (>= 3 and >= 60% of it), max 3
      const top = hits[0].score;
      const best = hits.filter(h => h.score >= 3 && h.score >= top * 0.6).slice(0, 3);
      if (best.length > 1) {
        return {
          text: "I found " + best.length + " memories that fit. Here they are.",
          docIds: best.map(h => h.entry.id)
        };
      }
      return { text: best[0].entry.answer, docIds: [best[0].entry.id] };
    }
    if (hits.length > 0) {
      const e = hits[0].entry;
      return { text: "The closest memory I have is " + e.title + ". Let me pull it out for you.", docIds: [e.id] };
    }
    return {
      text: "That memory is not in me yet. Try asking about week one, or the final project ideas. You can also type /index to see everything I know.",
      docIds: []
    };
  }

  return { answer };
})();
