import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { aiRouter } from './routes/ai'
import { apiTokensRouter } from './routes/apiTokens'
import { auditRouter } from './routes/audit'
import { authRouter } from './routes/auth'
import { automationsRouter } from './routes/automations'
import { captureRouter } from './routes/capture'
import { gmailRouter } from './routes/gmail'
import { notesRouter } from './routes/notes'
import { sourcesRouter } from './routes/sources'
import { statsRouter } from './routes/stats'
import { healthCheck } from './services/db'
import { attachAuth, requireAuth } from './middleware/requireAuth'

const app = express()

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

const allowedOrigins = env.dashboardOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      if (origin.startsWith('chrome-extension://')) return callback(null, true)
      if (origin.startsWith('moz-extension://')) return callback(null, true)
      callback(new Error(`Not allowed by CORS: ${origin}`))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '8mb' }))
app.use(cookieParser())
app.use(attachAuth)

// ----- public routes -----
app.get('/health', async (_req, res) => {
  const db = await healthCheck()
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    db,
    openai_configured: Boolean(env.openAiApiKey),
    stripe_configured: Boolean(env.stripeTestKey),
  })
})

app.use('/api', authRouter) // signup / login / logout / me

// Capture has its own auth logic (handles the dev no-auth fallback inside the
// route), so it mounts before the requireAuth gate. Everything else is gated.
app.use('/api', captureRouter)

// Gmail OAuth: prepare needs auth (checked inside), callback intentionally
// does NOT (state JWT carries user_id — session cookie is not sent on the
// top-level GET back from Google). Mount before requireAuth so callback works.
app.use('/api', gmailRouter)

// ----- protected routes (require an authenticated user) -----
app.use('/api', requireAuth)
app.use('/api', notesRouter)
app.use('/api', statsRouter)
app.use('/api', aiRouter)
app.use('/api', automationsRouter)
app.use('/api', auditRouter)
app.use('/api', apiTokensRouter)
app.use('/api', sourcesRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

app.listen(env.port, () => {
  console.log(`[server] sales-canvas backend listening on :${env.port}`)
})
