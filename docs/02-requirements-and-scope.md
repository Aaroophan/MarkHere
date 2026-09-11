# MarkHere Requirements and Scope

**Document:** 02-requirements-and-scope.md  
**Product:** MarkHere  
**Status:** Proposed product/engineering requirements baseline  
**Date:** 2026-09-11

---

## 1. Purpose

This document converts the MarkHere product vision into testable requirements, scope boundaries, acceptance criteria, and quality targets. Requirement identifiers are stable references for implementation issues, tests, ADRs, release notes, and traceability.

The word **shall** indicates a v1 requirement unless a row is explicitly marked later-phase. **Should** indicates a desired behavior that may be relaxed with a documented decision. **May** indicates optional behavior.

---

## 2. Problem statement

Windows can open Markdown as plain text, but a generic text editor does not communicate the rendered document structure. Users see Markdown punctuation, raw tables, fenced code markers, image syntax, and diagrams instead of the readable document those constructs represent.

MarkHere addresses four related jobs:

1. **read** a Markdown file as a formatted document;
2. **edit** it visually or as exact source;
3. **work with a folder of Markdown documents** without adopting a proprietary project format;
4. **publish/convert** the Markdown to common document formats, especially HTML, PDF, and Microsoft Word DOCX.

---

## 3. Target users

### 3.1 Developer/documentation author

Needs README editing, exact source access, repository-relative links/images, code blocks, tables, Mermaid, Git-friendly saves, directory search, and predictable line endings.

### 3.2 Student/researcher

Needs clean reading, headings, formulas, diagrams, images, tables, PDF/DOCX export, long-document outline navigation, and reliable recovery.

### 3.3 Technical writer

Needs WYSIWYG editing, source escape hatch, document themes, find/replace, image workflows, export consistency, and clean document structure.

### 3.4 Casual Markdown reader

Needs double-click -> readable Preview, simple navigation, printing, and a clear button to enter editing.

### 3.5 Power user

Needs keyboard shortcuts, command palette, configurable editor behaviors, workspace search, multiple tabs/windows, and deterministic file operations.

---

## 4. v1 scope statement

MarkHere v1 is a **local-first Windows desktop Markdown application**. It does not require a server, account, proprietary cloud, or database to edit documents. Windows 11 x64 is the release-blocking platform; Windows 11 ARM64 is the next supported build target in the same major version if CI/hardware validation is available.

The application is implemented with Electron and selectively reuses/adapts MIT-licensed MarkText/Muya code and feature behavior. It does not reuse MarkText branding.

---

## 5. Functional requirements

### 5.1 Application lifecycle

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-APP-001 | MarkHere shall launch from Start menu, Explorer file open, command line, and application executable. | P0 | all launch paths open a usable window |
| FR-APP-002 | Installed MarkHere shall use a single-instance coordinator by default. | P0 | second launch forwards files/folders to first instance |
| FR-APP-003 | MarkHere shall support multiple editor windows when requested. | P1 | New Window creates isolated tab set |
| FR-APP-004 | MarkHere shall restore safe window geometry after normal restart. | P1 | off-screen coordinates are clamped to active display |
| FR-APP-005 | MarkHere shall never close a window with unsaved work without a save/discard/cancel decision or an already configured safe autosave policy. | P0 | destructive close test cannot lose edits |
| FR-APP-006 | MarkHere shall expose an About view containing version, Electron/Chromium versions, license links, and third-party notices. | P1 | metadata matches build |

