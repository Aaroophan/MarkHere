# MarkHere C4 Diagrams

**Document:** 03-c4-diagrams.md  
**Product:** MarkHere  
**Status:** Proposed architecture views  
**Date:** 2026-09-11

---

## 1. Purpose and notation

This document describes MarkHere's architecture using C4-style views. Mermaid flowcharts are used instead of relying exclusively on Mermaid's experimental C4 syntax so the diagrams remain renderable in a wider set of Markdown tools, including the MarkHere/MarkText-style Mermaid pipeline.

C4 levels used here:

- **Level 1 - System Context:** MarkHere and the people/external systems around it;
- **Level 2 - Containers:** executable/process and major deployable boundaries;
- **Level 3 - Components:** major modules inside each MarkHere process/package;
- **Dynamic views:** important sequences crossing the boundaries;
- **Deployment view:** Windows packaging/runtime placement.

A "container" in C4 does not mean a Docker container; in this desktop architecture it generally means a process, application, or separately meaningful runtime subsystem.

---

# 2. C4 Level 1 - System Context

```mermaid
flowchart LR
    User([Markdown User])
    Dev([Developer / Technical Writer])

    MH["MarkHere\nDesktop Markdown Application"]
    FS[("Local / Network File System\nMarkdown, images, folders")]
    Explorer["Windows Explorer / Default Apps"]
    Browser["External Default Browser"]
    Printer["Windows Printing System"]
    Update["Signed MarkHere Release / Update Host"]
    HTTPS["Optional HTTPS Resources\nremote images/links"]

    User -->|Reads, edits, exports| MH
    Dev -->|Edits repositories/workspaces| MH
    Explorer -->|Open file / Open with| MH
    MH <-->|Read/write user-selected files| FS
    MH -->|Validated external URLs| Browser
    MH -->|Print jobs| Printer
    MH <-->|Version metadata and signed updates| Update
    MH -.->|Optional policy-controlled fetch| HTTPS
```

## 2.1 Context responsibilities

### MarkHere

Owns document state while documents are open, local editing, rendering, conversion, recovery, and desktop integration.

### Local/network filesystem

Is the durable source of user documents. MarkHere does not require a server-side canonical copy. Files may also live in OneDrive/Dropbox/Git worktrees/network shares; those services are external to MarkHere and appear to it as filesystem changes.

### Windows Explorer/default-app infrastructure

Launches MarkHere with files and presents MarkHere as a possible Markdown handler. Windows remains authoritative over user default-app choices.

### External browser

Receives explicitly validated HTTP(S)/mailto links. Web pages are not loaded into the privileged editor renderer.

### Update host

Contains release metadata and signed binaries. It never receives Markdown document content as part of normal update checks.

### Optional HTTPS resources

A Markdown document may refer to a remote image. Access is disabled or restricted according to the user's resource policy and the security design.

---

# 3. Trust-boundary context view

```mermaid
flowchart TB
    subgraph Untrusted["Untrusted / User-controlled Inputs"]
      MD[Markdown text]
      IMG[Images / SVG]
      URL[Links / remote URLs]
      PATH[Dragged/opened paths]
    end

    subgraph Sandboxed["Sandboxed Renderer Trust Zone"]
      UI[Vue UI]
      ED[Editor adapters]
      PREV[Sanitized Preview DOM]
    end

    subgraph Privileged["Privileged Local Zone"]
      PRELOAD[Typed Preload Capability Bridge]
      MAIN[Electron Main Process]
      FS[Filesystem / dialogs / shell]
    end

    subgraph Isolated["Isolated Work Zone"]
      EXP[Utility export workers]
      PDF[Hardened hidden PDF renderer]
    end

    MD --> ED
    MD --> PREV
    IMG --> PREV
    URL --> PREV
    PATH --> UI

    UI -->|named typed capabilities only| PRELOAD
    PRELOAD -->|validated IPC| MAIN
    MAIN --> FS
    MAIN --> EXP
    MAIN --> PDF

    PREV -. no Node/Electron authority .-> Sandboxed
```

The most important security boundary is not "Internet vs desktop". It is **document/renderer input vs privileged main-process capabilities**.

---

# 4. C4 Level 2 - Runtime containers/processes

