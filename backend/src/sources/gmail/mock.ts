import type {
  ConnectionStatus,
  ProviderContext,
  SalesObject,
  SourceProvider,
  SyncOptions,
} from '../types'
import { getTokens, markDisconnected, upsertTokens } from '../../services/oauthTokenService'
import { queryOne } from '../../services/db'

/**
 * Mock Gmail provider. Used when GMAIL_PROVIDER != 'real' or when Google OAuth
 * credentials are missing. Enables local development and demo flow without
 * touching Google or any real inbox.
 *
 * Behaviour:
 *  - connectStartUrl returns a special URL the frontend recognizes; hitting
 *    /api/gmail/oauth/callback with source=mock completes the connect flow
 *    synthetically.
 *  - handleCallback stores a fake token row so status() reads as connected.
 *  - sync() returns 3 realistic-looking emails; subsequent calls return the
 *    same three (dedup keeps them from duplicating).
 */
const MOCK_ACCOUNT = 'demo-inbox@example.com'
const MOCK_EMAILS: Array<{
  external_id: string
  from_name: string
  from_email: string
  subject: string
  snippet: string
  received_at: string
  is_unread: boolean
  is_important: boolean
}> = [
  {
    external_id: 'mock-msg-001',
    from_name: 'Priya Patel',
    from_email: 'priya@northstar-freight.example',
    subject: 'Re: Pilot kickoff — first-week milestones',
    snippet:
      "Thanks for sending the plan yesterday. Two questions before we sign the pilot terms: (1) can we scope the first week to a single dispatcher team, and (2) what does the escalation path look like if we hit an edge case with the Stripe check?",
    received_at: new Date(Date.now() - 42 * 60_000).toISOString(),
    is_unread: true,
    is_important: true,
  },
  {
    external_id: 'mock-msg-002',
    from_name: 'Mike Reynolds',
    from_email: 'mike@pilot-carrier.example',
    subject: 'Question about pricing tiers',
    snippet:
      "Looked at the pilot pricing you sent. Our board is fine with the standard tier but wants to understand what triggers the jump to enterprise. Can you send a one-pager or walk through it on a 15-min call this week?",
    received_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
    is_unread: true,
    is_important: false,
  },
  {
    external_id: 'mock-msg-003',
    from_name: 'Elena Souza',
    from_email: 'elena@relayops.customer.example',
    subject: 'Renewal touch base — Q3',
    snippet:
      "Good news: our team unanimously voted to renew. Bad news: procurement wants a written SLA on document turnaround. Can we jump on a call Thursday to align on numbers before I send it up the chain?",
    received_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    is_unread: false,
    is_important: true,
  },
]

function makeSalesObjects(): SalesObject[] {
  return MOCK_EMAILS.map((e) => ({
    node_type: 'email',
    external_id: e.external_id,
    title: e.subject,
    body: e.snippet,
    status: 'open' as const,
    tags: [
      ...(e.is_unread ? ['unread'] : []),
      ...(e.is_important ? ['important'] : []),
      'mock',
    ],
    external_url: `https://mail.google.com/mail/u/0/#inbox/${e.external_id}`,
    received_at: e.received_at,
    metadata: {
      source_provider: 'gmail',
      external_id: e.external_id,
      external_url: `https://mail.google.com/mail/u/0/#inbox/${e.external_id}`,
      received_at: e.received_at,
      from_name: e.from_name,
      from_email: e.from_email,
      subject: e.subject,
      snippet: e.snippet,
      is_unread: e.is_unread,
      is_important: e.is_important,
      thread_id: `mock-thread-${e.external_id}`,
      labels: [
        'INBOX',
        ...(e.is_unread ? ['UNREAD'] : []),
        ...(e.is_important ? ['IMPORTANT'] : []),
      ],
      provider_mode: 'mock',
    },
  }))
}

export function getMockGmailProvider(): SourceProvider {
  return {
    key: 'gmail',
    displayName: 'Gmail (mock)',
    producesNodeType: 'email',

    async status(ctx: ProviderContext): Promise<ConnectionStatus> {
      const row = await getTokens({ userId: ctx.userId, provider: 'google_gmail_mock' })
      const lastSync = await queryOne<{ finished_at: Date | null }>(
        `SELECT finished_at FROM object_syncs
         WHERE user_id = $1 AND source_provider = 'gmail' AND status = 'success'
         ORDER BY started_at DESC LIMIT 1`,
        [ctx.userId]
      )
      return {
        connected: Boolean(row),
        state: row ? 'connected' : 'not_connected',
        external_account_email: row?.external_account_email ?? (row ? MOCK_ACCOUNT : null),
        scopes: row ? row.scopes.split(' ').filter(Boolean) : [],
        last_sync_at: lastSync?.finished_at ? lastSync.finished_at.toISOString() : null,
        detail: 'Mock provider active (GMAIL_PROVIDER != "real" or Google creds missing).',
      }
    },

    async connectStartUrl(_ctx, redirectAfter: string): Promise<string> {
      // Mock connect: the frontend routes to a backend endpoint that fakes the
      // callback, then bounces back to redirectAfter.
      const params = new URLSearchParams({ redirect: redirectAfter })
      return `/api/gmail/oauth/callback?mock=1&${params.toString()}`
    },

    async handleCallback(ctx, _params): Promise<void> {
      await upsertTokens({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        provider: 'google_gmail_mock',
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        externalAccountEmail: MOCK_ACCOUNT,
      })
    },

    async disconnect(ctx): Promise<void> {
      await markDisconnected({ userId: ctx.userId, provider: 'google_gmail_mock' })
    },

    async sync(_ctx, opts: SyncOptions) {
      const limit = Math.max(1, Math.min(opts.limit ?? 50, 200))
      const objects = makeSalesObjects().slice(0, limit)
      return {
        objects,
        cursor_watermark: `mock-watermark-${Date.now()}`,
      }
    },
  }
}
