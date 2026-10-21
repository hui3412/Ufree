-- Mutual personal-schedule sharing. Only a confirmed request and explicit follow-back grant access.
CREATE TABLE IF NOT EXISTS connections (
 id TEXT PRIMARY KEY,
 requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 pair_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','removed')),
 created_at INTEGER NOT NULL,
 CHECK(requester_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS connections_sender ON connections(requester_id,status);
CREATE INDEX IF NOT EXISTS connections_recipient ON connections(recipient_id,status);

-- A strict projection prevents private profile data, school, filenames and arbitrary imported fields from leaking.
CREATE VIEW IF NOT EXISTS personal_schedule_exports AS
SELECT u.id AS owner_id,u.username,
 CASE WHEN r.payload IS NULL THEN NULL ELSE json_patch('{}',json_object(
  'semester',json_extract(r.payload,'$.semester'),
  'classes',json(COALESCE((SELECT json_group_array(json_patch('{}',json_object(
      'day', CASE WHEN json_type(c.value,'$.day')='text' THEN json_extract(c.value,'$.day') ELSE NULL END,
      'start', CASE WHEN json_type(c.value,'$.start')='text' THEN json_extract(c.value,'$.start') ELSE NULL END,
      'end', CASE WHEN json_type(c.value,'$.end')='text' THEN json_extract(c.value,'$.end') ELSE NULL END,
      'course', CASE WHEN json_type(c.value,'$.course')='text' THEN json_extract(c.value,'$.course') ELSE NULL END,
      'course_code', CASE WHEN json_type(c.value,'$.course_code')='text' THEN json_extract(c.value,'$.course_code') ELSE NULL END,
      'section', CASE WHEN json_type(c.value,'$.section')='text' THEN json_extract(c.value,'$.section') ELSE NULL END,
      'room', CASE WHEN json_type(c.value,'$.room')='text' THEN json_extract(c.value,'$.room') ELSE NULL END,
      'instructor', CASE WHEN json_type(c.value,'$.instructor')='text' THEN json_extract(c.value,'$.instructor') ELSE NULL END,
      'kind', CASE WHEN json_type(c.value,'$.kind')='text' THEN json_extract(c.value,'$.kind') ELSE NULL END
    ))) FROM json_each(r.payload,'$.classes') c),'[]'))
 )) END AS payload
FROM users u LEFT JOIN records r ON r.user_id=u.id AND r.name='p:'||u.personal_schedule;

CREATE TRIGGER IF NOT EXISTS connections_guard_insert
BEFORE INSERT ON connections BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM blocks WHERE
   (user_id=NEW.requester_id AND blocked_id=NEW.recipient_id) OR
   (user_id=NEW.recipient_id AND blocked_id=NEW.requester_id)) THEN RAISE(ABORT,'Connection unavailable') END;
 SELECT CASE WHEN
  (SELECT count(*) FROM connections WHERE status IN ('pending','accepted') AND (requester_id=NEW.requester_id OR recipient_id=NEW.requester_id))>=100 OR
  (SELECT count(*) FROM connections WHERE status IN ('pending','accepted') AND (requester_id=NEW.recipient_id OR recipient_id=NEW.recipient_id))>=100
 THEN RAISE(ABORT,'Connection limit reached') END;
END;
CREATE TRIGGER IF NOT EXISTS connections_guard_update
BEFORE UPDATE OF status ON connections WHEN NEW.status IN ('pending','accepted') BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM blocks WHERE
   (user_id=NEW.requester_id AND blocked_id=NEW.recipient_id) OR
   (user_id=NEW.recipient_id AND blocked_id=NEW.requester_id)) THEN RAISE(ABORT,'Connection unavailable') END;
 SELECT CASE WHEN NEW.status='accepted' AND
  (SELECT count(*) FROM personal_schedule_exports WHERE owner_id IN (NEW.requester_id,NEW.recipient_id) AND payload IS NOT NULL)<>2
 THEN RAISE(ABORT,'Personal schedule required') END;
 SELECT CASE WHEN OLD.status NOT IN ('pending','accepted') AND (
  (SELECT count(*) FROM connections WHERE status IN ('pending','accepted') AND (requester_id=NEW.requester_id OR recipient_id=NEW.requester_id))>=100 OR
  (SELECT count(*) FROM connections WHERE status IN ('pending','accepted') AND (requester_id=NEW.recipient_id OR recipient_id=NEW.recipient_id))>=100)
 THEN RAISE(ABORT,'Connection limit reached') END;
END;

CREATE TRIGGER IF NOT EXISTS connections_accepted
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
CREATE TRIGGER IF NOT EXISTS connections_revoked
AFTER UPDATE OF status ON connections WHEN OLD.status='accepted' AND NEW.status<>'accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (NEW.requester_id,NEW.recipient_id);
 UPDATE records SET payload=NULL,revision=(SELECT revision FROM users WHERE id=records.user_id)
 WHERE (user_id=NEW.requester_id AND name='f:'||NEW.recipient_id) OR (user_id=NEW.recipient_id AND name='f:'||NEW.requester_id);
END;
CREATE TRIGGER IF NOT EXISTS connections_deleted
AFTER DELETE ON connections WHEN OLD.status='accepted' BEGIN
 UPDATE users SET revision=revision+1 WHERE id IN (OLD.requester_id,OLD.recipient_id);
 UPDATE records SET payload=NULL,revision=(SELECT revision FROM users WHERE id=records.user_id)
 WHERE (user_id=OLD.requester_id AND name='f:'||OLD.recipient_id) OR (user_id=OLD.recipient_id AND name='f:'||OLD.requester_id);
END;
CREATE TRIGGER IF NOT EXISTS connections_blocked
AFTER INSERT ON blocks BEGIN
 UPDATE connections SET status='removed' WHERE status IN ('pending','accepted') AND
 ((requester_id=NEW.user_id AND recipient_id=NEW.blocked_id) OR (requester_id=NEW.blocked_id AND recipient_id=NEW.user_id));
END;

CREATE TRIGGER IF NOT EXISTS live_personal_insert AFTER INSERT ON records WHEN NEW.name='p:'||(SELECT personal_schedule FROM users WHERE id=NEW.user_id) BEGIN

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

CREATE TRIGGER IF NOT EXISTS live_personal_update AFTER UPDATE ON records WHEN NEW.name='p:'||(SELECT personal_schedule FROM users WHERE id=NEW.user_id) AND OLD.payload IS NOT NEW.payload BEGIN

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

CREATE TRIGGER IF NOT EXISTS live_personal_selection AFTER UPDATE OF personal_schedule ON users WHEN OLD.personal_schedule<>NEW.personal_schedule BEGIN

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
