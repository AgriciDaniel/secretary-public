---
type: operating-note
title: Three-Way Escalation
domain: escalation
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/escalation", "#type/operating-note", "#confidence/contested"]
confidence: contested
related: ["[[escalation/_index]]", "[[escalation/Threshold Design]]", "[[escalation/PACE Graded Assertiveness]]", "[[escalation/Two-Challenge Rule]]", "[[ethics/Agency Authority Boundaries]]"]
source_urls: []
---

# Three-Way Escalation

## Operating Summary

Every escalation resolves to one of three routes:

1. Absorb the matter within the secretary's capability and authority.
2. Escalate functionally when the missing element is capability.
3. Escalate hierarchically when the missing element is authority.

The functional and hierarchical escalation distinction is cited to ITIL, but no
reachable primary document supports the asserted split. The local three-way
procedure is contested synthesis, not ITIL doctrine.
The operating purpose is to avoid presenting a capability problem to the principal as though it were an authority decision.

## Source-Led Facts

No data identifies a primary ITIL record for this distinction. The terms are
retained only as a local descriptive convention:

- A capability gap may be routed to a capable function.
- An authority gap may be routed to the accountable level.
- The repository does not attribute this local split to ITIL.

## Operating Procedure

The following procedure is digest-labelled encoding, not a quoted ITIL workflow.

1. State the matter in one sentence.
2. Name the pending outcome.
3. Check whether the secretary has the capability to produce that outcome.
4. Check whether the secretary has authority to produce that outcome.
5. Keep those checks separate.
6. If both checks pass, select `absorb`.
7. If capability fails, select `escalate_functionally`.
8. If authority fails, select `escalate_hierarchically`.
9. If both fail, record both limits.
10. Route the capability need sideways.
11. Route the authority decision upward.
12. Do not relabel missing expertise as a principal decision.
13. Do not relabel missing permission as a research task.
14. Name the chosen route in the escalation record.
15. Name the evidence supporting the limit.
16. Name what would close the limit.
17. Attach the smallest useful briefing.
18. Preserve any dissent through compression.
19. Apply [[escalation/Threshold Design]] if the timing itself is uncertain.
20. Apply [[ethics/Agency Authority Boundaries]] before implying external commitment.

### Route record

- Matter:
- Outcome needed:
- Capability available: yes or no
- Authority available: yes or no
- Selected route:
- Evidence:
- Next owner:
- Decision deadline:
- Dissent preserved:

### Absorb

Absorb only when both capability and authority are present.
Keep the work within the delegated category.
Return completed staff work at the agreed level.

### Functional escalation

State the missing capability precisely.
Route to a source or role that can supply it.
Keep the principal out of a sideways routing problem unless another trigger requires attention.

### Hierarchical escalation

State the missing authority precisely.
Present the decision, recommendation, and consequence.
Do not imply that the principal already approved it.

## Boundaries

- This note does not create a priority taxonomy.
- It does not assign P1 to P5 meanings.
- It does not invent SLA minutes.
- It does not authorize a child process to act.
- It does not let a capability shortage expand delegated authority.
- It does not let an authority shortage be hidden by more analysis.
- `Absorb` is not a license to exceed [[ethics/Agency Authority Boundaries]].
- A threshold breach may still require [[escalation/Threshold Design]].

## Sources

- ITIL functional and hierarchical escalation: cited-but-unlinked, no data for
  a claim-level primary source.
- Research authority: `references/research-digest.md`, Domain 3, “The three-way split.”

## See Also

- [[escalation/_index]]
- [[escalation/Threshold Design]]
- [[escalation/PACE Graded Assertiveness]]
- [[escalation/Two-Challenge Rule]]
- [[escalation/CCIR]]
- [[escalation/Branches and Sequels]]
- [[ethics/Agency Authority Boundaries]]
- [[communication/I-PASS Briefing Schema]]
- [[failure-modes/Bounded Dissent and Routine Escalation]]
- [[judgment/Reversibility as the Master Gate]]
- [[questions/_index]]
