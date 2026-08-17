## Summary

Describe the problem, the scoped change, and why this is the smallest suitable
fix.

## Evidence

- [ ] I inspected the relevant contracts, source files, generated surfaces, and
      tests before editing.
- [ ] I separated verified facts, inference, and unresolved uncertainty.
- [ ] I added or updated a negative control where the change affects a gate.

## Authority and privacy

- [ ] This change does not add credentials, private client data, local host
      paths, diagnostic output, or restricted third-party text.
- [ ] This change does not widen child tools, action types, provider scopes, or
      external authority without an explicit reviewed contract.
- [ ] Generated files were changed through their generator.

## Verification

List the exact commands and outcomes. Do not describe skipped, offline-only, or
blocked checks as passes.

- [ ] `npm test`
- [ ] `npm run check:generated`
- [ ] `npm run check:links`
- [ ] `npm run check:source-types`
- [ ] `npm run check:evidence`
- [ ] `npm run release:check:worktree`

## Remaining risk

State what was not tested, what remains owner-controlled, and any known
compatibility or rights risk.
