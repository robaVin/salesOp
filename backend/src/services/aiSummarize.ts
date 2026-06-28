import crypto from 'node:crypto'
import { env } from '../config/env'
import { query, queryOne } from './db'
import { getOpenAi, isOpenAiConfigured } from './openaiClient'

export const SUMMARIZE_NODE_TYPES = [
  'prospect',
  'account',
  'call_summary',
  'followup',
  'objection',
  'email_draft',
  'linkedin_draft',
  'task',
  'general_note',
] as const

export type SummarizeNodeType = (typeof SUMMARIZE_NODE_TYPES)[number]

export interface SummarizeResult {
  title: string
  body: string
  node_type: SummarizeNodeType
  tags: string[]
  next_step: string | null
  cached: boolean
  mocked: boolean
}

function hashInput(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function getCached(
  workspaceId: string,
  hash: string
): Promise<{ output_json: unknown } | null> {
  return queryOne<{ output_json: unknown }>(
    `SELECT output_json FROM ai_outputs
     WHERE workspace_id = $1 AND task = 'summarize' AND input_hash = $2`,
    [workspaceId, hash]
  )
}

async function setCached(params: {
  workspaceId: string
  hash: string
  output: unknown
  model: string
  promptTokens?: number
  completionTokens?: number
}): Promise<void> {
  await query(
    `INSERT INTO ai_outputs
       (workspace_id, task, input_hash, model, output_json, prompt_tokens, completion_tokens)
     VALUES ($1,'summarize',$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT (workspace_id, task, input_hash) DO NOTHING`,
    [
      params.workspaceId,
      params.hash,
      params.model,
      JSON.stringify(params.output),
      params.promptTokens ?? null,
      params.completionTokens ?? null,
    ]
  )
}

/**
 * Summarize raw text into a typed canvas note. Honest fallback when OpenAI is
 * not configured — never throws on missing key. Cached per workspace per input.
 */
export async function summarizeText(params: {
  workspaceId: string
  text: string
  hintType?: SummarizeNodeType
}): Promise<SummarizeResult> {
  const text = params.text.trim()
  if (text.length === 0) {
    throw new Error('summarize: empty text')
  }

  if (!isOpenAiConfigured()) {
    const title = text.split('\n')[0]?.slice(0, 100) || 'Untitled note'
    return {
      title,
      body: text.slice(0, 1200),
      node_type: params.hintType ?? 'general_note',
      tags: ['no-openai'],
      next_step: null,
      cached: false,
      mocked: true,
    }
  }

  const hash = hashInput({ text, hint: params.hintType })
  const hit = await getCached(params.workspaceId, hash)
  if (hit) {
    return { ...(hit.output_json as Omit<SummarizeResult, 'cached' | 'mocked'>), cached: true, mocked: false }
  }

  const system = `You convert raw text (emails, transcripts, notes) into a structured sales canvas note.
Return strict JSON: { "title": string<=80 chars, "body": string<=600 chars, "node_type": one of ${SUMMARIZE_NODE_TYPES.join(
    ', '
  )}, "tags": string[0..5], "next_step": string|null }.
The body must be plain prose, not bullet points, not markdown.
The title must be specific to the person or topic, not generic.
Pick the node_type honestly from the text; do not default to general_note unless nothing else fits.`

  const userPrompt = params.hintType
    ? `Hint: caller suggested type "${params.hintType}". Use it only if the text supports it.\n\nText:\n${text}`
    : `Text:\n${text}`

  const client = getOpenAi()
  const completion = await client.chat.completions.create({
    model: env.openAiModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as Omit<SummarizeResult, 'cached' | 'mocked'>
  if (!parsed.title || !parsed.body) throw new Error('Bad AI response shape')
  if (!SUMMARIZE_NODE_TYPES.includes(parsed.node_type)) {
    parsed.node_type = 'general_note'
  }
  if (!Array.isArray(parsed.tags)) parsed.tags = []

  await setCached({
    workspaceId: params.workspaceId,
    hash,
    output: parsed,
    model: env.openAiModel,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
  })

  return { ...parsed, cached: false, mocked: false }
}