### 5.2 File open and creation

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-FILE-001 | MarkHere shall open `.md` and `.markdown`. | P0 | Explorer/dialog/CLI |
| FR-FILE-002 | MarkHere should also recognize `.mmd`, `.mdown`, `.mdtext`, and `.mdtxt`. | P1 | same document pipeline |
| FR-FILE-003 | `.mdx` may be opened as source text, but MarkHere shall not execute embedded JSX/JavaScript in v1. | P1 | no MDX execution path |
| FR-FILE-004 | MarkHere shall create a new untitled Markdown document without immediately forcing a file location. | P0 | dirty untitled tab |
| FR-FILE-005 | Open-file dialog shall allow selecting multiple supported documents. | P1 | one tab per unique file |
| FR-FILE-006 | Dragging supported files onto a window shall open them. | P1 | paths acquired through approved preload API |
| FR-FILE-007 | A file already open in the same window shall not create an accidental duplicate tab unless explicit duplicate-view behavior exists. | P1 | canonical path identity check |
| FR-FILE-008 | MarkHere shall handle Unicode filenames and paths. | P0 | test corpus includes CJK, Sinhala/Tamil, accents, emoji where Windows permits |
| FR-FILE-009 | MarkHere shall handle spaces and `#`, `%`, `?`, `&`, parentheses, and brackets in local paths without treating them as URL syntax. | P0 | local-image and link tests pass |
| FR-FILE-010 | Long-path behavior shall be tested and shall fail with an actionable error rather than truncated/corrupt paths. | P1 | Windows long-path fixture |

### 5.3 Save and durability

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-SAVE-001 | Save shall write the current canonical Markdown buffer. | P0 | round-trip exactness rules met |
| FR-SAVE-002 | Save As shall update document identity only after successful write. | P0 | failed Save As retains old identity |
| FR-SAVE-003 | Writes shall use an atomic/replace strategy to minimize partial-file corruption. | P0 | injected failure leaves old or new complete file, not partial bytes |
| FR-SAVE-004 | MarkHere shall track dirty state by document revision, not by UI heuristics. | P0 | dirty indicator deterministic |
| FR-SAVE-005 | MarkHere shall preserve configured line ending (`LF` or `CRLF`) when saving. | P1 | byte-level fixture |
| FR-SAVE-006 | MarkHere shall default new documents to UTF-8. | P0 | byte-level fixture |
| FR-SAVE-007 | When opening a recognized non-UTF-8 encoding, MarkHere shall either preserve it safely or warn before conversion; silent mojibake is not acceptable. | P1 | encoding fixtures |
| FR-SAVE-008 | The user shall be able to enable/disable autosave. | P1 | setting is persistent |
| FR-SAVE-009 | Recovery snapshots shall be independent of normal Save and shall not silently overwrite the user's document. | P0 | crash simulation |

### 5.4 Preview mode

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-PREV-001 | Preview shall render Markdown without editing affordances. | P0 | typing does not mutate document |
| FR-PREV-002 | Preview shall support the application's selected Markdown dialect/extensions. | P0 | golden fixture parity |
| FR-PREV-003 | Preview shall render relative local images through the approved resource layer. | P0 | no renderer direct filesystem access |
| FR-PREV-004 | Preview shall sanitize raw HTML. | P0 | malicious corpus cannot execute script/event handlers |
| FR-PREV-005 | Preview shall render Mermaid using strict/sandbox-safe settings. | P0 | click/script payloads inactive |
| FR-PREV-006 | Preview shall render math. | P1 | inline and display fixtures |
| FR-PREV-007 | Heading anchors shall be deterministic and navigable. | P1 | duplicate/non-ASCII heading tests |
| FR-PREV-008 | Clicking an external HTTPS link shall leave MarkHere only through validated external-link handling. | P0 | unsupported protocols rejected |
| FR-PREV-009 | Local links to other Markdown documents shall open through MarkHere's file-opening service. | P1 | fragment anchors preserved |

### 5.5 WYSIWYG editing

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-WYS-001 | MarkHere shall provide a visual Markdown editing mode derived from MarkText/Muya capabilities. | P0 | core fixture editable |
| FR-WYS-002 | WYSIWYG edits shall commit to the canonical document revision model. | P0 | mode switch cannot revert recent edits |
| FR-WYS-003 | Headings, paragraphs, emphasis, strong, strikethrough, lists, blockquotes, links, images, tables, task lists, code, and thematic breaks shall be editable where supported by editor core. | P0 | element-specific E2E tests |
| FR-WYS-004 | Math and diagram blocks shall provide an edit representation and rendered representation. | P1 | edits survive save/reopen |
| FR-WYS-005 | Undo/redo shall not cross a mode transition in a way that corrupts or reverts committed document content. | P0 | transition regression tests |
| FR-WYS-006 | Pasting plain text shall not unexpectedly create HTML. | P1 | clipboard fixture |
| FR-WYS-007 | Pasting an image shall follow the selected image-storage policy. | P1 | copied image path/embed flow |

