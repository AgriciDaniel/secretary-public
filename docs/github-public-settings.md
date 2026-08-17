# Public repository settings checklist

Status: all remote settings pending. This file records intended acceptance
checks only. A checked box in this repository would not by itself prove a
GitHub setting is active.

Target: `AgriciDaniel/secretary-public`. A read-only API check on `2026-08-17`
returned `404 Not Found`, so the proposed repository did not exist and none of
the settings below were active at that time.

The canonical development repository contains private research material and
must remain private. Create the public repository from a manually inspected,
allowlisted projection with fresh Git history. Do not change the canonical
repository's visibility and do not push its existing Git objects to the public
remote.

## Publication topology

- [ ] Reconfirm that the approved public target is
  `AgriciDaniel/secretary-public` and that it is still unoccupied.
- [ ] Generate and verify the public projection from the exact accepted
  canonical source state.
- [ ] Confirm the projection contains no `.git` directory and initialize new
  Git history from its files only.
- [ ] Create the public target as an empty private repository. Do not ask GitHub
  to add a README, licence, or `.gitignore`, because those bytes come from the
  accepted projection.
- [ ] Set the fresh local branch to `main`, make and verify one signed initial
  commit, then push only that fresh branch to the private target. Do not add the
  canonical repository as a push source for the public target.
- [ ] Confirm `main` is the default branch and confirm the public target shares
  no commit ID or Git reference with the canonical repository.
- [ ] Manually inspect the exact projected tree, including
  `PUBLIC_EXPORT_MANIFEST.json`, `NOTICE`, `LICENSE`, and
  [asset provenance](../assets/PROVENANCE.md).
- [ ] Confirm all public-facing clone, issue, security, support, package, and
  release references resolve in the selected public repository.
- [ ] Apply every setting available while the target is private and run CI. If
  the account plan does not enforce rulesets on a private repository, record
  that limitation and do not describe the branch as protected.
- [ ] Record a separate owner authorization for changing only the fresh target
  from private to public. The canonical repository remains private.
- [ ] Immediately after the visibility change, activate and test any ruleset
  that was plan-limited while private, then enable and test the public-only
  security controls below. Accept no contribution or merge while those controls
  are pending. If a blocking control is unavailable or fails, make the fresh
  target private again and stop publication work.

## Access and branch governance

- [ ] Keep default workflow permissions read-only. Leave permission escalation
  explicit at the individual job level only when it is required and reviewed.
- [ ] Keep workflow-created pull-request approvals disabled.
- [ ] Create one active ruleset targeting the default branch `main`.
- [ ] Require a pull request and at least one approving review before merge.
- [ ] Dismiss stale approvals when new commits are pushed and require approval
  of the most recent reviewable push.
- [ ] Require conversation resolution before merge.
- [ ] Require the branch to be up to date before merge.
- [ ] Block force pushes and deletion. Do not grant a routine bypass. If an
  emergency maintainer bypass is retained, name the actor, scope, reason, and
  review procedure in the settings evidence.
- [ ] Require every CI matrix check after it has run once in the public
  repository: `verify (ubuntu-latest, Node 20)`,
  `verify (ubuntu-latest, Node 24)`, and
  `verify (macos-latest, Node 24)`. Bind required
  checks to GitHub Actions as the expected source where the repository plan
  supports it.
- [ ] Do not require the older canonical-PR names `verify (20)` or
  `verify (24)`. Those checks came from the workflow before the current
  OS-labelled three-job matrix and are not the proposed public check names.
- [ ] Require verified signed commits on `main` after a test pull request proves
  that the selected merge method preserves a verified result. Do not enable a
  rule that leaves the sole maintainer unable to merge or recover.
- [ ] Confirm an independent reviewer is available before enforcing one
  approval. With only the current sole `CODEOWNERS` entry, the pull-request
  author cannot satisfy an independent approval requirement alone.
- [ ] Create a separate active tag ruleset for `v*` that blocks tag updates and
  deletion and restricts release-tag creation to the release maintainer.
- [ ] Create release tags as signed annotated tags and verify the tag and target
  commit. A tag ruleset protects tag operations but does not by itself prove the
  annotated tag object was cryptographically signed.

