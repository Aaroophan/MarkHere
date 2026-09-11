# MarkHere Error Handling and Logging

**Document:** 08-error-handling-and-logging.md  
**Product:** MarkHere  
**Status:** Proposed resilience and diagnostics design  
**Date:** 2026-09-11

---

## 1. Purpose

A desktop editor must fail without losing the user's work. Error handling in MarkHere is designed around four questions:

1. **Can the user's current Markdown buffer be preserved?**
2. **Is the failure expected/operational or a programming/invariant failure?**
3. **What action can the user take now?**
4. **What diagnostic data is useful without leaking document content?**

Logging is local-first and privacy-minimizing. Normal logs contain event metadata, timings, versions, and error codes; they do not contain full Markdown bodies.

---

# 2. Error categories

```ts
type ErrorCategory =
  | 'validation'
  | 'filesystem'
  | 'conflict'
  | 'markdown'
  | 'render'
  | 'security'
  | 'export'
  | 'workspace'
  | 'update'
  | 'cancelled'
  | 'internal'
```

### Validation

Malformed user/API input that can be corrected.

### Filesystem

Not found, permission denied, disk full, sharing violation, path too long, read-only, encoding failure.

### Conflict

Disk file changed relative to expected fingerprint or was deleted/renamed while local state exists.

### Markdown/render

Parser/diagram/math/sanitizer/render issues. Ideally isolated to a block or mode.

### Security

Blocked URL/protocol/path/capability/sender or other policy violation.

### Export

HTML/PDF/DOCX pipeline failure.

### Update

Update feed/download/verification/installation failure.

### Cancelled

User-requested cancellation; not logged as an alarming error.

### Internal

Invariant/programming failures, unexpected exceptions, impossible states.

---

# 3. Error type

Internal rich error:

```ts
class MarkHereError extends Error {
  code: ErrorCode
  category: ErrorCategory
  recoverable: boolean
  userMessageKey: string
  correlationId: string
  details?: SafeErrorDetails
  cause?: unknown
}
```

Renderer DTO:

```ts
interface ErrorDTO {
  code: string
  category: ErrorCategory
  messageKey: string
  recoverable: boolean
  correlationId: string
  details?: Record<string, string | number | boolean | null>
}
```

Raw stack/cause remains in privileged local diagnostics and is not blindly serialized into preview/UI.

---

# 4. Error code namespace

Stable format:

```text
MH_<DOMAIN>_<SPECIFIC_CONDITION>
```

Examples:

```text
MH_FILE_NOT_FOUND
MH_FILE_PERMISSION_DENIED
MH_FILE_DISK_FULL
MH_FILE_SHARING_VIOLATION
MH_FILE_ENCODING_UNSUPPORTED
MH_FILE_CHANGED_EXTERNALLY
MH_FILE_DELETED_EXTERNALLY
MH_PATH_OUTSIDE_CAPABILITY
MH_URL_SCHEME_BLOCKED
MH_IPC_SENDER_UNTRUSTED
MH_MARKDOWN_PARSE_FAILED
MH_MERMAID_RENDER_FAILED
MH_EXPORT_CANCELLED
MH_EXPORT_DOCX_FAILED
MH_EXPORT_PDF_RENDER_TIMEOUT
MH_UPDATE_CHECK_FAILED
MH_RECOVERY_WRITE_FAILED
MH_INTERNAL_INVARIANT
```

Error codes are not localized; user-facing messages are.

---

# 5. Expected error envelope

Privileged API calls return expected failures as data:

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorDTO }
```

This keeps common conditions such as Save conflict from looking like unhandled exceptions.

Unexpected code defects still reject/throw so error boundaries and crash diagnostics can identify them.

---

# 6. User-message design

Bad:

```text
Error: EPERM: operation not permitted, rename 'C:\...tmp' -> 'C:\...'
```

Better:

```text
MarkHere couldn't save this file because Windows denied access.

Your edits are still open in MarkHere.

[Save As...] [Retry] [Show details]

