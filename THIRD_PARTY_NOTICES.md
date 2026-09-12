# Third-Party Notices

MarkHere is an independent application. This repository currently contains no copied or adapted MarkText/Muya source files.

MarkText/Muya are architectural and behavioral references for planned selective reuse. If a substantial upstream file is copied or adapted, it **must** be recorded in `docs/provenance/provenance.json`, marked in source with `@markhere-upstream`, and distributed with the applicable notice.

The MarkText MIT license is retained at `docs/provenance/licenses/MARKTEXT-MIT.txt` for provenance readiness. It is not a claim that the current MarkHere source tree contains MarkText code.

Package-level third-party notices and the CycloneDX SBOM are generated from the production dependency graph by `node scripts/compliance.mjs all` once the dependency lockfile is available.
