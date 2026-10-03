const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export class PrintDocumentStore {
  readonly #documents = new Map<string, string>()

  put(jobId: string, html: string): void {
    if (!JOB_ID.test(jobId) || html.length > 64 * 1024 * 1024) throw new Error('Invalid print document.')
    this.#documents.set(jobId, html)
  }

  get(jobId: string): string | null { return JOB_ID.test(jobId) ? this.#documents.get(jobId) ?? null : null }
  delete(jobId: string): void { this.#documents.delete(jobId) }
  clear(): void { this.#documents.clear() }
}
