-- One-time bounded conversion queue, including already compressed v1 objects.
ALTER TABLE cloud_objects ADD COLUMN logical_bytes INTEGER;
CREATE TABLE cloud_repack(target TEXT NOT NULL,user_id TEXT NOT NULL,row_key TEXT NOT NULL,PRIMARY KEY(target,user_id,row_key));
CREATE INDEX cloud_repack_owner ON cloud_repack(user_id);
INSERT INTO cloud_repack SELECT 'records',user_id,name FROM records WHERE payload IS NOT NULL;
INSERT INTO cloud_repack SELECT 'shares',COALESCE(owner_id,''),id FROM shares;
INSERT INTO cloud_repack SELECT 'deliveries',COALESCE(sender_id,''),id FROM deliveries;
UPDATE users SET needs_compaction=1 WHERE EXISTS(SELECT 1 FROM cloud_repack WHERE user_id=users.id);
DROP TRIGGER quota_insert;
DROP TRIGGER quota_update;
DROP TRIGGER quota_delete;
CREATE TRIGGER quota_insert AFTER INSERT ON records WHEN NEW.payload IS NOT NULL AND NEW.name NOT LIKE 'f:%' BEGIN
 UPDATE users SET storage_bytes=storage_bytes+CASE WHEN NEW.payload IS NULL OR NEW.name LIKE 'f:%' THEN 0 WHEN substr(NEW.payload,1,5)='@UF1:' THEN COALESCE((SELECT COALESCE(logical_bytes,raw_bytes) FROM cloud_objects WHERE id=substr(NEW.payload,6)),0) ELSE length(CAST(NEW.payload AS BLOB)) END WHERE id=NEW.user_id;
END;
CREATE TRIGGER quota_update AFTER UPDATE OF payload,user_id,name ON records WHEN (OLD.payload IS NOT NEW.payload OR OLD.user_id<>NEW.user_id OR OLD.name<>NEW.name) AND (OLD.name NOT LIKE 'f:%' OR NEW.name NOT LIKE 'f:%') BEGIN
 UPDATE users SET storage_bytes=storage_bytes+CASE WHEN id=NEW.user_id THEN CASE WHEN NEW.payload IS NULL OR NEW.name LIKE 'f:%' THEN 0 WHEN substr(NEW.payload,1,5)='@UF1:' THEN COALESCE((SELECT COALESCE(logical_bytes,raw_bytes) FROM cloud_objects WHERE id=substr(NEW.payload,6)),0) ELSE length(CAST(NEW.payload AS BLOB)) END ELSE 0 END-CASE WHEN id=OLD.user_id THEN CASE WHEN OLD.payload IS NULL OR OLD.name LIKE 'f:%' THEN 0 WHEN substr(OLD.payload,1,5)='@UF1:' THEN COALESCE((SELECT COALESCE(logical_bytes,raw_bytes) FROM cloud_objects WHERE id=substr(OLD.payload,6)),0) ELSE length(CAST(OLD.payload AS BLOB)) END ELSE 0 END WHERE id IN (OLD.user_id,NEW.user_id);
END;
CREATE TRIGGER quota_delete AFTER DELETE ON records WHEN OLD.payload IS NOT NULL AND OLD.name NOT LIKE 'f:%' BEGIN
 UPDATE users SET storage_bytes=storage_bytes-CASE WHEN OLD.payload IS NULL OR OLD.name LIKE 'f:%' THEN 0 WHEN substr(OLD.payload,1,5)='@UF1:' THEN COALESCE((SELECT COALESCE(logical_bytes,raw_bytes) FROM cloud_objects WHERE id=substr(OLD.payload,6)),0) ELSE length(CAST(OLD.payload AS BLOB)) END WHERE id=OLD.user_id;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_records_insert AFTER INSERT ON records
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('records',COALESCE(NEW.user_id,''),NEW.name);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_records_update AFTER UPDATE OF payload ON records
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('records',COALESCE(NEW.user_id,''),NEW.name);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_shares_insert AFTER INSERT ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_shares_update AFTER UPDATE OF payload ON shares
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('shares',COALESCE(NEW.owner_id,''),NEW.id);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_deliveries_insert AFTER INSERT ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;

-- Cover writes from the preceding Worker during deployment, without requeuing v2 writes.
CREATE TRIGGER repack_deliveries_update AFTER UPDATE OF payload ON deliveries
WHEN NEW.payload IS NOT NULL AND (substr(NEW.payload,1,5)<>'@UF1:' OR EXISTS(SELECT 1 FROM cloud_objects WHERE id=substr(NEW.payload,6) AND logical_bytes IS NULL))
BEGIN
 INSERT OR IGNORE INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',COALESCE(NEW.sender_id,''),NEW.id);
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;
