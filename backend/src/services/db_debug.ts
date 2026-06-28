const dbUrl = new URL(process.env.DATABASE_URL!)

console.log('[db-debug]', {
  host: dbUrl.host,
  user: dbUrl.username,
  database: dbUrl.pathname,
})