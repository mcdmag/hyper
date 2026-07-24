# Task 05: Implement and test capability negotiation

## In plain English

Replace version and recursive metadata assumptions with explicit capability checks. Make 0.145 reach auth, retain 0.144.6 fallback, and reject isolation that cannot be proven.

## Work

- [ ] Add failing tests for modern config/provenance and arbitrary user-agent versions.
- [ ] Add effective precedence, legacy fallback, unsafe/malformed/missing feature, and method-failure cases.
- [ ] Remove minimum-version gate and recursive collection.
- [ ] Validate effective credential/features first and targeted legacy containers only when absent.
- [ ] Preserve lifecycle, auth, turn, environment, filesystem, denial, and error behavior.

## Acceptance

- [ ] Modern fixture reaches account/read without experimental list when effective features are complete.
- [ ] Metadata/version branding do not decide compatibility.
- [ ] Legacy fixture passes; unsafe/unproven state fails closed.
- [ ] No public API or UI surface changes.
