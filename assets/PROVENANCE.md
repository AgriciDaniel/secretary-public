# Visual asset provenance

Status: owner decision recorded for private retention and public exclusion.
This record is an inventory and release checklist, not a rights conclusion or
legal advice.

## Repository facts

The table identifies the exact bytes in the current worktree. A Git commit,
filename, or SHA-256 digest proves repository identity only. It does not prove
who created an asset, whether a supplier had authority to provide it, whether a
generation service's terms permit redistribution, or whether third-party
elements are cleared.

| Asset | Format and dimensions | SHA-256 | First repository commit | Public rights status |
| --- | --- | --- | --- | --- |
| `cover-web.jpg` | JPEG, 1672 by 941 | `865d0d36e073a86558d68dbb8ac37c43b473210959d45ca3be850fdd756ce283` | `818b94d2cd87daf10b0a62ee9b7d4535af0a1f42` | Keep private; exclude from public pending rights evidence |
| `cover.png` | PNG, 1672 by 941 | `8bf308e0ec6b3c0f640f0dc008b6a0133cee5afa0328518f3ed657968625606d` | `fa5d144d00084fabaafc919f7e0e0b96b41ccbcb` | Keep private; exclude from public pending rights evidence |
| `diagram-authority.svg` | SVG | `8ef73143bc431fc64587af8e20da47eb16def57408079c135136ba56e160a266` | `7f67c528959af612c3855e6a7fdfd8a28f565456` | Keep private; exclude from public pending rights evidence |
| `diagram-lifecycle.svg` | SVG | `86e16d18fabcb80d7de0c0cfc61be8eb41d926cd69342e18aee657be4171dfd8` | `7f67c528959af612c3855e6a7fdfd8a28f565456` | Keep private; exclude from public pending rights evidence |
| `diagram-retrieval.svg` | SVG | `e2767660273634e01d85b3a74d27306ac71113295270f51336f0a299fe9b42f9` | `7f67c528959af612c3855e6a7fdfd8a28f565456` | Keep private; exclude from public pending rights evidence |
| `social-card.png` | PNG, 1280 by 640 | `e1ba74108f3977b9a173a54096944dc4ce06c3a12e71249df6598b20d34067ee` | `818b94d2cd87daf10b0a62ee9b7d4535af0a1f42` | Keep private; exclude from public pending rights evidence |
| `trust-boundary.jpg` | JPEG, 1672 by 941 | `9d526406c7b789c495c4a21f4d0c859bac74679c85ecb816d1ca8c8a1759c3d3` | `7f67c528959af612c3855e6a7fdfd8a28f565456` | Keep private; exclude from public pending rights evidence |

## Owner decision

On 2026-08-17, repository owner `AgriciDaniel` directed that all seven assets
remain in the private canonical repository. This is not approval for public
redistribution. The public exporter must continue to exclude them unless a
later named, dated, exact-hash approval records the required rights evidence.

## Evidence required before public inclusion

For each asset, the repository owner must record and retain the supporting
evidence for all applicable items:

- Creator or supplier identity and the date received or created.
- Original source file or source location.
- Creation method and tools. If a generative service was used, record the
  service, model, account basis, and terms that applied on the creation date.
- Any third-party photographs, illustrations, logos, trademarks, fonts,
  templates, stock elements, or recognizable people.
- The licence, assignment, permission, or original-authorship basis relied on
  for public redistribution and modification.
- Any required attribution, notice, usage restriction, privacy consent, or
  trademark limitation.
- A named owner decision for the exact SHA-256 bytes: `approved`, `replace`, or
  `exclude`, with the review date.

Do not convert `pending` to `approved` based only on a commit author, a supplied
filename, absent metadata, or visual inspection. If evidence cannot be produced,
replace the asset with one whose provenance can be documented or exclude it
from the public projection.

## Owner sign-off

| Reviewer | Review date | Asset hashes reviewed | Decision | Evidence location |
| --- | --- | --- | --- | --- |
| `AgriciDaniel` | 2026-08-17 | All seven hashes listed above | Keep private; exclude from public pending evidence | Owner direction recorded in this review |
