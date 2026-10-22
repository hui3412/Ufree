DROP TRIGGER repack_records_insert;

DROP TRIGGER repack_records_update;

DROP TRIGGER repack_shares_insert;

DROP TRIGGER repack_shares_update;

DROP TRIGGER repack_deliveries_insert;

DROP TRIGGER repack_deliveries_update;
-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_records_insert AFTER INSERT ON records
WHEN NEW.payload IS NOT NULL AND CASE WHEN NEW.name LIKE 'f:%' AND json_valid(NEW.payload) THEN substr(json_extract(NEW.payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('records',COALESCE(NEW.user_id,''),NEW.name) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_records_update AFTER UPDATE OF payload ON records
WHEN NEW.payload IS NOT NULL AND CASE WHEN NEW.name LIKE 'f:%' AND json_valid(NEW.payload) THEN substr(json_extract(NEW.payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('records',COALESCE(NEW.user_id,''),NEW.name) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_shares_insert AFTER INSERT ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_shares_update AFTER UPDATE OF payload ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_deliveries_insert AFTER INSERT ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_deliveries_update AFTER UPDATE OF payload ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id) ON CONFLICT(target,user_id,row_key) DO NOTHING;
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

-- Live shares reference the full source directly. Account profiles remain separate.
DROP VIEW personal_schedule_exports;
CREATE VIEW personal_schedule_exports AS
SELECT u.id AS owner_id,u.username,
 CASE WHEN substr(r.payload,1,5)='@UF1:' THEN json_quote(r.payload) ELSE r.payload END AS payload
FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.name='p:'||u.personal_schedule;

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

-- Drop only obsolete projection edges. Old bytes remain protected by the normal GC lease.
DELETE FROM cloud_edges WHERE EXISTS(SELECT 1 FROM cloud_objects o WHERE o.id=parent_id AND o.personal_id=child_id AND o.id<>o.personal_id);
UPDATE cloud_objects SET personal_id=NULL WHERE personal_id IS NOT NULL;

CREATE TABLE cloud_share_repair(target TEXT NOT NULL,row_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',recovered INTEGER NOT NULL DEFAULT 0,unresolved INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(target,row_key));
CREATE INDEX cloud_share_repair_pending ON cloud_share_repair(status);
INSERT INTO cloud_share_repair(target,row_key) SELECT 'shares',id FROM shares;
INSERT INTO cloud_share_repair(target,row_key) SELECT 'deliveries',id FROM deliveries;

