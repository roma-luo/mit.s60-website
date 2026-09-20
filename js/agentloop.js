/* AgentLoop — the shared hand-written tool-calling agent loop.
 * Used by OllamaBrain (local, ?brain=ollama) and DeepseekBrain (cloud,
 * ?brain=deepseek); each brain only supplies its own chat(messages)
 * transport. The harness carries ONLY the persona + tool protocol;
 * all course content lives in memory and the agent retrieves it itself.
 *
 *   await AgentLoop.answer(query, chat) → { text, docId? }
 */
const AgentLoop = (() => {
  const MAX_STEPS = 4;

  function systemPrompt() {
    const p = Memory.persona;
    return [
      "You are the digital self of " + p.name + ", a student at " + p.affiliation + ", cross-registered for " + p.course + ".",
      "His course memories live in your long-term memory; you do NOT carry them in this prompt.",
      "Style: " + p.style + ", 2-4 sentences.",
      "Never use em dashes (the characters — or –) in your replies. Use commas, periods, or parentheses instead.",
      "",
      "To act, reply with ONLY one JSON object on a single line:",
      '{"tool": "recall", "query": "<search terms>"} — search your long-term memory',
      '{"tool": "show", "id": "<memory id>"} — pull that document out for the visitor',
      "When you have enough to answer, reply in plain text (no JSON).",
      "Recall at least once before answering questions about the course.",
      "If your answer is about a specific memory (a week, a project idea), call show with its id BEFORE giving the plain-text answer."
    ].join('\n');
  }

  function parseToolCall(text) {
    const m = text.match(/\{[^{}]*"tool"[^{}]*\}/);
    if (!m) return null;
    try {
      const call = JSON.parse(m[0]);
      if (call.tool === 'recall' || call.tool === 'show') return call;
    } catch (e) { /* not valid JSON → treat as final answer */ }
    return null;
  }

  async function runRecall(q) {
    const hits = Rag.ready
      ? await Rag.search(q, 3)
      : Memory.search(q).slice(0, 3);
    if (!hits.length) return '(nothing found in memory)';
    const parts = [];
    for (const h of hits) {
      const e = h.entry;
      const body = await Memory.fetchDoc(e);
      parts.push(`[id: ${e.id}] ${e.title}\n${e.answer}\n${body.slice(0, 600)}`);
    }
    return parts.join('\n---\n');
  }

  async function answer(query, chat) {
    const messages = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: query }
    ];
    let docId = null;
    let lastText = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const text = await chat(messages);
      const call = parseToolCall(text);
      if (!call) return { text, docId };

      lastText = text;
      messages.push({ role: 'assistant', content: text });

      if (call.tool === 'recall') {
        const result = await runRecall(call.query || query);
        messages.push({ role: 'user', content: 'TOOL RESULT (recall):\n' + result });
      } else if (call.tool === 'show') {
        if (Memory.byId(call.id)) {
          docId = call.id;
          messages.push({ role: 'user', content: 'TOOL RESULT (show): "' + call.id + '" is now displayed to the visitor.' });
        } else {
          messages.push({ role: 'user', content: 'TOOL RESULT (show): no memory with id "' + call.id + '". Pick an id from recall results.' });
        }
      }
    }

    // out of steps: force a plain answer
    messages.push({ role: 'user', content: 'Answer the visitor directly now, in plain text, no tools.' });
    const text = await chat(messages);
    return { text: text || lastText || 'Give me a second…', docId };
  }

  return { answer };
})();
