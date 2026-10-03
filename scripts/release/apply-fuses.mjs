import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import { join } from 'node:path'

export default async function applyFuses(context) {
  if (context.electronPlatformName !== 'win32') return
  const executable = join(context.appOutDir, 'markhere.exe')
  await flipFuses(executable, {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  })
}
