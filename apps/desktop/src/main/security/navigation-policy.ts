import { SecurityPolicy } from '@markhere/security-core'

const policy = new SecurityPolicy()

export function isAllowedApplicationNavigation(targetUrl: string, expectedOrigin: string): boolean {
  return policy.mayNavigate(targetUrl, expectedOrigin)
}