```mermaid
flowchart TB
    subgraph Desktop["MarkHere Desktop Installation"]
      MAIN["Electron Main Process\nOS authority + orchestration"]
      PRE["Sandboxed Preload\nsmall contextBridge API"]
      REN["Renderer Process per editor window\nVue + Pinia + editor hosts"]
      UTIL["Utility Process Pool\nDOCX/large transforms/search jobs"]
      PDF["Hidden PDF WebContents\nrender + printToPDF only"]
      CORE["Process-neutral Packages\ndocument model / editor core / Markdown engine"]
    end

    FS[(Filesystem)]
    OS[Windows Shell / Dialogs / Menus]
    REL[Signed Release Host]

    REN -->|window.markhere API| PRE
    PRE -->|IPC invoke/send| MAIN
    MAIN -->|events| PRE
    PRE -->|safe callbacks/data| REN

    REN --> CORE
    MAIN --> CORE
    UTIL --> CORE

    MAIN <-->|read/write/watch| FS
    MAIN <-->|native integration| OS
    MAIN -->|job messages| UTIL
    MAIN -->|sanitized export HTML| PDF
    PDF -->|PDF bytes/status| MAIN
    MAIN <-->|update metadata/artifacts| REL
```

## 4.1 Container: Electron Main Process

**Responsibilities**

- application/single-instance lifecycle;
- window lifecycle;
- secure custom protocol handlers;
- filesystem gateway;
- native dialogs/menus;
- shell/external-link gateway;
- workspace file watcher;
- recovery persistence;
- app settings persistence;
- recent files/workspaces;
- exporter orchestration;
- update service;
- process crash monitoring;
- local logging.

**Must not**

- expose arbitrary filesystem calls to renderer;
- synchronously render large Markdown documents on the main event loop;
- trust renderer-supplied paths/URLs simply because they arrived over IPC.

## 4.2 Container: Preload

**Responsibilities**

- map strongly typed methods to fixed IPC actions;
- unwrap safe event payloads;
- perform minimal cheap value checks;
- expose safe web-file path acquisition when required using Electron `webUtils`;
- hide Electron event objects from renderer callbacks.

**Must not**

- expose `ipcRenderer`;
- expose general Node `fs`, `path`, `child_process`, `process.env`, or `shell` objects;
- contain business logic or mutable document state.

## 4.3 Container: Renderer

**Responsibilities**

- application UI;
- tab/session presentation;
- Preview/WYSIWYG/Source/Split modes;
- local ephemeral selection/scroll state;
- commands/keybindings;
- non-privileged parsing/render adapters;
- user notifications and conflict UI;
- export dialog and progress UI.

## 4.4 Container: Utility Process

**Responsibilities**

- execute isolated jobs with explicit input snapshots;
- emit progress;
- honor cancellation;
- fail independently;
- return bytes or temporary-artifact metadata to main.

**Example jobs**

- DOCX generation;
- high-cost Markdown transformation;
- image conversion;
- large text indexing/search coordination.

## 4.5 Container: PDF WebContents

**Responsibilities**

- display export-only sanitized HTML;
- wait for deterministic render completion;
- invoke Chromium PDF printing;
- terminate after result.

It has no user browsing surface and no filesystem capability bridge.

---

# 5. C4 Level 3 - Main process components

```mermaid
flowchart TB
    APP[AppLifecycle]
    WIN[WindowManager]
    IPC[IpcRouter]
    SEC[SecurityPolicy]
    PROTO[ProtocolService]
    FILE[FileService]
    WATCH[WatchService]
    WS[WorkspaceService]
    REC[RecoveryService]
    SET[SettingsService]
    SHELL[ShellService]
    EXPORT[ExportCoordinator]
    WORKER[WorkerManager]
    UPDATE[UpdateService]
    LOG[LoggingService]

    APP --> WIN
    APP --> IPC
    APP --> LOG
    APP --> UPDATE

    IPC --> SEC
    IPC --> FILE
    IPC --> WS
    IPC --> REC
    IPC --> SET
    IPC --> SHELL
    IPC --> EXPORT

    WIN --> SEC
    PROTO --> SEC
    PROTO --> FILE
    FILE --> WATCH
    WS --> FILE
    WS --> WATCH
    REC --> FILE
    EXPORT --> WORKER
    EXPORT --> FILE
    UPDATE --> SEC

    LOG -.observes.-> APP
    LOG -.observes.-> FILE
    LOG -.observes.-> EXPORT
```

### 5.1 `AppLifecycle`

Owns startup ordering, single-instance lock, command-line/open-file normalization, graceful quit, and crash-safe shutdown.

