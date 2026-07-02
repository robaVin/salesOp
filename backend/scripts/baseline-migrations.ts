import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'

/**
 * One-time baseline for adopting the ledger on an EXISTING database.
 *
 * Records migrations you've already applied — WITHOUT running them — so the
 * ledger-based `db:migrate` skips them and only applies newer ones.
 *
 *   npm run db:baseline -- 006
 *
 * marks 002…006 as applied (their numeric prefix <= 6). Pass the highest
 * migration number your database already has. A brand-new database does not
 * need this — just run `db:migrate`.
 */
function leadingNumber(filename: string): number {
  const m = filename.match(/^(\d+)/)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(2)
  }
  const uptoArg = process.argv[2]
  if (!uptoArg || Number.isNaN(Number(uptoArg))) {
    console.error(
      'Usage: npm run db:baseline -- <highest-already-applied-number>\n' +
        '  e.g. npm run db:baseline -- 006'
    )
    process.exit(2)
  }
  const upto = Number(uptoArg)

  const dir = path.resolve(__dirname, '../../database/migrations')
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const selected = files.filter((f) => leadingNumber(f) <= upto)
  if (selected.length === 0) {
    console.log(`[baseline] no migration files with number <= ${upto}; nothing to do`)
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
    for (const f of selected) {
      await pool.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
        [f]
      )
      console.log(`[baseline] marked ${f} as applied`)
    }
    console.log(`[baseline] done — ${selected.length} migration(s) recorded. Run db:migrate to apply the rest.`)
  } catch (err) {
    console.error('[baseline] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

void main()
