/* Agent — conversation state machine.
 * idle → listening → thinking → speaking → (showing) → idle
 *
 *   Agent.handle(query)    — a new query interrupts the current round:
 *                            speech stops, pending child spawns are
 *                            cancelled (UI.cancelSpawn), the round starts now.
 *   Agent.cancel()         — Esc: stop speech + spawning, fold expanded
 *                            children back to preview, back to idle.
 *   Agent.setState(st)     — drives Face and UI together.
 *   Agent.showEntry(entry) — index card: OUTPUT + one child node, no speech.
 * Answers carry docIds[]; each becomes a child node on the canvas.
 * busy is reset in try/finally; voice.js additionally carries a watchdog
 * for browsers that never fire SpeechSynthesis onend.
 */
const Agent = (() => {
  let busy = false;
  let round = 0;
  let interruptResolve = null;

  function setState(st) {
    Face.setState(st);
    UI.setState(st);
  }

  // Supersede whatever is happening: stop speech, stop any in-flight child
  // spawn, and release any round still awaiting its speech end.
  function interrupt() {
    round++;
    Voice.stop();
    UI.cancelSpawn();
    if (interruptResolve) { interruptResolve(); interruptResolve = null; }
  }

  function cancel() {
    interrupt();
    UI.finishReveal();   // keep the last answer, fully shown
    UI.collapseChildren(); // cards already out stay, expanded ones fold back
    Face.setMouth(0);
    setState('idle');
  }

  async function handle(query) {
    query = (query || '').trim();
    if (!query) return;

    interrupt(); // interrupt-priority — never silently drop a new query
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
        catch (err) {
          console.warn('live brain failed, falling back to static brain:', err);
          UI.setMode('static'); // reflect the fallback in the INPUT meta Mode row
        }
      }
      if (!res) {
        try { res = await Brain.answer(query); }
        catch (err) {
          console.error(err);
          res = { text: "Something went wrong inside my head. Try again.", docIds: [] };
        }
      }
      if (myRound !== round) return; // superseded while thinking

      const entries = (res.docIds || []).map(Memory.byId).filter(Boolean);
      setState('speaking');
      await UI.setAnswer(res, { reveal: true });
      UI.startReveal(res.text, res.text.length * 85); // uniform fallback pace
      // (~85ms/char ≈ TTS rate); speech boundary events pull revealAnswer to
      // the exact position when the browser provides them
      UI.spawnChildren(entries, myRound); // self-stops if the round is superseded

      await Promise.race([
        new Promise(resolve => Voice.speak(res.text, {
          onViseme: v => Face.setMouth(v),
          onBoundary: ({ charIndex }) => UI.revealAnswer(charIndex),
          onEnd: resolve
        })),
        new Promise(resolve => { interruptResolve = resolve; })
      ]);
      if (myRound !== round) return; // superseded while speaking

      UI.finishReveal();
      Face.setMouth(0);
      setState(entries.length ? 'showing' : 'idle');
    } finally {
      // error, interrupt or missing onend — the agent never stays busy
      if (myRound === round) busy = false;
    }
  }

  // index card picked — OUTPUT shows the answer, one child node appears
  // next to it; no brain, no speech
  async function showEntry(entry) {
    interrupt();
    Face.setMouth(0);
    await UI.setAnswer({ text: entry.answer });
    UI.spawnChildren([entry]);
    setState('showing');
  }

  return { handle, cancel, setState, showEntry };
})();
