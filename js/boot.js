/* Boot — terminal-style entry sequence, once per browser session, skippable.
 *   Boot.play() → { count(n), abort() } | null (suppressed this session)
 * Lines appear ~90ms apart; the name line holds ~350ms; the overlay fades
 * (.5s) and is removed. Click / any key / Esc jumps straight to the fade.
 * Suppressed when sessionStorage.booted is set or ?brain=static is used.
 * The site renders beneath normally while it plays. */
const Boot = (() => {
  const NAME = 'mit.s60.romaluo.agent';

  function suppressed() {
    try {
      if (sessionStorage.getItem('booted') === '1') return true;
    } catch (e) { /* storage blocked: play anyway */ }
    return /(?:\?|&)brain=static\b/.test(location.search);
  }

  function play() {
    if (suppressed()) return null;
    try { sessionStorage.setItem('booted', '1'); } catch (e) {}

    const el = document.createElement('div');
    el.id = 'boot';
    document.body.appendChild(el);

    const state = { n: null, skipped: false };
    el.addEventListener('click', () => { state.skipped = true; });
    const onKey = () => { state.skipped = true; };
    window.addEventListener('keydown', onKey);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rest = async ms => { // skip-aware sleep
      const t0 = Date.now();
      while (!state.skipped && Date.now() - t0 < ms) await sleep(20);
    };
    const addLine = (text, cls) => {
      const p = document.createElement('p');
      if (cls) p.className = cls;
      p.textContent = text;
      el.appendChild(p);
    };

    (async () => {
      addLine('> harness: online');
      await rest(90);
      while (state.n === null && !state.skipped) await sleep(30); // Memory.load in flight
      if (!state.skipped) addLine('> memory: ' + state.n + ' entries indexed');
      await rest(90);
      if (!state.skipped) addLine('> retrieval: hybrid rrf');
      await rest(90);
      if (!state.skipped) addLine(NAME, 'boot__name');
      await rest(350);                             // hold on the name line
      window.removeEventListener('keydown', onKey);
      el.classList.add('boot--done');              // fade via CSS opacity .5s
      await sleep(500);
      el.remove();
    })();

    return {
      count(n) { state.n = n; },
      abort() { if (state.n === null) state.n = 0; state.skipped = true; }
    };
  }

  return { play };
})();
