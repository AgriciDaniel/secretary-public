---
type: operating-note
title: "I-PASS Briefing Schema"
domain: communication
status: current
created: 2026-08-16
updated: 2026-08-16
tags:
  - "#domain/communication"
  - "#type/operating-note"
  - "#confidence/evidence-based"
confidence: evidence-based
related: ["[[communication/_index]]", "[[communication/Ministerial Decision Memo]]", "[[communication/BLUF and Numeric Writing Constraints]]", "[[communication/Bad-News Routing]]", "[[communication/No-Surprises Protocol]]", "[[escalation/_index]]", "[[judgment/_index]]", "[[failure-modes/_index]]"]
source_urls: ["https://www.nejm.org/"]
---

# I-PASS Briefing Schema

## Operating Summary

Use I-PASS as the default briefing schema when responsibility or attention passes
from the Secretary to the principal or another receiver.

The five slots are Illness severity, Patient summary, Action list, Situation
awareness and contingency planning, and Synthesis by receiver
([NEJM](https://www.nejm.org/)).

For Secretary work, the labels can describe a matter rather than a patient, but
the structure must remain visible. This adaptation is synthesis from the sourced
handoff structure, not a new empirical claim.

The two non-negotiable elements are the contingency slot and receiver synthesis.
They protect against a briefing that sounds complete but leaves the receiver
without a response to changed conditions or a chance to demonstrate understanding.

## Source-Led Facts

- Starmer and colleagues evaluated the I-PASS handoff program across nine hospitals
  and 10,740 admissions ([NEJM](https://www.nejm.org/)).
- Medical errors fell 23 percent, from 24.5 to 18.8 per 100 admissions
  ([NEJM](https://www.nejm.org/)).
- Preventable adverse events fell 30 percent, from 4.7 to 3.3 per 100 admissions
  ([NEJM](https://www.nejm.org/)).
- Verbal handoff time did not worsen in the reported evaluation
  ([NEJM](https://www.nejm.org/)).
- I-PASS explicitly includes situation awareness and contingency planning
  ([NEJM](https://www.nejm.org/)).
- I-PASS explicitly includes synthesis by the receiver
  ([NEJM](https://www.nejm.org/)).
## Operating Procedure

### 1. Illness severity

Synthesis: replace the clinical label only in the content, not in the slot.

- State the matter's present condition in one explicit line.
- Name whether the receiver must act now, monitor, or simply retain awareness.
- If the line contains bad news for the principal, apply
  [[communication/Bad-News Routing]] and state it directly.
- If a threshold has been crossed, connect the line to [[escalation/_index]].

### 2. Patient summary

- Give only the facts needed to orient the receiver.
- Preserve any material contradiction rather than smoothing it away.
- Use [[communication/BLUF and Numeric Writing Constraints]] to keep the summary
  readable in a single rapid pass.
- Distinguish verified facts from the Secretary's synthesis.

### 3. Action list

- State each action with an owner.
- State each action's timing when the supplied evidence defines it.
- Separate a requested principal decision from work already within delegated scope.
- For a signable decision, link to [[communication/Ministerial Decision Memo]].
- Do not turn an unresolved authority question into an implied instruction.

### 4. Situation awareness and contingency planning

- Name the condition most likely to change the plan.
- State the response if that condition occurs.
- Preserve the source and confidence of any trigger presented as factual.
- Link early-notification conditions to [[communication/No-Surprises Protocol]].
- Keep dissent visible, using [[failure-modes/_index]] as the boundary against
  compression that drops disconfirmation.

### 5. Synthesis by receiver

- Ask the receiver to state the decision, action, or understanding in their own words.
- Compare that synthesis with the action list and contingency statement.
- Correct a mismatch before treating the handoff as complete.
- Record unresolved differences instead of silently choosing one interpretation.

This receiver step is read-back, not a request for ceremonial acknowledgment.
That sentence is operational synthesis grounded in the sourced I-PASS structure.

## Briefing Template

1. **Illness severity:** present condition and attention level.
2. **Patient summary:** verified situation, relevant history, and material dissent.
3. **Action list:** action, owner, and supported timing.
4. **Situation awareness and contingency planning:** trigger, consequence, response.
5. **Synthesis by receiver:** receiver's understanding, checked against the brief.

## Boundaries

- I-PASS standardizes a handoff. It does not decide when authority exists.
- The clinical outcome evidence does not prove an identical effect in secretary work.
- The transfer into this domain is therefore synthesis and must remain labeled.
- A read-back does not create consent, ratification, or delegated authority.
- A concise briefing may not delete dissent or a known contradiction.
- Do not convert the medical labels into invented severity thresholds.
- Use [[judgment/_index]] for the decision gate and [[escalation/_index]] for the
  route when capability or authority is missing.

## Sources

- [New England Journal of Medicine](https://www.nejm.org/), Starmer et al.,
  "Changes in Medical Errors after Implementation of a Handoff Program," 2014,
  as summarized in `references/research-digest.md`.

## See Also

- [[communication/_index]]
- [[communication/Ministerial Decision Memo]]
- [[communication/BLUF and Numeric Writing Constraints]]
- [[communication/Bad-News Routing]]
- [[communication/No-Surprises Protocol]]
- [[escalation/_index]]
- [[judgment/_index]]
- [[failure-modes/_index]]
