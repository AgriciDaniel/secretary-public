---
type: operating-note
title: Threshold Design
domain: escalation
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/escalation", "#type/operating-note", "#confidence/institutional"]
confidence: institutional
related: ["[[escalation/_index]]", "[[escalation/Three-Way Escalation]]", "[[escalation/CCIR]]", "[[judgment/Reversibility as the Master Gate]]"]
source_urls: ["https://rcp.ac.uk"]
---

# Threshold Design

## Operating Summary

NEWS2 demonstrates a threshold architecture with two simultaneous mechanisms.
Several parameter scores are summed into an aggregate band.
A score of 3 on any single parameter triggers review even when the aggregate would not.
For secretary work, the digest encodes an aggregate attention score plus named single-parameter overrides.

## Source-Led Facts

- NEWS2 is a Royal College of Physicians system revised in 2017 ([RCP](https://rcp.ac.uk)).
- It scores six parameters ([RCP](https://rcp.ac.uk)).
- Each parameter receives a score from 0 to 3 ([RCP](https://rcp.ac.uk)).
- The parameter scores sum to a total from 0 to 20 ([RCP](https://rcp.ac.uk)).
- Each aggregate band has a mandated response ([RCP](https://rcp.ac.uk)).
- A score of 3 in one parameter triggers review regardless of the aggregate ([RCP](https://rcp.ac.uk)).
- The digest labels the doctrine institutional.
- The digest also records that the thresholds are actively debated.

## Operating Procedure

The secretary adaptation below is digest-labelled encoding, not a clinical use of NEWS2.

1. Define the attention parameters before processing live items.
2. Define the score range for each parameter.
3. Define the aggregate bands.
4. Define the required response for every band.
5. Define single-parameter overrides separately.
6. Include principal reputation as a candidate override.
7. Include a legal deadline as a candidate override.
8. Include a named VIP as a candidate override.
9. Include irreversibility as a candidate override.
10. Score the parameters independently.
11. Calculate the aggregate deterministically.
12. Check every override before accepting the aggregate result.
13. Escalate when an override fires.
14. Escalate when the aggregate band requires it.
15. Record which mechanism fired.
16. Do not let a low total cancel a single override.
17. Name the required response.
18. Route the response through [[escalation/Three-Way Escalation]].
19. Check [[escalation/CCIR]] for a principal-designated reporting requirement.
20. Check [[judgment/Reversibility as the Master Gate]] before acting.

### Threshold record

- Item:
- Parameter definitions version:
- Individual scores:
- Aggregate score:
- Aggregate band:
- Override checked:
- Override fired:
- Required response:
- Escalation route:
- Decision owner:

### Override discipline

An override must be named in advance.
Its trigger condition must be auditable.
Its response must be explicit.
An override is not an improvised feeling of urgency.
An override does not decide the matter for the principal.

### Aggregate discipline

The total is an attention signal.
It must not erase a severe single factor.
Its bands need explicit responses.
Its calculation should be deterministic.

## Boundaries

- This note does not transfer NEWS2 clinical thresholds into office work.
- It does not claim that the secretary parameters are medically validated.
- The office adaptation is synthesis from the documented architecture.
- Candidate overrides are examples named by the digest.
- A named VIP is an attention trigger, not proof of importance.
- A legal deadline is an override, not permission to give legal judgment.
- An irreversibility override points to [[judgment/Reversibility as the Master Gate]].
- The principal retains decisions reserved by [[ethics/Agency Authority Boundaries]].

## Sources

- Royal College of Physicians, NEWS2: [RCP](https://rcp.ac.uk).
- Research authority: `references/research-digest.md`, Domain 3, “Threshold design.”

## See Also

- [[escalation/_index]]
- [[escalation/Three-Way Escalation]]
- [[escalation/PACE Graded Assertiveness]]
- [[escalation/Two-Challenge Rule]]
- [[escalation/CCIR]]
- [[escalation/Branches and Sequels]]
- [[judgment/Reversibility as the Master Gate]]
- [[ethics/Agency Authority Boundaries]]
- [[communication/I-PASS Briefing Schema]]
- [[failure-modes/Bounded Dissent and Routine Escalation]]
