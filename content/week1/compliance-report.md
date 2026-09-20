---
id: week1-compliance
label: WEEK 01 COMPLIANCE
title: Week 1 Compliance Report — requirements, module by module
section: week 1
answer: The compliance report for the week one agent: each assignment requirement mapped to the module that satisfies it, from observations and actions to stopping conditions, the local model, and the hand-written loop. It ends with the outstanding items before submission.
tags: [week1, compliance, requirements, agent, loop, documentation]
keywords: [week 1, week one, first week, compliance, requirements]
---
# Week 1 Compliance Report: A Downloads-Folder Naming Agent

MAS.S60 AI Agents for Cognitive Augmentation, Fall 2026
Repository: `roma-luo/mit.s60-week01-agent`, commit `97c8a55`

This report walks through the assignment's requirements for Part 3 (Implement an agent from scratch) and shows which module in the repository satisfies each one, and how. Outstanding items are listed in section 10.

---

## 1. Overview

The assignment states seven hard requirements for the agent. The table maps each to the module that carries it; the sections that follow expand on each.

| Requirement | Module |
|---|---|
| Receive observations from an environment | `environment.py` (read-only methods), `prompts.py` (`prompt_block`) |
| Select and execute an action | `loop.py` (parsing), `actions.py` (dispatch), `environment.py` (state-changing methods) |
| Use the result to inform the next action | `loop.py` (`messages` accumulation), `environment.py` (`RENAME` withholds its result, `VERIFY` reveals it) |
| Stop when finished or at an iteration limit | `validate.py`, `loop.py` (`max_iters`) |
| A downloaded LLM, inference on this machine | `model.py` |
| No agent frameworks or SDKs | all modules, see section 7 |
| The loop implemented by hand | `loop.py` |

Three further modules do not map onto a single requirement but determine the agent's behavioural boundaries and its safety: `prefilter.py`, `NAMING.md`, and `run.py`.

---

## 2. Receiving observations

**Requirement**: Receive observations from an environment.

**What the environment is**: a real Windows Downloads folder. The `DownloadsFolder` class in `environment.py` wraps it, structured like the tutorial's `VendingMachine`: methods are either read-only or state-changing.

**Where observations come from**: the return text of the read-only methods.

| Method | Returns |
|---|---|
| `read_conventions()` | the full text of `NAMING.md` |
| `list()` | pending files with name, size, arrival time, extension, duplicate flag, group flag. **No content.** |
| `peek(file)` | a content preview: 500 characters for text, first PDF page via `pypdf` (second page if the first yields under 50 characters), first paragraphs of a docx, Tesseract OCR for images, first 10 entries of a zip |
| `list_similar(TYPE)` | files already named under that TYPE, so the agent can keep its style consistent |
| `verify()` | what every file is actually called right now |

**How observations reach the model**: `prompt_block(env)` in `prompts.py` attaches only two things each turn — the available action list and a count of files still needing a name. The file listing is not attached automatically; the agent has to call `LIST` itself. This is deliberate. It is the only way the trace can show whether the agent remembers what it has already done.

**Correspondence with the tutorial**: `peek()` is this environment's `CHECK_TRAY`. The filename is the label; the content is the tray.

---

## 3. Selecting and executing an action

**Requirement**: Select and execute an action.

**Action space**: eight actions, defined in `ACTIONS_HELP` in `actions.py` and repeated in the `SYSTEM` prompt.

```
READ_CONVENTIONS | LIST | PEEK <file> | LIST_SIMILAR <TYPE> |
RENAME <file> <new_name> | VERIFY | DEFER <file> <reason> | DONE
```

**Selection**: the model's reply is fixed at two lines — one sentence of reasoning, then `ACTION: <action>`. `loop.py` takes the **first** match of `ACTION:\s*(.+)`. First rather than last, because the model sometimes plans two steps in one reply; running the first and re-prompting keeps them in order. This follows the tutorial's `parse_action`.

**Execution**: `execute(env, action)` in `actions.py` is a plain chain of ifs mapping each action name onto a method of `DownloadsFolder`. Filenames may contain spaces, so `RENAME` takes its last token as the new name and `DEFER` matches the file by longest known-name prefix.

**The division of labour**: the model never touches a file. It produces text; `execute` calls the method. This split is unchanged from Part 3 of the tutorial.

