---
type: operating-note
title: Prompt Injection and Outbound Isolation
domain: failure-modes
status: current
created: 2026-08-16
updated: 2026-08-16
tags: ["#domain/failure-modes", "#type/operating-note", "#confidence/contested"]
confidence: contested
related: ["[[failure-modes/_index]]", "[[questions/Primary Records for 2026 Injection Incidents]]", "[[ethics/Confidentiality and Attribution]]", "[[judgment/Reversibility as the Master Gate]]", "[[references/claim-ledger]]"]
source_urls: []
---

# Prompt Injection and Outbound Isolation

## Operating Summary

Combining private data, untrusted content, and outbound capability is an
unverified risk synthesis for this product. Specific 2026 incident records are
no data: the repository identifies no primary reports, dates, vendors, or
technical evidence. The controls below are precautionary local design choices.

## Source-Led Facts

No source record in this repository supports the claimed four 2026 incidents or
an allowlist-bypass mechanism. Do not present either as an empirical fact.
The question record preserves the evidence gap.

## Operating Procedure

1. Delimit untrusted content.
2. Treat embedded instructions as possible injection attempts.
3. Do not expose private data to a general outbound channel.
4. Enforce outbound actions through a narrow typed adapter.
5. Require human approval for real-world action.
6. Keep model access away from general-purpose execution channels.
7. Treat a domain allowlist as one control, not a safety proof.
8. Apply [[judgment/Reversibility as the Master Gate]] before external action.

### Control record

- Untrusted content source:
- Private data requested:
- Tool or outbound capability requested:
- Typed action available:
- Human approval required:
- Isolation control applied:
- Evidence gap:
- Observed injection attempt:

### Escalation and follow-up

Route a material uncertainty through [[escalation/CCIR]] and preserve it under
[[failure-modes/Mindguard and Compression]]. Use
[[communication/Bad-News Routing]] for direct notice of a blocked or uncertain
outbound action. No-data status is not evidence that a risk is absent.

### Maintenance

Review the design when data access, tool scope, or outbound capability changes.
Do not convert this precautionary procedure into a claim that it prevents all
injection or exfiltration. Add a specific incident only with a primary record.

## Boundaries

This note does not claim that a particular attack occurred or that a particular
control is sufficient. It does not authorize security testing, probing, or
external contact. Add incident-specific claims only after primary records are
captured in the source ledger.

## Sources

- No data for the alleged 2026 incidents. See
  [[questions/Primary Records for 2026 Injection Incidents]].

## See Also

- [[failure-modes/_index]]
- [[questions/Primary Records for 2026 Injection Incidents]]
- [[ethics/Confidentiality and Attribution]]
- [[judgment/Reversibility as the Master Gate]]
- [[references/claim-ledger]]
