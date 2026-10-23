-- User-authorized reset: every existing account and cloud snapshot is disposable test data.
DELETE FROM connections;
DELETE FROM deliveries;
DELETE FROM shares;
DELETE FROM users;
DELETE FROM attempts;
DELETE FROM rate_limits;
DELETE FROM cloud_repack;
DELETE FROM cloud_edges;
DELETE FROM cloud_chunks;
DELETE FROM cloud_objects;
DROP TABLE cloud_share_repair;
DROP TABLE deliveries;
DROP TABLE shares;
ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT '' CHECK(length(nickname)<=60);
DROP VIEW personal_schedule_exports;
CREATE VIEW personal_schedule_exports AS
SELECT u.id AS owner_id,u.username,u.nickname,
CASE WHEN substr(r.payload,1,5)='@UF1:' THEN json_quote(r.payload) ELSE r.payload END AS payload
FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.name='p:'||u.personal_schedule;
DROP TRIGGER connections_accepted;
DROP TRIGGER connections_revoked;
DROP TRIGGER connections_deleted;
DROP TRIGGER connections_blocked;
DROP TRIGGER live_personal_insert;
DROP TRIGGER live_personal_update;
DROP TRIGGER live_personal_selection;
CREATE TRIGGER connections_accepted
AFTER UPDATE OF status ON connections WHEN NEW.status='accepted' AND OLD.status<>'accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (NEW.requester_id,NEW.recipient_id);
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,json_object('username',src.username,'nickname',src.nickname,'person',json(src.payload)),dest.revision
 FROM users dest JOIN personal_schedule_exports src ON
  (dest.id=NEW.requester_id AND src.owner_id=NEW.recipient_id) OR
  (dest.id=NEW.recipient_id AND src.owner_id=NEW.requester_id)
 WHERE 1
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;
CREATE TRIGGER connections_revoked
AFTER UPDATE OF status ON connections WHEN OLD.status='accepted' AND NEW.status<>'accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (NEW.requester_id,NEW.recipient_id);
 UPDATE records SET payload=NULL,revision=(SELECT revision FROM users WHERE id=records.user_id)
 WHERE (user_id=NEW.requester_id AND name='f:'||NEW.recipient_id) OR (user_id=NEW.recipient_id AND name='f:'||NEW.requester_id);
END;
CREATE TRIGGER connections_deleted
AFTER DELETE ON connections WHEN OLD.status='accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (OLD.requester_id,OLD.recipient_id);
 UPDATE records SET payload=NULL,revision=(SELECT revision FROM users WHERE id=records.user_id)
 WHERE (user_id=OLD.requester_id AND name='f:'||OLD.recipient_id) OR (user_id=OLD.recipient_id AND name='f:'||OLD.requester_id);
END;
CREATE TRIGGER connections_blocked
AFTER INSERT ON blocks BEGIN
 UPDATE connections SET status='removed' WHERE status IN ('pending','accepted') AND
 ((requester_id=NEW.user_id AND recipient_id=NEW.blocked_id) OR (requester_id=NEW.blocked_id AND recipient_id=NEW.user_id));
END;

CREATE TRIGGER live_personal_insert AFTER INSERT ON records WHEN NEW.name='p:'||(SELECT personal_schedule FROM users WHERE id=NEW.user_id) BEGIN

 UPDATE users SET revision=revision+1 WHERE id IN (SELECT CASE WHEN c.requester_id=NEW.user_id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.user_id OR c.recipient_id=NEW.user_id));
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'nickname',src.nickname,'person',json(src.payload)) END,dest.revision
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
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'nickname',src.nickname,'person',json(src.payload)) END,dest.revision
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
   CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'nickname',src.nickname,'person',json(src.payload)) END,dest.revision
 FROM users dest JOIN personal_schedule_exports src ON src.owner_id=NEW.id
 WHERE dest.id IN (SELECT CASE WHEN c.requester_id=NEW.id THEN c.recipient_id ELSE c.requester_id END
 FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.id OR c.recipient_id=NEW.id))
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;

CREATE TRIGGER live_nickname_update AFTER UPDATE OF nickname ON users WHEN OLD.nickname IS NOT NEW.nickname BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (SELECT CASE WHEN c.requester_id=NEW.id THEN c.recipient_id ELSE c.requester_id END FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.id OR c.recipient_id=NEW.id));
 INSERT INTO records(user_id,name,payload,revision)
 SELECT dest.id,'f:'||src.owner_id,CASE WHEN src.payload IS NULL THEN NULL ELSE json_object('username',src.username,'nickname',src.nickname,'person',json(src.payload)) END,dest.revision
 FROM users dest JOIN personal_schedule_exports src ON src.owner_id=NEW.id
 WHERE dest.id IN (SELECT CASE WHEN c.requester_id=NEW.id THEN c.recipient_id ELSE c.requester_id END FROM connections c WHERE c.status='accepted' AND (c.requester_id=NEW.id OR c.recipient_id=NEW.id))
 ON CONFLICT(user_id,name) DO UPDATE SET payload=excluded.payload,revision=excluded.revision;
END;