**Why `DEFER` exists**: the tutorial's vending-machine agent has no way to give up, so when it cannot judge something it retries until it hits the cap. `DEFER` is that missing exit. It names the file `UNKNOWN_[cleaned original]_[date]` and records the reason. The `SYSTEM` prompt states plainly that a wrong name is worse than no name.

---

## 4. Using the result to inform the next action

**Requirement**: Use the result to inform its next action.

This is the requirement most easily satisfied only on the surface. Two mechanisms make the result genuinely consequential here.

**Mechanism one: `messages` is the entire memory and is never truncated.** Each turn `loop.py` appends two entries: the model's reply, and `OBSERVATION: <result>` followed by `prompt_block`. The next call sees the complete history from step one. No summarisation, no clearing, no other state carried between turns. When the context gets too long the remedy is `--limit` to process fewer files, not a change to this.

**Mechanism two: `RENAME` does not report its real result.** `rename()` in `environment.py` answers `"Renamed."` whether or not anything happened. The file silently keeps its old name when:

- the new name does not match the format pattern
- the TYPE is not in the vocabulary
- the name contains a Windows-illegal character
- the name collides with an existing file (compared case-insensitively)
- the group-folder prefix is used incorrectly

The only way for the agent to learn whether a rename took effect is `VERIFY`. This maps directly onto the tutorial, where `press` does not say what dropped and only `CHECK_TRAY` reveals it.

The design is not an artificial obstacle. Windows filenames are case-insensitive, and `os.rename` will silently overwrite a target that differs only in case. The agent runs into this for real.

**Visible in the trace**: in a typical run the agent calls `VERIFY`, discovers that an earlier `RENAME` never took effect, and goes back to fix it. The input to that correction is precisely the output of the preceding `VERIFY` — the requirement, literally.

---

## 5. Stopping conditions

**Requirement**: Stop when finished or when it reaches an iteration limit.

Both stopping points live in `loop.py`.

**Finished**: the model emits `DONE` (anything starting with `DONE`, so `DONE.` and similar variants count). `check(env)` in `validate.py` then runs three independent tests:

1. `_check_untouched` — no file still carries its original name unless it was deferred
2. `_check_conflicts` — no two files want the same name (compared case-insensitively)
3. `_check_names` — every new name matches the format pattern, its TYPE is in the vocabulary, it contains no illegal characters, and it is not a Windows reserved name

All three must pass. Otherwise `DONE rejected: <specific reasons>` becomes the next observation and the loop continues.

**Iteration limit**: `max_iters` defaults to `8 × pending file count`. On reaching it the loop exits with `reason = "max_iters"`.

**One departure from the tutorial**: the tutorial validates `DONE` with an extra model call asking whether the tray satisfies the goal. This project uses code instead, because the goal here is mechanically checkable (is the name well-formed, is there a collision). Anything a rule can decide should not be asked of the model. The reasoning is recorded in `WALKTHROUGH.md`.

---

## 6. The local model

**Requirement**: Use a downloaded LLM whose inference runs in Google Colab or on your computer. Hosted model APIs such as Anthropic or OpenAI do not satisfy this requirement.

`model.py` is the only module that touches a model. It loads `Qwen2.5-7B-Instruct-Q4_K_M.gguf` (roughly 4.7 GB) from `week1/models/` on the local disk and runs inference through `llama-cpp-python`. The weights are downloaded to this machine; the inference happens on this machine.

It exposes one function, with the tutorial's signature:

```python
def chat(messages, system=None) -> str
```

Generation parameters match the tutorial: `max_tokens=100`, `temperature=0` (greedy decoding).

**Why not the tutorial's transformers plus bitsandbytes**: the development machine runs Windows, where bitsandbytes' 4-bit support has been unreliable. GGUF is a different weight format for the same model, and `llama-cpp-python` is an inference backend, not an agent framework.

**Decoupling**: no module outside `model.py` references the model. The environment, actions, loop and validation are all model-agnostic. `run.py --undo` does not even import `loop.py`, so renames can be reverted on a machine without the model dependencies installed.

---

## 7. No frameworks, loop written by hand

**Requirement**: Implement the agent loop yourself without agent frameworks or SDKs such as the Claude Agent SDK.

The complete dependency list in `requirements.txt`:

```
llama-cpp-python   inference backend
pypdf              PDF text extraction
python-docx        docx text extraction
pytesseract        OCR wrapper
Pillow             image reading
```

