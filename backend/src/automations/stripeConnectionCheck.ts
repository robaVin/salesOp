import Stripe from 'stripe'
import { env } from '../config/env'
import type { Routine, RoutineContext, RoutineResult } from './types'

/**
 * stripe.connection.check
 *
 * Hits Stripe `/v1/account` in test mode to confirm API connectivity. If a
 * customer id is provided in the trigger payload, also reads that customer
 * (read-only). Never writes to Stripe.
 */
export const stripeConnectionCheck: Routine = {
  key: 'stripe.connection.check',
  displayName: 'Stripe — connection check',
  description: 'Reads /v1/account in test mode. Optionally verifies a customer id. Never writes.',
  readOnly: true,

  async run(ctx: RoutineContext): Promise<RoutineResult> {
    if (!env.stripeTestKey) {
      return {
        status: 'needs_review',
        result: { reason: 'no_stripe_key', detail: 'STRIPE_TEST_KEY not configured' },
        note: {
          title: 'Stripe check — not configured',
          body:
            'Tried to run stripe.connection.check but STRIPE_TEST_KEY is not set in the backend env. ' +
            'Set a test-mode key (sk_test_...) and rerun.',
          status: 'needs_review',
          tags: ['stripe', 'auto', 'needs-config'],
        },
        error: 'no_stripe_key',
      }
    }

    // Guard against accidental live keys reaching this routine.
    if (env.stripeTestKey.startsWith('sk_live_')) {
      return {
        status: 'failed',
        result: { reason: 'live_key_blocked' },
        note: {
          title: 'Stripe check refused — live key detected',
          body:
            'STRIPE_TEST_KEY is set to a live (sk_live_...) key. This routine is read-only ' +
            'but refuses to run against live mode by policy. Replace with a test key.',
          status: 'needs_review',
          tags: ['stripe', 'auto', 'safety-block'],
        },
        error: 'live_key_blocked',
      }
    }

    const optionalCustomerId =
      (ctx.triggerPayload?.customer_id as string | undefined)?.trim() || undefined

    // No apiVersion override → uses the SDK's pinned default; safest for forward-compat.
    const stripe = new Stripe(env.stripeTestKey)
    const startedAt = Date.now()

    try {
      const account = await stripe.accounts.retrieve()
      const latencyMs = Date.now() - startedAt

      let customerSummary: {
        id: string
        email: string | null
        delinquent: boolean | null
        livemode: boolean
      } | null = null

      if (optionalCustomerId) {
        try {
          const c = await stripe.customers.retrieve(optionalCustomerId)
          if (!('deleted' in c) || !c.deleted) {
            customerSummary = {
              id: c.id,
              email: (c as Stripe.Customer).email ?? null,
              delinquent: (c as Stripe.Customer).delinquent ?? null,
              livemode: c.livemode,
            }
          }
        } catch (custErr) {
          // Customer lookup failure → ambiguous outcome, not total failure.
          return {
            status: 'needs_review',
            result: {
              account_id: account.id,
              account_livemode: account.charges_enabled,
              latency_ms: latencyMs,
              customer_lookup_error:
                custErr instanceof Error ? custErr.message : String(custErr),
            },
            note: {
              title: 'Stripe check — customer lookup failed',
              body:
                `Stripe API is reachable (account ${account.id}, ${latencyMs}ms), but the ` +
                `customer id "${optionalCustomerId}" could not be retrieved. ` +
                `Verify the id and rerun, or resolve manually.`,
              status: 'needs_review',
              tags: ['stripe', 'auto'],
            },
          }
        }
      }

      return {
        status: 'success',
        result: {
          account_id: account.id,
          country: account.country,
          default_currency: account.default_currency,
          charges_enabled: account.charges_enabled,
          latency_ms: latencyMs,
          customer: customerSummary,
        },
        note: {
          title: 'Stripe connection verified',
          body:
            `Routine: stripe.connection.check\n` +
            `Account: ${account.id} (${account.country ?? '?'})\n` +
            `Charges enabled: ${account.charges_enabled}\n` +
            `Latency: ${latencyMs}ms\n` +
            (customerSummary
              ? `Customer ${customerSummary.id} read OK (${customerSummary.email ?? 'no email'}).\n`
              : '') +
            `No write performed.`,
          status: 'resolved',
          tags: ['stripe', 'auto'],
        },
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return {
        status: 'failed',
        result: { error: detail },
        note: {
          title: 'Stripe check failed',
          body:
            `Routine: stripe.connection.check\n` +
            `Result: API call failed.\n` +
            `Detail: ${detail.slice(0, 400)}\n` +
            `No write performed. Check the test key and network.`,
          status: 'needs_review',
          tags: ['stripe', 'auto', 'error'],
        },
        error: detail,
      }
    }
  },
}
