/* FaceVideo — video face renderer: pre-generated LivePortrait loops.
 * Same public API as Face (procedural canvas face) — the two are swappable;
 * main.js picks FaceVideo when the clips exist, Face otherwise.
 *
 *   await FaceVideo.available()  — true if assets/idle.mp4 & assets/talking.mp4 exist
 *   FaceVideo.init(container)    — mounts the two video layers into the
 *                                  .portrait element of the SELF node
 *   FaceVideo.setState(mode)     — 'speaking' shows the talking loop, else idle
 *   FaceVideo.setMouth(v) / FaceVideo.lookAt(x, y) — no-ops (API parity)
 */
const FaceVideo = (() => {
  const IDLE = 'assets/idle.mp4';
  const TALKING = 'assets/talking.mp4';
  let layers = {};
  let current = null;

  async function available() {
    try {
      const a = await fetch(IDLE, { method: 'HEAD' });
      const b = await fetch(TALKING, { method: 'HEAD' });
      return a.ok && b.ok;
    } catch (e) { return false; }
  }

  function makeLayer(src, container) {
    const v = document.createElement('video');
    v.src = src;
    v.muted = true;       // voice comes from SpeechSynthesis, clips are silent
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.className = 'face-video';
    container.appendChild(v);
    v.play().catch(() => {});
    return v;
  }

  function init(container) {
    layers.idle = makeLayer(IDLE, container);
    layers.talking = makeLayer(TALKING, container);
    show('idle');
  }

  function show(name) {
    if (current === name) return;
    current = name;
    for (const k of Object.keys(layers)) {
      layers[k].classList.toggle('front', k === name);
    }
  }

  function setState(mode) {
    show(mode === 'speaking' ? 'talking' : 'idle');
  }

  function setMouth() {}
  function lookAt() {}

  return { available, init, setState, setMouth, lookAt };
})();