### 5.6 Source editing

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-SRC-001 | MarkHere shall expose exact Markdown source editing. | P0 | bytes/text correspond to buffer |
| FR-SRC-002 | Source mode shall use syntax highlighting without altering source. | P0 | highlight is presentation only |
| FR-SRC-003 | Source mode shall support line numbers as a user preference. | P1 | setting toggles correctly |
| FR-SRC-004 | Source mode shall support find and replace. | P0 | replace single/all |
| FR-SRC-005 | Source mode shall support standard editor commands and configurable keybindings. | P1 | command tests |
| FR-SRC-006 | Switching from source to visual modes shall parse the latest source revision. | P0 | same-frame edits retained |

### 5.7 Split mode

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-SPLIT-001 | Split mode shall show Source and Preview side by side. | P0 | both panes visible and same document |
| FR-SPLIT-002 | Preview shall update from source edits using a bounded debounce. | P0 | stale render responses discarded |
| FR-SPLIT-003 | Divider position shall be draggable and remembered per window preference. | P1 | restore test |
| FR-SPLIT-004 | Scroll synchronization shall be available and disable-able. | P1 | user can turn off |
| FR-SPLIT-005 | Scroll sync shall use structural anchors/relative mapping rather than assuming equal pixel heights. | P1 | large code/table fixture |
| FR-SPLIT-006 | Split mode shall remain usable when preview rendering fails for a single diagram; one bad block must not blank the entire source editor. | P0 | malformed Mermaid fixture |

### 5.8 Markdown compatibility

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-MD-001 | Core parsing shall be measured against CommonMark 0.31.2 fixtures applicable to the chosen parser. | P0 | documented conformance report |
| FR-MD-002 | GFM tables shall render and round-trip. | P0 | alignment fixture |
| FR-MD-003 | GFM task-list items shall render and be editable. | P0 | checked state persists |
| FR-MD-004 | GFM strikethrough shall render and edit. | P0 | fixture |
| FR-MD-005 | GFM extended autolink behavior should be supported if compatible with inherited parser. | P1 | fixture |
| FR-MD-006 | Fenced code blocks shall preserve language identifiers and exact code text. | P0 | whitespace fixture |
| FR-MD-007 | Front matter shall be preserved exactly enough to avoid semantic data loss. | P1 | YAML fixture |
| FR-MD-008 | Unsupported extension syntax shall be preserved in source even when not visually editable. | P0 | no destructive normalization |

### 5.9 Images and resources

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-RES-001 | Relative images shall resolve relative to the document location. | P0 | fixture tree |
| FR-RES-002 | Workspace-relative and document-relative path rules shall be deterministic and documented. | P0 | unit tests |
| FR-RES-003 | Path traversal through rendered URLs shall not grant access outside approved scope. | P0 | security tests |
| FR-RES-004 | Remote `http://` resources shall be blocked by default. | P0 | policy test |
| FR-RES-005 | Remote `https://` images shall follow a user-controlled policy and must never gain Node/Electron privileges. | P1 | offline/block/allow cases |
| FR-RES-006 | SVG shall be treated as active-capable content and sanitized or rasterized according to security policy. | P0 | malicious SVG fixture |

### 5.10 Workspace and navigation

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-WS-001 | User shall be able to open a directory as a workspace. | P0 | tree displays |
| FR-WS-002 | Workspace file tree shall update when files are added/renamed/deleted externally. | P1 | watcher E2E |
| FR-WS-003 | Workspace search shall support recursive text search with cancellation. | P1 | progress/cancel |
| FR-WS-004 | Search must exclude configured ignored directories and binary files. | P1 | fixture workspace |
| FR-WS-005 | Table of contents/outline shall be generated from document headings. | P0 | click navigates |
| FR-WS-006 | Recent files/workspaces shall be local metadata and user-clearable. | P1 | clear action |

