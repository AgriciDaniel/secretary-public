# Security policy

## Supported status

Secretary is experimental. No version is currently warranted for consequential or production use. Security fixes are applied to the current development line only.

## Reporting a vulnerability

Use the public repository's Security tab and its private vulnerability-reporting
form for a sensitive report:
https://github.com/AgriciDaniel/secretary/security/advisories/new.
The form was enabled and verified from an unauthenticated view on 2026-08-18.
If the private form is not visible, do not open a public issue containing
vulnerability details. Include the affected version or commit, the smallest
reproducible case, impact, and any known workaround. Do not include live
credentials, personal data, or third-party secrets.

The repository-settings acceptance checklist is maintained in
[docs/github-public-settings.md](docs/github-public-settings.md). A checked-in
policy file does not prove that a remote setting is enabled.

Use a public issue only for non-sensitive hardening suggestions that do not disclose an exploitable weakness.

## Scope

Useful reports include containment escapes, approval or grant bypass, hash-binding errors, generated-surface drift, evidence substitution, unsafe installer behavior, credential leakage in release artifacts, and backend envelope acceptance errors.

Model mistakes, unsupported factual claims, and weak judgment are important evaluation findings, but they are not automatically security vulnerabilities. Label the observed behavior and evidence precisely.

## Response boundary

The maintainers may acknowledge, reproduce, fix, or decline a report. This file does not promise a response deadline or create a bug-bounty program. Do not spend money, contact third parties, or test systems you do not own on this project's behalf.
