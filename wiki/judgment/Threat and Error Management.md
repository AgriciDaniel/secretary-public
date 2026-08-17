---
type: operating-note
title: Threat and Error Management
domain: judgment
status: current
created: 2026-08-17
updated: 2026-08-17
tags:
  - "#domain/judgment"
  - "#type/operating-note"
  - "#confidence/institutional"
confidence: institutional
related:
  - "[[_index|Judgment]]"
  - "[[Reversibility as the Master Gate]]"
  - "[[Manchester Triage Architecture]]"
  - "[[escalation/Branches and Sequels]]"
  - "[[escalation/Threshold Design]]"
  - "[[failure-modes/AI Reliability Failure Modes]]"
  - "[[communication/Briefing and Debriefing]]"
  - "[[duties/Duty Taxonomy and Priority]]"
source_urls:
  - "https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-90.pdf"
---

# Threat and Error Management

## Operating Summary

Separate what arrived from what you did.

In the FAA aviation model, a threat originates outside the flightcrew's
influence, increases flight complexity, and requires crew attention and
management to preserve safety margins.

In that model, an error is crew action or inaction that deviates from crew or
organisational intentions or expectations.

An undesired aircraft state is a safety-compromising aircraft condition that
results from flightcrew action and ineffective error management.

The following staff-work use is an adapted synthesis, not an FAA classification
or an aviation safety programme. Its value is to force the secretary to say
which link it is considering.

An inbound problem the principal did not cause can be treated as a threat when
it has increased decision complexity and needs attention.

A staff-work slip can be treated as an error when it departs from an identified
intent or expectation.

A position where the principal's options are already narrowed can be treated as
an undesired-state analogue and handled differently from the other two.

## Source-Led Facts

FAA Advisory Circular 120-90 defines the model in Appendix 1
([AC 120-90](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-90.pdf)).

The circular defines a threat as "an event or error that occurs outside the
influence of the flightcrew", which increases operational complexity and requires
attention if safety margins are to be maintained.

It defines a mismanaged threat as a threat that is linked to or induces crew
error.

It defines crew error as "action or inaction that leads to a deviation from crew
or organizational intentions or expectations".

It defines an undesired aircraft state as a position, condition, or attitude that
"clearly reduces safety margins" and results from crew action.

It states that an undesired state results from ineffective error management.

The circular states that "TEM is not crew resource management (CRM) and should
not be considered a replacement for it".

It states the two refer to overlapping but not equivalent activities.

The circular is dated 4/27/06 and its status is Active.

Its authority is over United States air carrier operations.

It is not binding on this system.

## Operating Procedure

The following procedure is synthesis directed by the digest.

1. For each item, classify it as threat, error, or undesired state.
2. Name who or what originated it, and do not blur origin with responsibility.
3. For a threat, state what attention it requires and by when.
4. For an error, state the deviation from intent that defines it as an error.
5. For an undesired state, state which options have already been foreclosed.
6. Never present an undesired state as though it were still a threat.
7. That misclassification hides the fact that margin is already gone.
8. Escalate undesired states directly, under [[escalation/Branches and Sequels]].
9. Set detection thresholds using [[escalation/Threshold Design]].
10. Apply [[Reversibility as the Master Gate]] before proposing any recovery action.

If the classification is ambiguous, record the ambiguity rather than choosing the
more comfortable category.

The comfortable category is usually threat, because it assigns no fault.

## Boundaries

This note adopts a taxonomy, not an aviation safety programme.

It does not import training requirements.

It does not establish that Threat and Error Management improves outcomes.

The circular defines the model and does not supply effectiveness evidence.

Record `no data` on effectiveness.

This note does not claim the model was validated for administrative work.

The transfer is synthesis and is labelled as such.

Do not describe the secretary as operating a safety management system.

Do not use the phrase authority gradient as if it were doctrine from this source.

That phrase does not appear in the circular.

## Sources

- FAA Advisory Circular 120-90, Line Operations Safety Audits, 4/27/06: [AC 120-90](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_120-90.pdf).
- Stored extract: `references/evidence/faa-ac-120-90-tem/extract.md`.
- Brain authority: [[references/research-digest|research digest]], Domain 7.

## See Also

- [[_index|Judgment]] for the domain map.
- [[Reversibility as the Master Gate]] for the recovery classification.
- [[Manchester Triage Architecture]] for ordered discriminators.
- [[escalation/Branches and Sequels]] for contingency routing.
- [[escalation/Threshold Design]] for detection thresholds.
- [[failure-modes/AI Reliability Failure Modes]] for machine-specific errors.
- [[communication/Briefing and Debriefing]] for the countermeasure with outcome evidence.
- [[duties/Duty Taxonomy and Priority]] for where items enter.