Error code: MH_FILE_PERMISSION_DENIED
Reference: 7e6c...
```

### Message requirements

Every user-visible operational error should explain:

- what failed;
- whether current edits are safe;
- what the user can do;
- an error/reference code for support;
- technical details only behind disclosure.

Do not falsely say "Your edits are safe" unless the buffer/recovery state actually supports that statement.

---

# 7. Severity levels

```ts
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
```

### trace

Development-only high-frequency state transitions. Disabled in normal production.

### debug

Detailed local diagnostics, preferably disabled or limited in stable release unless user enables diagnostic mode.

### info

Lifecycle milestones: app startup, document open completed, save completed, export started/completed, updater state.

### warn

Recoverable abnormal conditions: stale preview render, transient retry, unsupported encoding, blocked remote resource, renderer recovered.

### error

Operation failed and user action may be required: save failed, export failed, recovery write failed.

### fatal

Main process cannot continue safely or critical invariant failure likely causes termination.

---

# 8. Structured log event

```ts
interface LogEvent {
  timestamp: string
  level: LogLevel
  event: string
  process: 'main' | 'renderer' | 'utility' | 'pdf-renderer'
  appVersion: string
  buildChannel: string
  correlationId?: string
  windowId?: string
  documentId?: string
  jobId?: string
  durationMs?: number
  result?: string
  errorCode?: string
  metadata?: Record<string, string | number | boolean | null>
}
```

Example:

```json
{
  "timestamp": "2026-09-11T12:30:00.000Z",
  "level": "info",
  "event": "export.completed",
  "process": "main",
  "appVersion": "1.0.0",
  "buildChannel": "stable",
  "correlationId": "e92...",
  "documentId": "4f1...",
  "jobId": "b10...",
  "durationMs": 842,
  "result": "ok",
  "metadata": {
    "format": "docx",
    "bytes": 481203
  }
}
```

---

# 9. Logging facade

Code should use MarkHere's facade rather than calling `console.log`/`electron-log` everywhere:

```ts
logger.info('document.save.completed', {
  correlationId,
  documentId,
  durationMs,
  bytes
})
```

Benefits:

- redaction in one layer;
- process metadata injection;
- level policy;
- tests can inspect events;
- logging backend can change;
- document content can be rejected by lint/type wrappers.

---

# 10. Redaction policy

## Never log by default

- Markdown body;
- selected text;
- recovery snapshot body;
- clipboard content;
- image bytes;
- authentication tokens;
- cookies;
- encryption material;
- arbitrary `process.env`;
- full update credentials;
- DOM innerHTML;
- whole search result snippets.

## Paths

Stable production logs should prefer:

- document ID;
- basename if low risk and useful;
- path hash;
- path category (`local`, `unc`, `onedrive-like` if determined safely).

A diagnostic bundle may include full paths only after explicit user disclosure/choice.

## URLs

Log scheme + origin when needed; redact query/fragment because signed URLs/tokens can live there.

Example:

```text
https://example.com/<redacted>
```

---

# 11. Correlation IDs

Create one correlation ID per user-level operation:

- open;
- save;
- export;
- workspace search;
- update check/download;
- recovery restore.

Pass it through renderer -> main -> worker events.

This allows diagnostics to reconstruct a flow without logging document text.

---

# 12. Process-specific handling

## 12.1 Main process

Register handlers for:

- `uncaughtException`;
- `unhandledRejection`;
- BrowserWindow/webContents process-gone events;
- child/Utility Process exits;
- updater errors;
- protocol handler failures.

An unhandled main exception is dangerous because main owns persistence/OS authority. Attempt best-effort log flush and recovery coordination only if state remains trustworthy; do not continue indefinitely after a corrupted invariant.

## 12.2 Renderer

Use:

- Vue global error handler;
- `window.onerror`;
- `unhandledrejection`;
- component error boundaries around preview/diagram/editor optional sections where possible.

Renderer errors are reported to main using a narrow diagnostics API containing sanitized message/stack metadata, not the whole DOM/document.

## 12.3 Utility process

Worker protocol has explicit success/failure messages. Unexpected worker exit becomes `MH_EXPORT_WORKER_EXITED` or equivalent, not a main crash.

## 12.4 PDF renderer

Timeout/failure is scoped to the export job. Hidden web contents is destroyed and the editor remains operational.

---

# 13. Renderer crash recovery

When Electron reports renderer termination:

1. log reason/process metadata;
2. stop sending events to dead renderer;
3. retain main-owned document/file/recovery metadata;
4. inspect latest recovery snapshots;
5. offer/recreate editor window according to policy;
6. bootstrap recovered sessions;
7. do not assume the last in-memory renderer keystroke existed in recovery if it had not been snapshot yet.

Recovery guarantees are bounded by snapshot cadence.

---

# 14. Main process crash/restart

A main-process crash terminates the app. Protection depends on snapshots already persisted before the crash.

At next launch:

- detect previous unclean session marker;
- enumerate valid recovery snapshots;
- quarantine malformed state files;
- show recovery experience before discarding stale session metadata.

Do not automatically reopen every workspace into an infinite crash loop; safe-mode startup may skip last session after repeated crashes.

---

# 15. Crash-loop safe mode

Track a minimal startup health record:

```json
{
  "lastStart": "...",
  "lastCleanShutdown": false,
  "consecutiveStartupFailures": 2
}
```

If the app repeatedly fails shortly after startup:

- offer Safe Mode;
- do not restore last tabs automatically;
- use default theme/settings subset;
- disable optional extension rendering if necessary;
- keep documents/recovery intact;
- allow user to inspect/reset non-document settings.

Safe Mode does not disable renderer sandbox/security controls.

---

# 16. File error handling matrix

| Condition | Document state | User action |
|---|---|---|
| File not found on open | no tab or clear failed tab | choose another path |
| File deleted while open/clean | keep buffer, missing-on-disk | recreate/Save As/close |
| File deleted while dirty | keep dirty buffer + conflict | Save As/recreate/close |
| Permission denied on save | dirty remains | Retry/Save As |
| Disk full | dirty remains | free space/Save As elsewhere |
| Sharing violation | dirty remains | bounded retry then Retry/Save As |
| Encoding failed | no destructive save | choose encoding/open as text |
| External modification | conflict state | Compare/Reload/Save As/Merge |
| Atomic temp write failed | original remains if possible | Retry/Save As |
| Final replace failed | dirty remains; cleanup temp | Retry/Save As |

---

# 17. Markdown/render errors

A malformed extension block should degrade locally:

```text
[Mermaid diagram could not be rendered]
Syntax error near line 7
[Edit source]
```

The rest of the document remains readable/editable.

Rules:

- preserve source text;
- do not replace bad source with error text;
- Preview can render an inert error placeholder;
- WYSIWYG block remains editable;
- export reports whether failure is fatal or represented as fallback.

Core CommonMark generally has no syntax-error concept; parser failures are internal/limit conditions rather than ordinary "invalid Markdown" errors.

---

# 18. Export error handling

Export phases:

```text
validate -> snapshot -> resolve assets -> transform -> render/package -> final write
```

Failures before final write leave no final artifact.

If a final path already exists:

- overwrite policy requires native dialog/user decision;
- output is built in temp first;
- replacement is atomic where practical.

DOCX asset failure can be policy-specific:

- required local image missing -> fail or insert explicit placeholder according to chosen export setting;
- remote image blocked -> fail with actionable list or placeholder;
- Mermaid block failure -> fail export by default for fidelity, with optional "export with error placeholder" later.

---

# 19. Update error handling

Update failures are non-fatal to editing.

States:

- check failed -> retain current version, subtle notification/log;
- download failed -> allow retry later;
- downloaded but install deferred -> current session continues;
- install failure -> OS/updater should keep previous usable installation where packaging permits; release smoke tests validate this;
- signature/integrity failure -> treat as security error and never install.

---

# 20. Retry policy

Only retry operations likely to be transient:

- sharing violations;
- temporary network update error;
- file temporarily unavailable in cloud-synced folder.

Do not retry indefinitely.

Example bounded backoff:

```text
100 ms -> 250 ms -> 500 ms -> 1000 ms -> fail
```

Do not automatically retry security validation failures, malformed paths, or disk conflicts.

---

# 21. User notifications

Severity/UI mapping:

| Condition | UI |
|---|---|
| transient info | status/toast |
| recoverable operation failure | persistent toast/banner with action |
| document conflict | persistent document-level banner |
| destructive decision | modal/native confirmation |
| crash recovery | dedicated recovery screen/dialog |
| security blocked content | inline placeholder + optional details |
| fatal main failure | restart guidance after relaunch |

Avoid repeated toast storms from autosave/watcher loops; coalesce identical errors.

---

# 22. Diagnostic details view

When user selects "Show details":

```text
Error code: MH_EXPORT_DOCX_FAILED
Reference: 7e6c1f...
Operation: Export Word document
Phase: packaging
Application: MarkHere 1.0.0
Platform: Windows 11 x64

