# Behaviour harness

Offline tests use canned results. They test predicates and controller plumbing, not model behaviour.

To add a scenario:

1. Copy a directory under `scenarios/`.
2. Give `scenario.json` an id, description, behaviour categories, expected predicates with arguments, and passing and failing canned result paths.
3. Put the request in `task.md` and evidence files in `workspace/`.
4. Keep each canned file wrapped with the offline `mode_label` and a schema-shaped `result`.
5. Make the passing result satisfy every expected predicate.
6. Make the failing result reproduce the failure mode and fail every relevant predicate.
7. Run `node --test tests/behaviour/`.

Live runs use the real Claude backend and never run in `npm test`:

`SECRETARY_LIVE=1 node tests/behaviour/harness.mjs live tests/behaviour/scenarios/<id>`
