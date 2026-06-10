-- 20260609: Streamer Global Settings and Domain Controls
-- Run this in your Supabase SQL Editor to apply

ALTER TABLE public.room_settings
ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS domain_whitelist JSONB DEFAULT '["youtube.com", "youtu.be", "instagram.com", "tiktok.com"]'::jsonb,
ADD COLUMN IF NOT EXISTS domain_blacklist JSONB DEFAULT '["bit.ly", "tinyurl.com", "pornhub.com", "xvideos.com"]'::jsonb,
ADD COLUMN IF NOT EXISTS domain_mode TEXT DEFAULT 'both' CHECK (domain_mode IN ('whitelist_only', 'blacklist_only', 'both'));

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS viewer_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS video_queue_count INT DEFAULT 0;
