# MarkHere

MarkHere is a local-first Electron Markdown desktop application being built as an independent product.

## Architecture status

This repository currently implements **Issue 1 — Repository, Toolchain, Architecture Boundaries, and Provenance** from `docs/12-implementation-plan,md`.

The 11 architecture documents in `docs/01-...` through `docs/11-...` are normative for implementation. When code and an architecture document disagree, stop and resolve the conflict rather than silently changing the architecture.

## Pinned development baseline

- Node.js `22.16.0`
- pnpm `10.33.4`
- Electron `42.11.3` baseline
- TypeScript `6.0.3`
- Vue `3.5.38`
- Pinia `3.0.4`
- electron-vite `5.0.0`
- CodeMirror 6 packages are owned by `@markhere/source-editor`

## Bootstrap

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

> **Lockfile finalization:** Issue 1 requires a real `pnpm-lock.yaml`. The implementation environment used to prepare this archive could not reach the npm registry, so it intentionally does not contain a fabricated lockfile. On a network-enabled machine, use the pinned Node/pnpm versions, run `pnpm install`, then `pnpm compliance`, commit the generated `pnpm-lock.yaml` and refreshed `THIRD_PARTY_NOTICES.md`, and rerun `pnpm ci:foundation`. CI deliberately fails when the lockfile is absent. See `docs/development/issue-01-validation.md`.

`pnpm dev` launches only the secure Issue-1 shell. Document IO, typed IPC handlers, custom protocols, and editor functionality belong to later issues.

## Repository map

```text
apps/desktop/               Electron main/preload/Vue renderer shell
packages/document-model/    Process-neutral document identifiers and contracts
packages/ipc-contract/      Renderer-facing bridge types (no raw IPC API)
packages/markdown-engine/   Markdown capability/dialect contracts
packages/editor-core/       Reserved Muya-derived WYSIWYG boundary
packages/source-editor/     CodeMirror 6 source-editor boundary
packages/export-core/       Process-neutral export contracts
packages/export-*/          Format-specific exporter package boundaries
packages/security-core/     Pure security policy types/helpers
packages/shared/            Pure reusable TypeScript utilities
packages/test-fixtures/     Shared deterministic test fixtures
docs/provenance/            Upstream provenance and license policy
scripts/                    Architecture/compliance/foundation checks
build/                      Reserved repository-wide build resources
tests/                      Reserved cross-system test suites
```

## Dependency direction

Process-neutral packages must remain free of Electron/Node OS authority. Renderer code must not import Electron or Node built-ins. The preload is a narrow capability bridge and must never expose `ipcRenderer` to the page.

Run:

```bash
pnpm check:foundation
pnpm graph:dependencies
```

before opening a PR.

## Product identity

MarkHere uses its own `MarkHere` application-data namespace, provisional `com.markhere.desktop` application ID, `markhere://` / `markhere-resource://` protocol names, and `mh:v1:` internal IPC namespace. Original neutral placeholder icons live in `apps/desktop/build/icons/`. See `docs/development/product-identity.md`.

## CI and branch policy

The foundation workflow uses a frozen lockfile, caches only the pnpm store, runs formatting/lint/typecheck/tests/architecture/provenance/compliance/build gates, and always uploads diagnostic logs/evidence. Required branch-protection expectations are documented in `docs/development/branch-protection.md`.

The exact validation performed for this Issue-1 implementation is recorded in `docs/development/issue-01-validation.md`.

## License

Original MarkHere source is currently **all rights reserved / not licensed for redistribution** until the project owner selects a final source license. Third-party components retain their own licenses. See `THIRD_PARTY_NOTICES.md` and `docs/provenance/`.
