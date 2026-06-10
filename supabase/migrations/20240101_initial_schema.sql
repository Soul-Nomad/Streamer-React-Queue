-- Supabase Migration: Twitch Video Queue System
-- Paste this script into your Supabase SQL Editor to set up the database.

-- 1. Extend the public schema to use UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the Rooms table (Intransferable ownership)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  twitch_channel_id TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create the Room Settings table
CREATE TABLE IF NOT EXISTS public.room_settings (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  -- Submission restrictions
  require_sub BOOLEAN DEFAULT false,
  require_follower BOOLEAN DEFAULT false,
  min_follow_days INT DEFAULT 0,
  min_account_age_days INT DEFAULT 0,
  max_videos_per_user INT DEFAULT 2,
  max_queue_size INT DEFAULT 50,
  cooldown_seconds INT DEFAULT 60,
  -- Priority rules weights
  weight_tier_1 INT DEFAULT 10,
  weight_tier_2 INT DEFAULT 20,
  weight_tier_3 INT DEFAULT 30,
  weight_mod INT DEFAULT 50,
  weight_vip INT DEFAULT 15,
  -- Custom integrations
  channel_point_reward_id TEXT,
  auto_approve_subs BOOLEAN DEFAULT true,
  auto_approve_mods BOOLEAN DEFAULT true
);

-- 4. Create the Videos Queue table
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id),
  twitch_user_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'approved', 'playing', 'played', 'rejected', 'removed')) DEFAULT 'pending',
  priority_score INT DEFAULT 0,
  is_channel_points_skip BOOLEAN DEFAULT false,
  inserted_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- 6. Setup RLS Policies

-- ROOMS POLICIES --
-- Anyone can view rooms
CREATE POLICY "Salas são públicas" 
  ON public.rooms FOR SELECT 
  USING (true);

-- Only owner can update their room
CREATE POLICY "Somente dono atualiza sala" 
  ON public.rooms FOR UPDATE 
  USING (auth.uid() = owner_id);

-- Owner can insert their own room
CREATE POLICY "Dono cria sua sala" 
  ON public.rooms FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

-- ROOM SETTINGS POLICIES --
-- Anyone can view room settings
CREATE POLICY "Configurações visíveis publicamente" 
  ON public.room_settings FOR SELECT 
  USING (true);

-- Only owner can update their room settings
CREATE POLICY "Somente dono edita configs" 
  ON public.room_settings FOR UPDATE 
  USING (
    EXISTS (SELECT 1 FROM public.rooms WHERE id = room_settings.room_id AND owner_id = auth.uid())
  );
  
-- Owner can insert their room settings
CREATE POLICY "Dono insere configs" 
  ON public.room_settings FOR INSERT 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rooms WHERE id = room_settings.room_id AND owner_id = auth.uid())
  );

-- VIDEOS POLICIES --
-- Anyone can view the video queue
CREATE POLICY "Fila é pública" 
  ON public.videos FOR SELECT 
  USING (true);

-- Only the owner can moderate/update the video queue
CREATE POLICY "Dono gerencia toda a fila" 
  ON public.videos FOR UPDATE 
  USING (
    EXISTS (SELECT 1 FROM public.rooms WHERE id = videos.room_id AND owner_id = auth.uid())
  );

-- Users can delete their own videos (e.g. if they want to cancel before it plays)
CREATE POLICY "Usuário deleta próprio vídeo" 
  ON public.videos FOR DELETE 
  USING (submitted_by = auth.uid());

-- NOTE: Video Insertion (INSERT) is intentionally NOT allowed directly from the client.
-- This prevents clients from bypassing our advanced Twitch API checks.
-- We will handle inserts safely within Supabase Edge Functions.

-- 7. Triggers: Automatically create room_settings when a room is created
CREATE OR REPLACE FUNCTION public.handle_new_room()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.room_settings (room_id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_created
  AFTER INSERT ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_room();
