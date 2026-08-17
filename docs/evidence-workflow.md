# Claim evidence workflow

The locator gate proves that a quoted passage exists verbatim in a frozen local extract. A human separately decides whether that passage supports the claim. A retrieved URL, an HTTP success response, a model-generated fetch summary, or an agent report does not prove support.

For each source:

1. A human opens the source and manually creates `references/evidence/<source_id>/extract.md`. Do not use an automated HTML-to-Markdown extractor.
2. A human chooses only the passage needed for one claim and records the source's reuse basis. For paywalled or otherwise restricted sources, do not presume that a short quotation is permitted. Obtain a rights-cleared excerpt or permission, use an original paraphrase where appropriate, or record that the claim cannot enter the public corpus.
3. Record a TextQuoteSelector in `references/claim-evidence.json`: `exact`, plus up to 32 characters of immediate `prefix` and `suffix` context. Empty context is allowed at an extract boundary.
4. Hash the frozen bytes with `sha256sum references/evidence/<source_id>/extract.md`, then record the lowercase digest as `extract_sha256`.
5. Add the remaining row fields. `source_id` must exist in `references/source-ledger.json`, and `note_path` must name the `wiki/...md` note containing the claim.
6. Record exact-string verification under `locator_verification`. Set `actor_type` honestly to `human`, `assistant`, or `tool`. This proves presence only.
7. A named human reviewer records `supports`, `partial`, or `insufficient` under `support_attestation`. Until then, use `pending`, `attester_type: "none"`, and null attestation identity and time.
8. Run `node scripts/check-evidence.mjs` for locator integrity. Run `node scripts/check-evidence.mjs --require-human-support` for the strict support gate. Use `node scripts/check-evidence.mjs --report` for the citation-work dashboard, or add `--json` for machine-readable output.

The irreducibly human steps are choosing the passage, judging support, and deciding whether a claim survives when no usable URL can be found. An assistant may verify the hash and unique string without becoming the support attester. `insufficient` is a blocker. `partial` is not mechanically upgraded to `supports`, and `pending` blocks the strict release gate.