### 5.11 Export and print

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-EXP-001 | MarkHere shall export standalone HTML. | P0 | opens in normal browser |
| FR-EXP-002 | MarkHere shall export PDF. | P0 | valid PDF with selected page size |
| FR-EXP-003 | MarkHere shall export DOCX. | P0 | opens in current Microsoft Word/LibreOffice-compatible readers |
| FR-EXP-004 | Export shall snapshot a specific document revision. | P0 | later edits do not mutate running export |
| FR-EXP-005 | Export shall report progress phases and completion/failure. | P1 | UI progress |
| FR-EXP-006 | Cancellable exporters shall honor user cancellation. | P1 | no partial final artifact |
| FR-EXP-007 | Export failures shall not crash or freeze the main editor. | P0 | injected exporter failure |
| FR-EXP-008 | HTML/PDF/DOCX shall preserve headings, paragraphs, emphasis, lists, links, images, tables, code, and blockquotes at minimum. | P0 | cross-format golden fixture |
| FR-EXP-009 | Mermaid/math shall have a documented export representation. | P1 | diagram/equation fixture |
| FR-EXP-010 | MarkHere shall expose normal printing through a sanitized print representation. | P1 | print preview path |

### 5.12 DOCX-specific behavior

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-DOCX-001 | H1-H6 shall map to Word heading styles, not simulated bold paragraphs. | P0 | OOXML style assertion |
| FR-DOCX-002 | Ordered/unordered lists shall use Word numbering definitions. | P0 | nested list fixture |
| FR-DOCX-003 | Markdown tables shall become native Word tables. | P0 | OOXML table assertion |
| FR-DOCX-004 | Local images shall be embedded in the DOCX package. | P0 | media part exists |
| FR-DOCX-005 | Hyperlinks shall use proper relationships. | P0 | relationship assertion |
| FR-DOCX-006 | Code blocks shall preserve line breaks and use a code style. | P0 | Word render/manual check |
| FR-DOCX-007 | Export shall not require Microsoft Word to be installed. | P0 | CI generation |
| FR-DOCX-008 | Future custom/reference templates shall not be required for v1. | P2 | deferred |

### 5.13 Settings and personalization

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-SET-001 | Settings shall be versioned and migration-capable. | P0 | old fixture migrates |
| FR-SET-002 | Appearance: Light, Dark, System. | P0 | system change handled |
| FR-SET-003 | Default open mode shall be configurable among Preview/WYSIWYG/Source/Split. | P0 | reopen behavior |
| FR-SET-004 | Autosave behavior shall be configurable. | P1 | save tests |
| FR-SET-005 | Remote-resource policy shall be configurable with safe default. | P0 | default deny/block behavior |
| FR-SET-006 | Keybindings shall be configurable and resettable. | P1 | validation prevents invalid duplicates where required |
| FR-SET-007 | User shall be able to reset settings without deleting user documents. | P1 | settings only |

### 5.14 Recovery

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-REC-001 | Dirty documents shall periodically produce local recovery snapshots. | P0 | snapshot after interval |
| FR-REC-002 | Recovery snapshots shall include enough identity/revision metadata to avoid applying a snapshot to the wrong file. | P0 | mismatch rejected |
| FR-REC-003 | On abnormal termination, next launch shall present recoverable sessions instead of silently discarding them. | P0 | crash fixture |
| FR-REC-004 | User can inspect, restore, save as, or discard recovered content. | P1 | recovery UI |
| FR-REC-005 | Successful clean save/close shall eventually remove obsolete recovery state. | P0 | no stale accumulation |

### 5.15 Updates

| ID | Requirement | Priority | Acceptance summary |
|---|---|---:|---|
| FR-UPD-001 | Installed builds should support signed in-app updates. | P1 | staging feed test |
| FR-UPD-002 | Update checks shall not upload Markdown document content. | P0 | request inspection |
| FR-UPD-003 | User can manually check for updates. | P1 | status result |
| FR-UPD-004 | Failed update shall not make currently installed MarkHere unusable. | P0 | rollback/installer semantics |

