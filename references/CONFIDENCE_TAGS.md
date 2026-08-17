---
type: convention
title: Confidence Tags
domain: references
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/references", "#type/convention", "#confidence/institutional"]
confidence: institutional
related: ["[[index]]", "[[meta/CONVENTIONS]]", "[[meta/Tag Taxonomy]]", "[[references/claim-ledger]]", "[[references/source-ledger]]"]
source_urls: []
---

# Confidence Tags

## Three separate fields

Do not use a confidence value to describe a publisher's prestige or a source's
binding force. Each source-ledger record carries:

| Field | Meaning |
| --- | --- |
| `source_type` | Source genre, such as official guidance, research, magazine article, or encyclopedia substitute |
| `confidence` | Evidence strength for the stated claim |
| `binding_authority` | Whether the source binds its own audience, and whether that has been established for Secretary |

An official source can be strong evidence without binding this project. A
reputable publisher is not institutional authority. A local operating rule is
synthesis even when every input is official.

## Confidence vocabulary

| Value | Digest definition | Use |
| --- | --- | --- |
| `evidence-based` | Replicated empirical or peer-reviewed | Empirical findings and validated performance data |
| `institutional` | Direct, accessible official or professional doctrine in its own setting | Formal rules, codes, manuals, and official templates, without treating them as a Secretary mandate |
| `practitioner` | Widely adopted convention, single origin, untested | Encodable practice without replicated validation |
| `contested` | Disputed or poorly evidenced | Origin disputes, incomplete provenance, or unresolved source conflict |
| `folklore` | Popular and unsupported | Familiar claims that the digest refutes or cannot substantiate |

## Rules

Every note carries exactly one confidence tag.
Its frontmatter `confidence` value must match that tag.
When a note mixes confidence levels, use the least certain material that affects its operating procedure.
Record claim-specific confidence separately in [[references/claim-ledger]].
Label synthesis explicitly.
Do not promote synthesis to the confidence of its strongest input.
Mark sources with no reachable claim-level record as `cited-but-unlinked` in
`source_type` and use `contested` confidence until that record is captured.
