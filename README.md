# MarkHere

MarkHere is a local-first Electron Markdown desktop application being built as an independent product.

## Architecture status

This repository implements:

- **Issue 1 — Establish the MarkHere Repository, Toolchain, Architecture Boundaries, and Provenance**
- **Issue 2 — Build the Secure Electron Application Shell and Privileged API Boundary**
- **Issue 3 — Implement the Canonical Document Model, Filesystem Lifecycle, Atomic Persistence, Conflicts, and Recovery**
- **Issue 4 — Implement the Markdown Dialect, Parsing, Safe Rendering, Resource Broker, and Preview Pipeline**
- **Issue 5 — Implement Source, WYSIWYG, Preview, and Split Editing as Four First-Class Modes**
- **Issue 6 — Implement the MarkHere Desktop Workspace, Navigation, Settings, Themes, Accessibility, and Productivity Features**
- **Issue 7 — Implement the Unified Export Architecture for HTML, PDF, DOCX, and Printing**
- **Issue 8 — Implement Security Enforcement, Error Handling, Logging, Crash Recovery, Privacy, and Operational Hardening**
- **Issue 9 — Package, Sign, Integrate, Update, and Deploy MarkHere on Windows 11**
- **Issue 10 — Implement the Full Automated Testing, Performance, Accessibility, Compatibility, and Release-Acceptance Program**

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

## Issue 5 four-mode editor model

MarkHere now treats **Preview**, **WYSIWYG**, **Source**, and **Split** as first-class modes over one canonical revisioned Markdown buffer. A process-neutral `ModeController` serializes transitions, flushes same-frame edits before handoff, carries structural/caret navigation state, and falls back to Source if an editor surface cannot safely activate. It never stores a second copy of authoritative document text.

Source mode is implemented with CodeMirror 6 behind `@markhere/source-editor`. Authoritative canonical revisions rebuild the private CodeMirror state so stale Source undo history cannot be replayed over reload/recovery/WYSIWYG content. WYSIWYG mode uses the published MIT-licensed `@muyajs/core` `0.2.0` package only through `@markhere/editor-core`; entry performs a conservative Markdown round-trip check and falls back to Source rather than silently normalizing unsupported syntax. Because the public Muya 0.2.0 API predates MarkText's newer source-mode handoff helpers, MarkHere carries one explicitly-provenanced compatibility module for source-coordinate selection mapping plus MarkHere-owned same-frame drain/synthetic undo-boundary logic.

Split mode reuses the same Source adapter and the Issue-4 safe preview renderer. Scroll synchronization is structural (source line/block anchors), not percentage based, and the splitter ratio plus sync preference are versioned settings. Save and Save As flush the active editable adapter before the canonical session snapshot is sent to the main-process persistence service.

See:

- `docs/development/issue-05-implementation.md`
- `docs/development/issue-05-validation.md`
- `docs/provenance/MUYA_DEPENDENCY.md`


## Issue 6 desktop workspace model

Issue 6 turns the editor engine into the working desktop shell. The renderer owns tabs, navigation panels, outline/search presentation, command-palette state, and status presentation; privileged filesystem/workspace authority remains in main. Opening a folder creates a main-owned workspace capability. Tree listing and create/rename/move/trash operations accept only relative paths that are resolved and contained beneath that root, while live updates are delivered through debounced watcher events. Recursive search uses the pinned `@vscode/ripgrep` binary behind an owned cancellable main-process job and streams bounded result batches to the renderer.

Settings are schema-versioned and include Light/Dark/System appearance, default mode, autosave delay, remote-resource policy, source line numbers, split ratio/synchronization, image storage, and validated keybindings. The native menu and command palette share stable command IDs; keybinding collisions are rejected in main. Recent files/workspaces remain metadata only and are revalidated before a new runtime capability is issued. Pasted/dropped images either copy through the document capability into `./assets/` or use the explicitly selected data-URI policy. Autosave reuses the normal revision-aware save pipeline and does not bypass conflict detection.

