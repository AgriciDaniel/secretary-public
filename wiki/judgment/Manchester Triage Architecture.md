---
type: operating-note
title: Manchester Triage Architecture
domain: judgment
status: current
created: 2026-08-16
updated: 2026-08-16
tags:
  - "#domain/judgment"
  - "#type/operating-note"
  - "#confidence/evidence-based"
confidence: evidence-based
related:
  - "[[_index|Judgment]]"
  - "[[Reversibility as the Master Gate]]"
  - "[[Urgency and Importance]]"
  - "[[Seven Delegation Levels]]"
  - "[[ESI Resource Counting]]"
  - "[[Reference-Class Forecasting]]"
  - "[[Satisficing]]"
source_urls:
  - "https://plos.org"
---

# Manchester Triage Architecture

## Operating Summary

The Manchester Triage System uses presentation flowcharts.

Each flowchart contains an ordered list of discriminators.

Discriminators are evaluated most-severe-first.

The first match sets the category.

Each category carries a hard maximum time to assessment.

The architecture is suitable as a model for deterministic rule execution.

Its validity evidence carries a major caveat.

Adult sensitivity ranged from 0.47 to 0.87 depending on the hospital operating
the system.

That range must stay attached to any account of the method.

## Source-Led Facts

The Manchester Triage System contains about 52 presentation flowcharts
([PLOS official host](https://plos.org)).

Each flowchart presents discriminators in severity order.

Evaluation proceeds from most severe downward.

The first matching discriminator assigns the urgency category.

Immediate has a maximum assessment time of 0 minutes.

Very urgent has a maximum assessment time of 10 minutes.

Urgent has a maximum assessment time of 60 minutes.

Standard has a maximum assessment time of 120 minutes.

Non-urgent has a maximum assessment time of 240 minutes.

The 2017 PLOS ONE validity study included 288,663 cases.

The digest reports adult sensitivity from 0.47 to 0.87.

The range depended on which hospital operated the system.

The digest interprets this variation as evidence that consistency of application
dominates.

The digest says this supports machine execution.

Method confidence is `institutional`.

Validity-data confidence is `evidence-based`.

This note uses the evidence-based tag because it foregrounds the validation
caveat as well as the architecture.

## Operating Procedure

The following Secretary translation is synthesis directed by the digest.

1. Define a presentation class for the incoming item.
2. Associate that class with an ordered discriminator list.
3. Order the list from most severe to least severe.
4. Test each discriminator in order.
5. Stop at the first match.
6. Assign the category attached to that match.
7. Attach the category's response limit.
8. Record the exact discriminator that matched.
9. Do not average multiple matches into a new score.
10. If no discriminator matches, use the declared fallback.
11. Keep rule versions stable enough to compare application.
12. Route duration estimates through [[Reference-Class Forecasting]].
13. Route autonomy through [[Seven Delegation Levels]].
14. Route irreversible acts through [[Reversibility as the Master Gate]].

Consistency should come from explicit ordering and a recorded first match.

This procedure does not claim clinical validity for Secretary triage.

## Boundaries

The five clinical times describe Manchester categories.

They are not Secretary service-level targets.

Do not copy the times into office policy without separate authority and evidence.

The 0.47 to 0.87 sensitivity range is not optional context.

Do not report the method as uniformly accurate.

The hospital dependence prevents a clean context-free accuracy claim.

The digest does not supply specificity values for this note.

The digest does not validate a Secretary discriminator list.

Any such list must be identified as policy or synthesis.

Do not conflate this first-match architecture with the resource bands in
[[ESI Resource Counting]].

Do not let a first-match rule override the importance separation in
[[Urgency and Importance]].

Do not use a triage category as an authority grant.

Use [[Satisficing]] for option search, not for skipping discriminator order.

## Sources

- Zachariasse et al., Validity of the Manchester Triage System in emergency care, PLOS ONE 12(2), e0170811, 2017: [official host supplied by the digest](https://plos.org).
- Brain authority: [[references/research-digest|research digest]], Domain 2.

## See Also

- [[_index|Judgment]] for the domain map.
- [[Reversibility as the Master Gate]] for the first action gate.
- [[Urgency and Importance]] for independent priority.
- [[Seven Delegation Levels]] for category authority.
- [[ESI Resource Counting]] for a separate triage-derived sorter.
- [[Reference-Class Forecasting]] for estimates.
- [[Satisficing]] for search termination.
- [[Manchester Triage Architecture#Boundaries|Boundaries]] for the validity limit.
