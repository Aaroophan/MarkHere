import chokidar, { type FSWatcher } from 'chokidar'
import { workspaceRelativePath } from './workspace-path'

export interface WorkspaceWatchChange {
  readonly workspaceId: string
  readonly ownerWebContentsId: number
  readonly kind: 'added' | 'changed' | 'removed'
  readonly relativePath: string
}

export class WorkspaceWatchService {
  readonly #watchers = new Map<string, FSWatcher>()
  readonly #pending = new Map<string, { change: WorkspaceWatchChange; timer: ReturnType<typeof setTimeout> }>()
  readonly #onChange: (change: WorkspaceWatchChange) => void

  constructor(onChange: (change: WorkspaceWatchChange) => void) { this.#onChange = onChange }

  watch(workspaceId: string, ownerWebContentsId: number, root: string): void {
    void this.unwatch(workspaceId)
    const watcher = chokidar.watch(root, { ignoreInitial: true, followSymlinks: false, awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 } })
    const enqueue = (kind: WorkspaceWatchChange['kind'], absolutePath: string): void => {
      const relativePath = workspaceRelativePath(root, absolutePath)
      if (!relativePath) return
      const key = `${workspaceId}:${relativePath}`
      const previous = this.#pending.get(key)
      if (previous) clearTimeout(previous.timer)
      const change = { workspaceId, ownerWebContentsId, kind, relativePath } as const
      const timer = setTimeout(() => { this.#pending.delete(key); this.#onChange(change) }, 120)
      timer.unref?.()
      this.#pending.set(key, { change, timer })
    }
    watcher.on('add', (path) => enqueue('added', path))
    watcher.on('addDir', (path) => enqueue('added', path))
    watcher.on('change', (path) => enqueue('changed', path))
    watcher.on('unlink', (path) => enqueue('removed', path))
    watcher.on('unlinkDir', (path) => enqueue('removed', path))
    this.#watchers.set(workspaceId, watcher)
  }

  async unwatch(workspaceId: string): Promise<void> {
    const watcher = this.#watchers.get(workspaceId)
    if (watcher) { this.#watchers.delete(workspaceId); await watcher.close() }
    for (const [key, pending] of this.#pending) {
      if (key.startsWith(`${workspaceId}:`)) { clearTimeout(pending.timer); this.#pending.delete(key) }
    }
  }

  async closeAll(): Promise<void> { await Promise.all([...this.#watchers.keys()].map((id) => this.unwatch(id))) }
}
