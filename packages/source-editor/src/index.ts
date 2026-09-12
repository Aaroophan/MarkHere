import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export interface SourceEditorHandle {
  readonly state: EditorState
  readonly view: EditorView
}

export const SOURCE_EDITOR_ENGINE = 'CodeMirror 6' as const
