# Changelog

All notable changes to Secretary are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Secretary is experimental. A version tag records a development milestone, not a
claim that the project is ready for consequential use. See README section 1.

## [Unreleased]

### Security

- Added a consent-separated personalization boundary. Local persistence and
  provider use are distinct choices, session-only and save-nothing setup write
  no state, a remembered decline stores no preferences, and provider prompts
  receive no personalization bytes without consent.
- Installed canonical surfaces now carry a validated exact controller link and
  instruct the host to stop on source relocation or replacement instead of
  searching for another runtime or simulating prose-only setup. Static tests do
  not prove host-model obedience.
- Hardened personalization and installer paths with no-follow reads, handle-based
  atomic permissions, target and source-overlap rejection, final-symlink checks,
  conservative stale-lock recovery, and negative consent-conflict tests.
- Split exact-string locator verification from human claim-support attestation.
  Assistant and tool verification can prove frozen bytes contain a unique string,
  but only a named human can record `supports`, `partial`, or `insufficient`.
- Added a strict human-support gate and `release:ready`. The eight current research
  rows remain `pending`, so strict release readiness fails until the principal
  reviews and signs them.
- Bound result citations to loaded brain note bodies, URLs present in those bodies,
  frozen claim-evidence rows, and complete raw evidence paths. A model cannot
  self-report `human_supports` or high confidence without matching controller-owned
  evidence.
- Codex status, timer, monitor, `waiting`, and delegated-report events cannot count
  as completion. A final `turn.completed` remains mandatory.
- Canonical installed surfaces now carry ownership markers. Installation validates
  every collision before writing and rejects parent symlinks, non-directory path
  components, and unowned content.
- The quality controller no longer turns a reviewer-declared pass into certified
  acceptance. Until reviewer identity and deterministic gate execution have
  authenticated provenance, status terminates at `needs_human_decision`.

### Added

- Added host-specific operational preludes for `/secretary` and `$secretary`,
  covering the linked controller, reviewed non-TTY onboarding, temporary-file
  cleanup, explicit backend and model pairs, the run lifecycle, and the
  `needs_approval` halt.
- Added `public:ready`, a read-only projection acceptance command that runs the
  shipped deterministic gates and fails unless strict support returns exactly
  the declared public-evidence omission.
- Added a hash-and-marker-validated installation manifest, dry-run uninstall,
  confirmed manifest-bound uninstall, and side-effect-free `-h` and `--help`
  output for the installer, uninstaller, and controller CLI.
- Added the `principal` first-run console and lifecycle for status, setup,
  inspection, confirmed allowlisted changes, pause, resume, export, reset,
  deletion, and diagnostics.
- Added first-run and personalization documentation covering consent, excluded
  data, precedence, prompt snapshot limits, and private local state.
- Public-facing README navigation, Free and Pro AI Marketing Hub community
  links, governed repository metadata, support guidance, release notes, issue
  forms, pull-request checklist, Code of Conduct, and CODEOWNERS.
- Public export coverage for the release, support, and community-health files.
- CI coverage for the governed source-type gate.
- Bounded Gauntlet quality protocol with task fit, frozen acceptance criteria,
  protected gates, one-context integration ownership, explicit review independence,
  typed quality outcomes, and honest stop reasons.
- File-backed `quality freeze`, `quality packet`, `quality review`, and
  `quality status` commands with versioned job and review schemas, artifact and job
  hash binding, fresh-context review, deterministic stop logic, and no provider or
  action authority.
- Offline delegated-status-laundering scenario with a negative control for premature
  synthesis from a missing research report.
- Automatic bounded loading of raw extracts associated with selected brain notes.
- Public contribution, security-reporting, CI, and quality-job example files.

### Changed

- Simplified the newcomer README path around the experimental boundary,
  source-linked Claude Code and Codex installation, invocation, provider data
  transmission, and human approval.
- Reframed Printing Press as static policy and future integration design. Live
  catalog lookup, package installation, account connection, and adapters remain
  unimplemented.
- Documented the private canonical repository and fresh-history public
  projection as separate publication boundaries. Public-facing instructions no
  longer assume a fixed repository owner or name.
- Replaced the modified Apache-2.0 text with the canonical Apache Software
  Foundation text and added pending visual-asset provenance and GitHub public
  settings checklists.
- Removed the undeclared `research` label from the research-correction issue
  form. The form continues to use the existing `documentation` label.
- Replaced the README hero and Trust boundary artwork with the new Secretary
  second-brain visual system while preserving stable asset paths. Updated the
  hero alternative text for the new composition.
