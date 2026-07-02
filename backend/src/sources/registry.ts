import type { SourceProvider } from './types'
import { getGmailProvider } from './gmail'

/**
 * Provider registry. Adding a new source (Slack, Outlook, HubSpot, ...) is one
 * entry here plus one implementation folder. Everything else — API routes,
 * DB storage, canvas rendering — is provider-agnostic.
 */

const PROVIDERS: Record<string, () => SourceProvider> = {
  gmail: getGmailProvider,
}

export function getProvider(key: string): SourceProvider | null {
  const factory = PROVIDERS[key]
  return factory ? factory() : null
}

export function listProviders(): SourceProvider[] {
  return Object.values(PROVIDERS).map((f) => f())
}

export function listProviderKeys(): string[] {
  return Object.keys(PROVIDERS)
}
