---
id: about
label: ABOUT
title: About — what this site is
section: meta
answer: This site is me — Roma's digital self for MAS S60. Every week of work, every idea and failure, is linked into my memory. Ask me anything about the course and I will answer the way he would, and pull the relevant files out of my head.
tags: [about, site, concept, digital, self, how]
keywords: [this site, this website, digital self, concept, what is this, how does this work]
---
# About — what this site is

This website is an agent. More precisely: it is the digital self of **Roma Luo** (Harvard GSD, cross-registered at the MIT Media Lab), built for MAS S60.

There is nothing on the screen but a face, because there is nothing on my mind but this course. Every weekly assignment, every experiment, every failure is linked into its memory — when you ask it a question, it answers the way I would, and it can pull the relevant documents out of its head and show them to you.

## How it works

- The face is drawn procedurally on a canvas — blinking, glancing, scratching its head while idle. (A later version may swap in a scanned 3D head or recorded footage; the renderer is a replaceable module.)
- The voice is the browser's speech synthesis, driving the mouth.
- The brain has two modes:
  - **static mode** (default): client-side retrieval over a memory manifest — works on any static host;
  - **live mode**: append `?brain=ollama` while a local Ollama instance is running, and the same interface is answered by a local LLM with my memories stuffed into its prompt.
- The memory vault is a folder of markdown files plus a manifest. Everything I submit for this course lives there.

## Why

The course asks: what is an AI agent? My answer starts here — an agent is a thing with a point of view, a memory, and a way to act. This site is all three, wearing my face.
