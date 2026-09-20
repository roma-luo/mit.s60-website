# MAS S60 — Digital Self (course website)

The website *is* the agent: a procedural face, a voice, and a memory vault
containing every week of course work. Pure static site — no build step, no
dependencies.

## Run locally

The site fetches `content/manifest.json`, so it must be served over HTTP
(opening `index.html` via `file://` will not work):

```bash
cd s60-webpage
python -m http.server 8000
# open http://localhost:8000
```

## Use it

- The screen is a small node graph on a pannable canvas: **INPUT** (left),
  **SELF** (the portrait window, center — its title-bar dot is the status
  LED), **OUTPUT** (right), connected by bezier wires. The input box is
  always on screen, always ready.
- Type a question, `Enter` to send (`Shift+Enter` = newline, `/` focuses the
  box). Ask: *"what did you do in week 1"*, *"the three project ideas"*,
  *"who are you"*.
- The agent answers aloud while the answer types out in OUTPUT, in sync with
  the voice. Memories it cites appear as **child nodes** to the right of
  OUTPUT, one card each on their own wire — several at once (*"what are the
  three ideas"* → three cards fanned out). `See more` expands a card in
  place; the dot in its title bar dismisses it. No overlays, ever.
- Drag any empty space to pan the canvas (wheel pans too, shift = sideways);
  double-click empty space to reset the view. Under 700px the page falls
  back to native vertical scrolling.
- `/index` or the tiny dot at bottom-right opens a card grid of every memory;
  click a card to load it into OUTPUT + a child node (no speech).
  `Esc` stops speech and folds expanded cards back.
- Mic button = speech input (Chrome only).
- Online (the Vercel deployment) the default brain is **DeepSeek** (live mode);
  locally it stays the static brain unless you append `?brain=ollama` or
  `?brain=deepseek`. If the live brain fails, it silently falls back to the
  static one.

## Live brain mode (local LLM agent loop)

Requires Ollama with two models:

```bash
ollama serve                      # if not already running
ollama pull qwen2.5:7b            # the brain
ollama pull nomic-embed-text      # embeddings for vector memory
```

Open `http://localhost:8000/?brain=ollama`. This is a hand-written agent loop
(no frameworks):

- the **harness** (system prompt) carries only the persona — name, affiliation,
  style — plus the tool protocol. No course content is stuffed into context.
- the agent acts in a loop: it calls `recall(query)` to search its long-term
  memory (vector embeddings + cosine similarity via `nomic-embed-text`, keyword
  search as fallback) and `show(id)` to pull a document out for the visitor,
  then answers in plain text when it has enough. Max 4 steps.
- any failure (Ollama down, embed model missing) falls back to the static
  brain.

If the browser blocks the call (CORS), start Ollama with:

```bash
OLLAMA_ORIGINS="http://localhost:8000" ollama serve
```

## Add a memory (new week / new document)

1. Write `content/<section>/<file>.md`.
2. Register it in `content/manifest.json` — id, title, section, tags,
   keywords, file path, and a one-paragraph spoken `answer`.
3. Done. The brain, the index overlay, and live mode all pick it up.

Who the digital self *is* lives in the `persona` block at the top of
`manifest.json` — both the static brain and live mode read it from there.

## Deploy

Push this folder to the private course GitHub repo, then either:

- **GitHub Pages** (needs GitHub Pro/Student for private repos): Settings →
  Pages → serve from branch root; point your subdomain at
  `<user>.github.io` with a CNAME record and set it in Settings → Pages →
  Custom domain, or
- **Any static host** (Cloudflare Pages / Netlify / your own server): upload
  the folder as-is; point the subdomain's DNS at the host.

## Structure

```
index.html          single page: pannable canvas, node cards, wires svg, children column
css/main.css        node-graph theme: design tokens, cards, wires, child nodes
js/canvas.js        canvas panning: drag / wheel / double-click reset, clamp, auto-reveal
js/face.js          procedural face renderer (fallback when video clips are missing)
js/facevideo.js     video face renderer (assets/idle.mp4 + assets/talking.mp4 loops)
js/voice.js         TTS mouth-driving + chunked speech + optional STT
js/brain.js         static intent/retrieval brain
js/rag.js           vector memory: embeddings + cosine search (live mode)
js/agentloop.js     shared hand-written agent loop (recall/show tools)
js/ollama.js        live mode, local: Ollama transport for the agent loop
js/deepseek.js      live mode, cloud: DeepSeek via /api/chat (default in production)
js/memory.js        manifest loader, keyword search, document fetch
js/markdown.js      minimal md→html (tables, blockquotes), zero dependencies
js/agent.js         conversation state machine
js/main.js          boot + UI (nodes, wires, overlays, typewriter reveal)
api/chat.js         Vercel serverless proxy for DeepSeek (key stays server-side)
content/            the memory vault (manifest.json + markdown docs)
```
