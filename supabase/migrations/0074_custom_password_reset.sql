-- Migration: 0074_custom_password_reset.sql
-- Description: Tabel penyimpanan OTP reset kata sandi kustom independen dari Supabase mailer

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  reset_session_token TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pencarian cepat berdasarkan email & kedaluwarsa
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email_expires 
  ON public.password_reset_tokens (email, expires_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_session
  ON public.password_reset_tokens (reset_session_token)
  WHERE reset_session_token IS NOT NULL;

-- Keamanan: Batasi akses tabel ini hanya untuk backend server (service_role)
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Tidak ada policy SELECT/INSERT/UPDATE untuk public/anon/authenticated.
-- Hanya backend via SUPABASE_SERVICE_ROLE_KEY (bypass RLS) yang dapat membaca dan memodifikasi.
