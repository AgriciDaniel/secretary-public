---
type: taxonomy
title: Tag Taxonomy
domain: meta
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/meta", "#type/taxonomy", "#confidence/institutional"]
confidence: institutional
related: ["[[index]]", "[[meta/CONVENTIONS]]", "[[references/CONFIDENCE_TAGS]]"]
source_urls: []
---

# Tag Taxonomy

## Domain tags

Use exactly one domain tag per note:

- `#domain/duties`
- `#domain/judgment`
- `#domain/escalation`
- `#domain/ethics`
- `#domain/communication`
- `#domain/roles`
- `#domain/failure-modes`
- `#domain/gaps`
- `#domain/questions`
- `#domain/meta`
- `#domain/references`

## Type tags

Use exactly one type tag per note. Current values are:

- `#type/hub`
- `#type/operating-note`
- `#type/gap`
- `#type/question`
- `#type/convention`
- `#type/taxonomy`
- `#type/context`
- `#type/log`
- `#type/ledger`

## Confidence tags

Use exactly one confidence tag per note:

- `#confidence/evidence-based`
- `#confidence/institutional`
- `#confidence/practitioner`
- `#confidence/contested`
- `#confidence/folklore`

The frontmatter `confidence` value must exactly match the tag suffix.
See [[references/CONFIDENCE_TAGS]] for definitions and use rules.
`#confidence/folklore` is an admissible value and is currently unused.

## Status values

Status is not a tag. Use `current`, `open`, or `verified-absence`.
Use `verified-absence` only when the digest explicitly verifies that evidence is absent.
Use `open` for questions the digest does not answer.
