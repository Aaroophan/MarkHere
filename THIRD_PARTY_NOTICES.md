# Third-Party Notices

MarkHere is an independent application. Third-party projects retain their own copyrights and licenses.

## Muya

Issue 5 uses **`@muyajs/core` 0.2.0** as the WYSIWYG engine behind MarkHere's `@markhere/editor-core` adapter. Muya is MIT licensed. The applicable license is retained at `docs/provenance/licenses/MUYA-MIT.txt`.

MarkHere also adapts the source-coordinate sentinel mapping technique from the newer MarkText Muya tree (`marktext/marktext` commit `4e354c0c69e1ca4925fc2d8f0126c63ff6d43d46`, `packages/muya/src/selection/offsetCursor.ts`) into `packages/editor-core/src/muya-v020-compat.ts`. That destination is marked `@markhere-upstream` and recorded in `docs/provenance/provenance.json`.

The adapted code does not make Muya canonical application state: canonical content remains MarkHere's versioned Markdown buffer.

## CodeMirror 6

Issue 5 adds exact CodeMirror 6 runtime dependencies to `@markhere/source-editor`. Their package-level license notices will be emitted from the production dependency graph by the compliance generator once a genuine `pnpm-lock.yaml` is created on a network-enabled machine.

## ripgrep / @vscode/ripgrep

Issue 6 uses exact dependency **`@vscode/ripgrep` 1.18.0** to provide the reviewed ripgrep executable used by the main-process workspace search service. Search is invoked directly with `shell: false`, remains scoped to a main-owned workspace root, is cancellable, and does not require a separately installed system `rg`. The package/ripgrep license notice must also be emitted by the lockfile-derived compliance generator before distribution.

## Issue 7 export dependencies

Issue 7 uses exact **`docx` 9.7.1** behind `@markhere/export-docx` for native OOXML package generation. It does not automate an installed copy of Microsoft Word, LibreOffice, or Pandoc. Standalone/export print HTML uses exact **`sanitize-html` 2.17.7** with TypeScript declarations **`@types/sanitize-html` 2.16.2**. KaTeX `0.18.0`, already part of MarkHere's reviewed Markdown rendering baseline, is reused by the process-neutral HTML exporter for static MathML output.

Package-level copyrights/licenses for these production dependencies must be emitted by the lockfile-derived compliance generator before redistribution. This summary does not replace those generated notices.

## MarkText reference material

MarkText remains an architectural and behavioral reference. The MarkText MIT license is retained at `docs/provenance/licenses/MARKTEXT-MIT.txt` for previously recorded provenance/reference use. Any future copied or materially adapted source must be marked with `@markhere-upstream`, entered in `docs/provenance/provenance.json`, and distributed with its applicable notice.

## Generated release notices

Package-level third-party notices and the CycloneDX SBOM are generated from the production dependency graph by `node scripts/compliance.mjs all` once the dependency lockfile is available. This hand-maintained notice is an architecture/provenance summary, not a substitute for lockfile-derived notices shipped with a release.

## jsdom (test-only)

Security sanitizer regression tests use exact development dependency **jsdom 30.1.1** (MIT) to exercise DOMPurify against hostile HTML/SVG in a browser-like DOM during automated tests. It is not a MarkHere production runtime dependency and should not be packaged into release application code.

## electron-builder / electron-updater / @electron/fuses

Issue 9 uses exact reviewed packaging dependencies **electron-builder 26.15.3**, **electron-updater 6.8.9**, and **@electron/fuses 2.1.3**. They are used for Windows NSIS/ZIP packaging, main-process update integration, and package-time Electron fuse hardening respectively. Their transitive license inventory remains governed by the lockfile-derived compliance generator before release.
