import { FuseVersion, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const executable = resolve(process.argv[2] ?? 'dist/win-unpacked/markhere.exe')
const expected = JSON.parse(await readFile(new URL('../../docs/security/production-hardening-policy.json', import.meta.url), 'utf8')).expectedFusesForIssue9
const wire = await getCurrentFuseWire(executable)
if (wire.version !== FuseVersion.V1) throw new Error(`Unexpected fuse version: ${wire.version}`)
const actual = {
  RunAsNode: wire[FuseV1Options.RunAsNode],
  EnableNodeOptionsEnvironmentVariable: wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable],
  EnableNodeCliInspectArguments: wire[FuseV1Options.EnableNodeCliInspectArguments],
  OnlyLoadAppFromAsar: wire[FuseV1Options.OnlyLoadAppFromAsar],
  EnableEmbeddedAsarIntegrityValidation: wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
  GrantFileProtocolExtraPrivileges: wire[FuseV1Options.GrantFileProtocolExtraPrivileges]
}
const mismatches = Object.entries(expected).filter(([key, value]) => actual[key] !== value)
if (mismatches.length) throw new Error(`Fuse mismatch: ${JSON.stringify({ expected, actual, mismatches })}`)
console.log(JSON.stringify({ executable, actual }, null, 2))
