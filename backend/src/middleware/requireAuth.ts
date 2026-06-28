import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env'
import { hashApiToken, looksLikeApiToken, verifySession } from '../services/auth'
import { query, queryOne } from '../services/db'

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string
    workspaceId?: string
    role?: string
    authVia?: 'cookie' | 'token'
    apiTokenId?: string
  }
}

interface ApiTokenRow {
  id: string
  workspace_id: string
  user_id: string
  revoked_at: Date | null
}

interface UserSnapshot {
  id: string
  workspace_id: string
  role: string
}

/**
 * Attach user + workspace context if a valid session cookie OR Bearer API token
 * is present. Never blocks. Pair with requireAuth() to enforce.
 */
export async function attachAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Bearer API token (Authorization: Bearer sct_…)
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const plain = authHeader.slice(7).trim()
    if (looksLikeApiToken(plain)) {
      const tokenRow = await queryOne<ApiTokenRow>(
        `SELECT id, workspace_id, user_id, revoked_at
         FROM api_tokens WHERE token_hash = $1 LIMIT 1`,
        [hashApiToken(plain)]
      )
      if (tokenRow && !tokenRow.revoked_at) {
        const userRow = await queryOne<UserSnapshot>(
          `SELECT id, workspace_id, role FROM users WHERE id = $1`,
          [tokenRow.user_id]
        )
        if (userRow && userRow.workspace_id === tokenRow.workspace_id) {
          req.userId = userRow.id
          req.workspaceId = userRow.workspace_id
          req.role = userRow.role
          req.authVia = 'token'
          req.apiTokenId = tokenRow.id
          // Update last_used_at lazily — not awaited.
          void query(`UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1`, [
            tokenRow.id,
          ])
          next()
          return
        }
      }
    }
  }

  // 2. Session cookie
  const token = req.cookies?.[env.sessionCookieName]
  if (token && typeof token === 'string') {
    const claims = verifySession(token)
    if (claims) {
      req.userId = claims.sub
      req.workspaceId = claims.ws
      req.role = claims.role
      req.authVia = 'cookie'
    }
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId || !req.workspaceId) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  next()
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userId || !req.workspaceId) {
      res.status(401).json({ error: 'unauthenticated' })
      return
    }
    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    next()
  }
}
