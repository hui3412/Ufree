-- Three-day idle expiry with an absolute thirty-day lifetime.
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_refreshed_at INTEGER NOT NULL DEFAULT 0;
-- Existing tokens originally had a thirty-day expiry. Preserve that hard end.
UPDATE sessions SET created_at=MAX(0,expires_at-2592000000),last_refreshed_at=CAST(strftime('%s','now') AS INTEGER)*1000;
UPDATE sessions SET expires_at=MIN(expires_at,CAST(strftime('%s','now') AS INTEGER)*1000+259200000);
-- Keep sessions created by the previous Worker during deployment usable under the new policy.
CREATE TRIGGER sessions_default_lifetime AFTER INSERT ON sessions WHEN NEW.created_at=0 BEGIN
 UPDATE sessions SET created_at=MAX(0,MIN(CAST(strftime('%s','now') AS INTEGER)*1000,NEW.expires_at-259200000)),
 last_refreshed_at=CAST(strftime('%s','now') AS INTEGER)*1000,
 expires_at=MIN(NEW.expires_at,CAST(strftime('%s','now') AS INTEGER)*1000+259200000)
 WHERE token_hash=NEW.token_hash;
END;
