-- Incremental logical quota and lightweight inbox change detection.
ALTER TABLE users ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0 CHECK(storage_bytes>=0);
ALTER TABLE users ADD COLUMN inbox_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN needs_compaction INTEGER NOT NULL DEFAULT 0;
UPDATE users SET storage_bytes=COALESCE((SELECT SUM(CASE WHEN r.payload IS NULL OR r.name LIKE 'f:%' THEN 0 WHEN substr(r.payload,1,5)='@UF1:' THEN COALESCE((SELECT raw_bytes FROM cloud_objects WHERE id=substr(r.payload,6)),0) ELSE length(CAST(r.payload AS BLOB)) END) FROM records r WHERE r.user_id=users.id),0);
UPDATE users SET inbox_revision=1 WHERE EXISTS(SELECT 1 FROM deliveries d WHERE d.recipient_id=users.id AND d.status='pending') OR EXISTS(SELECT 1 FROM connections c WHERE c.recipient_id=users.id AND c.status='pending');
CREATE TRIGGER quota_insert AFTER INSERT ON records WHEN NEW.payload IS NOT NULL AND NEW.name NOT LIKE 'f:%' BEGIN
 UPDATE users SET storage_bytes=storage_bytes+CASE WHEN NEW.payload IS NULL OR NEW.name LIKE 'f:%' THEN 0 WHEN substr(NEW.payload,1,5)='@UF1:' THEN COALESCE((SELECT raw_bytes FROM cloud_objects WHERE id=substr(NEW.payload,6)),0) ELSE length(CAST(NEW.payload AS BLOB)) END WHERE id=NEW.user_id;
END;
CREATE TRIGGER quota_update AFTER UPDATE OF payload,user_id,name ON records WHEN (OLD.payload IS NOT NEW.payload OR OLD.user_id<>NEW.user_id OR OLD.name<>NEW.name) AND (OLD.name NOT LIKE 'f:%' OR NEW.name NOT LIKE 'f:%') BEGIN
 UPDATE users SET storage_bytes=storage_bytes+CASE WHEN id=NEW.user_id THEN CASE WHEN NEW.payload IS NULL OR NEW.name LIKE 'f:%' THEN 0 WHEN substr(NEW.payload,1,5)='@UF1:' THEN COALESCE((SELECT raw_bytes FROM cloud_objects WHERE id=substr(NEW.payload,6)),0) ELSE length(CAST(NEW.payload AS BLOB)) END ELSE 0 END-CASE WHEN id=OLD.user_id THEN CASE WHEN OLD.payload IS NULL OR OLD.name LIKE 'f:%' THEN 0 WHEN substr(OLD.payload,1,5)='@UF1:' THEN COALESCE((SELECT raw_bytes FROM cloud_objects WHERE id=substr(OLD.payload,6)),0) ELSE length(CAST(OLD.payload AS BLOB)) END ELSE 0 END WHERE id IN (OLD.user_id,NEW.user_id);
END;
CREATE TRIGGER quota_delete AFTER DELETE ON records WHEN OLD.payload IS NOT NULL AND OLD.name NOT LIKE 'f:%' BEGIN
 UPDATE users SET storage_bytes=storage_bytes-CASE WHEN OLD.payload IS NULL OR OLD.name LIKE 'f:%' THEN 0 WHEN substr(OLD.payload,1,5)='@UF1:' THEN COALESCE((SELECT raw_bytes FROM cloud_objects WHERE id=substr(OLD.payload,6)),0) ELSE length(CAST(OLD.payload AS BLOB)) END WHERE id=OLD.user_id;
END;
CREATE TRIGGER inbox_delivery_insert AFTER INSERT ON deliveries WHEN NEW.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=NEW.recipient_id;
END;
CREATE TRIGGER inbox_delivery_update AFTER UPDATE OF status ON deliveries WHEN OLD.status<>NEW.status BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=NEW.recipient_id;
END;
CREATE TRIGGER inbox_delivery_delete AFTER DELETE ON deliveries WHEN OLD.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=OLD.recipient_id;
END;
CREATE TRIGGER inbox_follow_insert AFTER INSERT ON connections WHEN NEW.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=NEW.recipient_id;
END;
CREATE TRIGGER inbox_follow_update AFTER UPDATE OF status,recipient_id ON connections WHEN (OLD.status='pending' OR NEW.status='pending') AND (OLD.status<>NEW.status OR OLD.recipient_id<>NEW.recipient_id) BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id IN (OLD.recipient_id,NEW.recipient_id);
END;
CREATE TRIGGER inbox_follow_delete AFTER DELETE ON connections WHEN OLD.status='pending' BEGIN
 UPDATE users SET inbox_revision=inbox_revision+1 WHERE id=OLD.recipient_id;
END;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX rate_limits_expiry ON rate_limits(window);
CREATE INDEX deliveries_pending_order ON deliveries(recipient_id,status,created_at);
CREATE INDEX connections_pending_order ON connections(recipient_id,status,created_at);

UPDATE users SET needs_compaction=1 WHERE
 EXISTS(SELECT 1 FROM records WHERE user_id=users.id AND payload IS NOT NULL AND substr(payload,1,5)<>'@UF1:' AND CASE WHEN name LIKE 'f:%' AND json_valid(payload) THEN substr(json_extract(payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END)
 OR EXISTS(SELECT 1 FROM shares WHERE owner_id=users.id AND substr(payload,1,5)<>'@UF1:')
 OR EXISTS(SELECT 1 FROM deliveries WHERE sender_id=users.id AND substr(payload,1,5)<>'@UF1:');
CREATE TRIGGER legacy_record_insert AFTER INSERT ON records WHEN NEW.payload IS NOT NULL AND substr(NEW.payload,1,5)<>'@UF1:' AND CASE WHEN NEW.name LIKE 'f:%' AND json_valid(NEW.payload) THEN substr(json_extract(NEW.payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;
CREATE TRIGGER legacy_shares_insert AFTER INSERT ON shares WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;
CREATE TRIGGER legacy_deliveries_insert AFTER INSERT ON deliveries WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;
CREATE TRIGGER legacy_record_update AFTER UPDATE OF payload ON records WHEN NEW.payload IS NOT NULL AND substr(NEW.payload,1,5)<>'@UF1:' AND CASE WHEN NEW.name LIKE 'f:%' AND json_valid(NEW.payload) THEN substr(json_extract(NEW.payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.user_id AND needs_compaction=0;
END;
CREATE TRIGGER legacy_shares_update AFTER UPDATE OF payload ON shares WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.owner_id AND needs_compaction=0;
END;
CREATE TRIGGER legacy_deliveries_update AFTER UPDATE OF payload ON deliveries WHEN substr(NEW.payload,1,5)<>'@UF1:' BEGIN
 UPDATE users SET needs_compaction=1 WHERE id=NEW.sender_id AND needs_compaction=0;
END;
