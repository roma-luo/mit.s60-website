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

- The screen shows only the face. Press any key (or click the face) to reveal
  the input bar; type a question, hit Enter.
- Ask: *"what did you do in week 1"*, *"final project ideas"*, *"who are you"*.
- The agent answers aloud and **pulls the matching document out of its memory**
  (panel on the right).
- `/index` or the tiny dot at bottom-right opens a plain index of all content
  (grader fallback). `Esc` closes panels and stops speech.
- Mic button = speech input (Chrome only).

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
index.html          single page: canvas face + memory panel + input bar
css/main.css        dark minimal theme
js/face.js          procedural face renderer (swap point for 3D/video later)
js/voice.js         TTS mouth-driving + optional STT
js/brain.js         static intent/retrieval brain
js/rag.js           vector memory: embeddings + cosine search (live mode)
js/ollama.js        live mode: hand-written agent loop (recall/show tools)
js/memory.js        manifest loader, search, pull-out panel
js/markdown.js      minimal md→html, zero dependencies
js/agent.js         conversation state machine
js/main.js          boot + wiring
content/            the memory vault (manifest.json + markdown docs)
```
