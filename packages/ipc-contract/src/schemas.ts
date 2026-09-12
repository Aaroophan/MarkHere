import { z } from 'zod'
import { CHANNELS, type InvokeChannel, type MainEventChannel, type SendChannel } from './internal-channels'

const boundedString = (max: number) => z.string().min(1).max(max).refine((v) => !/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v), 'control characters are not allowed')
const id = boundedString(256)
const token = z.string().uuid()
const optionalShort = z.string().max(512).optional()
const settingsSection = z.enum(['general', 'appearance', 'editor', 'files', 'export', 'keybindings', 'updates'])
const exportFormat = z.enum(['html', 'pdf', 'docx'])

export const FileFingerprintSchema = z.object({
  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  mtimeMs: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ctimeMs: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  platformFileId: z.string().max(256).optional()
}).strict()

export const TextFormatMetadataSchema = z.object({
  encoding: z.string().min(1).max(64),
  detectedEncodingName: z.string().min(1).max(64).optional(),
  lineEnding: z.enum(['lf', 'crlf', 'cr']),
  hasFinalNewline: z.boolean(),
  bom: z.boolean()
}).strict()

export const SaveDocumentRequestSchema = z.object({
  documentId: id,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  markdown: z.string().max(32 * 1024 * 1024),
  expectedDiskFingerprint: FileFingerprintSchema.nullable(),
  textFormat: TextFormatMetadataSchema
}).strict()

export const SaveDocumentAsRequestSchema = SaveDocumentRequestSchema.omit({ expectedDiskFingerprint: true }).extend({
  targetSelectionToken: token
}).strict()

export const StartExportRequestSchema = z.object({
  documentId: id,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  markdown: z.string().max(32 * 1024 * 1024),
  format: exportFormat,
  options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  targetSelectionToken: token
}).strict()

export const ConfirmDialogRequestSchema = z.object({
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2048),
  detail: z.string().max(8192).optional(),
  confirmLabel: z.string().min(1).max(80).optional(),
  cancelLabel: z.string().min(1).max(80).optional(),
  destructive: z.boolean().optional()
}).strict()

export const SettingsPatchSchema = z.object({
  expectedRevision: z.number().int().nonnegative().optional(),
  appearance: z.enum(['light', 'dark', 'system']).optional(),
  defaultMode: z.enum(['preview', 'wysiwyg', 'source', 'split']).optional(),
  autosave: z.boolean().optional(),
  remoteResources: z.enum(['block', 'ask', 'allow-https']).optional(),
  lineNumbers: z.boolean().optional(),
  splitRatio: z.number().min(0.1).max(0.9).optional(),
  syncScroll: z.boolean().optional()
}).strict()

export const AppCommandEventSchema = z.object({
  id: z.enum([
    'file.new', 'file.open', 'file.openFolder', 'file.save', 'file.saveAs',
    'file.export.html', 'file.export.pdf', 'file.export.docx',
    'view.mode.preview', 'view.mode.wysiwyg', 'view.mode.source', 'view.mode.split',
    'edit.find', 'edit.replace', 'app.settings', 'app.quit'
  ]),
  source: z.enum(['menu', 'shortcut', 'system'])
}).strict()

export const WindowStateEventSchema = z.object({
  maximized: z.boolean(),
  fullScreen: z.boolean(),
  alwaysOnTop: z.boolean()
}).strict()

export const DocumentExternalChangeEventSchema = z.object({
  documentId: id,
  kind: z.enum(['changed', 'deleted', 'renamed']),
  actualFingerprint: FileFingerprintSchema.nullable().optional(),
  detectedAt: z.string().max(64).optional()
}).strict()

export const WorkspaceChangeEventSchema = z.object({
  workspaceId: id,
  kind: z.enum(['added', 'changed', 'removed']),
  relativePath: boundedString(4096)
}).strict()

export const ExportProgressEventSchema = z.object({
  jobId: id,
  phase: z.enum(['preparing', 'assets', 'rendering', 'packaging', 'writing']),
  completed: z.number().nonnegative().optional(),
  total: z.number().positive().optional(),
  percent: z.number().min(0).max(100).optional()
}).strict()

