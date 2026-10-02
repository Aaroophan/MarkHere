import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const errors = []
async function text(path) { return readFile(join(root, path), 'utf8') }
function requireText(source, fragments, label) {
  for (const fragment of fragments) if (!source.includes(fragment)) errors.push(`${label}: missing ${fragment}`)
}

const [ipc, bridge, workspace, search, settings, keybindings, app, editor, tree, searchUi, contract] = await Promise.all([
  text('apps/desktop/src/main/ipc/register-ipc.ts'),
  text('apps/desktop/src/preload/bridge.ts'),
  text('apps/desktop/src/main/workspace/workspace-service.ts'),
  text('apps/desktop/src/main/workspace/workspace-search-service.ts'),
  text('apps/desktop/src/main/storage/settings-service.ts'),
  text('apps/desktop/src/main/storage/keybinding-service.ts'),
  text('apps/desktop/src/renderer/src/App.vue'),
  text('apps/desktop/src/renderer/src/components/DocumentEditor.vue'),
  text('apps/desktop/src/renderer/src/components/WorkspaceTree.vue'),
  text('apps/desktop/src/renderer/src/components/WorkspaceSearch.vue'),
  text('packages/ipc-contract/src/bridge.ts')
])

requireText(workspace, ['WorkspaceCapabilityRegistry', 'resolveWorkspaceTarget', 'validateWorkspaceRelativePath', 'shell.trashItem', 'openEntry', 'cancelSearch'], 'workspace service')
requireText(search, ["from '@vscode/ripgrep'", "shell: false", "--json", "--max-filesize", "cancel(searchId", "!node_modules/**", "!.git/**"], 'workspace search')
requireText(settings, ['appearance', 'defaultMode', 'autosave', 'autosaveDelayMs', 'remoteResources', 'lineNumbers', 'splitRatio', 'syncScroll', 'imageStorage', 'migratePersistedSettings'], 'settings service')
requireText(keybindings, ['DEFAULT_KEYBINDINGS', 'KEYBINDING_COLLISION', 'normalizeKeybinding', 'app.commandPalette'], 'keybinding service')
requireText(app, ['class="tab-strip"', 'WorkspaceTree', 'WorkspaceSearch', 'Document outline', 'statusbar', 'CommandPalette', 'scheduleAutosaves', 'copyImportedImage', "data-theme", 'Recent documents', 'Recent workspaces'], 'desktop shell')
requireText(editor, ['remoteImagesApproved', 'Load remote images', 'role="separator"', 'aria-valuenow', 'lineNumbers'], 'editor accessibility/resources')
requireText(tree, ['onWorkspaceChange', 'workspaces.createFile', 'workspaces.createDirectory', 'workspaces.rename', 'workspaces.move', 'workspaces.trash'], 'workspace tree')
requireText(searchUi, ['workspaces.search', 'cancelSearch', 'onWorkspaceSearchBatch', 'onWorkspaceSearchCompleted'], 'workspace search UI')
requireText(contract, ['listRecent()', 'removeRecent(recentId', 'getKeybindings()', 'updateKeybindings', 'onWorkspaceSearchBatch', 'onSettingsChanged'], 'semantic bridge contract')
requireText(bridge, ['workspaceReopenRecent', 'workspaceSearch', 'settingsGetKeybindings', 'eventWorkspaceSearchBatch'], 'preload semantic bridge')

if (/workspace(?:Open|List|Create|Rename|Move|Trash|Search)[\s\S]{0,180}future\.unavailable/u.test(ipc)) errors.push('workspace IPC still routes through FutureService')
if (/settings(?:GetKeybindings|UpdateKeybindings)[\s\S]{0,180}future\.unavailable/u.test(ipc)) errors.push('keybinding IPC still routes through FutureService')
if (/fileCopyImportedImage[\s\S]{0,180}future\.unavailable/u.test(ipc)) errors.push('image import still routes through FutureService')

if (errors.length) {
  console.error(`Issue-6 desktop/workspace violations:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}
console.log('Issue-6 desktop workspace, navigation, settings, accessibility, and productivity structure OK')
