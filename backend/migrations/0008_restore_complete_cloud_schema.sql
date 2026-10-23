-- Restore compatibility with d9362a8 after the attached-account schema (0007).

-- Preserve all existing accounts, records and immutable cloud objects.

-- Also safe on a fresh database containing migrations 0001 through 0006.

CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, sender_name TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending');

CREATE TABLE IF NOT EXISTS cloud_share_repair(target TEXT NOT NULL,row_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',recovered INTEGER NOT NULL DEFAULT 0,unresolved INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(target,row_key));

CREATE INDEX IF NOT EXISTS shares_expiry ON shares(expires_at);

CREATE INDEX IF NOT EXISTS delivery_inbox ON deliveries(recipient_id,status);

CREATE INDEX IF NOT EXISTS cloud_legacy_shares ON shares(owner_id) WHERE substr(payload,1,5)<>'@UF1:';

CREATE INDEX IF NOT EXISTS cloud_legacy_deliveries ON deliveries(sender_id) WHERE substr(payload,1,5)<>'@UF1:';

CREATE INDEX IF NOT EXISTS deliveries_pending_order ON deliveries(recipient_id,status,created_at);

CREATE INDEX IF NOT EXISTS cloud_share_repair_pending ON cloud_share_repair(status);

DROP TRIGGER IF EXISTS live_nickname_update;

DROP TRIGGER IF EXISTS connections_accepted;

DROP TRIGGER IF EXISTS live_personal_insert;

DROP TRIGGER IF EXISTS live_personal_update;

DROP TRIGGER IF EXISTS live_personal_selection;

DROP VIEW IF EXISTS personal_schedule_exports;

CREATE VIEW personal_schedule_exports AS
SELECT u.id AS owner_id,u.username,
 CASE WHEN substr(r.payload,1,5)='@UF1:' THEN json_quote(r.payload) ELSE r.payload END AS payload
FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.name='p:'||u.personal_schedule;

CREATE TRIGGER connections_accepted
AFTER UPDATE OF status ON connections WHEN NEW.status='accepted' AND OLD.status<>'accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (NEW.requester_id,NEW.recipient_id);
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,json_object('username',src.username,'person',json(src.payload)),dest.revision
 FROM users dest JOIN personal_schedule_exports src ON
  (dest.id=NEW.requester_id AND src.owner_id=NEW.recipient_id) OR
  (dest.id=NEW.recipient_id AND src.owner_id=NEW.requester_id)
 WHERE 1
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;

CREATE TRIGGER live_personal_insert AFTER INSERT ON records WHEN NEW.name='p:'||(SELECT personal_schedule FROM users WHERE id=NEW.user_id) BEGIN

 UPDATE users SET revision=revision+1 WHERE id IN (SELECT CASE WHEN c.requester_id=NEW.user_id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.user_id OR c.recipient_id=NEW.user_id));
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'person',json(src.payload)) END,dest.revision
 FROM users dest JOIN personal_schedule_exports src ON src.owner_id=NEW.user_id
 WHERE dest.id IN (SELECT CASE WHEN c.requester_id=NEW.user_id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.user_id OR c.recipient_id=NEW.user_id))
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;

CREATE TRIGGER live_personal_update AFTER UPDATE ON records WHEN NEW.name='p:'||(SELECT personal_schedule FROM users WHERE id=NEW.user_id) AND OLD.payload IS NOT NEW.payload BEGIN

 UPDATE users SET revision=revision+1 WHERE id IN (SELECT CASE WHEN c.requester_id=NEW.user_id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.user_id OR c.recipient_id=NEW.user_id));
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'person',json(src.payload)) END,dest.revision
 FROM users dest JOIN personal_schedule_exports src ON src.owner_id=NEW.user_id
 WHERE dest.id IN (SELECT CASE WHEN c.requester_id=NEW.user_id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.user_id OR c.recipient_id=NEW.user_id))
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;

CREATE TRIGGER live_personal_selection AFTER UPDATE OF personal_schedule ON users WHEN OLD.personal_schedule<>NEW.personal_schedule BEGIN

 UPDATE users SET revision=revision+1 WHERE id IN (SELECT CASE WHEN c.requester_id=NEW.id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.id OR c.recipient_id=NEW.id));
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'person',json(src.payload)) END,dest.revision
 FROM users dest JOIN personal_schedule_exports src ON src.owner_id=NEW.id
 WHERE dest.id IN (SELECT CASE WHEN c.requester_id=NEW.id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.id OR c.recipient_id=NEW.id))
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;

DROP TRIGGER IF EXISTS inbox_delivery_insert;

CREATE TRIGGER inbox_delivery_insert AFTER INSERT ON deliveries WHEN NEW.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=NEW.recipient_id;
END;

DROP TRIGGER IF EXISTS inbox_delivery_update;

CREATE TRIGGER inbox_delivery_update AFTER UPDATE OF status ON deliveries WHEN OLD.status<>NEW.status BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=NEW.recipient_id;
END;

DROP TRIGGER IF EXISTS inbox_delivery_delete;

CREATE TRIGGER inbox_delivery_delete AFTER DELETE ON deliveries WHEN OLD.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=OLD.recipient_id;
END;

DROP TRIGGER IF EXISTS legacy_shares_insert;

CREATE TRIGGER legacy_shares_insert AFTER INSERT ON shares WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS legacy_deliveries_insert;

CREATE TRIGGER legacy_deliveries_insert AFTER INSERT ON deliveries WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS legacy_shares_update;

CREATE TRIGGER legacy_shares_update AFTER UPDATE OF payload ON shares WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS legacy_deliveries_update;

CREATE TRIGGER legacy_deliveries_update AFTER UPDATE OF payload ON deliveries WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS repack_shares_insert;

CREATE TRIGGER repack_shares_insert AFTER INSERT ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS repack_shares_update;

CREATE TRIGGER repack_shares_update AFTER UPDATE OF payload ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS repack_deliveries_insert;

CREATE TRIGGER repack_deliveries_insert AFTER INSERT ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

DROP TRIGGER IF EXISTS repack_deliveries_update;

CREATE TRIGGER repack_deliveries_update AFTER UPDATE OF payload ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

-- Refresh only mutually accepted live grants. Increment recipient revisions so browsers receive the full value.
UPDATE users SET revision=revision+1 WHERE id IN (
 SELECT requester_id FROM connections WHERE status='accepted'
 UNION SELECT recipient_id FROM connections WHERE status='accepted');
INSERT INTO records(user_id,name,payload,revision)
SELECT dest.id,'f:'||src.owner_id,
 CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'person',json(src.payload)) END,dest.revision
FROM (SELECT requester_id AS viewer,recipient_id AS source FROM connections WHERE status='accepted'
 UNION SELECT recipient_id,requester_id FROM connections WHERE status='accepted') grants
JOIN users dest ON dest.id=grants.viewer
JOIN personal_schedule_exports src ON src.owner_id=grants.source
WHERE 1
ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;

INSERT INTO cloud_share_repair(target,row_key) SELECT 'shares',id FROM shares WHERE 1 ON CONFLICT(target,row_key) DO NOTHING;

INSERT INTO cloud_share_repair(target,row_key) SELECT 'deliveries',id FROM deliveries WHERE 1 ON CONFLICT(target,row_key) DO NOTHING;
