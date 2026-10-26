-- Count only uploaded schedules, not preferences, tombstones or live friend references.
CREATE TRIGGER cloud_schedule_limit_insert BEFORE INSERT ON records
WHEN NEW.name GLOB 'p:*' AND NEW.payload IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM records WHERE user_id=NEW.user_id AND name=NEW.name AND payload IS NOT NULL)
 AND (SELECT COUNT(*) FROM records WHERE user_id=NEW.user_id AND name GLOB 'p:*' AND payload IS NOT NULL)>=100
BEGIN SELECT RAISE(ABORT,'Cloud schedule limit reached.'); END;
CREATE TRIGGER cloud_schedule_limit_update BEFORE UPDATE OF payload ON records
WHEN NEW.name GLOB 'p:*' AND NEW.payload IS NOT NULL AND OLD.payload IS NULL
 AND (SELECT COUNT(*) FROM records WHERE user_id=NEW.user_id AND name GLOB 'p:*' AND payload IS NOT NULL)>=100
BEGIN SELECT RAISE(ABORT,'Cloud schedule limit reached.'); END;
