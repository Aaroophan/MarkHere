import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
const desktop=JSON.parse(await readFile(join(root,'apps/desktop/package.json'),'utf8'))
const lock=join(root,'pnpm-lock.yaml')
let lockHash=null
try { lockHash=createHash('sha256').update(await readFile(lock)).digest('hex') } catch {}
let gitCommit=process.env.GITHUB_SHA ?? null
if (!gitCommit) { try { gitCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim() } catch {} }
const out=resolve(process.argv[2] ?? join(root,'dist'))
await mkdir(out,{recursive:true})
const manifest={schemaVersion:1,version:pkg.version,gitCommit,electron:desktop.devDependencies.electron,electronBuilder:pkg.devDependencies['electron-builder'],node:process.version,pnpm:pkg.packageManager,pnpmLockSha256:lockHash,channel:process.env.MARKHERE_RELEASE_CHANNEL ?? 'stable',arch:process.arch,platform:process.platform,buildTime:new Date().toISOString(),ciRun:process.env.GITHUB_RUN_ID ?? null}
await writeFile(join(out,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest,null,2))
