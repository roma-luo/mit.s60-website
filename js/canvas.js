/* Canvas — pannable workspace (§2.3).
 * Drag empty space to pan, wheel to pan (deltaY → y, deltaX / shift+wheel → x),
 * double-click empty space to reset. Clamped so the graph can never be dragged
 * out of view. Disabled under 700px: mobile uses native vertical scrolling.
 *
 *   Canvas.init()
 *   Canvas.pan(dx, dy)
 *   Canvas.setOffset(x, y, animate)
 *   Canvas.get() → { x, y }
 *   Canvas.reveal(el) — minimal pan that brings el fully into view (6vw right margin)
 */
const Canvas = (() => {
  let el = null;
  let graph = null;
  let ox = 0;
  let oy = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  const enabled = () => window.innerWidth >= 700;

  function init() {
    el = document.getElementById('canvas');
    graph = document.getElementById('graph');

    el.addEventListener('pointerdown', ev => {
      if (!enabled() || ev.target.closest('.node')) return; // pan starts on empty space only
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      baseX = ox;
      baseY = oy;
      el.classList.add('panning');
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', ev => {
      if (!dragging) return;
      set(baseX + ev.clientX - startX, baseY + ev.clientY - startY, false);
    });
    const endDrag = () => { dragging = false; el.classList.remove('panning'); };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', ev => {
      if (!enabled()) return;
      if (ev.target.closest('.child__doc')) return; // let the doc scroll internally
      ev.preventDefault();
      const dx = ev.deltaX || (ev.shiftKey ? ev.deltaY : 0);
      const dy = ev.shiftKey ? 0 : ev.deltaY;
      set(ox - dx, oy - dy, false);
    }, { passive: false });

    el.addEventListener('dblclick', ev => {
      if (!enabled() || ev.target.closest('.node')) return;
      setOffset(0, 0, true);
    });

    window.addEventListener('resize', () => set(ox, oy, false)); // re-clamp
  }

  // the graph may not be dragged past the viewport: offset stays within
  // [-(graphW - vw), 0] / [-(graphH - vh), 0]; smaller graphs stay pinned at 0
  function clampXY(x, y) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gw = graph.offsetWidth;
    const gh = graph.offsetHeight;
    const gl = graph.offsetLeft;
    const gt = graph.offsetTop;
    return [
      gw <= vw ? 0 : Math.min(-gl, Math.max(vw - gl - gw, x)),
      gh <= vh ? 0 : Math.min(-gt, Math.max(vh - gt - gh, y))
    ];
  }

  function set(x, y, animate) {
    [ox, oy] = clampXY(x, y);
    el.style.transition = animate ? 'transform .3s ease-out' : 'none';
    el.style.transform = `translate(${ox}px, ${oy}px)`;
  }

  function pan(dx, dy) { set(ox + dx, oy + dy, false); }
  function setOffset(x, y, animate) { set(x, y, !!animate); }
  function get() { return { x: ox, y: oy }; }

  // if any part of el sits outside the viewport, pan the minimum amount
  // that brings it back in (right side keeps a 6vw margin), 300ms ease-out
  function reveal(target) {
    if (!enabled() || !target) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = target.getBoundingClientRect();
    const margin = vw * 0.06;
    let dx = 0;
    let dy = 0;
    if (r.right > vw - margin) dx = (vw - margin) - r.right;
    else if (r.left < 0) dx = -r.left;
    if (r.bottom > vh) dy = vh - r.bottom;
    else if (r.top < 0) dy = -r.top;
    if (dx || dy) set(ox + dx, oy + dy, true);
  }

  return { init, pan, setOffset, get, reveal };
})();
