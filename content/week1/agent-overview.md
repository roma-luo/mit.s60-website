---
id: week1-overview
label: WEEK 01 OVERVIEW
title: Week 1 Agent Overview — the Downloads-folder naming agent
section: week 1
answer: The full write-up of my week one agent: a local LLM with a hand-written loop that judges what each file in a real Downloads folder is and renames it to a written naming convention. It covers the architecture, the six design decisions, real performance on four runs, and the four failure modes of a 7B model. Recordings of the process and the result are linked at the bottom.
tags: [week1, agent, loop, naming, downloads, documentation, overview]
keywords: [week 1, week one, first week, naming agent, downloads folder, agent overview]
---
# Week 1 Agent Overview: The Downloads-Folder Naming Agent

> A complete write-up for anyone who wants to understand this project: what it is,
> how it's built, why it's designed this way, how it actually performs, what's wrong
> with it, and what comes next. Code lives in `04_script/agent-prototype/`
> (repo: github.com/roma-luo/mit.s60-week01-agent).

## In one sentence

An agent that works on a real Windows Downloads folder: a local LLM (offline, no agent
framework) judges for each file "what is this and what should it be called," and renames
it according to a written naming convention. It's fundamentally a teaching experiment —
taking the tutorial's vending-machine observation → action → observation loop and moving
it onto a real filesystem, to see when it works, when it fails, and what failure looks like.

## Why this task deserves an agent

Every file in a Downloads folder is the fossil of one moment of attention, named by
whatever source produced it: `final_v3(2).pdf`, `1706.03762v7.pdf`, `1231212.png`.
Judging "what is this" takes common sense (1706.03762 is an arXiv ID), which hard-coded
rules can't cover; and whether a rename actually happened can only be learned by looking.
Dozens of tiny judgments, each trivial, add up to something nobody ever does — exactly
the kind of work an agent is for.

## Architecture

```
week1/
├── NAMING.md          the naming rules (the agent's first action is reading them;
│                      changing behavior means editing this file, not the code)
├── run.py             CLI entry and the safety layer (--dry-run default / --apply / --undo / --limit)
└── agent/
    ├── model.py       chat(): the only model touchpoint — llama-cpp-python + local GGUF
    ├── prefilter.py   rule-based preprocessing: exclude, dedupe, group
    ├── environment.py DownloadsFolder: the environment. read-only vs state-changing methods
    ├── actions.py     execute(): parses one action line — a chain of ifs
    ├── prompts.py     the SYSTEM prompt + the per-turn prompt block
    ├── validate.py    the stopping conditions, checked in code (never by asking the model)
    └── loop.py        run_agent(): a for loop + chat(), 44 lines, no extra machinery
```

**One turn of the loop:**

```
SYSTEM + messages (full history)
        │
        ▼
  model reply: line 1 = one sentence of reasoning, line 2 = ACTION: <action>
        │
        ▼
  regex extracts the FIRST ACTION → actions.execute() calls the environment
        │ (DONE goes to validate's three checks; rejected DONEs carry reasons)
        ▼
  observation string + available actions appended to messages as a user message
        │
        ▼
  one trace record per step (step / raw reply / action / observation / folder snapshot)
```

`messages` is the agent's entire memory: **never truncated, never summarised, never
cleared**. If the context overflows, the answer is `--limit` (fewer files), not a hidden
mechanism inside the loop — the memory mechanism itself is this week's exhibit.

## Core design decisions (the "why")

**1. Code/model division of labor.** Installers, partial downloads, and
already-conforming files are filtered out by `prefilter` with rules; the model never
sees them. Duplicate detection is sha256, group detection is mtime clustering — both
code. The tutorial's Part 2 lesson: whatever a rule can decide, a rule should decide.

