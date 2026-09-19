/* Agent — conversation state machine.
 * idle → listening → thinking → speaking → (showing) → idle
 *
 *   Agent.handle(query)
 */
const Agent = (() => {
  let busy = false;

  function setState(st) {
    Face.setState(st);
    UI.setStateHint(st);
  }

  async function handle(query) {
    query = (query || '').trim();
    if (!query || busy) return;

    if (query === '/index') { UI.showIndex(); return; }

    busy = true;
    UI.hideInput();
    UI.hideSubtitle();
    setState('thinking');

    let res = null;
    if (OllamaBrain.enabled) {
      try { res = await OllamaBrain.answer(query); }
      catch (err) { console.warn('ollama mode failed, falling back to static brain:', err); }
    }
    if (!res) {
      try { res = await Brain.answer(query); }
      catch (err) {
        console.error(err);
        res = { text: "Something went wrong inside my head. Try again." };
      }
    }

    setState('speaking');
    UI.showSubtitle(res.text);

    let panelTimer = null;
    if (res.docId) {
      const entry = Memory.byId(res.docId);
      if (entry) panelTimer = setTimeout(() => Memory.showPanel(entry), 900);
    }

    Voice.speak(res.text, {
      onViseme: v => Face.setMouth(v),
      onEnd: () => {
        if (panelTimer) clearTimeout(panelTimer);
        Face.setMouth(0);
        setState(res.docId ? 'showing' : 'idle');
        UI.fadeSubtitle();
        UI.showInput();
        busy = false;
      }
    });
  }

  return { handle };
})();
