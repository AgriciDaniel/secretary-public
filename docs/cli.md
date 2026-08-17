# Controller CLI

```text
node scripts/secretaryctl.mjs preflight --backend claude [--model MODEL] [--json]
node scripts/secretaryctl.mjs prepare --run-id RUN_ID --task-file PATH --workspace PATH [--profile PATH] [--principal-session-file PATH] [--backend claude|codex] [--model MODEL]
node scripts/secretaryctl.mjs run --run-id RUN_ID
node scripts/secretaryctl.mjs status --run-id RUN_ID
node scripts/secretaryctl.mjs result --run-id RUN_ID
node scripts/secretaryctl.mjs cancel --run-id RUN_ID
node scripts/secretaryctl.mjs principal status [--session-file PATH]
node scripts/secretaryctl.mjs principal init [--answers-file PATH]
node scripts/secretaryctl.mjs principal show [--session-file PATH]
node scripts/secretaryctl.mjs principal set --file PATH --expected-revision N
node scripts/secretaryctl.mjs principal unset --file PATH --expected-revision N
node scripts/secretaryctl.mjs principal pause --expected-revision N
node scripts/secretaryctl.mjs principal resume --expected-revision N
node scripts/secretaryctl.mjs principal export [--session-file PATH]
node scripts/secretaryctl.mjs principal reset --expected-revision N
node scripts/secretaryctl.mjs principal delete --confirm DELETE
node scripts/secretaryctl.mjs principal doctor [--session-file PATH]
node scripts/secretaryctl.mjs approvals list --run-id RUN_ID [--json]
node scripts/secretaryctl.mjs approve --run-id RUN_ID --approval-id APPROVAL_ID [--action-sha256 SHA256] [--expires-in SECONDS] [--approved-by NAME] [--non-interactive]
node scripts/secretaryctl.mjs deny --run-id RUN_ID --approval-id APPROVAL_ID --reason TEXT
node scripts/secretaryctl.mjs execute --run-id RUN_ID --approval-id APPROVAL_ID --content-file PATH
node scripts/secretaryctl.mjs quality freeze --quality-id QUALITY_ID --job-file PATH --workspace PATH
node scripts/secretaryctl.mjs quality packet --quality-id QUALITY_ID --iteration N --artifact-file PATH --builder-id BUILDER_ID
node scripts/secretaryctl.mjs quality review --quality-id QUALITY_ID --iteration N --review-file PATH
node scripts/secretaryctl.mjs quality status --quality-id QUALITY_ID
```

`node scripts/secretaryctl.mjs --help` and `-h` print a compact command-family summary and exit before reading or creating Secretary state. A help flag supplied after a command or nested subcommand has the same side-effect-free behavior. The detailed option contracts remain in this document.

There is deliberately no task-text option. `prepare` requires a regular task file contained by the declared workspace. It validates the profile's brain root and retrieval configuration, byte-checks the generated brain manifest, loads Tier 0 and Tier 1, selects bounded Tier 2 note bodies with deterministic lexical scoring, walks the workspace, applies one shared set of per-file, total-byte, and file-count evidence caps, and writes `evidence-manifest.json` plus the exact assembled `prompt.md` into private run state. Truncation, skipped paths, and unselected brain note bodies are explicit in the prompt. Backend and model selection happen only during `prepare`, are copied into private run state, and cannot be changed by `run`. The profile defaults may be overridden with `--backend claude|codex` and `--model MODEL` on `prepare`.

The `principal` command family controls first-run setup and presentation preferences. `init` is a friendly terminal console when standard input and output are interactive. Before any write, it shows a compact review with confirm, edit, and cancel. `--answers-file` provides a bounded, closed JSON input for deterministic or non-interactive setup. A file that saves preferences, creates a session, or remembers a decline must include `"confirmed":true`; this is the caller's attestation that the user reviewed the values and provider choice. It is not cryptographic proof of human identity. For setup choices, the other required keys are `language`, `secretary_name`, `responsibility`, and `consent`; `principal_address` is optional. Responsibility is one of `general`, `communication`, `operations`, `research`, or `agents`. Consent is one of `save_basics`, `session_only`, `customize`, `decline`, `save_nothing`, or `cancel`. `provider_use` is required with `customize` and is otherwise derived. A save-nothing or cancel file may contain only its `consent` key. Unknown keys and contradictory consent fields fail validation.