**2. RENAME never reports its real result.** Inherited from the tutorial's vending
machine (press doesn't tell you what dropped; only CHECK_TRAY knows). Name conflicts,
illegal characters, out-of-vocabulary TYPEs, malformed names — all silently leave the
file under its old name; the answer is always "Renamed." `VERIFY` is the only way to
learn what a file is actually called right now. This isn't artificial cruelty: Windows
file names are case-insensitive, and `os.rename` onto a case-variant target silently
overwrites — no error, ever. An agent that trusts its own actions maintains a mental
model of the world that diverges from disk; forcing it to VERIFY means forcing it to
replace assumptions with observations.

**3. Stopping conditions are checked in code, not by the model.** When the model says
DONE, three checks run: no pending file keeps its original name (deferred counts as
processed), no name conflicts (compared lowercased), and every new name passes the regex
+ TYPE vocabulary + Windows reserved names. All three must pass, otherwise DONE is
rejected with concrete reasons. "Do you think you're done?" is one more guess; these
three are objective properties of the folder state. The tutorial spent an extra model
call on this; this project removed it.

**4. Safety comes from the run mode, not from the agent's behavior.** Default
`--dry-run`: the full loop runs, the trace is written, and the disk is never touched
(renames are bookkeeping in memory). `--apply`: after the loop, a complete mapping table
is printed, and only a typed `yes` persists the **final state**. `--undo` reverts the
last applied batch from the log. The human keeps the final decision.

**5. commit() persists only the final state.** If the agent renames a file to name1 and
later to name2, only name2 reaches the disk — the user confirmed the mapping table, not
the journey. (This was a real bug caught in review: the original code replayed history,
so name1 landed on disk and name2 silently failed.)

**6. max_iters must exist (8 × file count).** The agent has no built-in "I'm stuck"
signal; this is the only guaranteed terminator.

## The naming convention (NAMING.md, abridged)

`[TYPE]_[Description]_[YYYYMMDD].[ext]`, e.g. `PAPER_Energy-Drink_20260919.pdf`.
A fixed vocabulary of 12 TYPEs (PAPER/SLIDES/DOC/FORM/DATA/CODE/IMG/SCREENSHOT/MEDIA/
BOOK/ARCHIVE/UNKNOWN) — never invented; Description is 1–2 words, hyphen-joined, no
underscores, no spaces; the date is always the download date; unjudgable files get
DEFERred to `UNKNOWN_[original-stem-fragment]_[date]`; duplicates are detected by
content hash, later copies get `_DUP`; conflicts get `_2` (compared case-insensitively);
≥3 files arriving within 90 seconds form a `FOLDER_...` group. Four no-touch rules
(installers, partial downloads, already-conforming, etc.) run in the prefilter.

## Stack and environment

- Model: Qwen2.5-7B-Instruct Q4_K_M GGUF (4.7 GB, local file), inference via
  llama-cpp-python (an inference backend, not an agent framework). `max_tokens=100`,
  greedy decoding, matching the tutorial.
- RTX 4080 12 GB: the prebuilt CUDA wheel was compiled for AVX-512 and crashed with an
  illegal-instruction error on this CPU, so llama-cpp-python was built from source
  (VS Build Tools, Ninja, `-allow-unsupported-compiler`). All layers on GPU, ~1–2 s per
  step. A CPU wheel works as a fallback, an order of magnitude slower.
- `peek()` extraction: separate pipelines for text/PDF/docx/zip; images go through
  Tesseract OCR (with an added chi_sim language pack); if OCR is unavailable it degrades
  gracefully to dimensions + EXIF instead of blocking.

## Actual performance (real Downloads folder: three dry-runs + one apply)

| scale | ending | renamed | deferred | untouched |
|---|---|---|---|---|
| --limit 8 | done, 30 steps | 4 | 4 | 0 |
| --limit 8 (again) | max_iters, 64 steps | 4 | 0 | 4 |
| --limit 12 | max_iters, 96 steps | 5 | 3 | 4 |
| --limit 12 (again) | context blown at step 76 (63 consecutive VERIFYs) | — | — | — |
| --limit 20 | context blown at step 129 | 9 | 2 | 8 |
| --apply --limit 8 | persisted for real | 4 | 0 | 4 (--undo restored them) |

**What it does well**: correct procedure instinct (reads the rules first, then LISTs);
PEEKs files whose names can't be trusted and genuinely uses the content (it read a 20 MB
PDF and named it SLIDES_Simulation after the book it found inside); DEFERs files with no
usable signal instead of guessing; silent failures (conflicts, malformed names) are all
recoverable through VERIFY — every observation window of the four failure modes works.

