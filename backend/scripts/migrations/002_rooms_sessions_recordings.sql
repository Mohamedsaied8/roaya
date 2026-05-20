-- 002_rooms_sessions_recordings.sql
-- Adds the persistence layer for rooms, sessions (historic record of completed
-- meetings), recordings (Phase 5), and per-user storage settings (Phase 5.3).
-- All tables are additive; this migration is safe to run on top of 001.

-- ---------------------------------------------------------------------------
-- Rooms: live + scheduled meetings. Lifecycle states match architecture §5.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
    id              VARCHAR(50) PRIMARY KEY,
    meeting_code    VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    host_id         VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'WAITING_FOR_HOST'
                    CHECK (status IN ('WAITING_FOR_HOST', 'ACTIVE', 'ENDED')),
    is_private      BOOLEAN NOT NULL DEFAULT TRUE,
    allow_screen_share BOOLEAN NOT NULL DEFAULT TRUE,
    scheduled_at    BIGINT,        -- NULL for instant meetings (Phase 6)
    created_at      BIGINT NOT NULL,
    ended_at        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_rooms_meeting_code ON rooms(meeting_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_scheduled_at ON rooms(scheduled_at)
    WHERE scheduled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sessions: historic record of a completed Room. Kept separate so the live
-- `rooms` table can be pruned without losing audit history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id              VARCHAR(50) PRIMARY KEY,
    room_id         VARCHAR(50) NOT NULL,
    host_id         VARCHAR(50) NOT NULL,
    started_at      BIGINT NOT NULL,
    ended_at        BIGINT NOT NULL,
    participant_count INTEGER NOT NULL DEFAULT 0,
    peak_participants INTEGER NOT NULL DEFAULT 0,
    metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions(host_id);

-- ---------------------------------------------------------------------------
-- Recordings: one row per recording attempt. State machine matches Phase 5.1.d:
--   IDLE → STARTING → RECORDING → STOPPING → UPLOADING → DONE | FAILED
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordings (
    id              VARCHAR(50) PRIMARY KEY,
    room_id         VARCHAR(50) NOT NULL,
    started_by      VARCHAR(50) NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'STARTING'
                    CHECK (status IN ('STARTING', 'RECORDING', 'STOPPING',
                                      'UPLOADING', 'DONE', 'FAILED')),
    file_path       TEXT,           -- Local on-disk MP4 before upload
    file_size_bytes BIGINT,
    duration_seconds INTEGER,
    drive_file_id   VARCHAR(255),   -- Populated by upload_worker
    drive_url       TEXT,
    error_message   TEXT,
    upload_attempts INTEGER NOT NULL DEFAULT 0,
    started_at      BIGINT NOT NULL,
    ended_at        BIGINT,
    uploaded_at     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_recordings_room_id ON recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
-- Used by upload_worker's poll loop:
CREATE INDEX IF NOT EXISTS idx_recordings_pending_upload ON recordings(status)
    WHERE status IN ('UPLOADING', 'STOPPING');

-- ---------------------------------------------------------------------------
-- Storage settings: per-user OAuth credentials for cloud storage providers.
-- The refresh_token MUST be stored encrypted at rest (Phase 5.3.a) — the
-- column type is TEXT to allow base64'd ciphertext + IV.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storage_settings (
    user_id         VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL DEFAULT 'google_drive'
                    CHECK (provider IN ('google_drive', 's3', 'local')),
    client_id       TEXT,
    client_secret_encrypted TEXT,
    refresh_token_encrypted TEXT,
    folder_id       TEXT,
    last_validated_at BIGINT,
    updated_at      BIGINT NOT NULL
);
