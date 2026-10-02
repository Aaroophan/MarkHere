import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rgPath } from '@vscode/ripgrep'
import type { SearchMatch, SearchRequest, WorkspaceSearchBatchEvent, WorkspaceSearchCompletedEvent } from '@markhere/ipc-contract'

interface SearchJob { readonly workspaceId: string; readonly ownerWebContentsId: number; readonly child: ChildProcessWithoutNullStreams; cancelled: boolean }

function byteOffsetToCodeUnitIndex(text: string, byteOffset: number): number {
  let bytes = 0
  let codeUnits = 0
  for (const char of text) {
    if (bytes >= byteOffset) break
    bytes += new TextEncoder().encode(char).byteLength
    codeUnits += char.length
  }
  return codeUnits
}

export class WorkspaceSearchService {
  readonly #jobs = new Map<string, SearchJob>()
  readonly #onBatch: (ownerWebContentsId: number, event: WorkspaceSearchBatchEvent) => void
  readonly #onCompleted: (ownerWebContentsId: number, event: WorkspaceSearchCompletedEvent) => void

  constructor(options: {
    onBatch: (ownerWebContentsId: number, event: WorkspaceSearchBatchEvent) => void
    onCompleted: (ownerWebContentsId: number, event: WorkspaceSearchCompletedEvent) => void
  }) { this.#onBatch = options.onBatch; this.#onCompleted = options.onCompleted }

  start(root: string, ownerWebContentsId: number, request: SearchRequest): string {
    const searchId = randomUUID()
    const maxResults = Math.min(5000, Math.max(1, request.maxResults ?? 1000))
    const args = ['--json', '--line-number', '--column', '--no-heading', '--hidden', '--max-filesize', '16M', '--glob', '!.git/**', '--glob', '!node_modules/**']
    if (!request.regex) args.push('--fixed-strings')
    if (!request.caseSensitive) args.push('--ignore-case')
    if (request.wholeWord) args.push('--word-regexp')
    if (request.filePattern) args.push('--glob', request.filePattern)
    for (const glob of request.includeGlobs ?? []) args.push('--glob', glob)
    for (const glob of request.excludeGlobs ?? []) args.push('--glob', `!${glob}`)
    args.push('--', request.query, '.')

    const child = spawn(rgPath, args, { cwd: root, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.end()
    const job: SearchJob = { workspaceId: request.workspaceId, ownerWebContentsId, child, cancelled: false }
    this.#jobs.set(searchId, job)
    let pending = ''
    let batch: SearchMatch[] = []
    let resultCount = 0
    let truncated = false
    let stderr = ''
    const flush = (): void => {
      if (!batch.length) return
      this.#onBatch(ownerWebContentsId, { workspaceId: request.workspaceId, searchId, matches: batch })
      batch = []
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split(/\r?\n/u)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (!line || resultCount >= maxResults) { if (resultCount >= maxResults) truncated = true; continue }
        try {
          const event = JSON.parse(line) as { type?: string; data?: { path?: { text?: string }; lines?: { text?: string }; line_number?: number; submatches?: Array<{ start: number; end: number }> } }
          if (event.type !== 'match' || !event.data?.path?.text || !event.data.lines?.text || !event.data.line_number) continue
          const preview = event.data.lines.text.replace(/\r?\n$/u, '')
          const submatches = event.data.submatches ?? []
          const column = submatches[0] ? byteOffsetToCodeUnitIndex(preview, submatches[0].start) + 1 : 1
          batch.push({
            relativePath: event.data.path.text.replace(/\\/g, '/'),
            line: event.data.line_number,
            column,
            preview: preview.slice(0, 8192),
            ranges: submatches.slice(0, 256).map((match) => ({ start: byteOffsetToCodeUnitIndex(preview, match.start), end: byteOffsetToCodeUnitIndex(preview, match.end) }))
          })
          resultCount += 1
          if (batch.length >= 50) flush()
          if (resultCount >= maxResults) { truncated = true; child.kill() }
        } catch { /* malformed rg event is ignored */ }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 4096) stderr += chunk })
    let finalized = false
    const finalize = (event: WorkspaceSearchCompletedEvent): void => {
      if (finalized) return
      finalized = true
      flush()
      this.#jobs.delete(searchId)
      this.#onCompleted(ownerWebContentsId, event)
    }
    child.on('close', (code) => {
      const status = job.cancelled ? 'cancelled' : ((code === 0 || code === 1 || truncated) ? 'completed' : 'failed')
      finalize({
        workspaceId: request.workspaceId, searchId, status, resultCount, truncated,
        ...(status === 'failed' ? { errorCode: stderr ? 'WORKSPACE_SEARCH_FAILED' : 'WORKSPACE_SEARCH_PROCESS_FAILED' } : {})
      })
    })
    child.on('error', () => {
      finalize({ workspaceId: request.workspaceId, searchId, status: 'failed', resultCount, truncated, errorCode: 'WORKSPACE_SEARCH_START_FAILED' })
    })
    return searchId
  }

  cancel(searchId: string, ownerWebContentsId: number): void {
    const job = this.#jobs.get(searchId)
    if (!job || job.ownerWebContentsId !== ownerWebContentsId) return
    job.cancelled = true
    job.child.kill()
  }

  cancelWorkspace(workspaceId: string, ownerWebContentsId: number): void {
    for (const [id, job] of this.#jobs) if (job.workspaceId === workspaceId && job.ownerWebContentsId === ownerWebContentsId) this.cancel(id, ownerWebContentsId)
  }
}