### 5.2 `WindowManager`

Creates hardened BrowserWindows, restores/clamps window geometry, routes app commands to the correct window, and verifies renderer identity.

### 5.3 `IpcRouter`

Registers one handler per documented operation. Each handler:

1. validates sender;
2. validates request schema;
3. resolves capabilities/document identity;
4. invokes a service;
5. maps expected errors to an API result;
6. records safe structured diagnostics.

### 5.4 `SecurityPolicy`

Centralizes URL schemes, external-navigation rules, filesystem scope/capabilities, MIME allowlists, CSP-related settings, and resource-token validation.

### 5.5 `ProtocolService`

Registers `markhere://` app content and `markhere-resource://` resource handling. It never maps an arbitrary renderer-supplied URL path directly to the host filesystem.

### 5.6 `FileService`

Canonical filesystem gateway for read, stat, atomic write, rename/move/trash, file identity, line endings, encoding, and fingerprint calculation.

### 5.7 `WatchService`

Wraps chokidar/OS events, de-duplicates noisy events, and converts them into semantic file-change events containing enough fingerprint data for conflict decisions.

### 5.8 `WorkspaceService`

Lists directory trees, creates files/folders, searches, and owns workspace-scoped capabilities.

### 5.9 `RecoveryService`

Stores/retrieves dirty document snapshots independently from the user's original files.

### 5.10 `SettingsService`

Loads schema-versioned settings, applies migrations, validates updates, and writes atomically.

### 5.11 `ShellService`

Handles approved `openExternal`, reveal-in-folder, and OS integration. It validates URLs/paths and never exposes the raw Electron shell object.

### 5.12 `ExportCoordinator`

Snapshots a document revision, starts a worker or PDF web contents, streams progress, handles cancellation, and moves a completed temporary artifact into the selected final path atomically.

### 5.13 `WorkerManager`

Creates/reuses Utility Processes, attaches correlation IDs and cancellation signals, enforces job limits, and treats worker exit as a recoverable export/search failure when possible.

---

# 6. C4 Level 3 - Renderer components

```mermaid
flowchart TB
    ROOT[AppShell]
    TABS[TabManager]
    DOCS[DocumentSessionStore]
    CMD[CommandRegistry]
    MODES[ModeController]
    WYS[WysiwygAdapter]
    SRC[SourceAdapter]
    PREV[PreviewAdapter]
    SPLIT[SplitCoordinator]
    OUT[OutlineService]
    FIND[FindReplace]
    WSUI[WorkspaceSidebar]
    EXPUI[ExportUI]
    NOTIFY[Notification/ConflictUI]
    BRIDGE[DesktopBridgeClient]

    ROOT --> TABS
    ROOT --> CMD
    ROOT --> WSUI
    ROOT --> NOTIFY

    TABS --> DOCS
    DOCS --> MODES
    MODES --> WYS
    MODES --> SRC
    MODES --> PREV
    MODES --> SPLIT
    SPLIT --> SRC
    SPLIT --> PREV

    DOCS --> OUT
    DOCS --> FIND
    DOCS --> EXPUI

    WSUI --> BRIDGE
    DOCS --> BRIDGE
    EXPUI --> BRIDGE
    NOTIFY --> BRIDGE
```

## 6.1 `DocumentSessionStore`

Owns renderer-side document metadata and the canonical current Markdown buffer/revision for each open tab. It receives save/external-change/recovery events from the desktop bridge.

It must distinguish:

- content revision;
- persisted revision;
- disk fingerprint;
- visual editor state;
- view mode;
- conflict state.

## 6.2 `ModeController`

Performs safe transitions among Preview, WYSIWYG, Source, and Split. Before detaching an editor adapter it flushes pending editor transactions into the document buffer.

## 6.3 `WysiwygAdapter`

Wraps the MarkHere-maintained Muya-derived editor core. The rest of the renderer depends on the adapter interface, not on Muya internals.

## 6.4 `SourceAdapter`

Wraps CodeMirror 6. It is configured as a text editor for Markdown and emits text transactions to the same `DocumentSessionStore`.

## 6.5 `PreviewAdapter`

Renders a specified revision and returns a structural map of headings/block anchors for navigation and scroll sync.

## 6.6 `SplitCoordinator`

Debounces preview updates, rejects stale results, maps source positions to structural anchors, and prevents feedback loops during programmatic scroll synchronization.

