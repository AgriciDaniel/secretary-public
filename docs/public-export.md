# Public export boundary

Secretary's canonical development repository may contain frozen third-party extracts, a detailed research digest, diagnostic data, and local run state that must not enter a public source tree by accident.

Keep the canonical development repository private. Choose the public GitHub
target before exporting, then pass it as an explicit `OWNER/REPO` slug:

```text
npm run public:export -- --repository OWNER/REPO
```

The command fails closed when `--repository` is absent or malformed. It rewrites
the canonical repository, homepage, issue, security, clone, changelog, and
support URLs in the projected text files to the selected public target. The
selected slug is recorded in `references/public-export.json`, and verification
requires the public `package.json` URLs to match it.

If the selected target is the canonical repository's current slug, export is
blocked. The preferred same-name topology is:

1. Keep the canonical repository private and rename its remote repository.
2. Confirm the old slug is now available for a separate public repository.
3. Export with the explicit acknowledgement below.

```text
npm run public:export -- --repository OWNER/REPO --acknowledge-renamed-private-repository
```

That flag is an acknowledgement only. It does not inspect or change GitHub,
initialize Git, create a repository, push, publish, or alter the canonical Git
history. Do not use it until the private remote has actually been renamed.

The command refuses to overwrite an existing output. Inside the explicit public
roots, it selects only Git-tracked files and unignored worktree files. It
rejects links and special files, omits `references/evidence/`, and replaces
`references/claim-evidence.json` and `references/research-digest.md` with
public-safe placeholders. It also excludes Git data, diagnostics, Obsidian
state, run state, ignored builds, and release output. A manifest-valid public
projection may be used as a source without Git metadata so its offline tests
remain portable. Verification rejects option-like root paths, a root `.git`
file or directory, and any nested `.git` path.

Visual assets fail closed through `assets/PROVENANCE.md`. A visual file is
copied only when its inventory row contains the SHA-256 of its current bytes,
its public rights status is exactly `Owner approved`, and a named sign-off row
with a `YYYY-MM-DD` review date, decision `approved`, the same full hash, and a
non-pending evidence location exists. A filename, Git commit, older approved
hash, or file presence is never enough. Pending and unrecorded visuals are
omitted. Image tags for omitted local assets are replaced only in the projected
README with an explicit omission notice, while the canonical README and assets
remain unchanged. The provenance inventory itself stays public so recipients
can see what was excluded and why.

The exporter scans the resulting bytes for credential patterns, absolute home paths, unexpected binaries, em dashes, private paths, and manifest drift. It records a deterministic file list, mode, and SHA-256 digest in `PUBLIC_EXPORT_MANIFEST.json`. File modes and timestamps are normalized so identical source bytes produce the same projection bytes and metadata.

`references/public-export.json` is a machine-readable omission marker. It also
records that pending visuals were omitted and that exact-hash owner approval is
required for inclusion. The strict human-support gate fails when that marker
says the claim evidence was omitted. This prevents an empty public ledger from
passing as if every claim had been reviewed.

The public projection preserves the controller, profiles, tests, source ledger, and brain notes. Without private extracts, retrieval supplies no `[RAW]` evidence for the omitted claims. The correct behavior is `no data`, an explicit gap, or a request for rights-cleared evidence.

Create a deterministic archive only from a verified public projection:

```text
npm run public:verify
npm run public:archive
```

The public archive command stages regular files from the verified manifest tree,
reruns public verification and the private-corpus byte and passage checks, then
compares every archived path, mode, and byte with the verified tree. It writes
ustar and a fixed-header gzip stream directly with Node, so the archive does not
depend on GNU or BSD `tar` flags and identical inputs produce identical bytes on
Linux and macOS. The gzip stream uses deterministic stored DEFLATE blocks rather
than platform compression, trading archive size for cross-platform byte
identity. It refuses to overwrite an archive or write the archive inside its
source projection.

The dependency-free writer accepts regular files only, rejects unsafe and
control-character paths, preserves only normalized `0644` and `0755` modes, and
uses the ustar 100-byte name plus 155-byte prefix fields. A path that cannot be
split at a slash within those UTF-8 byte limits fails closed. The complete
uncompressed tar is limited to 256 MiB and is buffered in memory. These limits
are deliberate release failures, not truncation behavior.

`npm run private:archive` is intentionally named as a private operation. It
packages the canonical tracked tree, including the private corpus, into
`release/private/`. It is for private backup or review only and must never be
published as the public source artifact. There is no `release:archive` command.

After export, run the available deterministic checks inside the projected tree:

```text
cd release/secretary-public
npm test
npm run check:generated
npm run check:links
npm run check:evidence
node scripts/check-source-types.mjs
```

Run `npm run public:ready` from the canonical checkout after creating the
default projection, or from inside a verified public projection. The command
does not export, archive, initialize Git, publish, or modify the projection. It
verifies the manifest-bound tree, runs the generated-file, link, source-type,
locator, and canonical test gates, then requires the strict support check to
fail with exactly the declared public-omission reason. A different exit status
or message fails public readiness. Direct
`npm run check:evidence:support` therefore still fails in a valid public
projection by design.

The projection contains no canonical `.git` metadata. When the rights and owner
release gates are complete, initialize it as a fresh repository and verify the
exact staged tree before the first commit. Never copy the canonical `.git`
directory, use a canonical bundle, or push canonical refs into the public
repository. Repository creation, commits, signing, pushing, and visibility
changes remain manual owner-authorized actions outside these scripts.

This process reduces accidental publication risk. It is not legal advice and does not clear every short quotation, paraphrase, source title, trademark, or factual metadata field that remains in the source ledger and brain notes. The owner still needs a claim-level rights decision before publication.
