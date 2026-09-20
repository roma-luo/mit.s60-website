/* Agent — conversation state machine.
 * idle → listening → thinking → speaking → (showing) → idle
 *
 *   Agent.handle(query)  — a new query interrupts the current round (B4):
 *                          speech stops, the pending doc timer is cleared
 *                          (B3), and the new round starts immediately.
 *   Agent.cancel()       — Esc: same interrupt, then back to idle.
 *   Agent.setState(st)   — drives Face and UI together (§6).
 * busy is reset in try/finally (B2); voice.js additionally carries a
 * watchdog for browsers that never fire SpeechSynthesis onend.
 */
const Agent = (() => {
  let busy = false;
  let round = 0;
  let docTimer = null;
  let interruptResolve = null;

  function setState(st) {
    Face.setState(st);
    UI.setState(st);
  }

  // Supersede whatever is happening: stop speech, cancel the pending doc
  // overlay (B3), and release any round still awaiting its speech end.
  function interrupt() {
    round++;
    Voice.stop();
    if (docTimer) { clearTimeout(docTimer); docTimer = null; }
    if (interruptResolve) { interruptResolve(); interruptResolve = null; }
  }

  function cancel() {
    interrupt();
    Face.setMouth(0);
    setState('idle');
  }

  async function handle(query) {
    query = (query || '').trim();
    if (!query) return;

    interrupt(); // B4: interrupt-priority — never silently drop a new query
    if (query === '/index') { UI.showIndex(); return; }

    busy = true;
    const myRound = round;
    let res = null;
    try {
      setState('thinking');
      UI.setLastQuery(query);

      const liveBrain = DeepseekBrain.enabled ? DeepseekBrain
                      : OllamaBrain.enabled ? OllamaBrain
                      : null;
      if (liveBrain) {
        try { res = await liveBrain.answer(query); }
        catch (err) { console.warn('live brain failed, falling back to static brain:', err); }
      }
      if (!res) {
        try { res = await Brain.answer(query); }
        catch (err) {
          console.error(err);
          res = { text: "Something went wrong inside my head. Try again." };
        }
      }
      if (myRound !== round) return; // superseded while thinking

      const entry = res.docId ? Memory.byId(res.docId) : null;
      setState('speaking');
      UI.setAnswer(res, entry);

      // the agent "pulls the document out of its memory" shortly after it
      // starts speaking; Esc or a new query clears this timer (B3)
      if (entry) docTimer = setTimeout(() => { docTimer = null; UI.openDoc(entry); }, 900);

      await Promise.race([
        new Promise(resolve => Voice.speak(res.text, {
          onViseme: v => Face.setMouth(v),
          onEnd: resolve
        })),
        new Promise(resolve => { interruptResolve = resolve; })
      ]);
      if (myRound !== round) return; // superseded while speaking

      Face.setMouth(0);
      setState(res.docId ? 'showing' : 'idle');
    } finally {
      // B2: error, interrupt or missing onend — the agent never stays busy
      // and no doc timer outlives its round.
      if (myRound === round) {
        if (docTimer) { clearTimeout(docTimer); docTimer = null; }
        busy = false;
      }
    }
  }

  return { handle, cancel, setState };
})();
