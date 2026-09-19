/* Brain — static, client-side brain: canned intents + memory retrieval.
 * Works on any static host with no backend. (Optional live mode: ollama.js.)
 *
 *   await Brain.answer(query) → { text } | { text, docId } | { command }
 */
const Brain = (() => {
  const canned = [
    {
      match: /^(hi|hello|hey|yo|greetings|good\s(morning|afternoon|evening))\b/i,
      text: () => "Hey. I am the digital self of " + Memory.persona.name + ". Everything he has done in this course lives in me as memory. Ask me about a specific week, or about the final project ideas — or type /index to see everything I know."
    },
    {
      match: /who are you|what are you|your name|who is \w+|where do you (study|go)|harvard|\bgsd\b|media lab|\bmit\b/i,
      docId: 'self'
    },
    {
      match: /about (this|the) (site|website|page)|what is this|how (do|does) (you|this) work/i,
      docId: 'about'
    },
    {
      match: /final project|project ideas|project proposal/i,
      docId: 'fp-1',
      text: "I have three final project directions in memory. Pulling up the first one — you can also ask for idea two or idea three."
    },
    {
      match: /week\s*1|week\s*one|first week/i,
      docId: 'week1'
    }
  ];

  async function answer(query) {
    for (const c of canned) {
      if (!c.match.test(query)) continue;
      const text = typeof c.text === 'function' ? c.text() : c.text;
      if (c.docId) {
        const e = Memory.byId(c.docId);
        if (e) return { text: text || e.answer, docId: e.id };
      }
      return { text };
    }

    const hits = Memory.search(query);
    if (hits.length > 0 && hits[0].score >= 3) {
      const e = hits[0].entry;
      return { text: e.answer, docId: e.id };
    }
    if (hits.length > 0) {
      const e = hits[0].entry;
      return { text: "The closest memory I have is " + e.title + ". Let me pull it out for you.", docId: e.id };
    }
    return {
      text: "That memory is not in me yet. Try asking about week one, or the final project ideas. You can also type /index to see everything I know."
    };
  }

  return { answer };
})();
