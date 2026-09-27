# MAS S60 — Digital Self (course website)

The website *is* the agent: a face, a voice, and a memory vault containing
every week of course work. Static front end (no build step, no dependencies)
+ two serverless API routes for the live brain.

## Run locally

```bash
cd s60-webpage
npm run dev          # = node scripts/dev-server.mjs, zero dependencies
# open http://localhost:8000  (live brain: DeepSeek)
```

`scripts/dev-server.mjs` serves the static site and mounts `api/chat.js` /
`api/recall.js` directly, so localhost runs the same live brain as
production without `vercel dev`. Fill `.env` (see `.env.example`) with
`DEEPSEEK_API_KEY` (generation, via `/api/chat`) and optionally
`OPENAI_API_KEY` (embeddings, via `/api/recall`; without it recall runs
BM25-only). For a relay/aggregator OpenAI key, also set `OPENAI_BASE_URL`
(and optionally `OPENAI_EMBED_MODEL`). A plain static server
(`python -m http.server`) still works but has no `/api`, so the brain falls
back to static.

## Deploy

- **GitHub Pages** (static): push to the Pages branch. `.nojekyll` is required
  — without it Jekyll renders the front-matter `.md` files under `content/`
  into HTML and every memory card 404s. Pages has no `/api`, so on
  `*.github.io` the site runs the static brain (keyword search over the
  manifest); `?brain=live` forces the API attempt anyway.
- **Vercel** (live brain): `/api/chat` + `/api/recall` run as serverless
  functions; set `DEEPSEEK_API_KEY` (and optionally `OPENAI_API_KEY`) in the
  project settings.

## Use it

- The screen is a board of draggable windows: **s60-in** (input), **s60-self**
  (the portrait window — its title-bar dot is the status LED), **s60-out**
  (answers), wired port to port. The input box is always on screen, always ready.
- Type a question, `Enter` to send (`Shift+Enter` = newline, `/` focuses the
  box). Ask: *"what did you do in week 1"*, *"the three project ideas"*,
  *"who are you"*.
- The agent answers aloud while the answer types out in s60-out, in sync with
  the voice. Memories it cites appear as **child windows** to the right of
  s60-out, one card each on their own wire — several at once (*"what are the
  three ideas"* → three cards). Long texts live in clipped wells with an
  `expand` pill that grows them in place; the dot in a child's title bar
  dismisses it. No overlays, ever.
- Drag any window to move it (it leans and lifts while held); drag empty
  space to pan the board; the mouse wheel zooms around the cursor (trackpad
  pinch too). Bottom-right zoom controls: `−` / percentage (= fit all) / `+`;
  keys Cmd/Ctrl `=` `-` `0` do the same.
- `/index` or the tiny dot at bottom-right opens a card grid of every memory;
  click a card to load it into s60-out + a child window (no speech).
  `Esc` stops speech and folds expanded wells back.
- Mic button = speech input (Chrome only).
- The default brain is **live** (cloud API) both online and locally
  (`npm run dev`). `?brain=static` forces the static,
  no-network mode anywhere. If the live brain fails it silently falls back
  to static (and disables itself for the session on hosts with no backend).

## Live brain mode (cloud API agent loop)

Open the site on the Vercel deployment (or `npm run dev` locally). This is a
hand-written agent loop (no frameworks):

- the **harness** (system prompt) carries only the persona — name, affiliation,
  style. No course content is stuffed into context.
- the agent acts in a loop: it calls `recall(query)` to search its long-term
  memory and `show(ids)` to pull documents out for the visitor, then answers
  in plain text when it has enough. Max 5 steps. Tools use DeepSeek's native
  function calling; the tool schema is fixed server-side in `api/chat.js`, so
  tool syntax never lands in the visible answer.
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
index.html          single page: board stage, three windows, zoom controls
css/main.css        board design system: beveled chassis, wells, pills, wires
js/canvas.js        the board engine: viscous window drag, anchored wheel zoom,
                    pan, fit-all, ports + wires
js/face.js          procedural face renderer (fallback when video clips are missing)
js/facevideo.js     video face renderer (assets/idle.mp4 + assets/talking.mp4 loops)
js/voice.js         TTS mouth-driving + chunked speech + optional STT
js/brain.js         static fallback brain (canned + keyword search)
js/agentloop.js     shared hand-written agent loop (recall/show tools)
js/apibrain.js      live mode: DeepSeek via /api/chat, recall via /api/recall
js/memory.js        manifest + persona loader, keyword search, document fetch
js/markdown.js      minimal md→html (tables, blockquotes), zero dependencies
js/agent.js         conversation state machine
js/main.js          boot + UI (windows, wells, children, typewriter reveal)
api/chat.js         serverless proxy: DeepSeek chat completions
api/recall.js       serverless search: BM25 + vector RRF over content/index.json
lib/                embed.js (OpenAI query vectors), index.js (index loader),
                    search.js (hybrid retrieval), tokens.js (shared tokenizer)
scripts/build-index.mjs   generates content/manifest.json + content/index.json
content/            the memory vault: persona.json, front-matter .md docs,
                      generated manifest.json / index.json / .embed-cache.json
```
