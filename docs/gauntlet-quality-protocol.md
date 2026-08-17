# Gauntlet quality protocol

Secretary adopts the useful mechanics of the Gauntlet Loop without importing unlimited iteration, blanket parallelism, self-grading, or perfection rhetoric.

## Operating sequence

1. Decide fit. The requested artefact must be inspectable, the evidence boundary must be adequate, and the acceptance criteria must be observable.
2. Freeze the job. Record the goal, non-goals, authority, acceptance criteria, evidence boundary, protected checks, and stop conditions before judging quality.
3. Route by coupling. A normal Secretary run uses one child context and does not spawn research subagents. A quality job may declare sequential, parallel, or mixed work, but parallel or mixed work requires one integration owner. Independent work belongs outside the controller and its final reports must be supplied as evidence before synthesis.
4. Inspect outcomes. Deterministic checks and direct artefact evidence outrank model preference or self-description.
5. Separate production from acceptance. Same-context review is not independent. Required fresh-context or human review stays unperformed until it actually occurs.
6. Preserve provenance. Use only `[RAW]`, `[FETCH]`, `[SEARCH]`, or `[INFER]`, with no blended label spanning direct and delegated inspection.
7. Stop honestly. Use `passed`, `improved_not_passed`, `inconclusive`, `blocked`, `budget_stopped`, or `needs_human_decision` with a matching stop reason.
8. Preserve authority. Real-world action still halts at `needs_approval` and may execute only through a narrow typed adapter after exact human approval.

## Protected gates

- Do not change tests, references, thresholds, evidence records, or review requirements to manufacture acceptance.
- A matching string proves presence, not support.
- A named human alone may attest that a passage supports a claim.
- High confidence requires complete `[RAW]` evidence and `human_supports` attestation.
- Missing delegated output, status events, and monitor notifications cannot be synthesized into a result.
- A model judge cannot override truth, safety, authority, or human gates.

## Current boundary

The normal controller enforces the result schema, evidence disclosure, citation loading, provenance constraints, quality outcome consistency, and backend completion envelope.

The separate `quality` command family now provides an auditable Gauntlet lane:

1. `quality freeze` validates and freezes the job, a hash-bound baseline, a hash-bound local reference, protected gates, reference-use confirmation, scheduling rationale, hard resource ceilings, reviewer policy, and authority boundary.
2. `quality packet` freezes the real artifact and creates an iteration packet bound to the frozen job and one declared builder.
3. A fresh model context or human reviewer inspects that packet and artifact outside the producing context.
4. `quality review` rejects self-sign-off, missing gates, missing dimensions, hash substitution, false passing outcomes, unmet fresh-context or blind-order requirements, unbounded evidence, and gate evidence whose live hash does not match.
5. `quality status` computes the terminal outcome from immutable reviews, resource usage, regression policy, plateau policy, and the acceptance contract. Because reviewer provenance and gate execution are not authenticated, a submitted `passed` recommendation becomes `needs_human_decision`, never controller-certified acceptance.

The quality controller does not launch builders, reviewers, tools, or paid provider calls. It coordinates evidence and decisions without inheriting authority. A reviewer file is evidence submitted to the controller, not proof that the reviewer was competent, fresh, blind, or correct. Resource usage is reviewer-declared rather than provider-metered. Hashes prove byte consistency, not that an evidence file supports the gate claim. Human acceptance remains necessary wherever the principal or domain policy requires it.

## Why these controls exist

The original Claude of Duty report records improvement, but not benchmark victory. Scores moved from 3.59 to 4.14, regressed to 4.05, and later reached 5.05 out of 10. Every reported blind critic still preferred the real Call of Duty reference. The same report says sequential single-owner work outperformed parallel directory ownership for coupled rendering concerns. These results support iterative external evaluation, honest regression handling, and coupling-aware scheduling. They do not support perfection claims or blanket fan-out. See the [first-party project assessment](https://github.com/mshumer/Claude-of-Duty/blob/main/README.md) and the [origin article](https://somethingbig.ai/gauntlet-loop).

Google Research reports the same routing lesson across a broader controlled comparison: centralized multi-agent coordination helped a parallel task, while every tested multi-agent configuration degraded the sequential PlanCraft task. This is evidence for architecture matching, not a universal multi-agent advantage. See [Towards a Science of Scaling Agent Systems](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/).

## Outcome vocabulary

- `passed`: a submitted reviewer recommendation that all blocking gates passed, the score threshold was met, no regression was recorded, and required review conditions were satisfied. The current controller records it as `reported_review_outcome` and returns `needs_human_decision`.
- `improved_not_passed`: the scored candidate exceeded the scored frozen baseline by the required delta, but a material regression or plateau forced a stop.
- `not_passed`: a stop condition fired without evidence of improvement over the frozen baseline.
- `inconclusive`: the reviewer could not establish the result from the available artifact and evidence.
- `budget_stopped`: an iteration, time, token, or cost ceiling was reached.
- `needs_human_decision`: acceptance or conflict requires principal adjudication.
- `ready_for_artifact`, `awaiting_review`, and `ready_for_next_iteration`: non-terminal controller states, not success claims.
