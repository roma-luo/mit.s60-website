/* Voice — browser TTS (SpeechSynthesis) driving Face mouth, optional STT input.
 *
 *   Voice.speak(text, { onViseme(v), onEnd() })
 *     onViseme receives mouth openness 0..1; uses boundary events when the
 *     browser provides them, otherwise falls back to a pulse timer.
 *   Voice.listen({ onResult(text), onEnd() }) → bool supported
 *   Voice.stop()
 */
const Voice = (() => {
  let speaking = false;
  let fallbackTimer = null;

  function pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => /^en/i.test(v.lang) && /male|david|daniel|alex|fred/i.test(v.name))
        || voices.find(v => /^en/i.test(v.lang))
        || null;
  }

  function speak(text, { onViseme, onEnd } = {}) {
    stop();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.0;
    u.pitch = 0.95;

    let gotBoundary = false;
    const pulse = () => {
      if (onViseme) onViseme(0.55 + Math.random() * 0.45);
      setTimeout(() => { if (speaking && onViseme) onViseme(0.08); }, 110 + Math.random() * 90);
    };

    u.onboundary = () => { gotBoundary = true; pulse(); };
    u.onstart = () => {
      speaking = true;
      setTimeout(() => {
        if (speaking && !gotBoundary) fallbackTimer = setInterval(pulse, 170);
      }, 600);
    };
    const done = () => {
      speaking = false;
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      if (onViseme) onViseme(0);
      if (onEnd) onEnd();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  function stop() {
    window.speechSynthesis.cancel();
    speaking = false;
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function listen({ onResult, onEnd } = {}) {
    if (!SR) return false;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = e => { if (onResult) onResult(e.results[0][0].transcript); };
    rec.onerror = () => { if (onEnd) onEnd(); };
    rec.onend = () => { if (onEnd) onEnd(); };
    rec.start();
    return true;
  }

  return { speak, stop, listen, sttSupported: !!SR };
})();