**The flaws, by frequency**:

1. **Never learns the format details**: keeps putting underscores inside the Description
   field (e.g. `PAPER_MAS.S63-2026_Pecha_Kucha_...`), confusing the field separator with
   a word separator. This is the number-one source of failed renames. A 7B model's grip
   on a long rules document it read at step 2 is gone by step 100.
2. **Doesn't learn from rejections**: DONE is rejected with the format requirement
   spelled out, and it retries the *same* invalid name (PLAN-2.md: 12 identical RENAME
   attempts in a row, until max_iters).
3. **VERIFY storms**: in one run, 63 of 76 steps were VERIFY, eating the entire 32k
   context until it crashed — a textbook case of "no stuck signal," with even max_iters
   arriving too late to help.
4. **Over-defers after failures**: files it can't rename tend to get deferred in bulk
   (4 DEFERs in a row) rather than diagnosed. Caution beats guessing, but the ratio is
   too high.

None of these are code bugs; they're the real behavioral ceiling of a 7B model, and the
most valuable reflection material in this assignment (each has concrete step numbers in
the traces).

## Bugs found and fixed during review

- `commit()` replayed history → a file renamed twice landed under the wrong name
  (the most serious; caught by the user)
- `rename()` didn't validate the format → invalid names could reach the disk for real
- `DEFER` couldn't reference an already-renamed file → the agent's correction path was
  blocked, locking it into a loop
- `DONE` required an exact match → `DONE.` fell through to "Unknown action"
- `--undo` imported the model stack; unguarded `rmdir`; the prefilter's
  already-conforming check ignored the TYPE vocabulary (`IMG_1234_20250101.jpg`
  would have been skipped as "conforming")

## Known limitations (documented in the README)

- Untruncated `messages` ⇒ ~12–16 files is the safe scale for a 32k context; the whole
  Downloads folder (900+) can't be done in one run — a single LIST/VERIFY alone
  overflows it.
- The date is always the download date, never a date found inside the content
  (a deliberate simplification).
- Dedup and grouping only operate within the current `--limit` selection.
- Screenshot understanding depends entirely on OCR; pure photos yield nothing to PEEK
  and mostly end in DEFER.

## If it were improved further

- **One small independent loop per file** (PEEK → decide → rename, a few dozen tokens of
  context) instead of one global conversation — the context problem disappears, and
  files could be processed in parallel. This is the key step to production.
- A stuck-detection layer (force DEFER after N consecutive no-op actions).
- Write user corrections back into an examples section of NAMING.md — cross-file memory.
- A fixed test set for quantitative evaluation (dropped this week in favor of
  demonstrating on the real folder).
- SYSTEM prompt tuning: three runs of traces point clearly at "no underscores in
  Description," "append _2 on conflicts," "never VERIFY twice in a row" — expected to
  eliminate most of the thrashing.

## How to run it

```powershell
cd "D:\harvard\MAS S60\w1\04_script\agent-prototype\week1"
..\.venv\Scripts\python run.py --dry-run --limit 12   # rehearsal, disk untouched
..\.venv\Scripts\python run.py --apply  --limit 12   # mapping table + "yes" required
..\.venv\Scripts\python run.py --undo                # revert the last applied batch
```

Dry-run first, read the mapping, then apply; undo if anything looks wrong. Repeat batch
by batch to work through the entire Downloads folder (already-conforming files are
skipped automatically on the next pass).

## Recordings

- [recording: process](recording-process.mp4)
- [recording: outcome](recording-outcome.mp4)