See:

- `docs/development/issue-06-implementation.md`
- `docs/development/issue-06-validation.md`


## Issue 7 unified export model

Issue 7 exports an **immutable canonical Markdown revision**, never live editor/WYSIWYG DOM. Main owns `ExportCoordinator`, one-shot destination tokens, capability-scoped local asset resolution, cancellation/progress, isolated temp directories, and atomic final replacement. One process-neutral `ExportIR` is built with the same Markdown capability profile used elsewhere; standalone HTML, native DOCX, sanitized PDF print HTML, and native printing consume that IR.

Long-running HTML/DOCX/print-document conversion runs in a bounded Electron `utilityProcess`. PDF and Print use a hidden `WindowManager`-created sandboxed BrowserWindow with no preload/Node/capabilities, loaded from a controlled script-free `markhere://print/<jobId>` document before `printToPDF()` or the native print dialog. DOCX uses the pinned `docx` package and emits native headings, relationships, numbering, tables, images, code styles, and page settings. Unsupported target fidelity such as Mermaid-to-image/DOCX math-image currently follows the ADR-022/023 explicit-diagnostic fallback rule rather than silently dropping content.

See:

- `docs/development/issue-07-implementation.md`
- `docs/development/issue-07-validation.md`


## Issue 8 security and operational hardening

Issue 8 centralizes security decisions in `@markhere/security-core`, enforces CSP/navigation/network policy in main, bounds and rate-limits privileged IPC, tightens DOMPurify/SVG handling, adds structured stable error categories, and introduces content-free rolling local logging through `@markhere/logging-core`. Crashpad collection remains local-only, repeated unclean startup enters Safe Mode without deleting recovery, and diagnostic bundles are generated only by explicit user action and exclude document/recovery bodies. Production dependency/privacy/fuse expectations live in `docs/security/production-hardening-policy.json`.

See `docs/development/issue-08-implementation.md` and `docs/development/issue-08-validation.md`.

## Issue 9 Windows deployment

MarkHere now has a production Windows 11 x64 packaging path using electron-builder + per-user NSIS + ZIP, custom per-user Markdown handler registration, Electron fuse mutation before signing, Authenticode verification, a main-only electron-updater service, Explorer/CLI activation through normal file/workspace capability issuance, and a protected Windows release workflow. Stable release builds require CI-provided publisher/signing/update-host values and a committed frozen `pnpm-lock.yaml`; the repository does not fabricate those release credentials or dependency evidence.

See `docs/development/issue-09-implementation.md` and `docs/development/issue-09-validation.md`.


## Issue 10 release qualification

Issue 10 completes MarkHere’s layered quality program: the official CommonMark 0.31.2 corpus, property/state tests, Playwright Electron E2E, axe accessibility smoke, deterministic performance/soak fixtures, exact Windows installer tests, Unicode/no-edit compatibility checks, export artifact parsing, synthetic-fixture privacy checks, machine-readable FR/NFR traceability, and candidate-hash-aware release evidence. Playwright is intentionally complemented by Windows system/manual qualification rather than treated as sole release proof.

See `docs/development/issue-10-implementation.md` and `docs/development/issue-10-validation.md`.


## One-click local Windows setup

For normal local use on Windows 11 x64, double-click `Setup-MarkHere.cmd`. It downloads a **project-local** Node.js 22.16.0 toolchain (no Administrator rights or system PATH changes), activates pnpm 10.33.4, installs the frozen workspace, downloads the Electron 42 runtime, builds the production renderer/main/preload bundles, and generates `MarkHere.exe` in the repository root.

After the first successful setup, launch MarkHere by double-clicking `MarkHere.exe`. The launcher runs the built application with `NODE_ENV=production`; it does not start the Vite development server. Rerun `Setup-MarkHere.cmd` after source/dependency changes that require a rebuild. `Setup-MarkHere.cmd --no-launch` performs setup without starting the application afterwards.

