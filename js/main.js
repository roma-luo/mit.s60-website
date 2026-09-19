/* main — boot and UI wiring. Exposes the UI helper object used by Agent. */

const UI = (() => {
  const $ = id => document.getElementById(id);
  let subtitleTimer = null;

  function showInput() {
    $('input-bar').classList.remove('hidden');
    requestAnimationFrame(() => $('input-bar').classList.add('visible'));
    $('query').focus();
  }
  function hideInput() {
    $('input-bar').classList.remove('visible');
  }
  function showSubtitle(text) {
    const el = $('subtitle');
    el.textContent = text;
    el.classList.add('visible');
    if (subtitleTimer) clearTimeout(subtitleTimer);
  }
  function fadeSubtitle() {
    if (subtitleTimer) clearTimeout(subtitleTimer);
    subtitleTimer = setTimeout(hideSubtitle, 3500);
  }
  function hideSubtitle() {
    $('subtitle').classList.remove('visible');
  }

  function showIndex() {
    buildIndex();
    $('index-overlay').classList.remove('hidden');
    Voice.stop();
    Face.setMouth(0);
    Face.setState('idle');
  }
  function hideIndex() {
    $('index-overlay').classList.add('hidden');
  }

  function buildIndex() {
    const list = $('index-list');
    list.innerHTML = '';
    let lastSection = null;
    for (const e of Memory.entries) {
      if (e.section !== lastSection) {
        lastSection = e.section;
        const label = document.createElement('div');
        label.className = 'section-label';
        label.textContent = lastSection;
        list.appendChild(label);
      }
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = e.title;
      a.onclick = ev => {
        ev.preventDefault();
        hideIndex();
        Memory.showPanel(e);
        Face.setState('showing');
      };
      list.appendChild(a);
    }
  }

  function setStateHint() { /* reserved: subtle UI cue per agent state */ }

  return { showInput, hideInput, showSubtitle, fadeSubtitle, hideSubtitle, showIndex, hideIndex, setStateHint };
})();

window.addEventListener('DOMContentLoaded', async () => {
  if (typeof FaceVideo !== 'undefined' && await FaceVideo.available()) {
    Face = FaceVideo; // swap point: video loops replace the procedural face
    console.info('face renderer: video loops');
  } else {
    console.info('face renderer: procedural canvas (video clips not found)');
  }
  Face.init(document.getElementById('face'));

  try {
    await Memory.load();
  } catch (err) {
    console.error(err);
    document.getElementById('subtitle').textContent =
      'my memory failed to load — serve this folder over http (see README)';
    document.getElementById('subtitle').classList.add('visible');
    return;
  }

  if (OllamaBrain.enabled) {
    console.info('live brain mode: ollama');
    Rag.init()
      .then(() => console.info('vector memory ready (' + Memory.entries.length + ' memories)'))
      .catch(err => console.warn('vector memory unavailable, agent will use keyword search:', err));
  }

  const input = document.getElementById('query');

  // first keypress or click on the face reveals the input bar
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      UI.hideIndex();
      Memory.hidePanel();
      Voice.stop();
      Face.setMouth(0);
      Face.setState('idle');
      return;
    }
    if (ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey) {
      UI.showInput();
    }
  });
  // click anywhere except interactive UI reveals/focuses the input bar
  window.addEventListener('click', ev => {
    if (ev.target.closest('#input-bar, #memory-panel, #index-overlay, #index-dot')) return;
    UI.showInput();
  });

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      const q = input.value;
      input.value = '';
      Agent.handle(q);
    }
  });

  const micBtn = document.getElementById('mic-btn');
  if (!Voice.sttSupported) {
    micBtn.style.display = 'none';
  } else {
    micBtn.addEventListener('click', () => {
      micBtn.classList.add('listening');
      Face.setState('listening');
      Voice.listen({
        onResult: text => { input.value = text; },
        onEnd: () => {
          micBtn.classList.remove('listening');
          Face.setState('idle');
          if (input.value.trim()) {
            const q = input.value;
            input.value = '';
            Agent.handle(q);
          }
        }
      });
    });
  }

  document.getElementById('index-dot').addEventListener('click', () => UI.showIndex());
  document.getElementById('index-overlay').addEventListener('click', () => UI.hideIndex());
  document.getElementById('memory-close').addEventListener('click', () => {
    Memory.hidePanel();
    Face.setState('idle');
  });
});