---

# 7. C4 Level 3 - Process-neutral packages

```mermaid
flowchart LR
    DM[document-model]
    IPC[ipc-contract]
    SEC[security-core]
    CORE[editor-core]
    MD[markdown-engine]
    EXP[export-core]
    HTML[export-html]
    DOCX[export-docx]
    PDF[export-pdf]
    SH[shared]

    DM --> SH
    IPC --> DM
    IPC --> SH
    SEC --> SH
    CORE --> MD
    CORE --> DM
    MD --> DM
    EXP --> DM
    HTML --> EXP
    HTML --> MD
    DOCX --> EXP
    DOCX --> MD
    PDF --> EXP
    PDF --> HTML
```

### Package constraints

- none of these packages may import Vue unless explicitly marked UI-only;
- core data packages must be runnable in Node tests without Electron;
- `editor-core` may use browser DOM APIs because the visual editor is browser-based, but must not use Electron/Node authority;
- export model types stay serializable by structured clone unless a worker-local representation is clearly isolated.

---

# 8. Dynamic view - opening a Markdown file

```mermaid
sequenceDiagram
    actor U as User/Explorer
    participant M as Main
    participant F as FileService
    participant R as Renderer
    participant D as DocumentSessionStore
    participant P as PreviewAdapter

    U->>M: launch/open README.md
    M->>M: normalize + validate path
    M->>F: readDocument(path)
    F->>F: read bytes, detect text format, fingerprint
    F-->>M: OpenDocumentDTO
    M-->>R: app.documentOpened(dto)
    R->>D: create session rev=1 persisted=1
    D->>P: render(rev=1, markdown)
    P-->>D: sanitized preview + anchors
    D-->>U: readable document
```

Security note: renderer receives document text because it must edit/render it; it does not receive general filesystem permission.

---

# 9. Dynamic view - WYSIWYG edit and mode switch

```mermaid
sequenceDiagram
    actor U as User
    participant W as WYSIWYG Adapter
    participant D as Document Store
    participant M as Mode Controller
    participant S as Source Adapter
    participant Rec as Recovery Scheduler

    U->>W: edit heading
    W->>D: commit transaction(baseRev=17)
    D->>D: apply -> rev=18, dirty=true
    D-->>Rec: dirty revision 18
    U->>M: switch to Source
    M->>W: flushPending()
    W-->>M: complete through rev=18
    M->>S: mount(markdown, rev=18)
    S-->>U: exact latest Markdown
```

No source editor is allowed to mount using a stale snapshot that predates the flush.

---

# 10. Dynamic view - atomic save

```mermaid
sequenceDiagram
    actor U as User
    participant R as Renderer
    participant B as Preload Bridge
    participant M as IPC Router
    participant F as FileService
    participant W as WatchService

    U->>R: Ctrl+S
    R->>B: files.save({documentId, revision, markdown, expectedFingerprint})
    B->>M: fixed IPC invoke
    M->>M: validate sender + schema + document capability
    M->>F: saveAtomic(request)
    F->>F: stat/hash conflict check
    alt external conflict
        F-->>M: Conflict error + current fingerprint
        M-->>R: ApiResult conflict
        R-->>U: conflict UI
    else safe to save
        F->>F: temp write + fsync/replace as supported
        F->>W: mark expected self-write fingerprint
        F-->>M: SaveResult(newFingerprint)
        M-->>R: success
        R->>R: persistedRevision = saved revision
        R-->>U: Saved
    end
```

---

# 11. Dynamic view - external modification

```mermaid
sequenceDiagram
    participant OS as Other Program
    participant F as File on Disk
    participant W as WatchService
    participant M as Main
    participant R as Document Store
    actor U as User

    OS->>F: write README.md
    F-->>W: filesystem event
    W->>W: debounce + fingerprint
    W-->>M: semantic fileChanged
    M-->>R: document.externalChanged(fingerprint)
    alt document clean
        R->>M: request reload
        M-->>R: new content + fingerprint
        R-->>U: refreshed / notice
    else document dirty
        R-->>U: conflict banner
        U->>R: choose Compare / Reload / Keep / Save As
    end
```

---

# 12. Dynamic view - split preview and stale render rejection