---

## 6. Non-functional requirements

### 6.1 Security

| ID | Requirement |
|---|---|
| NFR-SEC-001 | Renderer shall run with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. |
| NFR-SEC-002 | Preload shall expose capability-specific methods, never raw `ipcRenderer`. |
| NFR-SEC-003 | Main process shall validate IPC sender and all security-relevant inputs. |
| NFR-SEC-004 | App UI should use a custom secure scheme instead of an unrestricted `file://` origin. |
| NFR-SEC-005 | Content Security Policy shall reject arbitrary scripts/eval where dependencies permit. |
| NFR-SEC-006 | Raw HTML, URLs, and SVG/resource content shall be sanitized/validated. |
| NFR-SEC-007 | External protocol allowlist initially includes `https:` and `mailto:` only, with any additions explicitly reviewed. |
| NFR-SEC-008 | Production Electron fuses shall disable capabilities MarkHere does not need. |
| NFR-SEC-009 | Dependencies shall be scanned and reviewed before release. |
| NFR-SEC-010 | Release artifacts shall be code-signed before public stable distribution. |

### 6.2 Reliability/durability

| ID | Requirement |
|---|---|
| NFR-REL-001 | A failed save shall not mark a document clean. |
| NFR-REL-002 | A successful atomic save must result in a complete file. |
| NFR-REL-003 | External file changes shall never be knowingly overwritten without user policy/confirmation. |
| NFR-REL-004 | Export errors shall be isolated from the editing session. |
| NFR-REL-005 | Recovery metadata shall be schema-versioned. |
| NFR-REL-006 | App restart after renderer crash shall offer recovery where dirty data was persisted. |

### 6.3 Performance/responsiveness

| ID | Target |
|---|---|
| NFR-PERF-001 | Cold start target <= 2.5 s to usable editor on agreed reference PC. |
| NFR-PERF-002 | Typical typing input-to-paint p95 < 50 ms. |
| NFR-PERF-003 | Preview update after split edit normally within 250 ms for ordinary documents. |
| NFR-PERF-004 | No synchronous filesystem or export operation > 50 ms on renderer interaction path. |
| NFR-PERF-005 | Export UI remains interactive and cancellable where supported. |
| NFR-PERF-006 | Opening large files shall show progress/usable shell rather than appear hung. |

### 6.4 Compatibility

| ID | Requirement |
|---|---|
| NFR-COMP-001 | Windows 11 x64 is release-blocking. |
| NFR-COMP-002 | Windows 11 ARM64 becomes supported only after native-dependency and installer verification. |
| NFR-COMP-003 | Markdown save output should minimize unnecessary textual normalization to remain Git-friendly. |
| NFR-COMP-004 | HTML export shall use UTF-8 and standards-based markup. |
| NFR-COMP-005 | DOCX output shall be OOXML-compatible and not rely on Word automation. |

### 6.5 Accessibility/usability

| ID | Requirement |
|---|---|
| NFR-A11Y-001 | Core open/edit/save/export workflows shall be keyboard-operable. |
| NFR-A11Y-002 | Focus indicators shall remain visible. |
| NFR-A11Y-003 | Icon-only controls shall expose accessible names/tooltips. |
| NFR-A11Y-004 | Application shall honor Windows scaling/high-DPI and not require fixed pixel dimensions. |
| NFR-A11Y-005 | Color must not be the only indicator of dirty/error/conflict state. |

### 6.6 Maintainability

| ID | Requirement |
|---|---|
| NFR-MNT-001 | Electron-specific code shall not leak into `document-model` or editor-core packages. |
| NFR-MNT-002 | IPC contracts shall be defined in one typed source of truth. |
| NFR-MNT-003 | MarkText-derived files shall retain provenance. |
| NFR-MNT-004 | Each persisted schema shall carry a version and migrations. |
| NFR-MNT-005 | Core feature behavior shall be backed by automated tests before refactoring upstream-derived code. |

### 6.7 Privacy

