---
id: about
label: ABOUT
title: About — what this site is
section: meta
answer: This site is Roma Luo on the web: his face, his voice, his memory. Ask about the course and it answers from memory, pulling the relevant documents out as cards.
tags: [about, site, concept, digital, self, how]
keywords: [this site, this website, roma on the web, concept, what is this, how does this work]
---
# About — what this site is

This site is **Roma Luo** on the web: his face, his voice, his memory. Every weekly assignment, experiment, and failure of MAS S60 lives in that memory. Ask a question and it answers the way he would, pulling the relevant documents out as cards.

## How it works

- The face is a recorded video loop inside a window card (a procedural canvas renderer is the fallback).
- The voice is the browser's speech synthesis.
- The brain has two modes:
  - **live mode** (default online): answers come from a cloud model (DeepSeek, via `/api/chat`) that looks memories up through `/api/recall`, a hybrid vector + keyword search over everything written here;
  - **static mode** (`?brain=static`): client-side keyword retrieval over the memory manifest — works on any static host with no backend.
- The memory vault is a folder of markdown files; front matter carries the metadata, and the manifest plus the search index are generated at build time.

## Why

The course asks what an AI agent is. This site is one answer: a point of view, a memory, and a way to act, wearing his face.
