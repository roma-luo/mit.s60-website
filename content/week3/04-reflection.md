---
id: week3-reflection
label: WEEK 03 REFLECTION
title: Week 3 Reflection: Frontier Map
section: week 3
answer: My reflection on Frontier Map. One-click prediction and history-driven warnings worked; the hold still risks reflex clicking, and task segmentation is the weakest part. Three real tasks show the loop works, not that it calibrates anyone yet. Most of the effort went into sensing, timing, focus and animation, not the LLM.
tags: [week3, reflection, lessons, evaluation, ai disclosure]
keywords: [week 3, week three, reflection, what worked, what struggled, lessons learned, segmentation, evaluation, real data, ai use, disclosure]
attachments: []
---
# Reflection: Frontier Map

## Where I started

This week began with a wide reading pass on cognitive augmentation. I looked at generative UI, wearables, proactive agents, Tools for Thought, and the growing pile of evidence that leaning on AI can make us learn less. My first batch of concepts split into two camps. One camp was the "make me think harder" family, such as a Socratic study buddy or an assistant that makes me write first. The other camp came from metaphors I just liked: the rein between a rider and a horse, the whistle between a shepherd and a sheepdog. I dropped both. The first camp felt like it was working against how I actually work, and the second looked nice but didn't do much.

What unstuck me was looking honestly at my own habits. When I vibe-code, I hardly execute anything myself, but my head isn't empty either. I set the goal, and I keep a rough picture of how far the AI can get on its own. To me that's where thinking is heading: up to goals, to modeling the agent, and to judging what it hands back. So I stopped trying to drag execution back into my head and decided to support this new layer instead. That became Frontier Map. Before each delegation, I predict with one click whether Claude will get it right on the first try. Over time, the system shows me where my picture of AI capability is off.

## What worked

The cost stays at one click. The whole idea falls apart if predicting is expensive, so I held the message and offered four options on a dial. I never have to type anything, and I doubt it can get much lighter than that.

I also refused to let predictions be skipped, even for trivial requests. "This is obviously fine" is exactly the belief I wanted to test. The jagged-frontier research points the same way: people get burned on tasks that look easy but sit just past what the AI can do.

My own history changes what the agent does, which I liked. The overestimation warning only shows up because of what I predicted before in that category. So the same prompt gives one person a calm dial and another person a red one. That made the requirement that human input changes agent behavior feel real to me, not staged.

On the technical side, I split the work on purpose. Claude Haiku (through smolagents) classifies messages and explains risks, while the rules for when the dial interrupts me are ordinary code. Because of that, I can explain the behavior, test it, and trust it.

The radial dot map turned out well too. It shows bias at a glance, which a table of Brier scores would never do. An orange sector just means I expected more than I got there, and I don't have to read anything to see it.

The first time the dial stopped one of my own messages, I was still building the thing. I had asked Claude to debug the stuttering animation, and the dial held the request until I made a prediction. It felt odd, because I had to state a belief I normally wouldn't notice I had. I tapped *Certain* almost instantly, since animation performance seemed like an obviously solvable problem. Only later did I count how many steps it really took: measuring frame rates, tracking down the window resize, and rewriting the map as a canvas.

## Where it struggled

Holding a message is an interruption, even at one click. I can already see the danger of clicking without thinking. My first two real predictions were both *Certain*, and each took about a second. Some of that was real confidence, but some of it was the urge to get the dial out of the way so my message could go through. If that urge wins over a long day, the data slowly stops meaning anything. The prediction needs to feel like a small bet and not a toll booth.

The success signal is also guesswork. For code, a correction from me is a fairly clear sign something went wrong. For writing and factual questions the signal is much weaker, because I might rephrase just because I changed my mind. The override button is there as a safety valve, but it only helps if I remember to use it.

Segmentation is the weakest part. The system has to decide whether a message starts a new task or continues the last one, and that's the step most likely to go wrong. Every mistake there corrupts the recorded outcome of a task.

Building on Windows was harder than I expected. To read Claude Desktop's input box, I had to switch on Chromium's accessibility tree through an old Windows API. Mouse clicks on the overlay were ignored until I let the window take focus for a moment and then hand it back. The animations were also rough at first, around 27 fps when opening the review panel. The window was being resized in the middle of the animation, and about 1,300 SVG dots were repainted on every frame. I fixed it by resizing first, moving the animation to compositor layers, and drawing the map on a canvas. That got it to 58 to 60 fps. What I took from this is that smoothness isn't decoration for an interface that's supposed to fade into the background. If it stutters, people notice it, and once they notice it, it feels heavy.

There's one smaller bug that still bothers me. With some Chinese input methods, pressing Enter to confirm a composition can be read as "send". I switch languages all day, so this one hits me directly.

## What the evidence shows so far

Honestly, not much. The demo runs on a week of illustrative data, and when I handed the project in, my real database held only three tasks, all from building this project with Claude Code. I can show that the loop works from start to finish. I can't yet show that it makes anyone better calibrated. The claim I want to test is simple: after a week of predicting, my predictions should get more accurate (a lower Brier score), and the biggest gains should show up in the categories where I began most overconfident.

The real log is still worth a look, because it already exposes the weak spots.

| # | Task (category) | My prediction | Recorded outcome |
|---|---|---|---|
| 1 | Debug the stuttering animation (Debugging) | Certain | First pass |
| 2 | Put together the hand-off package (Writing) | Certain | First pass |
| 3 | Write the reflection (Writing) | Likely | Observing; I then asked for the gaps to be filled |

On paper, my accuracy is 100% and my Brier score is 0, and that number is misleading. For task 2, the hand-off package arrived in one pass, but the reflection was left as notes, so I had to come back and ask for it. The observer logged that follow-up as a brand new writing task and not as a correction to task 2, so task 2 kept its perfect score. That's the segmentation problem from above, showing up in my own data on day one. Task 1 has a similar issue. The debugging took several rounds of measuring, but I never had to correct Claude, so it counts as a first pass. Not correcting Claude and the task being easy are two different things.

So the first lesson from real use is about the measurement more than about me. Three tasks tell me nothing about my calibration, and I need to check the outcome signal by hand, using the override, before the numbers can be trusted. My plan is to keep the app running through a week of normal work and then compare my accuracy and Brier score per category with `uv run frontier-export`.

## What I would change

- Interrupt less on trivial prompts. I could sample them and not hold every one, as long as the "obvious" cases still get tested now and then.
- Improve task segmentation, maybe by letting me mark "new task" with the same click I use for the prediction.
- Keep a separate map for each model. The frontier moves whenever the model changes, so a single map quietly goes stale. Seeing how my map shifts between model versions might be the most interesting part of the whole idea.
- Let people share maps. Putting my map next to a teammate's could show where our instincts about AI differ, which ties into the group project.

## What surprised me

The most useful idea came from watching my own habits, not from the papers. The research gave me words for it (calibration, jagged frontier, mental models of AI error), but the question "what is the graph in my head, and is it right?" only came from noticing how I already work.

I was also surprised at how fast an "agent" project turns into a systems project. The LLM part was the easy part. Most of my time went into sensing, timing, focus, and animation, and those are the things that make an interface feel calm or irritating.

## AI-use disclosure

I used Claude Code throughout this project. It helped with literature search and summaries, design discussion, mockups, all of the application code and tests, debugging and performance measurement, the figures, the demo recording, and a first draft of this documentation, including this reflection, which I then revised. The framing ("cognition is moving upward," "a graph in my head"), the choice of Frontier Map, and the main interaction decisions were mine. Those decisions were: no skipping, one-click predictions, manual takeover counting against the AI, a circular dot map, and review on demand.
