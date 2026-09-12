import { BrowserWindow, dialog, type WebContents } from 'electron'
import type {
  ApiResult,
  ConfirmDialogRequest,
  ConfirmDialogResult,
  ExportTargetDialogRequest,
  OpenDocumentDialogOptions,
  SelectedPath
} from '@markhere/ipc-contract'
import { failure, ok } from './api-results'
import { SelectionTokenStore } from './selection-token-store'

export class DialogService {
  readonly #tokens: SelectionTokenStore

  constructor(tokens: SelectionTokenStore) {
    this.#tokens = tokens
  }

  async openDocuments(sender: WebContents, options?: OpenDocumentDialogOptions): Promise<ApiResult<SelectedPath[]>> {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    const result = await dialog.showOpenDialog(owner, {
      title: 'Open Markdown Document',
      properties: options?.allowMultiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mmd', 'mdown', 'mdtext', 'mdtxt', 'mdx'] },
        { name: 'Text', extensions: ['txt', 'text'] }
      ]
    })
    if (result.canceled) return ok([])
    return ok(result.filePaths.map((path) => {
      const token = this.#tokens.issue('document-open', path, sender.id)
      return { displayPath: path, selectionToken: token.token }
    }))
  }

  async openWorkspace(sender: WebContents): Promise<ApiResult<SelectedPath | null>> {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    const result = await dialog.showOpenDialog(owner, {
      title: 'Open Workspace',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return ok(null)
    const path = result.filePaths[0]
    const token = this.#tokens.issue('workspace-open', path, sender.id)
    return ok({ displayPath: path, selectionToken: token.token })
  }

  async chooseSaveDocument(sender: WebContents, defaultName?: string): Promise<ApiResult<SelectedPath | null>> {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    const result = await dialog.showSaveDialog(owner, {
      title: 'Save Markdown Document',
      ...(defaultName ? { defaultPath: defaultName } : {}),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return ok(null)
    const token = this.#tokens.issue('document-save', result.filePath, sender.id)
    return ok({ displayPath: result.filePath, selectionToken: token.token })
  }

  async chooseExportTarget(sender: WebContents, request: ExportTargetDialogRequest): Promise<ApiResult<SelectedPath | null>> {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    const extension = request.format
    const result = await dialog.showSaveDialog(owner, {
      title: `Export ${request.format.toUpperCase()}`,
      ...(request.defaultName ? { defaultPath: request.defaultName } : {}),
      filters: [{ name: request.format.toUpperCase(), extensions: [extension] }]
    })
    if (result.canceled || !result.filePath) return ok(null)
    const token = this.#tokens.issue('export-target', result.filePath, sender.id)
    return ok({ displayPath: result.filePath, selectionToken: token.token })
  }

  async confirm(sender: WebContents, request: ConfirmDialogRequest): Promise<ApiResult<ConfirmDialogResult>> {
    const owner = BrowserWindow.fromWebContents(sender)
    if (!owner) return failure('WINDOW_NOT_FOUND', 'security', 'error.windowNotFound', false)
    const result = await dialog.showMessageBox(owner, {
      type: request.destructive ? 'warning' : 'question',
      title: request.title,
      message: request.message,
      ...(request.detail ? { detail: request.detail } : {}),
      buttons: [request.confirmLabel ?? 'Confirm', request.cancelLabel ?? 'Cancel'],
      defaultId: request.destructive ? 1 : 0,
      cancelId: 1,
      noLink: true
    })
    return ok({ confirmed: result.response === 0 })
  }
}
