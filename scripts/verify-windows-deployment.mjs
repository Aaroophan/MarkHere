import { readFile, access } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors=[]
async function text(path){ return readFile(join(root,path),'utf8') }
function req(src,parts,label){ for(const part of parts) if(!src.includes(part)) errors.push(`${label}: missing ${part}`) }
const [builder,nsis,pkg,desktop,policy,workflow,update,appService,ipc,settings,lifecycle]=await Promise.all([
 text('electron-builder.config.mjs'),text('build/windows/installer.nsh'),text('package.json'),text('apps/desktop/package.json'),text('docs/security/production-hardening-policy.json'),text('.github/workflows/release-windows.yml'),text('apps/desktop/src/main/services/update-service.ts'),text('apps/desktop/src/main/services/app-service.ts'),text('apps/desktop/src/main/ipc/register-ipc.ts'),text('apps/desktop/src/renderer/src/components/SettingsView.vue'),text('apps/desktop/src/main/app-lifecycle.ts')
])
req(builder,["appId: 'com.markhere.desktop'","productName: 'MarkHere'","executableName: 'markhere'","perMachine: false","oneClick: false","target: 'nsis'","target: 'zip'","afterPack","verifyUpdateCodeSignature: true"],'builder config')
req(nsis,['HKCU','RegisteredApplications','MarkHere.MarkdownDocument','OpenWithProgids','.mdtxt','customUnInstall'],'NSIS registration')
if(/UserChoice/iu.test(nsis)) errors.push('NSIS must not write protected UserChoice')
req(pkg,['electron-builder','@electron/fuses','check:deployment','release:verify-signatures'],'root package')
req(desktop,['electron-updater','package:win:x64'],'desktop package')
req(policy,['OnlyLoadAppFromAsar','EnableEmbeddedAsarIntegrityValidation','GrantFileProtocolExtraPrivileges'],'fuse policy')
req(workflow,['windows-2025','pnpm install --frozen-lockfile','MARKHERE_WINDOWS_PUBLISHER','MARKHERE_CSC_LINK','release:verify-fuses','release:verify-signatures','release:checksums'],'release workflow')
req(update,['autoUpdater.autoDownload = false','allowPrerelease','quitAndInstall','UPDATE_CHECK_FAILED'],'update service')
req(appService,['ms-settings:defaultapps?registeredAppUser='],'default-app onboarding')
if(/services\.future\.unavailable[^\n]*updates\./u.test(ipc)) errors.push('update IPC still routes through FutureService')
req(settings,['Check for updates','Make MarkHere my default Markdown app','Install and restart'],'settings integration')
req(lifecycle,["app.requestSingleInstanceLock()","second-instance"],'activation lifecycle')
for(const path of ['scripts/release/apply-fuses.mjs','scripts/release/verify-fuses.mjs','scripts/release/verify-authenticode.ps1','scripts/release/generate-release-manifest.mjs','scripts/release/generate-checksums.mjs','build/icons/markhere.ico']) { try { await access(join(root,path)) } catch { errors.push(`missing ${path}`) } }
if(errors.length){ console.error(`Issue-9 deployment violations:\n${errors.map(e=>`- ${e}`).join('\n')}`); process.exit(1) }
console.log('Issue-9 Windows packaging, integration, updater, signing, fuse, and release structure OK')
