-- Supabase Migration: Karma System
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.user_karma (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    karma_score INT DEFAULT 0,
    positive_ratings INT DEFAULT 0,
    negative_ratings INT DEFAULT 0,
    total_rated_submissions INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.karma_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id TEXT,
    video_url TEXT,
    host_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL REFERENCES public.user_karma(user_id) ON DELETE CASCADE,
    rating_type TEXT CHECK (rating_type IN ('positive', 'negative')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(video_id, host_id)
);

ALTER TABLE public.user_karma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.karma_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Karma is public" ON public.user_karma FOR SELECT USING (true);
CREATE POLICY "Admin full access karma" ON public.user_karma USING (true);

CREATE POLICY "Ratings are public" ON public.karma_ratings FOR SELECT USING (true);
CREATE POLICY "Admin full access ratings" ON public.karma_ratings USING (true);
