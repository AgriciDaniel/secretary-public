# Personalization and first-run setup

Secretary personalization is an explicit, local agreement about presentation preferences. It is not a behavioral dossier, an identity model, or permission to change the system contract. The controller owns the state. The generated brain and shared wiki do not rewrite themselves as a user speaks.

## First `/secretary` use

An installed `/secretary` or `$secretary` surface carries a local controller link. It first checks `principal status`. If no choice has been recorded, it offers `principal init` as a short setup:

1. Suggest a language and ask the user to confirm or change it.
2. Ask what to call the secretary and, optionally, how to address the user.
3. Ask for one default responsibility: general staff work, communications, operations, research, or agent coordination. This maps to one of the five governed profiles.
4. Ask how personalization should work: save the basics and allow provider use, use them only for this session and its provider prompt, or save the basics while choosing provider sharing. If the answer is no, ask whether to remember only the no decision or save nothing.
5. Show one compact review with confirm, edit, and cancel before saving anything.

An urgent task does not wait for setup. Secretary can continue with safe session-only defaults and offer setup later. No answer, silence, or continued use counts as consent.

## Consent choices

Local persistence and provider use are separate decisions, even when one clearly labeled setup shortcut selects both.

- **Save basics:** stores only confirmed allowlisted fields in private local state and allows their bounded snapshot in provider prompts.
- **Session only:** returns a caller-managed session record, writes no Secretary personalization files, and allows its bounded snapshot in the intended session's provider prompt. The controller cannot enforce the caller's session lifetime.
- **Customize:** stores the confirmed basics and asks separately whether their bounded snapshot may enter provider prompts.
- **Declined:** stores only the decline plus revision timestamps, so Secretary does not ask on every invocation.
- **Save nothing:** writes no consent or preference record, so Secretary may offer setup again later.
- **Provider use:** controls whether an allowlisted presentation snapshot may enter a prepared provider prompt. When it is off, no personalization bytes enter that prompt.

The user can inspect, pause, resume, change, export, reset, or delete personalization from the `principal` CLI family. A later provider-sharing choice can be changed with a separate revisioned `{"provider_use":true|false}` update. It cannot be mixed with preference changes. Pausing preserves the local record but excludes it from new prompt snapshots. Deleting removes the personalization records, not run history or the user's workspace.

## What may be stored

Version 1 permits only confirmed presentation and routing preferences:

- language
- secretary name
- optional form of address for the principal
- default governed profile
- tone
- answer length
- response structure
- document format preferences
- whether to clarify before drafting

Secretary policy prohibits storing raw conversation text, inferred identity or personality, sensitive traits, credentials, financial or health data, beliefs, contacts, domain claims, task authority, approvals, or CCIR items as personalization. The controller enforces a closed field allowlist, types, lengths, and control-character limits, but it cannot reliably classify a secret or sensitive fact embedded inside an allowed string. The user and calling agent must not place such content in an allowed field. Secretary does not silently learn behavior patterns. A later pattern-suggestion feature would require a separate consent and confirmation cycle before any candidate becomes a preference.

## Precedence and prompt boundary

The immutable Secretary contract is always first. An explicit instruction in the current task outranks a saved presentation preference. A saved default can help choose a profile when the caller does not pass `--profile`, but an explicit profile remains authoritative.

When local persistence and provider use are both active, `prepare` freezes a bounded allowlisted snapshot of at most 4096 bytes in private run state. The prompt labels it untrusted advisory data and binds it by hash. It cannot alter evidence requirements, authority, approvals, dissent, retention, or security controls. Corrupt, unknown, paused, declined, or unconsented state produces no provider snapshot and must fail closed with a visible warning or status.

## Local state and privacy

Personalization lives under:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/secretary/personalization/
```

Directories use mode `0700`; files use mode `0600` and hardened atomic replacement. Consent and preferences use separate closed schemas and revision counters. Session-only `principal init` output can be placed in a short-lived caller-owned file and supplied to `prepare` with `--principal-session-file PATH`, but is not copied into persistent personalization state. The record has no controller-enforced expiry or use counter and can be replayed if retained. The host must protect it, limit it to the intended interaction, and remove it afterward. Read-only principal commands accept the same record through `--session-file PATH`.

`doctor` reports a missing, active, stale, or invalid mutation lock. An exact confirmed delete refuses an active owner or a recently invalid lock. It can clear a stale valid lock or an invalid lock at least five minutes old before deleting only the personalization directory.

Persistent initialization writes the profile before the consent record. A process kill or host loss between those atomic replacements can leave a half-initialized state. Secretary treats that state as invalid, sends no personalization, and refuses another initialization. Use `principal doctor`, inspect the private files if recovery matters, then use the exact confirmed personalization delete and start setup again. The controller does not silently repair or overwrite this state.

Closed schemas, revisions, private permissions, and no-follow file operations reduce accidental drift and common path attacks. They do not defend against a malicious process running as the same operating-system user. Local persistence also does not make provider transmission private. Review the provider's terms and retention behavior before opting in.