export const ExportCompletedEventSchema = z.object({
  jobId: id,
  success: z.boolean(),
  displayPath: z.string().max(32768).optional(),
  errorCode: z.string().max(128).optional()
}).strict()

export const UpdateStatusSchema = z.object({
  state: z.enum(['idle', 'checking', 'available', 'not-available', 'downloading', 'downloaded', 'error']),
  version: z.string().max(64).optional(),
  percent: z.number().min(0).max(100).optional(),
  errorCode: z.string().max(128).optional()
}).strict()

const voidArgs = z.tuple([])
const oneId = z.tuple([id])
const oneToken = z.tuple([token])
const workspaceRelative = z.object({
  workspaceId: id,
  relativePath: boundedString(4096)
}).strict()

export const INVOKE_ARG_SCHEMAS: Record<InvokeChannel, z.ZodType> = {
  [CHANNELS.appGetInfo]: voidArgs,
  [CHANNELS.appGetPlatformInfo]: voidArgs,
  [CHANNELS.appRequestQuit]: voidArgs,
  [CHANNELS.appOpenAbout]: voidArgs,
  [CHANNELS.appOpenSettings]: z.tuple([settingsSection.optional()]),
  [CHANNELS.windowIsMaximized]: voidArgs,
  [CHANNELS.windowIsFullScreen]: voidArgs,
  [CHANNELS.windowSetAlwaysOnTop]: z.tuple([z.boolean()]),
  [CHANNELS.dialogsOpenDocuments]: z.tuple([z.object({ allowMultiple: z.boolean().optional() }).strict().optional()]),
  [CHANNELS.dialogsOpenWorkspace]: voidArgs,
  [CHANNELS.dialogsChooseSaveDocument]: z.tuple([optionalShort]),
  [CHANNELS.dialogsChooseExportTarget]: z.tuple([z.object({ format: exportFormat, defaultName: optionalShort }).strict()]),
  [CHANNELS.dialogsConfirm]: z.tuple([ConfirmDialogRequestSchema]),
  [CHANNELS.fileOpenSelected]: oneToken,
  [CHANNELS.fileReopenRecent]: oneId,
  [CHANNELS.fileSave]: z.tuple([SaveDocumentRequestSchema]),
  [CHANNELS.fileSaveAs]: z.tuple([SaveDocumentAsRequestSchema]),
  [CHANNELS.fileStat]: oneId,
  [CHANNELS.fileReload]: oneId,
  [CHANNELS.fileReveal]: oneId,
  [CHANNELS.fileTrash]: oneId,
  [CHANNELS.fileRename]: z.tuple([z.object({ documentId: id, newBasename: boundedString(255) }).strict()]),
  [CHANNELS.fileCopyImportedImage]: z.tuple([z.object({ documentId: id, temporaryImageToken: id, preferredName: optionalShort }).strict()]),
  [CHANNELS.workspaceOpen]: oneToken,
  [CHANNELS.workspaceClose]: oneId,
  [CHANNELS.workspaceList]: z.tuple([z.object({ workspaceId: id, relativePath: z.string().max(4096).optional() }).strict()]),
  [CHANNELS.workspaceCreateFile]: z.tuple([workspaceRelative]),
  [CHANNELS.workspaceCreateDirectory]: z.tuple([workspaceRelative]),
  [CHANNELS.workspaceRename]: z.tuple([workspaceRelative.extend({ newName: boundedString(255) }).strict()]),
  [CHANNELS.workspaceMove]: z.tuple([workspaceRelative.extend({ targetRelativePath: boundedString(4096) }).strict()]),
  [CHANNELS.workspaceTrash]: z.tuple([workspaceRelative]),
  [CHANNELS.workspaceOpenEntry]: z.tuple([workspaceRelative]),
  [CHANNELS.workspaceSearch]: z.tuple([z.object({
    workspaceId: id,
    query: z.string().min(1).max(4096),
    caseSensitive: z.boolean().optional(),
    wholeWord: z.boolean().optional(),
    filePattern: z.string().max(512).optional()
  }).strict()]),
  [CHANNELS.resourceResolveLink]: z.tuple([z.object({ documentId: id, href: z.string().min(1).max(8192) }).strict()]),
  [CHANNELS.resourceImportLocalImage]: z.tuple([z.object({ documentId: id, selectionToken: token, preferredName: optionalShort }).strict()]),
  [CHANNELS.settingsGet]: voidArgs,
  [CHANNELS.settingsUpdate]: z.tuple([SettingsPatchSchema]),
  [CHANNELS.settingsReset]: z.tuple([settingsSection.optional()]),
  [CHANNELS.settingsGetKeybindings]: voidArgs,
  [CHANNELS.settingsUpdateKeybindings]: z.tuple([z.object({
    revision: z.number().int().nonnegative(),
    bindings: z.record(z.string().max(160), z.string().max(160))
  }).strict()]),
  [CHANNELS.recoveryUpdate]: z.tuple([z.object({
    documentId: id,
    revision: z.number().int().positive(),
    persistedRevision: z.number().int().nonnegative(),
    markdown: z.string().max(32 * 1024 * 1024),
    displayPath: z.string().max(32768).optional(),
    textFormat: TextFormatMetadataSchema.optional(),
    baseDiskFingerprint: FileFingerprintSchema.nullable().optional()
  }).strict()]),
  [CHANNELS.recoveryList]: voidArgs,
  [CHANNELS.recoveryGet]: oneId,
  [CHANNELS.recoveryDiscard]: oneId,
  [CHANNELS.recoveryDiscardForDocument]: z.tuple([id, z.number().int().nonnegative().optional()]),
  [CHANNELS.exportStart]: z.tuple([StartExportRequestSchema]),
  [CHANNELS.exportGetStatus]: oneId,
  [CHANNELS.shellOpenExternal]: z.tuple([z.string().min(1).max(8192)]),
  [CHANNELS.shellShowItemInFolder]: oneId,
  [CHANNELS.clipboardReadImageForImport]: voidArgs,
  [CHANNELS.clipboardWriteText]: z.tuple([z.string().max(8 * 1024 * 1024)]),
  [CHANNELS.clipboardWriteRich]: z.tuple([z.object({ text: z.string().max(8 * 1024 * 1024), html: z.string().max(16 * 1024 * 1024) }).strict()]),
  [CHANNELS.updateCheck]: voidArgs,
  [CHANNELS.updateDownload]: voidArgs,
  [CHANNELS.updateInstallAndRestart]: voidArgs,
  [CHANNELS.updateGetStatus]: voidArgs
}

export const SEND_ARG_SCHEMAS: Record<SendChannel, z.ZodType> = {
  [CHANNELS.windowMinimize]: voidArgs,
  [CHANNELS.windowToggleMaximize]: voidArgs,
  [CHANNELS.windowClose]: voidArgs,
  [CHANNELS.windowToggleFullScreen]: voidArgs,
  [CHANNELS.workspaceCancelSearch]: oneId,
  [CHANNELS.resourceInvalidateDocumentCache]: oneId,
  [CHANNELS.exportCancel]: oneId
}

export const MAIN_EVENT_SCHEMAS = Object.freeze({
  [CHANNELS.eventDocumentExternalChange]: DocumentExternalChangeEventSchema,
  [CHANNELS.eventWorkspaceChange]: WorkspaceChangeEventSchema,
  [CHANNELS.eventExportProgress]: ExportProgressEventSchema,
  [CHANNELS.eventExportCompleted]: ExportCompletedEventSchema,
  [CHANNELS.eventUpdateStatus]: UpdateStatusSchema,
  [CHANNELS.eventAppCommand]: AppCommandEventSchema,
  [CHANNELS.eventWindowState]: WindowStateEventSchema
} satisfies Record<MainEventChannel, z.ZodType>)