[Copy technical details]
[Open logs folder]
```

Do not display a raw stack trace as the primary user message, but make safe technical details available.

---

# 23. Log file management

Use rolling local files:

- bounded max size per file;
- bounded retained file count;
- separate or tagged process origin;
- flush important error/fatal events;
- old logs removed automatically;
- user action to open logs folder;
- user action to clear logs.

Exact size/count is a config constant validated by performance/support needs (for example 5 x 5 MB, not an unbounded folder).

---

# 24. Development logging

Dev builds may enable:

- verbose IPC timing;
- state transition traces;
- Vue warnings;
- Electron security warnings;
- source maps;
- render timing.

Even dev logs should avoid automatically dumping private Markdown because developers may test with real documents.

---

# 25. Diagnostic bundle

User-initiated support bundle can contain:

```text
markhere-diagnostics-<timestamp>.zip
├─ manifest.json
├─ app-info.json
├─ sanitized-settings.json
├─ logs/
├─ process-info.json
└─ optional/
   └─ user-approved-paths.txt
```

Default exclusions:

- Markdown files;
- recovery snapshots;
- clipboard;
- images;
- exports;
- credentials;
- raw browser cache.

Before generation, UI explains content and optional path inclusion.

---

# 26. Crash reports

Electron provides Crashpad through `crashReporter`, but v1 does not automatically upload crashes.

Options:

- local crash dumps remain available in Electron crash dump path;
- remote crash submission is a future opt-in decision with privacy disclosure and backend design;
- when enabled later, attach only minimal metadata and never attach documents by default.

---

# 27. Metrics without telemetry

MarkHere can measure performance locally for tests/diagnostics without remote telemetry:

- startup duration;
- file read/save duration;
- preview render duration;
- export phase duration;
- document byte size class;
- process memory snapshots during dedicated benchmarks.

These can be logged at debug/info in a content-free form and inspected by automated performance tests.

---

# 28. Assertions and invariants

Critical invariants should fail loudly in development/test:

```ts
assert(buffer.persistedRevision <= buffer.revision)
assert(!saveResult || saveResult.savedRevision <= buffer.revision)
assertCapabilityOwnedByWindow(...)
assertNeverRawIpcExposed(...)
```

In production, invariant failures map to internal errors and preserve/recover documents rather than silently guessing a state transition.

---

# 29. Error testing requirements

Tests inject:

- ENOENT;
- EACCES/EPERM;
- ENOSPC/disk full equivalent;
- Windows sharing violation;
- target disappears mid-save;
- external modification between precheck and save;
- recovery directory unwritable;
- malformed settings JSON;
- worker exit mid-export;
- PDF render timeout;
- malformed Mermaid;
- huge resource;
- blocked URL;
- renderer crash;
- repeated startup crash state;
- updater network/signature failure in staging harness.

Every test asserts user-data state, not just error message.

---

# 30. References

- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron crashReporter: https://www.electronjs.org/docs/latest/api/crash-reporter
- Electron app logs/crash paths: https://www.electronjs.org/docs/latest/api/app
- Electron security guidance: https://www.electronjs.org/docs/latest/tutorial/security
- Electron UtilityProcess: https://www.electronjs.org/docs/latest/api/utility-process
- MarkText exception/logging/source architecture reference: https://github.com/marktext/marktext/tree/develop/packages/desktop/src/main

---

# 31. Related documents

- `04-data-model.md` defines errors/correlation IDs and state.
- `05-api-design.md` defines API failure envelopes.
- `07-storage-and-sync-strategy.md` defines save/recovery conflicts.
- `10-testing-strategy.md` defines fault-injection gates.
