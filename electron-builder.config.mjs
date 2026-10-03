import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const publisherName = process.env.MARKHERE_WINDOWS_PUBLISHER?.trim()
const channel = process.env.MARKHERE_RELEASE_CHANNEL?.trim() || 'alpha'
const updateBaseUrl = process.env.MARKHERE_UPDATE_BASE_URL?.trim()

if (!['alpha', 'beta', 'stable'].includes(channel)) throw new Error(`Invalid MARKHERE_RELEASE_CHANNEL: ${channel}`)

export default {
  appId: 'com.markhere.desktop',
  productName: 'MarkHere',
  copyright: 'Copyright © MarkHere contributors',
  directories: {
    app: resolve(root, 'apps/desktop'),
    buildResources: resolve(root, 'build'),
    output: resolve(root, 'dist')
  },
  asar: true,
  asarUnpack: ['node_modules/@vscode/ripgrep/bin/**'],
  files: [
    'out/**',
    'package.json',
    '!**/*.map',
    '!**/*.test.*',
    '!**/*.spec.*',
    '!test/**',
    '!scripts/**'
  ],
  extraResources: [
    { from: resolve(root, 'LICENSE'), to: 'legal/LICENSE' },
    { from: resolve(root, 'THIRD_PARTY_NOTICES.md'), to: 'legal/THIRD_PARTY_NOTICES.md' }
  ],
  win: {
    executableName: 'markhere',
    icon: resolve(root, 'build/icons/markhere.ico'),
    target: [{ target: 'nsis', arch: ['x64'] }, { target: 'zip', arch: ['x64'] }],
    artifactName: 'MarkHere-win-${arch}-${version}${ext}',
    verifyUpdateCodeSignature: true,
    ...(publisherName ? { publisherName: [publisherName] } : {})
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'MarkHere',
    uninstallDisplayName: 'MarkHere',
    deleteAppDataOnUninstall: false,
    include: resolve(root, 'build/windows/installer.nsh'),
    artifactName: 'MarkHere-win-${arch}-${version}-setup.${ext}'
  },
  ...(updateBaseUrl ? {
    publish: [{ provider: 'generic', url: `${updateBaseUrl.replace(/\/$/u, '')}/${channel}` }]
  } : {}),
  afterPack: resolve(root, 'scripts/release/apply-fuses.mjs'),
  afterAllArtifactBuild: async (context) => {
    if (channel === 'stable' && !publisherName) throw new Error('Stable release requires MARKHERE_WINDOWS_PUBLISHER so update signature verification can be pinned to the expected certificate subject.')
    if (channel === 'stable' && !updateBaseUrl) throw new Error('Stable release requires MARKHERE_UPDATE_BASE_URL for fixed updater metadata.')
    return context.artifactPaths
  }
}
