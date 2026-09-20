-- ---------------------------------------------------------------------------
-- Potret dosir hanya menghitung transaksi yang dikonfirmasi.
--
-- ANGKA YANG DIBACA BANK LEBIH BESAR DARIPADA ANGKA DI SELURUH LAPORAN LAIN.
--
-- `respond_to_dossier_request` membangun potret beku `financial_summary` yang
-- kemudian tercetak di PDF dosir. Ia menjumlahkan `transactions` 90 hari
-- terakhir TANPA menyaring `ledger_status`.
--
-- `transactions.ledger_status` hanya punya dua nilai: 'confirmed' dan
-- 'cancelled'. Artinya setiap transaksi yang DIBATALKAN pemiliknya -- koreksi,
-- salah catat, transaksi kembar -- tetap ikut terhitung sebagai pemasukan di
-- dalam potret itu.
--
-- Seluruh laporan lain di sistem ini menyaring `ledger_status = 'confirmed'`:
-- `fn_warung_monthly`, `fn_income_statement`, ringkasan bulanan di layar, dan
-- PDF laporan keuangan SAK EMKM. Hanya dosir yang tidak.
--
-- Diukur di data demo dengan SATU transaksi batal senilai Rp5.000.000:
-- dosir melaporkan Rp53.454.000 sementara laporan lain menunjukkan
-- Rp48.454.000. Selisih itu dibaca lembaga sebagai pemasukan usaha.
--
-- Cacatnya belum pernah terlihat karena data demo tidak memuat satu pun
-- transaksi batal. Ia muncul pada pemilik sungguhan begitu ia membatalkan
-- satu catatan -- dan tidak ada galat yang memberitahu siapa pun.
--
-- KENAPA SELURUH FUNGSINYA DITULIS ULANG, BUKAN SATU BARIS DITAMBAL.
--
-- PostgreSQL tidak punya "ubah satu baris di dalam fungsi". Definisi di bawah
-- diambil dari fungsi yang sedang hidup, dengan satu syarat ditambahkan pada
-- kueri potretnya; sisanya sama persis. Membandingkannya dengan `0060`
-- memperlihatkan bahwa yang berubah hanya itu.
--
-- `transactionCount` dan `activeDays` ikut terpengaruh, dan memang harus:
-- transaksi batal juga tidak boleh menambah jumlah catatan maupun jumlah hari
-- aktif yang dilaporkan.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[] DEFAULT '{}'::text[], p_download_allowed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.dossier_requests%rowtype;
  grant_id_value uuid;
  dossier_id_value uuid;
  expiry_value timestamptz;
  scope_value text;
  snapshot_value jsonb;
