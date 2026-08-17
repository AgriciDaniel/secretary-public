# Public repository settings checklist

Status: public preview controls applied and verified on 2026-08-18. This file
retains the remaining acceptance checks and records the verified remote state.
A checked box does not replace a fresh API or signed-out check.

Target: `AgriciDaniel/secretary`. The repository was created privately
from a 219-file allowlisted projection, verified, and then made public with one
fresh-history root commit. The canonical `AgriciDaniel/secretary-canonical`
repository remains private.

The canonical development repository contains private research material and
must remain private. Create the public repository from a manually inspected,
allowlisted projection with fresh Git history. Do not change the canonical
repository's visibility and do not push its existing Git objects to the public
remote.

## Publication topology

- [x] Confirm that the approved public target is `AgriciDaniel/secretary` and
  that the private canonical repository has moved to
  `AgriciDaniel/secretary-canonical` without changing either repository ID.
- [x] Generate and verify the public projection from the exact accepted
  canonical source state.
- [x] Confirm the projection contains no `.git` directory and initialize new
  Git history from its files only.
- [x] Create the public target as an empty private repository. Do not ask GitHub
  to add a README, licence, or `.gitignore`, because those bytes come from the
  accepted projection.
- [x] Set the fresh local branch to `main`, make and verify one signed initial
  commit, then push only that fresh branch to the private target. Do not add the
  canonical repository as a push source for the public target.
- [x] Confirm `main` is the default branch and confirm the public target shares
  no commit ID or Git reference with the canonical repository.
- [x] Manually inspect the exact projected tree, including
  `PUBLIC_EXPORT_MANIFEST.json`, `NOTICE`, `LICENSE`, and
  [asset provenance](../assets/PROVENANCE.md).
- [x] Confirm all public-facing clone, issue, security, support, package, and
  release references resolve in the selected public repository.
- [x] Apply every setting available while the target is private and run CI. If
  the account plan does not enforce rulesets on a private repository, record
  that limitation and do not describe the branch as protected.
- [x] Record a separate owner authorization for changing only the fresh target
  from private to public. The canonical repository remains private.
- [ ] Immediately after the visibility change, activate and test any ruleset
  that was plan-limited while private, then enable and test the public-only
  security controls below. Accept no contribution or merge while those controls
  are pending. If a blocking control is unavailable or fails, make the fresh
  target private again and stop publication work.

## Access and branch governance

- [x] Keep default workflow permissions read-only. Leave permission escalation
  explicit at the individual job level only when it is required and reviewed.
- [x] Keep workflow-created pull-request approvals disabled.
- [x] Create one active ruleset targeting the default branch `main`.
- [ ] Require a pull request and at least one approving review before merge.
- [ ] Dismiss stale approvals when new commits are pushed and require approval
  of the most recent reviewable push.
- [x] Require conversation resolution before merge.
- [x] Require the branch to be up to date before merge.
- [x] Block force pushes and deletion. Do not grant a routine bypass. If an
  emergency maintainer bypass is retained, name the actor, scope, reason, and
  review procedure in the settings evidence.
- [x] Require every CI matrix check after it has run once in the public
  repository: `verify (ubuntu-latest, Node 20)`,
  `verify (ubuntu-latest, Node 24)`, and
  `verify (macos-latest, Node 24)`. Bind required
  checks to GitHub Actions as the expected source where the repository plan
  supports it.
- [x] Do not require the older canonical-PR names `verify (20)` or
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

- [x] Allow only GitHub-authored actions required by the checked-in workflow:
  `actions/checkout` and `actions/setup-node`. No reusable workflow or
  third-party action is currently required.
- [ ] Enable the repository or organization policy that requires actions to be
  pinned to a full-length commit SHA.
- [x] Recheck every `uses:` reference in the exact public commit.
- [x] Confirm Actions default workflow permissions are `read` and workflows
  cannot create or approve pull-request reviews.
- [ ] Require approval before workflows from forked pull requests run for
  outside contributors. Review GitHub's current fork policy rather than assuming
  private-repository defaults carry into the public repository.
- [x] Confirm no public pull request can run untrusted code on a self-hosted
  runner or access publication, signing, deployment, provider, or production
  credentials.
- [x] Confirm the three CI jobs run only on GitHub-hosted
  `ubuntu-latest` and `macos-latest` runners, with a 20-minute job timeout and
  concurrency cancellation enabled.

