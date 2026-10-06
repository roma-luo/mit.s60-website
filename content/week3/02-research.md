---
id: week3-research
label: WEEK 03 RESEARCH
title: Week 3 Research: calibrating human judgment of AI capability
section: week 3
answer: The research behind my week three build. AI help can raise performance while eroding the skill underneath, and once execution is delegated, the critical skill becomes judging where AI succeeds and fails: the jagged frontier. Calibration is learned through explicit predictions and fast feedback, which everyday AI use never gives.
tags: [week3, research, calibration, jagged frontier, mental models, cognition, interfaces]
keywords: [week 3, week three, research, jagged frontier, calibration, mental model, dell'acqua, bansal, bastani, cognitive debt, tools for thought, ihde, human technology relations, evidence]
attachments: [research-frontier.jpg, research-evidence.jpg]
---
# Research: Calibrating Human Judgment of AI Capability

*Background research for Week 3 of MAS S60 (human-agent interfaces for cognitive augmentation).*
*Figures referenced below are in `images/`.*

---

## 1. Question

When people delegate work to AI agents, which human cognitive capacities matter most, and how can an
interface strengthen them instead of eroding them?

The research below moves through three steps: (1) what the evidence says about AI assistance and human
cognition, (2) which cognitive capacity becomes critical once execution is delegated, and (3) what is
known about building interfaces that train that capacity.

---

## 2. AI assistance can raise performance while eroding the underlying skill

A consistent pattern has emerged from controlled studies from 2023 to 2026: unguided AI help improves
immediate output but can degrade independent ability, understanding, or ownership. The interaction
design, not the model, largely determines which effect dominates.

| Study | Setting | Finding |
|---|---|---|
| Bastani et al. (2025), *PNAS* | High-school mathematics, field experiment with GPT-4 tutors | Access to a standard ChatGPT-style tutor improved practice performance, but students performed **worse** once access was removed. A tutor with learning guardrails (prompts that promote reasoning) largely avoided the harm. |
| Anthropic (2026), *How AI assistance impacts the formation of coding skills* | Randomized trial, 52 developers learning an unfamiliar Python library (Trio) | Hand-coding group averaged **67%** on a follow-up quiz, AI group **50%**, with no significant time savings. Participants who used AI for conceptual questions scored **≥65%**; those who delegated code generation scored **<40%**. |
| Kosmyna et al. (2025), *Your Brain on ChatGPT* (MIT Media Lab) | 54 participants writing essays with an LLM, a search engine, or no tools; EEG | LLM users showed the weakest neural connectivity, the lowest sense of ownership, and difficulty quoting their own essays ("cognitive debt"). Small sample; directional rather than definitive. |
| Lee et al. (2025), *CHI* (Microsoft Research & CMU) | Survey of 319 knowledge workers | Higher confidence in AI was associated with less critical thinking. Critical effort shifted from **information gathering to verification**, from **problem solving to response integration**, and from **task execution to task stewardship**. |

**Counter-evidence that design can augment cognition:** Danry et al. (2023, *CHI*) showed that an AI that
frames its feedback as **questions** ("AI-framed questioning") improved people's ability to detect
flawed reasoning more than an AI that simply explained the answer, even when that AI was always correct.

**Takeaway.** The same model can help or harm depending on how the interaction is structured. This
establishes the design space for the assignment: the interface is the guardrail.

*See `images/02_evidence_summary.jpg`.*

---

## 3. Once execution is delegated, judging AI capability becomes the critical skill

Lee et al.'s finding that cognition shifts toward verification and stewardship suggests a different
question from "should we delegate?": **what cognitive work remains, and is it supported?**

Two lines of research identify one capacity in particular: **an accurate mental model of where the AI
succeeds and fails.**

- **The jagged technological frontier.** Dell'Acqua et al. (2023, Harvard Business School working paper
  with Boston Consulting Group) studied 758 consultants. For tasks inside the AI's capability frontier,
  consultants using GPT-4 completed more tasks, faster, and at substantially higher quality. For a task
  designed to fall outside the frontier, consultants using AI were **less likely to reach the correct
  answer** than those working without it. The frontier is *jagged*: tasks of similar apparent difficulty
  can fall on opposite sides, so intuition about "hard" versus "easy" is an unreliable guide.
