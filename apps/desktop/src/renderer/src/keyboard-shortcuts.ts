export function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent, platform: string): boolean {
  if (!shortcut) return false
  const parts = shortcut.split('+')
  const key = parts.at(-1)?.toLocaleLowerCase('en-US') ?? ''
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLocaleLowerCase('en-US')))
  const isMac = platform === 'darwin'
  const primary = isMac ? event.metaKey : event.ctrlKey
  const expectedPrimary = modifiers.has('cmdorctrl')
  const expectedCtrl = modifiers.has('ctrl')
  const expectedMeta = modifiers.has('cmd')
  if (primary !== expectedPrimary && expectedPrimary) return false
  if (!expectedPrimary) {
    if (event.ctrlKey !== expectedCtrl) return false
    if (event.metaKey !== expectedMeta) return false
  } else if ((isMac && event.ctrlKey) || (!isMac && event.metaKey)) return false
  if (event.altKey !== modifiers.has('alt')) return false
  if (event.shiftKey !== modifiers.has('shift')) return false
  const eventKey = event.key.length === 1 ? event.key.toLocaleLowerCase('en-US') : event.key.toLocaleLowerCase('en-US')
  return eventKey === key
}

export function presentShortcut(shortcut: string, platform: string): string {
  if (!shortcut) return ''
  if (platform !== 'darwin') return shortcut.replace('CmdOrCtrl', 'Ctrl').replace('Cmd', 'Ctrl')
  return shortcut.replace('CmdOrCtrl', '⌘').replace('Cmd', '⌘').replace('Alt', '⌥').replace('Shift', '⇧').replace('Ctrl', '⌃').replace(/\+/g, '')
}
