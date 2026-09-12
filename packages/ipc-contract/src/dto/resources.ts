export interface ResolveDocumentLinkRequest {
  readonly documentId: string
  readonly href: string
}

export type ResolvedDocumentLink =
  | { readonly kind: 'anchor'; readonly headingSlug: string }
  | {
      readonly kind: 'document'
      readonly documentId?: string
      readonly openToken: string
      readonly anchor?: string
    }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'blocked'; readonly reason: string }

export interface ImportLocalImageRequest {
  readonly documentId: string
  readonly selectionToken: string
  readonly preferredName?: string
}
