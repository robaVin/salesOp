import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Response } from 'express'
import { env } from '../config/env'

export interface SessionClaims {
  sub: string // user id
  ws: string // workspace id
  role: string
}

const BCRYPT_ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, env.sessionSecret, {
    expiresIn: `${env.sessionTtlDays}d`,
  })
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, env.sessionSecret) as SessionClaims
    if (!decoded.sub || !decoded.ws) return null
    return decoded
  } catch {
    return null
  }
}

export function setSessionCookie(res: Response, token: string): void {
  // SameSite=None so the cookie travels on cross-site requests (the Chrome
  // extension is a separate origin from the canvas). SameSite=None requires
  // Secure. Chrome accepts Secure cookies set over HTTP on localhost during
  // dev, so this works for both dev and production.
  res.cookie(env.sessionCookieName, token, {
    httpOnly: true,
    maxAge: env.sessionTtlDays * 24 * 60 * 60 * 1000,
    sameSite: 'none',
    secure: true,
    path: '/',
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.sessionCookieName, {
    path: '/',
    sameSite: 'none',
    secure: true,
  })
}

// ----- API tokens (for the extension and any future API access) -----
// Plaintext format: `sct_` + 32 random bytes hex (66 chars total).
// Storage: SHA-256 hash of the plaintext. Plaintext is returned ONCE at create.

const TOKEN_PREFIX = 'sct_'

export interface NewApiToken {
  plaintext: string
  hash: string
  prefix: string
}

export function generateApiToken(): NewApiToken {
  const rand = crypto.randomBytes(32).toString('hex')
  const plaintext = TOKEN_PREFIX + rand
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')
  const prefix = plaintext.slice(0, 12) // sct_ + first 8 chars of random
  return { plaintext, hash, prefix }
}

export function hashApiToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && value.length === TOKEN_PREFIX.length + 64
}
