import type { CommandId } from '@markhere/ipc-contract'

export interface RendererCommandDescriptor { readonly id: CommandId; readonly label: string; readonly requiresDocument?: boolean; readonly requiresEditable?: boolean }

export const RENDERER_COMMANDS: readonly RendererCommandDescriptor[] = Object.freeze([
  { id: 'file.new', label: 'New document' },
  { id: 'file.open', label: 'Open document…' },
  { id: 'file.openFolder', label: 'Open folder…' },
  { id: 'file.save', label: 'Save', requiresDocument: true },
  { id: 'file.saveAs', label: 'Save As…', requiresDocument: true },
  { id: 'file.export.html', label: 'Export HTML…', requiresDocument: true },
  { id: 'file.export.pdf', label: 'Export PDF…', requiresDocument: true },
  { id: 'file.export.docx', label: 'Export Word…', requiresDocument: true },
  { id: 'file.print', label: 'Print…', requiresDocument: true },
  { id: 'view.mode.preview', label: 'Mode: Preview', requiresDocument: true },
  { id: 'view.mode.wysiwyg', label: 'Mode: WYSIWYG', requiresDocument: true },
  { id: 'view.mode.source', label: 'Mode: Source', requiresDocument: true },
  { id: 'view.mode.split', label: 'Mode: Split', requiresDocument: true },
  { id: 'edit.find', label: 'Find', requiresDocument: true },
  { id: 'edit.replace', label: 'Replace', requiresDocument: true, requiresEditable: true },
  { id: 'app.settings', label: 'Settings…' },
  { id: 'app.commandPalette', label: 'Command Palette…' },
  { id: 'app.quit', label: 'Quit MarkHere' }
])
