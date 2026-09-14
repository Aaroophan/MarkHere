# Third-Party Notices

MarkHere is an independent application. Third-party projects retain their own copyrights and licenses.

## Muya

Issue 5 uses **`@muyajs/core` 0.2.0** as the WYSIWYG engine behind MarkHere's `@markhere/editor-core` adapter. Muya is MIT licensed. The applicable license is retained at `docs/provenance/licenses/MUYA-MIT.txt`.

MarkHere also adapts the source-coordinate sentinel mapping technique from the newer MarkText Muya tree (`marktext/marktext` commit `4e354c0c69e1ca4925fc2d8f0126c63ff6d43d46`, `packages/muya/src/selection/offsetCursor.ts`) into `packages/editor-core/src/muya-v020-compat.ts`. That destination is marked `@markhere-upstream` and recorded in `docs/provenance/provenance.json`.

The adapted code does not make Muya canonical application state: canonical content remains MarkHere's versioned Markdown buffer.

## CodeMirror 6

Issue 5 adds exact CodeMirror 6 runtime dependencies to `@markhere/source-editor`. Their package-level license notices will be emitted from the production dependency graph by the compliance generator once a genuine `pnpm-lock.yaml` is created on a network-enabled machine.

## MarkText reference material

MarkText remains an architectural and behavioral reference. The MarkText MIT license is retained at `docs/provenance/licenses/MARKTEXT-MIT.txt` for previously recorded provenance/reference use. Any future copied or materially adapted source must be marked with `@markhere-upstream`, entered in `docs/provenance/provenance.json`, and distributed with its applicable notice.

## Generated release notices

Package-level third-party notices and the CycloneDX SBOM are generated from the production dependency graph by `node scripts/compliance.mjs all` once the dependency lockfile is available. This hand-maintained notice is an architecture/provenance summary, not a substitute for lockfile-derived notices shipped with a release.