GitHub documents [repository rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
and [available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

## Actions supply-chain policy

- [ ] Allow only GitHub-authored actions required by the checked-in workflow:
  `actions/checkout` and `actions/setup-node`. No reusable workflow or
  third-party action is currently required.
- [ ] Enable the repository or organization policy that requires actions to be
  pinned to a full-length commit SHA.
- [ ] Recheck every `uses:` reference in the exact public commit.
- [ ] Confirm Actions default workflow permissions are `read` and workflows
  cannot create or approve pull-request reviews.
- [ ] Require approval before workflows from forked pull requests run for
  outside contributors. Review GitHub's current fork policy rather than assuming
  private-repository defaults carry into the public repository.
- [ ] Confirm no public pull request can run untrusted code on a self-hosted
  runner or access publication, signing, deployment, provider, or production
  credentials.
- [ ] Confirm the three CI jobs run only on GitHub-hosted
  `ubuntu-latest` and `macos-latest` runners, with a 20-minute job timeout and
  concurrency cancellation enabled.

GitHub states that a full-length commit SHA is the immutable way to pin an
action and documents the corresponding [repository Actions
setting](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

## Security reporting and analysis

- [ ] Enable the dependency graph and Dependabot alerts. The current package has
  no lockfile and no runtime dependencies, so an empty alert set is plausible
  but is not proof that the feature is enabled.
- [ ] Decide whether to enable Dependabot security updates. If GitHub Actions
  update automation is wanted, add and review a separate `github-actions`
  Dependabot configuration in a future code change.
- [ ] Enable code scanning for JavaScript with a reviewed GitHub CodeQL
  configuration. Run it once, inspect its scope, and then require its exact
  check result in the `main` ruleset.
- [ ] Enable secret scanning and push protection. Test the push-protection
  control with a GitHub-provided safe test pattern, never with a live secret.
- [ ] Enable private vulnerability reporting after the repository is public.
- [ ] From a non-admin view, confirm the Security tab exposes a private `Report
  a vulnerability` path and that it does not route to a public issue. Confirm
  the exact URL
  `https://github.com/AgriciDaniel/secretary-public/security/advisories/new`
  works while signed out or from an account without repository access.
- [ ] Configure and test maintainer notifications for private reports.
- [ ] Review the Security tab with no unresolved alerts before release. Record
  unavailable features separately rather than marking them passed.
- [ ] Confirm `SECURITY.md` is visible from the Security tab and that public
  issues and community links do not invite sensitive vulnerability details.

GitHub documents [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
and [repository security and analysis settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository).

## Metadata and community health

- [ ] Confirm GitHub detects `LICENSE` as Apache License 2.0 on the exact public
  commit. Treat `NOASSERTION`, a missing licence badge, or a mismatched licence
  as a release blocker to investigate.
- [ ] Enable Issues. Keep Discussions disabled at launch because general
  discussion is routed to the Free and Pro AI Marketing Hub communities. Enable
  Discussions later only with a named moderation and support policy.
- [ ] Keep Wiki and Projects disabled unless a maintained public use is approved.
- [ ] Create or confirm the exact labels used by issue forms: `bug`,
  `enhancement`, and `documentation`. The issue forms do not require a
  `research` label.
- [ ] Apply this exact description: `Evidence-grounded AI secretary for Claude
  Code and Codex, with frozen context, deterministic retrieval, bounded quality
  review, and explicit human approval gates.`
- [ ] Apply the homepage `https://www.skool.com/ai-marketing-hub` and all 20
  topics from [repository metadata](repository-metadata.md).
- [ ] Verify the Free AI Marketing Hub and AI Marketing Hub Pro links in the
  README, support guide, and issue-template configuration from a signed-out
  view.
- [ ] Verify the issue forms, support links, contribution guide, Code of Conduct,
  security policy, and pull-request template from a signed-out view.
- [ ] Enable automatic deletion of merged branches unless the maintainer has a
  documented reason to retain them.

## Visibility rollback and incident response

- [ ] Before making the fresh target public, export or record its repository,
  Actions, ruleset, branch, security, label, topic, and community settings so
  the accepted configuration can be reconstructed.
- [ ] If a required setting, link, CI check, licence result, or security feature
  fails during publication, return the fresh target to private, disable release
  work, and document the failed acceptance item before changing anything else.
- [ ] Treat public exposure as irreversible disclosure. Returning a repository
  to private does not retract clones, forks, caches, notifications, or copied
  files. Do not describe a visibility rollback as erasing publication.
- [ ] If an unexpected credential or private byte is found, make the public
  target private, revoke or rotate the affected credential outside the
  repository, preserve incident evidence, and rebuild from a corrected fresh
  export. Do not rewrite or delete the canonical history as an improvised fix.
- [ ] Do not delete the public repository, rewrite its history, rename either
  repository, or restore visibility without a separate owner decision and a
  confirmed recovery target.

## Final evidence record

After settings are applied with explicit owner authorization, record the public
repository URL, exact commit, inspection date, setting reviewer, CI run URLs,
ruleset and security-setting snapshots, signed release tag, non-admin security
reporting result, and any plan-limited exceptions in the release evidence.
Until then, every item in this file remains pending and no remote governance
claim is established.
