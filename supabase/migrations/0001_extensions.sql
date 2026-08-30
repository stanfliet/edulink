-- ============================================================
-- EDULINK · 0001 — Extensions
-- Run order matters: 0001 -> 0002 -> 0003 -> 0004 -> 0005
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- gen_random_uuid() / uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- crypt(), gen_salt(), digests
