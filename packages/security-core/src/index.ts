export type ExternalUrlDecision = 'allow' | 'deny'

export const SAFE_EXTERNAL_PROTOCOLS = Object.freeze(['https:', 'mailto:'] as const)

export function classifyExternalProtocol(protocol: string): ExternalUrlDecision {
  return SAFE_EXTERNAL_PROTOCOLS.includes(protocol as (typeof SAFE_EXTERNAL_PROTOCOLS)[number])
    ? 'allow'
    : 'deny'
}
