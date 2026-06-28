import OpenAI from 'openai'
import { env } from '../config/env'

let cached: OpenAI | null = null

export function getOpenAi(): OpenAI {
  if (!env.openAiApiKey) {
    throw new Error('OPENAI_API_KEY not set')
  }
  if (!cached) {
    cached = new OpenAI({ apiKey: env.openAiApiKey })
  }
  return cached
}

export function isOpenAiConfigured(): boolean {
  return Boolean(env.openAiApiKey)
}