```mermaid
sequenceDiagram
    actor U as User
    participant S as Source Adapter
    participant D as Document Store
    participant C as Split Coordinator
    participant P as Preview Renderer

    U->>S: type A
    S->>D: commit -> rev 101
    D->>C: revision 101
    C->>C: debounce
    U->>S: type B
    S->>D: commit -> rev 102
    D->>C: revision 102
    C->>C: reset debounce
    C->>P: render rev 102
    U->>S: type C
    S->>D: commit -> rev 103
    D->>C: revision 103
    P-->>C: result rev 102
    C->>C: discard because current=103
    C->>P: render rev 103
    P-->>C: result rev 103
    C-->>U: update preview
```

---

# 13. Dynamic view - DOCX export

```mermaid
sequenceDiagram
    actor U as User
    participant R as Renderer
    participant M as ExportCoordinator
    participant X as DOCX Utility Process
    participant F as FileService

    U->>R: Export Word
    R->>M: exports.start(documentId, revision, options, target)
    M->>M: validate + snapshot exact revision
    M->>X: ExportJob(snapshot, options)
    X-->>M: progress parse 20%
    X-->>M: progress assets 45%
    X-->>M: progress OOXML 80%
    X-->>M: completed temp artifact
    M->>F: atomic move temp -> target.docx
    F-->>M: final path + fingerprint
    M-->>R: completed
    R-->>U: Exported successfully
```

The utility process never reads the user's mutable editor state directly. It receives a snapshot and explicit resource capabilities/bytes.

---

# 14. Dynamic view - PDF export

```mermaid
sequenceDiagram
    actor U as User
    participant R as Renderer
    participant M as ExportCoordinator
    participant H as HTML Exporter
    participant P as Hidden PDF WebContents
    participant F as FileService

    U->>R: Export PDF
    R->>M: start PDF export
    M->>H: build sanitized export HTML snapshot
    H-->>M: html + approved resource map
    M->>P: load export document
    P->>P: resolve fonts/images/math/diagrams
    P-->>M: render-ready
    M->>P: printToPDF(options)
    P-->>M: PDF bytes
    M->>F: atomic write target
    F-->>M: success
    M->>P: destroy
    M-->>R: completed
```

---

# 15. Dynamic view - recovery after renderer crash

```mermaid
sequenceDiagram
    participant R as Renderer
    participant Rec as Recovery Service
    participant M as Main
    actor U as User
    participant R2 as New Renderer

    R->>Rec: periodic snapshot rev 55
    R-xM: renderer process crashes
    M->>M: render-process-gone event
    M-->>U: window recovery action / recreate
    M->>Rec: list snapshots for crashed window
    Rec-->>M: document snapshot rev 55
    M->>R2: bootstrap recovered session
    R2-->>U: Recovered document (unsaved)
```

Recovery does not imply the filesystem copy was overwritten.

---

# 16. Dynamic view - validated external link

```mermaid
sequenceDiagram
    actor U as User
    participant P as Preview DOM
    participant R as Renderer
    participant B as Preload
    participant M as ShellService
    participant OS as Default Browser

    U->>P: click https://example.com
    P->>R: link intent
    R->>B: shell.openExternal(url)
    B->>M: fixed IPC invoke
    M->>M: parse URL + allow protocol + length/control-char checks
    alt allowed
        M->>OS: shell.openExternal(validated URL)
    else rejected
        M-->>R: UnsafeUrl error
        R-->>U: blocked notification
    end
```

---

# 17. Deployment view - Windows installed build

```mermaid
flowchart TB
    subgraph Machine["Windows 11 PC"]
      subgraph ProgramFiles["MarkHere installation directory"]
        EXE[markhere.exe]
        ASAR[resources/app.asar]
        NATIVE[native modules / bundled binaries]
        ICON[icons + static resources]
      end

      subgraph UserData["Per-user MarkHere data"]
        SET[settings / recents]
        REC[recovery snapshots]
        LOG[logs]
        CACHE[session/cache data]
      end

      subgraph UserFiles["User-controlled locations"]
        MD[*.md]
        IMG[images/assets]
        OUT[PDF/HTML/DOCX exports]
      end

      REG["Windows app registration / ProgID"]
    end

    EXE --> ASAR
    EXE --> NATIVE
    EXE --> SET
    EXE --> REC
    EXE --> LOG
    EXE --> CACHE
    EXE <--> MD
    EXE <--> IMG
    EXE --> OUT
    REG --> EXE
```

For a portable ZIP build, installation registry integration and automatic updates may be intentionally reduced/disabled.

---

# 18. Deployment view - CI/release pipeline

