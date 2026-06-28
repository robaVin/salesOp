import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set in backend/.env')
    process.exit(2)
  }
  const file = path.resolve(__dirname, '../../database/schema.sql')
  const sql = fs.readFileSync(file, 'utf8')
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(sql)
    console.log('[schema] applied OK')
  } catch (err) {
    console.error('[schema] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

void main()
