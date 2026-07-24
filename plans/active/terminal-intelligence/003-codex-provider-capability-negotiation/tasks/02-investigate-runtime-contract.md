# Task 02: Compare modern and legacy capability shapes

## In plain English

Compare Codex 0.145 and the 0.144.6 fixture by meaning rather than layout. Define explicit modern paths and the smallest legacy fallback proving identical isolation.

## Work

- [ ] Compare initialize, effective config, layers, provenance, feature, and auth shapes.
- [ ] Separate authoritative state from metadata.
- [ ] Define effective-feature and legacy-list branches plus rejection cases.

## Acceptance

- [ ] Both representations map to one security contract.
- [ ] Fallback conditions are explicit and fail closed.

## Verify

- [ ] Run `pnpm exec ava test/unit/nli-codex-app-server.test.ts --match='starts hidden*'` to prove the retained 0.144.6-style scripted handshake before changing it.
- [ ] Run `rg -n '"minimumVersion"|"experimentalFeature/list"|"responseRequired"' test/fixtures/nli/codex-app-server-0.144.6-v2-subset.json` and compare those legacy fields with the installed 0.145 probe evidence.
- [ ] Record that a present effective value is authoritative, a present non-false required feature rejects, and fallback may prove only fields absent from effective config.