GitHub states that a full-length commit SHA is the immutable way to pin an
action and documents the corresponding [repository Actions
setting](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

## Security reporting and analysis

- [x] Enable the dependency graph and Dependabot alerts. The current package has
  no lockfile and no runtime dependencies, so an empty alert set is plausible
  but is not proof that the feature is enabled.
- [x] Decide whether to enable Dependabot security updates. If GitHub Actions
  update automation is wanted, add and review a separate `github-actions`
  Dependabot configuration in a future code change.
- [ ] Enable code scanning for JavaScript with a reviewed GitHub CodeQL
  configuration. Run it once, inspect its scope, and then require its exact
  check result in the `main` ruleset.
- [ ] Enable secret scanning and push protection. Test the push-protection
  control with a GitHub-provided safe test pattern, never with a live secret.
- [x] Enable private vulnerability reporting after the repository is public.
- [x] From a non-admin view, confirm the Security tab exposes a private `Report
  a vulnerability` path and that it does not route to a public issue. Confirm
  the exact URL
  `https://github.com/AgriciDaniel/secretary/security/advisories/new`
  works while signed out or from an account without repository access.
- [ ] Configure and test maintainer notifications for private reports.
- [x] Review the Security tab with no unresolved alerts before release. Record
  unavailable features separately rather than marking them passed.
- [x] Confirm `SECURITY.md` is visible from the Security tab and that public
  issues and community links do not invite sensitive vulnerability details.

GitHub documents [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
and [repository security and analysis settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository).

## Metadata and community health

- [x] Confirm GitHub detects `LICENSE` as Apache License 2.0 on the exact public
  commit. Treat `NOASSERTION`, a missing licence badge, or a mismatched licence
  as a release blocker to investigate.
- [x] Enable Issues. Keep Discussions disabled at launch because general
  discussion is routed to the Free and Pro AI Marketing Hub communities. Enable
  Discussions later only with a named moderation and support policy.
- [x] Keep Wiki and Projects disabled unless a maintained public use is approved.
- [x] Create or confirm the exact labels used by issue forms: `bug`,
  `enhancement`, and `documentation`. The issue forms do not require a
  `research` label.
- [x] Apply this exact description: `Evidence-grounded AI secretary for Claude
  Code and Codex, with frozen context, deterministic retrieval, bounded quality
  review, and explicit human approval gates.`
- [x] Apply the homepage `https://www.skool.com/ai-marketing-hub` and all 20
  topics from [repository metadata](repository-metadata.md).
- [x] Verify the Free AI Marketing Hub and AI Marketing Hub Pro links in the
  README, support guide, and issue-template configuration from a signed-out
  view.
- [x] Verify the issue forms, support links, contribution guide, Code of Conduct,
  security policy, and pull-request template from a signed-out view.
- [x] Enable automatic deletion of merged branches unless the maintainer has a
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

Live evidence recorded on 2026-08-18:

- Public repository: `https://github.com/AgriciDaniel/secretary`.
- Initial root commit: `439fcc879b78b665132147c8e0de4b750661bef2`.
- Initial tree: `dfbfab0d5b6322702f5d658647bfca196584bdc0`.
- Initial CI run: `https://github.com/AgriciDaniel/secretary/actions/runs/32072571651`.
- CodeQL run: `https://github.com/AgriciDaniel/secretary/actions/runs/32072769019`.
- Active rulesets: `Protect main` with ID `20958036`, and
  `Protect release tags` with ID `20958040`.
- The `main` ruleset requires pull requests, strict success from the three CI
  jobs, linear history, resolved review threads, and blocks deletion and force
  pushes. A direct-push negative control was rejected and left `main`
  unchanged.
- Apache-2.0 detection, 100 percent community-profile health, public anonymous
  repository access, and the private vulnerability-report URL returned the
  expected results.
- Code scanning, secret scanning, and Dependabot each reported zero open alerts
  at verification time. Zero alerts is a point-in-time result, not a guarantee.

Known exceptions remain explicit:

- The only current maintainer cannot provide an independent approval, so the
  pull-request rule requires zero approvals. Do not mark the one-review gate
  complete until another qualified reviewer exists.
- The initial commit verifies locally with the owner's SSH signing key, but
  GitHub reports `unknown_key`. Required signed commits therefore remain off.
- CodeQL default setup is enabled and passed, but its check is not required by
  the ruleset because GitHub excludes default-setup runs from fork pull
  requests. Requiring it would block outside contributions.
- Secret scanning and push protection are enabled, but no test token was pushed.
  The API state and zero-alert result do not replace a safe negative control.
- Repository-level enforcement of full-SHA action references was not available;
  the two checked-in GitHub-authored actions are pinned to exact commit SHAs.
- Private-report notification delivery, fork-workflow approval behavior,
  public release tags, and a signed GitHub release remain untested or absent.
