import type { DocumentRevision } from '@markhere/document-model'

export interface WysiwygEditorAdapter {
  mount(target: HTMLElement, markdown: string): Promise<void>
  getMarkdown(): Promise<string>
  replaceMarkdown(markdown: string, revision: DocumentRevision): Promise<void>
  destroy(): void
}
