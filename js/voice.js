/* Voice — browser TTS (SpeechSynthesis) driving Face mouth, optional STT input.
 *
 *   Voice.speak(text, { onViseme(v), onBoundary({charIndex}), onEnd() })
 *     Long text is split into <=200-char chunks spoken in sequence — Chrome
 *     desktop silently stops non-local voices mid-utterance after ~15s (B7).
 *     onBoundary reports the cumulative char index across chunks (for the
 *     typewriter reveal). A watchdog forces onEnd when the browser never
 *     fires it (Safari / Chrome after cancel() or before voices load) (B2).
 *   Voice.listen({ onResult(text), onEnd() }) → bool supported
 *   Voice.stop()
 */
const Voice = (() => {
  let speaking = false;
  let fallbackTimer = null;
  let watchdogTimer = null;
  let generation = 0;   // bumped by stop()/done(): invalidates stale callbacks
  let voiceCache = [];

  function cacheVoices() {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) voiceCache = v;
  }
  // B8: Chrome loads voices asynchronously — cache them as soon as they arrive
  cacheVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = cacheVoices;

  function pickVoice() {
    const voices = voiceCache.length ? voiceCache : window.speechSynthesis.getVoices();
    // B6: word boundaries + exclude /female/ — "Female" contains "male"
    return voices.find(v => /^en/i.test(v.lang) && /\b(male|david|daniel|alex|fred)\b/i.test(v.name) && !/female/i.test(v.name))
        || voices.find(v => /^en/i.test(v.lang))
        || null;
  }

  // B7: split at sentence ends (. ? ! newline), then at word boundaries, <=200 chars
  function chunkText(text) {
    const MAX = 200;
    const chunks = [];
    const pieces = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    let buf = '';
    for (let piece of pieces) {
      while (piece.length > 0) {
        const room = MAX - buf.length;
        if (piece.length <= room) { buf += piece; break; }
        let cut = piece.lastIndexOf(' ', room);
        if (cut <= 0) cut = room; // no space within reach: hard cut
        buf += piece.slice(0, cut);
        piece = piece.slice(cut).replace(/^\s+/, '');
        if (buf.trim()) chunks.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks.length ? chunks : [text];
  }

  function speak(text, { onViseme, onBoundary, onEnd } = {}) {
    stop();
    const gen = ++generation;
    const chunks = chunkText(text);
    const voice = pickVoice();
    let idx = 0;
    let charOffset = 0;
    let gotBoundary = false;

    const isCurrent = () => gen === generation;

    const pulse = () => {
      if (onViseme) onViseme(0.55 + Math.random() * 0.45);
      setTimeout(() => { if (speaking && isCurrent() && onViseme) onViseme(0.08); }, 110 + Math.random() * 90);
    };

    const done = () => {
      if (!isCurrent()) return;
      generation++; // invalidate any queued chunk callbacks
      speaking = false;
      window.speechSynthesis.cancel();
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
      if (onViseme) onViseme(0);
      if (onEnd) onEnd();
    };

    speaking = true;

    const speakNext = () => {
      if (!isCurrent() || !speaking) return;
      if (idx >= chunks.length) { done(); return; }
      const chunk = chunks[idx];
      // watchdog re-arms per chunk (~120ms/char + 4s slack) instead of one
      // whole-text estimate, which cut long answers off mid-speech
      if (watchdogTimer) clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(done, chunk.length * 120 + 4000);
      const offset = charOffset;
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.pitch = 0.95;
      u.onboundary = ev => {
        gotBoundary = true;
        pulse();
        if (onBoundary) onBoundary({ charIndex: offset + (ev.charIndex || 0) });
      };
      u.onstart = () => {
        setTimeout(() => {
          if (speaking && isCurrent() && !gotBoundary && !fallbackTimer) {
            fallbackTimer = setInterval(pulse, 170);
          }
        }, 600);
      };
      u.onend = () => {
        if (!isCurrent()) return;
        charOffset += chunk.length + 1; // +1 for the trimmed split delimiter
        idx++;
        speakNext();
      };
      u.onerror = () => { if (isCurrent()) done(); };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  }

  function stop() {
    generation++;
    window.speechSynthesis.cancel();
    speaking = false;
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
    if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
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
