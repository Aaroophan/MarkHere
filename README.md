# MarkHere

MarkHere is a local-first Electron Markdown desktop application being built as an independent product.

## Architecture status

This repository implements:

- **Issue 1 — Establish the MarkHere Repository, Toolchain, Architecture Boundaries, and Provenance**
- **Issue 2 — Build the Secure Electron Application Shell and Privileged API Boundary**
- **Issue 3 — Implement the Canonical Document Model, Filesystem Lifecycle, Atomic Persistence, Conflicts, and Recovery**
- **Issue 4 — Implement the Markdown Dialect, Parsing, Safe Rendering, Resource Broker, and Preview Pipeline**

The 11 architecture documents in `docs/01-...` through `docs/11-...` are normative. `docs/12-implementation-plan,md` is the implementation backlog derived from them. When implementation and architecture disagree, resolve the architecture conflict explicitly rather than silently weakening a boundary.

## Issue 2 security model

Production renderer content is loaded from `markhere://app`, not as the application `file://` origin. All editor/settings windows are sandboxed and context-isolated with Node integration disabled. The renderer receives only the versioned semantic API exposed as:

```ts
window.markhere
```

The bridge contains the reviewed namespaces (`app`, `window`, `dialogs`, `files`, `workspaces`, `resources`, `settings`, `recovery`, `exports`, `shell`, `clipboard`, `updates`, `events`) and **does not expose raw `ipcRenderer`**. Every privileged main-process operation validates the registered sending window/frame, runtime DTO schema, and capability ownership where applicable.

Later-domain bridge methods already have their stable typed shape but fail closed until their owning implementation issue is completed; there is no temporary generic filesystem API.

See:

- `docs/development/issue-02-implementation.md`
- `docs/development/issue-02-security-baseline.md`
- `docs/development/issue-02-validation.md`

## Issue 3 document durability model

Markdown text is the canonical open-session state. `DocumentSession` revisions are monotonic and `dirty` is derived from `revision !== persistedRevision`. Main owns canonical paths through document capabilities; the renderer cannot redirect saves with a display path. Bound-file saves are serialized per document, require an expected disk fingerprint, write to a same-directory temporary file with an explicit flush, and only then replace the target. External modifications cannot be silently overwritten.

Recovery snapshots and UI/session metadata are private, schema-versioned storage separate from the user Markdown file. See:

- `docs/development/issue-03-implementation.md`
- `docs/development/issue-03-validation.md`

## Issue 4 Markdown/preview model

MarkHere now has an explicit Markdown capability profile: CommonMark 0.31.2 plus registered GFM/MarkHere extensions. Parsed trees, heading maps, HTML, preview DOM, Mermaid SVG, KaTeX output, and highlighted code remain disposable derivatives of the canonical revisioned Markdown buffer. Raw HTML is sanitized before DOM insertion, links are inert until the main-process resolver classifies them, and local images use document-bound `markhere-resource://` scopes rather than `file://`.

See:

- `docs/development/markdown-compatibility.md`
- `docs/development/issue-04-implementation.md`
- `docs/development/issue-04-validation.md`

## Pinned development baseline

- Node.js `22.16.0`
- pnpm `10.33.4`
- Electron `42.11.3`
- TypeScript `6.0.3`
- Vue `3.5.38`
- Pinia `3.0.4`
- electron-vite `5.0.0`
- CodeMirror 6 packages owned by `@markhere/source-editor`
- markdown-it `15.0.2`
- DOMPurify `3.4.15`
- Mermaid `11.15.0`
- KaTeX `0.18.0`
- PrismJS `1.30.0`

The sandboxed preload is fully bundled into a single CommonJS `index.cjs`; the Electron main process remains ESM.

## Bootstrap

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm check:foundation
pnpm check:secure-shell
pnpm check:document-lifecycle
pnpm check:markdown-preview
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:secure-shell:runtime
pnpm dev
```

> **Lockfile finalization:** the uploaded repository still does not contain a real `pnpm-lock.yaml`, and this implementation environment cannot reach the npm registry. No lockfile has been fabricated. On a network-enabled machine run `pnpm install`, `pnpm compliance`, and the full gate above, then commit the pnpm-generated lockfile and regenerated dependency notices/SBOM. CI deliberately fails while the lockfile is absent. See `docs/development/issue-04-validation.md`.

## Repository map

```text
apps/desktop/               Electron main/preload/Vue renderer/worker boundary
  src/main/                 lifecycle, WindowManager, protocols, IPC, services, commands
  src/preload/              one reviewed raw IPC transport + semantic contextBridge
  src/renderer/             sandboxed Vue application shell
  src/workers/              reserved isolated worker boundary
  test/                     Main/security/document-lifecycle tests
packages/document-model/    Process-neutral document identifiers/contracts
packages/ipc-contract/      Bridge DTOs, channel maps, Zod runtime schemas
packages/markdown-engine/   CommonMark/GFM/MarkHere parser and capability registry
packages/preview-renderer/  Sanitized read-only preview, Mermaid, KaTeX, Prism, render coordinator
packages/editor-core/       Reserved Muya-derived WYSIWYG boundary
packages/source-editor/     CodeMirror 6 source-editor boundary
packages/export-core/       Process-neutral export contracts
packages/export-*/          Format-specific exporter boundaries
packages/security-core/     Pure URL/security policy helpers
packages/shared/            Pure reusable TypeScript utilities
packages/test-fixtures/     Shared deterministic test fixtures
docs/provenance/            Upstream provenance/license policy
scripts/                    Architecture/compliance/security verification
```

## Architecture/security checks

```bash
pnpm check:foundation
pnpm check:secure-shell
pnpm check:document-lifecycle
pnpm check:markdown-preview
pnpm graph:dependencies
```

`check:secure-shell` verifies, among other invariants:

- centralized BrowserWindow creation;
- explicit sandbox/context-isolation preferences;
- `markhere://` routing and CSP;
- single fully bundled CJS sandbox preload;
- one raw IPC transport file only;
- complete semantic bridge namespaces;
- sender/top-frame/origin validation;
- fail-closed browser permission handling;
- central external URL policy;
- typed `mh:v1:*` channels and runtime schemas;
- navigation and popup denial.

The runtime probe performs the corresponding checks against a real Electron renderer after build.

## Provenance

MarkHere is independent from MarkText. No copied/adapted MarkText/Muya source is present in the current tree. If future work selectively reuses upstream code, it must be marked with `@markhere-upstream`, recorded in `docs/provenance/provenance.json`, and retain the applicable upstream notice. See `THIRD_PARTY_NOTICES.md`.

## License

Original MarkHere source is currently **all rights reserved / not licensed for redistribution** until the project owner selects a final source license. Third-party components retain their own licenses.