No LangChain, no Claude Agent SDK, no AutoGen, no agent framework of any kind.

`loop.py` is 49 lines. Its core is a `for step in range(1, max_iters + 1)` loop doing eight things per turn: call `chat()`, append the reply, parse with a regular expression, check for `DONE`, execute or validate, append the observation, write the trace, check for exit. The structure corresponds line for line with the tutorial's `run_agent`.

The loop contains no retries, no fallbacks, and no filtering of the model's output. The agent's mistakes enter the trace exactly as they happened.

---

## 8. Modules that set behavioural boundaries

**`prefilter.py`** runs in code before the loop starts and does three things: filters out installers (extension blacklist, installer-like words, version-number patterns), partial downloads (`.crdownload` and friends), and files that already conform; hashes the remainder with sha256 to flag duplicates; and clusters by modification time to flag groups of three or more files arriving within 90 seconds. None of this is given to the model. The reasoning is the lesson of Part 2 of the tutorial: where no decision remains, a fixed rule is the right implementation, and adding a model would add latency, cost and nondeterminism without adding capability.

**`NAMING.md`** is the single source of the naming rules: the format `[TYPE]_[Description]_[YYYYMMDD].[ext]`, a fixed vocabulary of 12 TYPEs, the Description rules, the date convention (download date), `_DUP` for duplicates, a numeric suffix for collisions, `FOLDER_` for grouped arrivals, and the do-not-rename list. `READ_CONVENTIONS`, the agent's first action, reads this file. Change the rules and the behaviour changes without touching any code.

**`run.py`** provides safety through three running modes. `--dry-run` (the default) runs the full loop and writes the trace while leaving the disk untouched. `--apply` prints the complete original-to-new mapping after the loop and waits for the user to type `yes` before anything is renamed. `--undo` reverts the most recent applied batch from `rename_log.jsonl`. Nothing reaches the disk without an explicit confirmation.

---

## 9. The documentation requirements

The assignment requires five items in the Week 1 documentation.

| Requirement | Location | Status |
|---|---|---|
| The task and why it was chosen | `site/week1.html` §1, `week1/README.md` | done |
| Observations, available actions, stopping conditions | `site/week1.html` §2, with a loop diagram and the TYPE vocabulary | done |
| Link to the code and an example run | `site/week1.html` §3 | **link is a placeholder; recording not yet made** |
| A short reflection | `site/week1.html` §4, organised by the four failure modes | **scaffolding in place; 7 paragraphs await a real trace** |
| A disclosure of AI use | `site/week1.html` §5 | done |

`WALKTHROUGH.md` documents each module and answers four questions likely to come up in class: why `messages` is never truncated, why `RENAME` withholds its result, why the stopping condition is checked in code rather than by the model, and why `max_iters` has to exist.

---

## 10. Outstanding before submission

Every item below depends on one thing: a real `--apply` run against the actual Downloads folder.

1. Confirm `n_ctx=32768` in `model.py` against available VRAM. Below 8 GB, lower it to 8192, or the model will fail to load.
2. Run `--dry-run`, read the mapping table, tune the `SYSTEM` prompt once, and record what changed in behaviour.
3. Record the screen and run `--apply`.
4. Replace `site/assets/traces/sample-trace.json` with a real trace from `week1/runs/`; delete `sample-trace.js` and its `<script>` tag in `replay.html`. **The current sample-trace is hand-written synthetic data. It is labelled as such in three places, but it must not be submitted as the example run.**
5. Place the recording in `site/assets/` and replace the placeholder video.
6. Fill the 7 `class="todo"` paragraphs in §4 of `week1.html`, citing step numbers from the real trace.
7. Replace the `TODO-REPO` link with the real repository URL.
8. GitHub Pages content is public even when the repository is private. Move anything that should not be published out of Downloads before the run.

---

## 11. In one sentence

The agent proper is the 49 lines of `loop.py` plus the `SYSTEM` prompt; everything else is the environment. The four loop requirements are carried by the read-only methods of `environment.py`, the dispatch in `actions.py`, the accumulation of `messages` together with the asymmetry between `RENAME` and `VERIFY`, and `validate.py` plus `max_iters`. The model appears only in `model.py`, as local GGUF weights running on this machine. The structure is compliant; the completeness of the submission depends on section 10.