- **Mental models in human-AI teams.** Bansal et al. (2019, *HCOMP*) showed that the performance of a
  human-AI team depends on whether the human can **anticipate when the AI will err**, not only on the
  AI's accuracy. A follow-up (Bansal et al., 2019, *AAAI*) showed that **updating the AI can break the
  human's mental model** and lower team performance even when the new model is more accurate.

Two implications follow. First, the human's model of the AI's error boundary is a cognitive asset in its
own right. Second, that model goes stale whenever the model or the task mix changes, which today happens
every few months.

*See `images/01_jagged_frontier.jpg`.*

---

## 4. How calibrated judgment is learned

Calibration (the match between stated confidence and actual outcomes) is one of the better-understood
judgment skills.

- **Fast, frequent feedback produces calibration.** Weather forecasters are among the best-calibrated
  experts studied (Murphy & Winkler, 1977), largely because they predict daily and learn the outcome the
  next day.
- **Explicit predictions and scoring improve judgment.** Forecasting research (Tetlock & Gardner, 2015)
  shows that recording probabilistic predictions and scoring them (for example with the Brier score)
  improves accuracy over time.
- **Confident errors are memorable.** The hypercorrection effect (Butterfield & Metcalfe, 2001) shows
  that errors made with high confidence are corrected more readily than low-confidence errors, so the
  moments of surprise carry the most learning value.

**Gap.** Everyday AI use offers none of these conditions. People rarely state a prediction before
delegating, outcomes are fixed in passing and forgotten, and there is no record that reveals systematic
over- or under-trust by task type.

---

## 5. Interfaces beyond chat

The assignment asks for interfaces beyond the chat window. Several developments from late 2025 to 2026
are relevant.

**Agent-generated interfaces.** Agents increasingly emit structured UI instead of text:
- *MCP Apps* (January 2026), the first official Model Context Protocol extension, lets tools return
  interactive UI rendered inside clients such as Claude and ChatGPT.
- *A2UI* (Google, open-sourced December 2025) has agents send declarative component descriptions that
  clients render with native widgets, without executing agent code.
- *json-render* (Vercel Labs) and *OpenUI* (thesys) constrain model output to a developer-defined
  component catalog and render it progressively.
- *VibeOS* pushes the idea to an extreme: every window of a browser-based "OS" is generated live.

The shared direction is **constrained declarative output**: the agent decides *what* to show, the host
decides *how*. A recurring open problem is predictability: interfaces that change every time make it
hard for users to build a mental model of them.

**Wearable and ambient agents.** Display-equipped AI glasses (Meta Ray-Ban Display; Android XR glasses)
and research systems from the MIT Media Lab Fluid Interfaces group (for example *Memoro*, a wearable
memory assistant, and *Wearable Reasoner*, which flags unsupported arguments) move agents toward
peripheral, minimally interruptive output.

**Proactivity and timing.** Studies of proactive programming assistants find that interventions at
**task boundaries** are welcomed, while interruptions during apparent inactivity (often deep thought) are
perceived as disruptive. Proposed evaluation dimensions include initiative appropriateness, timing,
transparency, contestability, trust calibration, and cognitive burden (CHIIR 2026 workshop report).
These echo Horvitz's (1999) mixed-initiative principles: act, ask, or stay silent according to the
expected value of action relative to the cost of interruption and the risk of error.

**Tools for Thought.** The CHI 2025 and CHI 2026 workshops on *Tools for Thought* (Microsoft Research
and collaborators) frame a research agenda around systems that **protect and augment** cognition:
provoking reflection, supporting metacognition, and exposing uncertainty rather than hiding it.

---

## 6. Human-technology relations as a design lens

Ihde's (1990) four relations, discussed in class, map onto the design options:

