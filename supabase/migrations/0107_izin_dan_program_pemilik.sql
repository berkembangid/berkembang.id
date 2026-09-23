-- 0107 — Izin dan program dari sisi pemilik usaha.
--
-- Layar Profil menjanjikan dua hal yang tidak bisa ditepati:
--
--   * « Anda boleh keluar kapan saja » dari program pembinaan -- padahal
--     tidak ada daftar program yang diikuti dan tidak ada jalan keluar.
--     `join_program_by_code` (0058) hanya satu arah.
--   * Riwayat akses lembaga yang tidak menyebut SIAPA yang membuka data.
--     `institution_view_logs` menyimpan `institution_id`, tetapi pemilik
--     tidak boleh membaca tabel `institutions` secara langsung, jadi layarnya
--     hanya bisa menulis « Membuka dossier ».
--
-- Ketiganya fungsi SECURITY DEFINER yang membatasi diri ke usaha pemanggil
-- lewat `private.business_access`, pola yang sama dengan
-- `list_my_dinas_broadcasts` (0084).

begin;

-- ---------------------------------------------------------------------------
-- Program yang diikuti
-- ---------------------------------------------------------------------------

create or replace function public.list_my_programs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  return coalesce((
    select jsonb_agg(entry order by entry."joinedAt" desc)
    from (
      select
        program.id as "programId",
        program.name as "programName",
        program.description as description,
        institution.name as "institutionName",
        enrollment.status as status,
        coalesce(enrollment.reviewed_at, enrollment.applied_at) as "joinedAt",
        program.ends_on as "endsOn"
      from public.program_enrollments as enrollment
      join public.programs as program on program.id = enrollment.program_id
      join public.institutions as institution on institution.id = program.institution_id
      where enrollment.business_id = v_business
        and enrollment.status in ('accepted', 'applied', 'under_review', 'invited')
    ) as entry
  ), '[]'::jsonb);
end;
$fn$;

/**
 * Keluar dari program. Barisnya tidak dihapus: status `withdrawn` membuat
 * usaha ini hilang dari dasbor program (yang hanya menghitung `accepted`),
 * sementara jejak bahwa ia pernah ikut tetap ada untuk audit. Bergabung lagi
 * dengan kode yang sama mengembalikannya ke `accepted` lewat
 * `join_program_by_code`.
 */
create or replace function public.leave_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
  v_changed integer;
begin
  update public.program_enrollments
  set status = 'withdrawn', reviewed_at = now(), updated_at = now()
  where program_id = p_program_id
    and business_id = v_business
    and status <> 'withdrawn';
  get diagnostics v_changed = row_count;

  if v_changed = 0 and not exists (
    select 1 from public.program_enrollments
    where program_id = p_program_id and business_id = v_business
  ) then
    raise exception using errcode = 'P0002', message = 'PROGRAM_NOT_FOUND';
  end if;

  return jsonb_build_object('programId', p_program_id, 'status', 'withdrawn', 'idempotent', v_changed = 0);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Riwayat akses, dengan nama lembaganya
-- ---------------------------------------------------------------------------

create or replace function public.list_my_access_log(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_business uuid := private.my_business_for_broadcast();
begin
  return coalesce((
    select jsonb_agg(entry order by entry."occurredAt" desc)
    from (
      select
        log.id as id,
        log.artifact as artifact,
        log.action as action,
        log.occurred_at as "occurredAt",
        institution.name as "institutionName"
      from public.institution_view_logs as log
      left join public.institutions as institution on institution.id = log.institution_id
      where log.business_id = v_business
      order by log.occurred_at desc
      limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) as entry
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.list_my_programs() from public, anon;
revoke all on function public.leave_program(uuid) from public, anon;
revoke all on function public.list_my_access_log(integer) from public, anon;
grant execute on function public.list_my_programs() to authenticated;
grant execute on function public.leave_program(uuid) to authenticated;
grant execute on function public.list_my_access_log(integer) to authenticated;

commit;
