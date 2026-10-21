-- Additive: old JSON remains readable until safely compacted by the new Worker.
CREATE TABLE cloud_objects (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('json','collection')),
 codec TEXT NOT NULL CHECK(codec IN ('json','deflate-raw')),
 raw_bytes INTEGER NOT NULL CHECK(raw_bytes>=0 AND raw_bytes<=3145728),
 stored_bytes INTEGER NOT NULL CHECK(stored_bytes>=0 AND stored_bytes<=3145728),
 data BLOB, personal_id TEXT, last_used INTEGER NOT NULL
);
CREATE TABLE cloud_chunks (object_id TEXT NOT NULL REFERENCES cloud_objects(id) ON DELETE CASCADE,part INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(object_id,part));
CREATE TABLE cloud_edges (parent_id TEXT NOT NULL REFERENCES cloud_objects(id) ON DELETE CASCADE,child_id TEXT NOT NULL,PRIMARY KEY(parent_id,child_id));
CREATE INDEX cloud_edges_child ON cloud_edges(child_id);
CREATE INDEX cloud_objects_lease ON cloud_objects(last_used);
DROP VIEW personal_schedule_exports;
CREATE VIEW personal_schedule_exports AS
SELECT u.id AS owner_id,u.username,
 CASE WHEN r.payload IS NULL THEN NULL WHEN substr(r.payload,1,5)='@UF1:' THEN (SELECT json_quote('@UF1:'||o.personal_id) FROM cloud_objects o WHERE o.id=substr(r.payload,6) AND o.personal_id IS NOT NULL) ELSE json_patch('{}',json_object(
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


-- Only rows still needing conversion enter these temporary-work indexes.
CREATE INDEX cloud_legacy_records ON records(user_id,name) WHERE payload IS NOT NULL AND substr(payload,1,5)<>'@UF1:' AND CASE WHEN name LIKE 'f:%' AND json_valid(payload) THEN substr(json_extract(payload,'$.person'),1,5) IS NOT '@UF1:' ELSE 1 END;
CREATE INDEX cloud_legacy_shares ON shares(owner_id) WHERE substr(payload,1,5)<>'@UF1:';
CREATE INDEX cloud_legacy_deliveries ON deliveries(sender_id) WHERE substr(payload,1,5)<>'@UF1:';
