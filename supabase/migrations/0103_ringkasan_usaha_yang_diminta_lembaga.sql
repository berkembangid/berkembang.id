-- ---------------------------------------------------------------------------
-- 0103 — Ringkasan usaha yang sudah diminta lembaga
-- ---------------------------------------------------------------------------
-- Layar Permintaan dan Dosir di portal lembaga menampilkan kata "Kandidat"
-- di setiap kartu, bukan kode usahanya. Sebabnya: kode diambil dari
-- `discovery_optins`, dan kebijakan `discovery_optins_select` (`0063`) hanya
-- mengizinkan pemilik usaha membacanya. Lembaga selalu mendapat baris kosong,
-- dan kodenya jatuh ke teks cadangan. Petugas yang punya lima permintaan
-- melihat lima kartu "Kandidat" dan tidak bisa tahu mana yang mana.
--
-- Fungsi ini mengembalikan KEPING ANONIM YANG SAMA dengan yang sudah dilihat
-- lembaga di daftar Temukan (`list_anonymous_business_candidates`): kode,
-- bidang, wilayah umum, tingkat kesiapan, umur catatan, dan kebiasaan
-- mencatat. Tidak ada nama, tidak ada kontak, tidak ada rupiah.
--
-- Batasnya: hanya usaha yang pernah diminta oleh lembaga tempat pemanggil
-- menjadi anggota aktif. Usaha yang tidak pernah diminta tidak bisa diintip
-- lewat fungsi ini dengan menebak UUID-nya.

begin;

create or replace function public.ringkasan_usaha_yang_diminta(p_business_ids uuid[])
returns table (
  business_id uuid,
  candidate_code text,
  sector text,
  general_location text,
  readiness_level text,
  recording_age_band text,
  recording_activity text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    business.id,
    coalesce(
      optin.candidate_code,
      'UMKM-' || upper(substr(replace(business.id::text, '-', ''), 1, 8))
    ),
    coalesce(business.sector, 'Belum diisi'),
    coalesce(business.location, 'Belum diisi'),
    case readiness_state.level
      when 'EMAS' then 'Emas'
      when 'PERAK' then 'Perak'
      when 'TEMBAGA' then 'Tembaga'
      when 'MULAI' then 'Mulai'
      else 'Belum dihitung' end,
    case
      when financial.latest_transaction_date is null then 'Belum ada catatan'
      when financial.latest_transaction_date >= current_date - 89 then '< 3 bulan'
      when financial.latest_transaction_date >= current_date - 179 then '3-6 bulan'
      when financial.latest_transaction_date >= current_date - 364 then '6-12 bulan'
      else '> 12 bulan' end,
    private.recording_band(activity.active_days_30)
  from public.businesses as business
  left join public.discovery_optins as optin on optin.business_id = business.id
  left join public.business_readiness_state as readiness_state
    on readiness_state.business_id = business.id
  left join lateral (
    select max(transaction.transaction_date) as latest_transaction_date
    from public.transactions as transaction where transaction.business_id = business.id
  ) as financial on true
  left join lateral (
    select count(distinct transaction.transaction_date) filter (
      where transaction.transaction_date >= current_date - 29
    )::integer as active_days_30
    from public.transactions as transaction
    where transaction.business_id = business.id and transaction.transaction_date >= current_date - 29
  ) as activity on true
  where business.id = any(p_business_ids[1:200])
    and exists (
      select 1
      from public.dossier_requests as request
      join public.institution_members as member on member.institution_id = request.institution_id
      where request.business_id = business.id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    );
$fn$;

revoke all on function public.ringkasan_usaha_yang_diminta(uuid[]) from public, anon;
grant execute on function public.ringkasan_usaha_yang_diminta(uuid[]) to authenticated;

commit;