- Promoted `/secretary` near the beginning of the README as the primary
  human-facing entry point, with Claude Code and Codex invocation, request and
  result expectations, installation, and approval-boundary guidance.

### Corrected

- Test-spawned controller and adversarial subprocesses now remove inherited npm
  and Node test lifecycle markers. This fixes six file-level failures that were
  hidden when the same test files were run directly outside `npm test`.
- The v0.2.0 entry below says the citation gate required a human-signed support
  judgment. The old shape required only a non-empty `verified_by` string and could
  accept an assistant statement that human attestation was still pending. The new
  schema makes that state unrepresentable as human support.

## 0.2.0 - 2026-08-16

Pre-release. Cryptographic and state foundations for the approval path, plus the
first two verification gates. No new user-facing capability: the `approve` and
`execute` subcommands are still absent, so an action-capable result still halts
at `needs_approval` with no route forward.

### Security

- `canonicalJson` is now actually canonical. It rejects `undefined`, non-finite
  numbers, functions, and symbols, rejects the `__proto__`, `constructor`, and
  `prototype` keys, normalizes every string and object key to NFC, and bounds
  depth at 64 and output at 1 MiB, raising a typed `CanonicalJsonError` instead
  of a stack-overflow `RangeError`. Output is unchanged for pure-ASCII input,
  which is proved by test.
- Fixed a hash collision: `NaN` and `null` previously produced identical
  canonical text because `JSON.stringify(NaN)` returns `"null"`.
- Fixed a visual-confusion hazard: NFC and NFD spellings of the same path
  previously produced different hashes while rendering identically, so a human
  could approve a target indistinguishable from another.
- Added `grantSha256`, a controller-side approval hash whose preimage binds the
  version tag `secretary.grant/1`, the run ID, the approval ID, the action type,
  the action, an expiry, and the allowed root. The same action in two different
  runs no longer produces the same hash.
- `actionSha256` is deliberately unchanged. It remains the child's commitment to
  a specific action, and the child cannot know controller-only fields. Verified
  byte-identical against the previous implementation.
- Audit events are hash-chained through a required `prev_event_sha256`, with a
  new `verifyAuditChain` export that reports the index of the first break.
- `validateResultIntegrity` no longer propagates a canonicalization failure on
  untrusted model output; it converts it to an integrity error.

### Added

- Behavioural evaluation harness under `tests/behaviour/`, with structural
  predicates asserted directly against the result schema, a scenario format
  designed to be cheap to extend, and a negative control that reproduces the
  historical failure mode to prove the assertions bite. Offline runs are labelled
  `[offline: canned result, not behavioural evidence]` because the backend is
  canned and the run tests the assertion machinery, not model behaviour.
- Citation-integrity gate at `scripts/check-evidence.mjs`, enforcing that a
  quoted passage resolves exactly once in a stored local extract whose hash
  matches, and that the source resolves in the ledger. The original attestation
  shape required only non-empty verifier text and did not prove a human signed
  the support judgment. See the Unreleased correction. Seven negative controls
  proved the original mechanical checks failed when expected.
  A `--report` mode lists the 44 bare-domain ledger entries as a work dashboard.
- Run-state phases `awaiting_approval`, `approved`, `executing`, `executed`, and
  `expired`, reachable only along an enforced transition map.
- Audit kinds `approval_granted`, `approval_denied`, `approval_expired`, and
  `approval_executed`.
- Scripts `test:behaviour`, `check:evidence`, and `report:evidence`.

### Changed

- `assets/cover-web.jpg` re-encoded from the master at quality 97 with 4:4:4
  chroma, 774 KB to 648 KB, text region measured at 45.6 dB PSNR.

### Known gaps

- No `approve` or `execute` subcommand. The approval loop is open.
- `transitionRun` is read-then-write, not compare-and-swap. Approval consumption
  must not be built on it as it stands.
- The behavioural suite has one scenario. By the rule of three that bounds the
  failure rate at nothing. The instrument exists; the measurements do not.
- The evidence gate runs against an empty ledger. None of the 44 bare-domain
  entries are fixed yet.
- Ledger `source_type` is free text, with 49 distinct values across 65 sources.
  It needs a controlled vocabulary.

## 0.1.0 - 2026-08-16

Initial private milestone: cross-runtime spawn layer for Claude Code and Codex,
generated instruction surfaces, evidence pipeline, brain retrieval, two profiles,
and the review-council response covering licensing, citation integrity, and an
honest README.
