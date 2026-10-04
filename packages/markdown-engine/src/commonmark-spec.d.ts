declare module 'commonmark-spec' {
  export interface CommonMarkSpecCase {
    readonly markdown: string
    readonly html: string
    readonly section: string
    readonly number: number
  }
  export const tests: readonly CommonMarkSpecCase[]
  export const text: string
}
