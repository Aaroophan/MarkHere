import type { SettingsSection } from './common'

export interface MarkHereSettings {
  readonly revision: number
  readonly appearance: 'light' | 'dark' | 'system'
  readonly defaultMode: 'preview' | 'wysiwyg' | 'source' | 'split'
  readonly autosave: boolean
  readonly remoteResources: 'block' | 'ask' | 'allow-https'
  readonly lineNumbers: boolean
  readonly splitRatio: number
  readonly syncScroll: boolean
}

export type SettingsPatch = Partial<Omit<MarkHereSettings, 'revision'>> & {
  readonly expectedRevision?: number
}

export interface KeybindingConfig {
  readonly revision: number
  readonly bindings: Readonly<Record<string, string>>
}

export type { SettingsSection }
