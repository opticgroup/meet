-- Migration: Add DMR-style multi-talkgroup support
-- This migration extends the existing talkgroup system to support
-- priority-based audio ducking similar to Motorola DMR radios

-- 1. Add new columns to existing talkgroups table
ALTER TABLE talkgroups ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'dynamic' CHECK (type IN ('static-priority', 'static-secondary', 'dynamic', 'adhoc'));
ALTER TABLE talkgroups ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50;
ALTER TABLE talkgroups ADD COLUMN IF NOT EXISTS hold_time_seconds INTEGER DEFAULT 3;
ALTER TABLE talkgroups ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES talkgroups(id);
ALTER TABLE talkgroups ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL; -- For adhoc groups

-- Add index on type and priority for efficient querying
CREATE INDEX IF NOT EXISTS idx_talkgroups_type_priority ON talkgroups(type, priority DESC);
CREATE INDEX IF NOT EXISTS idx_talkgroups_parent ON talkgroups(parent_id) WHERE parent_id IS NOT NULL;

-- 2. Create user_talkgroup_settings table for per-user preferences
CREATE TABLE IF NOT EXISTS user_talkgroup_settings (
    user_id INTEGER NOT NULL,
    talkgroup_id INTEGER NOT NULL,
    is_muted BOOLEAN DEFAULT FALSE,
    volume REAL DEFAULT 1.0 CHECK (volume >= 0.0 AND volume <= 1.0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, talkgroup_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (talkgroup_id) REFERENCES talkgroups(id) ON DELETE CASCADE
);

-- Add index for efficient user settings lookup
CREATE INDEX IF NOT EXISTS idx_user_talkgroup_settings_user ON user_talkgroup_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_talkgroup_settings_talkgroup ON user_talkgroup_settings(talkgroup_id);

-- 3. Update existing talkgroups with default priorities based on naming patterns
-- Emergency/911 groups get highest priority
UPDATE talkgroups 
SET type = 'static-priority', priority = 100 
WHERE LOWER(name) LIKE '%911%' 
   OR LOWER(name) LIKE '%emergency%' 
   OR LOWER(name) LIKE '%dispatch%';

-- Department groups get secondary priority  
UPDATE talkgroups 
SET type = 'static-secondary', priority = 80 
WHERE LOWER(name) LIKE '%fire%' 
   OR LOWER(name) LIKE '%police%' 
   OR LOWER(name) LIKE '%ems%' 
   OR LOWER(name) LIKE '%main%';

-- Everything else becomes dynamic by default
UPDATE talkgroups 
SET type = 'dynamic', priority = 50 
WHERE type IS NULL OR type = '';

-- 4. Create function to automatically clean up expired adhoc groups
CREATE OR REPLACE FUNCTION cleanup_expired_adhoc_groups() 
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete adhoc groups that have expired
    DELETE FROM talkgroups 
    WHERE type = 'adhoc' 
      AND expires_at IS NOT NULL 
      AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_talkgroup_settings_updated_at
    BEFORE UPDATE ON user_talkgroup_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Insert some example static groups for testing
INSERT INTO talkgroups (name, description, type, priority, is_active, hold_time_seconds) 
VALUES 
    ('911-EMERGENCY', 'Emergency dispatch channel', 'static-priority', 100, true, 0),
    ('FIRE-DISPATCH', 'Fire department dispatch', 'static-secondary', 80, true, 2),
    ('POLICE-DISPATCH', 'Police dispatch channel', 'static-secondary', 80, true, 2),
    ('EMS-DISPATCH', 'Emergency medical services', 'static-secondary', 75, true, 2)
ON CONFLICT (name) DO NOTHING; -- Don't insert if already exists

-- 7. Create view for easy querying of talkgroups with priorities
CREATE OR REPLACE VIEW talkgroups_with_priority AS
SELECT 
    t.*,
    CASE 
        WHEN t.type = 'static-priority' THEN 'Emergency Priority'
        WHEN t.type = 'static-secondary' THEN 'Department Channel'
        WHEN t.type = 'dynamic' THEN 'User Channel'
        WHEN t.type = 'adhoc' THEN 'Incident Channel'
        ELSE 'Unknown'
    END as type_description,
    CASE 
        WHEN t.expires_at IS NOT NULL AND t.expires_at < CURRENT_TIMESTAMP THEN true
        ELSE false
    END as is_expired
FROM talkgroups t;

-- 8. Grant permissions (adjust based on your user setup)
-- GRANT SELECT, INSERT, UPDATE ON talkgroups TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_talkgroup_settings TO app_user;

COMMIT;
