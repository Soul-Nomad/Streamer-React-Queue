/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const runtimeConfig = (window as any).__RUNTIME_CONFIG__ || {};

const rawUrl = runtimeConfig.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL;
const supabaseKey = runtimeConfig.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY;

// Clean up Supabase URL if user accidentally included /rest/v1 or trailing slashes
let cleanSupabaseUrl = rawUrl?.trim();
if (cleanSupabaseUrl) {
  // Remove trailing slashes
  cleanSupabaseUrl = cleanSupabaseUrl.replace(/\/+$/, '');
  // Remove /rest/v1 suffix if present
  if (cleanSupabaseUrl.endsWith('/rest/v1')) {
    cleanSupabaseUrl = cleanSupabaseUrl.slice(0, -8);
  }
}

if (!cleanSupabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase environment variables are missing! Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

// Fallback to placeholders so the app doesn't crash to a white screen immediately, 
// though authentication will fail until the keys are added.
export const supabase = createClient(
  cleanSupabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

export const RAW_SUPABASE_KEY = supabaseKey || '';
export const RAW_SUPABASE_URL = cleanSupabaseUrl || '';

export const isSecretKeyMistake = !!(
  supabaseKey && 
  (supabaseKey.startsWith('sb_secret_') || 
   supabaseKey.toLowerCase().includes('secret') || 
   supabaseKey.startsWith('service_role'))
);

export const isMissingConfig = !cleanSupabaseUrl || !supabaseKey || cleanSupabaseUrl.includes('placeholder') || supabaseKey.includes('placeholder');

