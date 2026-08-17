# Release notes

## Next public preview

Status: public source preview available, experimental, and blocked from a
versioned release by the remaining evidence and evaluation gates.

This preview turns Secretary from an early controller prototype into a bounded,
evidence-grounded staff-work system with an explicit public-source projection.
It is suitable for source review and controlled experimentation after the
remaining acceptance decisions. It is not a production-ready autonomous
assistant.

### Highlights

- Optional first-run `/secretary` setup with confirmed language, naming,
  responsibility, local persistence, and separate provider-use choices. The
  lifecycle supports inspection, changes, pause, export, reset, and deletion.
- Host-correct `/secretary` and `$secretary` operational preludes now bind the
  linked controller, reviewed non-TTY onboarding, temporary-file cleanup,
  profile selection, explicit backend and model pairs, the complete run
  lifecycle, and the `needs_approval` halt.
- Installed command and skill surfaces record one validated local controller
  checkout and instruct the host to stop if that checkout moves or disappears.
  Offline tests verify the record and stop instruction, not host-model obedience.
- Installations record exact owned paths and hashes in a target-local manifest.
  The uninstaller supports a dry run, removes only marker-and-hash-validated
  owned surfaces after explicit confirmation, and leaves state and unrelated
  files intact. Installer, uninstaller, and controller help is side-effect-free.
- Five governed profiles for general, chief-of-staff, communications,
  operations, and research work.
- Frozen task, prompt, schema, brain, workspace evidence, and result-integrity
  checks across Claude Code and Codex backends.
- Single-use typed approval and `file.write` execution with HMAC-bound grants,
  content hashes, expiry, allowed roots, and audit-chain verification.
- Deterministic manifest-first second-brain retrieval with bounded note and byte
  budgets, explicit omissions, and `no data` behavior.
- Bounded Gauntlet quality lane with baseline, candidate, review, regression,
  stop, and human-acceptance boundaries.
- A 36-case adversarial corpus across 12 categories and a fail-closed live test
  harness that requires an explicit backend, case cap, and reported-cost ceiling.
- Eight claim-evidence rows with frozen extracts and a strict separation between
  machine locator verification and named human support judgment.
- Governed source taxonomy with 74 classified records.
- Rights-reduced public exporter that excludes frozen third-party extracts,
  private research packets, diagnostics, Git history, and local run state.
- A thin `public:ready` gate verifies an existing projection, runs its shipped
  deterministic gates, and accepts only the exact declared support-omission
  failure. It cannot export, archive, initialize Git, or publish.
- Explicit private-canonical and fresh-history-public repository topology. The
  current canonical repository must not be made public because eight private
  corpus files plus two internal review packets also occur in its Git history.
- Canonical Apache-2.0 licence text, an owner-directed private-retention and
  public-exclusion record for visual assets, and a verified GitHub
  public-settings acceptance record.
- Printing Press documented as static policy and future integration design,
  not as live catalog discovery, an installed package, or an execution adapter.
- Source-linked personal installation guidance for Claude Code and Codex, with
  the provider data boundary and action approval boundary moved into the
  newcomer path.
- Repository community files, issue forms, support routing, contribution
  guidance, release communication, and public metadata prepared.
- Test-spawned controller and adversarial subprocesses now drop npm and Node test
  lifecycle markers, so `npm test` exercises the child programs instead of
  terminating them as nested test workers.

### Verification snapshot, 2026-08-18

This snapshot records the initial public source commit and its private source
candidate. It is not a versioned release attestation.

- Canonical `npm test`: 189 passed, 0 failed, 0 skipped. Its deterministic
  runner discovers only `tests/**/*.test.mjs`, so ignored release projections
  cannot change the result.
- Fresh temporary public projection: 189 passed, 0 failed, 0 skipped.
- Generated surfaces: current in the canonical and fresh public trees.
- Markdown relative links: 112 current-worktree files and 107 fresh public files
  passed.
- Source taxonomy: 74 records passed in both trees.
- Canonical evidence locator gate: 8 rows passed mechanically, with 8 pending
  human support judgments.
- Bounded live Codex adversarial run with `gpt-5.6-sol`: 3 cases passed and 1
  failed. The controller rejected the fourth result because it asserted an
  unverified claim without the required dissent while reporting quality control
  as passing. The fifth case and the Claude batch did not run. No retry was
  attempted.
- Fresh public evidence locator gate: 0 private rows, with the required explicit
  omission marker. Its strict support gate failed for the required omission
  reason.
- Release hygiene: 231 tracked and proposed files passed.
- `AgriciDaniel/secretary-public` projection: 219 files total, with
  218 entries in `PUBLIC_EXPORT_MANIFEST.json`.
- Deterministic public archive: 219 members. Public verification passed
  immediately before archiving.
- Fresh-history public repository:
  `https://github.com/AgriciDaniel/secretary-public`.
- Initial public root commit: `439fcc879b78b665132147c8e0de4b750661bef2`.
- Public CI run `32072571651`: Ubuntu Node 20, Ubuntu Node 24, and macOS Node 24
  all passed on the initial public commit.
- CodeQL run `32072769019`: JavaScript and TypeScript analysis passed with zero
  open code-scanning alerts at verification time.
- Secret scanning, push protection, Dependabot alerts and security updates,
  private vulnerability reporting, and active `main` and `v*` rulesets were
  verified after publication. A deliberate direct push was rejected and left
  public `main` unchanged.

These counts apply to the initial public commit and must be rerun for later
release candidates.
The final manifest and archive digests belong in external release evidence.
Embedding either digest in this manifest-covered file would change the digest
being recorded.

### Remaining release gates

1. The owner reviews and records support status for all eight claim-evidence
   rows.
2. The owner completes the claim-level public-rights judgment. Visual assets
   remain in the private canonical repository and are excluded from the public
   projection unless later exact-hash rights evidence authorizes inclusion.
3. The failed Codex evidence-laundering case is investigated before any new
   authorized live batch. The Claude batch remains unrun.

The fresh-history publication, remote control configuration, and separate
owner authorization gates are complete. The canonical repository remains
private. No versioned release is authorized by that publication decision.

No GitHub release has been created for this preview.

## v0.2.0

Private development milestone dated 2026-08-16.

The milestone established the cryptographic and state foundations for approval,
canonical JSON, prompt and evidence hashing, backend result normalization,
process-group cancellation, the initial behavioral harness, and the first
citation locator gate. It did not represent public or production readiness.

See [CHANGELOG.md](CHANGELOG.md) for the complete technical history.