Session-only `init` writes no durable Secretary personalization state. Its JSON output contains a caller-managed `session` object that can be placed in a short-lived protected file and passed to read-only principal commands with `--session-file PATH`, or to `prepare` with `--principal-session-file PATH`. The controller does not enforce expiry or single use, so a retained file is replayable and must be removed by the host when the intended interaction ends. `export` writes JSON to standard output. `delete` requires the exact `--confirm DELETE` guard. Local persistence and provider use are separate choices. `status`, `show`, and `doctor` are read-only. Mutations require revision checks so a stale caller cannot silently overwrite a newer decision. `doctor` also reports mutation-lock recovery state. See [personalization.md](personalization.md) for the exact boundary and prohibited data.

`set --file` reads either a JSON object containing only allowlisted preference changes, for example `{"tone":"direct","answer_length":"concise"}`, or exactly `{"provider_use":false}` to revise provider consent. Provider consent cannot be mixed with preference fields, and its expected revision targets the separate consent record. `unset --file` reads a JSON array of allowlisted preference field names, for example `["tone","answer_length"]`. Every mutation requires the current positive revision. Values must satisfy the closed principal-profile schema. Unknown keys and stale expected revisions fail instead of being ignored.

The schema enforces field names, types, lengths, and control-character limits. It cannot reliably recognize a credential, sensitive fact, or raw task excerpt hidden inside an otherwise allowed string such as `tone`. The user and calling agent must not place such content in personalization. Review `show` before enabling provider use.

`prepare` may use a confirmed saved default profile only when `--profile` is omitted. An explicit `--profile` always wins. A bounded session record may be supplied with `--principal-session-file PATH`. Personalization enters a provider prompt only when provider use is active for that persistent or session decision. The frozen snapshot is no larger than 4096 bytes, is stored in private run state, is hash-bound in prompt metadata, and is labeled untrusted advisory data. Corrupt, unknown, paused, declined, or unconsented state sends no personalization bytes.

Brain and workspace evidence are read only by the controller. Missing required brain files, manifest drift, containment escapes, and a Tier 0 plus Tier 1 set over the profile brain budget fail preparation. Binary files, special files, and symlinks are manifested but not loaded. The child runs without file tools and receives only the frozen prompt.

Successful subcommands emit JSON, except that `approvals list` defaults to human-readable text and uses JSON when `--json` is supplied. `preflight --json` is accepted for caller consistency but does not change its already-JSON output. A missing preflight backend reports the valid values. `preflight` actively checks private state writes and child API reachability. Under a Codex parent, grant both capabilities with:

```text
-c sandbox_workspace_write.network_access=true
-c 'sandbox_workspace_write.writable_roots=["<state parent>"]'
```

`approvals list` shows the full action hash, action type, target, and grant expiry. After approval it also shows the full grant hash. `approve` defaults to a 900-second expiry and the current OS user. The optional `--action-sha256` is a confirmation guard. It is mandatory with `--non-interactive` and optional for a human directly reviewing the displayed hash.

Each grant is HMAC-protected with a random per-run key stored in private run state. `execute` verifies the HMAC, action hash, grant hash, expiry, and content hash before the approved revision is consumed. A verified content copy and an audit intent are written before the typed adapter runs. Grants are single use. `deny` requires a reason and terminates that approval.

The `quality` command family is file-backed and does not invoke a provider. Start from [examples/quality-job.json](../examples/quality-job.json), [examples/quality-baseline.md](../examples/quality-baseline.md), and [examples/quality-reference.md](../examples/quality-reference.md). `freeze` requires the job, baseline, and reference files to be inside the declared workspace. It verifies both declared hashes and freezes private copies. Every job also needs declared builder identities, at least one protected blocking deterministic gate, observable score dimensions, time, token, cost, and iteration ceilings, a coupling rationale, fresh-context artifact review, and explicit approval for external actions.