| ID | Requirement |
|---|---|
| NFR-PRIV-001 | No account is required for core functionality. |
| NFR-PRIV-002 | No document body shall be included in normal logs. |
| NFR-PRIV-003 | No telemetry/crash upload is enabled by default in v1. |
| NFR-PRIV-004 | Update checking shall reveal only normal update-request metadata required by the service. |
| NFR-PRIV-005 | Diagnostic export shall be user-initiated and documented. |

---

## 7. Feature-parity target with MarkText

The following is a **capability target**, not a promise to copy MarkText's exact UI or implementation.

| MarkText-style capability | MarkHere v1 plan | Notes |
|---|---|---|
| Realtime WYSIWYG | Yes | Muya-derived core |
| Source-code mode | Yes | CodeMirror 6 implementation |
| Focus mode | Yes/P1 | UI behavior |
| Typewriter mode | Yes/P1 | UI behavior |
| Themes | Yes | separate app/document/export concerns |
| Tabs | Yes | own session model |
| Sidebar/folder tree | Yes | own workspace service |
| TOC/outline | Yes | parser-derived headings |
| Search | Yes | cancellable workspace search |
| Spellcheck | Yes | Electron spellchecker integration |
| Paste images | Yes | explicit storage policy |
| Math | Yes | KaTeX |
| Mermaid | Yes | strict mode |
| Front matter | Yes | preserve and edit |
| Emoji | P1 | compatibility extension |
| HTML export | Yes | rewritten export pipeline |
| PDF export | Yes | rewritten/hardened pipeline |
| DOCX export | **MarkHere addition** | native OOXML via `docx` |
| Dedicated read-only Preview | **MarkHere addition** | separate from WYSIWYG |
| Source + Preview split | **MarkHere addition** | live debounced preview |
| Windows file association | Yes | user-controlled default-app registration |
| CLI open | Yes/P1 | `markhere <path>` |
| CLI conversion | P1 | after GUI exporters stabilize |
| i18n | P1 | architecture-ready; English first acceptable for technical preview |

---

## 8. Out of scope for v1

The following are deliberately excluded unless the scope is changed through an ADR:

- cloud accounts;
- proprietary MarkHere cloud sync;
- real-time multi-user collaboration;
- comments/review workflows;
- AI writing/generation features;
- editing arbitrary `.docx` files as Word documents;
- PDF editing;
- Git client/commit UI;
- database-backed Notion-style blocks;
- plugin marketplace;
- execution of arbitrary MDX/JavaScript from user documents;
- embedded general-purpose web browser;
- mobile application;
- browser extension;
- server-side rendering service;
- automatic upload of crash logs/documents;
- mandatory `.markhere` project files inside user repositories.

Out-of-scope features may be considered later, but the v1 architecture must not introduce unused privileged hooks merely to make hypothetical features easier.

---

## 9. Document compatibility levels

MarkHere reports behavior using explicit compatibility levels:

### Level A - must round-trip safely

- paragraphs;
- ATX/setext headings;
- emphasis/strong;
- links;
- images;
- blockquotes;
- ordered/unordered lists;
- thematic breaks;
- inline/fenced code;
- GFM tables;
- GFM task lists;
- GFM strikethrough.

### Level B - must preserve, visual editing may be constrained

- front matter;
- raw HTML;
- math;
- Mermaid/diagram blocks;
- uncommon nested constructs;
- reference links that editor-core cannot manipulate visually without normalization.

### Level C - preserve as source, no execution

- unknown fenced languages;
- unknown directives/extensions;
- MDX/JSX;
- custom site-generator syntax not understood by MarkHere.

The rule for Level C is **do not destroy what MarkHere does not understand**.

---

## 10. UX acceptance scenarios

### Scenario A - README reader

**Given** MarkHere is registered as an available `.md` handler  
**When** the user opens `README.md` from Explorer  
**Then** MarkHere opens the file in the configured default mode (Preview by default for the reader-focused profile)  
**And** relative images render  
**And** no Markdown text is modified merely by viewing it.

### Scenario B - exact source edit

