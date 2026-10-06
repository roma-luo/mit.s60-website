---
id: week3-perspective
label: WEEK 03 PERSPECTIVE
title: Week 3 Perspective — cognition moves upward
section: week 3
answer: My view behind Frontier Map: delegating execution does not empty my head, it moves thinking upward, to setting goals and keeping a graph in my head of what AI can do. The interface should be light and invisible, every delegation counts, and the agent is a mirror, neither a tool nor a colleague.
tags: [week3, perspective, cognition, delegation, design principles, mirror]
keywords: [week 3, week three, perspective, our view, my view, cognition, graph in my head, delegation, third grammar, rider and horse, mirror]
attachments: [perspective-relations.jpg]
---
# Our Perspective

---

## 1. Cognition is being redefined, not lost

The starting point was an objection to the usual framing that AI tools simply reduce human cognition.

> "Tools like vibe coding seem to reduce my cognition, but I am the one who sets the goal. The execution
> may not be done by me, but I roughly know how far it can go. I have a graph in my head."

> "How will future humans define cognition? It keeps changing and being surpassed as technology grows.
> We have to redefine cognition before we can say that some kinds of agency can be delegated to AI, and
> then ask how AI can augment *another* dimension of our cognition."

In other words, delegating execution moves cognitive work **upward**: to setting goals, to modeling what
the AI can do, and to judging the result. The design question is therefore not whether to delegate, but
which cognitive capacities delegation makes more important, and whether anything supports them.

The capacity chosen for this project is the "graph in my head": **an internal map of where AI is reliable
and where it fails.** It is currently built only by trial and error, it is never made explicit, and it
silently goes out of date when models change.

## 2. Practical over performative

An earlier round of concepts drew on metaphor (for example, a "rein" interface inspired by riders and
horses). These were set aside because they were judged to be more expressive than useful:

> "These feel impractical, as if their expressiveness outweighs their usefulness."

The working principle that followed: the interface must be **invisible and light**, must not require
deliberation about what to do, and must fit into existing work rather than add a new activity.

> "It should be very invisible. I shouldn't have to use much brainpower to decide what to do. It must
> not become heavy. The interaction flow should be very smooth."

## 3. Every delegation counts, including the easy ones

On whether predictions could be skipped for simple tasks:

> "Even simple tasks should be recorded, as 'this is completely fine, 100% no problem'."

This turned out to be an important design decision. Overconfidence on tasks that *look* easy is exactly
what the jagged-frontier research warns about, so a mandatory one-click prediction captures the most
informative cases instead of filtering them out.

## 4. Taking over is evidence

On how to score a task the user finished by hand:

> "If I edit it myself, it means the AI did not really help me. If it is only a small change, it should
> get a lower score."

This became the manual-takeover rule: minor edits count as *success after revision*, a major rewrite as
*failure*.

## 5. Earlier exploration: a third grammar for non-human collaborators

Before settling on Frontier Map, the author proposed a broader hypothesis that remains relevant to the
group project:

> "Human–AI collaboration is stuck in a false binary: AI is designed either as a tool (it obeys silently,
> like autocomplete) or as an anthropomorphic colleague (it pretends to be human, like a chat assistant).
> Both are lies: it has more initiative than a tool, and it is not a person. My hypothesis is that a third
> interaction grammar exists, and its prototypes are not in the office but in older practices of working
> with non-human partners: rider and horse, shepherd and sheepdog, captain and river. These practices
> developed mature grammars for working with agentic but non-human partners: tension signals, yielding
> control, mutual training, boundary rituals. That grammar can be translated into interfaces."

Frontier Map keeps one idea from this line of thought: the agent is presented as neither a tool nor a
colleague, but as a **mirror** that reflects the user's own judgment back to them.
