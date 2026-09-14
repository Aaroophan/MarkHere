# @markhere/editor-core provenance notice

`@markhere/editor-core` is MarkHere's adapter boundary around the MIT-licensed `@muyajs/core` 0.2.0 dependency.

Issue 5 also contains one adapted compatibility source file:

- destination: `src/muya-v020-compat.ts`
- upstream: `marktext/marktext`
- revision: `4e354c0c69e1ca4925fc2d8f0126c63ff6d43d46`
- upstream path: `packages/muya/src/selection/offsetCursor.ts`
- disposition: adapted sentinel/source-coordinate mapping technique
- license: MIT

The destination file contains `@markhere-upstream` and is registered in `docs/provenance/provenance.json`. The applicable Muya MIT notice is retained at `docs/provenance/licenses/MUYA-MIT.txt`.

Muya remains an interchangeable editor surface. Canonical document state belongs to MarkHere's versioned Markdown `DocumentSession`.
