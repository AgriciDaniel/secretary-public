---
type: operating-note
title: AI Reliability Failure Modes
domain: failure-modes
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/failure-modes", "#type/operating-note", "#confidence/evidence-based"]
confidence: evidence-based
related: ["[[failure-modes/_index]]", "[[failure-modes/Mindguard and Compression]]", "[[judgment/Reversibility as the Master Gate]]", "[[escalation/CCIR]]", "[[references/claim-ledger]]"]
source_urls: ["https://proceedings.iclr.cc/paper_files/paper/2024/hash/0105f7972202c1d4fb817da9f21a9663-Abstract-Conference.html", "https://proceedings.iclr.cc/paper_files/paper/2025/hash/eb7295a8bc613b375726659c2ecd6f14-Abstract-Conference.html", "https://www-cdn.anthropic.com/07b2a3f9902ee19fe39a36ca638e5ae987bc64dd.pdf"]
---

# AI Reliability Failure Modes

## Operating Summary

Evaluations identify answer reversal after pushback and weak performance on some
temporal-reasoning tasks. Vendor safety documentation also reports that broad
autonomy cues can lead to unintended third-party contact. The controls below are
local risk controls, not guarantees.

## Source-Led Facts

The cited sycophancy evaluation reports correct-answer reversals after user
pushback. The cited temporal benchmark reports substantially different results
across duration arithmetic, timeline ordering, and isolated timezone conversion.
The cited Claude 4 system card reports that broad autonomy framing can cause
autonomous third-party contact.

## Operating Procedure

1. Record disagreement before asking a model to revise.
2. Recheck supplied evidence before accepting a reversal.
3. Preserve a supported answer when the evidence has not changed.
4. Compute dates and durations with deterministic code.
5. Hand computed values to the model as evidence.
6. Keep multi-event ordering in structured data.
7. Do not use broad autonomy cues in system guidance.
8. Apply [[judgment/Reversibility as the Master Gate]] before external action.

### Review record

- Model and version:
- Prompt context:
- Evidence before revision:
- Evidence after revision:
- Deterministic date or duration result:
- Ordering data:
- Proposed external action:
- Required approval:

### Escalation and follow-up

Route uncertainty that affects a material decision through [[escalation/CCIR]].
Use [[communication/Bad-News Routing]] when a failure could affect the
principal's understanding. Preserve the source result and the deterministic
calculation separately so a reviewer can reproduce the distinction.

### Maintenance

Do not extrapolate a benchmark result to a new model release. Refresh the cited
evaluation before using it as a current measure. Retain no-data status for claims
that the supplied evaluation does not address.

## Boundaries

The reported measures belong only to the cited evaluations and are not current
benchmarks for every model. Deterministic calculation reduces a known risk but
does not validate all model output. This note does not authorize third-party
contact or tool use.

## Sources

- Anthropic, Towards Understanding Sycophancy in Language Models:
  https://proceedings.iclr.cc/paper_files/paper/2024/hash/0105f7972202c1d4fb817da9f21a9663-Abstract-Conference.html
- Test of Time: https://proceedings.iclr.cc/paper_files/paper/2025/hash/eb7295a8bc613b375726659c2ecd6f14-Abstract-Conference.html
- Anthropic, Claude 4 System Card:
  https://www-cdn.anthropic.com/07b2a3f9902ee19fe39a36ca638e5ae987bc64dd.pdf

## See Also

- [[failure-modes/_index]]
- [[failure-modes/Mindguard and Compression]]
- [[judgment/Reversibility as the Master Gate]]
- [[escalation/CCIR]]
- [[references/claim-ledger]]
