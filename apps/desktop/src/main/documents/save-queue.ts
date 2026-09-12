export class PerDocumentSaveQueue {
  readonly #tails = new Map<string, Promise<unknown>>()

  enqueue<T>(documentId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(documentId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(task)
    const tail = run.finally(() => {
      if (this.#tails.get(documentId) === tail) this.#tails.delete(documentId)
    })
    this.#tails.set(documentId, tail)
    return run
  }
}
