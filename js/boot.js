/* Boot v2 — real loading progress for the entry overlay. The overlay's
 * markup, critical CSS, suppression check and skip/failsafe bootstrap are
 * INLINE in index.html, so it paints on the first frame even if every later
 * script errors. This file only preloads the real assets (fully, so they
 * land in HTTP cache) and advances the bar honestly: width = done/total,
 * failed assets advance too, a 6s progress stall still finishes, minimum
 * on-screen time ~900ms. Self-starts at parse time.
 *
 *   Boot.play() → {} | null (suppressed)
 */
const Boot = (() => {
  const ASSETS = [
    'content/manifest.json',
    'content/persona.json',
    'content/index.json',
    'assets/logo.png',
    'assets/idle.mp4',
    'assets/talking.mp4'
  ];
  const MIN_MS = 900;
  const STALL_MS = 6000;

  function play() {
    const el = document.getElementById('boot');
    if (!el || document.documentElement.dataset.boot === 'off') return null;
    const bar = document.getElementById('boot-bar');
    const t0 = Date.now();
    let done = 0;
    let stall = null;
    const finish = () => { if (window.__bootFinish) window.__bootFinish(); };
    const rearm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(finish, STALL_MS); // no progress for 6s → never hang
    };
    rearm();

    const advance = () => {
      done += 1;
      if (bar) bar.style.width = Math.round((done / ASSETS.length) * 100) + '%';
      rearm();
    };
    const jobs = ASSETS.map(u =>
      fetch(u)
        .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
        .catch(() => null)          // a failed asset still advances the bar
        .then(advance)
    );
    Promise.all(jobs).then(() => {
      if (stall) clearTimeout(stall);
      const wait = Math.max(0, MIN_MS - (Date.now() - t0));
      setTimeout(finish, wait);
    });
    return {};
  }

  return { play };
})();

// preloading starts before any later script runs
Boot.play();
