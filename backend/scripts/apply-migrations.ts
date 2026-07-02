import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'

/**
 * Ledger-based migration runner.
 *
 * Each applied migration is recorded in `schema_migrations`; subsequent runs
 * skip anything already recorded. This replaces the previous "re-run every file
 * every time" behaviour, which broke once data existed: re-applying an early
 * migration that DROP/ADDs the node_type CHECK to a narrower list violates rows
 * added by later migrations (email, zones).
 *
 * Adopting the ledger on an EXISTING database: run `npm run db:baseline -- <n>`
 * once first (e.g. `-- 006`) to record migrations you've already applied. A
 * brand-new database needs no baseline — it applies every migration in order.
 */
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(2)
  }
  const dir = path.resolve(__dirname, '../../database/migrations')
  if (!fs.existsSync(dir)) {
    console.log('[migrate] no migrations directory; nothing to apply')
    process.exit(0)
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (files.length === 0) {
    console.log('[migrate] no migration files')
    process.exit(0)
  }

  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    )
    const appliedRes = await pool.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations`
    )
    const applied = new Set(appliedRes.rows.map((r) => r.filename))

    let count = 0
    for (const f of files) {
      if (applied.has(f)) {
        console.log(`[migrate] skip ${f} (already applied)`)
        continue
      }
      const sql = fs.readFileSync(path.join(dir, f), 'utf8')
      console.log(`[migrate] applying ${f}…`)
      // A multi-statement SQL string runs as a single implicit transaction in
      // the simple query protocol, so a failing migration rolls back whole.
      await pool.query(sql)
      await pool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
        [f]
      )
      count += 1
    }
    console.log(
      count === 0
        ? '[migrate] up to date; nothing to apply'
        : `[migrate] applied ${count} migration(s) OK`
    )
  } catch (err) {
    console.error('[migrate] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

void main()
