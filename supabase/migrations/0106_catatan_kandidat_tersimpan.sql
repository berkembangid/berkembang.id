-- ---------------------------------------------------------------------------
-- 0106 — Catatan pada kandidat tersimpan
-- ---------------------------------------------------------------------------
-- `institution_shortlists.notes` sudah ada sejak `0050`, tetapi tidak pernah
-- bisa dibaca atau ditulis dari layar: daftar tersimpan hanya mengembalikan
-- kode, dan kode itu tidak bisa dipetakan ke `business_id` oleh lembaga
-- karena `discovery_optins` tertutup bagi mereka. Petugas yang menyimpan
-- sepuluh kandidat untuk rapat minggu depan tidak punya tempat menulis
-- "kenapa yang ini".
--
-- Catatan bersifat PRIBADI, sama seperti daftar tersimpannya sendiri
-- (`created_by = auth.uid()`): yang menulis hanya yang menyimpan, dan yang
-- membaca hanya dia. Batasnya 500 huruf -- ini pengingat, bukan berkas.

begin;

create or replace function public.list_my_shortlist_notes(p_institution_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(jsonb_object_agg(optin.candidate_code, shortlist.notes), '{}'::jsonb)
  from public.institution_shortlists as shortlist
  join public.discovery_optins as optin on optin.business_id = shortlist.business_id and optin.opted_in = true
  where shortlist.institution_id = public.resolve_my_institution_id(p_institution_id)
    and shortlist.created_by = (select auth.uid())
    and shortlist.status = 'shortlisted'
    and nullif(btrim(coalesce(shortlist.notes, '')), '') is not null;
$fn$;

create or replace function public.set_my_shortlist_note(
  p_candidate_code text,
  p_note text,
  p_institution_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  institution_id_value uuid := public.resolve_my_institution_id(p_institution_id);
  business_id_value uuid;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if char_length(coalesce(clean_note, '')) > 500 then raise exception 'NOTE_TOO_LONG'; end if;

  select optin.business_id into business_id_value
  from public.discovery_optins as optin
  where optin.candidate_code = upper(btrim(p_candidate_code)) and optin.opted_in = true;
  if business_id_value is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;

  update public.institution_shortlists
  set notes = clean_note, updated_at = now()
  where institution_id = institution_id_value
    and business_id = business_id_value
    and created_by = (select auth.uid())
    and status = 'shortlisted';
  if not found then raise exception 'NOT_SHORTLISTED'; end if;

  return jsonb_build_object('candidateCode', upper(btrim(p_candidate_code)), 'note', clean_note);
end;
$fn$;

revoke all on function public.list_my_shortlist_notes(uuid) from public, anon;
grant execute on function public.list_my_shortlist_notes(uuid) to authenticated;
revoke all on function public.set_my_shortlist_note(text, text, uuid) from public, anon;
grant execute on function public.set_my_shortlist_note(text, text, uuid) to authenticated;

commit;