`packet` requires a bounded regular artifact inside the frozen workspace, names one declared builder, records the exact hash, and freezes the artifact bytes. `review` accepts a separately produced schema-valid review bound to that job hash, baseline hash, reference hash, artifact hash, and iteration. The producing context cannot sign its own review. Required gate and dimension IDs must match exactly. Every performed deterministic gate declares an exit code and cites bounded, workspace-contained evidence files whose hashes are verified and whose bytes are frozen with the review. A `passed` review is rejected unless all blocking gates passed, the deterministic weighted score met the threshold, and no regression was recorded. `improved_not_passed` requires the candidate score to improve over the frozen baseline score by at least the declared delta. `status` rechecks packet, artifact, review, evidence-manifest, and frozen-evidence commitments before reporting a terminal or continuation state. Since the current controller cannot authenticate reviewer identity or gate execution, a reviewer-reported `passed` result is exposed separately and the controller status is `needs_human_decision`. See [gauntlet-quality-protocol.md](gauntlet-quality-protocol.md).

Exact command aliases are not installed by default. `node scripts/install.mjs --target PATH --exact-command-aliases` opts in. For a personal install, use `--target "$HOME/.claude"` for Claude Code or `--target "$HOME/.agents"` for Codex. Those targets place the canonical skill in the hosts' documented personal discovery paths, `~/.claude/skills/secretary/SKILL.md` and `~/.agents/skills/secretary/SKILL.md`. See the official [Claude Code skills](https://code.claude.com/docs/en/skills) and [Codex skills](https://developers.openai.com/codex/skills) documentation. Every installed canonical surface and alias carries a Secretary ownership marker. The installer validates all collisions before writing, refuses unowned files, rejects destination paths that traverse symlinks, and rejects the filesystem root or any target that overlaps the Secretary source checkout.

Installation and removal use these commands:

```text
node scripts/install.mjs --target PATH [--exact-command-aliases]
node scripts/install.mjs --help
node scripts/uninstall.mjs --target PATH --dry-run
node scripts/uninstall.mjs --target PATH --confirm REMOVE
node scripts/uninstall.mjs --help
```

The installer writes `.secretary-install-manifest.v1.json` at the target root after writing the surfaces. The manifest binds the real target path, source root, exact owned relative paths, file kinds, and SHA-256 content hashes. A later install preserves an already owned exact alias in the refreshed manifest even when `--exact-command-aliases` is omitted, so it cannot be orphaned from removal tracking. `--help` and `-h` require no target and perform no filesystem writes.

Run uninstall with `--dry-run` first to validate and report the exact removal plan. Actual removal requires the case-sensitive `--confirm REMOVE`. Before deleting anything, the uninstaller validates the whole manifest and every present file. It accepts only the three canonical surface paths and the exact `chief-of-staff` alias path, rejects symlink traversal, unknown or duplicate paths, marker loss, and any content-hash drift. A missing manifested file is reported as missing. Directories, unrelated files, the source checkout, personalization, retained runs, approvals, and results are never removed. The manifest is removed last.

An install made before the manifest existed must be reinstalled with the current installer before using this uninstall command. Source-checkout relocation does not prevent uninstall because removal uses the target-local manifest and installed bytes. It does leave each installed controller link stale as described below. The no-follow checks protect against ordinary symlink substitution and unowned edits. They cannot prevent a malicious same-user process from racing a validated path between the final check and deletion.

Each installed canonical surface also records the exact real path of the source checkout's `scripts/secretaryctl.mjs`. This is a link, not a copied runtime. The command or skill invokes that controller to check first-run state and run setup. If the checkout is moved, removed, replaced by a symlink, or no longer contains a regular controller file, the installed instruction must stop and ask the user to rerun the installer from the intended checkout. It must not search for another controller or pretend that prose-only onboarding created controller state.

Installer and uninstaller checks plus no-follow file operations protect against ordinary collisions, symlink drift, and unowned content changes. They do not defend against a malicious process running as the same operating-system user that races parent-directory replacement or rewrites both content and ownership state. Static tests also cannot prove that every host model obeys the Markdown stop instruction.

`secretary` is canonical. The only opt-in exact command alias is `chief-of-staff`; the generic `sec` alias is deliberately not installed.

Cancellation requires POSIX process-group signals. It is supported on Linux and macOS. On Windows, `cancel` fails with an explicit unsupported-platform error instead of attempting partial cancellation.
