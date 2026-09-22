# MAS S60 — Digital Self (course website)

The website *is* the agent: a face, a voice, and a memory vault containing
every week of course work. Static front end (no build step, no dependencies)
+ two serverless API routes for the live brain.

## Run locally

The site fetches `content/manifest.json`, so it must be served over HTTP
(opening `index.html` via `file://` will not work):

```bash
cd s60-webpage
python -m http.server 8000
# open http://localhost:8000  (static brain)
```

For the live brain locally, use `vercel dev` so the API routes work, and
fill `.env` (see `.env.example`) with `DEEPSEEK_API_KEY` (generation, via
`/api/chat`) and `OPENAI_API_KEY` (embeddings, via `/api/recall`; optional —
without it recall runs BM25-only). For a relay/aggregator OpenAI key, also
set `OPENAI_BASE_URL` (and optionally `OPENAI_EMBED_MODEL`).

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
  double-click empty space to reset the view. When the graph grows past the
  viewport the whole canvas smoothly zooms out instead. Under 700px the page
  falls back to native vertical scrolling.
- `/index` or the tiny dot at bottom-right opens a card grid of every memory;
  click a card to load it into OUTPUT + a child node (no speech).
  `Esc` stops speech and folds expanded cards back.
- Mic button = speech input (Chrome only).
- Online (the Vercel deployment) the default brain is **live** (cloud API);
  locally it stays the static brain. `?brain=static` forces the static,
  no-network mode anywhere. If the live brain fails it silently falls back
  to static (and disables itself for the session on hosts with no backend).
- Desktop: mouse wheel zooms, trackpad two-finger pans, pinch zooms, drag empty
  space to pan, double-click empty space (or `0`) to re-fit, `+`/`-` to zoom.

## Live brain mode (cloud API agent loop)

Open the site on the Vercel deployment (or `vercel dev` locally). This is a
hand-written agent loop (no frameworks):

- the **harness** (system prompt) carries only the persona — name, affiliation,
  style — plus the tool protocol. No course content is stuffed into context.
- the agent acts in a loop: it calls `recall(query)` to search its long-term
  memory and `show(id)` / `show(ids:[..])` to pull documents out for the
  visitor, then answers in plain text when it has enough. Max 4 steps.
- **retrieval** is server-side: `POST /api/recall` fuses BM25 (always) with
  vector cosine (OpenAI `text-embedding-3-small`, when `OPENAI_API_KEY` is
  set) via Reciprocal Rank Fusion over a build-time chunk index; generation
  is DeepSeek via `POST /api/chat`.
- any failure (API down, keys missing, rate limit) falls back to keyword
  search / the static brain.

## Add a memory (new week / new document)

1. Write `content/<section>/<file>.md` with front matter on top:

   ```md
   ---
   id: week2
   label: WEEK 02
   title: Week 2 — …
   section: week 2
   answer: A one-paragraph spoken summary the agent can read aloud if the API is down.
   tags: [week2, …]
   ---
   ```

   Every field is optional: `id` defaults to the file slug, `label`/`title`/
   `answer` are derived from the document. Optional `attachments: [file.mp4]`
   (paths relative to the doc) spawn small playable video cards next to the
   document's card.
2. Run `npm run build:index` (or just push — Vercel runs it as the build
   command). This regenerates `content/manifest.json` **and** the search
   index `content/index.json` (chunks + vectors when `OPENAI_API_KEY` is
   set, BM25-only otherwise; incremental — only changed chunks re-embed).
3. Done. No manifest edits, no keyword lists, no brain-rule changes.

Who the digital self *is* lives in `content/persona.json`.

## Deploy

- **Vercel** (primary): `vercel.json` sets `buildCommand: npm run
  build:index`, so the manifest + index are regenerated on every deploy.
  Set `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` in the project env.
- **GitHub Pages / any static host**: no API routes there — the site runs
  fully on the committed `content/manifest.json` + the static brain.
  `CNAME` points the subdomain.

## Structure

```
index.html          single page: pannable canvas, node cards, wires svg, children column
css/main.css        node-graph theme: design tokens, beveled cards, wires, child nodes
js/canvas.js        canvas pan + auto-fit zoom-out, clamp, auto-reveal
js/face.js          procedural face renderer (fallback when video clips are missing)
js/facevideo.js     video face renderer (assets/idle.mp4 + assets/talking.mp4 loops)
js/voice.js         TTS mouth-driving + chunked speech + optional STT
js/brain.js         static fallback brain (canned + keyword search)
js/agentloop.js     shared hand-written agent loop (recall/show tools)
js/apibrain.js      live mode: DeepSeek via /api/chat, recall via /api/recall
js/memory.js        manifest + persona loader, keyword search, document fetch
js/markdown.js      minimal md→html (tables, blockquotes), zero dependencies
js/agent.js         conversation state machine
js/main.js          boot + UI (nodes, wires, children, typewriter reveal)
api/chat.js         serverless proxy: DeepSeek chat completions
api/recall.js       serverless search: BM25 + vector RRF over content/index.json
lib/                embed.js (OpenAI query vectors), index.js (index loader),
                    search.js (hybrid retrieval), tokens.js (shared tokenizer)
scripts/build-index.mjs   generates content/manifest.json + content/index.json
content/            the memory vault: persona.json, front-matter .md docs,
                      generated manifest.json / index.json / .embed-cache.json
```