The generated `MarkHere.exe` is a **local development launcher tied to this project folder**, not the signed distributable. Official Windows installer/portable artifacts still come from the Issue-9 electron-builder release pipeline.

## Pinned development baseline

- Node.js `22.16.0`
- pnpm `10.33.4`
- Electron `42.11.3`
- TypeScript `6.0.3`
- Vue `3.5.38`
- Pinia `3.0.4`
- electron-vite `5.0.0`
- CodeMirror 6 packages owned by `@markhere/source-editor`
- Muya `@muyajs/core` `0.2.0` behind `@markhere/editor-core`, plus the explicitly-provenanced MarkHere compatibility layer documented in `docs/provenance/MUYA_DEPENDENCY.md`
- markdown-it `15.0.2`
- DOMPurify `3.4.15`
- Mermaid `11.15.0`
- KaTeX `0.18.0`
- PrismJS `1.30.0`
- `@vscode/ripgrep` `1.18.0` for bounded, cancellable workspace search
- `docx` `9.7.1` behind `@markhere/export-docx` for native OOXML generation
- `sanitize-html` `2.17.7` + `@types/sanitize-html` `2.16.2` for standalone export HTML sanitization

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
pnpm check:editor-modes
pnpm check:desktop-workspace
pnpm check:unified-export
pnpm check:security-hardening
pnpm check:security-regression
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:secure-shell:runtime
pnpm dev
```

> **Lockfile finalization:** the uploaded repository still does not contain a real `pnpm-lock.yaml`, and this implementation environment cannot reach the npm registry. No lockfile has been fabricated. On a network-enabled machine run `pnpm install`, `pnpm compliance`, and the full gate above, then commit the pnpm-generated lockfile and regenerated dependency notices/SBOM. CI deliberately fails while the lockfile is absent. See `docs/development/issue-05-validation.md`.

## Repository map

```text
apps/desktop/               Electron main/preload/Vue renderer + isolated export worker boundary
  src/main/                 lifecycle, WindowManager, protocols, IPC, services, commands
  src/preload/              one reviewed raw IPC transport + semantic contextBridge
  src/renderer/             sandboxed Vue application shell
  src/workers/              isolated utility-process export worker boundary
  test/                     Main/security/document-lifecycle tests
packages/document-model/    Process-neutral document identifiers/contracts
packages/ipc-contract/      Bridge DTOs, channel maps, Zod runtime schemas
packages/markdown-engine/   CommonMark/GFM/MarkHere parser and capability registry
packages/preview-renderer/  Sanitized read-only preview, Mermaid, KaTeX, Prism, render coordinator
packages/editor-session/    Four-mode orchestration; owns no canonical Markdown
packages/editor-core/       Muya-backed WYSIWYG adapter boundary
packages/source-editor/     CodeMirror 6 exact-source adapter boundary
packages/export-core/       Shared process-neutral revision snapshot + semantic ExportIR
packages/export-*/          HTML/PDF/DOCX format adapters
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
pnpm check:editor-modes
pnpm check:desktop-workspace
pnpm check:unified-export
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

MarkHere is independent from MarkText. Issue 5 consumes the published MIT-licensed `@muyajs/core` `0.2.0` dependency behind a MarkHere adapter and contains one explicitly marked/provenanced adaptation of MarkText Muya's source-coordinate sentinel technique in `packages/editor-core/src/muya-v020-compat.ts`. That provenance is recorded in `docs/provenance/provenance.json` and `docs/provenance/MUYA_DEPENDENCY.md`; applicable MIT notices are retained under `docs/provenance/licenses/`. Any future copied/adapted upstream source must follow the same `@markhere-upstream` + manifest process. See `THIRD_PARTY_NOTICES.md`.

## License

Original MarkHere source is currently **all rights reserved / not licensed for redistribution** until the project owner selects a final source license. Third-party components retain their own licenses.
