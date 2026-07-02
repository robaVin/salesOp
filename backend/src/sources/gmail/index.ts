import { env, isGoogleOauthConfigured } from '../../config/env'
import type { SourceProvider } from '../types'
import { getRealGmailProvider } from './real'
import { getMockGmailProvider } from './mock'

/**
 * Selects between the real Gmail provider and the mock provider based on env.
 *
 *   GMAIL_PROVIDER=real  → real, but only when Google OAuth credentials exist.
 *                          Falls back to mock (with a boot warning) if creds
 *                          are missing so the app still runs.
 *   GMAIL_PROVIDER=mock  → mock always.
 *   unset / other        → mock. Real is opt-in per the deploy checklist.
 */
export function getGmailProvider(): SourceProvider {
  if (env.gmailProvider === 'real') {
    if (!isGoogleOauthConfigured()) {
      console.warn(
        '[gmail] GMAIL_PROVIDER=real but Google OAuth env vars are missing; ' +
          'falling back to mock provider.'
      )
      return getMockGmailProvider()
    }
    return getRealGmailProvider()
  }
  return getMockGmailProvider()
}