| Relation | Meaning | Relevance |
|---|---|---|
| Embodiment | The tool becomes part of perception | Wearables and HUDs; risk of dependence |
| Hermeneutic | The user reads a representation | Dashboards, maps, confidence displays |
| Alterity | The tool is a distinct other | Socratic tutors, devil's advocates |
| Background | The tool shapes the environment unnoticed | Ambient cues, calm technology (Weiser & Brown, 1996) |

Interfaces can move between relations as the interaction state changes.

*See `images/03_human_technology_relations.jpg`.*

---

## 7. Implications for design

1. **Target a capacity that delegation makes more important, not less:** judging AI capability.
2. **Create the missing feedback loop:** a prediction before each delegation, a recorded outcome after.
3. **Make the mental model visible:** externalize per-task-type bias so the user can see its structure.
4. **Keep the human's cost minimal:** one click, at a task boundary, with no chat.
5. **Keep authority with the user:** automatic outcome judgments must be contestable.
6. **Plan for staleness:** model updates invalidate earlier judgments.

---

## References

- Anthropic. (2026). *How AI assistance impacts the formation of coding skills.* https://www.anthropic.com/research/AI-assistance-coding-skills
- Bansal, G., Nushi, B., Kamar, E., Lasecki, W. S., Weld, D. S., & Horvitz, E. (2019). Beyond accuracy: The role of mental models in human-AI team performance. *Proceedings of HCOMP.*
- Bansal, G., Nushi, B., Kamar, E., Weld, D. S., Lasecki, W. S., & Horvitz, E. (2019). Updates in human-AI teams: Understanding and addressing the performance/compatibility tradeoff. *Proceedings of AAAI.*
- Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *PNAS.* https://pubmed.ncbi.nlm.nih.gov/40560616/
- Butterfield, B., & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. *Journal of Experimental Psychology: Learning, Memory, and Cognition.*
- Danry, V., Pataranutaporn, P., Mao, Y., & Maes, P. (2023). Don't just tell me, ask me: AI systems that intelligently frame explanations as questions improve human logical discernment accuracy over causal AI explanations. *Proceedings of CHI.* https://dl.acm.org/doi/10.1145/3544548.3580672
- Dell'Acqua, F., McFowland, E., Mollick, E. R., et al. (2023). *Navigating the jagged technological frontier: Field experimental evidence of the effects of AI on knowledge worker productivity and quality.* Harvard Business School Working Paper 24-013.
- Horvitz, E. (1999). Principles of mixed-initiative user interfaces. *Proceedings of CHI.*
- Ihde, D. (1990). *Technology and the lifeworld: From garden to earth.* Indiana University Press.
- Kosmyna, N., et al. (2025). *Your brain on ChatGPT: Accumulation of cognitive debt when using an AI assistant for essay writing task.* MIT Media Lab.
- Lee, H.-P., et al. (2025). The impact of generative AI on critical thinking. *Proceedings of CHI.*
- Murphy, A. H., & Winkler, R. L. (1977). Reliability of subjective probability forecasts of precipitation and temperature. *Journal of the Royal Statistical Society, Series C.*
- Tetlock, P. E., & Gardner, D. (2015). *Superforecasting: The art and science of prediction.* Crown.
- Weiser, M., & Brown, J. S. (1996). Designing calm technology. *PowerGrid Journal.*
- Tools for Thought workshop, CHI 2026. https://ai-tools-for-thought.github.io/workshop/
- MCP Apps announcement (January 2026). https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- A2UI. https://a2ui.org/
- Vercel json-render (The New Stack). https://thenewstack.io/vercels-json-render-a-step-toward-generative-ui/
- OpenUI. https://github.com/thesysdev/openui
- Assistance or Disruption? Proactive AI programming support (arXiv 2502.18658). https://arxiv.org/html/2502.18658v2
- CHIIR 2026 workshop on proactive and personalized agents (arXiv 2608.18638). https://arxiv.org/pdf/2608.18638

*Bibliographic details for items without links were compiled from memory and should be checked against
the original sources before citation.*
