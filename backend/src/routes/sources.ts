import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getProvider, listProviders } from '../sources/registry'
import { runProviderSync } from '../services/objectIngest'

/**
 * Universal source management. Adding a new provider = one registry entry.
 * These endpoints stay unchanged for every future source.
 */
export const sourcesRouter = Router()

sourcesRouter.get('/sources', async (req: Request, res: Response) => {
  const ctx = { workspaceId: req.workspaceId!, userId: req.userId! }
  const items = await Promise.all(
    listProviders().map(async (p) => {
      const status = await p.status(ctx).catch(() => null)
      return {
        key: p.key,
        display_name: p.displayName,
        produces_node_type: p.producesNodeType,
        connected: status?.connected ?? false,
        state: status?.state ?? 'not_connected',
        external_account_email: status?.external_account_email ?? null,
        scopes: status?.scopes ?? [],
        last_sync_at: status?.last_sync_at ?? null,
        detail: status?.detail ?? null,
      }
    })
  )
  res.json({ data: items })
})

sourcesRouter.get('/sources/:key/status', async (req: Request, res: Response) => {
  const provider = getProvider(req.params.key)
  if (!provider) {
    res.status(404).json({ error: 'provider_not_found' })
    return
  }
  const status = await provider.status({
    workspaceId: req.workspaceId!,
    userId: req.userId!,
  })
  res.json({
    key: provider.key,
    display_name: provider.displayName,
    produces_node_type: provider.producesNodeType,
    ...status,
  })
})

const syncSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  force_full: z.boolean().optional(),
})

sourcesRouter.post('/sources/:key/sync', async (req: Request, res: Response) => {
  const provider = getProvider(req.params.key)
  if (!provider) {
    res.status(404).json({ error: 'provider_not_found' })
    return
  }
  const parsed = syncSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  try {
    const result = await runProviderSync({
      workspaceId: req.workspaceId!,
      userId: req.userId!,
      provider,
      opts: parsed.data,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({
      error: 'sync_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

sourcesRouter.post('/sources/:key/disconnect', async (req: Request, res: Response) => {
  const provider = getProvider(req.params.key)
  if (!provider) {
    res.status(404).json({ error: 'provider_not_found' })
    return
  }
  try {
    await provider.disconnect({
      workspaceId: req.workspaceId!,
      userId: req.userId!,
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({
      error: 'disconnect_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})
