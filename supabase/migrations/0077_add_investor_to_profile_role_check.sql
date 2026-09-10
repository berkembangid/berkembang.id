-- Migration: 0077_add_investor_to_profile_role_check.sql
-- Description: Tambahkan nilai 'investor' ke constraint profiles_role_check
-- agar investor yang mendaftar sendiri bisa di-bootstrap dengan benar.
-- Catatan: nilai role di profiles hanya dipakai untuk keperluan legacy;
-- otorisasi portal didasarkan pada institution_members dan institutions.type.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IS NULL OR role = ANY(ARRAY[
    'umkm'::text,
    'institution'::text,
    'admin'::text,
    'investor'::text
  ]));
