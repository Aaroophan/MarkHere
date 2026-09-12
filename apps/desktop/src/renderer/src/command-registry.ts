import type { AppCommandEvent, CommandId } from '@markhere/ipc-contract'

export type RendererCommandHandler = (event: AppCommandEvent) => void | Promise<void>

export class RendererCommandRegistry {
  readonly #handlers = new Map<CommandId, RendererCommandHandler>()

  register(commandId: CommandId, handler: RendererCommandHandler): () => void {
    this.#handlers.set(commandId, handler)
    return () => this.#handlers.delete(commandId)
  }

  async execute(event: AppCommandEvent): Promise<boolean> {
    const handler = this.#handlers.get(event.id)
    if (!handler) return false
    await handler(event)
    return true
  }
}
