-- Delete only the departing account's ownership and connections. Compressed
-- objects remain immutable and are reclaimed only by lease-aware reachability GC.
CREATE INDEX IF NOT EXISTS shares_owner ON shares(owner_id);
CREATE INDEX IF NOT EXISTS deliveries_sender ON deliveries(sender_id);
CREATE INDEX IF NOT EXISTS records_follow_owner ON records(name,user_id) WHERE name LIKE 'f:%';

CREATE TRIGGER users_delete_cleanup BEFORE DELETE ON users BEGIN
 DELETE FROM cloud_share_repair
 WHERE (target='shares' AND row_key IN (SELECT id FROM shares WHERE owner_id=OLD.id))
    OR (target='deliveries' AND row_key IN (SELECT id FROM deliveries WHERE sender_id=OLD.id OR recipient_id=OLD.id));
 DELETE FROM cloud_repack
 WHERE user_id=OLD.id
    OR (target='records' AND row_key='f:'||OLD.id)
    OR (target='shares' AND row_key IN (SELECT id FROM shares WHERE owner_id=OLD.id))
    OR (target='deliveries' AND row_key IN (SELECT id FROM deliveries WHERE sender_id=OLD.id OR recipient_id=OLD.id));
 -- Shares use ON DELETE SET NULL: remove owned links before that loses ownership.
 DELETE FROM shares WHERE owner_id=OLD.id;
 DELETE FROM deliveries WHERE sender_id=OLD.id OR recipient_id=OLD.id;
 -- Revoke while both users still exist so peers receive revisioned tombstones.
 DELETE FROM connections WHERE requester_id=OLD.id OR recipient_id=OLD.id;
 -- Also remove any legacy live entry no longer backed by a connection.
 UPDATE users SET revision=revision+1 WHERE id<>OLD.id AND id IN
  (SELECT user_id FROM records WHERE name LIKE 'f:%' AND name='f:'||OLD.id AND payload IS NOT NULL);
 UPDATE records SET payload=NULL,revision=(SELECT revision FROM users WHERE id=records.user_id)
 WHERE name LIKE 'f:%' AND name='f:'||OLD.id AND user_id<>OLD.id AND payload IS NOT NULL;
 DELETE FROM attempts WHERE key IN ('login:'||OLD.username,'password:'||OLD.id,'delete:'||OLD.id);
 DELETE FROM rate_limits WHERE key IN ('shares:'||OLD.id,'lookup:'||OLD.id,'send:'||OLD.id,'search:'||OLD.id,'follow:'||OLD.id);
 -- Sessions, owned records and blocks are removed by their foreign-key cascades.
END;