```mermaid
flowchart LR
    DEV[Git commit/tag]
    CI[GitHub Actions]
    CHECK[Lint + typecheck + unit]
    E2E[Windows Electron E2E]
    BUILD[Build x64 / ARM64]
    SIGN[Code sign]
    TEST[Install/upgrade smoke]
    REL[GitHub Release / update host]
    META[Update metadata]

    DEV --> CI
    CI --> CHECK
    CHECK --> E2E
    E2E --> BUILD
    BUILD --> SIGN
    SIGN --> TEST
    TEST --> REL
    REL --> META
```

No stable channel points to an unsigned artifact.

---

# 19. Data-flow overlay

```mermaid
flowchart LR
    DISK[Disk Markdown]
    READ[FileService Read]
    BUF[Canonical Versioned Buffer]
    WYS[WYSIWYG Block State]
    SRC[Source Editor State]
    PREV[Preview]
    REC[Recovery Snapshot]
    SAVE[Atomic Save]
    EXP[Export Snapshot]

    DISK --> READ --> BUF
    BUF <--> WYS
    BUF <--> SRC
    BUF --> PREV
    BUF --> REC
    BUF --> SAVE --> DISK
    BUF --> EXP
```

The arrows from WYSIWYG/Source back to the buffer are **transactions**, not independent persistence paths.

---

# 20. Architecture invariants visible in the diagrams

1. **No renderer -> filesystem direct edge.** Every privileged I/O crosses preload/main.
2. **No preview DOM -> Electron raw API edge.** Preview is untrusted content inside a sandboxed renderer.
3. **No exporter -> live mutable editor edge.** Exporters consume revision snapshots.
4. **No update host -> renderer code execution edge.** Updates are installed through the signed release mechanism, not downloaded scripts.
5. **No external browser embedded in the editor trust zone.** External links leave the app.
6. **No cloud database is required.** Disk is the durable document system of record.
7. **Every mode shares one document buffer.** Split is composition, not duplication.

---

# 21. C4-to-code traceability

| C4 element | Planned code area |
|---|---|
| AppLifecycle | `apps/desktop/src/main/app/` |
| WindowManager | `apps/desktop/src/main/windows/` |
| IpcRouter | `apps/desktop/src/main/ipc/` |
| SecurityPolicy | `apps/desktop/src/main/security/`, `packages/security-core/` |
| ProtocolService | `apps/desktop/src/main/protocol/` |
| FileService | `apps/desktop/src/main/filesystem/` |
| WatchService | `apps/desktop/src/main/filesystem/watch/` |
| WorkspaceService | `apps/desktop/src/main/workspace/` |
| RecoveryService | `apps/desktop/src/main/recovery/` |
| ExportCoordinator | `apps/desktop/src/main/export/` |
| DocumentSessionStore | `apps/desktop/src/renderer/stores/documents.ts` |
| ModeController | `apps/desktop/src/renderer/editor/mode-controller.ts` |
| WysiwygAdapter | `apps/desktop/src/renderer/editor/wysiwyg/` |
| SourceAdapter | `apps/desktop/src/renderer/editor/source/` |
| PreviewAdapter | `apps/desktop/src/renderer/editor/preview/` |
| SplitCoordinator | `apps/desktop/src/renderer/editor/split/` |
| Document model | `packages/document-model/` |
| IPC contract | `packages/ipc-contract/` |
| Muya-derived editor | `packages/editor-core/` |
| DOCX exporter | `packages/export-docx/` |

Actual filenames can evolve; boundary ownership should not drift casually.

---

# 22. Research references

- C4 model concepts: https://c4model.com/
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron IPC: https://www.electronjs.org/docs/latest/tutorial/ipc
- Electron context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Electron sandbox: https://www.electronjs.org/docs/latest/tutorial/sandbox
- Electron UtilityProcess: https://www.electronjs.org/docs/latest/api/utility-process
- Electron custom protocol: https://www.electronjs.org/docs/latest/api/protocol
- MarkText architecture: https://marktext.me/docs/dev/architecture
- MarkText repository structure: https://github.com/marktext/marktext

---

# 23. Related documents

The diagrams are normative only at the architectural-boundary level. Detailed object schemas are in `04-data-model.md`; exact capability contracts are in `05-api-design.md`; security controls/trust analysis are in `06-security-design.md`; deployment details are in `09-deployment-strategy.md`.
