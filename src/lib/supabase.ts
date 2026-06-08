import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase environment variables are missing! Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

// Fallback to placeholders so the app doesn't crash to a white screen immediately, 
// though authentication will fail until the keys are added into Vercel.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);
