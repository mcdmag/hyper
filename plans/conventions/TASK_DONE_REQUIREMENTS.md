# Task Done Requirements

Mandatory requirements that must execute successfully before any task is marked
as complete via `cue_done`. These are non-negotiable — a task cannot be
considered done if any of these fail.

Customize the sections below for your project's stack and tooling.

---

## 1. All Tests Must Pass

<!-- Uncomment the section that matches your project -->

<!-- Node.js / npm -->
<!-- ```bash -->
<!-- npm test -->
<!-- ``` -->

<!-- Node.js / pnpm -->
<!-- ```bash -->
<!-- pnpm test -->
<!-- ``` -->

<!-- .NET Core -->
<!-- ```bash -->
<!-- dotnet test -->
<!-- ``` -->

<!-- Python / pytest -->
<!-- ```bash -->
<!-- pytest -->
<!-- ``` -->

<!-- Go -->
<!-- ```bash -->
<!-- go test ./... -->
<!-- ``` -->

<!-- Rust -->
<!-- ```bash -->
<!-- cargo test -->
<!-- ``` -->

<!-- Java / Maven -->
<!-- ```bash -->
<!-- mvn test -->
<!-- ``` -->

<!-- Java / Gradle -->
<!-- ```bash -->
<!-- ./gradlew test -->
<!-- ``` -->

Every test must pass. If any test fails:
- Fix the failure if it was caused by your changes
- If the failure is pre-existing and unrelated, document it as evidence

## 2. Type/Compilation Check Must Succeed

<!-- Uncomment the section that matches your project -->

<!-- TypeScript -->
<!-- ```bash -->
<!-- npx tsc --noEmit -->
<!-- ``` -->

<!-- .NET Core -->
<!-- ```bash -->
<!-- dotnet build --no-restore -->
<!-- ``` -->

<!-- Go -->
<!-- ```bash -->
<!-- go build ./... -->
<!-- ``` -->

<!-- Rust -->
<!-- ```bash -->
<!-- cargo check -->
<!-- ``` -->

<!-- Java / Maven -->
<!-- ```bash -->
<!-- mvn compile -q -->
<!-- ``` -->

Zero errors allowed. Fix any errors your changes introduced.

## 3. Linting (optional)

<!-- Uncomment if your project uses a linter -->

<!-- ESLint -->
<!-- ```bash -->
<!-- npx eslint . -->
<!-- ``` -->

<!-- Python / ruff -->
<!-- ```bash -->
<!-- ruff check . -->
<!-- ``` -->

<!-- Go -->
<!-- ```bash -->
<!-- golangci-lint run -->
<!-- ``` -->

<!-- .NET / dotnet format -->
<!-- ```bash -->
<!-- dotnet format --verify-no-changes -->
<!-- ``` -->

## 4. No Uncommitted Changes

All changes must be committed. Run `git status` and confirm the working tree
is clean. Do not leave modified, staged, or untracked files behind.

---

**This file is the authoritative source for task completion requirements.**
It is referenced by the `pre-done` checklist gate and its requirements are
enforced automatically via `cue_checklist`. Customize the sections above by
uncommenting the commands that match your project's stack.
