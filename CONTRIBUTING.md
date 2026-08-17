# Contributing

Secretary accepts focused fixes, tests, documentation, profiles, and evidence improvements. The project values refutation over agreeable prose and treats every completion claim as an evidence claim.

## Before proposing a change

1. Read [AGENTS.md](AGENTS.md), [README.md](README.md), and the relevant contract or schema.
2. Keep unrelated work and history intact.
3. Add the smallest reliable test that can fail for the bug or contract breach.
4. Update a generator when the affected file is generated.
5. Keep source presence, claim support, confidence, and legal authority separate.
6. Do not add secrets, personal host paths, private logs, or restricted third-party text.
7. Keep the canonical repository private. Do not publish its Git history or
   build a public artifact by archiving its tracked tree. Use the allowlisted
   public projection and verify it as a separate fresh-history repository.
8. For a new or changed visual asset, update
   [assets/PROVENANCE.md](assets/PROVENANCE.md) with its exact hash, source,
   creator or supplier, applicable terms, third-party elements, and owner
   approval status. Unknown rights remain pending.

## Local checks

```text
npm test
npm run check:generated
npm run check:links
npm run check:evidence
npm run release:check
npm run release:check:worktree
```

`npm run release:check` checks the tracked release set. `npm run release:check:worktree` also checks proposed untracked files before they enter Git. `npm run check:evidence` proves locator and hash integrity only. `npm run check:evidence:support` additionally requires named human support attestations and is intentionally not something an automated contributor may sign.

## Research changes

Use primary or official sources where possible. Record retrieval and refresh dates, claim-level locators, contradictions, and rights constraints. A URL in a ledger is not evidence that a source supports a claim. If support is absent, record `no data` or an open question.

## Quality and authority

Do not weaken protected gates, thresholds, fixtures, or review requirements to make a change pass. Do not commit, publish, deploy, contact third parties, spend money, or alter accounts on the project's behalf without the repository owner's explicit authority.
