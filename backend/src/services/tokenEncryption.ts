import crypto from 'node:crypto'
import { env } from '../config/env'

/**
 * Symmetric encryption for OAuth tokens at rest.
 *
 * Format: base64( iv[12] || tag[16] || ciphertext ) — AES-256-GCM.
 * Key: 32 bytes derived from env.tokenEncryptionKey.
 *
 * If TOKEN_ENCRYPTION_KEY is unset, we derive a fallback key from SESSION_SECRET
 * and warn once at boot. Boot refuses the fallback in production (see env.ts).
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let cachedKey: Buffer | null = null
let warnedAboutFallback = false

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.tokenEncryptionKey
  if (raw && raw.length > 0) {
    // Accept base64 OR raw utf-8. Both are hashed to a fixed 32-byte key so
    // any accidental variation in encoding doesn't change the derived key.
    cachedKey = crypto.createHash('sha256').update(raw).digest()
    return cachedKey
  }
  // Dev-only fallback. Prod boot refuses this path via env.ts.
  if (!warnedAboutFallback) {
    console.warn(
      '[tokenEncryption] TOKEN_ENCRYPTION_KEY not set — deriving a fallback key ' +
        'from SESSION_SECRET. Do NOT ship this to production.'
    )
    warnedAboutFallback = true
  }
  cachedKey = crypto.createHash('sha256').update(env.sessionSecret).digest()
  return cachedKey
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string') throw new Error('encrypt: plaintext must be string')
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('decrypt: payload too short')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/** Exported for tests / diagnostics. Does not expose the key. */
export function _resetForTests(): void {
  cachedKey = null
  warnedAboutFallback = false
}