**Given** a repository README uses careful whitespace  
**When** the user switches to Source, changes one sentence, and saves  
**Then** unrelated lines are not reformatted without a documented necessity.

### Scenario C - visual edit then source verification

**When** the user changes a heading in WYSIWYG and immediately switches to Source  
**Then** the latest heading edit appears in Markdown source  
**And** no earlier buffered operation overwrites it.

### Scenario D - external conflict

**Given** a dirty document is open  
**And** another program changes the same file on disk  
**When** MarkHere receives the watcher event  
**Then** it does not silently load over the user's dirty buffer or overwrite the external version  
**And** offers compare/reload/keep/save-as conflict actions.

### Scenario E - malicious raw HTML

**Given** Markdown contains `<img src=x onerror="...">`, `<script>`, an unsafe protocol link, and hostile SVG  
**When** Preview renders  
**Then** code does not execute  
**And** no arbitrary local file can be read  
**And** privileged preload functions cannot be reached through injected HTML.

### Scenario F - DOCX export

**Given** a document contains headings, lists, a table, code, links, and a local image  
**When** Export -> Word is selected  
**Then** the resulting `.docx` contains native heading/list/table structures and embedded media  
**And** generation does not require Microsoft Word.

---

## 11. Performance fixture classes

Testing shall distinguish document sizes rather than quote one meaningless universal threshold.

| Class | Approximate size | Typical purpose |
|---|---:|---|
| S | <= 100 KB | README/blog post |
| M | 100 KB-1 MB | long technical document |
| L | 1-5 MB | generated docs/large notes |
| XL | 5-20 MB | stress case; graceful degradation required |
| XXL | >20 MB | source-first fallback/warning may be appropriate |

The product may automatically recommend Source mode for pathological files if WYSIWYG parsing would otherwise lock the renderer. Such behavior must be explicit and never result in data truncation.

---

## 12. Release acceptance criteria for v1.0

A stable v1.0 release is blocked unless all P0 requirements have tests or documented manual verification and the following gates pass:

1. clean Windows 11 x64 install/uninstall/upgrade;
2. code-signed installer and executable artifacts;
3. `.md` appears as an available handler and opens correctly;
4. malicious Markdown security corpus passes;
5. save/recovery/external-conflict fault-injection suite passes;
6. CommonMark/GFM compatibility report has no unexplained P0 regressions;
7. WYSIWYG <-> Source round-trip golden suite passes;
8. HTML/PDF/DOCX golden exports pass structural checks;
9. no release-blocking high/critical dependency vulnerability without written risk acceptance;
10. startup/input/export performance does not exceed agreed regression budgets;
11. third-party license inventory is generated and MarkText MIT notice is present where required;
12. crash/recovery and updater staging tests pass.

---

## 13. Requirement traceability convention

Tests and issues should include requirement IDs:

```text
feat(source): preserve final newline when saving

Requirements: FR-SRC-001, FR-SAVE-001, NFR-COMP-003
```

Test naming example:

```ts
test('FR-SPLIT-002 discards a stale preview render', async () => { ... })
```

Architecture decisions link both directions:

```text
ADR-006 Canonical Markdown buffer
Supports: FR-WYS-002, FR-SRC-006, FR-EXP-004, NFR-REL-001
```

---

## 14. Research references

- MarkText features/architecture: https://marktext.me/docs/dev/architecture
- MarkText repository: https://github.com/marktext/marktext
- CommonMark 0.31.2: https://spec.commonmark.org/0.31.2/
- GitHub Flavored Markdown: https://github.github.com/gfm/
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron BrowserWindow security-related preferences: https://www.electronjs.org/docs/latest/api/browser-window
- Windows Default Programs registration: https://learn.microsoft.com/en-us/windows/win32/shell/default-programs
- `docx`: https://github.com/dolanmiu/docx

---

## 15. Related documents

See `01-system-overview.md` for the architecture summary, `04-data-model.md` for the canonical buffer model, `05-api-design.md` for the capability bridge, `06-security-design.md` for threat controls, and `10-testing-strategy.md` for full verification.
