# Printing Press future integration policy

This document is a static policy and design backlog. Secretary does not
currently query the Printing Press catalog, install a Printing Press package or
skill, connect an account, or execute a Printing Press adapter. Printing Press
must not become a general execution channel or a reason to preload a large tool
catalog into every run.

## Current scope

The repository contains one static manifested brain note,
[`wiki/judgment/Printing Press Tool Discovery.md`](../wiki/judgment/Printing%20Press%20Tool%20Discovery.md),
and this future integration policy. Deterministic retrieval may supply that note
when its current matching rules select it. This is not a live catalog lookup and
does not prove that a named tool exists now, supports a requested operation, or
is safe to install.

Secretary may assess current tool documentation or candidate records that the
user deliberately supplies as bounded run evidence. If that evidence is missing
or stale, it must return `no data` instead of filling the gap from model memory.
No Printing Press package, skill, binary, credential, account connection, live
catalog client, or provider action is implemented in this repository.

## Retrieval design

Keep catalog content outside the always-loaded brain tier. A future integration
may load the operating note when the task needs an unavailable capability. It
must query fresh official catalog data when current availability affects the
recommendation. The current controller performs no such query.

Do not copy hundreds of volatile catalog entries into Secretary. Record the
official catalog and library URLs, the selection procedure, and the approval
boundary. A fresh catalog lookup should return the candidate slug, source,
release or version, claimed operations, authentication method, local storage,
and known prerequisites.

## Required future typed boundaries

These names are an integration design, not implemented action types. Each item
needs its own schema, narrow adapter, complete action commitment, approval hash,
execution record, negative tests, and rollback behavior.

| Boundary | Required commitment | Must not imply |
| --- | --- | --- |
| `tool.catalog.lookup` | Exact official catalog source and query | Package execution or installation |
| `tool.package.install` | Package source, pinned version, hashes where available, target, files, and rollback | Skill installation, authentication, or account access |
| `tool.skill.install` | Skill source, pinned revision, target agent, target paths, and rollback | Binary installation or execution permission |
| `tool.browser.capture` | Site, browser profile, capture scope, duration, storage, and deletion plan | Permission under terms, law, or contract |
| `account.authenticate` | Provider, account identity, method, scopes, secret storage, and expiry | Access to all private account data |
| `account.permission.grant` | Provider, exact scopes, principal, and expiry | Authentication to another account or expanded future scopes |
| `provider.private.read` | Provider, account, resource classes, filters, time range, and output destination | Drafting, writes, sends, or deletion |
| `provider.data.write` | Provider, exact object, before state, proposed after state, and rollback | Sending, publishing, spending, or deletion |
| `provider.draft.create` | Provider, account, recipients, subject, body hash, attachments, and draft target | Sending the draft |
| `provider.message.send` | Provider, account, recipients, final body hash, attachments, and send target | Future sends or contact with other recipients |
| `provider.financial.execute` | Provider, payee, amount, currency, purpose, account, fees, and reversibility | Recurring or different financial actions |
| `provider.publish` | Platform, account, destination, final content hash, audience, and timing | Editing or publishing later versions |
| `tool.package.uninstall` | Exact owned files, state disposition, credentials disposition, and rollback limits | Broad cleanup of unrelated files |

Adding one boundary must not create a generic command adapter. The controller
should expose only the minimum verbs required by reviewed workflows.

## Future implementation task list

This backlog begins only after the current Secretary release gates are resolved.
Each checkbox is a separate reviewed change. Completing discovery does not
authorize any later item.

- [ ] Implement a read-only `tool.catalog.lookup` adapter against a pinned,
      official Printing Press catalog source.
- [ ] Add deterministic candidate records, freshness dates, and `no data`
      behavior when a current listing cannot be verified.
- [ ] Add separate schemas for package installation, skill installation,
      browser capture, authentication, permission grants, private reads,
      provider writes, provider drafts, sends, financial actions, publication,
      and uninstall.
- [ ] Implement only the minimum adapters required by a reviewed first workflow.
- [ ] Add approval-substitution, scope-expansion, prompt-injection, credential,
      private-data, partial-failure, cancellation, rollback, and uninstall tests.
- [ ] Prove that read, local draft, provider draft, and send remain distinct
      lifecycle states.
- [ ] Run a live account workflow only after the principal approves the account,
      exact scopes, private-data boundary, external calls, and expected cost.
- [ ] Record the tested tool version, catalog snapshot, provider behavior,
      limitations, and rollback result before describing an adapter as supported.

## Selection gate

Before recommending a catalog tool, verify:

1. The user outcome and the exact service are known.
2. The official catalog currently lists the candidate.
3. The candidate documentation describes the needed operation.
4. The platform and prerequisites match the host.
5. The source and version can be pinned or otherwise identified.
6. Read and write capabilities are separated.
7. Authentication scopes are stated and minimized.
8. Local storage, retention, logs, and cache behavior are understood.
9. Browser-observed or private interfaces are clearly disclosed.
10. Terms, legal, provider-policy, and contractual permission are not inferred
    from technical access.
11. Cost, rate limits, and external side effects are disclosed.
12. Installation and every later provider action can be separately approved.

If any load-bearing item is unknown, Secretary should return `no data` or
`needs_approval` as appropriate. It should not fill the gap from model memory.

## Hypothetical Gmail example

This example describes a future workflow, not a supported Gmail integration. A
request to "help with email" is not one approval. The smallest safe sequence
would be:

1. Recommend a candidate only after a fresh official catalog lookup.
2. Request separate approval for binary or skill installation if absent.
3. Request separate approval for account authentication and exact scopes.
4. Request separate approval for a bounded private-email read.
5. Prepare proposed reply text locally when the supplied evidence permits it.
6. Request separate approval to create a provider-side draft.
7. Request separate approval to send the final, hash-bound message.

Reading email never implies drafting. Drafting never implies sending.

## Verification required before controller work is accepted

- Schema tests for each typed action and conditional result.
- Negative tests for approval substitution and scope expansion.
- Collision-safe, pinned installation with an ownership inventory.
- Credential redaction and secret-path tests.
- Private-data minimization and retention tests.
- Prompt-injection cases from tool output and private account content.
- Exact draft-versus-send separation tests.
- Cancellation, partial failure, and rollback tests.
- Audit records that bind the selected catalog source, tool version, requested
  operation, approval, and execution result.
- Live tests only after the principal authorizes the account, scopes, external
  calls, and any expected cost.

## Official sources

- Generator: https://github.com/mvanhorn/cli-printing-press
- Catalog website: https://printingpress.dev/
- Official library: https://github.com/mvanhorn/printing-press-library

Catalog contents and counts are volatile. Verify them from the official catalog
before making any current availability or size claim.
