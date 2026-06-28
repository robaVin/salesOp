-- 002_auth.sql — multi-user auth foundation

-- ----- users: password hash + verification + last login -----
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Email becomes the canonical login. Force unique + not null going forward.
-- Existing seed user already has email; safe to require it.
UPDATE users SET email = COALESCE(email, id::text || '@placeholder.local');
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Case-insensitive uniqueness on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- ----- API tokens (for the Chrome extension and any future API access) -----
CREATE TABLE IF NOT EXISTS api_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 of the plaintext; plaintext never stored
  prefix        TEXT NOT NULL,           -- first 8 chars of plaintext, for UI identification
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_workspace ON api_tokens (workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);
