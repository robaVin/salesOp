import crypto from 'node:crypto'
import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env'
import { query, queryOne } from '../services/db'
import { getOpenAi, isOpenAiConfigured } from '../services/openaiClient'
import { SUMMARIZE_NODE_TYPES, summarizeText } from '../services/aiSummarize'

export const aiRouter = Router()

const summarizeSchema = z.object({
  text: z.string().min(1).max(20_000),
  hint_type: z.enum(SUMMARIZE_NODE_TYPES).optional(),
})

aiRouter.post('/ai/summarize', async (req: Request, res: Response) => {
  const parsed = summarizeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  try {
    const result = await summarizeText({
      workspaceId: req.workspaceId!,
      text: parsed.data.text,
      hintType: parsed.data.hint_type,
    })
    res.json(result)
  } catch (err) {
    console.error('[ai/summarize] failed:', err)
    res
      .status(500)
      .json({ error: 'ai_failed', detail: err instanceof Error ? err.message : String(err) })
  }
})

const draftSchema = z.object({
  channel: z.enum(['email', 'linkedin']),
  source_note_id: z.string().uuid(),
  intent: z.string().max(280).optional(),
})

interface DraftOut {
  draft: string
  subject: string | null
}

function hashInput(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

aiRouter.post('/ai/draft-reply', async (req: Request, res: Response) => {
  const parsed = draftSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', detail: parsed.error.issues })
    return
  }
  const workspaceId = req.workspaceId!
  const source = await queryOne<{
    id: string
    node_type: string
    title: string
    body: string
    tags_json: string[]
  }>(
    `SELECT id, node_type, title, body, tags_json
     FROM canvas_nodes WHERE id = $1 AND workspace_id = $2`,
    [parsed.data.source_note_id, workspaceId]
  )
  if (!source) {
    res.status(404).json({ error: 'source_note_not_found' })
    return
  }

  if (!isOpenAiConfigured()) {
    const fallback: DraftOut = {
      draft:
        parsed.data.channel === 'email'
          ? `Hi — thanks for the conversation. Following up on: ${source.title}.\n\n${source.body.slice(
              0,
              280
            )}\n\nWhat is a good time this week to compare notes?\n\nThanks,\nSales`
          : `Hey — following up on ${source.title}. ${source.body.slice(
              0,
              200
            )} Worth 20 min?`,
      subject: parsed.data.channel === 'email' ? `Re: ${source.title}` : null,
    }
    res.json({ ...fallback, cached: false, mocked: true })
    return
  }

  const hash = hashInput({
    sourceId: source.id,
    title: source.title,
    body: source.body,
    intent: parsed.data.intent ?? '',
    channel: parsed.data.channel,
  })
  const cached = await queryOne<{ output_json: unknown }>(
    `SELECT output_json FROM ai_outputs
     WHERE workspace_id = $1 AND task = $2 AND input_hash = $3`,
    [workspaceId, `draft_${parsed.data.channel}`, hash]
  )
  if (cached) {
    res.json({ ...(cached.output_json as DraftOut), cached: true })
    return
  }

  const system =
    parsed.data.channel === 'email'
      ? `You draft short, plain, founder-tone sales emails. 4-6 sentences. No "I hope this finds you well." No exclamation marks. End with a single specific ask.
Return strict JSON: { "subject": string<=70 chars, "draft": string<=900 chars }.
Never invent factual claims (numbers, dates, names) that aren't in the source.`
      : `You draft short LinkedIn DM replies. 2-4 sentences. Conversational, no jargon, end with a single specific ask.
Return strict JSON: { "subject": null, "draft": string<=500 chars }.
Never invent factual claims that aren't in the source.`

  const userPrompt = [
    `Source note type: ${source.node_type}`,
    `Source title: ${source.title}`,
    `Source body: ${source.body}`,
    parsed.data.intent ? `Caller intent: ${parsed.data.intent}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = getOpenAi()
    const completion = await client.chat.completions.create({
      model: env.openAiModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    const out = JSON.parse(raw) as DraftOut
    if (!out.draft) throw new Error('Bad AI response shape')
    await query(
      `INSERT INTO ai_outputs
         (workspace_id, task, input_hash, model, output_json, prompt_tokens, completion_tokens)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       ON CONFLICT (workspace_id, task, input_hash) DO NOTHING`,
      [
        workspaceId,
        `draft_${parsed.data.channel}`,
        hash,
        env.openAiModel,
        JSON.stringify(out),
        completion.usage?.prompt_tokens ?? null,
        completion.usage?.completion_tokens ?? null,
      ]
    )
    res.json({ ...out, cached: false })
  } catch (err) {
    console.error('[ai/draft-reply] failed:', err)
    res
      .status(500)
      .json({ error: 'ai_failed', detail: err instanceof Error ? err.message : String(err) })
  }
})
