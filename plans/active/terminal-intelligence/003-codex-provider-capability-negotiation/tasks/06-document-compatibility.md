# Task 06: Update compatibility documentation

## In plain English

Document the reliable post-fix contract. Remove the numeric minimum-version promise and explain capability-based acceptance with strict fail-closed isolation.

## Work

- [ ] Discover all version/startup validation references.
- [ ] Update `docs/natural-language-interface.md` setup, support, privacy, troubleshooting, and maintainer guidance to describe exact capability validation and targeted legacy fallback.
- [ ] Remove the numeric minimum-version promise without claiming that every future Codex release is compatible.
- [ ] Confirm `README.md`, generated types/schema, CLI help, and changelog need no changes because this adds no public API/config/CLI surface; record the audit in task evidence.

## Acceptance

- [ ] No numeric compatibility-boundary promise remains.
- [ ] Documentation matches implementation and introduces no manual setup.

## Verify

- [ ] Run `rg -n "0\\.144\\.6|minimum version|minimum-version" docs/natural-language-interface.md README.md` and require no compatibility-boundary promise.
- [ ] Run `rg -n "capabilit|effective config|feature|fail closed|keyring" docs/natural-language-interface.md` and confirm the user-facing contract and troubleshooting guidance are present.
- [ ] Run `git diff --check -- docs/natural-language-interface.md` and require no whitespace errors.
