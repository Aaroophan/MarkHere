# MarkHere Cross-System Test Program

Package-local unit tests live beside their packages. This directory contains cross-system evidence:

- `e2e/` — Playwright Electron user/security/accessibility/compatibility flows;
- `performance/` — measured budgets and soak scenarios;
- `windows/` — exact installer/system tests and manual Windows gates;
- `compatibility/` — machine-readable Markdown support profile;
- `release/` — export verification and release-evidence policy;
- `traceability.json` — requirement → implementation → test/manual evidence mapping.

Fixtures are synthetic and version-controlled under `packages/test-fixtures`. No real user document or recovery snapshot belongs in CI artifacts.

Playwright Electron is useful but experimental; Windows installer/default-app/accessibility behavior is independently qualified at release-candidate time.
