-- 003_google_oauth.sql — add Google OAuth columns

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- google_sub is unique when present (one Google account → one user row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

-- password_hash is no longer required if the user logs in via Google.
-- (The login route already handles this — it 401s when the row has no hash.)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