begin
  select * into request_row from public.dossier_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Pemilik usaha selalu boleh memutuskan tentang datanya sendiri. Admin
  -- platform juga boleh, untuk mendampingi. Galatnya sengaja tetap
  -- REQUEST_NOT_FOUND, bukan FORBIDDEN: menjawab "ditolak" kepada orang yang
  -- bukan haknya sudah membocorkan bahwa permintaannya ada.
  if not private.business_access(request_row.business_id)
    and not private.is_platform_admin() then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if request_row.status <> 'pending' or request_row.expires_at <= now() then raise exception 'REQUEST_NOT_PENDING'; end if;
  if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION'; end if;
  if p_decision = 'reject' then
    update public.dossier_requests set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = request_row.id;
    return jsonb_build_object('requestId', request_row.id, 'status', 'rejected');
  end if;
  if cardinality(p_approved_scopes) = 0 or not (p_approved_scopes <@ request_row.requested_scopes)
    or not (request_row.required_scopes <@ p_approved_scopes) then raise exception 'INVALID_APPROVED_SCOPE'; end if;

  expiry_value := now() + make_interval(days => request_row.requested_duration_days);
  update public.dossier_requests set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = request_row.id;
  insert into public.consent_grants (
    request_id, institution_id, business_id, granted_by, scopes, status, expires_at, download_allowed
  ) values (
    request_row.id, request_row.institution_id, request_row.business_id, (select auth.uid()),
    p_approved_scopes, 'active', expiry_value, p_download_allowed and request_row.download_requested
  ) returning id into grant_id_value;
  insert into public.dossiers (
    request_id, grant_id, business_id, institution_id, status, generated_at, expires_at
  ) values (
    request_row.id, grant_id_value, request_row.business_id, request_row.institution_id,
    'ready', now(), expiry_value
  ) returning id into dossier_id_value;

  foreach scope_value in array p_approved_scopes loop
    snapshot_value := null;
    if scope_value = 'business_identity' then
      select jsonb_build_object('businessName', business.name, 'legalName', business.legal_name,
        'sector', business.sector, 'generalLocation', business.location,
        'contactName', profile.nama_contact, 'email', profile.email, 'phone', profile.phone)
      into snapshot_value
      from public.businesses business
      left join public.profiles profile on profile.id = business.legacy_profile_id
      where business.id = request_row.business_id;
    elsif scope_value = 'readiness' then
      -- Tingkat, pilar, dan versi rumusnya -- bukan angka dari seratus.
      -- Potret ini adalah yang benar-benar dibaca lembaga, dan angka tunggal
      -- yang menilai sebuah usaha terlalu mudah disalahartikan sebagai
      -- penilaian kelayakan.
      select jsonb_build_object(
        'level', state.level,
        'levelSince', state.level_since,
        'formulaVersion', state.formula_version,
        'components', coalesce(daily.components, '[]'::jsonb),
        'calculatedAt', state.updated_at
      )
      into snapshot_value
      from public.business_readiness_state as state
      left join lateral (
        select entry.components from public.readiness_daily as entry
        where entry.business_id = state.business_id
        order by entry.snapshot_date desc limit 1
      ) as daily on true
      where state.business_id = request_row.business_id;
    elsif scope_value in ('financial_summary','qris_history') then
      select jsonb_build_object(
        'periodDays', 90,
        'incomeTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'income'), 0),
        'expenseTotal', coalesce(sum(transaction.amount_idr) filter (where transaction.direction = 'expense'), 0),
        'transactionCount', count(*),
        'activeDays', count(distinct transaction.transaction_date),
        'note', case when scope_value = 'qris_history' then 'Ringkasan catatan transaksi; bukan riwayat QRIS mentah.' else 'Ringkasan, bukan transaksi satu per satu.' end
      ) into snapshot_value from public.transactions transaction
      where transaction.business_id = request_row.business_id
        and transaction.transaction_date >= current_date - 89
        -- Hanya transaksi yang dikonfirmasi. Lihat catatan migrasi 0099.
        and transaction.ledger_status = 'confirmed';
    elsif scope_value in ('nib','npwp','owner_identity','sector_certificates') then
      select jsonb_build_object(
        'documentType', scope_value,
        'available', count(*) > 0,
        'ownerConfirmed', bool_or(extraction.owner_review_status in ('owner_confirmed','owner_corrected')),
        'documentCount', count(*),
        'note', 'File asli dan nomor lengkap tidak disertakan dalam profil ringkas.'
      ) into snapshot_value
      from public.documents document
      left join public.document_versions version on version.document_id = document.id and version.version = document.current_version
      left join public.document_extractions extraction on extraction.document_version_id = version.id
      where document.business_id = request_row.business_id
        and document.status not in ('rejected','archived','superseded')
        and (
          (scope_value = 'nib' and document.doc_type = 'nib') or
          (scope_value = 'npwp' and document.doc_type = 'npwp') or
          (scope_value = 'owner_identity' and document.doc_type = 'ktp_owner') or
          (scope_value = 'sector_certificates' and document.doc_type in ('pirt','halal','distribution_permit'))
        );
    end if;
    insert into public.dossier_items(dossier_id, item_type, source_table, snapshot, ordinal)
    values (dossier_id_value, scope_value, 'frozen_snapshot', coalesce(snapshot_value, '{}'::jsonb), array_position(p_approved_scopes, scope_value));
  end loop;
  return jsonb_build_object('requestId', request_row.id, 'status', 'approved', 'grantId', grant_id_value,
    'dossierId', dossier_id_value, 'expiresAt', expiry_value);
exception
  when unique_violation then raise exception 'ACTIVE_ACCESS_EXISTS';
end;
$function$
;
