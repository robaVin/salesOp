import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'

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
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8')
      console.log(`[migrate] applying ${f}…`)
      await pool.query(sql)
    }
    console.log('[migrate] all migrations applied OK')
  } catch (err) {
    console.error('[migrate] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

void main()
