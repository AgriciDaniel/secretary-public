---
type: convention
title: Brain Note Conventions
domain: meta
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/meta", "#type/convention", "#confidence/institutional"]
confidence: institutional
related: ["[[index]]", "[[meta/Tag Taxonomy]]", "[[hot]]", "[[log]]"]
source_urls: []
---

# Brain Note Conventions

## Grounding rule

`references/research-digest.md` is the content ceiling for this brain.
Every factual domain claim must be traceable to that digest.
Every such claim must carry an inline primary or official URL supplied by the digest.
When the digest gives only a source-domain URL, cite that URL and do not invent a deeper path.
When evidence is absent, say `no data` and link a note under [[gaps/_index]] or [[questions/_index]].

## Required frontmatter

Every manifested brain note under `wiki/` and every curated reference note has flat YAML frontmatter with these keys:

1. `type`
2. `title`
3. `domain`
4. `status`
5. `created`
6. `updated`
7. `tags`
8. `confidence`
9. `related`
10. `source_urls`

`tags` has exactly three values: one `#domain/*`, one `#type/*`, and one `#confidence/*`.
The value of `confidence` must equal the suffix of the confidence tag.
Use wikilinks in `related` and ordinary HTTPS URLs in `source_urls`.
Frozen or generated source artefacts, including `references/research-digest.md`, generated projections, and package documentation, are explicitly exempt from this brain-note frontmatter rule.

## Confidence vocabulary

Use only the meanings in [[references/CONFIDENCE_TAGS]]:

- `evidence-based`
- `institutional`
- `practitioner`
- `contested`
- `folklore`

Synthesis inherits no authority merely because its inputs are institutional.
Label synthesis explicitly in the body and in [[references/claim-ledger]].

## Substantive note structure

Every substantive note contains these sections in this order:

1. `Operating Summary`
2. `Source-Led Facts`
3. `Operating Procedure`
4. `Boundaries`
5. `Sources`
6. `See Also`

Substantive notes target at least 80 physical lines and at least eight distinct outgoing note targets where the content warrants them.
Hubs, logs, taxonomy notes, gap notes, and short question records are exempt from the distinct-target guideline.
Counting repeated occurrences rewards duplication rather than knowledge structure. The current corpus has about 8.47 distinct outgoing targets per file, rather than the 17.8 raw link-occurrence figure.
Gap notes may be shorter when the digest establishes an absence but supplies too little content for honest expansion.
Do not pad a thin source into a false appearance of depth.

## Citation rules

Put the URL next to the claim it supports.
Keep note paths stable so runtime citations can name an actual file.
For mixed-confidence notes, the frontmatter uses the lowest confidence material that affects the procedure.
The claim ledger may record claim-specific confidence more precisely.
Do not turn an inference into a source claim.

## Prohibited citations

The do-not-cite list in the digest is binding.
Do not reproduce, paraphrase, or cite any blocked claim or blocked source wording from that list.
See [[gaps/No Published Executive Assistant Ethics Code]] for the verified absence.

## Maintenance

[[hot]] stays under 500 words.
[[log]] is append-only with the newest entry first.
Update `updated` only when note content changes.
Update [[references/source-ledger]] when a source is refreshed.
Update [[references/claim-ledger]] when a claim is added, narrowed, or withdrawn.
Use [[meta/Tag Taxonomy]] before creating a new tag.
