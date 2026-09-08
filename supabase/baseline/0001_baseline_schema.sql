-- ---------------------------------------------------------------------------
-- Skema dasar BERKEMBANG.ID
-- ---------------------------------------------------------------------------
-- Dihasilkan oleh `npm run db:baseline` dari pemasangan bersih
-- 67 migrasi (0001_identity_business_membership.sql sampai 0067_nilai_sisa_alat_usaha.sql).
--
-- JANGAN DISUNTING DENGAN TANGAN. Berkas ini adalah salinan keadaan akhir
-- skema, bukan pendapat tentangnya. Perubahan berikutnya ditulis sebagai
-- migrasi baru di `supabase/migrations/`, lalu baseline dibangun ulang.
--
-- Yang ikut: seluruh tabel, fungsi, trigger, indeks, kebijakan RLS, dan hak
-- akses pada skema `public` dan `private`, ditambah baris acuan yang tanpa
-- itu aplikasi tidak bisa mencatat satu transaksi pun -- bagan akun SAK EMKM,
-- template kategori, kelengkapan dokumen, konfigurasi rumus kesiapan, dan
-- daftar misi.
--
-- Ikut juga: bucket penyimpanan beserta kebijakannya. Skema `storage` milik
-- Supabase, tetapi bucket di dalamnya milik kita -- tanpa itu tidak ada satu
-- dokumen pun yang bisa diunggah.
--
-- Yang TIDAK ikut: definisi skema `auth` dan `storage` itu sendiri
-- (disediakan Supabase), serta setiap baris milik pengguna.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.businesses') is not null then
    raise exception 'BASELINE_SCHEMA_ALREADY_APPLIED: skema sudah terpasang di basis data ini. Skema dasar hanya untuk pemasangan pertama ke basis data kosong; perubahan berikutnya ditulis sebagai migrasi baru di supabase/migrations/.';
  end if;
end;
$$;

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET standard_conforming_strings = on;
SET check_function_bodies = false;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: account_deletion_grace_days(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.account_deletion_grace_days() RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select 30; $$;


--
-- Name: accounting_business_access(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.accounting_business_access(p_business_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.business_access(p_business_id) or private.is_platform_admin();
$$;


--
-- Name: assert_journal_entry_balanced(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_journal_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  -- Trigger ini hanya dipasang untuk INSERT dan UPDATE, jadi NEW selalu ada.
  -- Menyebut OLD di sini akan gagal (55000) pada INSERT.
  v_entry_id uuid := new.entry_id;
  v_debit bigint;
  v_credit bigint;
  v_lines int;
begin
  select coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0), count(*)
  into v_debit, v_credit, v_lines
  from public.journal_lines as line
  where line.entry_id = v_entry_id;

  if v_lines < 2 then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_TOO_FEW_LINES';
  end if;
  if v_debit <> v_credit then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_UNBALANCED';
  end if;
  return null;
end;
$$;


--
-- Name: assert_journal_entry_has_lines(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_journal_entry_has_lines() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_debit bigint;
  v_credit bigint;
  v_lines int;
begin
  select coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0), count(*)
  into v_debit, v_credit, v_lines
  from public.journal_lines as line
  where line.entry_id = new.id;

  if v_lines < 2 then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_TOO_FEW_LINES';
  end if;
  if v_debit <> v_credit then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_UNBALANCED';
  end if;
  return null;
end;
$$;


--
-- Name: assert_opening_payload(date, bigint, bigint, bigint, jsonb, jsonb, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_opening_payload(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_inventory_idr bigint, p_receivables jsonb, p_payables jsonb, p_assets jsonb, p_notes text) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
begin
  if p_start_date is null
    or p_start_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or coalesce(p_cash_idr, 0) < 0 or coalesce(p_bank_idr, 0) < 0 or coalesce(p_inventory_idr, 0) < 0
    or jsonb_typeof(coalesce(p_receivables, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_payables, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_assets, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_receivables, '[]'::jsonb)) > 50
    or jsonb_array_length(coalesce(p_payables, '[]'::jsonb)) > 50
    or jsonb_array_length(coalesce(p_assets, '[]'::jsonb)) > 50
    or char_length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
end;
$$;


--
-- Name: attachment_target_business(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.attachment_target_business(p_target_type text, p_target_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_business_id uuid;
begin
  case p_target_type
    when 'transaction' then
      select business_id into v_business_id from public.transactions where id = p_target_id;
    when 'journal_entry' then
      select business_id into v_business_id from public.journal_entries where id = p_target_id;
    when 'fixed_asset' then
      select business_id into v_business_id from public.fixed_assets where id = p_target_id;
    when 'loan' then
      select business_id into v_business_id from public.loans where id = p_target_id;
    when 'inventory_count' then
      select business_id into v_business_id from public.inventory_counts where id = p_target_id;
    else
      raise exception using errcode = '22023', message = 'ATTACHMENT_TARGET_UNKNOWN';
  end case;
  return v_business_id;
end;
$$;


--
-- Name: business_access(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.business_access(p_business_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p_business_id is not null and (
    exists (
      select 1 from public.business_members as member
      where member.business_id = p_business_id
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    )
    or exists (
      select 1 from public.businesses as business
      where business.id = p_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    )
  );
$$;


--
-- Name: can_access_ai_job(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_ai_job(target_job_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.ai_jobs as job
    where job.id = target_job_id
      and (
        job.requested_by = (select auth.uid())
        or (job.business_id is not null and private.business_access(job.business_id))
      )
  );
$$;


--
-- Name: can_access_document(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_document(target_document_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.documents as document
    where document.id = target_document_id
      and (
        (document.business_id is not null and private.business_access(document.business_id))
        or (
          document.business_id is null
          and document.user_id = (select auth.uid())
          and private.has_any_business()
        )
      )
  );
$$;


--
-- Name: can_access_dossier(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_dossier(target_dossier_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.dossiers dossier
    join public.consent_grants consent on consent.id = dossier.grant_id
    where dossier.id = target_dossier_id
      and (
        private.business_access(dossier.business_id)
        or (
          private.is_active_institution_member(dossier.institution_id)
          and consent.institution_id = dossier.institution_id
          and consent.business_id = dossier.business_id
          and consent.status = 'active'
          and consent.expires_at > now()
          and dossier.status = 'ready'
          and dossier.expires_at > now()
        )
      )
  );
$$;


--
-- Name: can_access_snapshot(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_access_snapshot(target_snapshot_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.readiness_score_snapshots as snapshot
    where snapshot.id = target_snapshot_id
      and (
        private.business_access(snapshot.business_id)
        or private.is_platform_admin()
      )
  );
$$;


--
-- Name: default_useful_life_months(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.default_useful_life_months(p_category text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case p_category
    when 'peralatan' then 48
    when 'mesin' then 96
    when 'kendaraan' then 96
    when 'bangunan' then 240
    else 48
  end;
$$;


--
-- Name: document_attachment_is_immutable(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.document_attachment_is_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_IS_IMMUTABLE';
  end if;
  if new.document_id is distinct from old.document_id
    or new.target_type is distinct from old.target_type
    or new.target_id is distinct from old.target_id
    or new.business_id is distinct from old.business_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_IS_IMMUTABLE';
  end if;
  if old.removed_at is not null then
    raise exception using errcode = 'P0001', message = 'ATTACHMENT_ALREADY_REMOVED';
  end if;
  return new;
end;
$$;


--
-- Name: document_shelf_default(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.document_shelf_default() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.doc_class is null then
    new.doc_class := private.document_shelf_for_type(new.doc_type);
    new.needs_class_review := not private.document_shelf_is_certain(new.doc_type);
  end if;
  return new;
end;
$$;


--
-- Name: document_shelf_for_type(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.document_shelf_for_type(p_doc_type text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
    when p_doc_type in ('ktp', 'npwp') then 'identitas'
    when p_doc_type in (
      'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
      'bpom', 'haki', 'sertifikat', 'training'
    ) then 'legalitas'
    when p_doc_type in (
      'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran'
    ) then 'bukti_transaksi'
    when p_doc_type in (
      'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman'
    ) then 'aset_kontrak'
    when p_doc_type in ('pdf_sak_emkm', 'snapshot_dossier') then 'arsip_keluaran'
    else 'legalitas'
  end;
$$;


--
-- Name: document_shelf_is_certain(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.document_shelf_is_certain(p_doc_type text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select p_doc_type in (
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    'nota', 'struk', 'invoice', 'kuitansi', 'bukti_transfer', 'rekening_koran',
    'kontrak', 'sewa', 'faktur_alat', 'perjanjian_pinjaman',
    'pdf_sak_emkm', 'snapshot_dossier'
  );
$$;


--
-- Name: document_type_is_known(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.document_type_is_known(p_doc_type text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select p_doc_type = any (private.known_document_types());
$$;


--
-- Name: emkm_category_from_legacy(text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emkm_category_from_legacy(p_direction text, p_category_group text, p_category_code text, OUT o_category_code smallint, OUT o_subtype text) RETURNS record
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select
    case
      when p_direction = 'income' and (p_category_group = 'sales' or p_category_code like 'sales%') then 1::smallint
      when p_direction = 'income' then 2::smallint
      when p_category_group = 'asset' or p_category_code = 'equipment' then 8::smallint
      when p_category_code in ('raw_material', 'raw_ingredients', 'inventory', 'materials') then 5::smallint
      else 6::smallint
    end,
    case
      when p_direction = 'income' then null
      when p_category_group = 'asset' or p_category_code = 'equipment' then null
      when p_category_code in ('raw_material', 'raw_ingredients', 'inventory', 'materials') then null
      when p_category_code in ('utilities') then '5220'
      when p_category_code in ('wage', 'wages', 'salary', 'bonus', 'payroll') then '5230'
      when p_category_code in ('rent') then '5240'
      when p_category_code in ('packaging') then '5250'
      when p_category_code in ('transport') then '5260'
      when p_category_code in ('promotion', 'marketing', 'platform_fee') then '5270'
      else '5290'
    end;
$$;


--
-- Name: emkm_sector_for_business(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emkm_sector_for_business(p_business_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.emkm_sector_from_answer(
    coalesce(
      -- Jawaban terbaru pemilik. `businesses.sector` hanya potret saat usaha
      -- dibuat dan tidak ikut berubah saat profilnya disunting.
      (select nullif(trim(profile.sektor_usaha), '')
         from public.profiles as profile
         join public.businesses as business on business.legacy_profile_id = profile.id
        where business.id = p_business_id),
      (select nullif(trim(business.sector), '')
         from public.businesses as business
        where business.id = p_business_id)
    )
  );
$$;


--
-- Name: emkm_sector_from_answer(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emkm_sector_from_answer(p_answer text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case lower(trim(coalesce(p_answer, '')))
    when 'jasa' then 'JASA'
    when 'teknologi' then 'JASA'
    else 'PERDAGANGAN_KULINER'
  end;
$$;


--
-- Name: fixed_asset_threshold_idr(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.fixed_asset_threshold_idr() RETURNS bigint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 500000::bigint;
$$;


--
-- Name: get_or_create_user_business(uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.get_or_create_user_business(p_user_id uuid, p_business_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_id uuid;
  v_profile public.profiles%rowtype;
  v_name text;
begin
  if p_user_id is null then
    return null;
  end if;

  -- 1. Usaha yang diminta secara eksplisit: hanya boleh dipakai bila memang
  --    milik atau tempat keanggotaan pemanggil. Kalau tidak, tolak; jangan
  --    diam-diam mengalihkan ke usaha lain.
  if p_business_id is not null then
    select b.id into v_business_id
    from public.businesses b
    where b.id = p_business_id
      and (
        b.legacy_profile_id = p_user_id
        or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = p_user_id and m.status = 'active'
        )
      )
      and b.status = 'active'
    limit 1;

    return v_business_id;
  end if;

  -- 2. Usaha yang terikat langsung ke profil akun.
  select b.id into v_business_id
  from public.businesses b
  where b.legacy_profile_id = p_user_id
    and b.status = 'active'
  order by b.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 3. Usaha dari relasi keanggotaan (data legacy).
  select m.business_id into v_business_id
  from public.business_members m
  where m.user_id = p_user_id
    and m.status = 'active'
  order by m.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 4. Auto-provisioning: pemilik UMKM tidak pernah terblokir hanya karena
  --    usahanya belum pernah dibuat.
  select * into v_profile from public.profiles where id = p_user_id;
  v_name := coalesce(nullif(trim(v_profile.nama_usaha), ''), nullif(trim(v_profile.name), ''), 'Usaha Saya');

  insert into public.businesses (
    legacy_profile_id, name, legal_name, sector, location, phone, status
  ) values (
    p_user_id, v_name, v_name,
    coalesce(nullif(trim(v_profile.sektor_usaha), ''), 'Lainnya'),
    nullif(trim(v_profile.lokasi), ''),
    nullif(trim(v_profile.phone), ''),
    'active'
  )
  returning id into v_business_id;

  insert into public.business_members (business_id, profile_id, user_id, status, joined_at)
  values (v_business_id, p_user_id, p_user_id, 'active', now())
  on conflict do nothing;

  return v_business_id;
end;
$$;


--
-- Name: gross_revenue_between(uuid, date, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.gross_revenue_between(p_business_id uuid, p_from date, p_to date) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(sum(line.credit - line.debit), 0)::bigint
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and line.account_code = '4100'
    and entry.entry_date >= p_from
    and entry.entry_date <= p_to;
$$;


--
-- Name: guess_asset_category(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guess_asset_category(p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
    when p_name is null then 'peralatan'
    when lower(p_name) ~ '(kulkas|freezer|mesin|oven|blender|mixer|kompor gas besar|showcase)' then 'mesin'
    when lower(p_name) ~ '(motor|mobil|gerobak motor|kendaraan|viar)' then 'kendaraan'
    when lower(p_name) ~ '(bangunan|kios permanen|ruko|renovasi)' then 'bangunan'
    else 'peralatan'
  end;
$$;


--
-- Name: has_active_consent(uuid, uuid, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.has_active_consent(target_institution_id uuid, target_business_id uuid, required_scopes text[] DEFAULT '{}'::text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.consent_grants as consent
    where consent.institution_id = target_institution_id
      and consent.business_id = target_business_id
      and consent.status = 'active'
      and (consent.expires_at is null or consent.expires_at > now())
      and required_scopes <@ consent.scopes
  );
$$;


--
-- Name: has_any_business(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.has_any_business() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.business_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  ) or exists (
    select 1 from public.businesses as business
    where business.legacy_profile_id = (select auth.uid())
      and business.status = 'active'
  );
$$;


--
-- Name: indicator_formula_version(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.indicator_formula_version() RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 'indikator-v1'::text;
$$;


--
-- Name: institution_role(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.institution_role(target_institution_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select member.role
  from public.institution_members as member
  where member.institution_id = target_institution_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  order by case member.role
    when 'admin' then 1 when 'analyst' then 2 when 'reviewer' then 3 else 4 end
  limit 1;
$$;


--
-- Name: is_active_institution_member(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_active_institution_member(target_institution_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.institutions institution
    join public.institution_members member on member.institution_id = institution.id
    where institution.id = target_institution_id
      and institution.status = 'active'
      and institution.active
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.platform_admins as administrator
    where administrator.user_id = (select auth.uid())
      and administrator.status = 'active'
  );
$$;


--
-- Name: known_document_types(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.known_document_types() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select array[
    -- Identitas dan legalitas
    'ktp', 'npwp', 'nib', 'pirt', 'halal', 'izin_edar', 'akta_pendirian',
    'bpom', 'haki', 'sertifikat', 'training',
    -- Bukti transaksi
    'nota', 'kuitansi', 'bukti_transfer', 'rekening_koran', 'qris', 'utilitas',
    -- Alat dan perjanjian
    'sewa', 'perjanjian_pinjaman',
    -- Arsip keluaran (rak E)
    'pdf_sak_emkm', 'snapshot_dossier',
    -- Pendukung lain
    'foto_tempat_usaha', 'laporan_keuangan'
  ]::text[];
$$;


--
-- Name: legacy_category_for_emkm(smallint, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.legacy_category_for_emkm(p_category_code smallint, p_subtype text, OUT o_group text, OUT o_code text) RETURNS record
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select
    case p_category_code
      when 1 then 'sales'
      when 10 then 'sales'
      when 5 then 'cost_of_goods'
      when 8 then 'asset'
      when 6 then case when p_subtype = '5250' then 'cost_of_goods' else 'operating_expense' end
      else 'other'
    end,
    case p_category_code
      when 1 then 'sales_direct'
      when 10 then 'sales_direct'
      when 5 then 'raw_material'
      when 8 then 'equipment'
      when 6 then case p_subtype
        when '5210' then 'utilities'
        when '5220' then 'utilities'
        when '5230' then 'wage'
        when '5240' then 'rent'
        when '5250' then 'packaging'
        when '5260' then 'transport'
        when '5270' then 'promotion'
        else 'other'
      end
      else 'other'
    end;
$$;


--
-- Name: normalize_emkm_category(smallint, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.normalize_emkm_category(INOUT p_category_code smallint, INOUT p_subtype text, INOUT p_payment_method text, OUT o_direction text) RETURNS record
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
begin
  if p_category_code is null then
    o_direction := null;
    return;
  end if;
  if p_category_code not between 1 and 10 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Kategori 4 wajib bersubtype; default 4a (modal masuk).
  if p_category_code = 4 then
    p_subtype := coalesce(nullif(trim(coalesce(p_subtype, '')), ''), '4a');
    if p_subtype not in ('4a', '4b') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
  elsif p_category_code = 6 then
    p_subtype := coalesce(nullif(trim(coalesce(p_subtype, '')), ''), '5290');
    if p_subtype not in ('5210', '5220', '5230', '5240', '5250', '5260', '5270', '5280', '5290') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
  else
    p_subtype := null;
  end if;

  -- Jualan yang belum dibayar bukan uang masuk: jadikan piutang (kategori 10).
  if p_category_code = 1 and p_payment_method in ('unpaid', 'credit') then
    p_category_code := 10;
  end if;
  if p_category_code = 10 then
    p_payment_method := 'unpaid';
  end if;

  o_direction := case when p_category_code in (1, 2, 3, 4, 10) then 'income' else 'expense' end;
end;
$$;


--
-- Name: post_depreciation_through(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.post_depreciation_through(p_business_id uuid, p_as_of date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date;
  v_last date := date_trunc('month', p_as_of)::date;
  v_posted integer := 0;
begin
  select date_trunc('month', min(acquired_on) + interval '1 month')::date into v_month
  from public.fixed_assets where business_id = p_business_id;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.post_monthly_depreciation(p_business_id, v_month) is not null then
      v_posted := v_posted + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_posted;
end;
$$;


--
-- Name: post_monthly_depreciation(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.post_monthly_depreciation(p_business_id uuid, p_period_month date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_start date;
  v_asset record;
  v_depreciable bigint;
  v_posted bigint;
  v_monthly bigint;
  v_amount bigint;
  v_total bigint := 0;
  v_entry_id uuid;
begin
  select date_trunc('month', start_date)::date into v_start
  from public.opening_balances where business_id = p_business_id;
  if v_start is not null and v_month < v_start then
    return null;
  end if;

  for v_asset in
    select * from public.fixed_assets
    where business_id = p_business_id
      and date_trunc('month', acquired_on)::date < v_month
      and (disposed_on is null or disposed_on >= v_month)
    order by acquired_on, created_at
  loop
    if exists (
      select 1 from public.depreciation_postings
      where asset_id = v_asset.id and period_month = v_month
    ) then
      continue;
    end if;

    v_depreciable := v_asset.cost_idr - v_asset.salvage_value_idr;
    select coalesce(sum(amount_idr), 0) into v_posted
    from public.depreciation_postings where asset_id = v_asset.id;
    if v_posted >= v_depreciable then
      continue;
    end if;

    v_monthly := greatest(v_depreciable / v_asset.useful_life_months, 1);
    v_amount := least(v_monthly, v_depreciable - v_posted);
    if v_amount <= 0 then
      continue;
    end if;

    if v_entry_id is null then
      insert into public.journal_entries (
        business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
      ) values (
        p_business_id, v_month_end, 'DEPRECIATION',
        'Penyusutan alat usaha ' || to_char(v_month, 'MM-YYYY'),
        'coa-emkm-v1', null, 'NON_KAS'
      ) returning id into v_entry_id;
    end if;

    insert into public.depreciation_postings (asset_id, business_id, period_month, amount_idr, journal_entry_id)
    values (v_asset.id, p_business_id, v_month, v_amount, v_entry_id);
    v_total := v_total + v_amount;
  end loop;

  if v_entry_id is null then
    return null;
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, p_business_id, '5280', v_total, 0, 1),
         (v_entry_id, p_business_id, '1690', 0, v_total, 2);

  return v_entry_id;
end;
$$;


--
-- Name: post_monthly_tax_estimate(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.post_monthly_tax_estimate(p_business_id uuid, p_period_month date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_year_start date := date_trunc('year', v_month)::date;
  v_start date;
  v_revenue bigint;
  v_before bigint;
  v_exempt bigint := private.pph_final_exempt_idr();
  v_rate numeric := private.pph_final_rate();
  v_taxable bigint;
  v_tax bigint;
  v_existing public.tax_estimates%rowtype;
  v_entry_id uuid;
begin
  -- Pajak tidak boleh mendahului hari pertama pemilik mencatat, dengan alasan
  -- yang sama seperti penyusutan: omzet bulan-bulan itu memang belum ada di
  -- pembukuan.
  select date_trunc('month', start_date)::date into v_start
  from public.opening_balances where business_id = p_business_id;
  if v_start is not null and v_month < v_start then
    return null;
  end if;

  v_revenue := private.gross_revenue_between(p_business_id, v_month, v_month_end);
  v_before := private.gross_revenue_between(p_business_id, v_year_start, (v_month - 1));

  -- Pajak bulan ini = pajak terutang sampai akhir bulan ini, dikurangi pajak
  -- terutang sampai akhir bulan lalu.
  --
  -- Ditulis begini, bukan sebagai persentase omzet bulan berjalan, karena dua
  -- sebab. Pertama, bulan yang menembus Rp500 juta hanya dikenai pajak atas
  -- bagian yang melewatinya -- bukan atas seluruh omzet bulan itu, yang akan
  -- menagih pemilik berkali lipat. Kedua, pembulatan dilakukan pada angka
  -- kumulatif, sehingga dua belas pembulatan bulanan tidak menumpuk menjadi
  -- selisih terhadap perhitungan setahun.
  --
  -- Selisihnya boleh negatif: itulah pelepasan pajak yang sudah terlanjur
  -- diakui ketika penjualannya dibatalkan.
  v_taxable := greatest(v_before + v_revenue - v_exempt, 0) - greatest(v_before - v_exempt, 0);
  v_tax := floor(greatest(v_before + v_revenue - v_exempt, 0)::numeric * v_rate)::bigint
         - floor(greatest(v_before - v_exempt, 0)::numeric * v_rate)::bigint;

  select * into v_existing from public.tax_estimates
  where business_id = p_business_id and period_month = v_month;

  if found then
    -- Masih memakai angka yang sama: tidak ada yang perlu dikerjakan.
    if v_existing.gross_revenue_idr = v_revenue
      and v_existing.cumulative_before_idr = v_before
      and v_existing.rate = v_rate
      and v_existing.exempt_idr = v_exempt then
      return v_existing.journal_entry_id;
    end if;

    -- Sudah basi. Dibalik di dalam bulannya sendiri, supaya Posisi Keuangan
    -- pada tanggal-tanggal lampau ikut benar.
    if v_existing.journal_entry_id is not null then
      perform private.reverse_journal_entry_on(
        v_existing.journal_entry_id, 'Perkiraan pajak dihitung ulang', v_month_end);
    end if;
    delete from public.tax_estimates where id = v_existing.id;
  end if;

  if v_tax <> 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      p_business_id, v_month_end, 'TAX_ESTIMATE',
      case when v_tax > 0 then 'Perkiraan pajak penghasilan ' else 'Pelepasan perkiraan pajak ' end
        || to_char(v_month, 'MM-YYYY'),
      'coa-emkm-v1', null, 'NON_KAS'
    ) returning id into v_entry_id;

    if v_tax > 0 then
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, p_business_id, '5400', v_tax, 0, 1),
             (v_entry_id, p_business_id, '2400', 0, v_tax, 2);
    else
      -- Omzetnya turun. Utang pajak yang sudah diakui dilepaskan kembali, dan
      -- bebannya ikut berkurang di bulan pembatalan dicatat.
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, p_business_id, '2400', -v_tax, 0, 1),
             (v_entry_id, p_business_id, '5400', 0, -v_tax, 2);
    end if;
  end if;

  insert into public.tax_estimates (
    business_id, period_month, tax_year, gross_revenue_idr, cumulative_before_idr,
    taxable_idr, tax_idr, rate, exempt_idr, journal_entry_id
  ) values (
    p_business_id, v_month, extract(year from v_month)::integer, v_revenue, v_before,
    v_taxable, v_tax, v_rate, v_exempt, v_entry_id
  );

  return v_entry_id;
end;
$$;


--
-- Name: post_tax_estimates_through(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.post_tax_estimates_through(p_business_id uuid, p_as_of date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date;
  v_last date := date_trunc('month', p_as_of)::date;
  v_touched integer := 0;
begin
  select least(
    (select date_trunc('month', min(entry_date))::date
       from public.journal_entries where business_id = p_business_id),
    (select date_trunc('month', min(period_month))::date
       from public.tax_estimates where business_id = p_business_id)
  ) into v_month;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.post_monthly_tax_estimate(p_business_id, v_month) is not null then
      v_touched := v_touched + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_touched;
end;
$$;


--
-- Name: pph_final_exempt_idr(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.pph_final_exempt_idr() RETURNS bigint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 500000000::bigint;
$$;


--
-- Name: pph_final_rate(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.pph_final_rate() RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select 0.005::numeric;
$$;


--
-- Name: provision_umkm_business(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.provision_umkm_business() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_name text;
begin
  if new.role <> 'umkm' then
    return null;
  end if;
  if exists (
    select 1 from public.businesses business
    where business.legacy_profile_id = new.id
      and business.status = 'active'
  ) then
    return null;
  end if;

  v_business_name := coalesce(nullif(trim(new.nama_usaha), ''), nullif(trim(new.name), ''), 'Usaha Baru');
  insert into public.businesses (
    legacy_profile_id, name, legal_name,
    sector, location, phone, status
  ) values (
    new.id, v_business_name, v_business_name,
    coalesce(nullif(trim(new.sektor_usaha), ''), 'Lainnya'),
    nullif(trim(new.lokasi), ''),
    nullif(trim(new.phone), ''),
    'active'
  );
  -- Trigger businesses_sync_owner_membership otomatis membuat baris
  -- keanggotaan pemiliknya.
  return null;
end;
$$;


--
-- Name: purge_deleted_accounts(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.purge_deleted_accounts() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_due integer;
begin
  select count(*) into v_due from public.profiles
  where deletion_requested_at is not null
    and deletion_scheduled_for <= (now() at time zone 'Asia/Jakarta')::date;
  return jsonb_build_object('due', v_due, 'purged', 0, 'implemented', false);
end;
$$;


--
-- Name: readiness_rule_set_is_frozen(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.readiness_rule_set_is_frozen() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  -- Menerbitkan ulang isi yang sama dibiarkan: migrasi yang diputar dua kali
  -- harus tetap bisa berjalan. Yang dilarang adalah isinya berubah.
  if old.status = 'published'
    and (new.rules is distinct from old.rules
      or new.weights is distinct from old.weights
      or new.thresholds is distinct from old.thresholds) then
    raise exception using errcode = 'P0001',
      message = 'READINESS_RULE_SET_FROZEN: terbitkan versi baru, jangan ubah versi yang sudah dipakai';
  end if;
  return new;
end;
$$;


--
-- Name: rebuild_indicator_month(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rebuild_indicator_month(p_business_id uuid, p_period_month date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date := (v_month + interval '1 month - 1 day')::date;
  v_version text := private.indicator_formula_version();
  v_count integer;
  v_last timestamptz;
  v_existing public.indicator_monthly%rowtype;
  v_revenue bigint;
  v_noncash bigint;
begin
  select count(*)::integer, max(posted_at) into v_count, v_last
  from public.journal_entries
  where business_id = p_business_id
    and entry_date >= v_month and entry_date <= v_month_end;

  select * into v_existing from public.indicator_monthly
  where business_id = p_business_id and period_month = v_month;

  -- Sumbernya tidak bergeser dan rumusnya tidak berubah: tidak ada yang perlu
  -- dihitung ulang.
  if found
    and v_existing.source_entry_count = v_count
    and v_existing.source_last_posted_at is not distinct from v_last
    and v_existing.formula_version = v_version then
    return false;
  end if;

  if v_count = 0 then
    delete from public.indicator_monthly
    where business_id = p_business_id and period_month = v_month;
    return found;
  end if;

  -- Penjualan yang masuk ke rekening. Dihitung per entry: sebuah entry
  -- penjualan mendebit satu akun saja, jadi entry yang mengkredit 4100 dan
  -- mendebit 1200 adalah penjualan non-tunai seutuhnya.
  select
    coalesce(sum(sale.revenue), 0)::bigint,
    coalesce(sum(case when sale.bank > 0 then sale.revenue else 0 end), 0)::bigint
  into v_revenue, v_noncash
  from (
    select
      entry.id,
      sum(case when line.account_code = '4100' then line.credit - line.debit else 0 end) as revenue,
      sum(case when line.account_code = '1200' then line.debit - line.credit else 0 end) as bank
    from public.journal_entries as entry
    join public.journal_lines as line on line.entry_id = entry.id
    where entry.business_id = p_business_id
      and entry.entry_date >= v_month and entry.entry_date <= v_month_end
    group by entry.id
  ) as sale
  where sale.revenue > 0;

  delete from public.indicator_monthly
  where business_id = p_business_id and period_month = v_month;

  insert into public.indicator_monthly (
    business_id, period_month, revenue_idr, cogs_idr, opex_idr, interest_idr,
    net_income_idr, prive_idr, capital_in_idr, receivable_new_idr,
    noncash_sales_idr, noncash_sales_ratio, days_recorded, formula_version,
    source_entry_count, source_last_posted_at
  )
  select
    p_business_id,
    v_month,
    coalesce(sum(case when line.account_code in ('4100', '4200') then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5100' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code like '52%' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5310' then line.debit - line.credit end), 0)::bigint,
    (
      coalesce(sum(case when line.account_code like '4%' then line.credit - line.debit end), 0)
      - coalesce(sum(case when line.account_code like '5%' then line.debit - line.credit end), 0)
    )::bigint,
    coalesce(sum(case when line.account_code = '3200' then line.debit - line.credit end), 0)::bigint,
    -- Penyeimbang saldo awal bukan setoran modal. Lihat keputusan (c).
    coalesce(sum(case when line.account_code = '3100' and entry.source <> 'OPENING'
      then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '1300' then line.debit - line.credit end), 0)::bigint,
    v_noncash,
    case when v_revenue > 0
      then round(v_noncash::numeric / v_revenue::numeric, 4)
      else null end,
    count(distinct entry.entry_date)::integer,
    v_version,
    v_count,
    v_last
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date >= v_month and entry.entry_date <= v_month_end;

  return true;
end;
$$;


--
-- Name: rebuild_indicators_through(uuid, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rebuild_indicators_through(p_business_id uuid, p_as_of date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_month date;
  v_last date := date_trunc('month', p_as_of)::date;
  v_rebuilt integer := 0;
begin
  select least(
    (select date_trunc('month', min(entry_date))::date
       from public.journal_entries where business_id = p_business_id),
    (select date_trunc('month', min(period_month))::date
       from public.indicator_monthly where business_id = p_business_id)
  ) into v_month;
  if v_month is null then return 0; end if;

  while v_month <= v_last loop
    if private.rebuild_indicator_month(p_business_id, v_month) then
      v_rebuilt := v_rebuilt + 1;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_rebuilt;
end;
$$;


--
-- Name: rebuild_opening_balance(uuid, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text, uuid, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rebuild_opening_balance(p_opening_id uuid, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text, p_user_id uuid, p_carry_payments boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_business_id uuid;
  v_item jsonb;
  v_name text;
  v_amount bigint;
  v_counterparty_id uuid;
  v_receivables_idr bigint := 0;
  v_payables_idr bigint := 0;
  v_loans_bank_idr bigint := 0;
  v_loans_other_idr bigint := 0;
  v_assets_idr bigint := 0;
  v_lender_type text;
  v_installment bigint;
  v_category text;
  v_life integer;
  v_acquired date;
  v_entry_id uuid;
  v_total_assets bigint;
  v_total_liabilities bigint;
  v_equity bigint;
  v_line int := 0;
  v_paid bigint;
  v_elapsed integer;
  v_remaining integer;
  v_book_value bigint;
  v_salvage bigint;
  v_history jsonb := '{}'::jsonb;
  v_old record;
  v_key text;
begin
  select business_id into v_business_id from public.opening_balances where id = p_opening_id;
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'OPENING_BALANCE_NOT_FOUND';
  end if;

  -- Berapa yang sudah pernah dibayar atas setiap pinjaman kondisi awal.
  -- Angka ini harus selamat dari koreksi: pemilik memperbaiki angka awalnya,
  -- bukan menghapus riwayat pembayarannya.
  if p_carry_payments then
    for v_old in
      select lender_name, principal_idr, outstanding_idr
      from public.loans where opening_balance_id = p_opening_id
    loop
      v_paid := greatest(v_old.principal_idr - v_old.outstanding_idr, 0);
      if v_paid > 0 then
        v_history := v_history || jsonb_build_object(lower(trim(v_old.lender_name)), v_paid);
      end if;
    end loop;
  end if;

  delete from public.fixed_assets where opening_balance_id = p_opening_id;
  delete from public.loans where opening_balance_id = p_opening_id;

  -- Pelanggan yang masih berutang.
  for v_item in select jsonb_array_elements(coalesce(p_receivables, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'amountIdr')::bigint, 0);
    if v_name is null or v_amount <= 0 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    insert into public.counterparties (business_id, name, type, created_by)
    values (v_business_id, left(v_name, 120), 'PELANGGAN', p_user_id)
    on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now();
    v_receivables_idr := v_receivables_idr + v_amount;
  end loop;

  -- Kepada siapa usaha masih berutang.
  for v_item in select jsonb_array_elements(coalesce(p_payables, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'amountIdr')::bigint, 0);
    v_lender_type := upper(coalesce(nullif(trim(v_item->>'lenderType'), ''), 'KOPERASI'));
    v_installment := nullif(trim(coalesce(v_item->>'monthlyInstallmentIdr', '')), '')::bigint;
    if v_name is null or v_amount <= 0
      or v_lender_type not in ('BANK', 'KOPERASI', 'KELUARGA', 'SUPPLIER', 'LAIN')
      or (v_installment is not null and v_installment <= 0) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    insert into public.counterparties (business_id, name, type, created_by)
    values (v_business_id, left(v_name, 120),
      case v_lender_type when 'SUPPLIER' then 'SUPPLIER' when 'BANK' then 'BANK'
        when 'KELUARGA' then 'KELUARGA' when 'KOPERASI' then 'KOPERASI' else 'LAIN' end,
      p_user_id)
    on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
    returning id into v_counterparty_id;

    if v_lender_type = 'SUPPLIER' then
      v_payables_idr := v_payables_idr + v_amount;
    else
      v_key := lower(trim(v_name));
      v_paid := coalesce((v_history->>v_key)::bigint, 0);
      v_history := v_history - v_key;
      insert into public.loans (
        business_id, opening_balance_id, counterparty_id, lender_name, lender_type,
        principal_idr, outstanding_idr, monthly_installment_idr, started_on, created_by
      ) values (
        v_business_id, p_opening_id, v_counterparty_id, left(v_name, 120), v_lender_type,
        v_amount, greatest(v_amount - v_paid, 0), v_installment, p_start_date, p_user_id
      );
      if v_lender_type = 'BANK' then
        v_loans_bank_idr := v_loans_bank_idr + v_amount;
      else
        v_loans_other_idr := v_loans_other_idr + v_amount;
      end if;
    end if;
  end loop;

  -- Pinjaman yang sudah pernah dicicil tidak boleh hilang begitu saja:
  -- pembayarannya sudah tercatat sebagai transaksi yang tidak bisa dicabut.
  if jsonb_typeof(v_history) = 'object' and v_history <> '{}'::jsonb then
    raise exception using errcode = 'P0001',
      message = format('LOAN_HAS_PAYMENTS: %s', (select string_agg(key, ', ') from jsonb_object_keys(v_history) as key));
  end if;

  -- Alat usaha yang sudah dimiliki sejak awal.
  for v_item in select jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    v_amount := coalesce((v_item->>'costIdr')::bigint, 0);
    v_acquired := coalesce((nullif(trim(coalesce(v_item->>'acquiredOn', '')), ''))::date, p_start_date);
    v_category := lower(coalesce(nullif(trim(v_item->>'category'), ''), private.guess_asset_category(v_name)));
    if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya') then
      v_category := 'peralatan';
    end if;
    v_life := coalesce(nullif(trim(coalesce(v_item->>'usefulLifeMonths', '')), '')::integer,
      private.default_useful_life_months(v_category));
    -- Nilai sisa: perkiraan harga jual alat setelah umur ekonomisnya habis.
    -- Ia tidak pernah ikut disusutkan, jadi harus lebih kecil dari harganya --
    -- alat yang nilai sisanya sama dengan harga belinya tidak menyusut sama
    -- sekali, dan itu hampir selalu salah ketik.
    v_salvage := coalesce(nullif(trim(coalesce(v_item->>'salvageValueIdr', '')), '')::bigint, 0);
    if v_name is null or v_amount <= 0 or v_life not between 1 and 600 or v_acquired > p_start_date
      or v_salvage < 0 or v_salvage >= v_amount then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Berapa bulan alat ini sudah dipakai sebelum pembukuan dimulai.
    v_elapsed := greatest(
      (extract(year from age(p_start_date, v_acquired)) * 12
        + extract(month from age(p_start_date, v_acquired)))::integer, 0);
    v_remaining := greatest(v_life - v_elapsed, 1);
    -- Nilai pakainya hari itu. Yang menyusut hanya selisih harga dan nilai
    -- sisanya; nilai sisa tetap utuh sampai kapan pun, jadi ia ditambahkan
    -- kembali setelah bagian yang menyusut diprorata.
    v_book_value := greatest((v_salvage + (v_amount - v_salvage)::numeric * v_remaining / v_life)::bigint, 1);

    insert into public.fixed_assets (
      business_id, opening_balance_id, name, category, acquired_on,
      cost_idr, useful_life_months, salvage_value_idr, original_cost_idr, original_useful_life_months, created_by
    ) values (
      v_business_id, p_opening_id, left(v_name, 120), v_category, v_acquired,
      v_book_value, v_remaining, v_salvage, v_amount, v_life, p_user_id
    );
    v_assets_idr := v_assets_idr + v_book_value;
  end loop;

  v_total_assets := coalesce(p_cash_idr, 0) + coalesce(p_bank_idr, 0) + v_receivables_idr
    + coalesce(p_inventory_idr, 0) + v_assets_idr;
  v_total_liabilities := v_payables_idr + v_loans_bank_idr + v_loans_other_idr;
  v_equity := v_total_assets - v_total_liabilities;

  -- Usaha yang benar-benar mulai dari nol tidak perlu jurnal pembuka.
  if v_total_assets > 0 or v_total_liabilities > 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      v_business_id, p_start_date, 'OPENING', 'Saldo awal usaha', 'coa-emkm-v1', p_user_id, 'NON_KAS'
    ) returning id into v_entry_id;

    if coalesce(p_cash_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1100', p_cash_idr, 0, v_line);
    end if;
    if coalesce(p_bank_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1200', p_bank_idr, 0, v_line);
    end if;
    if v_receivables_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1300', v_receivables_idr, 0, v_line);
    end if;
    if coalesce(p_inventory_idr, 0) > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1400', p_inventory_idr, 0, v_line);
    end if;
    if v_assets_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1600', v_assets_idr, 0, v_line);
    end if;
    if v_payables_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2100', 0, v_payables_idr, v_line);
    end if;
    if v_loans_bank_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2200', 0, v_loans_bank_idr, v_line);
    end if;
    if v_loans_other_idr > 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '2300', 0, v_loans_other_idr, v_line);
    end if;

    -- Modal adalah penyeimbang. Kalau utang lebih besar dari harta, modalnya
    -- berada di sisi debit: usaha dimulai dengan modal negatif.
    if v_equity <> 0 then
      v_line := v_line + 1;
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (
        v_entry_id, v_business_id, '3100',
        case when v_equity < 0 then -v_equity else 0 end,
        case when v_equity > 0 then v_equity else 0 end,
        v_line
      );
    end if;
  end if;

  update public.opening_balances set
    start_date = p_start_date,
    cash_idr = coalesce(p_cash_idr, 0),
    bank_idr = coalesce(p_bank_idr, 0),
    receivables_idr = v_receivables_idr,
    inventory_idr = coalesce(p_inventory_idr, 0),
    fixed_assets_idr = v_assets_idr,
    payables_idr = v_payables_idr,
    loans_bank_idr = v_loans_bank_idr,
    loans_other_idr = v_loans_other_idr,
    receivable_details = coalesce(p_receivables, '[]'::jsonb),
    payable_details = coalesce(p_payables, '[]'::jsonb),
    notes = nullif(trim(p_notes), ''),
    journal_entry_id = v_entry_id
  where id = p_opening_id;

  return jsonb_build_object(
    'openingBalanceId', p_opening_id,
    'startDate', p_start_date,
    'journalEntryId', v_entry_id,
    'equityIdr', v_equity,
    'negativeEquity', v_equity < 0
  );
end;
$$;


--
-- Name: reject_journal_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reject_journal_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception using errcode = 'P0001', message = 'JOURNAL_IS_IMMUTABLE';
end;
$$;


--
-- Name: reset_depreciation_from(uuid, date, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reset_depreciation_from(p_business_id uuid, p_from_month date, p_reason text DEFAULT 'Penyusutan dihitung ulang'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_from date := date_trunc('month', p_from_month)::date;
  v_entry record;
  v_count integer := 0;
begin
  for v_entry in
    select distinct posting.journal_entry_id as id, posting.period_month
    from public.depreciation_postings as posting
    where posting.business_id = p_business_id
      and posting.period_month >= v_from
      and posting.journal_entry_id is not null
    order by posting.period_month
  loop
    -- Pembalikan bertanggal akhir bulan yang dibongkar, bukan hari ini.
    perform private.reverse_journal_entry_on(
      v_entry.id, p_reason, (v_entry.period_month + interval '1 month - 1 day')::date);
    v_count := v_count + 1;
  end loop;

  delete from public.depreciation_postings
  where business_id = p_business_id and period_month >= v_from;

  return v_count;
end;
$$;


--
-- Name: resolve_account_rule(text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.resolve_account_rule(p_rule text, p_payment_method text, p_counterparty_type text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case p_rule
    when 'CASH_STAR' then
      case when coalesce(p_payment_method, 'cash') in ('cash', 'other') then '1100' else '1200' end
    when 'CASH_OR_PAYABLE' then
      case
        when p_payment_method in ('unpaid', 'credit') then '2100'
        when coalesce(p_payment_method, 'cash') in ('cash', 'other') then '1100'
        else '1200'
      end
    when 'LIABILITY_STAR' then
      case coalesce(p_counterparty_type, 'LAIN')
        when 'SUPPLIER' then '2100'
        when 'BANK' then '2200'
        else '2300'
      end
    else p_rule
  end;
$$;


--
-- Name: reverse_journal_entry_on(uuid, text, date); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reverse_journal_entry_on(p_entry_id uuid, p_reason text, p_entry_date date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_entry public.journal_entries%rowtype;
  v_reversal_id uuid;
  v_existing uuid;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'JOURNAL_ENTRY_NOT_FOUND';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;

  -- Idempoten: satu entry hanya boleh dibalik sekali.
  select id into v_existing from public.journal_entries where reverses_entry_id = p_entry_id limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, reverses_entry_id, memo, reason,
    template_version, created_by, cash_flow_section
  ) values (
    v_entry.business_id,
    coalesce(p_entry_date, (now() at time zone 'Asia/Jakarta')::date),
    'REVERSAL', v_entry.source_id, v_entry.id,
    left('Pembalikan: ' || coalesce(v_entry.memo, ''), 240),
    trim(p_reason), v_entry.template_version, (select auth.uid()), v_entry.cash_flow_section
  ) returning id into v_reversal_id;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  select v_reversal_id, line.business_id, line.account_code, line.credit, line.debit, line.line_order
  from public.journal_lines as line
  where line.entry_id = v_entry.id;

  return v_reversal_id;
end;
$$;


--
-- Name: sync_profile_owner_membership(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_profile_owner_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.legacy_profile_id is not null and new.status = 'active'
    and not exists (
      select 1 from public.business_members member
      where member.business_id = new.id
        and member.user_id = new.legacy_profile_id
    ) then
    insert into public.business_members (business_id, profile_id, user_id, status, joined_at)
    values (new.id, new.legacy_profile_id, new.legacy_profile_id, 'active', now());
  end if;
  return null;
end;
$$;


--
-- Name: unwind_transaction_side_effects(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.unwind_transaction_side_effects() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_reversed public.journal_entries%rowtype;
  v_tx public.transactions%rowtype;
  v_principal bigint;
  v_asset public.fixed_assets%rowtype;
begin
  if new.source <> 'REVERSAL' or new.reverses_entry_id is null then
    return null;
  end if;

  select * into v_reversed from public.journal_entries where id = new.reverses_entry_id;
  -- Pembalikan penyusutan, saldo awal, atau koreksi stok tidak punya efek
  -- samping transaksi; berhenti di sini sekaligus mencegah rekursi.
  if not found or v_reversed.source <> 'TRANSACTION' or v_reversed.source_id is null then
    return null;
  end if;

  select * into v_tx from public.transactions where id = v_reversed.source_id;
  if not found or v_tx.emkm_category_code is null then
    return null;
  end if;

  -- B1: kembalikan pokok yang tadi mengurangi sisa pinjaman.
  if v_tx.emkm_category_code = 7 and v_tx.counterparty_id is not null then
    v_principal := greatest(
      coalesce(v_tx.amount_idr, v_tx.nominal, 0) - coalesce(v_tx.interest_amount_idr, 0), 0);
    if v_principal > 0 then
      update public.loans
      set outstanding_idr = least(outstanding_idr + v_principal, principal_idr),
          closed_at = null,
          updated_at = now()
      where business_id = v_tx.business_id
        and counterparty_id = v_tx.counterparty_id;
    end if;
  end if;

  -- B2: alat yang lahir dari transaksi ini ikut dicabut, beserta penyusutannya.
  if v_tx.emkm_category_code = 8 then
    for v_asset in
      select * from public.fixed_assets where source_transaction_id = v_tx.id
    loop
      perform private.reset_depreciation_from(
        v_asset.business_id,
        (date_trunc('month', v_asset.acquired_on) + interval '1 month')::date,
        'Alat usaha dibatalkan pemilik');
      delete from public.fixed_assets where id = v_asset.id;
    end loop;
  end if;

  -- Pinjaman yang lahir dari transaksi ini dicabut selama belum pernah dicicil.
  if v_tx.emkm_category_code = 4 and v_tx.emkm_category_subtype = '4b' then
    if exists (
      select 1 from public.loans
      where source_transaction_id = v_tx.id and outstanding_idr < principal_idr
    ) then
      raise exception using errcode = 'P0001', message = 'LOAN_HAS_PAYMENTS';
    end if;
    delete from public.loans where source_transaction_id = v_tx.id;
  end if;

  return null;
end;
$$;


--
-- Name: access_verified_business_profile(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.access_verified_business_profile(p_dossier_id uuid, p_resource_scope text, p_action text DEFAULT 'view'::text, p_ip_hash text DEFAULT NULL::text, p_user_agent_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  dossier_row public.dossiers%rowtype;
  grant_row public.consent_grants%rowtype;
  denial_value text;
  item_value jsonb;
begin
  select * into dossier_row from public.dossiers where id = p_dossier_id;
  if dossier_row.id is null then return jsonb_build_object('allowed', false, 'code', 'PROFILE_NOT_AVAILABLE'); end if;
  select * into grant_row from public.consent_grants where id = dossier_row.grant_id;
  if p_action not in ('view','download','verify') then denial_value := 'ACTION_NOT_ALLOWED';
  elsif not private.is_active_institution_member(dossier_row.institution_id) then denial_value := 'INSTITUTION_ACCESS_DENIED';
  elsif grant_row.status <> 'active' or grant_row.expires_at <= now() then denial_value := 'ACCESS_INACTIVE';
  elsif dossier_row.status <> 'ready' or dossier_row.expires_at <= now() then denial_value := 'PROFILE_INACTIVE';
  elsif not (p_resource_scope = any(grant_row.scopes)) then denial_value := 'DATA_NOT_APPROVED';
  elsif p_action = 'download' and not grant_row.download_allowed then denial_value := 'DOWNLOAD_NOT_APPROVED';
  end if;
  if denial_value is not null then
    insert into public.dossier_access_events(dossier_id,institution_id,actor_user_id,action,resource_scope,outcome,denial_code,ip_hash,user_agent_hash)
    values (dossier_row.id,dossier_row.institution_id,(select auth.uid()),case when p_action in ('view','download','verify') then p_action else 'view' end,
      p_resource_scope,'denied',denial_value,p_ip_hash,p_user_agent_hash);
    return jsonb_build_object('allowed', false, 'code', denial_value);
  end if;
  select item.snapshot into item_value from public.dossier_items item
  where item.dossier_id = dossier_row.id and item.item_type = p_resource_scope limit 1;
  insert into public.dossier_access_events(dossier_id,institution_id,actor_user_id,action,resource_scope,outcome,ip_hash,user_agent_hash)
  values (dossier_row.id,dossier_row.institution_id,(select auth.uid()),p_action,p_resource_scope,'allowed',p_ip_hash,p_user_agent_hash);
  return jsonb_build_object('allowed', true, 'scope', p_resource_scope, 'action', p_action,
    'data', coalesce(item_value, '{}'::jsonb), 'expiresAt', dossier_row.expires_at,
    'downloadAllowed', grant_row.download_allowed);
end;
$$;


--
-- Name: archive_document(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_document(p_document_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_document public.documents%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if not private.business_access(v_document.business_id) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    return jsonb_build_object('documentId', v_document.id, 'status', 'superseded', 'idempotent', true);
  end if;

  update public.documents
  set status = 'superseded', archived_at = now(), updated_at = now()
  where id = v_document.id;
  update public.document_versions
  set status = 'superseded'
  where document_id = v_document.id and status <> 'rejected';
  update public.document_upload_sessions
  set status = 'expired', updated_at = now()
  where document_id = v_document.id and status = 'pending';

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id
  ) values (
    v_user_id, 'user', v_document.business_id, 'DOCUMENT_ARCHIVED', 'document', v_document.id::text
  );
  return jsonb_build_object('documentId', v_document.id, 'status', 'superseded', 'idempotent', false);
end;
$$;


--
-- Name: attach_document(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_document(p_document_id uuid, p_target_type text, p_target_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_document public.documents%rowtype;
  v_target_business uuid;
  v_child record;
  v_attached jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_document_id is null or p_target_id is null or p_target_type is null then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select * into v_document from public.documents where id = p_document_id;
  if not found or v_document.business_id is distinct from v_business_id then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;

  v_target_business := private.attachment_target_business(p_target_type, p_target_id);
  if v_target_business is null then
    raise exception using errcode = '22023', message = 'ATTACHMENT_TARGET_NOT_FOUND';
  end if;
  if v_target_business is distinct from v_business_id then
    raise exception using errcode = '42501', message = 'ATTACHMENT_TARGET_DENIED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_document_id::text || ':' || p_target_type || ':' || p_target_id::text, 0));

  insert into public.document_attachments (business_id, document_id, target_type, target_id, created_by)
  values (v_business_id, p_document_id, p_target_type, p_target_id, v_user_id)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.document_attachments
    where document_id = p_document_id and target_type = p_target_type
      and target_id = p_target_id and removed_at is null;
  end if;
  v_attached := v_attached || jsonb_build_object(
    'id', v_id, 'target_type', p_target_type, 'target_id', p_target_id);

  -- Pintu D: bukti pembelian adalah bukti alat yang dibelinya.
  if p_target_type = 'transaction' then
    for v_child in
      select 'fixed_asset' as target_type, id as target_id from public.fixed_assets
      where business_id = v_business_id and source_transaction_id = p_target_id
      union all
      select 'loan', id from public.loans
      where business_id = v_business_id and source_transaction_id = p_target_id
    loop
      insert into public.document_attachments (business_id, document_id, target_type, target_id, created_by)
      values (v_business_id, p_document_id, v_child.target_type, v_child.target_id, v_user_id)
      on conflict do nothing
      returning id into v_id;

      if v_id is null then
        select id into v_id from public.document_attachments
        where document_id = p_document_id and target_type = v_child.target_type
          and target_id = v_child.target_id and removed_at is null;
      end if;
      v_attached := v_attached || jsonb_build_object(
        'id', v_id, 'target_type', v_child.target_type, 'target_id', v_child.target_id);
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'attachments', v_attached
  );
end;
$$;


--
-- Name: cancel_account_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_account_deletion() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_profile from public.profiles where auth_user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_NOT_FOUND';
  end if;
  if v_profile.deletion_requested_at is null then
    return jsonb_build_object('ok', true, 'idempotent', true);
  end if;

  update public.profiles set
    deletion_requested_at = null,
    deletion_scheduled_for = null,
    deletion_reason = null,
    updated_at = now()
  where auth_user_id = v_user_id;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, metadata)
  values (v_user_id, 'ACCOUNT_DELETION_CANCELLED', 'profile', v_profile.id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'idempotent', false);
end;
$$;


--
-- Name: cancel_ledger_transaction(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_ledger_transaction(p_transaction_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;
  if v_tx.ledger_status = 'cancelled' then
    return jsonb_build_object('transactionId', v_tx.id, 'status', 'cancelled', 'idempotent', true);
  end if;

  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, trim(p_reason));
  end if;

  update public.transactions
  set ledger_status = 'cancelled', cancelled_at = now(), cancelled_by = v_user_id, updated_at = now()
  where id = v_tx.id;

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, previous_values)
  values (v_tx.id, v_tx.business_id, v_user_id, 'cancelled', trim(p_reason), jsonb_build_object(
    'amountIdr', v_tx.amount_idr, 'type', v_tx.direction, 'date', v_tx.transaction_date,
    'categoryCode', v_tx.category_code, 'emkmCategoryCode', v_tx.emkm_category_code));

  return jsonb_build_object('transactionId', v_tx.id, 'status', 'cancelled', 'idempotent', false);
end;
$$;


--
-- Name: cancel_transaction(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_transaction(p_transaction_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.cancel_ledger_transaction(p_transaction_id, p_reason);
$$;


--
-- Name: cancel_transaction_capture(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_transaction_capture(p_capture_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  -- Bebas role: izinkan jika pemilik capture atau pemilik bisnis
  if v_capture.user_id <> v_user_id
    and not exists (
      select 1 from public.businesses b
      where b.id = v_capture.business_id and b.legacy_profile_id = v_user_id
    )
    and not exists (
      select 1 from public.business_members m
      where m.business_id = v_capture.business_id and m.user_id = v_user_id and m.status = 'active'
    ) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;
  if v_capture.status = 'cancelled' then
    return jsonb_build_object(
      'captureId', v_capture.id,
      'status', 'cancelled',
      'storagePath', v_capture.storage_path,
      'idempotent', true
    );
  end if;

  update public.ai_runs as run
  set status = 'cancelled', completed_at = now()
  from public.ai_jobs as job
  where run.job_id = job.id
    and job.capture_id = v_capture.id
    and run.status = 'running';

  update public.ai_jobs
  set status = 'cancelled', completed_at = now(), locked_at = null, locked_by = null, updated_at = now()
  where capture_id = v_capture.id and status in ('queued', 'running');

  update public.transaction_captures
  set status = 'cancelled', cancelled_at = now(), completed_at = now(), updated_at = now()
  where id = v_capture.id;

  insert into public.audit_events (
    actor_user_id,
    actor_type,
    business_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_user_id,
    'user',
    v_capture.business_id,
    'TRANSACTION_CAPTURE_CANCELLED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('previousStatus', v_capture.status)
  );

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'cancelled',
    'storagePath', v_capture.storage_path,
    'idempotent', false
  );
end;
$$;


--
-- Name: claim_capture_ai_job(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_capture_ai_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_attempt integer;
  v_run_id uuid;
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120
    or char_length(trim(coalesce(p_provider, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_model, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.*
  into v_job
  from public.ai_jobs as job
  where job.id = p_job_id
    and job.job_type = 'voice_to_ledger'
  for update skip locked;

  if not found
    or v_job.status <> 'queued'
    or v_job.available_at > now()
    or v_job.attempt_count >= v_job.max_attempts then
    return null;
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;

  if not found or v_capture.status in ('confirmed', 'cancelled', 'needs_review') then
    update public.ai_jobs
    set
      status = case when v_capture.status = 'needs_review' then 'succeeded' else 'cancelled' end,
      completed_at = now(),
      updated_at = now()
    where id = v_job.id;
    return null;
  end if;

  v_attempt := v_job.attempt_count + 1;
  v_run_id := gen_random_uuid();

  update public.ai_jobs
  set
    status = 'running',
    attempt_count = v_attempt,
    locked_at = now(),
    locked_by = trim(p_worker_id),
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where id = v_job.id;

  insert into public.ai_runs (
    id, job_id, attempt_number, provider, model, status, request_payload
  ) values (
    v_run_id,
    v_job.id,
    v_attempt,
    trim(p_provider),
    trim(p_model),
    'running',
    jsonb_build_object('inputMethod', v_capture.input_method)
  );

  update public.transaction_captures
  set
    status = 'processing',
    processing_started_at = coalesce(processing_started_at, now()),
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where id = v_capture.id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'runId', v_run_id,
    'attemptNumber', v_attempt,
    'maxAttempts', v_job.max_attempts,
    'captureId', v_capture.id,
    'businessId', v_capture.business_id,
    'requestedBy', v_job.requested_by,
    'inputMethod', v_capture.input_method,
    'sourceText', v_capture.source_text,
    'storagePath', v_capture.storage_path,
    'mimeType', v_capture.mime_type,
    'fileSize', v_capture.file_size
  );
end;
$$;


--
-- Name: claim_document_extraction_job(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_document_extraction_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_document public.documents%rowtype;
  v_attempt integer;
  v_run_id uuid;
begin
  if char_length(trim(coalesce(p_worker_id, ''))) not between 1 and 120
    or char_length(trim(coalesce(p_provider, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_model, ''))) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction'
  for update skip locked;
  if not found or v_job.status <> 'queued' or v_job.attempt_count >= v_job.max_attempts then
    return null;
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = v_job.document_version_id
  for update;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = v_version.document_id
  for update;
  if not found or v_document.status = 'superseded' or v_version.status = 'superseded' then
    update public.ai_jobs set status = 'cancelled', completed_at = now(), updated_at = now() where id = v_job.id;
    return null;
  end if;

  v_attempt := v_job.attempt_count + 1;
  v_run_id := gen_random_uuid();
  update public.ai_jobs
  set status = 'running', attempt_count = v_attempt, locked_at = now(),
    locked_by = trim(p_worker_id), failure_code = null, failure_message = null, updated_at = now()
  where id = v_job.id;
  insert into public.ai_runs (
    id, job_id, attempt_number, provider, model, status, request_payload
  ) values (
    v_run_id, v_job.id, v_attempt, trim(p_provider), trim(p_model), 'running',
    jsonb_build_object('docType', v_document.doc_type, 'mimeType', v_version.mime_type)
  );
  update public.document_extractions
  set status = 'processing', extractor = trim(p_provider), started_at = coalesce(started_at, now()), updated_at = now()
  where document_version_id = v_version.id;

  return jsonb_build_object(
    'jobId', v_job.id,
    'runId', v_run_id,
    'attemptNumber', v_attempt,
    'maxAttempts', v_job.max_attempts,
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'businessId', v_document.business_id,
    'requestedBy', v_job.requested_by,
    'docType', v_document.doc_type,
    'storagePath', v_version.storage_path,
    'mimeType', v_version.mime_type,
    'fileSize', v_version.file_size
  );
end;
$$;


--
-- Name: close_ledger_day(date, bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_ledger_day(p_closing_date date, p_opening_cash_idr bigint DEFAULT NULL::bigint, p_physical_cash_idr bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_physical_bank_idr bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.daily_closings%rowtype;
  v_in bigint;
  v_out bigint;
  v_count int;
  v_expected bigint;
  v_difference bigint;
  v_ledger_cash bigint;
  v_ledger_bank bigint;
  v_bank_difference bigint;
  v_cash_variance bigint;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_closing_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or (p_opening_cash_idr is not null and p_opening_cash_idr < 0)
    or (p_physical_cash_idr is not null and p_physical_cash_idr < 0)
    or (p_physical_bank_idr is not null and p_physical_bank_idr < 0)
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_closing_date::text, 0));
  select * into v_existing from public.daily_closings
  where business_id = v_business_id and closing_date = p_closing_date for update;
  if found and v_existing.status = 'closed' then
    return jsonb_build_object('closingId', v_existing.id, 'status', 'closed', 'idempotent', true);
  end if;

  select
    coalesce(sum(amount_idr) filter (where direction = 'income' and coalesce(emkm_category_code, 0) <> 10 and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    coalesce(sum(amount_idr) filter (where direction = 'expense' and coalesce(payment_method, 'cash') <> 'unpaid'), 0),
    count(*)
  into v_in, v_out, v_count
  from public.transactions
  where business_id = v_business_id and transaction_date = p_closing_date and ledger_status = 'confirmed';

  -- Saldo buku menurut jurnal pada tanggal itu.
  select
    coalesce(sum(line.debit) filter (where line.account_code = '1100'), 0)
      - coalesce(sum(line.credit) filter (where line.account_code = '1100'), 0),
    coalesce(sum(line.debit) filter (where line.account_code = '1200'), 0)
      - coalesce(sum(line.credit) filter (where line.account_code = '1200'), 0)
  into v_ledger_cash, v_ledger_bank
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = v_business_id
    and line.account_code in ('1100', '1200')
    and entry.entry_date <= p_closing_date;

  v_expected := case when p_opening_cash_idr is null then null else p_opening_cash_idr + v_in - v_out end;
  v_difference := case when v_expected is null or p_physical_cash_idr is null then null else p_physical_cash_idr - v_expected end;
  v_cash_variance := case when p_physical_cash_idr is null then null else p_physical_cash_idr - coalesce(v_ledger_cash, 0) end;
  v_bank_difference := case when p_physical_bank_idr is null then null else p_physical_bank_idr - coalesce(v_ledger_bank, 0) end;

  insert into public.daily_closings (
    business_id, closing_date, income_amount_idr, expense_amount_idr, transaction_count, status,
    closed_by, closed_at, opening_cash_idr, system_cash_in_idr, system_cash_out_idr,
    expected_cash_idr, physical_cash_idr, difference_idr, note,
    ledger_cash_idr, ledger_bank_idr, physical_bank_idr, bank_difference_idr, cash_variance_idr
  ) values (
    v_business_id, p_closing_date, v_in, v_out, v_count, 'closed', v_user_id, now(),
    p_opening_cash_idr, v_in, v_out, v_expected, p_physical_cash_idr, v_difference, nullif(trim(p_note), ''),
    coalesce(v_ledger_cash, 0), coalesce(v_ledger_bank, 0), p_physical_bank_idr, v_bank_difference, v_cash_variance
  )
  on conflict (business_id, closing_date) do update set
    income_amount_idr = excluded.income_amount_idr,
    expense_amount_idr = excluded.expense_amount_idr,
    transaction_count = excluded.transaction_count,
    status = 'closed',
    closed_by = excluded.closed_by,
    closed_at = now(),
    opening_cash_idr = excluded.opening_cash_idr,
    system_cash_in_idr = excluded.system_cash_in_idr,
    system_cash_out_idr = excluded.system_cash_out_idr,
    expected_cash_idr = excluded.expected_cash_idr,
    physical_cash_idr = excluded.physical_cash_idr,
    difference_idr = excluded.difference_idr,
    note = excluded.note,
    ledger_cash_idr = excluded.ledger_cash_idr,
    ledger_bank_idr = excluded.ledger_bank_idr,
    physical_bank_idr = excluded.physical_bank_idr,
    bank_difference_idr = excluded.bank_difference_idr,
    cash_variance_idr = excluded.cash_variance_idr,
    updated_at = now()
  returning id into v_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'DAILY_CLOSING_COMPLETED', 'daily_closing', v_id::text,
    jsonb_build_object('date', p_closing_date, 'transactionCount', v_count,
      'hasOpeningCash', p_opening_cash_idr is not null, 'hasPhysicalCash', p_physical_cash_idr is not null,
      'cashVarianceIdr', v_cash_variance));

  return jsonb_build_object(
    'closingId', v_id, 'status', 'closed', 'idempotent', false,
    'ledgerCashIdr', coalesce(v_ledger_cash, 0),
    'ledgerBankIdr', coalesce(v_ledger_bank, 0),
    'cashVarianceIdr', v_cash_variance
  );
end;
$$;


--
-- Name: complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_transcription text, p_draft_payload jsonb, p_latency_ms integer, p_prompt_tokens integer DEFAULT NULL::integer, p_completion_tokens integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_item_count integer;
begin
  if p_attempt_number < 1
    or p_latency_ms < 0
    or p_transcription is null
    or char_length(trim(p_transcription)) not between 1 and 2000
    or jsonb_typeof(p_draft_payload) <> 'array'
    or jsonb_array_length(p_draft_payload) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'voice_to_ledger'
  for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  if v_capture.status = 'cancelled' then
    update public.ai_runs
    set status = 'cancelled', latency_ms = p_latency_ms, completed_at = now()
    where job_id = v_job.id and attempt_number = p_attempt_number;
    update public.ai_jobs
    set status = 'cancelled', completed_at = now(), updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('captureId', v_capture.id, 'status', 'cancelled');
  end if;

  v_item_count := jsonb_array_length(p_draft_payload);

  update public.ai_runs
  set
    status = 'succeeded',
    response_payload = jsonb_build_object('itemCount', v_item_count),
    prompt_tokens = p_prompt_tokens,
    completion_tokens = p_completion_tokens,
    latency_ms = p_latency_ms,
    completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;

  update public.ai_jobs
  set status = 'succeeded', completed_at = now(), updated_at = now(), locked_at = null, locked_by = null
  where id = v_job.id;

  update public.transaction_captures
  set
    status = 'needs_review',
    transcription = trim(p_transcription),
    draft_payload = p_draft_payload,
    failure_code = null,
    failure_message = null,
    completed_at = now(),
    updated_at = now()
  where id = v_capture.id;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_job.requested_by,
    'system',
    v_job.business_id,
    'TRANSACTION_CAPTURE_NEEDS_REVIEW',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('itemCount', v_item_count, 'attemptNumber', p_attempt_number)
  );

  return jsonb_build_object('captureId', v_capture.id, 'status', 'needs_review', 'itemCount', v_item_count);
end;
$$;


--
-- Name: complete_document_extraction_job(uuid, integer, text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_extractor text, p_structured_data jsonb, p_latency_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
begin
  if p_attempt_number < 1 or p_latency_ms < 0
    or char_length(trim(coalesce(p_extractor, ''))) not between 1 and 80
    or jsonb_typeof(p_structured_data) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction' for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = v_job.document_version_id for update;

  update public.ai_runs
  set status = 'succeeded', response_payload = jsonb_build_object('structured', true),
    latency_ms = p_latency_ms, completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;
  update public.ai_jobs
  set status = 'succeeded', completed_at = now(), locked_at = null, locked_by = null, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = 'succeeded', extractor = trim(p_extractor), structured_data = p_structured_data,
    raw_text = null, failure_code = null, failure_message = null, completed_at = now(), updated_at = now()
  where document_version_id = v_version.id;
  update public.document_versions set status = 'uploaded' where id = v_version.id;
  update public.documents
  set
    status = 'uploaded',
    ai_notes = case
      when doc_type = 'nib' and p_structured_data ? 'nib'
        then 'NIB terdeteksi dan menunggu verifikasi.'
      else 'Dokumen tersimpan dan menunggu verifikasi.'
    end,
    updated_at = now()
  where id = v_version.document_id and current_version = v_version.version and status <> 'superseded';
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_job.requested_by, 'system', v_job.business_id, 'DOCUMENT_EXTRACTION_COMPLETED',
    'document_version', v_version.id::text,
    jsonb_build_object('extractor', trim(p_extractor), 'attemptNumber', p_attempt_number)
  );
  return jsonb_build_object('documentId', v_version.document_id, 'documentVersionId', v_version.id, 'status', 'uploaded');
end;
$$;


--
-- Name: complete_document_upload_session(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_document_upload_session(p_document_id uuid, p_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.document_upload_sessions%rowtype;
  v_document public.documents%rowtype;
  v_version_id uuid;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select upload_session.* into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.id = p_session_id and upload_session.document_id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.user_id <> v_user_id
    or not private.business_access(v_session.business_id) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_session.status = 'completed' then
    select version_record.id into v_version_id
    from public.document_versions as version_record
    where version_record.document_id = v_session.document_id
      and version_record.version = v_session.intended_version;
    select job.id into v_job_id
    from public.ai_jobs as job
    where job.document_version_id = v_version_id and job.job_type = 'document_extraction';
    return jsonb_build_object(
      'documentId', v_session.document_id,
      'versionId', v_version_id,
      'version', v_session.intended_version,
      'status', 'processing',
      'jobId', v_job_id,
      'idempotent', true
    );
  end if;
  if v_session.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_EXPIRED';
  end if;
  if not exists (
    select 1 from storage.objects as object_record
    where object_record.bucket_id = 'documents'
      and object_record.name = v_session.storage_path
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_OBJECT_NOT_FOUND';
  end if;

  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = v_session.document_id
  for update;

  if found then
    if v_document.business_id <> v_session.business_id
      or v_document.doc_type <> v_session.doc_type
      or v_document.status = 'superseded'
      or v_session.intended_version <> v_document.current_version + 1 then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
    end if;
    update public.document_versions
    set status = 'superseded'
    where document_id = v_document.id and status <> 'rejected';
    update public.documents
    set
      name = v_session.original_name,
      status = 'processing',
      current_version = v_session.intended_version,
      storage_path = v_session.storage_path,
      mime_type = v_session.mime_type,
      file_size = v_session.file_size,
      checksum_sha256 = v_session.checksum_sha256,
      ai_notes = null,
      file_url = null,
      rejection_code = null,
      rejection_reason = null,
      updated_at = now()
    where id = v_document.id;
  else
    if v_session.intended_version <> 1 then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
    end if;
    insert into public.documents (
      id, business_id, user_id, name, doc_type, status, current_version,
      storage_path, mime_type, file_size, checksum_sha256, file_url
    ) values (
      v_session.document_id, v_session.business_id, v_user_id,
      v_session.original_name, v_session.doc_type, 'processing', 1,
      v_session.storage_path, v_session.mime_type, v_session.file_size,
      v_session.checksum_sha256, null
    );
  end if;

  insert into public.document_versions (
    document_id, version, storage_path, mime_type, file_size,
    checksum_sha256, uploaded_by, original_name, status
  ) values (
    v_session.document_id, v_session.intended_version, v_session.storage_path,
    v_session.mime_type, v_session.file_size, v_session.checksum_sha256,
    v_user_id, v_session.original_name, 'processing'
  ) returning id into v_version_id;

  insert into public.document_extractions (document_version_id, status)
  values (v_version_id, 'queued');
  insert into public.document_verifications (document_version_id, status)
  values (v_version_id, 'pending');
  insert into public.ai_jobs (
    business_id, requested_by, document_version_id, job_type, status,
    idempotency_key, input_payload, max_attempts
  ) values (
    v_session.business_id, v_user_id, v_version_id, 'document_extraction',
    'queued', v_version_id::text,
    jsonb_build_object('documentId', v_session.document_id, 'documentVersionId', v_version_id),
    3
  ) returning id into v_job_id;

  update public.document_upload_sessions
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = v_session.id;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_session.business_id, 'DOCUMENT_VERSION_UPLOADED',
    'document', v_session.document_id::text,
    jsonb_build_object('versionId', v_version_id, 'version', v_session.intended_version, 'docType', v_session.doc_type)
  );

  return jsonb_build_object(
    'documentId', v_session.document_id,
    'versionId', v_version_id,
    'version', v_session.intended_version,
    'status', 'processing',
    'jobId', v_job_id,
    'idempotent', false
  );
end;
$$;


--
-- Name: confirm_document_extraction(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_document_extraction(p_document_id uuid, p_document_version_id uuid, p_confirmed_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_extraction public.document_extractions%rowtype;
  v_review_status text;
  v_allowed_keys text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if jsonb_typeof(p_confirmed_data) <> 'object'
    or octet_length(p_confirmed_data::text) > 8192 then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if not private.business_access(v_document.business_id)
    or v_document.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ARCHIVED';
  end if;
  if v_document.doc_type not in ('ktp', 'nib', 'npwp') then
    raise exception using errcode = '22023', message = 'DOCUMENT_OCR_NOT_SUPPORTED';
  end if;

  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.id = p_document_version_id
    and version_record.document_id = v_document.id
    and version_record.version = v_document.current_version
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_CONFLICT';
  end if;
  select extraction_record.* into v_extraction
  from public.document_extractions as extraction_record
  where extraction_record.document_version_id = v_version.id
  for update;
  if not found or v_extraction.status <> 'succeeded' or v_extraction.structured_data is null then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_READY';
  end if;

  if coalesce(p_confirmed_data ->> 'documentType', '') <> v_document.doc_type
    or jsonb_typeof(p_confirmed_data -> 'confidence') <> 'number'
    or (p_confirmed_data ->> 'confidence')::numeric not between 0 and 1 then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  if v_document.doc_type = 'ktp' then
    v_allowed_keys := array['documentType', 'nik', 'name', 'placeOfBirth', 'dateOfBirth', 'address', 'confidence'];
    if coalesce(p_confirmed_data ->> 'nik', '') !~ '^\d{16}$'
      or char_length(trim(coalesce(p_confirmed_data ->> 'name', ''))) not between 2 and 160
      or (p_confirmed_data ->> 'dateOfBirth' is not null and p_confirmed_data ->> 'dateOfBirth' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  elsif v_document.doc_type = 'nib' then
    v_allowed_keys := array['documentType', 'nib', 'businessName', 'ownerName', 'businessAddress', 'confidence'];
    if coalesce(p_confirmed_data ->> 'nib', '') !~ '^\d{13}$' then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  else
    v_allowed_keys := array['documentType', 'npwp', 'taxpayerName', 'address', 'confidence'];
    if coalesce(p_confirmed_data ->> 'npwp', '') !~ '^\d{15,16}$'
      or char_length(trim(coalesce(p_confirmed_data ->> 'taxpayerName', ''))) not between 2 and 160 then
      raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
    end if;
  end if;
  if p_confirmed_data - v_allowed_keys <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'DOCUMENT_EXTRACTION_CONFIRMATION_INVALID';
  end if;

  v_review_status := case
    when p_confirmed_data = v_extraction.structured_data then 'owner_confirmed'
    else 'owner_corrected'
  end;
  update public.document_extractions
  set owner_review_status = v_review_status,
    confirmed_data = p_confirmed_data,
    owner_confirmed_by = v_user_id,
    owner_confirmed_at = now(),
    updated_at = now()
  where id = v_extraction.id;
  update public.documents
  set ai_notes = case
      when v_review_status = 'owner_corrected'
        then 'Hasil OCR telah dikoreksi pemilik dan menunggu verifikasi sumber.'
      else 'Hasil OCR telah dikonfirmasi pemilik dan menunggu verifikasi sumber.'
    end,
    updated_at = now()
  where id = v_document.id;
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'business_owner', v_document.business_id, 'DOCUMENT_EXTRACTION_OWNER_CONFIRMED',
    'document_version', v_version.id::text,
    jsonb_build_object(
      'docType', v_document.doc_type,
      'reviewStatus', v_review_status,
      'confirmedFields', (select jsonb_agg(field_name order by field_name) from jsonb_object_keys(p_confirmed_data) as field_name)
    )
  );
  return jsonb_build_object(
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'reviewStatus', v_review_status,
    'confirmedAt', now()
  );
end;
$_$;


--
-- Name: confirm_transaction_capture(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_transaction_capture(p_capture_id uuid, p_confirmation_idempotency_key text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_item jsonb;
  v_transaction_ids jsonb := '[]'::jsonb;
  v_transaction_id uuid;
  v_index int := 0;
  v_amount_idr bigint;
  v_transaction_type text;
  v_category_code text;
  v_category_group text;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_unit_price_idr bigint;
  v_payment_method text;
  v_sales_channel text;
  v_transaction_date date;
  v_client_item_id text;
  v_emkm smallint;
  v_subtype text;
  v_direction text;
  v_counterparty_name text;
  v_counterparty_id uuid;
  v_counterparty_type text;
  v_interest bigint;
  v_label text;
  v_ai_job_id uuid;
  v_ai_run_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_confirmation_idempotency_key is null or char_length(trim(p_confirmation_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  if v_capture.user_id <> v_user_id and not private.accounting_business_access(v_capture.business_id) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    if v_capture.confirmation_idempotency_key = trim(p_confirmation_idempotency_key) then
      select coalesce(jsonb_agg(transaction_record.id order by transaction_record.created_at, transaction_record.id), '[]'::jsonb)
      into v_transaction_ids
      from public.transactions as transaction_record
      where transaction_record.capture_id = v_capture.id;
      return jsonb_build_object(
        'captureId', v_capture.id,
        'status', 'confirmed',
        'transactionIds', v_transaction_ids,
        'idempotent', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;

  if v_capture.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_CANCELLED';
  end if;
  if v_capture.status not in ('needs_review', 'failed') then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_READY';
  end if;

  for v_item in select jsonb_array_elements(p_items) loop
    v_index := v_index + 1;
    v_client_item_id := nullif(trim(coalesce(v_item->>'clientItemId', '')), '');
    v_transaction_type := lower(trim(coalesce(v_item->>'transactionType', '')));
    v_category_code := lower(trim(coalesce(v_item->>'categoryCode', '')));
    v_description := trim(coalesce(v_item->>'description', ''));
    v_payment_method := nullif(lower(trim(coalesce(v_item->>'paymentMethod', ''))), '');
    v_sales_channel := nullif(trim(coalesce(v_item->>'salesChannel', '')), '');
    v_counterparty_name := nullif(trim(coalesce(v_item->>'counterpartyName', '')), '');

    begin
      v_amount_idr := (v_item->>'amountIdr')::bigint;
      v_transaction_date := (v_item->>'transactionDate')::date;
      v_emkm := nullif(trim(coalesce(v_item->>'emkmCategoryCode', '')), '')::smallint;
      v_interest := coalesce(nullif(trim(coalesce(v_item->>'interestAmountIdr', '')), '')::bigint, 0);
    exception when others then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end;
    v_subtype := nullif(trim(coalesce(v_item->>'emkmCategorySubtype', '')), '');

    if v_transaction_type not in ('income', 'expense')
      or v_amount_idr is null
      or v_amount_idr <= 0
      or v_amount_idr > 100000000000
      or v_transaction_date is null
      or v_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date + interval '1 day'
      or char_length(v_description) not between 1 and 255
      or v_interest < 0
      or v_interest > v_amount_idr
      or v_category_code not in (
        'sales', 'materials', 'operations', 'payroll', 'other',
        'sales_direct', 'sales_delivery', 'sales_catering', 'raw_material', 'packaging',
        'utilities', 'wage', 'rent', 'platform_fee', 'transport', 'equipment', 'promotion',
        'sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other',
        'raw_ingredients', 'inventory', 'marketing', 'maintenance', 'supplies',
        'wages', 'salary', 'bonus', 'tax', 'loan_repayment'
      ) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_quantity := null;
    if v_item ? 'quantity' and (v_item->>'quantity') is not null and trim(v_item->>'quantity') <> '' then
      begin
        v_quantity := (v_item->>'quantity')::numeric;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_quantity <= 0 or v_quantity > 1000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    v_unit := nullif(trim(coalesce(v_item->>'unit', '')), '');
    if v_unit is not null and char_length(v_unit) > 40 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_unit_price_idr := null;
    if v_item ? 'unitPriceIdr' and (v_item->>'unitPriceIdr') is not null and trim(v_item->>'unitPriceIdr') <> '' then
      begin
        v_unit_price_idr := (v_item->>'unitPriceIdr')::bigint;
      exception when others then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end;
      if v_unit_price_idr <= 0 or v_unit_price_idr > 100000000000 then
        raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
      end if;
    end if;

    if v_payment_method is not null and v_payment_method not in ('cash', 'qris', 'bank_transfer', 'ewallet', 'edc', 'credit', 'unpaid', 'other') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_sales_channel is not null and char_length(v_sales_channel) > 80 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_counterparty_name is not null and char_length(v_counterparty_name) > 120 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    -- Kategori EMKM adalah sumber kebenaran akun. Bila aplikasi belum
    -- mengirimnya (klien lama), diturunkan dari kategori capture lama.
    if v_emkm is null then
      select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
      from private.emkm_category_from_legacy(v_transaction_type, null::text, v_category_code) as legacy;
    end if;
    select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
    into v_emkm, v_subtype, v_payment_method, v_direction
    from private.normalize_emkm_category(v_emkm, v_subtype, v_payment_method) as normalized;
    select legacy.o_group, legacy.o_code into v_category_group, v_category_code
    from private.legacy_category_for_emkm(v_emkm, v_subtype) as legacy;
    v_label := case v_category_group
      when 'sales' then 'Penjualan'
      when 'cost_of_goods' then 'Bahan & Produksi'
      when 'operating_expense' then 'Operasional'
      when 'asset' then 'Aset'
      else 'Lainnya'
    end;

    v_counterparty_id := null;
    if v_counterparty_name is not null then
      v_counterparty_type := case
        when v_emkm in (3, 10) then 'PELANGGAN'
        when v_emkm = 5 then 'SUPPLIER'
        else 'LAIN'
      end;
      insert into public.counterparties (business_id, name, type, created_by)
      values (v_capture.business_id, v_counterparty_name, v_counterparty_type, v_user_id)
      on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
      returning id into v_counterparty_id;
    end if;

    v_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id, business_id, user_id, capture_id, client_item_id, direction, type,
      amount_idr, nominal, transaction_date, tanggal, category_group, category_code,
      category, kategori, item, qty, quantity, unit, unit_price_idr, payment_method,
      sales_channel, ledger_status, emkm_category_code, emkm_category_subtype,
      counterparty_id, counterparty, interest_amount_idr, needs_reclass, created_at, updated_at
    ) values (
      v_transaction_id, v_capture.business_id, v_user_id, v_capture.id, v_client_item_id,
      v_direction, case v_direction when 'income' then 'masuk' else 'keluar' end,
      v_amount_idr, v_amount_idr, v_transaction_date, v_transaction_date,
      v_category_group, v_category_code, v_label, v_label, v_description,
      coalesce(v_quantity::text || coalesce(' ' || v_unit, ''), '1'),
      v_quantity, v_unit, v_unit_price_idr, v_payment_method, v_sales_channel, 'confirmed',
      v_emkm, v_subtype, v_counterparty_id, v_counterparty_name, v_interest, false, now(), now()
    );

    perform public.fn_post_transaction_journal(v_transaction_id);

    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_transaction_id);
  end loop;

  update public.transaction_captures
  set status = 'confirmed',
      draft_payload = p_items,
      confirmation_idempotency_key = trim(p_confirmation_idempotency_key),
      confirmed_by = v_user_id,
      confirmed_at = now(),
      completed_at = now(),
      updated_at = now()
  where id = v_capture.id;

  -- `ai_jobs` tidak punya kolom `result`, dan status yang sah adalah
  -- queued/running/succeeded/failed/cancelled -- bukan 'completed' seperti
  -- yang ditulis 0027.
  update public.ai_jobs
  set status = 'succeeded',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where capture_id = v_capture.id
    and job_type = 'voice_to_ledger'
    and status not in ('succeeded', 'cancelled');

  -- Seberapa banyak pemilik mengoreksi tebakan AI adalah umpan balik yang
  -- dipakai untuk menilai kualitas ekstraksi (pola 0015).
  select job.id into v_ai_job_id
  from public.ai_jobs as job
  where job.capture_id = v_capture.id and job.job_type = 'voice_to_ledger'
  limit 1;

  if v_ai_job_id is not null then
    select run.id into v_ai_run_id
    from public.ai_runs as run
    where run.job_id = v_ai_job_id
    order by run.attempt_number desc
    limit 1;

    insert into public.ai_feedback (job_id, run_id, user_id, helpful, correction)
    values (
      v_ai_job_id, v_ai_run_id, v_user_id,
      v_capture.draft_payload = p_items,
      jsonb_build_object(
        'changed', v_capture.draft_payload is distinct from p_items,
        'originalItemCount', coalesce(jsonb_array_length(v_capture.draft_payload), 0),
        'reviewedItemCount', jsonb_array_length(v_transaction_ids)
      )
    );
  end if;

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'user', v_capture.business_id, 'TRANSACTION_CAPTURE_CONFIRMED',
    'transaction_capture', v_capture.id::text,
    jsonb_build_object('transactionIds', v_transaction_ids, 'transactionCount', jsonb_array_length(v_transaction_ids))
  );

  -- Catatan baru mengubah bukti usaha, jadi kesiapan dihitung ulang. 0027
  -- menghilangkan antrean ini; dikembalikan sesuai 0015.
  insert into public.ai_jobs (
    business_id, requested_by, capture_id, job_type, status,
    idempotency_key, input_payload, max_attempts
  ) values (
    v_capture.business_id, v_user_id, v_capture.id,
    'readiness_recalculation', 'queued',
    'capture:' || v_capture.id::text,
    jsonb_build_object('reason', 'ledger_confirmed', 'captureId', v_capture.id),
    3
  )
  on conflict (business_id, job_type, idempotency_key) where business_id is not null
  do nothing;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'confirmed',
    'transactionIds', v_transaction_ids,
    'idempotent', false
  );
end;
$$;


--
-- Name: consume_institution_dossier_credit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_institution_dossier_credit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare consumed boolean;
begin
  update public.institution_entitlements
  set credits_used = credits_used + 1, updated_at = now()
  where institution_id = new.institution_id
    and dossier_credits > 0
    and credits_used < dossier_credits;
  if not found and exists (
    select 1 from public.institution_entitlements entitlement
    where entitlement.institution_id = new.institution_id and entitlement.dossier_credits > 0
  ) then
    raise exception 'DOSSIER_CREDITS_EXHAUSTED';
  end if;
  return new;
end;
$$;


--
-- Name: correct_opening_balances(text, date, bigint, bigint, jsonb, jsonb, bigint, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.correct_opening_balances(p_reason text, p_start_date date, p_cash_idr bigint DEFAULT 0, p_bank_idr bigint DEFAULT 0, p_receivables jsonb DEFAULT '[]'::jsonb, p_payables jsonb DEFAULT '[]'::jsonb, p_inventory_idr bigint DEFAULT 0, p_assets jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.opening_balances%rowtype;
  v_stranded int;
  v_months int;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  perform private.assert_opening_payload(p_start_date, p_cash_idr, p_bank_idr, p_inventory_idr,
    p_receivables, p_payables, p_assets, p_notes);

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  select * into v_existing from public.opening_balances where business_id = v_business_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'OPENING_BALANCE_NOT_FOUND';
  end if;

  -- Tanggal mulai boleh dimajukan bebas. Dimundurkan hanya bila tidak ada
  -- catatan yang jadi terkurung di belakangnya: jurnalnya sudah ada dan tidak
  -- bisa dicabut, jadi angkanya akan terhitung dua kali.
  if p_start_date > v_existing.start_date then
    select count(*) into v_stranded
    from public.transactions
    where business_id = v_business_id
      and ledger_status = 'confirmed'
      and coalesce(transaction_date, tanggal) < p_start_date;
    if v_stranded > 0 then
      raise exception using errcode = 'P0001',
        message = format('OPENING_START_DATE_CONFLICT: %s', v_stranded);
    end if;
  end if;

  -- Penyusutan dibongkar dari bulan paling awal yang terpengaruh.
  v_months := private.reset_depreciation_from(
    v_business_id,
    least(date_trunc('month', v_existing.start_date), date_trunc('month', p_start_date))::date,
    'Kondisi awal usaha diperbaiki pemilik');

  if v_existing.journal_entry_id is not null then
    perform private.reverse_journal_entry_on(
      v_existing.journal_entry_id, trim(p_reason), v_existing.start_date);
  end if;

  v_result := private.rebuild_opening_balance(v_existing.id, p_start_date, p_cash_idr, p_bank_idr,
    p_receivables, p_payables, p_inventory_idr, p_assets, p_notes, v_user_id, true);

  update public.opening_balances
  set corrected_at = now(),
      correction_count = correction_count + 1,
      last_reason = trim(p_reason)
  where id = v_existing.id;

  -- Dipasang kembali di transaksi yang sama, supaya tidak pernah ada yang
  -- sempat melihat pembukuan yang setengah dihitung ulang.
  perform private.post_depreciation_through(
    v_business_id, (now() at time zone 'Asia/Jakarta')::date);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_CORRECTED', 'opening_balance', v_existing.id::text,
    jsonb_build_object(
      'reason', trim(p_reason),
      'previousStartDate', v_existing.start_date,
      'startDate', p_start_date,
      'equityIdr', v_result->'equityIdr',
      'depreciationMonthsRecomputed', v_months));

  return v_result || jsonb_build_object('depreciationMonthsRecomputed', v_months);
end;
$$;


--
-- Name: create_document_upload_session(text, text, text, text, bigint, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_document_upload_session(p_idempotency_key text, p_doc_type text, p_original_name text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_business_id uuid DEFAULT NULL::uuid, p_document_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_session public.document_upload_sessions%rowtype;
  v_document public.documents%rowtype;
  v_session_id uuid;
  v_target_document_id uuid;
  v_next_version int;
  v_max_size bigint;
  v_extension text;
  v_storage_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if not private.document_type_is_known(p_doc_type) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_original_name is null or char_length(trim(p_original_name)) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_MEDIA_TYPE';
  end if;

  v_max_size := case
    when p_doc_type in ('rekening_koran', 'qris', 'laporan_keuangan') then 10485760
    when p_doc_type = 'foto_tempat_usaha' then 8388608
    else 5242880
  end;
  if p_file_size is null or p_file_size < 1 or p_file_size > v_max_size then
    raise exception using errcode = '22023', message = 'FILE_TOO_LARGE';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id, p_business_id);
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  -- Dokumen usaha adalah surat milik pemilik (KTP, NIB, NPWP). Sisa daur hidup
  -- dokumen -- complete_document_upload_session, archive_document, dan policy
  -- document_versions -- memang masih menuntut 'owner' sejak 0016. Tanpa syarat
  -- yang sama di sini, anggota staf bisa memulai unggahan yang tidak akan
  -- pernah bisa ia selesaikan.
  if not private.business_access(v_business_id) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || trim(p_idempotency_key), 0));

  select upload_session.*
  into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.user_id = v_user_id
    and upload_session.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_session.business_id <> v_business_id
      or v_session.doc_type <> p_doc_type
      or v_session.original_name <> trim(p_original_name)
      or v_session.mime_type <> p_mime_type
      or v_session.file_size <> p_file_size
      or v_session.checksum_sha256 <> lower(p_checksum_sha256)
      or (p_document_id is not null and v_session.document_id <> p_document_id) then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'sessionId', v_session.id,
      'documentId', v_session.document_id,
      'businessId', v_session.business_id,
      'docType', v_session.doc_type,
      'originalName', v_session.original_name,
      'version', v_session.intended_version,
      'storagePath', v_session.storage_path,
      'mimeType', v_session.mime_type,
      'fileSize', v_session.file_size,
      'checksumSha256', v_session.checksum_sha256,
      'status', v_session.status,
      'expiresAt', v_session.expires_at,
      'idempotent', true
    );
  end if;

  if p_document_id is not null then
    select document_record.*
    into v_document
    from public.documents as document_record
    where document_record.id = p_document_id
      and document_record.business_id = v_business_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'DOCUMENT_NOT_FOUND';
    end if;
    if v_document.doc_type <> p_doc_type then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    v_target_document_id := v_document.id;
    v_next_version := v_document.current_version + 1;
  else
    v_target_document_id := gen_random_uuid();
    v_next_version := 1;
  end if;

  v_session_id := gen_random_uuid();
  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'bin'
  end;
  -- Policy storage menuntut segmen pertama sama dengan auth.uid()
  -- (`split_part(name, '/', 1)`), jadi path 'documents/...' dari 0027 tidak
  -- akan pernah lolos. Konvensi yang benar sejak 0016:
  -- '{user_id}/{business_id}/{document_id}/{session_id}.{ext}'.
  v_storage_path := v_user_id::text || '/' || v_business_id::text || '/' ||
    v_target_document_id::text || '/' || v_session_id::text || '.' || v_extension;

  insert into public.document_upload_sessions (
    id,
    idempotency_key,
    business_id,
    user_id,
    document_id,
    doc_type,
    original_name,
    intended_version,
    storage_path,
    mime_type,
    file_size,
    checksum_sha256,
    status,
    expires_at,
    created_at,
    updated_at
  ) values (
    v_session_id,
    trim(p_idempotency_key),
    v_business_id,
    v_user_id,
    v_target_document_id,
    p_doc_type,
    trim(p_original_name),
    v_next_version,
    v_storage_path,
    p_mime_type,
    p_file_size,
    lower(p_checksum_sha256),
    'pending',
    now() + interval '2 hours',
    now(),
    now()
  )
  returning * into v_session;

  insert into public.audit_events (
    actor_user_id,
    actor_type,
    business_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    v_user_id,
    'user',
    v_business_id,
    'DOCUMENT_UPLOAD_SESSION_CREATED',
    'document_upload_session',
    v_session.id::text,
    jsonb_build_object(
      'docType', v_session.doc_type,
      'documentId', v_session.document_id,
      'version', v_session.intended_version
    )
  );

  return jsonb_build_object(
    'sessionId', v_session.id,
    'documentId', v_session.document_id,
    'businessId', v_session.business_id,
    'docType', v_session.doc_type,
    'originalName', v_session.original_name,
    'version', v_session.intended_version,
    'storagePath', v_session.storage_path,
    'mimeType', v_session.mime_type,
    'fileSize', v_session.file_size,
    'checksumSha256', v_session.checksum_sha256,
    'status', v_session.status,
    'expiresAt', v_session.expires_at,
    'idempotent', false
  );
end;
$_$;


--
-- Name: create_dossier_request(uuid, uuid, text, text, text[], text[], integer, boolean, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_dossier_request(p_business_id uuid, p_program_id uuid, p_purpose_code text, p_purpose_description text, p_requested_scopes text[], p_required_scopes text[] DEFAULT '{}'::text[], p_requested_duration_days integer DEFAULT 14, p_download_requested boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text, p_institution_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  institution_id_value uuid;
  request_row public.dossier_requests%rowtype;
  allowed_scopes constant text[] := array['business_identity','readiness','financial_summary','nib','npwp','owner_identity','qris_history','sector_certificates'];
begin
  select member.institution_id into institution_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid()) and member.status = 'active'
    and member.role in ('admin','analyst','reviewer')
    and institution.status = 'active' and institution.active
    and (p_institution_id is null or member.institution_id = p_institution_id)
  order by member.created_at limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  if not exists (select 1 from public.businesses where id = p_business_id and status = 'active') then
    raise exception 'CANDIDATE_NOT_FOUND';
  end if;
  if p_program_id is not null and not exists (
    select 1 from public.programs where id = p_program_id and institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if nullif(trim(p_purpose_code), '') is null or char_length(trim(p_purpose_description)) < 10 then
    raise exception 'PURPOSE_REQUIRED';
  end if;
  if char_length(trim(p_purpose_description)) > 300 then raise exception 'PURPOSE_TOO_LONG'; end if;
  if p_requested_duration_days not between 1 and 90 then raise exception 'INVALID_DURATION'; end if;
  if cardinality(p_requested_scopes) = 0 or not (p_requested_scopes <@ allowed_scopes)
    or not (p_required_scopes <@ p_requested_scopes) then raise exception 'INVALID_SCOPE'; end if;

  if p_idempotency_key is not null then
    select * into request_row from public.dossier_requests
    where institution_id = institution_id_value and requested_by = (select auth.uid())
      and idempotency_key = p_idempotency_key;
    if request_row.id is not null then
      return jsonb_build_object('requestId', request_row.id, 'status', request_row.status, 'idempotent', true);
    end if;
  end if;
  update public.consent_grants set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'active' and expires_at <= now();
  update public.dossiers set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'ready' and expires_at <= now();
  update public.dossier_requests set status = 'expired'
  where institution_id = institution_id_value and business_id = p_business_id
    and status = 'pending' and expires_at <= now();
  if exists (
    select 1 from public.consent_grants as grant_row
    where grant_row.institution_id = institution_id_value and grant_row.business_id = p_business_id
      and grant_row.status = 'active' and grant_row.expires_at > now()
  ) then raise exception 'ACTIVE_ACCESS_EXISTS'; end if;

  -- Anti-spam ke UMKM: maksimal 20 permintaan per organisasi per hari.
  if (select count(*) from public.dossier_requests
      where institution_id = institution_id_value
        and created_at >= date_trunc('day', now())) >= 20 then
    raise exception 'REQUEST_RATE_LIMITED';
  end if;

  insert into public.dossier_requests (
    institution_id, business_id, program_id, requested_by, purpose, purpose_code,
    purpose_description, requested_scopes, required_scopes, requested_duration_days,
    download_requested, idempotency_key, status, expires_at
  ) values (
    institution_id_value, p_business_id, p_program_id, (select auth.uid()), trim(p_purpose_description),
    trim(p_purpose_code), trim(p_purpose_description), p_requested_scopes, p_required_scopes,
    p_requested_duration_days, p_download_requested, p_idempotency_key, 'pending', now() + interval '7 days'
  ) returning * into request_row;
  return jsonb_build_object('requestId', request_row.id, 'status', request_row.status, 'idempotent', false);
exception
  when unique_violation then raise exception 'PENDING_REQUEST_EXISTS';
end;
$$;


--
-- Name: create_ledger_transaction(text, text, bigint, date, text, text, text, numeric, text, bigint, text, text, text, smallint, text, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_ledger_transaction(p_idempotency_key text, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_quantity numeric DEFAULT NULL::numeric, p_unit text DEFAULT NULL::text, p_unit_price_idr bigint DEFAULT NULL::bigint, p_payment_method text DEFAULT NULL::text, p_sales_channel text DEFAULT NULL::text, p_counterparty text DEFAULT NULL::text, p_emkm_category_code smallint DEFAULT NULL::smallint, p_emkm_category_subtype text DEFAULT NULL::text, p_counterparty_id uuid DEFAULT NULL::uuid, p_interest_amount_idr bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_category_label text;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text := p_payment_method;
  v_direction text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 200
    or p_transaction_type not in ('income', 'expense')
    or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description, ''))) not between 1 and 160
    or (p_quantity is not null and p_quantity <= 0)
    or (p_unit_price_idr is not null and p_unit_price_idr <= 0)
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','edc','credit','unpaid','other'))
    or char_length(coalesce(p_unit, '')) > 40
    or char_length(coalesce(p_sales_channel, '')) > 80
    or char_length(coalesce(p_counterparty, '')) > 120
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > p_amount_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if v_emkm is null then
    select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
    from private.emkm_category_from_legacy(p_transaction_type, p_category_group, p_category_code) as legacy;
  end if;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || trim(p_idempotency_key), 0));
  select * into v_existing from public.transactions
  where business_id = v_business_id and idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object('transactionId', v_existing.id, 'idempotent', true);
  end if;

  v_category_label := case p_category_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  insert into public.transactions (
    business_id, user_id, idempotency_key, item, qty, direction, type, amount_idr, nominal,
    category, kategori, category_group, category_code, transaction_date, tanggal, quantity, unit,
    unit_price_idr, payment_method, sales_channel, counterparty, ledger_status,
    emkm_category_code, emkm_category_subtype, counterparty_id, interest_amount_idr, needs_reclass
  ) values (
    v_business_id, v_user_id, trim(p_idempotency_key), trim(p_description),
    coalesce(p_quantity::text || coalesce(' ' || nullif(trim(p_unit), ''), ''), '1'),
    coalesce(v_direction, p_transaction_type),
    case coalesce(v_direction, p_transaction_type) when 'income' then 'masuk' else 'keluar' end,
    p_amount_idr, p_amount_idr, v_category_label, v_category_label, p_category_group, p_category_code,
    p_transaction_date, p_transaction_date, p_quantity, nullif(trim(p_unit), ''), p_unit_price_idr,
    v_payment, nullif(trim(p_sales_channel), ''), nullif(trim(p_counterparty), ''), 'confirmed',
    v_emkm, v_subtype, p_counterparty_id, coalesce(p_interest_amount_idr, 0), false
  ) returning * into v_transaction;

  v_entry_id := public.fn_post_transaction_journal(v_transaction.id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, new_values)
  values (v_transaction.id, v_business_id, v_user_id, 'created', jsonb_build_object(
    'amountIdr', p_amount_idr, 'type', p_transaction_type, 'date', p_transaction_date,
    'categoryCode', p_category_code, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', v_transaction.id, 'idempotent', false, 'journalEntryId', v_entry_id);
end;
$$;


--
-- Name: create_transaction_capture(text, text, uuid, text, text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_transaction_capture(p_idempotency_key text, p_input_method text, p_business_id uuid DEFAULT NULL::uuid, p_source_text text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_file_size bigint DEFAULT NULL::bigint, p_checksum_sha256 text DEFAULT NULL::text, p_capture_path text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_capture public.transaction_captures%rowtype;
  v_capture_id uuid;
  v_extension text;
  v_storage_path text;
  v_has_audio boolean;
  v_has_text boolean;
  v_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method not in ('voice', 'manual') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_has_text := p_source_text is not null
    and char_length(trim(p_source_text)) between 1 and 2000;
  v_has_audio := p_mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')
    and p_file_size is not null and p_file_size between 1 and 10485760;

  if p_input_method = 'manual' and not v_has_text then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Suara kini sah dengan audio ATAU transkrip. Tanpa keduanya, tidak ada yang
  -- bisa diproses.
  if p_input_method = 'voice' and not (v_has_audio or v_has_text) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-fA-F0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_capture_path is not null and p_capture_path not in ('TEXT_ONLY', 'WHISPER') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id, p_business_id);
  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || trim(p_idempotency_key), 0));

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.business_id = v_business_id
    and capture.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_capture.user_id is distinct from v_user_id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'id', v_capture.id,
      'businessId', v_capture.business_id,
      'inputMethod', v_capture.input_method,
      'status', v_capture.status,
      'storagePath', v_capture.storage_path,
      'capturePath', v_capture.capture_path,
      'createdAt', v_capture.created_at,
      'idempotent', true
    );
  end if;

  v_capture_id := gen_random_uuid();
  v_path := coalesce(
    p_capture_path,
    case when p_input_method = 'voice' and not v_has_audio then 'TEXT_ONLY'
         when p_input_method = 'voice' then 'WHISPER'
         else null end
  );

  -- Path penyimpanan hanya dibuat bila audionya memang akan diunggah.
  if p_input_method = 'voice' and v_has_audio and v_path is distinct from 'TEXT_ONLY' then
    v_extension := case p_mime_type
      when 'audio/webm' then 'webm'
      when 'audio/mp4' then 'mp4'
      when 'audio/ogg' then 'ogg'
      when 'audio/mpeg' then 'mp3'
      else 'webm'
    end;
    -- Path harus diawali user_id agar sesuai policy storage
    -- (split_part(name, '/', 1) = auth.uid()) dan konvensi bucket captures.
    v_storage_path := v_user_id::text || '/' || v_capture_id::text || '/source.' || v_extension;
  else
    v_storage_path := null;
  end if;

  insert into public.transaction_captures (
    id, business_id, user_id, idempotency_key, input_method, status,
    source_text, storage_path, mime_type, file_size, checksum_sha256,
    capture_path, created_at, updated_at
  ) values (
    v_capture_id,
    v_business_id,
    v_user_id,
    trim(p_idempotency_key),
    p_input_method,
    'draft',
    case when v_has_text then trim(p_source_text) else null end,
    v_storage_path,
    case when v_storage_path is not null then p_mime_type else null end,
    case when v_storage_path is not null then p_file_size else null end,
    case when v_storage_path is not null and p_checksum_sha256 is not null
      then lower(p_checksum_sha256) else null end,
    v_path,
    now(),
    now()
  ) returning * into v_capture;

  return jsonb_build_object(
    'id', v_capture.id,
    'businessId', v_capture.business_id,
    'inputMethod', v_capture.input_method,
    'status', v_capture.status,
    'storagePath', v_capture.storage_path,
    'capturePath', v_capture.capture_path,
    'createdAt', v_capture.created_at,
    'idempotent', false
  );
end;
$_$;


--
-- Name: detach_document(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detach_document(p_attachment_id uuid, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_row public.document_attachments%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'DETACH_REASON_REQUIRED';
  end if;

  select * into v_row from public.document_attachments where id = p_attachment_id for update;
  if not found or v_row.business_id is distinct from v_business_id then
    raise exception using errcode = '42501', message = 'ATTACHMENT_ACCESS_DENIED';
  end if;
  if v_row.removed_at is not null then
    return jsonb_build_object('ok', true, 'id', v_row.id, 'idempotent', true);
  end if;

  update public.document_attachments
  set removed_at = now(), removed_reason = trim(p_reason)
  where id = p_attachment_id;

  return jsonb_build_object('ok', true, 'id', p_attachment_id, 'idempotent', false);
end;
$$;


--
-- Name: dispose_fixed_asset(uuid, date, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_disposed_on date, p_proceeds_idr bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_asset public.fixed_assets%rowtype;
  v_accumulated bigint;
  v_book bigint;
  v_entry_id uuid;
  v_line int := 0;
  v_result bigint;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id for update;
  if not found or not private.accounting_business_access(v_asset.business_id) then
    raise exception using errcode = '42501', message = 'FIXED_ASSET_NOT_FOUND';
  end if;
  if v_asset.disposed_on is not null then
    raise exception using errcode = 'P0001', message = 'FIXED_ASSET_ALREADY_DISPOSED';
  end if;
  if p_disposed_on is null
    or p_disposed_on < v_asset.acquired_on
    or p_disposed_on > (now() at time zone 'Asia/Jakarta')::date
    or coalesce(p_proceeds_idr, 0) < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.fixed_assets set disposed_on = p_disposed_on, updated_at = now() where id = p_asset_id;

  -- Penyusutan setelah alat berhenti dipakai dibongkar dulu, supaya sisa
  -- nilainya dihitung dari bulan yang benar.
  perform private.reset_depreciation_from(
    v_asset.business_id, date_trunc('month', p_disposed_on)::date, 'Alat usaha dilepas pemilik');
  perform private.post_depreciation_through(v_asset.business_id, p_disposed_on);

  select coalesce(sum(amount_idr), 0) into v_accumulated
  from public.depreciation_postings where asset_id = p_asset_id;
  v_book := v_asset.cost_idr - v_accumulated;

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by, cash_flow_section
  ) values (
    v_asset.business_id, p_disposed_on, 'ASSET_DISPOSAL', p_asset_id,
    left('Alat usaha dilepas: ' || v_asset.name, 240), 'coa-emkm-v1', v_user_id,
    case when coalesce(p_proceeds_idr, 0) > 0 then 'INVESTASI' else 'NON_KAS' end
  ) returning id into v_entry_id;

  if coalesce(p_proceeds_idr, 0) > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '1100', p_proceeds_idr, 0, v_line);
  end if;
  if v_accumulated > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '1690', v_accumulated, 0, v_line);
  end if;

  -- Selisih hasil jual dengan sisa nilainya: rugi menjadi beban, untung
  -- menjadi pendapatan lain-lain.
  v_result := coalesce(p_proceeds_idr, 0) - v_book;
  if v_result < 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '5290', -v_result, 0, v_line);
  elsif v_result > 0 then
    v_line := v_line + 1;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_asset.business_id, '4200', 0, v_result, v_line);
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, v_asset.business_id, '1600', 0, v_asset.cost_idr, 9);

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_asset.business_id, 'FIXED_ASSET_DISPOSED', 'fixed_asset', p_asset_id::text,
    jsonb_build_object('disposedOn', p_disposed_on, 'proceedsIdr', coalesce(p_proceeds_idr, 0),
      'bookValueIdr', v_book, 'resultIdr', v_result));

  return jsonb_build_object(
    'fixedAssetId', p_asset_id, 'disposedOn', p_disposed_on,
    'bookValueIdr', v_book, 'proceedsIdr', coalesce(p_proceeds_idr, 0), 'resultIdr', v_result);
end;
$$;


--
-- Name: ensure_depreciation_posted(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_depreciation_posted(p_as_of date DEFAULT NULL::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':depreciation', 0));
  return private.post_depreciation_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;


--
-- Name: ensure_indicators_rebuilt(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_indicators_rebuilt(p_as_of date DEFAULT NULL::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':indicators', 0));
  return private.rebuild_indicators_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;


--
-- Name: ensure_tax_estimated(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_tax_estimated(p_as_of date DEFAULT NULL::date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':tax', 0));
  return private.post_tax_estimates_through(
    v_business_id, coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date));
end;
$$;


--
-- Name: exchange_dossier_api_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.exchange_dossier_api_key(p_key_hash text, p_scope text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  key_row public.dossier_api_keys%rowtype;
  dossier_row public.dossiers%rowtype;
  grant_row public.consent_grants%rowtype;
  item_value jsonb;
begin
  select * into key_row from public.dossier_api_keys
  where key_hash = p_key_hash and status = 'active'
    and (expires_at is null or expires_at > now());
  if key_row.id is null then
    return jsonb_build_object('allowed', false, 'code', 'INVALID_API_KEY');
  end if;
  select * into dossier_row from public.dossiers where id = key_row.dossier_id;
  select * into grant_row from public.consent_grants where id = dossier_row.grant_id;
  if dossier_row.status <> 'ready' or dossier_row.expires_at <= now()
    or grant_row.status <> 'active' or grant_row.expires_at <= now() then
    return jsonb_build_object('allowed', false, 'code', 'ACCESS_INACTIVE');
  end if;
  if not (p_scope = any(key_row.scopes)) or not (p_scope = any(grant_row.scopes)) then
    return jsonb_build_object('allowed', false, 'code', 'DATA_NOT_APPROVED');
  end if;
  select item.snapshot into item_value from public.dossier_items as item
  where item.dossier_id = dossier_row.id and item.item_type = p_scope limit 1;
  update public.dossier_api_keys set last_used_at = now() where id = key_row.id;
  insert into public.dossier_access_events (
    dossier_id, institution_id, action, resource_scope, outcome
  ) values (
    dossier_row.id, dossier_row.institution_id, 'view', p_scope, 'allowed'
  );
  return jsonb_build_object(
    'allowed', true, 'scope', p_scope,
    'data', coalesce(item_value, '{}'::jsonb),
    'expiresAt', dossier_row.expires_at,
    'disclaimer', 'Data kesiapan, bukan penilaian kelayakan pembiayaan. Keputusan pembiayaan sepenuhnya milik lembaga.'
  );
end;
$$;


--
-- Name: fail_capture_ai_job(uuid, integer, text, text, boolean, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer, p_retry_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_retry boolean;
begin
  if p_attempt_number < 1
    or p_latency_ms < 0
    or char_length(trim(coalesce(p_failure_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_failure_message, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select job.* into v_job
  from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'voice_to_ledger'
  for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;

  select capture.* into v_capture
  from public.transaction_captures as capture
  where capture.id = v_job.capture_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  v_retry := p_retryable
    and v_job.attempt_count < v_job.max_attempts
    and v_capture.status <> 'cancelled';

  update public.ai_runs
  set
    status = case when v_capture.status = 'cancelled' then 'cancelled' else 'failed' end,
    response_payload = jsonb_strip_nulls(jsonb_build_object('retryReason', p_retry_reason)),
    latency_ms = p_latency_ms,
    failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message),
    completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;

  update public.ai_jobs
  set
    status = case
      when v_capture.status = 'cancelled' then 'cancelled'
      when v_retry then 'queued'
      else 'failed'
    end,
    available_at = case when v_retry then now() else available_at end,
    locked_at = null,
    locked_by = null,
    failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end,
    updated_at = now()
  where id = v_job.id;

  if v_capture.status <> 'cancelled' then
    update public.transaction_captures
    set
      status = case when v_retry then 'queued' else 'failed' end,
      failure_code = trim(p_failure_code),
      failure_message = trim(p_failure_message),
      completed_at = case when v_retry then null else now() end,
      updated_at = now()
    where id = v_capture.id;
  end if;

  if not v_retry and v_capture.status <> 'cancelled' then
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
    ) values (
      v_job.requested_by,
      'system',
      v_job.business_id,
      'TRANSACTION_CAPTURE_PROCESSING_FAILED',
      'transaction_capture',
      v_capture.id::text,
      'failure',
      jsonb_build_object('failureCode', trim(p_failure_code), 'attempts', v_job.attempt_count)
    );
  end if;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', case
      when v_capture.status = 'cancelled' then 'cancelled'
      when v_retry then 'queued'
      else 'failed'
    end,
    'retry', v_retry
  );
end;
$$;


--
-- Name: fail_document_extraction_job(uuid, integer, text, text, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_job public.ai_jobs%rowtype;
  v_version public.document_versions%rowtype;
  v_retry boolean;
begin
  if p_attempt_number < 1 or p_latency_ms < 0
    or char_length(trim(coalesce(p_failure_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_failure_message, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select job.* into v_job from public.ai_jobs as job
  where job.id = p_job_id and job.job_type = 'document_extraction' for update;
  if not found or v_job.status <> 'running' or v_job.attempt_count <> p_attempt_number then
    raise exception using errcode = 'P0001', message = 'AI_JOB_STATE_CONFLICT';
  end if;
  select version_record.* into v_version from public.document_versions as version_record
  where version_record.id = v_job.document_version_id for update;
  v_retry := p_retryable and v_job.attempt_count < v_job.max_attempts and v_version.status <> 'superseded';

  update public.ai_runs
  set status = 'failed', latency_ms = p_latency_ms, failure_code = trim(p_failure_code),
    failure_message = trim(p_failure_message), completed_at = now()
  where job_id = v_job.id and attempt_number = p_attempt_number;
  update public.ai_jobs
  set status = case when v_retry then 'queued' else 'failed' end,
    available_at = now(), locked_at = null, locked_by = null,
    failure_code = trim(p_failure_code), failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = case when v_retry then 'queued' else 'failed' end,
    failure_code = trim(p_failure_code), failure_message = trim(p_failure_message),
    completed_at = case when v_retry then null else now() end, updated_at = now()
  where document_version_id = v_version.id;
  if not v_retry then
    update public.document_versions set status = 'uploaded' where id = v_version.id;
    update public.documents
    set status = 'uploaded',
      ai_notes = 'Ekstraksi otomatis belum berhasil; dokumen tersimpan dan menunggu pemeriksaan manual.',
      updated_at = now()
    where id = v_version.document_id and current_version = v_version.version and status <> 'superseded';
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
    ) values (
      v_job.requested_by, 'system', v_job.business_id, 'DOCUMENT_EXTRACTION_FAILED',
      'document_version', v_version.id::text, 'failure',
      jsonb_build_object('failureCode', trim(p_failure_code), 'attempts', v_job.attempt_count)
    );
  end if;
  return jsonb_build_object('documentId', v_version.document_id, 'documentVersionId', v_version.id,
    'status', case when v_retry then 'queued' else 'manual_review_required' end, 'retry', v_retry);
end;
$$;


--
-- Name: fn_balance_sheet(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_balance_sheet(p_business_id uuid, p_as_of date) RETURNS TABLE(report_line text, account_code text, account_name text, section text, amount bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with balances as (
    select
      account.code,
      account.name,
      account.account_type,
      account.report_line,
      account.sort_order,
      coalesce(sum(line.debit), 0) as total_debit,
      coalesce(sum(line.credit), 0) as total_credit
    from public.coa_accounts as account
    join public.journal_lines as line on line.account_code = account.code
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and entry.entry_date <= p_as_of
    group by account.code, account.name, account.account_type, account.report_line, account.sort_order
  ),
  positions as (
    select
      report_line,
      code,
      name,
      account_type,
      sort_order,
      case when account_type = 'ASET'
        then total_debit - total_credit
        else total_credit - total_debit
      end as signed_amount
    from balances
    where account_type in ('ASET', 'LIABILITAS', 'EKUITAS')
  ),
  retained as (
    select coalesce(sum(
      case when account.account_type = 'PENDAPATAN'
        then line.credit - line.debit
        else line.debit - line.credit
      end * case when account.account_type = 'PENDAPATAN' then 1 else -1 end
    ), 0) as amount
    from public.coa_accounts as account
    join public.journal_lines as line on line.account_code = account.code
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and entry.entry_date <= p_as_of
      and account.account_type in ('PENDAPATAN', 'BEBAN')
  )
  select report_line, code, name, account_type, signed_amount::bigint
  from positions
  where signed_amount <> 0
  union all
  select 'BS_SALDO_LABA', '3300', 'Saldo Laba', 'EKUITAS', retained.amount::bigint
  from retained
  where retained.amount <> 0
  order by 4, 2;
$$;


--
-- Name: fn_cash_flow(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cash_flow(p_business_id uuid, p_date_from date, p_date_to date) RETURNS TABLE(section text, amount bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with entry_cash as (
    select
      entry.id,
      -- Entry non-kas yang ternyata memindahkan uang tetap harus masuk salah
      -- satu bagian, kalau tidak identitas arus kas tidak akan tertutup.
      case when coalesce(entry.cash_flow_section, 'OPERASI') = 'NON_KAS'
        then 'OPERASI' else coalesce(entry.cash_flow_section, 'OPERASI') end as section,
      coalesce(sum(line.debit) filter (where line.account_code in ('1100', '1200')), 0)
        - coalesce(sum(line.credit) filter (where line.account_code in ('1100', '1200')), 0) as cash_delta,
      coalesce(sum(line.debit) filter (where line.account_code = '5310'), 0) as interest
    from public.journal_entries as entry
    join public.journal_lines as line on line.entry_id = entry.id
    where entry.business_id = p_business_id
      and entry.entry_date between p_date_from and p_date_to
      -- Saldo awal bukan arus kas periode ini; ia adalah kas awalnya.
      and entry.source <> 'OPENING'
    group by entry.id, entry.cash_flow_section
    having coalesce(sum(line.debit) filter (where line.account_code in ('1100', '1200')), 0)
         - coalesce(sum(line.credit) filter (where line.account_code in ('1100', '1200')), 0) <> 0
  ),
  allocated as (
    -- Bunga cicilan adalah arus operasi walau pokoknya pendanaan.
    select 'OPERASI' as section, -interest as amount from entry_cash where interest > 0
    union all
    select section, cash_delta + interest from entry_cash
  ),
  sections as (
    select section, sum(amount)::bigint as amount from allocated group by section
  ),
  opening as (
    select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as amount
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and line.account_code in ('1100', '1200')
      and entry.entry_date <= p_date_to
      and (entry.entry_date < p_date_from or entry.source = 'OPENING')
  ),
  closing as (
    select coalesce(sum(line.debit) - sum(line.credit), 0)::bigint as amount
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and line.account_code in ('1100', '1200')
      and entry.entry_date <= p_date_to
  )
  select label.section, coalesce(value.amount, 0)::bigint
  from (values ('OPERASI', 1), ('INVESTASI', 2), ('PENDANAAN', 3)) as label(section, position)
  left join sections as value on value.section = label.section
  union all
  select 'KENAIKAN', (closing.amount - opening.amount)::bigint from closing, opening
  union all
  select 'KAS_AWAL', opening.amount from opening
  union all
  select 'KAS_AKHIR', closing.amount from closing;
$$;


--
-- Name: fn_income_statement(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date) RETURNS TABLE(report_line text, account_code text, account_name text, amount bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    account.report_line,
    account.code,
    account.name,
    case when account.normal_balance = 'KREDIT'
      then coalesce(sum(line.credit) - sum(line.debit), 0)
      else coalesce(sum(line.debit) - sum(line.credit), 0)
    end::bigint
  from public.coa_accounts as account
  join public.journal_lines as line on line.account_code = account.code
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date between p_date_from and p_date_to
    and account.account_type in ('PENDAPATAN', 'BEBAN')
  group by account.report_line, account.code, account.name, account.normal_balance, account.sort_order
  order by account.sort_order;
$$;


--
-- Name: fn_indicator_monthly(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_indicator_monthly(p_business_id uuid, p_date_from date, p_date_to date) RETURNS TABLE(period_month date, revenue bigint, cogs bigint, opex bigint, interest bigint, net_income bigint, prive bigint, capital_in bigint, receivable_new bigint, noncash_sales bigint, noncash_sales_ratio numeric, days_recorded integer, formula_version text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    indicator.period_month,
    indicator.revenue_idr,
    indicator.cogs_idr,
    indicator.opex_idr,
    indicator.interest_idr,
    indicator.net_income_idr,
    indicator.prive_idr,
    indicator.capital_in_idr,
    indicator.receivable_new_idr,
    indicator.noncash_sales_idr,
    indicator.noncash_sales_ratio,
    indicator.days_recorded,
    indicator.formula_version
  from public.indicator_monthly as indicator
  where indicator.business_id = p_business_id
    and indicator.period_month >= date_trunc('month', p_date_from)::date
    and indicator.period_month <= date_trunc('month', p_date_to)::date
  order by indicator.period_month;
$$;


--
-- Name: fn_notes_data(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_notes_data(p_business_id uuid, p_date_from date, p_date_to date) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'business', (
      select jsonb_build_object(
        'name', business.name,
        'legalName', business.legal_name,
        'sector', business.sector,
        'location', business.location
      )
      from public.businesses as business where business.id = p_business_id
    ),
    'openingBalance', (
      select jsonb_build_object('startDate', opening.start_date, 'notes', opening.notes)
      from public.opening_balances as opening where opening.business_id = p_business_id
    ),
    'cash', (
      select coalesce(sum(line.debit) - sum(line.credit), 0)
      from public.journal_lines as line
      join public.journal_entries as entry on entry.id = line.entry_id
      where line.business_id = p_business_id and line.account_code = '1100' and entry.entry_date <= p_date_to
    ),
    'bank', (
      select coalesce(sum(line.debit) - sum(line.credit), 0)
      from public.journal_lines as line
      join public.journal_entries as entry on entry.id = line.entry_id
      where line.business_id = p_business_id and line.account_code = '1200' and entry.entry_date <= p_date_to
    ),
    -- Piutang per pelanggan menggabungkan dua sumber: rincian yang diisi di
    -- wizard saldo awal, dan pergerakan piutang dari transaksi sesudahnya.
    -- Baris 1300 pada entry saldo awal sengaja dilewati karena nilainya sudah
    -- terwakili oleh rinciannya.
    'receivables', coalesce((
      select jsonb_agg(jsonb_build_object('name', merged.name, 'amountIdr', merged.amount) order by merged.name)
      from (
        select receivable.name, sum(receivable.amount) as amount
        from (
          select
            coalesce(nullif(trim(detail->>'name'), ''), 'Pelanggan tanpa nama') as name,
            coalesce((detail->>'amountIdr')::bigint, 0) as amount
          from public.opening_balances as opening,
            lateral jsonb_array_elements(opening.receivable_details) as detail
          where opening.business_id = p_business_id
          union all
          select
            coalesce(party.name, nullif(trim(tx.counterparty), ''), 'Pelanggan tanpa nama') as name,
            sum(line.debit - line.credit) as amount
          from public.journal_lines as line
          join public.journal_entries as entry on entry.id = line.entry_id
          left join public.transactions as tx on tx.id = entry.source_id and entry.source = 'TRANSACTION'
          left join public.counterparties as party on party.id = tx.counterparty_id
          where line.business_id = p_business_id
            and line.account_code = '1300'
            and entry.entry_date <= p_date_to
            and entry.source <> 'OPENING'
          group by coalesce(party.name, nullif(trim(tx.counterparty), ''), 'Pelanggan tanpa nama')
        ) as receivable
        group by receivable.name
        having sum(receivable.amount) <> 0
      ) as merged
    ), '[]'::jsonb),
    'inventory', (
      select jsonb_build_object(
        'balanceIdr', (
          select coalesce(sum(line.debit) - sum(line.credit), 0)
          from public.journal_lines as line
          join public.journal_entries as entry on entry.id = line.entry_id
          where line.business_id = p_business_id and line.account_code = '1400' and entry.entry_date <= p_date_to
        ),
        'lastCountedMonth', (
          select max(period_month) from public.inventory_counts where business_id = p_business_id
        )
      )
    ),
    'fixedAssets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', asset.name,
        'category', asset.category,
        'acquiredOn', asset.acquired_on,
        'costIdr', asset.cost_idr,
        'usefulLifeMonths', asset.useful_life_months,
        'accumulatedIdr', coalesce((
          select sum(posting.amount_idr) from public.depreciation_postings as posting
          where posting.asset_id = asset.id and posting.period_month <= p_date_to
        ), 0),
        'disposedOn', asset.disposed_on
      ) order by asset.acquired_on)
      from public.fixed_assets as asset where asset.business_id = p_business_id
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lenderName', loan.lender_name,
        'lenderType', loan.lender_type,
        'principalIdr', loan.principal_idr,
        'outstandingIdr', loan.outstanding_idr,
        'monthlyInstallmentIdr', loan.monthly_installment_idr,
        'annualRate', loan.annual_rate,
        'startedOn', loan.started_on
      ) order by loan.started_on)
      from public.loans as loan where loan.business_id = p_business_id
    ), '[]'::jsonb),
    'equity', jsonb_build_object(
      'capitalIdr', (
        select coalesce(sum(line.credit) - sum(line.debit), 0)
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id and line.account_code = '3100' and entry.entry_date <= p_date_to
      ),
      'ownerDrawIdr', (
        select coalesce(sum(line.debit) - sum(line.credit), 0)
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id and line.account_code = '3200' and entry.entry_date <= p_date_to
      )
    ),
    'revenueByMonth', coalesce((
      select jsonb_agg(jsonb_build_object('month', month_row.month, 'amountIdr', month_row.amount) order by month_row.month)
      from (
        select date_trunc('month', entry.entry_date)::date as month,
               sum(line.credit - line.debit) as amount
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        where line.business_id = p_business_id
          and line.account_code in ('4100', '4200')
          and entry.entry_date between p_date_from and p_date_to
        group by 1
      ) as month_row
    ), '[]'::jsonb),
    'expenseByAccount', coalesce((
      select jsonb_agg(jsonb_build_object(
        'accountCode', expense_row.code,
        'accountName', expense_row.name,
        'amountIdr', expense_row.amount
      ) order by expense_row.code)
      from (
        select account.code, account.name, sum(line.debit - line.credit) as amount
        from public.journal_lines as line
        join public.journal_entries as entry on entry.id = line.entry_id
        join public.coa_accounts as account on account.code = line.account_code
        where line.business_id = p_business_id
          and account.account_type = 'BEBAN'
          and entry.entry_date between p_date_from and p_date_to
        group by account.code, account.name
        having sum(line.debit - line.credit) <> 0
      ) as expense_row
    ), '[]'::jsonb)
  );
$$;


--
-- Name: fn_pending_reminders(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_pending_reminders(p_business_id uuid, p_as_of date) RETURNS TABLE(kind text, period_month date, due_date date, days_overdue integer, urgent boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with bounds as (
    select
      date_trunc('month', p_as_of)::date as this_month,
      (date_trunc('month', p_as_of)::date + interval '1 month - 1 day')::date as this_month_end,
      (select date_trunc('month', start_date)::date
         from public.opening_balances where business_id = p_business_id) as first_month
  ),
  -- Bulan yang perlu dihitung stoknya: setiap bulan sejak pemilik mulai
  -- mencatat yang benar-benar punya belanja bahan.
  stock_months as (
    select distinct date_trunc('month', entry.entry_date)::date as period_month
    from public.journal_lines as line
    join public.journal_entries as entry on entry.id = line.entry_id
    cross join bounds
    where line.business_id = p_business_id
      and line.account_code = '5100'
      and line.debit > 0
      and entry.entry_date <= p_as_of
      and (bounds.first_month is null or entry.entry_date >= bounds.first_month)
  ),
  stock_due as (
    select
      'HITUNG_STOK'::text as kind,
      stock_months.period_month,
      (stock_months.period_month + interval '1 month - 1 day')::date as due_date
    from stock_months
    cross join bounds
    where not exists (
      select 1 from public.inventory_counts as counted
      where counted.business_id = p_business_id
        and counted.period_month = stock_months.period_month
    )
      -- Bulan berjalan baru ditagih pada tiga hari terakhirnya. Sebelum itu,
      -- menghitung stok belum ada gunanya.
      and (
        stock_months.period_month < bounds.this_month
        or p_as_of >= (bounds.this_month_end - 2)
      )
  ),
  -- Hari yang perlu ditutup kasnya: hari yang punya catatan terkonfirmasi dan
  -- belum pernah ditutup. Hari ini ikut, karena tutup kas memang dikerjakan
  -- pada hari itu juga.
  closing_due as (
    select
      'TUTUP_KAS'::text as kind,
      date_trunc('month', transaction.transaction_date)::date as period_month,
      transaction.transaction_date as due_date
    from public.transactions as transaction
    cross join bounds
    where transaction.business_id = p_business_id
      and transaction.ledger_status = 'confirmed'
      and transaction.transaction_date is not null
      and transaction.transaction_date <= p_as_of
      and (bounds.first_month is null or transaction.transaction_date >= bounds.first_month)
      and not exists (
        select 1 from public.daily_closings as closing
        where closing.business_id = p_business_id
          and closing.closing_date = transaction.transaction_date
      )
    group by 1, 2, 3
  ),
  merged as (
    select * from stock_due
    union all
    select * from closing_due
  )
  select
    merged.kind,
    merged.period_month,
    merged.due_date,
    greatest((p_as_of - merged.due_date)::integer, 0) as days_overdue,
    -- Mendesak begitu tanggalnya lewat. Yang masih berjalan bukan kelalaian,
    -- hanya belum waktunya.
    (p_as_of > merged.due_date) as urgent
  from merged
  order by merged.due_date desc;
$$;


--
-- Name: fn_post_transaction_journal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_transaction_journal(p_transaction_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_tx public.transactions%rowtype;
  v_sector text;
  v_template public.category_templates%rowtype;
  v_counterparty_type text;
  v_debit_account text;
  v_credit_account text;
  v_entry_id uuid;
  v_amount bigint;
  v_interest bigint;
  v_principal bigint;
  v_opening public.opening_balances%rowtype;
  v_entry_date date;
  v_legacy_group text;
  v_legacy_code text;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_NOT_FOUND';
  end if;
  if v_tx.journal_entry_id is not null then
    return v_tx.journal_entry_id;
  end if;
  if v_tx.emkm_category_code is null then
    return null;
  end if;
  if v_tx.business_id is null then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_WITHOUT_BUSINESS';
  end if;

  v_amount := coalesce(v_tx.amount_idr, v_tx.nominal);
  if v_amount is null or v_amount <= 0 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_entry_date := coalesce(v_tx.transaction_date, v_tx.tanggal, (now() at time zone 'Asia/Jakarta')::date);

  -- Catatan bertanggal sebelum saldo awal akan membuat neraca tidak bermakna:
  -- angkanya sudah terhitung di dalam saldo awal itu sendiri.
  select * into v_opening from public.opening_balances where business_id = v_tx.business_id;
  if found and v_entry_date < v_opening.start_date then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_BEFORE_OPENING_BALANCE';
  end if;

  -- Barang murah bukan alat usaha.
  --
  -- Tanpa batas bawah, "beli pisau lima belas ribu" yang tercatat sebagai alat
  -- akan disusutkan Rp312 sebulan selama empat tahun: 48 baris jurnal, satu
  -- baris permanen di daftar alat, dan satu baris di catatan laporan -- semua
  -- untuk uang yang sudah habis terpakai bulan itu juga. Di bawah ambang,
  -- belanjanya langsung menjadi biaya usaha bulan berjalan.
  --
  -- Baris transaksinya ikut dipindah, bukan hanya jurnalnya, supaya daftar
  -- catatan dan layar koreksi memperlihatkan kategori yang benar-benar dipakai.
  if v_tx.emkm_category_code = 8 and v_amount < private.fixed_asset_threshold_idr() then
    v_tx.emkm_category_code := 6;
    v_tx.emkm_category_subtype := '5290';
    select legacy.o_group, legacy.o_code into v_legacy_group, v_legacy_code
    from private.legacy_category_for_emkm(6::smallint, '5290') as legacy;
    update public.transactions set
      emkm_category_code = 6,
      emkm_category_subtype = '5290',
      category_group = v_legacy_group,
      category_code = v_legacy_code,
      category = 'Operasional',
      kategori = 'Operasional',
      updated_at = now()
    where id = v_tx.id;
  end if;

  v_sector := private.emkm_sector_for_business(v_tx.business_id);

  select * into v_template
  from public.category_templates
  where sector = v_sector
    and category_code = v_tx.emkm_category_code
    and coalesce(subtype, '') = coalesce(v_tx.emkm_category_subtype, '')
    and version = 'coa-emkm-v1'
    and is_active
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'CATEGORY_TEMPLATE_NOT_FOUND';
  end if;

  select party.type into v_counterparty_type
  from public.counterparties as party
  where party.id = v_tx.counterparty_id;

  v_debit_account := private.resolve_account_rule(v_template.debit_rule, v_tx.payment_method, v_counterparty_type);
  v_credit_account := private.resolve_account_rule(v_template.credit_rule, v_tx.payment_method, v_counterparty_type);

  insert into public.journal_entries (
    business_id, entry_date, source, source_id, memo, template_version, created_by, cash_flow_section
  ) values (
    v_tx.business_id, v_entry_date, 'TRANSACTION', v_tx.id,
    left(coalesce(v_tx.item, ''), 240), 'coa-emkm-v1', v_tx.user_id, v_template.cash_flow_section
  ) returning id into v_entry_id;

  -- Kategori 7 memecah cicilan menjadi pokok (utang) dan bunga (beban 5310).
  v_interest := least(greatest(coalesce(v_tx.interest_amount_idr, 0), 0), v_amount);
  if v_tx.emkm_category_code = 7 and v_interest > 0 then
    v_principal := v_amount - v_interest;
    if v_principal > 0 then
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_tx.business_id, v_debit_account, v_principal, 0, 1);
    end if;
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, '5310', v_interest, 0, 2);
  else
    insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
    values (v_entry_id, v_tx.business_id, v_debit_account, v_amount, 0, 1);
  end if;

  insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
  values (v_entry_id, v_tx.business_id, v_credit_account, 0, v_amount, 9);

  -- Cicilan mengurangi sisa pinjaman yang tercatat.
  if v_tx.emkm_category_code = 7 and v_tx.counterparty_id is not null then
    update public.loans
    set outstanding_idr = greatest(outstanding_idr - (v_amount - v_interest), 0),
        closed_at = case when outstanding_idr - (v_amount - v_interest) <= 0 then now() else closed_at end,
        updated_at = now()
    where business_id = v_tx.business_id and counterparty_id = v_tx.counterparty_id and closed_at is null;
  end if;

  -- Beli alat usaha langsung terdaftar supaya penyusutannya bisa dihitung.
  if v_tx.emkm_category_code = 8
    and not exists (select 1 from public.fixed_assets fa where fa.source_transaction_id = v_tx.id) then
    insert into public.fixed_assets (
      business_id, name, category, acquired_on, cost_idr, useful_life_months,
      source_transaction_id, created_by
    ) values (
      v_tx.business_id, left(coalesce(nullif(trim(v_tx.item), ''), 'Alat usaha'), 120),
      private.guess_asset_category(v_tx.item), v_entry_date, v_amount,
      private.default_useful_life_months(private.guess_asset_category(v_tx.item)),
      v_tx.id, v_tx.user_id
    );
  end if;

  -- Pinjaman yang cair langsung terdaftar supaya cicilannya bisa dipisah
  -- pokok dan bunganya.
  if v_tx.emkm_category_code = 4 and v_tx.emkm_category_subtype = '4b'
    and not exists (select 1 from public.loans l where l.source_transaction_id = v_tx.id) then
    insert into public.loans (
      business_id, counterparty_id, lender_name, lender_type, principal_idr,
      outstanding_idr, started_on, source_transaction_id, created_by
    ) values (
      v_tx.business_id, v_tx.counterparty_id,
      left(coalesce(nullif(trim(v_tx.counterparty), ''), 'Pemberi pinjaman'), 120),
      coalesce(v_counterparty_type, 'KOPERASI'),
      v_amount, v_amount, v_entry_date, v_tx.id, v_tx.user_id
    );
  end if;

  update public.transactions
  set journal_entry_id = v_entry_id, updated_at = now()
  where id = v_tx.id;

  return v_entry_id;
end;
$$;


--
-- Name: fn_readiness_facts(date, integer, integer, integer, bigint, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_readiness_facts(p_as_of date DEFAULT NULL::date, p_habit_days integer DEFAULT 30, p_quality_days integer DEFAULT 90, p_evidence_days integer DEFAULT 90, p_big_spend_idr bigint DEFAULT 500000, p_full_month_lookback integer DEFAULT 3, p_full_month_min_days integer DEFAULT 8) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_as_of date;
  v_a1 integer; v_a2 integer; v_a3 integer;
  v_b1_total integer; v_b1_bad integer;
  v_b2 integer; v_b4 integer;
  v_b3_total bigint; v_b3_covered bigint; v_b3_count integer;
  v_c1_required integer; v_c1_confirmed integer;
  v_full_months date[];
  v_c2_filled integer;
  v_d1 boolean; v_d2 integer; v_d3 integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  v_as_of := coalesce(p_as_of, (now() at time zone 'Asia/Jakarta')::date);

  -- Bulan penuh: bulan kalender Asia/Jakarta dengan >= 1 transaksi terkonfirmasi
  -- pada >= N hari berbeda. Dihitung sekali sebagai larik, dipakai B2, B4, D2.
  --
  -- Larik, bukan tabel sementara: fungsi ini `stable` supaya perencana boleh
  -- memakainya bebas, dan fungsi non-volatile tidak boleh membuat tabel.
  select coalesce(array_agg(month), array[]::date[]) into v_full_months
  from (
    select date_trunc('month', transaction_date)::date as month
    from public.transactions
    where business_id = v_business_id
      and ledger_status = 'confirmed'
      and transaction_date <= v_as_of
    group by 1
    having count(distinct transaction_date) >= p_full_month_min_days
  ) as months;

  -- A1 hari mencatat
  select count(distinct transaction_date) into v_a1
  from public.transactions
  where business_id = v_business_id and ledger_status = 'confirmed'
    and transaction_date > v_as_of - p_habit_days and transaction_date <= v_as_of;

  -- A2 tutup kas
  select count(*) into v_a2
  from public.daily_closings
  where business_id = v_business_id and status = 'closed'
    and closing_date > v_as_of - p_habit_days and closing_date <= v_as_of;

  -- A3 umur catatan
  select coalesce(v_as_of - min(transaction_date), 0) into v_a3
  from public.transactions
  where business_id = v_business_id and ledger_status = 'confirmed';

  -- B1 catatan yang sudah diperiksa pemilik
  select count(*) into v_b1_total
  from public.transactions
  where business_id = v_business_id
    and transaction_date > v_as_of - p_quality_days and transaction_date <= v_as_of;
  select count(*) into v_b1_bad
  from public.transactions
  where business_id = v_business_id
    and transaction_date > v_as_of - p_quality_days and transaction_date <= v_as_of
    and needs_reclass;
  v_b1_bad := v_b1_bad + coalesce((
    select count(*) from public.transaction_captures
    where business_id = v_business_id
      and status in ('needs_review', 'failed')
      and created_at < (now() - interval '48 hours')
      and created_at >= (v_as_of - p_quality_days)::timestamptz
  ), 0);

  -- B2 pisah uang pribadi: bulan penuh dengan >= 1 entry akun 3200
  select count(*) into v_b2 from (
    select m.month from unnest(v_full_months) as m(month)
    where m.month > (date_trunc('month', v_as_of)::date - (p_full_month_lookback || ' months')::interval)
      and exists (
        select 1 from public.journal_lines line
        join public.journal_entries entry on entry.id = line.entry_id
        where line.business_id = v_business_id and line.account_code = '3200'
          and date_trunc('month', entry.entry_date)::date = m.month
      )
  ) as prive_months;

  -- B3 bukti belanja besar, dihitung dari NILAI rupiah, bukan jumlah transaksi
  select
    coalesce(sum(t.amount_idr), 0),
    coalesce(sum(t.amount_idr) filter (where exists (
      select 1 from public.document_attachments a
      where a.target_type = 'transaction' and a.target_id = t.id and a.removed_at is null
    )), 0),
    count(*)
  into v_b3_total, v_b3_covered, v_b3_count
  from public.transactions t
  where t.business_id = v_business_id
    and t.ledger_status = 'confirmed'
    and coalesce(t.direction, case when t.type = 'keluar' then 'expense' else 'income' end) = 'expense'
    and t.amount_idr >= p_big_spend_idr
    and t.transaction_date > v_as_of - p_evidence_days and t.transaction_date <= v_as_of;

  -- B4 hitung stok
  select count(*) into v_b4 from (
    select m.month from unnest(v_full_months) as m(month)
    where m.month > (date_trunc('month', v_as_of)::date - (p_full_month_lookback || ' months')::interval)
      and exists (
        select 1 from public.inventory_counts c
        where c.business_id = v_business_id and c.period_month = m.month
      )
  ) as stock_months;

  -- C1 fondasi izin sektor: dokumen WAJIB sektor yang tingkat keyakinannya
  -- sudah minimal 'confirmed' -- bukti, bukan klaim.
  select count(*) into v_c1_required
  from public.document_requirements r
  where r.sector = private.emkm_sector_for_business(v_business_id) and r.requirement = 'wajib';
  select count(*) into v_c1_confirmed
  from public.document_requirements r
  where r.sector = private.emkm_sector_for_business(v_business_id) and r.requirement = 'wajib'
    and exists (
      select 1 from public.documents d
      where d.business_id = v_business_id and d.doc_type = r.doc_type
        and d.status not in ('rejected', 'superseded')
        and d.storage_path is not null
        and d.assurance_level in ('confirmed', 'attested')
    );

  -- C2 profil inti
  select
    (case when p.tahun_mulai_usaha is not null then 1 else 0 end)
    + (case when coalesce(nullif(trim(p.alamat), ''), null) is not null then 1 else 0 end)
    + (case when coalesce(nullif(trim(p.phone), ''), null) is not null then 1 else 0 end)
    + (case when coalesce(array_length(p.kanal_penjualan, 1), 0) > 0 then 1 else 0 end)
  into v_c2_filled
  from public.profiles p
  where p.auth_user_id = v_user_id;
  v_c2_filled := coalesce(v_c2_filled, 0);

  -- D1 saldo awal
  select exists (select 1 from public.opening_balances where business_id = v_business_id) into v_d1;

  -- D2 rentang data
  v_d2 := coalesce(array_length(v_full_months, 1), 0);

  -- D3 laporan terbit
  select count(*) into v_d3
  from public.report_issues
  where business_id = v_business_id and report_kind = 'pdf_sak_emkm';

  return jsonb_build_object(
    'asOf', v_as_of,
    'a1RecordingDays', v_a1,
    'a2Closings', v_a2,
    'a3AgeDays', v_a3,
    'b1Total', v_b1_total,
    'b1Unchecked', least(v_b1_bad, v_b1_total),
    'b2PriveMonths', v_b2,
    'b3TotalIdr', v_b3_total,
    'b3CoveredIdr', v_b3_covered,
    'b3Count', v_b3_count,
    'b4StockMonths', v_b4,
    'c1Required', v_c1_required,
    'c1Confirmed', v_c1_confirmed,
    'c2Filled', v_c2_filled,
    'c2Total', 4,
    'd1OpeningBalance', v_d1,
    'd2FullMonths', v_d2,
    'd3Reports', v_d3
  );
end;
$$;


--
-- Name: fn_reverse_journal_entry(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reverse_journal_entry(p_entry_id uuid, p_reason text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.reverse_journal_entry_on(p_entry_id, p_reason, (now() at time zone 'Asia/Jakarta')::date);
$$;


--
-- Name: fn_tax_estimate(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_tax_estimate(p_business_id uuid, p_as_of date) RETURNS TABLE(tax_year integer, as_of date, gross_revenue_ytd_idr bigint, exempt_idr bigint, rate numeric, taxable_ytd_idr bigint, tax_ytd_idr bigint, remaining_before_taxable_idr bigint, is_taxable boolean)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with bounds as (
    select
      extract(year from p_as_of)::integer as year,
      date_trunc('year', p_as_of)::date as year_start
  ),
  totals as (
    select
      bounds.year,
      private.gross_revenue_between(p_business_id, bounds.year_start, p_as_of) as revenue,
      private.pph_final_exempt_idr() as exempt,
      private.pph_final_rate() as rate,
      coalesce((
        select sum(estimate.tax_idr)
        from public.tax_estimates as estimate
        where estimate.business_id = p_business_id
          and estimate.tax_year = bounds.year
          and estimate.period_month <= p_as_of
      ), 0)::bigint as tax
    from bounds
  )
  select
    totals.year,
    p_as_of,
    totals.revenue,
    totals.exempt,
    totals.rate,
    greatest(totals.revenue - totals.exempt, 0)::bigint,
    totals.tax,
    greatest(totals.exempt - totals.revenue, 0)::bigint,
    totals.revenue > totals.exempt
  from totals;
$$;


--
-- Name: fn_trial_balance(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_trial_balance(p_business_id uuid, p_as_of date) RETURNS TABLE(account_code text, account_name text, account_type text, normal_balance text, total_debit bigint, total_credit bigint, balance bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    account.code,
    account.name,
    account.account_type,
    account.normal_balance,
    coalesce(sum(line.debit), 0)::bigint,
    coalesce(sum(line.credit), 0)::bigint,
    case when account.normal_balance = 'DEBIT'
      then coalesce(sum(line.debit) - sum(line.credit), 0)
      else coalesce(sum(line.credit) - sum(line.debit), 0)
    end::bigint
  from public.coa_accounts as account
  join public.journal_lines as line on line.account_code = account.code
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date <= p_as_of
  group by account.code, account.name, account.account_type, account.normal_balance, account.sort_order
  having coalesce(sum(line.debit), 0) <> 0 or coalesce(sum(line.credit), 0) <> 0
  order by account.sort_order;
$$;


--
-- Name: fn_warung_monthly(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date) RETURNS TABLE(period_month date, revenue bigint, cogs bigint, opex bigint, interest bigint, net_income bigint, prive bigint, capital_in bigint, receivable_new bigint, days_recorded integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    date_trunc('month', entry.entry_date)::date as period_month,
    coalesce(sum(case when line.account_code in ('4100', '4200') then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5100' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code like '52%' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '5310' then line.debit - line.credit end), 0)::bigint,
    (
      coalesce(sum(case when line.account_code like '4%' then line.credit - line.debit end), 0)
      - coalesce(sum(case when line.account_code like '5%' then line.debit - line.credit end), 0)
    )::bigint,
    coalesce(sum(case when line.account_code = '3200' then line.debit - line.credit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '3100' then line.credit - line.debit end), 0)::bigint,
    coalesce(sum(case when line.account_code = '1300' then line.debit - line.credit end), 0)::bigint,
    count(distinct entry.entry_date)::integer
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = p_business_id
    and entry.entry_date between p_date_from and p_date_to
  group by 1
  order by 1;
$$;


--
-- Name: get_my_discovery_optin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_discovery_optin() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare business_id_value uuid; optin_row public.discovery_optins%rowtype;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_access(business.id) limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  select * into optin_row from public.discovery_optins where business_id = business_id_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', coalesce(optin_row.opted_in, false), 'candidateCode', optin_row.candidate_code);
end;
$$;


--
-- Name: get_my_institution_shortlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_institution_shortlist(p_institution_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(optin.candidate_code order by shortlist.created_at), '[]'::jsonb)
  from public.institution_shortlists as shortlist
  join public.discovery_optins as optin on optin.business_id = shortlist.business_id and optin.opted_in = true
  where shortlist.institution_id = public.resolve_my_institution_id(p_institution_id)
    and shortlist.created_by = (select auth.uid()) and shortlist.status = 'shortlisted'
$$;


--
-- Name: join_program_by_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_program_by_code(p_join_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  program_row public.programs%rowtype;
  business_id_value uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into program_row from public.programs
  where join_code = upper(trim(p_join_code)) and status = 'active';
  if program_row.id is null then raise exception 'PROGRAM_NOT_FOUND'; end if;
  business_id_value := private.get_or_create_user_business((select auth.uid()));
  if business_id_value is null then raise exception 'BUSINESS_ACCESS_DENIED'; end if;
  insert into public.program_enrollments (program_id, business_id, status, applied_by)
  values (program_row.id, business_id_value, 'accepted', (select auth.uid()))
  on conflict (program_id, business_id) do update set
    status = 'accepted', reviewed_at = now();
  return jsonb_build_object('programId', program_row.id, 'programName', program_row.name, 'ok', true);
end;
$$;


--
-- Name: list_anonymous_business_candidates(uuid, uuid, text, text, text, text, boolean, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_anonymous_business_candidates(p_program_id uuid DEFAULT NULL::uuid, p_institution_id uuid DEFAULT NULL::uuid, p_sector text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_min_level text DEFAULT NULL::text, p_age_band text DEFAULT NULL::text, p_legal_complete boolean DEFAULT NULL::boolean, p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  institution_id_value uuid;
  result_value jsonb;
  total_value integer;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);
  if p_program_id is not null and not exists (
    select 1 from public.programs as program
    where program.id = p_program_id and program.institution_id = institution_id_value
  ) then raise exception 'PROGRAM_ACCESS_DENIED'; end if;
  if p_sort not in ('newest', 'region') then raise exception 'INVALID_SORT'; end if;
  if p_min_level is not null and p_min_level not in ('Mulai', 'Tembaga', 'Perak', 'Emas') then
    raise exception 'INVALID_LEVEL';
  end if;

  with candidates as (
    select
      optin.candidate_code as "candidateCode",
      coalesce(business.sector, 'Belum diisi') as sector,
      coalesce(business.location, 'Belum diisi') as "generalLocation",
      case readiness_state.level
        when 'EMAS' then 'Emas'
        when 'PERAK' then 'Perak'
        when 'TEMBAGA' then 'Tembaga'
        when 'MULAI' then 'Mulai'
        else 'Belum dihitung' end as "readinessLevel",
      case
        when financial.latest_transaction_date is null then 'Belum ada catatan'
        when financial.latest_transaction_date >= current_date - 89 then '< 3 bulan'
        when financial.latest_transaction_date >= current_date - 179 then '3-6 bulan'
        when financial.latest_transaction_date >= current_date - 364 then '6-12 bulan'
        else '> 12 bulan' end as "recordingAgeBand",
      (coalesce(legal.ready_count, 0) >= 3) as "legalComplete",
      coalesce(legal.ready_count, 0) as "legalEvidenceCount",
      case
        when coalesce(activity.active_days, 0) >= 20 then 'Sangat rutin'
        when coalesce(activity.active_days, 0) >= 8 then 'Rutin'
        when coalesce(activity.active_days, 0) >= 1 then 'Mulai rutin'
        else 'Belum ada catatan terbaru' end as "recordingActivity",
      coalesce(evidence.types, '[]'::jsonb) as "evidenceAvailability",
      existing_request.status as "requestStatus",
      existing_dossier.status as "dossierStatus",
      business.created_at as joined_at,
      case readiness_state.level
        when 'EMAS' then 4
        when 'PERAK' then 3
        when 'TEMBAGA' then 2
        when 'MULAI' then 1
        else -1 end as level_rank
    from public.businesses as business
    join public.discovery_optins as optin on optin.business_id = business.id and optin.opted_in = true
    left join public.business_readiness_state as readiness_state
      on readiness_state.business_id = business.id
    left join lateral (
      select count(distinct transaction.transaction_date)::integer as active_days,
        max(transaction.transaction_date) as latest_transaction_date
      from public.transactions as transaction
      where transaction.business_id = business.id and transaction.transaction_date >= current_date - 364
    ) as activity on true
    left join lateral (
      select max(transaction.transaction_date) as latest_transaction_date
      from public.transactions as transaction where transaction.business_id = business.id
    ) as financial on true
    left join lateral (
      select count(distinct document.doc_type)::integer as ready_count
      from public.documents as document
      where document.business_id = business.id and document.doc_type in ('nib','npwp','ktp_owner','pirt','halal','distribution_permit')
        and document.status not in ('rejected','archived','superseded')
    ) as legal on true
    left join lateral (
      select jsonb_agg(distinct document.doc_type) as types from public.documents as document
      where document.business_id = business.id and document.status not in ('rejected','archived','superseded')
    ) as evidence on true
    left join lateral (
      select request.status from public.dossier_requests as request
      where request.institution_id = institution_id_value and request.business_id = business.id and request.status = 'pending'
      order by request.created_at desc limit 1
    ) as existing_request on true
    left join lateral (
      select dossier.status from public.dossiers as dossier
      join public.consent_grants as grant_row on grant_row.id = dossier.grant_id
      where dossier.institution_id = institution_id_value and dossier.business_id = business.id and dossier.status = 'ready'
        and dossier.expires_at > now() and grant_row.status = 'active' and grant_row.expires_at > now()
      order by dossier.generated_at desc limit 1
    ) as existing_dossier on true
    where business.status = 'active'
  ),
  filtered as (
    select * from candidates
    where (p_sector is null or sector = p_sector)
      and (p_region is null or "generalLocation" = p_region)
      and (p_min_level is null or level_rank >= case p_min_level
        when 'Emas' then 4 when 'Perak' then 3 when 'Tembaga' then 2 when 'Mulai' then 1 end)
      and (p_age_band is null or "recordingAgeBand" = p_age_band)
      and (p_legal_complete is null or "legalComplete" = p_legal_complete)
  ),
  -- Halaman hasil dan jumlah totalnya dihitung dalam SATU pernyataan. CTE
  -- hanya hidup selama pernyataan yang memilikinya, jadi `filtered` yang
  -- dipakai oleh pernyataan berikutnya tidak pernah ada -- fungsinya gagal
  -- pada panggilan pertama dengan "relasi filtered tidak ada".
  page as (
    select
      "candidateCode", sector, "generalLocation", "readinessLevel", "recordingAgeBand",
      "legalComplete", "legalEvidenceCount", "recordingActivity", "evidenceAvailability",
      "requestStatus", "dossierStatus", joined_at
    from filtered
    order by
      case when p_sort = 'region' then "generalLocation" end,
      joined_at desc
    limit greatest(1, least(100, coalesce(p_limit, 50)))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    coalesce((
      select jsonb_agg(page order by
        case when p_sort = 'region' then page."generalLocation" end,
        page.joined_at desc)
      from page
    ), '[]'::jsonb),
    (select count(*) from filtered)
  into result_value, total_value;
  return jsonb_build_object('candidates', result_value, 'total', total_value);
end;
$$;


--
-- Name: list_my_institutions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_my_institutions() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(entry.payload order by entry.created_at), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'institutionId', institution.id,
      'name', institution.name,
      'type', institution.type,
      'status', institution.status,
      'verificationStatus', institution.verification_status,
      'role', member.role,
      'memberStatus', member.status,
      'createdAt', member.created_at
    ) as payload, member.created_at
    from public.institution_members as member
    join public.institutions as institution on institution.id = member.institution_id
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  ) as entry;
$$;


--
-- Name: log_institution_view(uuid, text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_institution_view(p_institution_id uuid, p_artifact text, p_business_id uuid DEFAULT NULL::uuid, p_artifact_id uuid DEFAULT NULL::uuid, p_action text DEFAULT 'view'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  member_id_value uuid;
begin
  if p_artifact not in ('CANDIDATE_LIST', 'SHORTLIST', 'ORGANIZATION', 'PROGRAM_DASH', 'PDF', 'DOSSIER') then
    raise exception 'INVALID_ARTIFACT';
  end if;
  if p_action not in ('view', 'download') then raise exception 'ACTION_NOT_ALLOWED'; end if;
  select member.id into member_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.institution_id = public.resolve_my_institution_id(p_institution_id)
    and member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active' and institution.active;
  if member_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  insert into public.institution_view_logs (institution_id, member_id, business_id, artifact, artifact_id, action)
  values (public.resolve_my_institution_id(p_institution_id), member_id_value, p_business_id, p_artifact, p_artifact_id, p_action);
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: notify_consent_grant_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_consent_grant_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status
    and new.status in ('revoked', 'expired') then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses dicabut pemilik usaha' else 'Akses berakhir' end,
      case when new.status = 'revoked'
        then 'Pemilik usaha mencabut akses dossier. Isi dossier tertutup; log akses tetap tersimpan.'
        else 'Masa berlaku akses dossier berakhir. Ajukan permintaan pembaruan untuk melihat data terbaru.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status, 'businessId', new.business_id)
    from public.institution_members as member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id,
      case when new.status = 'revoked' then 'consent_revoked' else 'consent_expired' end,
      case when new.status = 'revoked' then 'Akses institusi dicabut' else 'Akses institusi berakhir' end,
      case when new.status = 'revoked'
        then 'Akses institusi ke data usaha Anda sudah dicabut.'
        else 'Masa berlaku akses institusi ke data usaha Anda berakhir.' end,
      jsonb_build_object('grantId', new.id, 'status', new.status)
    from public.business_members as member
    where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$$;


--
-- Name: notify_dossier_download(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_dossier_download() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  business_id_value uuid;
  institution_name_value text;
begin
  if new.action <> 'download' or new.outcome <> 'allowed' then return new; end if;
  select dossier.business_id into business_id_value
  from public.dossiers as dossier where dossier.id = new.dossier_id;
  select institution.name into institution_name_value
  from public.institutions as institution where institution.id = new.institution_id;
  insert into public.notifications (user_id, business_id, notification_type, title, body, data)
  select member.user_id, business_id_value, 'dossier_pdf_download', 'Institusi mengunduh PDF dossier',
    coalesce(institution_name_value, 'Institusi') || ' mengunduh PDF dossier usaha Anda. Unduhan ber-watermark dan tercatat.',
    jsonb_build_object('dossierId', new.dossier_id, 'institutionId', new.institution_id)
  from public.business_members as member
  where member.business_id = business_id_value and member.status = 'active' and member.user_id is not null;
  return new;
end;
$$;


--
-- Name: notify_dossier_request_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_dossier_request_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select profile.auth_user_id, new.business_id, 'consent_review', 'Permintaan akses baru',
      'Ada institusi yang mengajukan pembukaan profil UMKM untuk ditinjau.', jsonb_build_object('requestId', new.id)
    from public.profiles profile where profile.role = 'admin' and profile.status = 'active' and profile.auth_user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_notice', 'Ada ketertarikan institusi',
      'Admin sedang meninjau permintaan akses profil usaha Anda.', jsonb_build_object('requestId', new.id)
    from public.business_members member where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Keputusan admin tersedia',
      case when new.status = 'approved' then 'Permintaan akses disetujui admin.' when new.status = 'rejected' then 'Permintaan akses ditolak admin.' else 'Status permintaan akses berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.institution_members member
    where member.institution_id = new.institution_id and member.status = 'active' and member.user_id is not null;
    insert into public.notifications (user_id, business_id, notification_type, title, body, data)
    select member.user_id, new.business_id, 'consent_decision', 'Status permintaan akses berubah',
      case when new.status = 'approved' then 'Admin menyetujui pembukaan profil usaha Anda.' when new.status = 'rejected' then 'Admin menolak permintaan pembukaan profil usaha Anda.' else 'Status permintaan akses usaha Anda berubah.' end,
      jsonb_build_object('requestId', new.id, 'status', new.status)
    from public.business_members member where member.business_id = new.business_id and member.status = 'active' and member.user_id is not null;
  end if;
  return new;
end;
$$;


--
-- Name: prevent_immutable_row_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_immutable_row_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception '% is append-only/immutable; % is not allowed', tg_table_name, tg_op;
end;
$$;


--
-- Name: program_dashboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.program_dashboard(p_program_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  program_row public.programs%rowtype;
begin
  select * into program_row from public.programs where id = p_program_id;
  if program_row.id is null then raise exception 'PROGRAM_NOT_FOUND'; end if;
  if private.institution_role(program_row.institution_id) is null
    and not (select private.is_platform_admin()) then
    raise exception 'PROGRAM_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'programId', program_row.id,
    'programName', program_row.name,
    'participantCount', (
      select count(*) from public.program_enrollments as enrollment
      where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
    ),
    'levelDistribution', (
      select coalesce(jsonb_agg(row), '[]'::jsonb) from (
        select coalesce(state.level, 'MULAI') as level, count(*) as count
        from public.program_enrollments as enrollment
        left join public.business_readiness_state as state on state.business_id = enrollment.business_id
        where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
        group by coalesce(state.level, 'MULAI')
      ) as row
    ),
    'legalFunnel', (
      select jsonb_build_object(
        'nib', count(distinct enrollment.business_id) filter (where nib.document_id is not null),
        'pirt', count(distinct enrollment.business_id) filter (where pirt.document_id is not null),
        'halal', count(distinct enrollment.business_id) filter (where halal.document_id is not null),
        'participants', count(distinct enrollment.business_id)
      )
      from public.program_enrollments as enrollment
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'nib'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as nib on true
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'pirt'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as pirt on true
      left join lateral (
        select document.id as document_id from public.documents as document
        where document.business_id = enrollment.business_id and document.doc_type = 'halal'
          and document.status not in ('rejected','archived','superseded') limit 1
      ) as halal on true
      where enrollment.program_id = p_program_id and enrollment.status = 'accepted'
    ),
    'participants', (
      select coalesce(jsonb_agg(row order by row."joinedAt"), '[]'::jsonb) from (
        select
          optin.candidate_code as code,
          business.name as "businessName",
          coalesce(state.level, 'MULAI') as level,
          enrollment.applied_at as "joinedAt"
        from public.program_enrollments as enrollment
        join public.businesses as business on business.id = enrollment.business_id
        left join public.discovery_optins as optin on optin.business_id = business.id
        left join public.business_readiness_state as state on state.business_id = business.id
        where enrollment.program_id = p_program_id and enrollment.status in ('accepted', 'applied')
        order by enrollment.applied_at
        limit 200
      ) as row
    )
  );
end;
$$;


--
-- Name: project_dossier_access_to_institution_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_dossier_access_to_institution_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.institution_view_logs (institution_id, member_id, business_id, artifact, artifact_id, action, occurred_at)
  select new.institution_id, member.id, dossier.business_id,
    case when new.action = 'download' then 'PDF' else 'DOSSIER' end,
    new.dossier_id, new.action, coalesce(new.occurred_at, now())
  from public.dossiers dossier
  left join public.institution_members member on member.institution_id = new.institution_id
    and member.user_id = new.actor_user_id and member.status = 'active'
  where dossier.id = new.dossier_id;
  return new;
end;
$$;


--
-- Name: protect_business_membership_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_business_membership_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'BUSINESS_MEMBERSHIP_IS_NOT_EDITABLE: satu usaha dimiliki satu akun, dan kepemilikannya mengikuti usahanya.';
end;
$$;


--
-- Name: protect_consent_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_consent_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (select auth.uid()) is null or tg_op = 'INSERT' then
    return new;
  end if;

  new.request_id := old.request_id;
  new.institution_id := old.institution_id;
  new.business_id := old.business_id;
  new.granted_by := old.granted_by;
  new.scopes := old.scopes;
  new.granted_at := old.granted_at;

  if old.status = 'active' and new.status not in ('active', 'revoked') then
    raise exception 'active consent may only remain active or be revoked';
  end if;
  if old.status <> 'active' and new.status <> old.status then
    raise exception 'inactive consent cannot be reactivated by a browser client';
  end if;
  if new.status = 'revoked' and new.revoked_at is null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: protect_institution_membership_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_institution_membership_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  caller uuid := (select auth.uid());
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if caller is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if private.institution_role(new.institution_id) <> 'admin'
      or new.role <> 'viewer'
      or new.status not in ('invited', 'active') then
      raise exception 'institution membership invitation is not permitted';
    end if;
    new.invited_by := caller;
    return new;
  end if;

  if private.institution_role(old.institution_id) <> 'admin' or old.role = 'admin' then
    raise exception 'institution membership change is not permitted';
  end if;

  if tg_op = 'UPDATE' then
    new.institution_id := old.institution_id;
    new.profile_id := old.profile_id;
    new.user_id := old.user_id;
    new.role := old.role;
    new.invited_by := old.invited_by;
    return new;
  end if;

  return old;
end;
$$;


--
-- Name: protect_profile_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_authority() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id <> (select auth.uid()) then
      raise exception 'profiles may only be created for the authenticated user';
    end if;
    new.auth_user_id := (select auth.uid());
    new.role := null;
    new.status := 'active';
    new.readiness_score := 0;
    new.konsistensi_days := 0;
  else
    new.id := old.id;
    new.auth_user_id := old.auth_user_id;
    new.role := old.role;
    new.status := old.status;
    new.readiness_score := old.readiness_score;
    new.konsistensi_days := old.konsistensi_days;
  end if;

  return new;
end;
$$;


--
-- Name: recalculate_my_readiness(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_my_readiness() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_profile_id uuid;
  v_rule_id uuid;
  v_rule_version text;
  v_tx_count int:=0; v_tx_days int:=0; v_tx_span int:=0; v_digital_count int:=0; v_channel_count int:=0; v_utilities_count int:=0; v_closing_count int:=0;
  v_nib_count int:=0; v_nib_confirmed int:=0; v_nib_verified int:=0; v_certificate_count int:=0;
  v_profile_count int:=0; v_latest_tx timestamptz; v_latest_doc timestamptz; v_input_hash text; v_existing uuid; v_snapshot_id uuid;
  v_tx_score numeric; v_nib_score numeric; v_total numeric:=0;
begin
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
  v_profile_id := v_user_id;

  select id,version into v_rule_id,v_rule_version from public.readiness_rule_sets
  where status='published' and coalesce(effective_at,published_at,created_at)<=now()
  order by coalesce(effective_at,published_at,created_at) desc limit 1;
  if v_rule_id is null then raise exception using errcode='P0001',message='READINESS_RULE_UNAVAILABLE'; end if;

  select count(*),count(distinct transaction_date),coalesce((max(transaction_date)-min(transaction_date))+1,0),
    count(*) filter(where payment_method in ('qris','bank_transfer','ewallet')),
    count(*) filter(where sales_channel is not null),
    count(*) filter(where category_code in ('utilities','operations')),
    max(updated_at)
  into v_tx_count,v_tx_days,v_tx_span,v_digital_count,v_channel_count,v_utilities_count,v_latest_tx
  from public.transactions where business_id=v_business_id and ledger_status='confirmed';
  select count(*) into v_closing_count from public.daily_closings where business_id=v_business_id and status='closed';
  select count(*) filter(where d.doc_type='nib'),
    count(*) filter(where d.doc_type='nib' and e.owner_review_status in ('owner_confirmed','owner_corrected')),
    count(*) filter(where d.doc_type='nib' and verification.status='verified'),
    count(*) filter(where d.doc_type in ('halal','pirt','izin_edar','sertifikat','training')),
    max(d.updated_at)
  into v_nib_count,v_nib_confirmed,v_nib_verified,v_certificate_count,v_latest_doc
  from public.documents d
  left join public.document_versions doc_version on doc_version.document_id=d.id and doc_version.version=d.current_version
  left join public.document_extractions e on e.document_version_id=doc_version.id
  left join public.document_verifications verification on verification.document_version_id=doc_version.id
  -- Hanya dokumen yang benar-benar punya berkas yang dihitung sebagai bukti.
  -- Nomor izin yang diketik pemilik disimpan sebagai dokumen (P8) supaya
  -- ringkasan legalitas punya satu sumber, tetapi klaim bukanlah bukti:
  -- tanpa baris ini, mengetik nomor NIB akan menaikkan tingkat kesiapan
  -- tanpa satu berkas pun pernah diunggah.
  where d.business_id=v_business_id and d.status not in ('archived','superseded')
    and d.storage_path is not null;
  select (case when coalesce(profile.nama_usaha,business.name) is not null then 1 else 0 end
    +case when coalesce(profile.sektor_usaha,business.sector) is not null then 1 else 0 end
    +case when coalesce(profile.lokasi,business.location) is not null then 1 else 0 end
    +case when coalesce(profile.phone,business.phone,profile.email) is not null then 1 else 0 end)
  into v_profile_count from public.businesses business left join public.profiles profile on profile.id=coalesce(v_profile_id,business.legacy_profile_id)
  where business.id=v_business_id;
  v_profile_count:=coalesce(v_profile_count,0);

  v_input_hash:=md5(concat_ws('|',v_rule_id,v_tx_count,v_tx_days,v_tx_span,v_digital_count,v_channel_count,v_utilities_count,v_closing_count,v_nib_count,v_nib_confirmed,v_nib_verified,v_certificate_count,v_profile_count,coalesce(v_latest_tx::text,''),coalesce(v_latest_doc::text,'')));
  select id into v_existing from public.readiness_score_snapshots where business_id=v_business_id and rule_set_id=v_rule_id and input_hash=v_input_hash order by calculated_at desc limit 1;
  if v_existing is not null then return jsonb_build_object('snapshotId',v_existing,'idempotent',true); end if;

  v_tx_score:=case when v_tx_count=0 then null else least(15,v_tx_count*1.5)+least(20,v_tx_days*2)+least(10,v_tx_span) end;
  v_nib_score:=case when v_nib_count=0 then null when v_nib_verified>0 then 25 when v_nib_confirmed>0 then 18 else 8 end;
  v_total:=coalesce(v_tx_score,0)+coalesce(v_nib_score,0)
    +(case when v_tx_count=0 then 0 when v_utilities_count>0 then 6 else 0 end)
    +(case when v_tx_count=0 then 0 when v_channel_count>0 then 6 else 0 end)
    +(case when v_tx_count=0 then 0 when v_digital_count>0 then 6 else 0 end)
    +(v_profile_count*1.5)+(case when v_certificate_count>0 then 6 else 0 end);
  insert into public.readiness_score_snapshots(business_id,rule_set_id,total_score,input_hash,summary,calculated_by)
  values(v_business_id,v_rule_id,round(v_total,2),v_input_hash,jsonb_build_object('ruleVersion',v_rule_version,'disclaimer','Kesiapan Data Usaha bukan penilaian resmi atau jaminan pembiayaan.'),v_user_id)
  returning id into v_snapshot_id;

  insert into public.readiness_score_components(snapshot_id,component_key,component_status,raw_score,weight,weighted_score,max_score,confidence,freshness,evidence_count,explanation,next_action,quality_tier,evidence) values
  (v_snapshot_id,'transaction_recording',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,v_tx_score,45,v_tx_score,45,case when v_tx_count=0 then 0 else least(1,v_tx_count/20.0) end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' when v_latest_tx>=now()-interval '90 days' then 'aging' else 'stale' end,v_tx_count,case when v_tx_count=0 then 'Belum ada transaksi yang dikonfirmasi.' else format('%s transaksi pada %s hari aktif.',v_tx_count,v_tx_days) end,case when v_tx_days<20 then 'Catat transaksi yang benar-benar terjadi secara rutin.' else null end,case when v_closing_count>0 then 'confirmed' else 'recorded' end,jsonb_build_object('transactionCount',v_tx_count,'activityDays',v_tx_days,'durationDays',v_tx_span,'dailyClosings',v_closing_count)),
  (v_snapshot_id,'basic_legality',case when v_nib_count=0 then 'data_insufficient' else 'scored' end,v_nib_score,25,v_nib_score,25,case when v_nib_verified>0 then 1 when v_nib_confirmed>0 then .75 when v_nib_count>0 then .4 else 0 end,case when v_latest_doc>=now()-interval '90 days' then 'fresh' else 'stale' end,v_nib_count,case when v_nib_count=0 then 'NIB belum tersedia sebagai bukti legalitas dasar.' when v_nib_verified>0 then 'NIB telah diperiksa oleh petugas berwenang.' when v_nib_confirmed>0 then 'Data NIB telah dikonfirmasi pemilik, tetapi bukan verifikasi keaslian.' else 'NIB tersimpan dan masih perlu diperiksa.' end,case when v_nib_count=0 then 'Unggah NIB yang masih berlaku.' when v_nib_confirmed=0 then 'Periksa hasil baca NIB dan konfirmasi datanya.' else null end,case when v_nib_verified>0 then 'verified' when v_nib_confirmed>0 then 'confirmed' else 'recorded' end,jsonb_build_object('documentCount',v_nib_count,'ownerConfirmed',v_nib_confirmed,'verified',v_nib_verified)),
  (v_snapshot_id,'utilities',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_utilities_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_utilities_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .6 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_utilities_count,case when v_utilities_count>0 then 'Biaya rutin usaha sudah mulai tercatat.' else 'Belum ada biaya listrik, air, atau internet usaha yang tercatat.' end,case when v_utilities_count=0 then 'Catat biaya rutin usaha saat benar-benar dibayar.' else null end,'recorded',jsonb_build_object('transactionCount',v_utilities_count)),
  (v_snapshot_id,'digital_footprint',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_channel_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_channel_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .5 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_channel_count,case when v_channel_count>0 then 'Asal pesanan sudah dicatat pada transaksi.' else 'Asal pesanan atau kanal penjualan belum dicatat.' end,case when v_channel_count=0 then 'Isi asal pesanan pada transaksi berikutnya.' else null end,'recorded',jsonb_build_object('transactionCount',v_channel_count)),
  (v_snapshot_id,'digital_payments',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_digital_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_digital_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .8 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_digital_count,case when v_digital_count>0 then 'Pembayaran digital tercatat pada transaksi.' else 'Belum ada pembayaran QRIS, transfer, atau dompet digital yang tercatat.' end,case when v_digital_count=0 then 'Pilih cara pembayaran digital saat memang digunakan.' else null end,'recorded',jsonb_build_object('transactionCount',v_digital_count)),
  (v_snapshot_id,'complete_profile','scored',v_profile_count*1.5,6,v_profile_count*1.5,6,v_profile_count/4.0,'fresh',v_profile_count,format('%s dari 4 informasi dasar usaha telah terisi.',v_profile_count),case when v_profile_count<4 then 'Lengkapi profil usaha.' else null end,'confirmed',jsonb_build_object('completedFields',v_profile_count)),
  (v_snapshot_id,'certificates_training','scored',case when v_certificate_count>0 then 6 else 0 end,6,case when v_certificate_count>0 then 6 else 0 end,6,case when v_certificate_count>0 then .6 else .2 end,case when v_latest_doc>=now()-interval '365 days' then 'fresh' else 'stale' end,v_certificate_count,case when v_certificate_count>0 then 'Sertifikat atau izin pendukung tersimpan.' else 'Belum ada sertifikat atau pelatihan pendukung yang dicatat.' end,case when v_certificate_count=0 then 'Unggah hanya sertifikat yang benar-benar dimiliki.' else null end,'recorded',jsonb_build_object('documentCount',v_certificate_count));

  insert into public.business_missions(business_id,mission_id,status,progress,started_at,completed_at)
  select v_business_id,mission.id,
    case mission.code when 'record_transactions' then case when v_tx_count>0 then 'completed' else 'available' end
      when 'upload_nib' then case when v_nib_count>0 then 'completed' else 'available' end
      when 'complete_profile' then case when v_profile_count=4 then 'completed' else 'available' end
      when 'use_digital_payment' then case when v_digital_count>0 then 'completed' else 'available' end
      when 'record_utilities' then case when v_utilities_count>0 then 'completed' else 'available' end
      when 'record_sales_channel' then case when v_channel_count>0 then 'completed' else 'available' end
      when 'upload_certificate' then case when v_certificate_count>0 then 'completed' else 'available' end end,
    jsonb_build_object('evidenceCheckedAt',now()),now(),
    case mission.code when 'record_transactions' then case when v_tx_count>0 then now() end when 'upload_nib' then case when v_nib_count>0 then now() end when 'complete_profile' then case when v_profile_count=4 then now() end when 'use_digital_payment' then case when v_digital_count>0 then now() end when 'record_utilities' then case when v_utilities_count>0 then now() end when 'record_sales_channel' then case when v_channel_count>0 then now() end when 'upload_certificate' then case when v_certificate_count>0 then now() end end
  from public.missions mission where mission.status='active'
  on conflict(business_id,mission_id) do update set status=case when public.business_missions.status='dismissed' and excluded.status<>'completed' then 'dismissed' else excluded.status end,progress=excluded.progress,completed_at=case when excluded.status='completed' then coalesce(public.business_missions.completed_at,excluded.completed_at) else null end,updated_at=now();
  update public.profiles set readiness_score=round(v_total,2),updated_at=now() where id=coalesce(v_profile_id,(select legacy_profile_id from public.businesses where id=v_business_id));
  insert into public.audit_events(actor_user_id,actor_type,business_id,action,target_type,target_id,metadata)
  values(v_user_id,'user',v_business_id,'READINESS_SNAPSHOT_CREATED','readiness_score_snapshot',v_snapshot_id::text,jsonb_build_object('ruleVersion',v_rule_version,'score',round(v_total,2)));
  return jsonb_build_object('snapshotId',v_snapshot_id,'idempotent',false);
end $$;


--
-- Name: record_document_ocr_consent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_document_ocr_consent(p_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_session public.document_upload_sessions%rowtype;
  v_recorded boolean := false;
  v_policy_version constant text := 'document-reading-v1';
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select session_record.* into v_session
  from public.document_upload_sessions as session_record
  where session_record.id = p_session_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_NOT_FOUND';
  end if;
  if v_session.user_id <> v_user_id
    or not private.business_access(v_session.business_id) then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_session.doc_type not in ('ktp', 'nib', 'npwp') then
    raise exception using errcode = '22023', message = 'DOCUMENT_OCR_NOT_SUPPORTED';
  end if;
  if v_session.status <> 'pending' or v_session.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.ocr_consent_at is null then
    update public.document_upload_sessions
    set
      ocr_consent_at = now(),
      ocr_processor_scope = 'configured_ai_provider',
      ocr_consent_policy_version = v_policy_version,
      updated_at = now()
    where id = v_session.id;
    v_recorded := true;
    insert into public.audit_events (
      actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
    ) values (
      v_user_id, 'business_owner', v_session.business_id, 'DOCUMENT_OCR_CONSENT_RECORDED',
      'document_upload_session', v_session.id::text,
      jsonb_build_object(
        'docType', v_session.doc_type,
        'processorScope', 'configured_ai_provider',
        'policyVersion', v_policy_version
      )
    );
  end if;
  return jsonb_build_object(
    'sessionId', v_session.id,
    'consentRecorded', v_recorded,
    'policyVersion', coalesce(v_session.ocr_consent_policy_version, v_policy_version)
  );
end;
$$;


--
-- Name: record_institution_report_issue(uuid, uuid, uuid, uuid, text, text, text, bigint, text, text, date, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_institution_report_issue(p_business_id uuid, p_institution_id uuid, p_dossier_id uuid, p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date DEFAULT NULL::date, p_period_to date DEFAULT NULL::date, p_formula_version text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_issue_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'UNAUTHENTICATED'; end if;
  -- Hanya dari dossier aktif milik organisasi pemanggil.
  if not exists (
    select 1 from public.dossiers as dossier
    join public.consent_grants as grant_row on grant_row.id = dossier.grant_id
    where dossier.id = p_dossier_id
      and dossier.business_id = p_business_id
      and dossier.institution_id = public.resolve_my_institution_id(p_institution_id)
      and dossier.status = 'ready' and dossier.expires_at > now()
      and grant_row.status = 'active' and grant_row.expires_at > now()
      and grant_row.download_allowed
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_report_kind not in ('pdf_sak_emkm', 'snapshot_dossier')
    or char_length(trim(coalesce(p_document_uid, ''))) not between 8 and 64
    or char_length(trim(coalesce(p_name, ''))) not between 1 and 240
    or p_file_size is null or p_file_size <= 0
    or lower(coalesce(p_checksum_sha256, '')) !~ '^[a-f0-9]{64}$' then
    raise exception 'VALIDATION_FAILED';
  end if;
  -- Berkas dossier institusi tinggal di ruang organisasinya, bukan ruang pemilik.
  if p_storage_path is distinct from (
    p_institution_id::text || '/' || p_business_id::text || '/' ||
    p_document_id::text || '/' || p_document_id::text || '.pdf'
  ) then raise exception 'REPORT_STORAGE_PATH_INVALID'; end if;

  insert into public.documents (
    id, business_id, user_id, name, doc_type, status,
    storage_path, mime_type, file_size, checksum_sha256
  ) values (
    p_document_id, p_business_id, (select auth.uid()), trim(p_name), p_report_kind, 'verified',
    p_storage_path, 'application/pdf', p_file_size, lower(p_checksum_sha256)
  )
  on conflict (id) do nothing;

  insert into public.report_issues (
    business_id, document_id, dossier_id, report_kind, period_from, period_to,
    document_uid, audience, institution_id, formula_version, created_by
  ) values (
    p_business_id, p_document_id, p_dossier_id, p_report_kind, p_period_from, p_period_to,
    trim(p_document_uid), 'institution', p_institution_id, p_formula_version, (select auth.uid())
  )
  on conflict (document_uid) do nothing;

  select id into v_issue_id from public.report_issues where document_uid = trim(p_document_uid);
  return jsonb_build_object('ok', true, 'issueId', v_issue_id, 'documentUid', trim(p_document_uid));
end;
$_$;


--
-- Name: record_report_issue(uuid, text, text, text, bigint, text, text, date, date, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_report_issue(p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date DEFAULT NULL::date, p_period_to date DEFAULT NULL::date, p_audience text DEFAULT 'self'::text, p_institution_id uuid DEFAULT NULL::uuid, p_formula_version text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_issue_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_document_id is null
    or p_report_kind not in ('pdf_sak_emkm', 'snapshot_dossier')
    or char_length(trim(coalesce(p_document_uid, ''))) not between 8 and 64
    or char_length(trim(coalesce(p_name, ''))) not between 1 and 240
    or p_file_size is null or p_file_size <= 0
    or lower(coalesce(p_checksum_sha256, '')) !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Jalur simpan harus berada di dalam ruang pemilik sendiri. Tanpa
  -- pemeriksaan ini, satu baris arsip bisa dibuat menunjuk berkas usaha lain.
  if p_storage_path is distinct from (
    v_user_id::text || '/' || v_business_id::text || '/' || p_document_id::text || '/' ||
    p_document_id::text || '.pdf'
  ) then
    raise exception using errcode = '22023', message = 'REPORT_STORAGE_PATH_INVALID';
  end if;

  insert into public.documents (
    id, business_id, user_id, name, doc_type, status,
    storage_path, mime_type, file_size, checksum_sha256
  ) values (
    p_document_id, v_business_id, v_user_id, trim(p_name), p_report_kind, 'verified',
    p_storage_path, 'application/pdf', p_file_size, lower(p_checksum_sha256)
  );

  insert into public.report_issues (
    business_id, document_id, report_kind, period_from, period_to,
    document_uid, audience, institution_id, formula_version, created_by
  ) values (
    v_business_id, p_document_id, p_report_kind, p_period_from, p_period_to,
    trim(p_document_uid), p_audience, p_institution_id, p_formula_version, v_user_id
  ) returning id into v_issue_id;

  return jsonb_build_object(
    'ok', true,
    'issueId', v_issue_id,
    'documentId', p_document_id,
    'documentUid', trim(p_document_uid)
  );
end;
$_$;


--
-- Name: register_fixed_asset(text, bigint, date, text, integer, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_fixed_asset(p_name text, p_cost_idr bigint, p_acquired_on date, p_category text DEFAULT NULL::text, p_useful_life_months integer DEFAULT NULL::integer, p_salvage_value_idr bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_category text;
  v_life integer;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  v_category := lower(coalesce(nullif(trim(p_category), ''), private.guess_asset_category(p_name)));
  if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  v_life := coalesce(p_useful_life_months, private.default_useful_life_months(v_category));

  if char_length(trim(coalesce(p_name, ''))) not between 1 and 120
    or p_cost_idr is null or p_cost_idr <= 0
    or p_acquired_on is null
    or p_acquired_on > (now() at time zone 'Asia/Jakarta')::date
    or v_life not between 1 and 600
    or coalesce(p_salvage_value_idr, 0) < 0
    or coalesce(p_salvage_value_idr, 0) >= p_cost_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  insert into public.fixed_assets (
    business_id, name, category, acquired_on, cost_idr, useful_life_months, salvage_value_idr, created_by
  ) values (
    v_business_id, trim(p_name), v_category, p_acquired_on, p_cost_idr, v_life,
    coalesce(p_salvage_value_idr, 0), v_user_id
  ) returning id into v_id;

  return jsonb_build_object('fixedAssetId', v_id, 'category', v_category, 'usefulLifeMonths', v_life);
end;
$$;


--
-- Name: register_loan(text, bigint, date, text, bigint, bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_loan(p_lender_name text, p_principal_idr bigint, p_started_on date, p_lender_type text DEFAULT 'KOPERASI'::text, p_outstanding_idr bigint DEFAULT NULL::bigint, p_monthly_installment_idr bigint DEFAULT NULL::bigint, p_annual_rate numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_counterparty_id uuid;
  v_type text := upper(coalesce(nullif(trim(p_lender_type), ''), 'KOPERASI'));
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if char_length(trim(coalesce(p_lender_name, ''))) not between 1 and 120
    or p_principal_idr is null or p_principal_idr <= 0
    or p_started_on is null or p_started_on > (now() at time zone 'Asia/Jakarta')::date
    or v_type not in ('BANK', 'KOPERASI', 'KELUARGA', 'SUPPLIER', 'LAIN')
    or coalesce(p_outstanding_idr, p_principal_idr) < 0
    or (p_monthly_installment_idr is not null and p_monthly_installment_idr <= 0)
    or (p_annual_rate is not null and (p_annual_rate < 0 or p_annual_rate > 200)) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  insert into public.counterparties (business_id, name, type, created_by)
  values (v_business_id, trim(p_lender_name),
    case v_type when 'SUPPLIER' then 'SUPPLIER' when 'BANK' then 'BANK'
      when 'KELUARGA' then 'KELUARGA' when 'KOPERASI' then 'KOPERASI' else 'LAIN' end,
    v_user_id)
  on conflict (business_id, lower(trim(name))) do update set is_active = true, updated_at = now()
  returning id into v_counterparty_id;

  insert into public.loans (
    business_id, counterparty_id, lender_name, lender_type, principal_idr,
    outstanding_idr, monthly_installment_idr, annual_rate, started_on, created_by
  ) values (
    v_business_id, v_counterparty_id, trim(p_lender_name), v_type, p_principal_idr,
    coalesce(p_outstanding_idr, p_principal_idr), p_monthly_installment_idr, p_annual_rate,
    p_started_on, v_user_id
  ) returning id into v_id;

  return jsonb_build_object('loanId', v_id, 'counterpartyId', v_counterparty_id);
end;
$$;


--
-- Name: reject_document_upload_session(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_document_upload_session(p_session_id uuid, p_rejection_code text, p_rejection_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_session public.document_upload_sessions%rowtype;
begin
  if char_length(trim(coalesce(p_rejection_code, ''))) not between 1 and 80
    or char_length(trim(coalesce(p_rejection_reason, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  select upload_session.* into v_session
  from public.document_upload_sessions as upload_session
  where upload_session.id = p_session_id
  for update;
  if not found then return; end if;

  update public.document_upload_sessions
  set
    status = 'rejected',
    rejection_code = trim(p_rejection_code),
    rejection_reason = trim(p_rejection_reason),
    updated_at = now()
  where id = p_session_id and status = 'pending';

  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, status, metadata
  ) values (
    v_session.user_id, 'system', v_session.business_id, 'DOCUMENT_UPLOAD_REJECTED',
    'document_upload_session', v_session.id::text, 'failure',
    jsonb_build_object('code', trim(p_rejection_code), 'documentId', v_session.document_id)
  );
end;
$$;


--
-- Name: request_account_deletion(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_account_deletion(p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_scheduled date;
  v_revoked integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_user_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'PROFILE_NOT_FOUND';
  end if;

  -- Permintaan kedua tidak memperpanjang tenggang. Kalau memperpanjang,
  -- menekan tombolnya berulang kali justru menjauhkan tanggal penghapusan.
  if v_profile.deletion_requested_at is not null then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'scheduledFor', v_profile.deletion_scheduled_for
    );
  end if;

  v_scheduled := ((now() at time zone 'Asia/Jakarta')::date
    + private.account_deletion_grace_days());

  update public.profiles set
    deletion_requested_at = now(),
    deletion_scheduled_for = v_scheduled,
    deletion_reason = nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where auth_user_id = v_user_id;

  -- Akses institusi berhenti sekarang juga, bukan setelah 30 hari.
  with revoked as (
    update public.consent_grants g set
      status = 'revoked',
      revoked_at = now(),
      revocation_reason = 'Pemilik meminta penghapusan akun',
      updated_at = now()
    from public.businesses b
    where g.business_id = b.id
      and g.status = 'active'
      and (b.legacy_profile_id = v_user_id
        or exists (
          select 1 from public.business_members m
          where m.business_id = b.id and m.user_id = v_user_id
            and m.status = 'active'
        ))
    returning g.id
  )
  select count(*) into v_revoked from revoked;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_user_id, 'ACCOUNT_DELETION_REQUESTED', 'profile', v_profile.id::text,
    jsonb_build_object('scheduledFor', v_scheduled, 'revokedGrants', v_revoked)
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'scheduledFor', v_scheduled,
    'revokedGrants', v_revoked
  );
end;
$$;


--
-- Name: resolve_anonymous_candidate_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_anonymous_candidate_code(p_candidate_code text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select optin.business_id
  from public.discovery_optins optin
  join public.institution_members member on member.user_id = (select auth.uid())
    and member.status = 'active' and member.institution_id is not null
  join public.institutions institution on institution.id = member.institution_id
    and institution.status = 'active' and institution.active
  where optin.candidate_code = upper(trim(p_candidate_code)) and optin.opted_in = true
  limit 1
$$;


--
-- Name: resolve_my_institution_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_my_institution_id(p_institution_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  institution_id_value uuid;
begin
  if p_institution_id is not null then
    select institution.id into institution_id_value
    from public.institutions as institution
    join public.institution_members as member on member.institution_id = institution.id
    where institution.id = p_institution_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and institution.status = 'active'
      and institution.active;
    if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
    return institution_id_value;
  end if;
  select member.institution_id into institution_id_value
  from public.institution_members as member
  join public.institutions as institution on institution.id = member.institution_id
  where member.user_id = (select auth.uid())
    and member.status = 'active'
    and institution.status = 'active'
    and institution.active
  order by member.created_at
  limit 1;
  if institution_id_value is null then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  return institution_id_value;
end;
$$;


--
-- Name: respond_to_dossier_request(uuid, text, text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[] DEFAULT '{}'::text[], p_download_allowed boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      where transaction.business_id = request_row.business_id and transaction.transaction_date >= current_date - 89;
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
$$;


--
-- Name: retry_document_extraction(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retry_document_extraction(p_document_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_extraction public.document_extractions%rowtype;
  v_job public.ai_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select document_record.* into v_document
  from public.documents as document_record
  where document_record.id = p_document_id
  for update;
  if not found or v_document.user_id <> v_user_id
    or not private.business_access(v_document.business_id) then
    raise exception using errcode = '42501', message = 'DOCUMENT_ACCESS_DENIED';
  end if;
  if v_document.status = 'superseded' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_ARCHIVED';
  end if;
  select version_record.* into v_version
  from public.document_versions as version_record
  where version_record.document_id = v_document.id
    and version_record.version = v_document.current_version
  for update;
  select extraction_record.* into v_extraction
  from public.document_extractions as extraction_record
  where extraction_record.document_version_id = v_version.id
  for update;
  if not found or v_extraction.status <> 'failed' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_RETRYABLE';
  end if;
  if v_document.doc_type in ('ktp', 'nib', 'npwp') and not exists (
    select 1 from public.document_upload_sessions as session_record
    where session_record.storage_path = v_version.storage_path
      and session_record.ocr_consent_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_OCR_CONSENT_REQUIRED';
  end if;
  select job_record.* into v_job
  from public.ai_jobs as job_record
  where job_record.document_version_id = v_version.id
    and job_record.job_type = 'document_extraction'
  for update;
  if not found or v_job.status <> 'failed' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_EXTRACTION_NOT_RETRYABLE';
  end if;

  update public.ai_jobs
  set status = 'queued', max_attempts = greatest(max_attempts, attempt_count + 3),
    available_at = now(), locked_at = null, locked_by = null,
    failure_code = null, failure_message = null, completed_at = null, updated_at = now()
  where id = v_job.id;
  update public.document_extractions
  set status = 'queued', extractor = null, failure_code = null, failure_message = null,
    started_at = null, completed_at = null, updated_at = now()
  where id = v_extraction.id;
  update public.document_versions set status = 'processing' where id = v_version.id;
  update public.documents
  set status = 'processing', ai_notes = 'Data dokumen sedang dibaca kembali.', updated_at = now()
  where id = v_document.id;
  insert into public.audit_events (
    actor_user_id, actor_type, business_id, action, target_type, target_id, metadata
  ) values (
    v_user_id, 'business_owner', v_document.business_id, 'DOCUMENT_EXTRACTION_RETRIED',
    'document_version', v_version.id::text,
    jsonb_build_object('attemptsBeforeRetry', v_job.attempt_count)
  );
  return jsonb_build_object(
    'documentId', v_document.id,
    'documentVersionId', v_version.id,
    'jobId', v_job.id,
    'status', 'queued'
  );
end;
$$;


--
-- Name: revoke_consent_grant(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_consent_grant(p_grant_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare grant_row public.consent_grants%rowtype;
begin
  select * into grant_row from public.consent_grants where id = p_grant_id for update;
  if grant_row.id is null then raise exception 'GRANT_NOT_FOUND'; end if;
  if not private.business_access(grant_row.business_id)
    and not private.is_platform_admin() then
    raise exception 'GRANT_NOT_FOUND';
  end if;
  if grant_row.status <> 'active' then
    return jsonb_build_object('grantId', grant_row.id, 'status', grant_row.status, 'idempotent', true);
  end if;
  update public.consent_grants set status = 'revoked', revoked_at = now(),
    revocation_reason = nullif(trim(p_reason), '') where id = grant_row.id;
  update public.dossiers set status = 'revoked' where grant_id = grant_row.id and status = 'ready';
  return jsonb_build_object('grantId', grant_row.id, 'status', 'revoked', 'idempotent', false);
end;
$$;


--
-- Name: save_inventory_count(date, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_inventory_count(p_period_month date, p_counted_value_idr bigint, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_month date := date_trunc('month', p_period_month)::date;
  v_month_end date;
  v_existing public.inventory_counts%rowtype;
  v_balance bigint;
  v_difference bigint;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  if p_period_month is null or p_counted_value_idr is null or p_counted_value_idr < 0
    or v_month > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date
    or char_length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_month_end := (v_month + interval '1 month - 1 day')::date;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':inventory:' || v_month::text, 0));

  -- Hitungan ulang membalik koreksi sebelumnya, tidak menimpanya.
  select * into v_existing from public.inventory_counts
  where business_id = v_business_id and period_month = v_month for update;
  if found and v_existing.journal_entry_id is not null then
    perform private.reverse_journal_entry_on(
      v_existing.journal_entry_id, 'Hitungan stok diperbarui pemilik', v_month_end);
  end if;

  select coalesce(sum(line.debit) - sum(line.credit), 0) into v_balance
  from public.journal_lines as line
  join public.journal_entries as entry on entry.id = line.entry_id
  where line.business_id = v_business_id
    and line.account_code = '1400'
    and entry.entry_date <= v_month_end;

  v_difference := p_counted_value_idr - v_balance;

  if v_difference <> 0 then
    insert into public.journal_entries (
      business_id, entry_date, source, memo, template_version, created_by, cash_flow_section
    ) values (
      v_business_id, v_month_end, 'INVENTORY_ADJ',
      'Koreksi stok bahan ' || to_char(v_month, 'MM-YYYY'),
      'coa-emkm-v1', v_user_id, 'NON_KAS'
    ) returning id into v_entry_id;

    if v_difference > 0 then
      -- Stok lebih banyak dari yang tercatat: belanja bulan ini belum terpakai.
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '1400', v_difference, 0, 1),
             (v_entry_id, v_business_id, '5100', 0, v_difference, 2);
    else
      insert into public.journal_lines (entry_id, business_id, account_code, debit, credit, line_order)
      values (v_entry_id, v_business_id, '5100', -v_difference, 0, 1),
             (v_entry_id, v_business_id, '1400', 0, -v_difference, 2);
    end if;
  end if;

  insert into public.inventory_counts (
    business_id, period_month, counted_value_idr, adjustment_idr, journal_entry_id, notes, counted_by
  ) values (
    v_business_id, v_month, p_counted_value_idr, v_difference, v_entry_id, nullif(trim(p_notes), ''), v_user_id
  )
  on conflict (business_id, period_month) do update set
    counted_value_idr = excluded.counted_value_idr,
    adjustment_idr = excluded.adjustment_idr,
    journal_entry_id = excluded.journal_entry_id,
    notes = excluded.notes,
    counted_by = excluded.counted_by
  returning * into v_existing;

  return jsonb_build_object(
    'inventoryCountId', v_existing.id,
    'periodMonth', v_month,
    'countedValueIdr', p_counted_value_idr,
    'previousValueIdr', v_balance,
    'adjustmentIdr', v_difference,
    'journalEntryId', v_entry_id
  );
end;
$$;


--
-- Name: save_opening_balances(date, bigint, bigint, jsonb, jsonb, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_opening_balances(p_start_date date, p_cash_idr bigint DEFAULT 0, p_bank_idr bigint DEFAULT 0, p_receivables jsonb DEFAULT '[]'::jsonb, p_payables jsonb DEFAULT '[]'::jsonb, p_inventory_details jsonb DEFAULT '[]'::jsonb, p_assets jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_existing public.opening_balances%rowtype;
  v_opening_id uuid;
  v_result jsonb;
  v_inventory_idr bigint;
  v_details jsonb;
  v_group jsonb;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  -- Tiap kategori diperiksa lalu dinormalkan: totalnya dihitung DI SINI dari
  -- daftar barang ditambah sisanya, bukan diterima dari pemanggil. Angka yang
  -- dihitung di satu tempat tidak bisa berselisih dengan rinciannya.
  v_details := '[]'::jsonb;
  for v_group in select * from jsonb_array_elements(coalesce(p_inventory_details, '[]'::jsonb))
  loop
    if v_group->>'kind' is null or v_group->>'kind' not in ('bahan_baku', 'setengah_jadi', 'barang_jadi') then
      raise exception using errcode = '22023', message = 'INVENTORY_KIND_INVALID';
    end if;
    if jsonb_typeof(coalesce(v_group->'items', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_INVALID';
    end if;
    if jsonb_array_length(coalesce(v_group->'items', '[]'::jsonb)) > 20 then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_TOO_MANY';
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_group->'items', '[]'::jsonb)) as item
      where coalesce(btrim(item->>'name'), '') = ''
         or coalesce((item->>'amountIdr')::bigint, 0) < 0
    ) then
      raise exception using errcode = '22023', message = 'INVENTORY_ITEM_INVALID';
    end if;
    if coalesce((v_group->>'otherAmountIdr')::bigint, 0) < 0 then
      raise exception using errcode = '22023', message = 'INVENTORY_NEGATIVE';
    end if;

    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'kind', v_group->>'kind',
        'items', coalesce(v_group->'items', '[]'::jsonb),
        'otherAmountIdr', coalesce((v_group->>'otherAmountIdr')::bigint, 0),
        'amountIdr', coalesce((v_group->>'otherAmountIdr')::bigint, 0) + (
          select coalesce(sum((item->>'amountIdr')::bigint), 0)
          from jsonb_array_elements(coalesce(v_group->'items', '[]'::jsonb)) as item
        )
      )
    );
  end loop;

  select coalesce(sum((detail->>'amountIdr')::bigint), 0)
  into v_inventory_idr
  from jsonb_array_elements(v_details) as detail;

  perform private.assert_opening_payload(p_start_date, p_cash_idr, p_bank_idr, v_inventory_idr,
    p_receivables, p_payables, p_assets, p_notes);

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':opening', 0));

  -- Sudah pernah diisi: kembalikan yang ada. Sejak `0064` tidak ada operasi
  -- yang memperbaikinya; salah ketik dibetulkan lewat catat transaksi.
  select * into v_existing from public.opening_balances where business_id = v_business_id;
  if found then
    return jsonb_build_object(
      'openingBalanceId', v_existing.id,
      'startDate', v_existing.start_date,
      'journalEntryId', v_existing.journal_entry_id,
      'idempotent', true
    );
  end if;

  insert into public.opening_balances (business_id, start_date, created_by)
  values (v_business_id, p_start_date, v_user_id)
  returning id into v_opening_id;

  v_result := private.rebuild_opening_balance(v_opening_id, p_start_date, p_cash_idr, p_bank_idr,
    p_receivables, p_payables, v_inventory_idr, p_assets, p_notes, v_user_id, false);

  update public.opening_balances set inventory_details = v_details where id = v_opening_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_business_id, 'OPENING_BALANCE_RECORDED', 'opening_balance', v_opening_id::text,
    jsonb_build_object('startDate', p_start_date, 'equityIdr', v_result->'equityIdr',
      'negativeEquity', v_result->'negativeEquity'));

  return v_result || jsonb_build_object('idempotent', false);
end;
$$;


--
-- Name: save_readiness_snapshot(text, jsonb, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_readiness_snapshot(p_level text, p_components jsonb, p_formula_version text, p_snapshot_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_date date;
  v_state public.business_readiness_state%rowtype;
  v_level_since date;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;
  if p_level not in ('MULAI', 'TEMBAGA', 'PERAK', 'EMAS') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_date := coalesce(p_snapshot_date, (now() at time zone 'Asia/Jakarta')::date);
  select * into v_state from public.business_readiness_state where business_id = v_business_id for update;

  -- Tanggal naik tingkat dipertahankan selama tingkatnya tidak berubah, supaya
  -- "Perak sejak 12 Agustus" tidak berubah setiap hari.
  v_level_since := case
    when found and v_state.level = p_level then coalesce(v_state.level_since, v_date)
    else v_date
  end;

  insert into public.readiness_daily (
    business_id, snapshot_date, level, level_since, grace_until, components, formula_version
  ) values (
    v_business_id, v_date, p_level, v_level_since,
    case when found then v_state.grace_until else null end,
    coalesce(p_components, '[]'::jsonb), p_formula_version
  )
  on conflict (business_id, snapshot_date) do update set
    level = excluded.level,
    level_since = excluded.level_since,
    components = excluded.components,
    formula_version = excluded.formula_version;

  insert into public.business_readiness_state (
    business_id, level, level_since, formula_version, updated_at
  ) values (v_business_id, p_level, v_level_since, p_formula_version, now())
  on conflict (business_id) do update set
    level = excluded.level,
    level_since = excluded.level_since,
    formula_version = excluded.formula_version,
    updated_at = now();

  return jsonb_build_object('ok', true, 'level', p_level, 'levelSince', v_level_since);
end;
$$;


--
-- Name: schedule_capture_processing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_capture_processing(p_capture_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_capture public.transaction_captures%rowtype;
  v_job public.ai_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  select capture.*
  into v_capture
  from public.transaction_captures as capture
  where capture.id = p_capture_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'CAPTURE_NOT_FOUND';
  end if;

  -- Bebas role: izinkan jika pemilik capture atau pemilik bisnis
  if v_capture.user_id <> v_user_id
    and not exists (
      select 1 from public.businesses b
      where b.id = v_capture.business_id and b.legacy_profile_id = v_user_id
    )
    and not exists (
      select 1 from public.business_members m
      where m.business_id = v_capture.business_id and m.user_id = v_user_id and m.status = 'active'
    ) then
    raise exception using errcode = 'P0001', message = 'BUSINESS_ACCESS_DENIED';
  end if;

  if v_capture.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;
  if v_capture.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_CANCELLED';
  end if;
  if v_capture.status = 'failed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_PROCESSING_FAILED';
  end if;

  select job.*
  into v_job
  from public.ai_jobs as job
  where job.capture_id = v_capture.id
    and job.job_type = 'voice_to_ledger'
  for update;

  if not found then
    insert into public.ai_jobs (
      business_id,
      requested_by,
      capture_id,
      job_type,
      status,
      idempotency_key,
      input_payload,
      max_attempts
    ) values (
      v_capture.business_id,
      v_user_id,
      v_capture.id,
      'voice_to_ledger',
      'queued',
      v_capture.id::text,
      jsonb_build_object('captureId', v_capture.id),
      3
    )
    returning * into v_job;
  end if;

  -- Recovery untuk worker lease yang kedaluwarsa (worker mati di tengah attempt)
  if v_job.status = 'running'
    and (v_job.locked_at is null or v_job.locked_at < now() - interval '45 seconds') then
    update public.ai_runs
    set
      status = 'failed',
      failure_code = 'WORKER_LEASE_EXPIRED',
      failure_message = 'Worker lease berakhir sebelum attempt selesai.',
      completed_at = now()
    where job_id = v_job.id
      and attempt_number = v_job.attempt_count
      and status = 'running';

    if v_job.attempt_count < v_job.max_attempts then
      update public.ai_jobs
      set
        status = 'queued',
        available_at = now(),
        locked_at = null,
        locked_by = null,
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Worker lease berakhir sebelum attempt selesai.',
        updated_at = now()
      where id = v_job.id
      returning * into v_job;
      update public.transaction_captures
      set status = 'queued', updated_at = now()
      where id = v_capture.id;
      v_capture.status := 'queued';
    else
      update public.ai_jobs
      set
        status = 'failed',
        locked_at = null,
        locked_by = null,
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Worker lease berakhir sebelum attempt selesai.',
        completed_at = now(),
        updated_at = now()
      where id = v_job.id
      returning * into v_job;
      update public.transaction_captures
      set
        status = 'failed',
        failure_code = 'WORKER_LEASE_EXPIRED',
        failure_message = 'Pemrosesan berhenti sebelum selesai. Silakan buat catatan baru.',
        completed_at = now(),
        updated_at = now()
      where id = v_capture.id;
      v_capture.status := 'failed';
    end if;
  end if;

  if v_capture.status = 'draft' then
    update public.transaction_captures
    set status = 'queued', updated_at = now(), failure_code = null, failure_message = null
    where id = v_capture.id;
  end if;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'jobId', v_job.id,
    'status', case
      when v_capture.status = 'needs_review' then 'needs_review'
      else v_job.status
    end,
    'idempotent', v_capture.status <> 'draft'
  );
end;
$$;


--
-- Name: set_my_discovery_optin(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_my_discovery_optin(p_opted_in boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare business_id_value uuid; code_value text;
begin
  select business.id into business_id_value from public.businesses business
  where business.legacy_profile_id = (select auth.uid()) and private.business_access(business.id) limit 1;
  if business_id_value is null then raise exception 'BUSINESS_NOT_FOUND'; end if;
  insert into public.discovery_optins (business_id, opted_in, opted_at, updated_at)
  values (business_id_value, p_opted_in, case when p_opted_in then now() else null end, now())
  on conflict (business_id) do update set opted_in = excluded.opted_in, opted_at = excluded.opted_at, updated_at = now()
  returning candidate_code into code_value;
  return jsonb_build_object('businessId', business_id_value, 'optedIn', p_opted_in, 'candidateCode', code_value);
end;
$$;


--
-- Name: set_transaction_category(uuid, smallint, text, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_transaction_category(p_transaction_id uuid, p_emkm_category_code smallint, p_emkm_category_subtype text DEFAULT NULL::text, p_counterparty_id uuid DEFAULT NULL::uuid, p_interest_amount_idr bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text;
  v_direction text;
  v_group text;
  v_code text;
  v_label text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if v_tx.ledger_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_CANCELLED';
  end if;
  if v_emkm is null or v_emkm not between 1 and 10
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > coalesce(v_tx.amount_idr, v_tx.nominal, 0) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_tx.business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_payment := v_tx.payment_method;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;
  select legacy.o_group, legacy.o_code into v_group, v_code
  from private.legacy_category_for_emkm(v_emkm, v_subtype) as legacy;
  v_label := case v_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, 'Perbaikan kategori catatan lama');
  end if;

  update public.transactions set
    emkm_category_code = v_emkm,
    emkm_category_subtype = v_subtype,
    counterparty_id = coalesce(p_counterparty_id, counterparty_id),
    interest_amount_idr = coalesce(p_interest_amount_idr, 0),
    payment_method = v_payment,
    direction = coalesce(v_direction, direction),
    type = case coalesce(v_direction, direction) when 'income' then 'masuk' else 'keluar' end,
    category_group = v_group,
    category_code = v_code,
    category = v_label,
    kategori = v_label,
    needs_reclass = false,
    journal_entry_id = null,
    updated_at = now()
  where id = p_transaction_id;

  v_entry_id := public.fn_post_transaction_journal(p_transaction_id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, new_values)
  values (p_transaction_id, v_tx.business_id, v_user_id, 'adjusted', 'Kategori catatan lama diperbarui pemilik',
    jsonb_build_object('emkmCategoryCode', v_emkm, 'emkmCategorySubtype', v_subtype, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', p_transaction_id, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id);
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_transaction_compatibility_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_transaction_compatibility_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.amount_idr is null then
    new.amount_idr = new.nominal;
  elsif new.nominal is null then
    new.nominal = new.amount_idr;
  elsif new.amount_idr <> new.nominal then
    raise exception 'amount_idr and nominal must match';
  end if;

  if new.direction is null and new.type is not null then
    new.direction = case new.type when 'masuk' then 'income' when 'keluar' then 'expense' end;
  elsif new.type is null and new.direction is not null then
    new.type = case new.direction when 'income' then 'masuk' when 'expense' then 'keluar' end;
  end if;

  if (new.direction = 'income' and new.type <> 'masuk')
    or (new.direction = 'expense' and new.type <> 'keluar') then
    raise exception 'direction and type must describe the same transaction';
  end if;

  if new.category is null then new.category = new.kategori; end if;
  if new.kategori is null then new.kategori = new.category; end if;
  if new.category is distinct from new.kategori then
    raise exception 'category and kategori must match';
  end if;

  if new.transaction_date is null then new.transaction_date = new.tanggal; end if;
  if new.tanggal is null then new.tanggal = new.transaction_date; end if;
  if new.transaction_date is distinct from new.tanggal then
    raise exception 'transaction_date and tanggal must match';
  end if;

  return new;
end;
$$;


--
-- Name: toggle_my_institution_shortlist(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_my_institution_shortlist(p_candidate_code text, p_institution_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  institution_id_value uuid;
  business_id_value uuid;
  shortlist_row public.institution_shortlists%rowtype;
  opted_value boolean;
begin
  institution_id_value := public.resolve_my_institution_id(p_institution_id);
  if not exists (
    select 1 from public.institution_members as member
    where member.institution_id = institution_id_value
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('admin', 'analyst', 'reviewer')
  ) then raise exception 'INSTITUTION_ACCESS_DENIED'; end if;
  select optin.business_id into business_id_value from public.discovery_optins as optin
  where optin.candidate_code = upper(trim(p_candidate_code)) and optin.opted_in = true;
  if business_id_value is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  select * into shortlist_row from public.institution_shortlists
  where institution_id = institution_id_value and business_id = business_id_value and created_by = (select auth.uid())
  for update;
  if shortlist_row.id is null then
    insert into public.institution_shortlists (institution_id, business_id, created_by)
    values (institution_id_value, business_id_value, (select auth.uid()));
    opted_value := true;
  else
    update public.institution_shortlists set status = case when shortlist_row.status = 'shortlisted' then 'removed' else 'shortlisted' end, updated_at = now()
    where id = shortlist_row.id;
    opted_value := shortlist_row.status <> 'shortlisted';
  end if;
  return jsonb_build_object('candidateCode', upper(trim(p_candidate_code)), 'shortlisted', opted_value);
end;
$$;


--
-- Name: update_fixed_asset(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_fixed_asset(p_asset_id uuid, p_name text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_useful_life_months integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_asset public.fixed_assets%rowtype;
  v_category text;
  v_life integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_asset from public.fixed_assets where id = p_asset_id for update;
  if not found or not private.accounting_business_access(v_asset.business_id) then
    raise exception using errcode = '42501', message = 'FIXED_ASSET_NOT_FOUND';
  end if;

  v_category := lower(coalesce(nullif(trim(p_category), ''), v_asset.category));
  v_life := coalesce(p_useful_life_months, v_asset.useful_life_months);
  if v_category not in ('peralatan', 'mesin', 'kendaraan', 'bangunan', 'lainnya')
    or v_life not between 1 and 600
    or char_length(trim(coalesce(p_name, v_asset.name))) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.fixed_assets set
    name = trim(coalesce(p_name, v_asset.name)),
    category = v_category,
    useful_life_months = v_life,
    updated_at = now()
  where id = p_asset_id;

  -- Umur berubah berarti besaran penyusutannya berubah, termasuk untuk bulan
  -- yang sudah terlanjur diposting.
  if v_life <> v_asset.useful_life_months then
    perform private.reset_depreciation_from(
      v_asset.business_id,
      (date_trunc('month', v_asset.acquired_on) + interval '1 month')::date,
      'Umur alat usaha diperbarui pemilik');
    perform private.post_depreciation_through(
      v_asset.business_id, (now() at time zone 'Asia/Jakarta')::date);
  end if;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_asset.business_id, 'FIXED_ASSET_UPDATED', 'fixed_asset', p_asset_id::text,
    jsonb_build_object('usefulLifeMonths', v_life, 'category', v_category));

  return jsonb_build_object('fixedAssetId', p_asset_id, 'usefulLifeMonths', v_life, 'category', v_category);
end;
$$;


--
-- Name: update_ledger_transaction(uuid, text, bigint, date, text, text, text, text, numeric, text, bigint, text, text, text, smallint, text, uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_ledger_transaction(p_transaction_id uuid, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_reason text, p_quantity numeric DEFAULT NULL::numeric, p_unit text DEFAULT NULL::text, p_unit_price_idr bigint DEFAULT NULL::bigint, p_payment_method text DEFAULT NULL::text, p_sales_channel text DEFAULT NULL::text, p_counterparty text DEFAULT NULL::text, p_emkm_category_code smallint DEFAULT NULL::smallint, p_emkm_category_subtype text DEFAULT NULL::text, p_counterparty_id uuid DEFAULT NULL::uuid, p_interest_amount_idr bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_tx public.transactions%rowtype;
  v_previous jsonb;
  v_label text;
  v_emkm smallint := p_emkm_category_code;
  v_subtype text := p_emkm_category_subtype;
  v_payment text := p_payment_method;
  v_direction text;
  v_entry_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found or not private.accounting_business_access(v_tx.business_id) then
    raise exception using errcode = '42501', message = 'TRANSACTION_ACCESS_DENIED';
  end if;
  if v_tx.ledger_status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_CANCELLED';
  end if;
  if exists (select 1 from public.daily_closings c
             where c.business_id = v_tx.business_id and c.closing_date = v_tx.transaction_date and c.status = 'closed') then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_DATE_CLOSED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'CHANGE_REASON_REQUIRED';
  end if;
  if p_transaction_type not in ('income', 'expense')
    or p_amount_idr not between 1 and 9000000000000
    or p_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date
    or p_category_group not in ('sales', 'cost_of_goods', 'operating_expense', 'asset', 'other')
    or p_category_code not in ('sales_direct','sales_delivery','sales_catering','raw_material','packaging','utilities','wage','rent','platform_fee','transport','equipment','promotion','other')
    or char_length(trim(coalesce(p_description, ''))) not between 1 and 160
    or (p_payment_method is not null and p_payment_method not in ('cash','qris','bank_transfer','ewallet','edc','credit','unpaid','other'))
    or coalesce(p_interest_amount_idr, 0) < 0
    or coalesce(p_interest_amount_idr, 0) > p_amount_idr then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_transaction_date <> v_tx.transaction_date and exists (
      select 1 from public.daily_closings c
      where c.business_id = v_tx.business_id and c.closing_date = p_transaction_date and c.status = 'closed') then
    raise exception using errcode = 'P0001', message = 'TRANSACTION_DATE_CLOSED';
  end if;
  if p_counterparty_id is not null
    and not exists (select 1 from public.counterparties c where c.id = p_counterparty_id and c.business_id = v_tx.business_id) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  if v_emkm is null then
    select legacy.o_category_code, legacy.o_subtype into v_emkm, v_subtype
    from private.emkm_category_from_legacy(p_transaction_type, p_category_group, p_category_code) as legacy;
  end if;
  select normalized.p_category_code, normalized.p_subtype, normalized.p_payment_method, normalized.o_direction
  into v_emkm, v_subtype, v_payment, v_direction
  from private.normalize_emkm_category(v_emkm, v_subtype, v_payment) as normalized;

  v_previous := jsonb_build_object('amountIdr', v_tx.amount_idr, 'type', v_tx.direction,
    'date', v_tx.transaction_date, 'categoryCode', v_tx.category_code, 'emkmCategoryCode', v_tx.emkm_category_code);
  v_label := case p_category_group
    when 'sales' then 'Penjualan'
    when 'cost_of_goods' then 'Bahan & Produksi'
    when 'operating_expense' then 'Operasional'
    when 'asset' then 'Aset'
    else 'Lainnya'
  end;

  -- Jurnal tidak pernah diubah: entry lama dibalik, entry baru disusun ulang.
  if v_tx.journal_entry_id is not null then
    perform public.fn_reverse_journal_entry(v_tx.journal_entry_id, trim(p_reason));
  end if;

  update public.transactions set
    item = trim(p_description),
    direction = coalesce(v_direction, p_transaction_type),
    type = case coalesce(v_direction, p_transaction_type) when 'income' then 'masuk' else 'keluar' end,
    amount_idr = p_amount_idr,
    nominal = p_amount_idr,
    transaction_date = p_transaction_date,
    tanggal = p_transaction_date,
    category_group = p_category_group,
    category_code = p_category_code,
    category = v_label,
    kategori = v_label,
    quantity = p_quantity,
    qty = coalesce(p_quantity::text || coalesce(' ' || nullif(trim(p_unit), ''), ''), '1'),
    unit = nullif(trim(p_unit), ''),
    unit_price_idr = p_unit_price_idr,
    payment_method = v_payment,
    sales_channel = nullif(trim(p_sales_channel), ''),
    counterparty = nullif(trim(p_counterparty), ''),
    emkm_category_code = v_emkm,
    emkm_category_subtype = v_subtype,
    counterparty_id = p_counterparty_id,
    interest_amount_idr = coalesce(p_interest_amount_idr, 0),
    needs_reclass = false,
    journal_entry_id = null,
    updated_at = now()
  where id = p_transaction_id;

  v_entry_id := public.fn_post_transaction_journal(p_transaction_id);

  insert into public.transaction_changes (transaction_id, business_id, actor_user_id, action, reason, previous_values, new_values)
  values (p_transaction_id, v_tx.business_id, v_user_id, 'updated', trim(p_reason), v_previous,
    jsonb_build_object('amountIdr', p_amount_idr, 'type', p_transaction_type, 'date', p_transaction_date,
      'categoryCode', p_category_code, 'emkmCategoryCode', v_emkm, 'journalEntryId', v_entry_id));

  return jsonb_build_object('transactionId', p_transaction_id, 'status', 'confirmed', 'journalEntryId', v_entry_id);
end;
$$;


--
-- Name: update_loan(uuid, text, bigint, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_loan(p_loan_id uuid, p_lender_name text DEFAULT NULL::text, p_monthly_installment_idr bigint DEFAULT NULL::bigint, p_annual_rate numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_loan public.loans%rowtype;
  v_name text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;

  select * into v_loan from public.loans where id = p_loan_id for update;
  if not found or not private.accounting_business_access(v_loan.business_id) then
    raise exception using errcode = '42501', message = 'LOAN_NOT_FOUND';
  end if;

  v_name := trim(coalesce(p_lender_name, v_loan.lender_name));
  if char_length(v_name) not between 1 and 120
    or (p_monthly_installment_idr is not null and p_monthly_installment_idr <= 0)
    or (p_annual_rate is not null and (p_annual_rate < 0 or p_annual_rate > 200)) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  update public.loans set
    lender_name = v_name,
    monthly_installment_idr = coalesce(p_monthly_installment_idr, monthly_installment_idr),
    annual_rate = coalesce(p_annual_rate, annual_rate),
    updated_at = now()
  where id = p_loan_id;

  insert into public.audit_events (actor_user_id, actor_type, business_id, action, target_type, target_id, metadata)
  values (v_user_id, 'user', v_loan.business_id, 'LOAN_UPDATED', 'loan', p_loan_id::text,
    jsonb_build_object('lenderName', v_name));

  return jsonb_build_object('loanId', p_loan_id, 'lenderName', v_name);
end;
$$;


--
-- Name: upsert_counterparty(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_counterparty(p_name text, p_type text DEFAULT 'PELANGGAN'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'UNAUTHENTICATED'; end if;
  if char_length(v_name) not between 1 and 120
    or coalesce(p_type, 'PELANGGAN') not in ('PELANGGAN', 'SUPPLIER', 'BANK', 'KOPERASI', 'KELUARGA', 'LAIN') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode = '42501', message = 'BUSINESS_ACCESS_DENIED'; end if;

  insert into public.counterparties (business_id, name, type, created_by)
  values (v_business_id, v_name, coalesce(p_type, 'PELANGGAN'), v_user_id)
  on conflict (business_id, lower(trim(name))) do update set
    type = case when counterparties.type = 'PELANGGAN' then excluded.type else counterparties.type end,
    is_active = true,
    updated_at = now()
  returning id into v_id;

  return jsonb_build_object('counterpartyId', v_id, 'name', v_name);
end;
$$;


--
-- Name: validate_active_consent_grant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_active_consent_grant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  request_row public.dossier_requests%rowtype;
begin
  if new.status <> 'active' then return new; end if;

  select * into request_row
  from public.dossier_requests
  where id = new.request_id;

  if request_row.id is null
    or request_row.status <> 'approved'
    or request_row.business_id <> new.business_id
    or request_row.institution_id <> new.institution_id
    or not (new.scopes <@ request_row.requested_scopes) then
    raise exception 'active consent requires a matching approved request and scope';
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    run_id uuid,
    user_id uuid,
    rating smallint,
    helpful boolean,
    correction jsonb,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_feedback_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))))
);


--
-- Name: ai_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    requested_by uuid,
    capture_id uuid,
    document_version_id uuid,
    job_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    idempotency_key text NOT NULL,
    input_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    failure_code text,
    failure_message text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_jobs_attempts_check CHECK (((attempt_count >= 0) AND (max_attempts > 0) AND (attempt_count <= max_attempts))),
    CONSTRAINT ai_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: ai_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    request_payload jsonb,
    response_payload jsonb,
    prompt_tokens integer,
    completion_tokens integer,
    latency_ms integer,
    failure_code text,
    failure_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_runs_metrics_check CHECK (((attempt_number > 0) AND (COALESCE(prompt_tokens, 0) >= 0) AND (COALESCE(completion_tokens, 0) >= 0) AND (COALESCE(latency_ms, 0) >= 0))),
    CONSTRAINT ai_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    actor_type text DEFAULT 'user'::text NOT NULL,
    business_id uuid,
    institution_id uuid,
    action text NOT NULL,
    target_type text,
    target_id text,
    status text DEFAULT 'success'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_events_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_numeric_id bigint,
    audit_event_id uuid,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    "user" text,
    user_email text,
    action text NOT NULL,
    details text,
    status text DEFAULT 'success'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text])))
);


--
-- Name: business_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    profile_id uuid,
    user_id uuid,
    status text DEFAULT 'invited'::text NOT NULL,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_members_identity_check CHECK (((profile_id IS NOT NULL) OR (user_id IS NOT NULL))),
    CONSTRAINT business_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: business_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    mission_id uuid NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_missions_status_check CHECK ((status = ANY (ARRAY['available'::text, 'in_progress'::text, 'completed'::text, 'dismissed'::text, 'expired'::text])))
);


--
-- Name: business_readiness_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_readiness_state (
    business_id uuid NOT NULL,
    level text DEFAULT 'MULAI'::text NOT NULL,
    level_since date,
    grace_until date,
    formula_version text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_readiness_state_level_check CHECK ((level = ANY (ARRAY['MULAI'::text, 'TEMBAGA'::text, 'PERAK'::text, 'EMAS'::text])))
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_profile_id uuid,
    name text NOT NULL,
    legal_name text,
    sector text,
    location text,
    address text,
    phone text,
    nib text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT businesses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'archived'::text])))
);


--
-- Name: category_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector text NOT NULL,
    category_code smallint NOT NULL,
    subtype text,
    label_umkm text NOT NULL,
    description_umkm text,
    direction text NOT NULL,
    debit_rule text NOT NULL,
    credit_rule text NOT NULL,
    cash_flow_section text NOT NULL,
    affects_pnl boolean DEFAULT false NOT NULL,
    trigger_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    version text DEFAULT 'coa-emkm-v1'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_templates_cash_flow_check CHECK ((cash_flow_section = ANY (ARRAY['OPERASI'::text, 'INVESTASI'::text, 'PENDANAAN'::text, 'NON_KAS'::text]))),
    CONSTRAINT category_templates_category_code_check CHECK (((category_code >= 1) AND (category_code <= 10))),
    CONSTRAINT category_templates_direction_check CHECK ((direction = ANY (ARRAY['income'::text, 'expense'::text]))),
    CONSTRAINT category_templates_sector_check CHECK ((sector = ANY (ARRAY['PERDAGANGAN_KULINER'::text, 'PERDAGANGAN_UMUM'::text, 'INDUSTRI_PENGOLAHAN'::text, 'JASA'::text, 'PERTANIAN'::text, 'PETERNAKAN'::text, 'PERIKANAN'::text, 'LAINNYA'::text])))
);


--
-- Name: coa_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coa_accounts (
    code text NOT NULL,
    name text NOT NULL,
    account_type text NOT NULL,
    normal_balance text NOT NULL,
    is_contra boolean DEFAULT false NOT NULL,
    report_line text NOT NULL,
    parent_code text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coa_accounts_code_check CHECK ((code ~ '^[1-5][0-9]{3}$'::text)),
    CONSTRAINT coa_accounts_normal_balance_check CHECK ((normal_balance = ANY (ARRAY['DEBIT'::text, 'KREDIT'::text]))),
    CONSTRAINT coa_accounts_type_check CHECK ((account_type = ANY (ARRAY['ASET'::text, 'LIABILITAS'::text, 'EKUITAS'::text, 'PENDAPATAN'::text, 'BEBAN'::text])))
);


--
-- Name: consent_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    business_id uuid NOT NULL,
    granted_by uuid,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revocation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    download_allowed boolean DEFAULT false NOT NULL,
    CONSTRAINT consent_grants_date_check CHECK (((expires_at IS NULL) OR (expires_at > granted_at))),
    CONSTRAINT consent_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: counterparties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'PELANGGAN'::text NOT NULL,
    phone text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT counterparties_name_check CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 120))),
    CONSTRAINT counterparties_type_check CHECK ((type = ANY (ARRAY['PELANGGAN'::text, 'SUPPLIER'::text, 'BANK'::text, 'KOPERASI'::text, 'KELUARGA'::text, 'LAIN'::text])))
);


--
-- Name: daily_closings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    closing_date date NOT NULL,
    income_amount_idr bigint DEFAULT 0 NOT NULL,
    expense_amount_idr bigint DEFAULT 0 NOT NULL,
    transaction_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'closed'::text NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    opening_cash_idr bigint,
    system_cash_in_idr bigint DEFAULT 0 NOT NULL,
    system_cash_out_idr bigint DEFAULT 0 NOT NULL,
    expected_cash_idr bigint,
    physical_cash_idr bigint,
    difference_idr bigint,
    note text,
    ledger_cash_idr bigint,
    ledger_bank_idr bigint,
    physical_bank_idr bigint,
    bank_difference_idr bigint,
    cash_variance_idr bigint,
    CONSTRAINT daily_closings_amount_check CHECK (((income_amount_idr >= 0) AND (expense_amount_idr >= 0) AND (transaction_count >= 0))),
    CONSTRAINT daily_closings_cash_values_check CHECK ((((opening_cash_idr IS NULL) OR (opening_cash_idr >= 0)) AND (system_cash_in_idr >= 0) AND (system_cash_out_idr >= 0) AND ((physical_cash_idr IS NULL) OR (physical_cash_idr >= 0)) AND ((expected_cash_idr IS NULL) OR (opening_cash_idr IS NOT NULL)) AND ((difference_idr IS NULL) OR ((expected_cash_idr IS NOT NULL) AND (physical_cash_idr IS NOT NULL))) AND ((note IS NULL) OR (char_length(note) <= 500)))),
    CONSTRAINT daily_closings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'closed'::text, 'reopened'::text])))
);


--
-- Name: depreciation_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciation_postings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    business_id uuid NOT NULL,
    period_month date NOT NULL,
    amount_idr bigint NOT NULL,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT depreciation_postings_values_check CHECK (((amount_idr > 0) AND (period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date)))
);


--
-- Name: discovery_optins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discovery_optins (
    business_id uuid NOT NULL,
    opted_in boolean DEFAULT false NOT NULL,
    candidate_code text DEFAULT ('UMKM-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) NOT NULL,
    opted_at timestamp with time zone,
    copy_version text DEFAULT 'v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    document_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_at timestamp with time zone,
    removed_reason text,
    CONSTRAINT document_attachments_removal_check CHECK ((((removed_at IS NULL) AND (removed_reason IS NULL)) OR ((removed_at IS NOT NULL) AND ((char_length(TRIM(BOTH FROM removed_reason)) >= 3) AND (char_length(TRIM(BOTH FROM removed_reason)) <= 240))))),
    CONSTRAINT document_attachments_target_check CHECK ((target_type = ANY (ARRAY['transaction'::text, 'journal_entry'::text, 'fixed_asset'::text, 'loan'::text, 'inventory_count'::text])))
);


--
-- Name: document_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    extractor text,
    structured_data jsonb,
    raw_text text,
    failure_code text,
    failure_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_review_status text DEFAULT 'pending'::text NOT NULL,
    confirmed_data jsonb,
    owner_confirmed_by uuid,
    owner_confirmed_at timestamp with time zone,
    CONSTRAINT document_extractions_owner_confirmation_check CHECK ((((owner_review_status = 'pending'::text) AND (confirmed_data IS NULL) AND (owner_confirmed_at IS NULL)) OR ((owner_review_status = ANY (ARRAY['owner_confirmed'::text, 'owner_corrected'::text])) AND (confirmed_data IS NOT NULL) AND (owner_confirmed_at IS NOT NULL)))),
    CONSTRAINT document_extractions_owner_review_status_check CHECK ((owner_review_status = ANY (ARRAY['pending'::text, 'owner_confirmed'::text, 'owner_corrected'::text]))),
    CONSTRAINT document_extractions_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: document_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    document_id uuid,
    remind_on date NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_reminders_kind_check CHECK ((kind = ANY (ARRAY['h90'::text, 'h30'::text, 'h7'::text, 'expired'::text, 'halal_deadline'::text]))),
    CONSTRAINT document_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'dismissed'::text, 'done'::text])))
);


--
-- Name: document_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sector text NOT NULL,
    doc_type text NOT NULL,
    requirement text NOT NULL,
    order_index smallint DEFAULT 0 NOT NULL,
    mission_key text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_requirements_level_check CHECK ((requirement = ANY (ARRAY['wajib'::text, 'disarankan'::text])))
);


--
-- Name: document_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    business_id uuid NOT NULL,
    user_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    doc_type text NOT NULL,
    original_name text NOT NULL,
    intended_version integer NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_code text,
    rejection_reason text,
    expires_at timestamp with time zone DEFAULT (now() + '02:00:00'::interval) NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ocr_consent_at timestamp with time zone,
    ocr_processor_scope text,
    ocr_consent_policy_version text,
    CONSTRAINT document_upload_sessions_checksum_check CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT document_upload_sessions_file_size_check CHECK (((file_size > 0) AND (file_size <= 10485760))),
    CONSTRAINT document_upload_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT document_upload_sessions_version_check CHECK ((intended_version > 0))
);


--
-- Name: COLUMN document_upload_sessions.ocr_consent_policy_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.document_upload_sessions.ocr_consent_policy_version IS 'Version of the user-facing document reading consent accepted for this upload session.';


--
-- Name: document_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'expired'::text])))
);


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version integer NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    file_size bigint NOT NULL,
    checksum_sha256 text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_name text,
    status text DEFAULT 'uploaded'::text NOT NULL,
    rejection_code text,
    rejection_reason text,
    CONSTRAINT document_versions_lifecycle_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'verified'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT document_versions_values_check CHECK (((version >= 1) AND (file_size >= 0)))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid,
    user_id uuid,
    name text NOT NULL,
    doc_type text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    current_version integer DEFAULT 1 NOT NULL,
    storage_path text,
    mime_type text,
    file_size bigint,
    checksum_sha256 text,
    ai_notes text,
    file_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    rejection_code text,
    rejection_reason text,
    legacy_public_url_sha256 text,
    doc_class text,
    doc_number text,
    issuer text,
    issued_on date,
    valid_until date,
    name_on_doc text,
    assurance_level text DEFAULT 'self_declared'::text NOT NULL,
    attested_by uuid,
    attested_at timestamp with time zone,
    needs_class_review boolean DEFAULT false NOT NULL,
    content_hash text,
    CONSTRAINT documents_assurance_check CHECK ((assurance_level = ANY (ARRAY['self_declared'::text, 'checked'::text, 'confirmed'::text, 'attested'::text]))),
    CONSTRAINT documents_attested_trace_check CHECK (((assurance_level <> 'attested'::text) OR ((attested_by IS NOT NULL) AND (attested_at IS NOT NULL)))),
    CONSTRAINT documents_doc_class_check CHECK (((doc_class IS NULL) OR (doc_class = ANY (ARRAY['identitas'::text, 'legalitas'::text, 'bukti_transaksi'::text, 'aset_kontrak'::text, 'arsip_keluaran'::text])))),
    CONSTRAINT documents_file_size_check CHECK (((file_size IS NULL) OR (file_size >= 0))),
    CONSTRAINT documents_private_url_check CHECK ((file_url IS NULL)),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'verified'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT documents_version_check CHECK ((current_version >= 1))
);


--
-- Name: dossier_access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_access_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    ip_hash text,
    user_agent_hash text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resource_scope text,
    outcome text DEFAULT 'allowed'::text NOT NULL,
    denial_code text,
    CONSTRAINT dossier_access_events_action_check CHECK ((action = ANY (ARRAY['view'::text, 'download'::text, 'verify'::text]))),
    CONSTRAINT dossier_access_events_outcome_check CHECK ((outcome = ANY (ARRAY['allowed'::text, 'denied'::text])))
);


--
-- Name: dossier_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dossier_api_keys_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: dossier_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dossier_id uuid NOT NULL,
    item_type text NOT NULL,
    source_table text NOT NULL,
    source_id uuid,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    ordinal integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dossier_items_ordinal_check CHECK ((ordinal >= 0))
);


--
-- Name: dossier_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    business_id uuid NOT NULL,
    program_id uuid,
    requested_by uuid,
    reviewed_by uuid,
    purpose text NOT NULL,
    requested_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose_code text DEFAULT 'legacy_review'::text NOT NULL,
    purpose_description text DEFAULT 'Permintaan data versi lama'::text NOT NULL,
    required_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    requested_duration_days integer DEFAULT 14 NOT NULL,
    download_requested boolean DEFAULT false NOT NULL,
    idempotency_key text,
    CONSTRAINT dossier_requests_duration_check CHECK (((requested_duration_days >= 1) AND (requested_duration_days <= 90))),
    CONSTRAINT dossier_requests_scope_check CHECK (((requested_scopes <@ ARRAY['business_identity'::text, 'readiness'::text, 'financial_summary'::text, 'nib'::text, 'npwp'::text, 'owner_identity'::text, 'qris_history'::text, 'sector_certificates'::text, 'summary'::text]) AND (cardinality(requested_scopes) > 0) AND (required_scopes <@ requested_scopes))),
    CONSTRAINT dossier_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    business_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'building'::text NOT NULL,
    storage_path text,
    mime_type text,
    file_size bigint,
    checksum_sha256 text,
    generated_at timestamp with time zone,
    expires_at timestamp with time zone,
    failure_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dossiers_file_size_check CHECK (((file_size IS NULL) OR (file_size >= 0))),
    CONSTRAINT dossiers_status_check CHECK ((status = ANY (ARRAY['building'::text, 'ready'::text, 'failed'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'peralatan'::text NOT NULL,
    acquired_on date NOT NULL,
    cost_idr bigint NOT NULL,
    useful_life_months integer NOT NULL,
    salvage_value_idr bigint DEFAULT 0 NOT NULL,
    source_transaction_id uuid,
    disposed_on date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    opening_balance_id uuid,
    original_cost_idr bigint,
    original_useful_life_months integer,
    CONSTRAINT fixed_assets_category_check CHECK ((category = ANY (ARRAY['peralatan'::text, 'mesin'::text, 'kendaraan'::text, 'bangunan'::text, 'lainnya'::text]))),
    CONSTRAINT fixed_assets_values_check CHECK ((((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 120)) AND (cost_idr > 0) AND ((useful_life_months >= 1) AND (useful_life_months <= 600)) AND (salvage_value_idr >= 0) AND (salvage_value_idr < cost_idr) AND ((acquired_on >= '1990-01-01'::date) AND (acquired_on <= '2100-01-01'::date)) AND ((disposed_on IS NULL) OR (disposed_on >= acquired_on))))
);


--
-- Name: indicator_monthly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indicator_monthly (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    period_month date NOT NULL,
    revenue_idr bigint DEFAULT 0 NOT NULL,
    cogs_idr bigint DEFAULT 0 NOT NULL,
    opex_idr bigint DEFAULT 0 NOT NULL,
    interest_idr bigint DEFAULT 0 NOT NULL,
    net_income_idr bigint DEFAULT 0 NOT NULL,
    prive_idr bigint DEFAULT 0 NOT NULL,
    capital_in_idr bigint DEFAULT 0 NOT NULL,
    receivable_new_idr bigint DEFAULT 0 NOT NULL,
    noncash_sales_idr bigint DEFAULT 0 NOT NULL,
    noncash_sales_ratio numeric(5,4),
    days_recorded integer DEFAULT 0 NOT NULL,
    formula_version text NOT NULL,
    source_entry_count integer DEFAULT 0 NOT NULL,
    source_last_posted_at timestamp with time zone,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: institution_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_entitlements (
    institution_id uuid NOT NULL,
    seats integer DEFAULT 1 NOT NULL,
    dossier_credits integer DEFAULT 0 NOT NULL,
    credits_used integer DEFAULT 0 NOT NULL,
    license_from date,
    license_to date,
    plan_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_entitlements_values_check CHECK (((seats >= 0) AND (dossier_credits >= 0) AND (credits_used >= 0) AND (credits_used <= dossier_credits)))
);


--
-- Name: institution_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    profile_id uuid,
    user_id uuid,
    role text DEFAULT 'viewer'::text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT institution_members_identity_check CHECK (((profile_id IS NOT NULL) OR (user_id IS NOT NULL))),
    CONSTRAINT institution_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text, 'viewer'::text]))),
    CONSTRAINT institution_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: institution_shortlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_shortlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    business_id uuid NOT NULL,
    created_by uuid NOT NULL,
    status text DEFAULT 'shortlisted'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: institution_view_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_view_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    member_id uuid,
    business_id uuid,
    artifact text NOT NULL,
    artifact_id uuid,
    action text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_numeric_id bigint,
    name text NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    programs_count integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    contact_name text,
    contact_email text,
    location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_profile_id uuid,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    verification_note text,
    verified_by uuid,
    verified_at timestamp with time zone,
    CONSTRAINT institutions_programs_count_check CHECK ((programs_count >= 0)),
    CONSTRAINT institutions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text, 'suspended'::text, 'archived'::text]))),
    CONSTRAINT institutions_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: inventory_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    period_month date NOT NULL,
    counted_value_idr bigint NOT NULL,
    adjustment_idr bigint DEFAULT 0 NOT NULL,
    journal_entry_id uuid,
    notes text,
    counted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_counts_values_check CHECK (((counted_value_idr >= 0) AND (period_month = (date_trunc('month'::text, (period_month)::timestamp with time zone))::date) AND ((notes IS NULL) OR (char_length(notes) <= 500))))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    entry_date date NOT NULL,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    source_id uuid,
    reverses_entry_id uuid,
    memo text,
    reason text,
    template_version text DEFAULT 'coa-emkm-v1'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cash_flow_section text,
    CONSTRAINT journal_entries_cash_flow_check CHECK (((cash_flow_section IS NULL) OR (cash_flow_section = ANY (ARRAY['OPERASI'::text, 'INVESTASI'::text, 'PENDANAAN'::text, 'NON_KAS'::text])))),
    CONSTRAINT journal_entries_date_check CHECK (((entry_date >= '2000-01-01'::date) AND (entry_date <= '2100-01-01'::date))),
    CONSTRAINT journal_entries_source_check CHECK ((source = ANY (ARRAY['TRANSACTION'::text, 'OPENING'::text, 'DEPRECIATION'::text, 'INVENTORY_ADJ'::text, 'REVERSAL'::text, 'TAX_ESTIMATE'::text, 'ASSET_DISPOSAL'::text])))
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    business_id uuid NOT NULL,
    account_code text NOT NULL,
    debit bigint DEFAULT 0 NOT NULL,
    credit bigint DEFAULT 0 NOT NULL,
    line_order smallint DEFAULT 1 NOT NULL,
    memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_lines_amount_check CHECK (((debit >= 0) AND (credit >= 0) AND ((debit = 0) OR (credit = 0)) AND ((debit + credit) > 0)))
);


--
-- Name: readiness_score_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_score_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    rule_set_id uuid NOT NULL,
    source_analysis_id uuid,
    total_score numeric(5,2) NOT NULL,
    input_hash text,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    calculated_by uuid,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT readiness_snapshots_score_check CHECK (((total_score >= (0)::numeric) AND (total_score <= (100)::numeric)))
);


--
-- Name: latest_readiness_snapshots; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.latest_readiness_snapshots WITH (security_invoker='true') AS
 SELECT DISTINCT ON (business_id) id,
    business_id,
    rule_set_id,
    total_score,
    summary,
    calculated_at,
    created_at
   FROM public.readiness_score_snapshots snapshot
  ORDER BY business_id, calculated_at DESC, id DESC;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    email text,
    role text,
    name text,
    nama_pemilik text,
    nama_usaha text,
    sektor_usaha text,
    nama_institusi text,
    jenis_institusi text,
    nama_contact text,
    lokasi text,
    alamat text,
    phone text,
    nib text,
    avatar_url text,
    readiness_score numeric(5,2) DEFAULT 0,
    konsistensi_days integer DEFAULT 0,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bentuk_usaha text DEFAULT 'perorangan'::text NOT NULL,
    tahun_mulai_usaha smallint,
    jumlah_karyawan text,
    kanal_penjualan text[] DEFAULT '{}'::text[] NOT NULL,
    deletion_requested_at timestamp with time zone,
    deletion_scheduled_for date,
    deletion_reason text,
    CONSTRAINT profiles_bentuk_usaha_check CHECK ((bentuk_usaha = ANY (ARRAY['perorangan'::text, 'badan_usaha'::text]))),
    CONSTRAINT profiles_jumlah_karyawan_check CHECK (((jumlah_karyawan IS NULL) OR (jumlah_karyawan = ANY (ARRAY['sendiri'::text, '1-4'::text, '5-19'::text])))),
    CONSTRAINT profiles_kanal_penjualan_check CHECK ((kanal_penjualan <@ ARRAY['warung'::text, 'whatsapp'::text, 'marketplace'::text, 'media_sosial'::text])),
    CONSTRAINT profiles_konsistensi_days_check CHECK ((konsistensi_days >= 0)),
    CONSTRAINT profiles_readiness_score_check CHECK (((readiness_score >= (0)::numeric) AND (readiness_score <= (100)::numeric))),
    CONSTRAINT profiles_role_check CHECK (((role IS NULL) OR (role = ANY (ARRAY['umkm'::text, 'institution'::text, 'admin'::text])))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text, 'suspended'::text]))),
    CONSTRAINT profiles_tahun_mulai_check CHECK (((tahun_mulai_usaha IS NULL) OR ((tahun_mulai_usaha >= 1900) AND (tahun_mulai_usaha <= 2100))))
);


--
-- Name: legacy_business_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.legacy_business_profiles WITH (security_invoker='true') AS
 SELECT profile.id AS user_id,
    business.id AS business_id,
    profile.email,
    profile.name,
    COALESCE(profile.nama_usaha, business.name) AS nama_usaha,
    COALESCE(profile.sektor_usaha, business.sector) AS sektor_usaha,
    COALESCE(profile.lokasi, business.location) AS lokasi,
    profile.readiness_score,
    profile.konsistensi_days,
    profile.status
   FROM (public.profiles profile
     LEFT JOIN public.businesses business ON ((business.legacy_profile_id = profile.id)));


--
-- Name: legacy_documents; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.legacy_documents WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    name,
    doc_type,
    storage_path,
    file_url,
    file_size,
    mime_type,
    status,
    created_at,
    updated_at,
    business_id,
    current_version,
    checksum_sha256
   FROM public.documents document;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_numeric_id bigint,
    business_id uuid,
    user_id uuid,
    capture_id uuid,
    idempotency_key text,
    item text NOT NULL,
    qty text DEFAULT '1'::text NOT NULL,
    direction text,
    type text,
    amount_idr bigint,
    nominal bigint,
    category text,
    kategori text,
    transaction_date date,
    tanggal date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_item_id text,
    category_code text,
    quantity numeric,
    unit text,
    unit_price_idr bigint,
    payment_method text,
    sales_channel text,
    category_group text,
    counterparty text,
    evidence_document_version_id uuid,
    ledger_status text DEFAULT 'confirmed'::text NOT NULL,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    adjustment_of_transaction_id uuid,
    emkm_category_code smallint,
    emkm_category_subtype text,
    counterparty_id uuid,
    interest_amount_idr bigint DEFAULT 0 NOT NULL,
    needs_reclass boolean DEFAULT false NOT NULL,
    journal_entry_id uuid,
    CONSTRAINT transactions_amount_idr_check CHECK (((amount_idr IS NOT NULL) AND (amount_idr >= 0))),
    CONSTRAINT transactions_capture_details_check CHECK ((((quantity IS NULL) OR (quantity > (0)::numeric)) AND ((unit_price_idr IS NULL) OR (unit_price_idr > 0)) AND ((category_code IS NULL) OR (category_code = ANY (ARRAY['sales'::text, 'materials'::text, 'operations'::text, 'payroll'::text, 'other'::text, 'sales_direct'::text, 'sales_delivery'::text, 'sales_catering'::text, 'raw_material'::text, 'packaging'::text, 'utilities'::text, 'wage'::text, 'rent'::text, 'platform_fee'::text, 'transport'::text, 'equipment'::text, 'promotion'::text, 'sales_food'::text, 'sales_beverage'::text, 'sales_retail'::text, 'sales_service'::text, 'sales_other'::text, 'raw_ingredients'::text, 'inventory'::text, 'marketing'::text, 'maintenance'::text, 'supplies'::text, 'wages'::text, 'salary'::text, 'bonus'::text, 'tax'::text, 'loan_repayment'::text, 'capital_in'::text, 'loan_in'::text, 'receivable_paid'::text, 'owner_draw'::text, 'asset_purchase'::text, 'receivable_new'::text]))) AND ((payment_method IS NULL) OR (payment_method = ANY (ARRAY['cash'::text, 'qris'::text, 'bank_transfer'::text, 'ewallet'::text, 'edc'::text, 'credit'::text, 'unpaid'::text, 'other'::text]))))),
    CONSTRAINT transactions_category_group_check CHECK ((category_group = ANY (ARRAY['sales'::text, 'cost_of_goods'::text, 'operating_expense'::text, 'asset'::text, 'other'::text]))),
    CONSTRAINT transactions_date_check CHECK (((transaction_date IS NOT NULL) AND (tanggal IS NOT NULL))),
    CONSTRAINT transactions_direction_check CHECK ((direction = ANY (ARRAY['income'::text, 'expense'::text]))),
    CONSTRAINT transactions_emkm_category_check CHECK (((emkm_category_code IS NULL) OR ((emkm_category_code >= 1) AND (emkm_category_code <= 10)))),
    CONSTRAINT transactions_interest_amount_check CHECK ((interest_amount_idr >= 0)),
    CONSTRAINT transactions_ledger_status_check CHECK ((ledger_status = ANY (ARRAY['confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT transactions_nominal_check CHECK (((nominal IS NOT NULL) AND (nominal >= 0))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['masuk'::text, 'keluar'::text])))
);


--
-- Name: legacy_transactions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.legacy_transactions WITH (security_invoker='true') AS
 SELECT id,
    user_id,
    item,
    qty,
    type,
    nominal,
    kategori,
    tanggal,
    created_at,
    updated_at,
    business_id,
    capture_id,
    idempotency_key
   FROM public.transactions transaction;


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    counterparty_id uuid,
    lender_name text NOT NULL,
    lender_type text DEFAULT 'KOPERASI'::text NOT NULL,
    principal_idr bigint NOT NULL,
    outstanding_idr bigint NOT NULL,
    monthly_installment_idr bigint,
    annual_rate numeric(5,2),
    started_on date NOT NULL,
    source_transaction_id uuid,
    closed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    opening_balance_id uuid,
    CONSTRAINT loans_values_check CHECK ((((char_length(TRIM(BOTH FROM lender_name)) >= 1) AND (char_length(TRIM(BOTH FROM lender_name)) <= 120)) AND (principal_idr > 0) AND (outstanding_idr >= 0) AND ((monthly_installment_idr IS NULL) OR (monthly_installment_idr > 0)) AND ((annual_rate IS NULL) OR ((annual_rate >= (0)::numeric) AND (annual_rate <= (200)::numeric))) AND (lender_type = ANY (ARRAY['BANK'::text, 'KOPERASI'::text, 'KELUARGA'::text, 'SUPPLIER'::text, 'LAIN'::text]))))
);


--
-- Name: migration_verification_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_verification_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    migration_key text NOT NULL,
    check_name text NOT NULL,
    expected_count bigint NOT NULL,
    actual_count bigint NOT NULL,
    orphan_count bigint NOT NULL,
    passed boolean NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
    reward jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT missions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);


--
-- Name: mitra; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mitra (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_numeric_id bigint,
    institution_id uuid,
    name text NOT NULL,
    type text NOT NULL,
    coverage text,
    umkm_managed integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mitra_values_check CHECK ((umkm_managed >= 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    business_id uuid,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['unread'::text, 'read'::text, 'archived'::text])))
);


--
-- Name: opening_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opening_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    start_date date NOT NULL,
    cash_idr bigint DEFAULT 0 NOT NULL,
    bank_idr bigint DEFAULT 0 NOT NULL,
    receivables_idr bigint DEFAULT 0 NOT NULL,
    inventory_idr bigint DEFAULT 0 NOT NULL,
    fixed_assets_idr bigint DEFAULT 0 NOT NULL,
    payables_idr bigint DEFAULT 0 NOT NULL,
    loans_bank_idr bigint DEFAULT 0 NOT NULL,
    loans_other_idr bigint DEFAULT 0 NOT NULL,
    receivable_details jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    journal_entry_id uuid,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payable_details jsonb DEFAULT '[]'::jsonb NOT NULL,
    corrected_at timestamp with time zone,
    correction_count integer DEFAULT 0 NOT NULL,
    last_reason text,
    inventory_details jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT opening_balances_amounts_check CHECK (((cash_idr >= 0) AND (bank_idr >= 0) AND (receivables_idr >= 0) AND (inventory_idr >= 0) AND (fixed_assets_idr >= 0) AND (payables_idr >= 0) AND (loans_bank_idr >= 0) AND (loans_other_idr >= 0) AND ((start_date >= '2000-01-01'::date) AND (start_date <= '2100-01-01'::date)) AND ((notes IS NULL) OR (char_length(notes) <= 500)))),
    CONSTRAINT opening_balances_correction_check CHECK (((correction_count >= 0) AND ((last_reason IS NULL) OR (char_length(last_reason) <= 240))))
);


--
-- Name: COLUMN opening_balances.inventory_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.opening_balances.inventory_details IS 'Rincian stok awal per kategori: [{"kind":...,"items":[{"name":...,"amountIdr":n}],"otherAmountIdr":n,"amountIdr":n}]. amountIdr per kategori = jumlah items + otherAmountIdr; jumlah seluruhnya = inventory_idr.';


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    profile_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    provisioned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_admins_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'legacy_profile_migration'::text, 'server_provisioning'::text]))),
    CONSTRAINT platform_admins_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: program_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    business_id uuid NOT NULL,
    status text DEFAULT 'applied'::text NOT NULL,
    application_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    applied_by uuid,
    reviewed_by uuid,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT program_enrollments_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'applied'::text, 'under_review'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'completed'::text])))
);


--
-- Name: program_members; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.program_members WITH (security_invoker='true') AS
 SELECT id,
    program_id,
    business_id,
    applied_at AS joined_at,
        CASE
            WHEN (status = ANY (ARRAY['withdrawn'::text, 'rejected'::text])) THEN reviewed_at
            ELSE NULL::timestamp with time zone
        END AS left_at,
    'v1'::text AS consent_version,
    status
   FROM public.program_enrollments enrollment;


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    requirements jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    starts_on date,
    ends_on date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    join_code text DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 6)) NOT NULL,
    region text,
    mission_pack jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT programs_date_order_check CHECK (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))),
    CONSTRAINT programs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'closed'::text, 'archived'::text])))
);


--
-- Name: readiness_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    business_id uuid,
    rule_set_id uuid,
    total_score numeric(5,2) DEFAULT 0 NOT NULL,
    gaps jsonb DEFAULT '[]'::jsonb NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT readiness_analyses_score_check CHECK (((total_score >= (0)::numeric) AND (total_score <= (100)::numeric)))
);


--
-- Name: readiness_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    level text NOT NULL,
    level_since date,
    grace_until date,
    components jsonb DEFAULT '[]'::jsonb NOT NULL,
    formula_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT readiness_daily_level_check CHECK ((level = ANY (ARRAY['MULAI'::text, 'TEMBAGA'::text, 'PERAK'::text, 'EMAS'::text])))
);


--
-- Name: readiness_rule_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_rule_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    weights jsonb DEFAULT '{}'::jsonb NOT NULL,
    thresholds jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    published_by uuid,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_at timestamp with time zone,
    CONSTRAINT readiness_rule_sets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'retired'::text])))
);


--
-- Name: readiness_score_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_score_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    component_key text NOT NULL,
    raw_score numeric(8,2),
    weight numeric(8,4) NOT NULL,
    weighted_score numeric(8,2),
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    component_status text DEFAULT 'scored'::text NOT NULL,
    max_score numeric(8,2) DEFAULT 0 NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    freshness text DEFAULT 'stale'::text NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    explanation text DEFAULT ''::text NOT NULL,
    next_action text,
    quality_tier text DEFAULT 'recorded'::text NOT NULL,
    CONSTRAINT readiness_components_explainable_check CHECK (((component_status = ANY (ARRAY['scored'::text, 'data_insufficient'::text, 'not_applicable'::text])) AND ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)) AND (freshness = ANY (ARRAY['fresh'::text, 'aging'::text, 'stale'::text])) AND (evidence_count >= 0) AND (quality_tier = ANY (ARRAY['verified'::text, 'confirmed'::text, 'recorded'::text])) AND (((component_status = 'scored'::text) AND (raw_score IS NOT NULL) AND (weighted_score IS NOT NULL)) OR ((component_status <> 'scored'::text) AND (raw_score IS NULL) AND (weighted_score IS NULL))))),
    CONSTRAINT readiness_components_score_check CHECK (((raw_score >= (0)::numeric) AND (weight >= (0)::numeric) AND (weighted_score >= (0)::numeric)))
);


--
-- Name: report_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    document_id uuid,
    report_kind text NOT NULL,
    period_from date,
    period_to date,
    document_uid text NOT NULL,
    audience text DEFAULT 'self'::text NOT NULL,
    institution_id uuid,
    formula_version text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dossier_id uuid,
    CONSTRAINT report_issues_audience_check CHECK ((audience = ANY (ARRAY['self'::text, 'institution'::text]))),
    CONSTRAINT report_issues_institution_check CHECK (((audience <> 'institution'::text) OR (institution_id IS NOT NULL))),
    CONSTRAINT report_issues_kind_check CHECK ((report_kind = ANY (ARRAY['pdf_sak_emkm'::text, 'snapshot_dossier'::text])))
);


--
-- Name: rules_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rules_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_numeric_id bigint,
    rule_set_id uuid,
    version text NOT NULL,
    weights jsonb DEFAULT '{}'::jsonb NOT NULL,
    thresholds jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tax_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    period_month date NOT NULL,
    tax_year integer NOT NULL,
    gross_revenue_idr bigint DEFAULT 0 NOT NULL,
    cumulative_before_idr bigint DEFAULT 0 NOT NULL,
    taxable_idr bigint DEFAULT 0 NOT NULL,
    tax_idr bigint DEFAULT 0 NOT NULL,
    rate numeric NOT NULL,
    exempt_idr bigint NOT NULL,
    journal_entry_id uuid,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transaction_captures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_captures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    user_id uuid,
    idempotency_key text NOT NULL,
    input_method text DEFAULT 'voice'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    storage_path text,
    mime_type text,
    file_size bigint,
    checksum_sha256 text,
    transcription text,
    draft_payload jsonb,
    failure_code text,
    failure_message text,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_text text,
    confirmation_idempotency_key text,
    confirmed_by uuid,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    capture_path text,
    CONSTRAINT transaction_captures_file_size_check CHECK (((file_size IS NULL) OR (file_size >= 0))),
    CONSTRAINT transaction_captures_input_method_check CHECK ((input_method = ANY (ARRAY['voice'::text, 'manual'::text, 'import'::text]))),
    CONSTRAINT transaction_captures_path_check CHECK (((capture_path IS NULL) OR (capture_path = ANY (ARRAY['TEXT_ONLY'::text, 'WHISPER'::text])))),
    CONSTRAINT transaction_captures_source_text_check CHECK (((source_text IS NULL) OR ((char_length(source_text) >= 1) AND (char_length(source_text) <= 2000)))),
    CONSTRAINT transaction_captures_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'queued'::text, 'processing'::text, 'needs_review'::text, 'confirmed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: transaction_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    business_id uuid NOT NULL,
    actor_user_id uuid,
    action text NOT NULL,
    reason text,
    previous_values jsonb,
    new_values jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transaction_changes_action_check CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'cancelled'::text, 'adjusted'::text])))
);


--
-- Name: v_general_ledger; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_general_ledger WITH (security_invoker='true') AS
 SELECT line.business_id,
    line.account_code,
    account.name AS account_name,
    account.account_type,
    account.normal_balance,
    entry.entry_date,
    entry.id AS entry_id,
    entry.source,
    entry.memo,
    line.debit,
    line.credit,
    sum(
        CASE
            WHEN (account.normal_balance = 'DEBIT'::text) THEN (line.debit - line.credit)
            ELSE (line.credit - line.debit)
        END) OVER (PARTITION BY line.business_id, line.account_code ORDER BY entry.entry_date, entry.posted_at, line.line_order, line.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
    entry.posted_at,
    line.line_order,
    line.id AS line_id
   FROM ((public.journal_lines line
     JOIN public.journal_entries entry ON ((entry.id = line.entry_id)))
     JOIN public.coa_accounts account ON ((account.code = line.account_code)));


--
-- Name: wp03_consistency_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.wp03_consistency_report WITH (security_invoker='true') AS
 SELECT migration_key,
    check_name,
    expected_count,
    actual_count,
    orphan_count,
    passed,
    checked_at
   FROM public.migration_verification_results
  WHERE (migration_key = '0011_backfill_existing_data'::text);


--
-- Name: ai_feedback ai_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_pkey PRIMARY KEY (id);


--
-- Name: ai_jobs ai_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_pkey PRIMARY KEY (id);


--
-- Name: ai_runs ai_runs_job_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_job_id_attempt_number_key UNIQUE (job_id, attempt_number);


--
-- Name: ai_runs ai_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: business_members business_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_pkey PRIMARY KEY (id);


--
-- Name: business_missions business_missions_business_id_mission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_missions
    ADD CONSTRAINT business_missions_business_id_mission_id_key UNIQUE (business_id, mission_id);


--
-- Name: business_missions business_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_missions
    ADD CONSTRAINT business_missions_pkey PRIMARY KEY (id);


--
-- Name: business_readiness_state business_readiness_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_readiness_state
    ADD CONSTRAINT business_readiness_state_pkey PRIMARY KEY (business_id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: category_templates category_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_templates
    ADD CONSTRAINT category_templates_pkey PRIMARY KEY (id);


--
-- Name: coa_accounts coa_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coa_accounts
    ADD CONSTRAINT coa_accounts_pkey PRIMARY KEY (code);


--
-- Name: consent_grants consent_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_grants
    ADD CONSTRAINT consent_grants_pkey PRIMARY KEY (id);


--
-- Name: counterparties counterparties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_pkey PRIMARY KEY (id);


--
-- Name: daily_closings daily_closings_business_id_closing_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closings
    ADD CONSTRAINT daily_closings_business_id_closing_date_key UNIQUE (business_id, closing_date);


--
-- Name: daily_closings daily_closings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closings
    ADD CONSTRAINT daily_closings_pkey PRIMARY KEY (id);


--
-- Name: depreciation_postings depreciation_postings_asset_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_postings
    ADD CONSTRAINT depreciation_postings_asset_id_period_month_key UNIQUE (asset_id, period_month);


--
-- Name: depreciation_postings depreciation_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_postings
    ADD CONSTRAINT depreciation_postings_pkey PRIMARY KEY (id);


--
-- Name: discovery_optins discovery_optins_candidate_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_optins
    ADD CONSTRAINT discovery_optins_candidate_code_key UNIQUE (candidate_code);


--
-- Name: discovery_optins discovery_optins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_optins
    ADD CONSTRAINT discovery_optins_pkey PRIMARY KEY (business_id);


--
-- Name: document_attachments document_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_attachments
    ADD CONSTRAINT document_attachments_pkey PRIMARY KEY (id);


--
-- Name: document_extractions document_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_pkey PRIMARY KEY (id);


--
-- Name: document_reminders document_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_reminders
    ADD CONSTRAINT document_reminders_pkey PRIMARY KEY (id);


--
-- Name: document_reminders document_reminders_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_reminders
    ADD CONSTRAINT document_reminders_unique UNIQUE (document_id, kind);


--
-- Name: document_requirements document_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_requirements
    ADD CONSTRAINT document_requirements_pkey PRIMARY KEY (id);


--
-- Name: document_requirements document_requirements_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_requirements
    ADD CONSTRAINT document_requirements_unique UNIQUE (sector, doc_type);


--
-- Name: document_upload_sessions document_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_upload_sessions
    ADD CONSTRAINT document_upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: document_upload_sessions document_upload_sessions_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_upload_sessions
    ADD CONSTRAINT document_upload_sessions_storage_path_key UNIQUE (storage_path);


--
-- Name: document_upload_sessions document_upload_sessions_user_id_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_upload_sessions
    ADD CONSTRAINT document_upload_sessions_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);


--
-- Name: document_verifications document_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_verifications
    ADD CONSTRAINT document_verifications_pkey PRIMARY KEY (id);


--
-- Name: document_versions document_versions_document_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_version_key UNIQUE (document_id, version);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: dossier_access_events dossier_access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_access_events
    ADD CONSTRAINT dossier_access_events_pkey PRIMARY KEY (id);


--
-- Name: dossier_api_keys dossier_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_api_keys
    ADD CONSTRAINT dossier_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: dossier_api_keys dossier_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_api_keys
    ADD CONSTRAINT dossier_api_keys_pkey PRIMARY KEY (id);


--
-- Name: dossier_items dossier_items_dossier_id_item_type_source_table_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_items
    ADD CONSTRAINT dossier_items_dossier_id_item_type_source_table_source_id_key UNIQUE (dossier_id, item_type, source_table, source_id);


--
-- Name: dossier_items dossier_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_items
    ADD CONSTRAINT dossier_items_pkey PRIMARY KEY (id);


--
-- Name: dossier_requests dossier_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_pkey PRIMARY KEY (id);


--
-- Name: dossiers dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_pkey PRIMARY KEY (id);


--
-- Name: dossiers dossiers_request_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_request_id_version_key UNIQUE (request_id, version);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: indicator_monthly indicator_monthly_month_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicator_monthly
    ADD CONSTRAINT indicator_monthly_month_unique UNIQUE (business_id, period_month);


--
-- Name: indicator_monthly indicator_monthly_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicator_monthly
    ADD CONSTRAINT indicator_monthly_pkey PRIMARY KEY (id);


--
-- Name: institution_entitlements institution_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_entitlements
    ADD CONSTRAINT institution_entitlements_pkey PRIMARY KEY (institution_id);


--
-- Name: institution_members institution_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_members
    ADD CONSTRAINT institution_members_pkey PRIMARY KEY (id);


--
-- Name: institution_shortlists institution_shortlists_institution_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_shortlists
    ADD CONSTRAINT institution_shortlists_institution_id_business_id_key UNIQUE (institution_id, business_id);


--
-- Name: institution_shortlists institution_shortlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_shortlists
    ADD CONSTRAINT institution_shortlists_pkey PRIMARY KEY (id);


--
-- Name: institution_view_logs institution_view_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_view_logs
    ADD CONSTRAINT institution_view_logs_pkey PRIMARY KEY (id);


--
-- Name: institutions institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_pkey PRIMARY KEY (id);


--
-- Name: inventory_counts inventory_counts_business_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_business_id_period_month_key UNIQUE (business_id, period_month);


--
-- Name: inventory_counts inventory_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: migration_verification_results migration_verification_results_migration_key_check_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_verification_results
    ADD CONSTRAINT migration_verification_results_migration_key_check_name_key UNIQUE (migration_key, check_name);


--
-- Name: migration_verification_results migration_verification_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_verification_results
    ADD CONSTRAINT migration_verification_results_pkey PRIMARY KEY (id);


--
-- Name: missions missions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_code_key UNIQUE (code);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: mitra mitra_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra
    ADD CONSTRAINT mitra_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: opening_balances opening_balances_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_business_id_key UNIQUE (business_id);


--
-- Name: opening_balances opening_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: platform_admins platform_admins_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_profile_id_key UNIQUE (profile_id);


--
-- Name: profiles profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: program_enrollments program_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_pkey PRIMARY KEY (id);


--
-- Name: program_enrollments program_enrollments_program_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_program_id_business_id_key UNIQUE (program_id, business_id);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);


--
-- Name: readiness_analyses readiness_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_analyses
    ADD CONSTRAINT readiness_analyses_pkey PRIMARY KEY (id);


--
-- Name: readiness_daily readiness_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_daily
    ADD CONSTRAINT readiness_daily_pkey PRIMARY KEY (id);


--
-- Name: readiness_daily readiness_daily_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_daily
    ADD CONSTRAINT readiness_daily_unique UNIQUE (business_id, snapshot_date);


--
-- Name: readiness_rule_sets readiness_rule_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_rule_sets
    ADD CONSTRAINT readiness_rule_sets_pkey PRIMARY KEY (id);


--
-- Name: readiness_rule_sets readiness_rule_sets_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_rule_sets
    ADD CONSTRAINT readiness_rule_sets_version_key UNIQUE (version);


--
-- Name: readiness_score_components readiness_score_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_components
    ADD CONSTRAINT readiness_score_components_pkey PRIMARY KEY (id);


--
-- Name: readiness_score_components readiness_score_components_snapshot_id_component_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_components
    ADD CONSTRAINT readiness_score_components_snapshot_id_component_key_key UNIQUE (snapshot_id, component_key);


--
-- Name: readiness_score_snapshots readiness_score_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_snapshots
    ADD CONSTRAINT readiness_score_snapshots_pkey PRIMARY KEY (id);


--
-- Name: report_issues report_issues_document_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_document_uid_key UNIQUE (document_uid);


--
-- Name: report_issues report_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_pkey PRIMARY KEY (id);


--
-- Name: rules_config rules_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules_config
    ADD CONSTRAINT rules_config_pkey PRIMARY KEY (id);


--
-- Name: tax_estimates tax_estimates_month_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_estimates
    ADD CONSTRAINT tax_estimates_month_unique UNIQUE (business_id, period_month);


--
-- Name: tax_estimates tax_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_estimates
    ADD CONSTRAINT tax_estimates_pkey PRIMARY KEY (id);


--
-- Name: transaction_captures transaction_captures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_captures
    ADD CONSTRAINT transaction_captures_pkey PRIMARY KEY (id);


--
-- Name: transaction_changes transaction_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_changes
    ADD CONSTRAINT transaction_changes_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: ai_jobs_business_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_jobs_business_idempotency_unique_idx ON public.ai_jobs USING btree (business_id, job_type, idempotency_key) WHERE (business_id IS NOT NULL);


--
-- Name: ai_jobs_capture_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_jobs_capture_status_idx ON public.ai_jobs USING btree (capture_id, status, available_at) WHERE (capture_id IS NOT NULL);


--
-- Name: ai_jobs_capture_voice_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_jobs_capture_voice_unique_idx ON public.ai_jobs USING btree (capture_id) WHERE ((capture_id IS NOT NULL) AND (job_type = 'voice_to_ledger'::text));


--
-- Name: ai_jobs_document_extraction_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_jobs_document_extraction_unique_idx ON public.ai_jobs USING btree (document_version_id) WHERE ((document_version_id IS NOT NULL) AND (job_type = 'document_extraction'::text));


--
-- Name: ai_jobs_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_jobs_queue_idx ON public.ai_jobs USING btree (status, available_at) WHERE (status = 'queued'::text);


--
-- Name: ai_jobs_user_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_jobs_user_idempotency_unique_idx ON public.ai_jobs USING btree (requested_by, job_type, idempotency_key) WHERE ((business_id IS NULL) AND (requested_by IS NOT NULL));


--
-- Name: audit_events_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_occurred_idx ON public.audit_events USING btree (occurred_at DESC);


--
-- Name: audit_logs_legacy_numeric_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_logs_legacy_numeric_id_unique_idx ON public.audit_logs USING btree (legacy_numeric_id) WHERE (legacy_numeric_id IS NOT NULL);


--
-- Name: business_members_one_per_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_members_one_per_business_idx ON public.business_members USING btree (business_id);


--
-- Name: business_members_profile_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_members_profile_unique_idx ON public.business_members USING btree (business_id, profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: business_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_members_user_idx ON public.business_members USING btree (user_id, status);


--
-- Name: business_members_user_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_members_user_unique_idx ON public.business_members USING btree (business_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: business_missions_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_missions_business_status_idx ON public.business_missions USING btree (business_id, status);


--
-- Name: businesses_legacy_profile_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX businesses_legacy_profile_id_unique_idx ON public.businesses USING btree (legacy_profile_id) WHERE (legacy_profile_id IS NOT NULL);


--
-- Name: businesses_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX businesses_status_idx ON public.businesses USING btree (status);


--
-- Name: category_templates_lookup_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX category_templates_lookup_key ON public.category_templates USING btree (sector, category_code, COALESCE(subtype, ''::text), version);


--
-- Name: consent_grants_active_request_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consent_grants_active_request_unique_idx ON public.consent_grants USING btree (request_id) WHERE (status = 'active'::text);


--
-- Name: consent_grants_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consent_grants_business_status_idx ON public.consent_grants USING btree (business_id, status, expires_at);


--
-- Name: consent_grants_one_active_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX consent_grants_one_active_relationship_idx ON public.consent_grants USING btree (institution_id, business_id) WHERE (status = 'active'::text);


--
-- Name: counterparties_business_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX counterparties_business_name_key ON public.counterparties USING btree (business_id, lower(TRIM(BOTH FROM name)));


--
-- Name: document_attachments_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_attachments_document_idx ON public.document_attachments USING btree (document_id);


--
-- Name: document_attachments_live_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_attachments_live_unique ON public.document_attachments USING btree (document_id, target_type, target_id) WHERE (removed_at IS NULL);


--
-- Name: document_attachments_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_attachments_target_idx ON public.document_attachments USING btree (business_id, target_type, target_id) WHERE (removed_at IS NULL);


--
-- Name: document_extractions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_extractions_status_idx ON public.document_extractions USING btree (status, created_at);


--
-- Name: document_extractions_version_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_extractions_version_unique_idx ON public.document_extractions USING btree (document_version_id);


--
-- Name: document_reminders_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_reminders_due_idx ON public.document_reminders USING btree (business_id, remind_on) WHERE (status = 'pending'::text);


--
-- Name: document_upload_sessions_one_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_upload_sessions_one_pending_idx ON public.document_upload_sessions USING btree (document_id) WHERE (status = 'pending'::text);


--
-- Name: document_upload_sessions_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_upload_sessions_owner_status_idx ON public.document_upload_sessions USING btree (user_id, status, expires_at);


--
-- Name: document_verifications_version_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_verifications_version_unique_idx ON public.document_verifications USING btree (document_version_id);


--
-- Name: document_versions_storage_path_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_versions_storage_path_unique_idx ON public.document_versions USING btree (storage_path);


--
-- Name: documents_business_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_business_type_idx ON public.documents USING btree (business_id, doc_type);


--
-- Name: documents_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_class_idx ON public.documents USING btree (business_id, doc_class);


--
-- Name: documents_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_user_type_idx ON public.documents USING btree (user_id, doc_type);


--
-- Name: documents_valid_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_valid_until_idx ON public.documents USING btree (valid_until) WHERE (valid_until IS NOT NULL);


--
-- Name: dossier_access_events_dossier_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dossier_access_events_dossier_occurred_idx ON public.dossier_access_events USING btree (dossier_id, occurred_at DESC);


--
-- Name: dossier_requests_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dossier_requests_business_status_idx ON public.dossier_requests USING btree (business_id, status);


--
-- Name: dossier_requests_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dossier_requests_idempotency_unique_idx ON public.dossier_requests USING btree (institution_id, requested_by, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: dossier_requests_institution_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dossier_requests_institution_status_idx ON public.dossier_requests USING btree (institution_id, status);


--
-- Name: dossier_requests_one_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dossier_requests_one_pending_idx ON public.dossier_requests USING btree (institution_id, business_id, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = 'pending'::text);


--
-- Name: fixed_assets_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_business_idx ON public.fixed_assets USING btree (business_id, acquired_on);


--
-- Name: fixed_assets_opening_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_opening_idx ON public.fixed_assets USING btree (business_id, opening_balance_id);


--
-- Name: indicator_monthly_business_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indicator_monthly_business_month_idx ON public.indicator_monthly USING btree (business_id, period_month DESC);


--
-- Name: institution_members_profile_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX institution_members_profile_unique_idx ON public.institution_members USING btree (institution_id, profile_id) WHERE (profile_id IS NOT NULL);


--
-- Name: institution_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX institution_members_user_idx ON public.institution_members USING btree (user_id, status);


--
-- Name: institution_members_user_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX institution_members_user_unique_idx ON public.institution_members USING btree (institution_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: institutions_legacy_numeric_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX institutions_legacy_numeric_id_unique_idx ON public.institutions USING btree (legacy_numeric_id) WHERE (legacy_numeric_id IS NOT NULL);


--
-- Name: institutions_legacy_profile_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX institutions_legacy_profile_id_unique_idx ON public.institutions USING btree (legacy_profile_id) WHERE (legacy_profile_id IS NOT NULL);


--
-- Name: journal_entries_business_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_business_date_idx ON public.journal_entries USING btree (business_id, entry_date DESC, posted_at DESC);


--
-- Name: journal_entries_cash_flow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_cash_flow_idx ON public.journal_entries USING btree (business_id, cash_flow_section, entry_date);


--
-- Name: journal_entries_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_source_idx ON public.journal_entries USING btree (source, source_id);


--
-- Name: journal_lines_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_account_idx ON public.journal_lines USING btree (business_id, account_code);


--
-- Name: journal_lines_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_entry_idx ON public.journal_lines USING btree (entry_id, line_order);


--
-- Name: loans_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_business_idx ON public.loans USING btree (business_id, started_on);


--
-- Name: loans_opening_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_opening_idx ON public.loans USING btree (business_id, opening_balance_id);


--
-- Name: mitra_legacy_numeric_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mitra_legacy_numeric_id_unique_idx ON public.mitra USING btree (legacy_numeric_id) WHERE (legacy_numeric_id IS NOT NULL);


--
-- Name: notifications_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_status_idx ON public.notifications USING btree (user_id, status, created_at DESC);


--
-- Name: platform_admins_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_admins_status_idx ON public.platform_admins USING btree (user_id, status);


--
-- Name: profiles_auth_user_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_auth_user_id_unique_idx ON public.profiles USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: profiles_deletion_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_deletion_due_idx ON public.profiles USING btree (deletion_scheduled_for) WHERE (deletion_requested_at IS NOT NULL);


--
-- Name: program_enrollments_business_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_enrollments_business_status_idx ON public.program_enrollments USING btree (business_id, status);


--
-- Name: programs_institution_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX programs_institution_status_idx ON public.programs USING btree (institution_id, status);


--
-- Name: programs_join_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX programs_join_code_unique_idx ON public.programs USING btree (join_code);


--
-- Name: readiness_daily_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX readiness_daily_business_idx ON public.readiness_daily USING btree (business_id, snapshot_date DESC);


--
-- Name: readiness_snapshots_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX readiness_snapshots_business_created_idx ON public.readiness_score_snapshots USING btree (business_id, calculated_at DESC);


--
-- Name: readiness_snapshots_source_analysis_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX readiness_snapshots_source_analysis_unique_idx ON public.readiness_score_snapshots USING btree (source_analysis_id) WHERE (source_analysis_id IS NOT NULL);


--
-- Name: report_issues_business_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_issues_business_idx ON public.report_issues USING btree (business_id, created_at DESC);


--
-- Name: report_issues_dossier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_issues_dossier_idx ON public.report_issues USING btree (dossier_id, created_at DESC);


--
-- Name: rules_config_legacy_numeric_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rules_config_legacy_numeric_id_unique_idx ON public.rules_config USING btree (legacy_numeric_id) WHERE (legacy_numeric_id IS NOT NULL);


--
-- Name: tax_estimates_business_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_estimates_business_month_idx ON public.tax_estimates USING btree (business_id, period_month DESC);


--
-- Name: transaction_captures_business_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_captures_business_created_idx ON public.transaction_captures USING btree (business_id, created_at DESC);


--
-- Name: transaction_captures_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transaction_captures_idempotency_unique_idx ON public.transaction_captures USING btree (business_id, idempotency_key);


--
-- Name: transaction_captures_status_available_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_captures_status_available_idx ON public.transaction_captures USING btree (status, created_at);


--
-- Name: transaction_changes_transaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transaction_changes_transaction_idx ON public.transaction_changes USING btree (transaction_id, created_at DESC);


--
-- Name: transactions_business_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_business_date_idx ON public.transactions USING btree (business_id, transaction_date DESC);


--
-- Name: transactions_business_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_business_idempotency_unique_idx ON public.transactions USING btree (business_id, idempotency_key) WHERE ((business_id IS NOT NULL) AND (idempotency_key IS NOT NULL));


--
-- Name: transactions_capture_client_item_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_capture_client_item_unique_idx ON public.transactions USING btree (capture_id, client_item_id) WHERE ((capture_id IS NOT NULL) AND (client_item_id IS NOT NULL));


--
-- Name: transactions_journal_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_journal_entry_idx ON public.transactions USING btree (journal_entry_id);


--
-- Name: transactions_legacy_numeric_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_legacy_numeric_id_unique_idx ON public.transactions USING btree (legacy_numeric_id) WHERE (legacy_numeric_id IS NOT NULL);


--
-- Name: transactions_needs_reclass_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_needs_reclass_idx ON public.transactions USING btree (business_id, needs_reclass) WHERE needs_reclass;


--
-- Name: transactions_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_report_idx ON public.transactions USING btree (business_id, transaction_date DESC, ledger_status);


--
-- Name: transactions_user_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_user_date_idx ON public.transactions USING btree (user_id, tanggal DESC);


--
-- Name: transactions_user_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_user_idempotency_unique_idx ON public.transactions USING btree (user_id, idempotency_key) WHERE ((business_id IS NULL) AND (user_id IS NOT NULL) AND (idempotency_key IS NOT NULL));


--
-- Name: businesses businesses_sync_owner_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER businesses_sync_owner_membership AFTER INSERT OR UPDATE OF legacy_profile_id, status ON public.businesses FOR EACH ROW EXECUTE FUNCTION private.sync_profile_owner_membership();


--
-- Name: consent_grants consent_grant_change_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consent_grant_change_notification AFTER UPDATE OF status ON public.consent_grants FOR EACH ROW EXECUTE FUNCTION public.notify_consent_grant_change();


--
-- Name: consent_grants consume_dossier_credit_before_grant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consume_dossier_credit_before_grant BEFORE INSERT ON public.consent_grants FOR EACH ROW WHEN ((new.status = 'active'::text)) EXECUTE FUNCTION public.consume_institution_dossier_credit();


--
-- Name: document_attachments document_attachments_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_attachments_immutable BEFORE DELETE OR UPDATE ON public.document_attachments FOR EACH ROW EXECUTE FUNCTION private.document_attachment_is_immutable();


--
-- Name: documents documents_shelf_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER documents_shelf_default BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION private.document_shelf_default();


--
-- Name: dossier_access_events dossier_access_institution_log; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dossier_access_institution_log AFTER INSERT ON public.dossier_access_events FOR EACH ROW EXECUTE FUNCTION public.project_dossier_access_to_institution_log();


--
-- Name: dossier_access_events dossier_download_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dossier_download_notification AFTER INSERT ON public.dossier_access_events FOR EACH ROW EXECUTE FUNCTION public.notify_dossier_download();


--
-- Name: dossier_requests dossier_request_change_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dossier_request_change_notification AFTER INSERT OR UPDATE OF status ON public.dossier_requests FOR EACH ROW EXECUTE FUNCTION public.notify_dossier_request_change();


--
-- Name: journal_entries journal_entries_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_entries_balanced AFTER INSERT ON public.journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.assert_journal_entry_has_lines();


--
-- Name: journal_entries journal_entries_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_entries_immutable BEFORE DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION private.reject_journal_mutation();


--
-- Name: journal_entries journal_entries_unwind_side_effects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_entries_unwind_side_effects AFTER INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION private.unwind_transaction_side_effects();


--
-- Name: journal_lines journal_lines_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR UPDATE ON public.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.assert_journal_entry_balanced();


--
-- Name: journal_lines journal_lines_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_lines_immutable BEFORE DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION private.reject_journal_mutation();


--
-- Name: audit_events prevent_audit_events_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_audit_events_mutation BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_row_mutation();


--
-- Name: audit_logs prevent_audit_logs_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_audit_logs_mutation BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_row_mutation();


--
-- Name: dossier_access_events prevent_dossier_access_events_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_dossier_access_events_mutation BEFORE DELETE OR UPDATE ON public.dossier_access_events FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_row_mutation();


--
-- Name: readiness_score_components prevent_readiness_score_components_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_readiness_score_components_mutation BEFORE DELETE OR UPDATE ON public.readiness_score_components FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_row_mutation();


--
-- Name: readiness_score_snapshots prevent_readiness_score_snapshots_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_readiness_score_snapshots_mutation BEFORE DELETE OR UPDATE ON public.readiness_score_snapshots FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_row_mutation();


--
-- Name: profiles profiles_provision_umkm_business; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_provision_umkm_business AFTER INSERT OR UPDATE OF id, role, nama_usaha, name ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.provision_umkm_business();


--
-- Name: business_members protect_business_membership_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_business_membership_authority BEFORE INSERT OR DELETE OR UPDATE ON public.business_members FOR EACH ROW EXECUTE FUNCTION public.protect_business_membership_authority();


--
-- Name: consent_grants protect_consent_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_consent_authority BEFORE UPDATE ON public.consent_grants FOR EACH ROW EXECUTE FUNCTION public.protect_consent_authority();


--
-- Name: institution_members protect_institution_membership_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_institution_membership_authority BEFORE INSERT OR DELETE OR UPDATE ON public.institution_members FOR EACH ROW EXECUTE FUNCTION public.protect_institution_membership_authority();


--
-- Name: profiles protect_profile_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_profile_authority BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authority();


--
-- Name: readiness_rule_sets readiness_rule_sets_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER readiness_rule_sets_frozen BEFORE UPDATE ON public.readiness_rule_sets FOR EACH ROW EXECUTE FUNCTION private.readiness_rule_set_is_frozen();


--
-- Name: ai_jobs set_ai_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ai_jobs_updated_at BEFORE UPDATE ON public.ai_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: business_members set_business_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_business_members_updated_at BEFORE UPDATE ON public.business_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: business_missions set_business_missions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_business_missions_updated_at BEFORE UPDATE ON public.business_missions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: businesses set_businesses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: consent_grants set_consent_grants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_consent_grants_updated_at BEFORE UPDATE ON public.consent_grants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: daily_closings set_daily_closings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_daily_closings_updated_at BEFORE UPDATE ON public.daily_closings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_extractions set_document_extractions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_document_extractions_updated_at BEFORE UPDATE ON public.document_extractions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: document_verifications set_document_verifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_document_verifications_updated_at BEFORE UPDATE ON public.document_verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documents set_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: dossier_requests set_dossier_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_dossier_requests_updated_at BEFORE UPDATE ON public.dossier_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: dossiers set_dossiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_dossiers_updated_at BEFORE UPDATE ON public.dossiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: institution_members set_institution_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_institution_members_updated_at BEFORE UPDATE ON public.institution_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: institutions set_institutions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_institutions_updated_at BEFORE UPDATE ON public.institutions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: missions set_missions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_missions_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: mitra set_mitra_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_mitra_updated_at BEFORE UPDATE ON public.mitra FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notifications set_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: program_enrollments set_program_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_program_enrollments_updated_at BEFORE UPDATE ON public.program_enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programs set_programs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_programs_updated_at BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: readiness_rule_sets set_readiness_rule_sets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_readiness_rule_sets_updated_at BEFORE UPDATE ON public.readiness_rule_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: transaction_captures set_transaction_captures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_transaction_captures_updated_at BEFORE UPDATE ON public.transaction_captures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: transactions set_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: transactions sync_transaction_compatibility_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_transaction_compatibility_columns BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_compatibility_columns();


--
-- Name: consent_grants validate_active_consent_grant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_active_consent_grant BEFORE INSERT OR UPDATE ON public.consent_grants FOR EACH ROW EXECUTE FUNCTION public.validate_active_consent_grant();


--
-- Name: ai_feedback ai_feedback_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ai_jobs(id) ON DELETE CASCADE;


--
-- Name: ai_feedback ai_feedback_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ai_runs(id) ON DELETE SET NULL;


--
-- Name: ai_feedback ai_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_jobs ai_jobs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: ai_jobs ai_jobs_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.transaction_captures(id) ON DELETE CASCADE;


--
-- Name: ai_jobs ai_jobs_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;


--
-- Name: ai_jobs ai_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_runs ai_runs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_runs
    ADD CONSTRAINT ai_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ai_jobs(id) ON DELETE CASCADE;


--
-- Name: audit_events audit_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_events audit_events_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: audit_events audit_events_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_audit_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES public.audit_events(id) ON DELETE SET NULL;


--
-- Name: business_members business_members_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_members business_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: business_members business_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: business_missions business_missions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_missions
    ADD CONSTRAINT business_missions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: business_missions business_missions_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_missions
    ADD CONSTRAINT business_missions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: business_readiness_state business_readiness_state_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_readiness_state
    ADD CONSTRAINT business_readiness_state_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: businesses businesses_legacy_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_legacy_profile_id_fkey FOREIGN KEY (legacy_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: consent_grants consent_grants_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_grants
    ADD CONSTRAINT consent_grants_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: consent_grants consent_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_grants
    ADD CONSTRAINT consent_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: consent_grants consent_grants_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_grants
    ADD CONSTRAINT consent_grants_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: consent_grants consent_grants_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_grants
    ADD CONSTRAINT consent_grants_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.dossier_requests(id) ON DELETE RESTRICT;


--
-- Name: counterparties counterparties_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: counterparties counterparties_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: daily_closings daily_closings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closings
    ADD CONSTRAINT daily_closings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: daily_closings daily_closings_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closings
    ADD CONSTRAINT daily_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: depreciation_postings depreciation_postings_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_postings
    ADD CONSTRAINT depreciation_postings_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.fixed_assets(id) ON DELETE CASCADE;


--
-- Name: depreciation_postings depreciation_postings_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_postings
    ADD CONSTRAINT depreciation_postings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: depreciation_postings depreciation_postings_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_postings
    ADD CONSTRAINT depreciation_postings_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: discovery_optins discovery_optins_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discovery_optins
    ADD CONSTRAINT discovery_optins_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: document_attachments document_attachments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_attachments
    ADD CONSTRAINT document_attachments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: document_attachments document_attachments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_attachments
    ADD CONSTRAINT document_attachments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: document_attachments document_attachments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_attachments
    ADD CONSTRAINT document_attachments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_extractions document_extractions_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;


--
-- Name: document_extractions document_extractions_owner_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_owner_confirmed_by_fkey FOREIGN KEY (owner_confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: document_reminders document_reminders_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_reminders
    ADD CONSTRAINT document_reminders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: document_reminders document_reminders_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_reminders
    ADD CONSTRAINT document_reminders_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_upload_sessions document_upload_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_upload_sessions
    ADD CONSTRAINT document_upload_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: document_upload_sessions document_upload_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_upload_sessions
    ADD CONSTRAINT document_upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: document_verifications document_verifications_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_verifications
    ADD CONSTRAINT document_verifications_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;


--
-- Name: document_verifications document_verifications_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_verifications
    ADD CONSTRAINT document_verifications_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: document_versions document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_attested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_attested_by_fkey FOREIGN KEY (attested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dossier_access_events dossier_access_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_access_events
    ADD CONSTRAINT dossier_access_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dossier_access_events dossier_access_events_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_access_events
    ADD CONSTRAINT dossier_access_events_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_access_events dossier_access_events_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_access_events
    ADD CONSTRAINT dossier_access_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: dossier_api_keys dossier_api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_api_keys
    ADD CONSTRAINT dossier_api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dossier_api_keys dossier_api_keys_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_api_keys
    ADD CONSTRAINT dossier_api_keys_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_api_keys dossier_api_keys_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_api_keys
    ADD CONSTRAINT dossier_api_keys_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: dossier_items dossier_items_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_items
    ADD CONSTRAINT dossier_items_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_requests dossier_requests_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dossier_requests dossier_requests_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: dossier_requests dossier_requests_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE SET NULL;


--
-- Name: dossier_requests dossier_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dossier_requests dossier_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_requests
    ADD CONSTRAINT dossier_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dossiers dossiers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: dossiers dossiers_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.consent_grants(id) ON DELETE RESTRICT;


--
-- Name: dossiers dossiers_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: dossiers dossiers_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.dossier_requests(id) ON DELETE RESTRICT;


--
-- Name: fixed_assets fixed_assets_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: fixed_assets fixed_assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fixed_assets fixed_assets_opening_balance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_opening_balance_id_fkey FOREIGN KEY (opening_balance_id) REFERENCES public.opening_balances(id) ON DELETE SET NULL;


--
-- Name: fixed_assets fixed_assets_source_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;


--
-- Name: indicator_monthly indicator_monthly_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicator_monthly
    ADD CONSTRAINT indicator_monthly_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: institution_entitlements institution_entitlements_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_entitlements
    ADD CONSTRAINT institution_entitlements_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_members institution_members_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_members
    ADD CONSTRAINT institution_members_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_members institution_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_members
    ADD CONSTRAINT institution_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: institution_members institution_members_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_members
    ADD CONSTRAINT institution_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: institution_members institution_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_members
    ADD CONSTRAINT institution_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: institution_shortlists institution_shortlists_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_shortlists
    ADD CONSTRAINT institution_shortlists_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: institution_shortlists institution_shortlists_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_shortlists
    ADD CONSTRAINT institution_shortlists_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: institution_shortlists institution_shortlists_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_shortlists
    ADD CONSTRAINT institution_shortlists_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_view_logs institution_view_logs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_view_logs
    ADD CONSTRAINT institution_view_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- Name: institution_view_logs institution_view_logs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_view_logs
    ADD CONSTRAINT institution_view_logs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: institution_view_logs institution_view_logs_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_view_logs
    ADD CONSTRAINT institution_view_logs_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.institution_members(id) ON DELETE SET NULL;


--
-- Name: institutions institutions_legacy_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_legacy_profile_id_fkey FOREIGN KEY (legacy_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: institutions institutions_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institutions
    ADD CONSTRAINT institutions_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_counts inventory_counts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: inventory_counts inventory_counts_counted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_counts inventory_counts_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_reverses_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reverses_entry_id_fkey FOREIGN KEY (reverses_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.coa_accounts(code);


--
-- Name: journal_lines journal_lines_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: loans loans_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: loans loans_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE SET NULL;


--
-- Name: loans loans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: loans loans_opening_balance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_opening_balance_id_fkey FOREIGN KEY (opening_balance_id) REFERENCES public.opening_balances(id) ON DELETE SET NULL;


--
-- Name: loans loans_source_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_source_transaction_id_fkey FOREIGN KEY (source_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;


--
-- Name: mitra mitra_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mitra
    ADD CONSTRAINT mitra_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: opening_balances opening_balances_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: opening_balances opening_balances_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: opening_balances opening_balances_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_balances
    ADD CONSTRAINT opening_balances_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_provisioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_provisioned_by_fkey FOREIGN KEY (provisioned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: program_enrollments program_enrollments_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: program_enrollments program_enrollments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: program_enrollments program_enrollments_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: program_enrollments program_enrollments_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_enrollments
    ADD CONSTRAINT program_enrollments_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: programs programs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: programs programs_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;


--
-- Name: readiness_analyses readiness_analyses_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_analyses
    ADD CONSTRAINT readiness_analyses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: readiness_analyses readiness_analyses_rule_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_analyses
    ADD CONSTRAINT readiness_analyses_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES public.readiness_rule_sets(id) ON DELETE SET NULL;


--
-- Name: readiness_daily readiness_daily_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_daily
    ADD CONSTRAINT readiness_daily_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: readiness_rule_sets readiness_rule_sets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_rule_sets
    ADD CONSTRAINT readiness_rule_sets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: readiness_rule_sets readiness_rule_sets_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_rule_sets
    ADD CONSTRAINT readiness_rule_sets_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: readiness_score_components readiness_score_components_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_components
    ADD CONSTRAINT readiness_score_components_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.readiness_score_snapshots(id) ON DELETE CASCADE;


--
-- Name: readiness_score_snapshots readiness_score_snapshots_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_snapshots
    ADD CONSTRAINT readiness_score_snapshots_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: readiness_score_snapshots readiness_score_snapshots_calculated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_snapshots
    ADD CONSTRAINT readiness_score_snapshots_calculated_by_fkey FOREIGN KEY (calculated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: readiness_score_snapshots readiness_score_snapshots_rule_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_score_snapshots
    ADD CONSTRAINT readiness_score_snapshots_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES public.readiness_rule_sets(id) ON DELETE RESTRICT;


--
-- Name: report_issues report_issues_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: report_issues report_issues_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: report_issues report_issues_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: report_issues report_issues_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE SET NULL;


--
-- Name: report_issues report_issues_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_issues
    ADD CONSTRAINT report_issues_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;


--
-- Name: rules_config rules_config_rule_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rules_config
    ADD CONSTRAINT rules_config_rule_set_id_fkey FOREIGN KEY (rule_set_id) REFERENCES public.readiness_rule_sets(id) ON DELETE SET NULL;


--
-- Name: tax_estimates tax_estimates_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_estimates
    ADD CONSTRAINT tax_estimates_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: tax_estimates tax_estimates_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_estimates
    ADD CONSTRAINT tax_estimates_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: transaction_captures transaction_captures_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_captures
    ADD CONSTRAINT transaction_captures_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: transaction_captures transaction_captures_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_captures
    ADD CONSTRAINT transaction_captures_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transaction_captures transaction_captures_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_captures
    ADD CONSTRAINT transaction_captures_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transaction_changes transaction_changes_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_changes
    ADD CONSTRAINT transaction_changes_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transaction_changes transaction_changes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_changes
    ADD CONSTRAINT transaction_changes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: transaction_changes transaction_changes_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_changes
    ADD CONSTRAINT transaction_changes_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_adjustment_of_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_adjustment_of_transaction_id_fkey FOREIGN KEY (adjustment_of_transaction_id) REFERENCES public.transactions(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_capture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.transaction_captures(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_evidence_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_evidence_document_version_id_fkey FOREIGN KEY (evidence_document_version_id) REFERENCES public.document_versions(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: ai_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_feedback ai_feedback_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_feedback_insert ON public.ai_feedback FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.can_access_ai_job(job_id)));


--
-- Name: ai_feedback ai_feedback_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_feedback_select ON public.ai_feedback FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: ai_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_jobs ai_jobs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_jobs_select ON public.ai_jobs FOR SELECT TO authenticated USING (private.can_access_ai_job(id));


--
-- Name: ai_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_runs ai_runs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_runs_select ON public.ai_runs FOR SELECT TO authenticated USING (private.can_access_ai_job(job_id));


--
-- Name: audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_events audit_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated USING (( SELECT private.is_platform_admin() AS is_platform_admin));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (( SELECT private.is_platform_admin() AS is_platform_admin));


--
-- Name: business_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

--
-- Name: business_members business_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_members_select ON public.business_members FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: business_missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_missions ENABLE ROW LEVEL SECURITY;

--
-- Name: business_missions business_missions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_missions_insert ON public.business_missions FOR INSERT TO authenticated WITH CHECK (private.business_access(business_id));


--
-- Name: business_missions business_missions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_missions_select ON public.business_missions FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: business_missions business_missions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_missions_update ON public.business_missions FOR UPDATE TO authenticated USING (private.business_access(business_id)) WITH CHECK (private.business_access(business_id));


--
-- Name: business_readiness_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_readiness_state ENABLE ROW LEVEL SECURITY;

--
-- Name: business_readiness_state business_readiness_state_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_readiness_state_select ON public.business_readiness_state FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: businesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

--
-- Name: businesses businesses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY businesses_select ON public.businesses FOR SELECT TO authenticated USING ((private.business_access(id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: category_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: category_templates category_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY category_templates_select ON public.category_templates FOR SELECT TO authenticated USING (is_active);


--
-- Name: coa_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coa_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: coa_accounts coa_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coa_accounts_select ON public.coa_accounts FOR SELECT TO authenticated USING (is_active);


--
-- Name: consent_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_grants consent_grants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consent_grants_select ON public.consent_grants FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ((private.institution_role(institution_id) IS NOT NULL) AND (status = 'active'::text) AND ((expires_at IS NULL) OR (expires_at > now()))) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: counterparties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;

--
-- Name: counterparties counterparties_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparties_select ON public.counterparties FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: daily_closings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_closings daily_closings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closings_delete ON public.daily_closings FOR DELETE TO authenticated USING ((private.business_access(business_id) AND (status = 'draft'::text)));


--
-- Name: daily_closings daily_closings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closings_insert ON public.daily_closings FOR INSERT TO authenticated WITH CHECK (((closed_by = ( SELECT auth.uid() AS uid)) AND private.business_access(business_id)));


--
-- Name: daily_closings daily_closings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closings_select ON public.daily_closings FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: daily_closings daily_closings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_closings_update ON public.daily_closings FOR UPDATE TO authenticated USING (private.business_access(business_id)) WITH CHECK (private.business_access(business_id));


--
-- Name: depreciation_postings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.depreciation_postings ENABLE ROW LEVEL SECURITY;

--
-- Name: depreciation_postings depreciation_postings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY depreciation_postings_select ON public.depreciation_postings FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: discovery_optins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discovery_optins ENABLE ROW LEVEL SECURITY;

--
-- Name: discovery_optins discovery_optins_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_optins_insert ON public.discovery_optins FOR INSERT TO authenticated WITH CHECK ((private.business_access(business_id) AND (opted_in = false)));


--
-- Name: discovery_optins discovery_optins_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_optins_select ON public.discovery_optins FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: discovery_optins discovery_optins_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discovery_optins_update ON public.discovery_optins FOR UPDATE TO authenticated USING (private.business_access(business_id)) WITH CHECK (private.business_access(business_id));


--
-- Name: document_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: document_attachments document_attachments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_attachments_select ON public.document_attachments FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: document_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_extractions document_extractions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_extractions_select ON public.document_extractions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.document_versions version
  WHERE ((version.id = document_extractions.document_version_id) AND private.can_access_document(version.document_id)))));


--
-- Name: document_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: document_reminders document_reminders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_reminders_select ON public.document_reminders FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: document_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: document_requirements document_requirements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_requirements_select ON public.document_requirements FOR SELECT TO authenticated USING (true);


--
-- Name: document_upload_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_upload_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_upload_sessions document_upload_sessions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_upload_sessions_select ON public.document_upload_sessions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND private.business_access(business_id)));


--
-- Name: document_verifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_verifications ENABLE ROW LEVEL SECURITY;

--
-- Name: document_verifications document_verifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_verifications_select ON public.document_verifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.document_versions version
  WHERE ((version.id = document_verifications.document_version_id) AND private.can_access_document(version.document_id)))));


--
-- Name: document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_versions document_versions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_versions_select ON public.document_versions FOR SELECT TO authenticated USING (private.can_access_document(document_id));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated USING ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: documents documents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND private.has_any_business()))));


--
-- Name: documents documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid)) AND private.has_any_business())));


--
-- Name: documents documents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: dossier_access_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_access_events ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_access_events dossier_access_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dossier_access_events_select ON public.dossier_access_events FOR SELECT TO authenticated USING ((private.can_access_dossier(dossier_id) AND (institution_id IN ( SELECT member.institution_id
   FROM public.institution_members member
  WHERE ((member.user_id = ( SELECT auth.uid() AS uid)) AND (member.status = 'active'::text))))));


--
-- Name: dossier_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_api_keys dossier_api_keys_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dossier_api_keys_select ON public.dossier_api_keys FOR SELECT TO authenticated USING (((private.institution_role(institution_id) = 'admin'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: dossier_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_items ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_items dossier_items_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dossier_items_owner_select ON public.dossier_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.dossiers dossier
  WHERE ((dossier.id = dossier_items.dossier_id) AND (private.business_access(dossier.business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin))))));


--
-- Name: dossier_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossier_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: dossier_requests dossier_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dossier_requests_select ON public.dossier_requests FOR SELECT TO authenticated USING ((private.business_access(business_id) OR (private.institution_role(institution_id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: dossiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;

--
-- Name: dossiers dossiers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dossiers_select ON public.dossiers FOR SELECT TO authenticated USING ((private.business_access(business_id) OR (private.institution_role(institution_id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: fixed_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: fixed_assets fixed_assets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fixed_assets_select ON public.fixed_assets FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: indicator_monthly; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.indicator_monthly ENABLE ROW LEVEL SECURITY;

--
-- Name: indicator_monthly indicator_monthly_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY indicator_monthly_select ON public.indicator_monthly FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: institution_entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_entitlements institution_entitlements_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_entitlements_admin_update ON public.institution_entitlements FOR UPDATE TO authenticated USING (((private.institution_role(institution_id) = 'admin'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin))) WITH CHECK (((private.institution_role(institution_id) = 'admin'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: institution_entitlements institution_entitlements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_entitlements_select ON public.institution_entitlements FOR SELECT TO authenticated USING (((private.institution_role(institution_id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: institution_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_members ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_members institution_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_members_delete ON public.institution_members FOR DELETE TO authenticated USING (((private.institution_role(institution_id) = 'admin'::text) AND (role <> 'admin'::text)));


--
-- Name: institution_members institution_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_members_insert ON public.institution_members FOR INSERT TO authenticated WITH CHECK (((private.institution_role(institution_id) = 'admin'::text) AND (role = 'viewer'::text)));


--
-- Name: institution_members institution_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_members_select ON public.institution_members FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (private.institution_role(institution_id) = 'admin'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: institution_members institution_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_members_update ON public.institution_members FOR UPDATE TO authenticated USING (((private.institution_role(institution_id) = 'admin'::text) AND (role <> 'admin'::text))) WITH CHECK (((private.institution_role(institution_id) = 'admin'::text) AND (role <> 'admin'::text)));


--
-- Name: institution_shortlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_shortlists ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_shortlists institution_shortlists_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_shortlists_delete ON public.institution_shortlists FOR DELETE TO authenticated USING (((private.institution_role(institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text])) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: institution_shortlists institution_shortlists_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_shortlists_insert ON public.institution_shortlists FOR INSERT TO authenticated WITH CHECK (((private.institution_role(institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text])) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: institution_shortlists institution_shortlists_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_shortlists_select ON public.institution_shortlists FOR SELECT TO authenticated USING (((private.institution_role(institution_id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: institution_shortlists institution_shortlists_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_shortlists_update ON public.institution_shortlists FOR UPDATE TO authenticated USING (((private.institution_role(institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text])) AND (created_by = ( SELECT auth.uid() AS uid)))) WITH CHECK (((private.institution_role(institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text])) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: institution_view_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_view_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: institution_view_logs institution_view_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institution_view_logs_select ON public.institution_view_logs FOR SELECT TO authenticated USING (((private.institution_role(institution_id) IS NOT NULL) OR private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: institutions institutions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY institutions_select ON public.institutions FOR SELECT TO authenticated USING (((private.institution_role(id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: inventory_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_counts inventory_counts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_counts_select ON public.inventory_counts FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries journal_entries_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_entries_select ON public.journal_entries FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: journal_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_lines journal_lines_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_lines_select ON public.journal_lines FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: loans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

--
-- Name: loans loans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loans_select ON public.loans FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: migration_verification_results migration_results_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY migration_results_select ON public.migration_verification_results FOR SELECT TO authenticated USING (( SELECT private.is_platform_admin() AS is_platform_admin));


--
-- Name: migration_verification_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_verification_results ENABLE ROW LEVEL SECURITY;

--
-- Name: missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

--
-- Name: missions missions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY missions_select ON public.missions FOR SELECT TO authenticated USING (((status = 'active'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: mitra; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mitra ENABLE ROW LEVEL SECURITY;

--
-- Name: mitra mitra_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mitra_select ON public.mitra FOR SELECT TO authenticated USING ((active OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: opening_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opening_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: opening_balances opening_balances_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opening_balances_select ON public.opening_balances FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins platform_admins_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_admins_select ON public.platform_admins FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (COALESCE(auth_user_id, id) = ( SELECT auth.uid() AS uid))));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (((COALESCE(auth_user_id, id) = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING ((COALESCE(auth_user_id, id) = ( SELECT auth.uid() AS uid))) WITH CHECK ((COALESCE(auth_user_id, id) = ( SELECT auth.uid() AS uid)));


--
-- Name: program_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: program_enrollments program_enrollments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_enrollments_delete ON public.program_enrollments FOR DELETE TO authenticated USING ((private.business_access(business_id) AND (status = ANY (ARRAY['applied'::text, 'withdrawn'::text]))));


--
-- Name: program_enrollments program_enrollments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_enrollments_insert ON public.program_enrollments FOR INSERT TO authenticated WITH CHECK ((private.business_access(business_id) AND (applied_by = ( SELECT auth.uid() AS uid))));


--
-- Name: program_enrollments program_enrollments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_enrollments_select ON public.program_enrollments FOR SELECT TO authenticated USING ((private.business_access(business_id) OR (EXISTS ( SELECT 1
   FROM public.programs program
  WHERE ((program.id = program_enrollments.program_id) AND (private.institution_role(program.institution_id) IS NOT NULL)))) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: program_enrollments program_enrollments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY program_enrollments_update ON public.program_enrollments FOR UPDATE TO authenticated USING ((private.business_access(business_id) OR (EXISTS ( SELECT 1
   FROM public.programs program
  WHERE ((program.id = program_enrollments.program_id) AND (private.institution_role(program.institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text]))))))) WITH CHECK ((private.business_access(business_id) OR (EXISTS ( SELECT 1
   FROM public.programs program
  WHERE ((program.id = program_enrollments.program_id) AND (private.institution_role(program.institution_id) = ANY (ARRAY['admin'::text, 'analyst'::text, 'reviewer'::text])))))));


--
-- Name: programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

--
-- Name: programs programs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_delete ON public.programs FOR DELETE TO authenticated USING (((private.institution_role(institution_id) = 'admin'::text) AND (status = 'draft'::text)));


--
-- Name: programs programs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_insert ON public.programs FOR INSERT TO authenticated WITH CHECK (((private.institution_role(institution_id) = 'admin'::text) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: programs programs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_select ON public.programs FOR SELECT TO authenticated USING (((status = 'active'::text) OR (private.institution_role(institution_id) IS NOT NULL) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: programs programs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_update ON public.programs FOR UPDATE TO authenticated USING ((private.institution_role(institution_id) = 'admin'::text)) WITH CHECK ((private.institution_role(institution_id) = 'admin'::text));


--
-- Name: readiness_analyses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_analyses ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_analyses readiness_analyses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readiness_analyses_select ON public.readiness_analyses FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((business_id IS NOT NULL) AND private.business_access(business_id)) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: readiness_score_components readiness_components_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readiness_components_select ON public.readiness_score_components FOR SELECT TO authenticated USING (private.can_access_snapshot(snapshot_id));


--
-- Name: readiness_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_daily readiness_daily_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readiness_daily_select ON public.readiness_daily FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: readiness_rule_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_rule_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_rule_sets readiness_rule_sets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readiness_rule_sets_select ON public.readiness_rule_sets FOR SELECT TO authenticated USING (((status = 'published'::text) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: readiness_score_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_score_components ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_score_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.readiness_score_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: readiness_score_snapshots readiness_snapshots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY readiness_snapshots_select ON public.readiness_score_snapshots FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: report_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_issues ENABLE ROW LEVEL SECURITY;

--
-- Name: report_issues report_issues_institution_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_issues_institution_select ON public.report_issues FOR SELECT TO authenticated USING (((audience = 'institution'::text) AND (institution_id IS NOT NULL) AND (private.institution_role(institution_id) IS NOT NULL)));


--
-- Name: report_issues report_issues_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_issues_select ON public.report_issues FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: rules_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rules_config ENABLE ROW LEVEL SECURITY;

--
-- Name: rules_config rules_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rules_config_select ON public.rules_config FOR SELECT TO authenticated USING (( SELECT private.is_platform_admin() AS is_platform_admin));


--
-- Name: tax_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_estimates tax_estimates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_estimates_select ON public.tax_estimates FOR SELECT TO authenticated USING (private.accounting_business_access(business_id));


--
-- Name: transaction_captures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_captures ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_captures transaction_captures_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_captures_delete ON public.transaction_captures FOR DELETE TO authenticated USING (((status = 'draft'::text) AND private.business_access(business_id)));


--
-- Name: transaction_captures transaction_captures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_captures_insert ON public.transaction_captures FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND private.business_access(business_id)));


--
-- Name: transaction_captures transaction_captures_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_captures_select ON public.transaction_captures FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: transaction_captures transaction_captures_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_captures_update ON public.transaction_captures FOR UPDATE TO authenticated USING (private.business_access(business_id)) WITH CHECK (private.business_access(business_id));


--
-- Name: transaction_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_changes transaction_changes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transaction_changes_select ON public.transaction_changes FOR SELECT TO authenticated USING ((private.business_access(business_id) OR ( SELECT private.is_platform_admin() AS is_platform_admin)));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_delete ON public.transactions FOR DELETE TO authenticated USING ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: transactions transactions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_insert ON public.transactions FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND private.has_any_business()))));


--
-- Name: transactions transactions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_select ON public.transactions FOR SELECT TO authenticated USING ((( SELECT private.is_platform_admin() AS is_platform_admin) OR ((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid)) AND private.has_any_business())));


--
-- Name: transactions transactions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transactions_update ON public.transactions FOR UPDATE TO authenticated USING ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid)) AND private.has_any_business()))) WITH CHECK ((((business_id IS NOT NULL) AND private.business_access(business_id)) OR ((business_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid)) AND private.has_any_business())));


--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accounting_business_access(p_business_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.accounting_business_access(p_business_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.accounting_business_access(p_business_id uuid) TO authenticated;


--
-- Name: FUNCTION assert_opening_payload(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_inventory_idr bigint, p_receivables jsonb, p_payables jsonb, p_assets jsonb, p_notes text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.assert_opening_payload(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_inventory_idr bigint, p_receivables jsonb, p_payables jsonb, p_assets jsonb, p_notes text) FROM PUBLIC;


--
-- Name: FUNCTION business_access(p_business_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.business_access(p_business_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.business_access(p_business_id uuid) TO authenticated;


--
-- Name: FUNCTION can_access_ai_job(target_job_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.can_access_ai_job(target_job_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.can_access_ai_job(target_job_id uuid) TO authenticated;


--
-- Name: FUNCTION can_access_document(target_document_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.can_access_document(target_document_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.can_access_document(target_document_id uuid) TO authenticated;


--
-- Name: FUNCTION can_access_dossier(target_dossier_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.can_access_dossier(target_dossier_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.can_access_dossier(target_dossier_id uuid) TO authenticated;


--
-- Name: FUNCTION can_access_snapshot(target_snapshot_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.can_access_snapshot(target_snapshot_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.can_access_snapshot(target_snapshot_id uuid) TO authenticated;


--
-- Name: FUNCTION default_useful_life_months(p_category text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.default_useful_life_months(p_category text) FROM PUBLIC;


--
-- Name: FUNCTION emkm_category_from_legacy(p_direction text, p_category_group text, p_category_code text, OUT o_category_code smallint, OUT o_subtype text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.emkm_category_from_legacy(p_direction text, p_category_group text, p_category_code text, OUT o_category_code smallint, OUT o_subtype text) FROM PUBLIC;


--
-- Name: FUNCTION emkm_sector_for_business(p_business_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.emkm_sector_for_business(p_business_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION emkm_sector_from_answer(p_answer text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.emkm_sector_from_answer(p_answer text) FROM PUBLIC;


--
-- Name: FUNCTION fixed_asset_threshold_idr(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.fixed_asset_threshold_idr() FROM PUBLIC;


--
-- Name: FUNCTION gross_revenue_between(p_business_id uuid, p_from date, p_to date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.gross_revenue_between(p_business_id uuid, p_from date, p_to date) FROM PUBLIC;


--
-- Name: FUNCTION guess_asset_category(p_name text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.guess_asset_category(p_name text) FROM PUBLIC;


--
-- Name: FUNCTION has_active_consent(target_institution_id uuid, target_business_id uuid, required_scopes text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.has_active_consent(target_institution_id uuid, target_business_id uuid, required_scopes text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.has_active_consent(target_institution_id uuid, target_business_id uuid, required_scopes text[]) TO authenticated;


--
-- Name: FUNCTION has_any_business(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.has_any_business() FROM PUBLIC;
GRANT ALL ON FUNCTION private.has_any_business() TO authenticated;


--
-- Name: FUNCTION indicator_formula_version(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.indicator_formula_version() FROM PUBLIC;


--
-- Name: FUNCTION institution_role(target_institution_id uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.institution_role(target_institution_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.institution_role(target_institution_id uuid) TO authenticated;


--
-- Name: FUNCTION is_platform_admin(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION private.is_platform_admin() TO authenticated;


--
-- Name: FUNCTION legacy_category_for_emkm(p_category_code smallint, p_subtype text, OUT o_group text, OUT o_code text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.legacy_category_for_emkm(p_category_code smallint, p_subtype text, OUT o_group text, OUT o_code text) FROM PUBLIC;


--
-- Name: FUNCTION normalize_emkm_category(INOUT p_category_code smallint, INOUT p_subtype text, INOUT p_payment_method text, OUT o_direction text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.normalize_emkm_category(INOUT p_category_code smallint, INOUT p_subtype text, INOUT p_payment_method text, OUT o_direction text) FROM PUBLIC;


--
-- Name: FUNCTION post_depreciation_through(p_business_id uuid, p_as_of date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.post_depreciation_through(p_business_id uuid, p_as_of date) FROM PUBLIC;


--
-- Name: FUNCTION post_monthly_depreciation(p_business_id uuid, p_period_month date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.post_monthly_depreciation(p_business_id uuid, p_period_month date) FROM PUBLIC;


--
-- Name: FUNCTION post_monthly_tax_estimate(p_business_id uuid, p_period_month date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.post_monthly_tax_estimate(p_business_id uuid, p_period_month date) FROM PUBLIC;


--
-- Name: FUNCTION post_tax_estimates_through(p_business_id uuid, p_as_of date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.post_tax_estimates_through(p_business_id uuid, p_as_of date) FROM PUBLIC;


--
-- Name: FUNCTION pph_final_exempt_idr(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.pph_final_exempt_idr() FROM PUBLIC;


--
-- Name: FUNCTION pph_final_rate(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.pph_final_rate() FROM PUBLIC;


--
-- Name: FUNCTION purge_deleted_accounts(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.purge_deleted_accounts() FROM PUBLIC;


--
-- Name: FUNCTION rebuild_indicator_month(p_business_id uuid, p_period_month date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.rebuild_indicator_month(p_business_id uuid, p_period_month date) FROM PUBLIC;


--
-- Name: FUNCTION rebuild_indicators_through(p_business_id uuid, p_as_of date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.rebuild_indicators_through(p_business_id uuid, p_as_of date) FROM PUBLIC;


--
-- Name: FUNCTION rebuild_opening_balance(p_opening_id uuid, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text, p_user_id uuid, p_carry_payments boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.rebuild_opening_balance(p_opening_id uuid, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text, p_user_id uuid, p_carry_payments boolean) FROM PUBLIC;


--
-- Name: FUNCTION reset_depreciation_from(p_business_id uuid, p_from_month date, p_reason text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.reset_depreciation_from(p_business_id uuid, p_from_month date, p_reason text) FROM PUBLIC;


--
-- Name: FUNCTION resolve_account_rule(p_rule text, p_payment_method text, p_counterparty_type text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.resolve_account_rule(p_rule text, p_payment_method text, p_counterparty_type text) FROM PUBLIC;


--
-- Name: FUNCTION reverse_journal_entry_on(p_entry_id uuid, p_reason text, p_entry_date date); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.reverse_journal_entry_on(p_entry_id uuid, p_reason text, p_entry_date date) FROM PUBLIC;


--
-- Name: FUNCTION unwind_transaction_side_effects(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.unwind_transaction_side_effects() FROM PUBLIC;


--
-- Name: FUNCTION access_verified_business_profile(p_dossier_id uuid, p_resource_scope text, p_action text, p_ip_hash text, p_user_agent_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.access_verified_business_profile(p_dossier_id uuid, p_resource_scope text, p_action text, p_ip_hash text, p_user_agent_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.access_verified_business_profile(p_dossier_id uuid, p_resource_scope text, p_action text, p_ip_hash text, p_user_agent_hash text) TO authenticated;


--
-- Name: FUNCTION archive_document(p_document_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.archive_document(p_document_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.archive_document(p_document_id uuid) TO authenticated;


--
-- Name: FUNCTION attach_document(p_document_id uuid, p_target_type text, p_target_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.attach_document(p_document_id uuid, p_target_type text, p_target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.attach_document(p_document_id uuid, p_target_type text, p_target_id uuid) TO authenticated;


--
-- Name: FUNCTION cancel_account_deletion(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_account_deletion() TO authenticated;


--
-- Name: FUNCTION cancel_ledger_transaction(p_transaction_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_ledger_transaction(p_transaction_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_ledger_transaction(p_transaction_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION cancel_transaction(p_transaction_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_transaction(p_transaction_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_transaction(p_transaction_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION cancel_transaction_capture(p_capture_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_transaction_capture(p_capture_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_transaction_capture(p_capture_id uuid) TO authenticated;


--
-- Name: FUNCTION claim_capture_ai_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_capture_ai_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_capture_ai_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) TO service_role;


--
-- Name: FUNCTION claim_document_extraction_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_document_extraction_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_document_extraction_job(p_job_id uuid, p_worker_id text, p_provider text, p_model text) TO service_role;


--
-- Name: FUNCTION close_ledger_day(p_closing_date date, p_opening_cash_idr bigint, p_physical_cash_idr bigint, p_note text, p_physical_bank_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.close_ledger_day(p_closing_date date, p_opening_cash_idr bigint, p_physical_cash_idr bigint, p_note text, p_physical_bank_idr bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_ledger_day(p_closing_date date, p_opening_cash_idr bigint, p_physical_cash_idr bigint, p_note text, p_physical_bank_idr bigint) TO authenticated;


--
-- Name: FUNCTION complete_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_transcription text, p_draft_payload jsonb, p_latency_ms integer, p_prompt_tokens integer, p_completion_tokens integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_transcription text, p_draft_payload jsonb, p_latency_ms integer, p_prompt_tokens integer, p_completion_tokens integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_transcription text, p_draft_payload jsonb, p_latency_ms integer, p_prompt_tokens integer, p_completion_tokens integer) TO service_role;


--
-- Name: FUNCTION complete_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_extractor text, p_structured_data jsonb, p_latency_ms integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_extractor text, p_structured_data jsonb, p_latency_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_extractor text, p_structured_data jsonb, p_latency_ms integer) TO service_role;


--
-- Name: FUNCTION complete_document_upload_session(p_document_id uuid, p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_document_upload_session(p_document_id uuid, p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_document_upload_session(p_document_id uuid, p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION confirm_document_extraction(p_document_id uuid, p_document_version_id uuid, p_confirmed_data jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_document_extraction(p_document_id uuid, p_document_version_id uuid, p_confirmed_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_document_extraction(p_document_id uuid, p_document_version_id uuid, p_confirmed_data jsonb) TO authenticated;


--
-- Name: FUNCTION confirm_transaction_capture(p_capture_id uuid, p_confirmation_idempotency_key text, p_items jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirm_transaction_capture(p_capture_id uuid, p_confirmation_idempotency_key text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_transaction_capture(p_capture_id uuid, p_confirmation_idempotency_key text, p_items jsonb) TO authenticated;


--
-- Name: FUNCTION correct_opening_balances(p_reason text, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.correct_opening_balances(p_reason text, p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_idr bigint, p_assets jsonb, p_notes text) FROM PUBLIC;


--
-- Name: FUNCTION create_document_upload_session(p_idempotency_key text, p_doc_type text, p_original_name text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_business_id uuid, p_document_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_document_upload_session(p_idempotency_key text, p_doc_type text, p_original_name text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_business_id uuid, p_document_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_document_upload_session(p_idempotency_key text, p_doc_type text, p_original_name text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_business_id uuid, p_document_id uuid) TO authenticated;


--
-- Name: FUNCTION create_dossier_request(p_business_id uuid, p_program_id uuid, p_purpose_code text, p_purpose_description text, p_requested_scopes text[], p_required_scopes text[], p_requested_duration_days integer, p_download_requested boolean, p_idempotency_key text, p_institution_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_dossier_request(p_business_id uuid, p_program_id uuid, p_purpose_code text, p_purpose_description text, p_requested_scopes text[], p_required_scopes text[], p_requested_duration_days integer, p_download_requested boolean, p_idempotency_key text, p_institution_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_dossier_request(p_business_id uuid, p_program_id uuid, p_purpose_code text, p_purpose_description text, p_requested_scopes text[], p_required_scopes text[], p_requested_duration_days integer, p_download_requested boolean, p_idempotency_key text, p_institution_id uuid) TO authenticated;


--
-- Name: FUNCTION create_ledger_transaction(p_idempotency_key text, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_ledger_transaction(p_idempotency_key text, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_ledger_transaction(p_idempotency_key text, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) TO authenticated;


--
-- Name: FUNCTION create_transaction_capture(p_idempotency_key text, p_input_method text, p_business_id uuid, p_source_text text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_capture_path text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_transaction_capture(p_idempotency_key text, p_input_method text, p_business_id uuid, p_source_text text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_capture_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_transaction_capture(p_idempotency_key text, p_input_method text, p_business_id uuid, p_source_text text, p_mime_type text, p_file_size bigint, p_checksum_sha256 text, p_capture_path text) TO authenticated;


--
-- Name: FUNCTION detach_document(p_attachment_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.detach_document(p_attachment_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.detach_document(p_attachment_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION dispose_fixed_asset(p_asset_id uuid, p_disposed_on date, p_proceeds_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_disposed_on date, p_proceeds_idr bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_disposed_on date, p_proceeds_idr bigint) TO authenticated;


--
-- Name: FUNCTION ensure_depreciation_posted(p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_depreciation_posted(p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_depreciation_posted(p_as_of date) TO authenticated;


--
-- Name: FUNCTION ensure_indicators_rebuilt(p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_indicators_rebuilt(p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_indicators_rebuilt(p_as_of date) TO authenticated;


--
-- Name: FUNCTION ensure_tax_estimated(p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_tax_estimated(p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_tax_estimated(p_as_of date) TO authenticated;


--
-- Name: FUNCTION exchange_dossier_api_key(p_key_hash text, p_scope text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.exchange_dossier_api_key(p_key_hash text, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.exchange_dossier_api_key(p_key_hash text, p_scope text) TO authenticated;
GRANT ALL ON FUNCTION public.exchange_dossier_api_key(p_key_hash text, p_scope text) TO anon;


--
-- Name: FUNCTION fail_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer, p_retry_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fail_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer, p_retry_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fail_capture_ai_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer, p_retry_reason text) TO service_role;


--
-- Name: FUNCTION fail_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fail_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fail_document_extraction_job(p_job_id uuid, p_attempt_number integer, p_failure_code text, p_failure_message text, p_retryable boolean, p_latency_ms integer) TO service_role;


--
-- Name: FUNCTION fn_balance_sheet(p_business_id uuid, p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_balance_sheet(p_business_id uuid, p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_balance_sheet(p_business_id uuid, p_as_of date) TO authenticated;


--
-- Name: FUNCTION fn_cash_flow(p_business_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_cash_flow(p_business_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_cash_flow(p_business_id uuid, p_date_from date, p_date_to date) TO authenticated;


--
-- Name: FUNCTION fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date) TO authenticated;


--
-- Name: FUNCTION fn_indicator_monthly(p_business_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_indicator_monthly(p_business_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_indicator_monthly(p_business_id uuid, p_date_from date, p_date_to date) TO authenticated;


--
-- Name: FUNCTION fn_notes_data(p_business_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_notes_data(p_business_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_notes_data(p_business_id uuid, p_date_from date, p_date_to date) TO authenticated;


--
-- Name: FUNCTION fn_pending_reminders(p_business_id uuid, p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_pending_reminders(p_business_id uuid, p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_pending_reminders(p_business_id uuid, p_as_of date) TO authenticated;


--
-- Name: FUNCTION fn_post_transaction_journal(p_transaction_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_post_transaction_journal(p_transaction_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION fn_readiness_facts(p_as_of date, p_habit_days integer, p_quality_days integer, p_evidence_days integer, p_big_spend_idr bigint, p_full_month_lookback integer, p_full_month_min_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_readiness_facts(p_as_of date, p_habit_days integer, p_quality_days integer, p_evidence_days integer, p_big_spend_idr bigint, p_full_month_lookback integer, p_full_month_min_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_readiness_facts(p_as_of date, p_habit_days integer, p_quality_days integer, p_evidence_days integer, p_big_spend_idr bigint, p_full_month_lookback integer, p_full_month_min_days integer) TO authenticated;


--
-- Name: FUNCTION fn_reverse_journal_entry(p_entry_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_reverse_journal_entry(p_entry_id uuid, p_reason text) FROM PUBLIC;


--
-- Name: FUNCTION fn_tax_estimate(p_business_id uuid, p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_tax_estimate(p_business_id uuid, p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_tax_estimate(p_business_id uuid, p_as_of date) TO authenticated;


--
-- Name: FUNCTION fn_trial_balance(p_business_id uuid, p_as_of date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_trial_balance(p_business_id uuid, p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_trial_balance(p_business_id uuid, p_as_of date) TO authenticated;


--
-- Name: FUNCTION fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date) TO authenticated;


--
-- Name: FUNCTION get_my_discovery_optin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_discovery_optin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_discovery_optin() TO authenticated;


--
-- Name: FUNCTION get_my_institution_shortlist(p_institution_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_institution_shortlist(p_institution_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_institution_shortlist(p_institution_id uuid) TO authenticated;


--
-- Name: FUNCTION join_program_by_code(p_join_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_program_by_code(p_join_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_program_by_code(p_join_code text) TO authenticated;


--
-- Name: FUNCTION list_anonymous_business_candidates(p_program_id uuid, p_institution_id uuid, p_sector text, p_region text, p_min_level text, p_age_band text, p_legal_complete boolean, p_sort text, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_anonymous_business_candidates(p_program_id uuid, p_institution_id uuid, p_sector text, p_region text, p_min_level text, p_age_band text, p_legal_complete boolean, p_sort text, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_anonymous_business_candidates(p_program_id uuid, p_institution_id uuid, p_sector text, p_region text, p_min_level text, p_age_band text, p_legal_complete boolean, p_sort text, p_limit integer, p_offset integer) TO authenticated;


--
-- Name: FUNCTION list_my_institutions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_my_institutions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_my_institutions() TO authenticated;


--
-- Name: FUNCTION log_institution_view(p_institution_id uuid, p_artifact text, p_business_id uuid, p_artifact_id uuid, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_institution_view(p_institution_id uuid, p_artifact text, p_business_id uuid, p_artifact_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_institution_view(p_institution_id uuid, p_artifact text, p_business_id uuid, p_artifact_id uuid, p_action text) TO authenticated;


--
-- Name: FUNCTION program_dashboard(p_program_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.program_dashboard(p_program_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.program_dashboard(p_program_id uuid) TO authenticated;


--
-- Name: FUNCTION protect_business_membership_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_business_membership_authority() FROM PUBLIC;


--
-- Name: FUNCTION protect_consent_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_consent_authority() FROM PUBLIC;


--
-- Name: FUNCTION protect_institution_membership_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_institution_membership_authority() FROM PUBLIC;


--
-- Name: FUNCTION protect_profile_authority(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_profile_authority() FROM PUBLIC;


--
-- Name: FUNCTION recalculate_my_readiness(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recalculate_my_readiness() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recalculate_my_readiness() TO authenticated;


--
-- Name: FUNCTION record_document_ocr_consent(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_document_ocr_consent(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_document_ocr_consent(p_session_id uuid) TO authenticated;


--
-- Name: FUNCTION record_institution_report_issue(p_business_id uuid, p_institution_id uuid, p_dossier_id uuid, p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_formula_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_institution_report_issue(p_business_id uuid, p_institution_id uuid, p_dossier_id uuid, p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_formula_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_institution_report_issue(p_business_id uuid, p_institution_id uuid, p_dossier_id uuid, p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_formula_version text) TO authenticated;


--
-- Name: FUNCTION record_report_issue(p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_audience text, p_institution_id uuid, p_formula_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_report_issue(p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_audience text, p_institution_id uuid, p_formula_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_report_issue(p_document_id uuid, p_document_uid text, p_report_kind text, p_storage_path text, p_file_size bigint, p_checksum_sha256 text, p_name text, p_period_from date, p_period_to date, p_audience text, p_institution_id uuid, p_formula_version text) TO authenticated;


--
-- Name: FUNCTION register_fixed_asset(p_name text, p_cost_idr bigint, p_acquired_on date, p_category text, p_useful_life_months integer, p_salvage_value_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_fixed_asset(p_name text, p_cost_idr bigint, p_acquired_on date, p_category text, p_useful_life_months integer, p_salvage_value_idr bigint) FROM PUBLIC;


--
-- Name: FUNCTION register_loan(p_lender_name text, p_principal_idr bigint, p_started_on date, p_lender_type text, p_outstanding_idr bigint, p_monthly_installment_idr bigint, p_annual_rate numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.register_loan(p_lender_name text, p_principal_idr bigint, p_started_on date, p_lender_type text, p_outstanding_idr bigint, p_monthly_installment_idr bigint, p_annual_rate numeric) FROM PUBLIC;


--
-- Name: FUNCTION reject_document_upload_session(p_session_id uuid, p_rejection_code text, p_rejection_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reject_document_upload_session(p_session_id uuid, p_rejection_code text, p_rejection_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_document_upload_session(p_session_id uuid, p_rejection_code text, p_rejection_reason text) TO service_role;


--
-- Name: FUNCTION request_account_deletion(p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_account_deletion(p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_account_deletion(p_reason text) TO authenticated;


--
-- Name: FUNCTION resolve_anonymous_candidate_code(p_candidate_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_anonymous_candidate_code(p_candidate_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_anonymous_candidate_code(p_candidate_code text) TO authenticated;


--
-- Name: FUNCTION resolve_my_institution_id(p_institution_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_my_institution_id(p_institution_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_my_institution_id(p_institution_id uuid) TO authenticated;


--
-- Name: FUNCTION respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[], p_download_allowed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[], p_download_allowed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_to_dossier_request(p_request_id uuid, p_decision text, p_approved_scopes text[], p_download_allowed boolean) TO authenticated;


--
-- Name: FUNCTION retry_document_extraction(p_document_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retry_document_extraction(p_document_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retry_document_extraction(p_document_id uuid) TO authenticated;


--
-- Name: FUNCTION revoke_consent_grant(p_grant_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_consent_grant(p_grant_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_consent_grant(p_grant_id uuid, p_reason text) TO authenticated;


--
-- Name: FUNCTION save_inventory_count(p_period_month date, p_counted_value_idr bigint, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_inventory_count(p_period_month date, p_counted_value_idr bigint, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_inventory_count(p_period_month date, p_counted_value_idr bigint, p_notes text) TO authenticated;


--
-- Name: FUNCTION save_opening_balances(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_details jsonb, p_assets jsonb, p_notes text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_opening_balances(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_details jsonb, p_assets jsonb, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_opening_balances(p_start_date date, p_cash_idr bigint, p_bank_idr bigint, p_receivables jsonb, p_payables jsonb, p_inventory_details jsonb, p_assets jsonb, p_notes text) TO authenticated;


--
-- Name: FUNCTION save_readiness_snapshot(p_level text, p_components jsonb, p_formula_version text, p_snapshot_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_readiness_snapshot(p_level text, p_components jsonb, p_formula_version text, p_snapshot_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_readiness_snapshot(p_level text, p_components jsonb, p_formula_version text, p_snapshot_date date) TO authenticated;


--
-- Name: FUNCTION schedule_capture_processing(p_capture_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.schedule_capture_processing(p_capture_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.schedule_capture_processing(p_capture_id uuid) TO authenticated;


--
-- Name: FUNCTION set_my_discovery_optin(p_opted_in boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_my_discovery_optin(p_opted_in boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_my_discovery_optin(p_opted_in boolean) TO authenticated;


--
-- Name: FUNCTION set_transaction_category(p_transaction_id uuid, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_transaction_category(p_transaction_id uuid, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_transaction_category(p_transaction_id uuid, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) TO authenticated;


--
-- Name: FUNCTION toggle_my_institution_shortlist(p_candidate_code text, p_institution_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.toggle_my_institution_shortlist(p_candidate_code text, p_institution_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_my_institution_shortlist(p_candidate_code text, p_institution_id uuid) TO authenticated;


--
-- Name: FUNCTION update_fixed_asset(p_asset_id uuid, p_name text, p_category text, p_useful_life_months integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_fixed_asset(p_asset_id uuid, p_name text, p_category text, p_useful_life_months integer) FROM PUBLIC;


--
-- Name: FUNCTION update_ledger_transaction(p_transaction_id uuid, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_reason text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_ledger_transaction(p_transaction_id uuid, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_reason text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_ledger_transaction(p_transaction_id uuid, p_transaction_type text, p_amount_idr bigint, p_transaction_date date, p_category_group text, p_category_code text, p_description text, p_reason text, p_quantity numeric, p_unit text, p_unit_price_idr bigint, p_payment_method text, p_sales_channel text, p_counterparty text, p_emkm_category_code smallint, p_emkm_category_subtype text, p_counterparty_id uuid, p_interest_amount_idr bigint) TO authenticated;


--
-- Name: FUNCTION update_loan(p_loan_id uuid, p_lender_name text, p_monthly_installment_idr bigint, p_annual_rate numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_loan(p_loan_id uuid, p_lender_name text, p_monthly_installment_idr bigint, p_annual_rate numeric) FROM PUBLIC;


--
-- Name: FUNCTION upsert_counterparty(p_name text, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.upsert_counterparty(p_name text, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_counterparty(p_name text, p_type text) TO authenticated;


--
-- Name: TABLE ai_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.ai_feedback TO authenticated;
GRANT ALL ON TABLE public.ai_feedback TO service_role;


--
-- Name: TABLE ai_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.ai_jobs TO authenticated;
GRANT ALL ON TABLE public.ai_jobs TO service_role;


--
-- Name: TABLE ai_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.ai_runs TO authenticated;
GRANT ALL ON TABLE public.ai_runs TO service_role;


--
-- Name: TABLE audit_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.audit_events TO authenticated;
GRANT ALL ON TABLE public.audit_events TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE business_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.business_members TO authenticated;
GRANT ALL ON TABLE public.business_members TO service_role;


--
-- Name: TABLE business_missions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.business_missions TO authenticated;
GRANT ALL ON TABLE public.business_missions TO service_role;


--
-- Name: TABLE business_readiness_state; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.business_readiness_state TO authenticated;
GRANT ALL ON TABLE public.business_readiness_state TO service_role;


--
-- Name: TABLE businesses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.businesses TO authenticated;
GRANT ALL ON TABLE public.businesses TO service_role;


--
-- Name: TABLE category_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.category_templates TO authenticated;
GRANT ALL ON TABLE public.category_templates TO service_role;


--
-- Name: TABLE coa_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.coa_accounts TO authenticated;
GRANT ALL ON TABLE public.coa_accounts TO service_role;


--
-- Name: TABLE consent_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.consent_grants TO authenticated;
GRANT ALL ON TABLE public.consent_grants TO service_role;


--
-- Name: TABLE counterparties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.counterparties TO authenticated;
GRANT ALL ON TABLE public.counterparties TO service_role;


--
-- Name: TABLE daily_closings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.daily_closings TO authenticated;
GRANT ALL ON TABLE public.daily_closings TO service_role;


--
-- Name: TABLE depreciation_postings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.depreciation_postings TO authenticated;
GRANT ALL ON TABLE public.depreciation_postings TO service_role;


--
-- Name: TABLE discovery_optins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.discovery_optins TO service_role;
GRANT SELECT ON TABLE public.discovery_optins TO authenticated;


--
-- Name: TABLE document_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_attachments TO authenticated;
GRANT ALL ON TABLE public.document_attachments TO service_role;


--
-- Name: TABLE document_extractions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_extractions TO authenticated;
GRANT ALL ON TABLE public.document_extractions TO service_role;


--
-- Name: TABLE document_reminders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_reminders TO authenticated;
GRANT ALL ON TABLE public.document_reminders TO service_role;


--
-- Name: TABLE document_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_requirements TO authenticated;
GRANT ALL ON TABLE public.document_requirements TO service_role;


--
-- Name: TABLE document_upload_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_upload_sessions TO authenticated;
GRANT ALL ON TABLE public.document_upload_sessions TO service_role;


--
-- Name: TABLE document_verifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_verifications TO authenticated;
GRANT ALL ON TABLE public.document_verifications TO service_role;


--
-- Name: TABLE document_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.document_versions TO authenticated;
GRANT ALL ON TABLE public.document_versions TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE dossier_access_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.dossier_access_events TO authenticated;
GRANT ALL ON TABLE public.dossier_access_events TO service_role;


--
-- Name: TABLE dossier_api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.dossier_api_keys TO authenticated;
GRANT ALL ON TABLE public.dossier_api_keys TO service_role;


--
-- Name: TABLE dossier_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dossier_items TO service_role;


--
-- Name: TABLE dossier_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.dossier_requests TO authenticated;
GRANT ALL ON TABLE public.dossier_requests TO service_role;


--
-- Name: TABLE dossiers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.dossiers TO authenticated;
GRANT ALL ON TABLE public.dossiers TO service_role;


--
-- Name: TABLE fixed_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.fixed_assets TO authenticated;
GRANT ALL ON TABLE public.fixed_assets TO service_role;


--
-- Name: TABLE indicator_monthly; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.indicator_monthly TO authenticated;
GRANT ALL ON TABLE public.indicator_monthly TO service_role;


--
-- Name: TABLE institution_entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.institution_entitlements TO authenticated;
GRANT ALL ON TABLE public.institution_entitlements TO service_role;


--
-- Name: TABLE institution_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.institution_members TO authenticated;
GRANT ALL ON TABLE public.institution_members TO service_role;


--
-- Name: TABLE institution_shortlists; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.institution_shortlists TO authenticated;
GRANT ALL ON TABLE public.institution_shortlists TO service_role;


--
-- Name: TABLE institution_view_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.institution_view_logs TO authenticated;
GRANT ALL ON TABLE public.institution_view_logs TO service_role;


--
-- Name: TABLE institutions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.institutions TO authenticated;
GRANT ALL ON TABLE public.institutions TO service_role;


--
-- Name: TABLE inventory_counts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.inventory_counts TO authenticated;
GRANT ALL ON TABLE public.inventory_counts TO service_role;


--
-- Name: TABLE journal_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO service_role;


--
-- Name: TABLE journal_lines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.journal_lines TO authenticated;
GRANT ALL ON TABLE public.journal_lines TO service_role;


--
-- Name: TABLE readiness_score_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.readiness_score_snapshots TO authenticated;
GRANT ALL ON TABLE public.readiness_score_snapshots TO service_role;


--
-- Name: TABLE latest_readiness_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.latest_readiness_snapshots TO authenticated;
GRANT ALL ON TABLE public.latest_readiness_snapshots TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE legacy_business_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.legacy_business_profiles TO authenticated;
GRANT ALL ON TABLE public.legacy_business_profiles TO service_role;


--
-- Name: TABLE legacy_documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.legacy_documents TO authenticated;
GRANT ALL ON TABLE public.legacy_documents TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;


--
-- Name: TABLE legacy_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.legacy_transactions TO authenticated;
GRANT ALL ON TABLE public.legacy_transactions TO service_role;


--
-- Name: TABLE loans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.loans TO authenticated;
GRANT ALL ON TABLE public.loans TO service_role;


--
-- Name: TABLE migration_verification_results; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.migration_verification_results TO authenticated;
GRANT ALL ON TABLE public.migration_verification_results TO service_role;


--
-- Name: TABLE missions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.missions TO authenticated;
GRANT ALL ON TABLE public.missions TO service_role;


--
-- Name: TABLE mitra; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mitra TO authenticated;
GRANT ALL ON TABLE public.mitra TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE opening_balances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.opening_balances TO authenticated;
GRANT ALL ON TABLE public.opening_balances TO service_role;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;


--
-- Name: TABLE program_enrollments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.program_enrollments TO authenticated;
GRANT ALL ON TABLE public.program_enrollments TO service_role;


--
-- Name: TABLE program_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.program_members TO service_role;


--
-- Name: TABLE programs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.programs TO authenticated;
GRANT ALL ON TABLE public.programs TO service_role;


--
-- Name: TABLE readiness_analyses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.readiness_analyses TO authenticated;
GRANT ALL ON TABLE public.readiness_analyses TO service_role;


--
-- Name: TABLE readiness_daily; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.readiness_daily TO authenticated;
GRANT ALL ON TABLE public.readiness_daily TO service_role;


--
-- Name: TABLE readiness_rule_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.readiness_rule_sets TO authenticated;
GRANT ALL ON TABLE public.readiness_rule_sets TO service_role;


--
-- Name: TABLE readiness_score_components; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.readiness_score_components TO authenticated;
GRANT ALL ON TABLE public.readiness_score_components TO service_role;


--
-- Name: TABLE report_issues; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.report_issues TO authenticated;
GRANT ALL ON TABLE public.report_issues TO service_role;


--
-- Name: TABLE rules_config; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.rules_config TO authenticated;
GRANT ALL ON TABLE public.rules_config TO service_role;


--
-- Name: TABLE tax_estimates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.tax_estimates TO authenticated;
GRANT ALL ON TABLE public.tax_estimates TO service_role;


--
-- Name: TABLE transaction_captures; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.transaction_captures TO authenticated;
GRANT ALL ON TABLE public.transaction_captures TO service_role;


--
-- Name: TABLE transaction_changes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.transaction_changes TO authenticated;
GRANT ALL ON TABLE public.transaction_changes TO service_role;


--
-- Name: TABLE v_general_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.v_general_ledger TO authenticated;
GRANT ALL ON TABLE public.v_general_ledger TO service_role;


--
-- Name: TABLE wp03_consistency_report; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.wp03_consistency_report TO authenticated;
GRANT ALL ON TABLE public.wp03_consistency_report TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--




-- ===== Baris acuan =====

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET standard_conforming_strings = on;
SET check_function_bodies = false;

--
-- Data for Name: category_templates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('c6ee1d8b-6e2f-4b31-bb11-2a855291fe3d', 'PERDAGANGAN_KULINER', 1, NULL, 'Laku / Jualan', 'Uang masuk dari barang atau makanan yang terjual', 'income', 'CASH_STAR', '4100', 'OPERASI', true, '{laku,jual,jualan,terjual,masuk,omzet,penjualan,laris}', 10, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('35bdbc29-1849-4223-9c50-3c9676baf974', 'PERDAGANGAN_KULINER', 2, NULL, 'Pemasukan lain', 'Uang masuk di luar jualan, misalnya sewa etalase atau komisi titip jual', 'income', 'CASH_STAR', '4200', 'OPERASI', true, '{"sewa etalase",komisi,"titip jual",bonus,hadiah,cashback}', 20, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('37103a2a-e9da-4f68-b5c0-ad4c16cd1ab7', 'PERDAGANGAN_KULINER', 3, NULL, 'Piutang dibayar', 'Pelanggan melunasi utangnya', 'income', 'CASH_STAR', '1300', 'OPERASI', false, '{"bayar utang",lunas,pelunasan,nyaur,dibayar}', 30, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('1351e7d6-6be7-4a70-bbe0-52b39736793b', 'PERDAGANGAN_KULINER', 4, '4a', 'Modal masuk', 'Tambahan modal dari pemilik atau keluarga', 'income', 'CASH_STAR', '3100', 'PENDANAAN', false, '{modal,"tambah modal","suntik modal","setoran modal"}', 40, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('f2af32fc-63a4-41a0-9780-dfc5966d0d8b', 'PERDAGANGAN_KULINER', 4, '4b', 'Pinjaman masuk', 'Uang pinjaman yang cair', 'income', 'CASH_STAR', 'LIABILITY_STAR', 'PENDANAAN', false, '{pinjaman,pinjam,"kredit cair",cair,koperasi,"utang bank"}', 50, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('10619ece-2ea1-4a9b-9d8c-61d07a09deca', 'PERDAGANGAN_KULINER', 5, NULL, 'Belanja bahan / barang', 'Beli bahan baku atau stok dagangan', 'expense', '5100', 'CASH_OR_PAYABLE', 'OPERASI', true, '{belanja,kulak,"beli bahan",stok,"bahan baku",pasar,grosir}', 60, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('ad59ccf0-b665-44f1-bf95-079f97ccf6b4', 'PERDAGANGAN_KULINER', 6, '5210', 'Bahan bakar & energi', 'Gas, bensin, solar, minyak tanah', 'expense', '5210', 'CASH_OR_PAYABLE', 'OPERASI', true, '{gas,elpiji,bensin,solar,"minyak tanah",bbm}', 71, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('c86b376b-f410-4790-aac8-b69d879edea3', 'PERDAGANGAN_KULINER', 6, '5220', 'Listrik, air, internet', 'Tagihan utilitas usaha', 'expense', '5220', 'CASH_OR_PAYABLE', 'OPERASI', true, '{listrik,token,air,pdam,internet,wifi,"pulsa data"}', 72, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('a95b2061-a16c-4563-8b2c-3f4ae8459e04', 'PERDAGANGAN_KULINER', 6, '5230', 'Gaji / upah', 'Upah karyawan atau pembantu', 'expense', '5230', 'CASH_OR_PAYABLE', 'OPERASI', true, '{gaji,upah,karyawan,pegawai,"bayar orang",borongan}', 73, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('b339152e-5d5e-41ba-be50-634ab18fb4ba', 'PERDAGANGAN_KULINER', 6, '5240', 'Sewa tempat', 'Sewa kios, lapak, atau dapur', 'expense', '5240', 'CASH_OR_PAYABLE', 'OPERASI', true, '{sewa,kontrakan,kios,lapak,ruko}', 74, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('38893a7b-0993-4a47-a284-25d7399fb783', 'PERDAGANGAN_KULINER', 6, '5250', 'Kemasan & label', 'Plastik, kardus, stiker, label produk', 'expense', '5250', 'CASH_OR_PAYABLE', 'OPERASI', true, '{kemasan,plastik,kardus,stiker,label,box,cup}', 75, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('10495c7d-2b57-4280-9bbb-311a4e37d75b', 'PERDAGANGAN_KULINER', 6, '5260', 'Transport & ongkir', 'Ongkos jalan, bensin kirim, ongkir ekspedisi', 'expense', '5260', 'CASH_OR_PAYABLE', 'OPERASI', true, '{ongkir,transport,kirim,ekspedisi,angkut,parkir,tol}', 76, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('e8274c42-5f65-43f5-90d4-a2eef88d00b4', 'PERDAGANGAN_KULINER', 6, '5270', 'Promosi & komisi aplikasi', 'Iklan, endorse, potongan aplikasi pesan antar', 'expense', '5270', 'CASH_OR_PAYABLE', 'OPERASI', true, '{promosi,iklan,endorse,"komisi aplikasi","potongan aplikasi",gofood,grabfood,shopeefood}', 77, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('d4e2a60a-9d1a-4c52-befe-a71b4faa41e0', 'PERDAGANGAN_KULINER', 6, '5280', 'Penyusutan alat', 'Nilai alat usaha yang menyusut (dihitung sistem)', 'expense', '5280', 'CASH_OR_PAYABLE', 'OPERASI', true, '{penyusutan,susut}', 78, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('22d6e89f-d45f-4b43-befd-b18dc4440180', 'PERDAGANGAN_KULINER', 6, '5290', 'Biaya usaha lainnya', 'Biaya usaha yang tidak masuk kelompok lain', 'expense', '5290', 'CASH_OR_PAYABLE', 'OPERASI', true, '{lain,"serba serbi","biaya lain",iuran,retribusi,sampah,keamanan}', 79, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('8d7d3d9f-3eac-4de2-a22e-ffa69299d11a', 'PERDAGANGAN_KULINER', 7, NULL, 'Bayar utang / cicilan', 'Membayar cicilan atau melunasi utang usaha', 'expense', 'LIABILITY_STAR', 'CASH_STAR', 'PENDANAAN', false, '{cicilan,nyicil,angsuran,"bayar utang","setor koperasi","bayar pinjaman"}', 80, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('99e19f6f-08ca-4433-86d7-10e7303ba0b8', 'PERDAGANGAN_KULINER', 9, NULL, 'Ambil untuk rumah', 'Uang usaha yang dipakai untuk keperluan pribadi atau rumah', 'expense', '3200', 'CASH_STAR', 'PENDANAAN', false, '{rumah,anak,sekolah,spp,dapur,pribadi,"belanja rumah",arisan,kondangan}', 100, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('b8384c4b-315f-4a9a-9c16-3f1e49687c41', 'PERDAGANGAN_KULINER', 10, NULL, 'Ngutangin pelanggan', 'Barang sudah diberikan tapi pelanggan belum bayar', 'income', '1300', '4100', 'NON_KAS', true, '{ngutang,bon,kasbon,"belum bayar","utang pelanggan"}', 110, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('3c644896-ca43-4e12-8fd8-c4d329f838da', 'JASA', 1, NULL, 'Pemasukan jasa', 'Uang masuk dari pekerjaan atau jasa yang selesai', 'income', 'CASH_STAR', '4100', 'OPERASI', true, '{masuk,bayaran,"ongkos jasa","upah kerja",servis,service,order,job,omzet}', 10, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('124852be-44ab-4261-a6f9-3b3182886351', 'JASA', 2, NULL, 'Pemasukan lain', 'Uang masuk di luar pekerjaan utama, misalnya sewa alat atau komisi', 'income', 'CASH_STAR', '4200', 'OPERASI', true, '{"sewa alat",komisi,bonus,hadiah,cashback,royalti}', 20, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('361a9665-ac39-4021-b243-51866a5c29e9', 'JASA', 3, NULL, 'Piutang dibayar', 'Pelanggan melunasi sisa pembayarannya', 'income', 'CASH_STAR', '1300', 'OPERASI', false, '{"bayar utang",lunas,pelunasan,nyaur,dibayar,"pelunasan termin"}', 30, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('13573d0a-e345-48df-874f-f103e1388352', 'JASA', 4, '4a', 'Modal masuk', 'Tambahan modal dari pemilik atau keluarga', 'income', 'CASH_STAR', '3100', 'PENDANAAN', false, '{modal,"tambah modal","suntik modal","setoran modal"}', 40, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('ceac6e4d-d675-446b-9986-0ea9a6e6e74f', 'JASA', 4, '4b', 'Pinjaman masuk', 'Uang pinjaman yang cair', 'income', 'CASH_STAR', 'LIABILITY_STAR', 'PENDANAAN', false, '{pinjaman,pinjam,"kredit cair",cair,koperasi,"utang bank"}', 50, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('a0cc4ed0-1810-40bb-985d-6441b692a3df', 'JASA', 5, NULL, 'Bahan & alat habis pakai', 'Bahan yang habis terpakai untuk mengerjakan pesanan', 'expense', '5100', 'CASH_OR_PAYABLE', 'OPERASI', true, '{bahan,sparepart,onderdil,benang,kain,cat,oli,material,"habis pakai"}', 60, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('ff831b0f-3ddc-42bc-9b2c-8f40c3f82104', 'JASA', 6, '5210', 'Bahan bakar & energi', 'Bensin, solar, atau gas untuk menjalankan usaha', 'expense', '5210', 'CASH_OR_PAYABLE', 'OPERASI', true, '{bensin,solar,gas,elpiji,bbm,"isi bensin"}', 71, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('f83a55dc-aeb7-4934-a57f-8da91a957b96', 'JASA', 6, '5220', 'Listrik, air, internet', 'Tagihan utilitas usaha', 'expense', '5220', 'CASH_OR_PAYABLE', 'OPERASI', true, '{listrik,token,air,pdam,internet,wifi,"pulsa data",server,hosting}', 72, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('ea5a3407-6f8a-43ea-b941-db765d6317d3', 'JASA', 6, '5230', 'Gaji / upah', 'Upah pekerja, tukang, atau tenaga lepas', 'expense', '5230', 'CASH_OR_PAYABLE', 'OPERASI', true, '{gaji,upah,karyawan,tukang,freelance,"tenaga lepas",borongan}', 73, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('6a0a2105-9407-4950-b621-81e194a0c5ab', 'JASA', 6, '5240', 'Sewa tempat', 'Sewa bengkel, studio, salon, atau ruang kerja', 'expense', '5240', 'CASH_OR_PAYABLE', 'OPERASI', true, '{sewa,kontrakan,bengkel,studio,ruko,coworking}', 74, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('6513eedb-6dd9-4188-b6e6-ac9cd1325fe4', 'JASA', 6, '5250', 'Perlengkapan kerja', 'Sarung tangan, masker, alat tulis, dan perlengkapan habis pakai lain', 'expense', '5250', 'CASH_OR_PAYABLE', 'OPERASI', true, '{perlengkapan,"sarung tangan",masker,"alat tulis",atk,seragam}', 75, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('41134a71-9831-4346-b3c2-0ad7521e75f4', 'JASA', 6, '5260', 'Transport & perjalanan', 'Ongkos jalan ke tempat pelanggan, parkir, tol', 'expense', '5260', 'CASH_OR_PAYABLE', 'OPERASI', true, '{transport,"ongkos jalan",parkir,tol,ojek,grab,gojek,perjalanan}', 76, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('222ad1e5-d6dd-4359-944e-71f0ffb8a425', 'JASA', 6, '5270', 'Promosi & komisi aplikasi', 'Iklan, endorse, potongan aplikasi tempat Anda menerima order', 'expense', '5270', 'CASH_OR_PAYABLE', 'OPERASI', true, '{promosi,iklan,endorse,"komisi aplikasi","potongan aplikasi",ads}', 77, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('e329f250-c9fa-4778-bd58-ed413390e635', 'JASA', 6, '5280', 'Penyusutan alat', 'Nilai alat usaha yang menyusut (dihitung sistem)', 'expense', '5280', 'CASH_OR_PAYABLE', 'OPERASI', true, '{penyusutan,susut}', 78, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('5e443f7f-7b93-4021-aeb6-dc3f5dd0df37', 'JASA', 6, '5290', 'Biaya usaha lainnya', 'Biaya usaha yang tidak masuk kelompok lain', 'expense', '5290', 'CASH_OR_PAYABLE', 'OPERASI', true, '{lain,"serba serbi","biaya lain",iuran,retribusi,sampah,keamanan}', 79, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('468122a4-35ab-4ab2-a1f6-dda11eb1d1a3', 'JASA', 7, NULL, 'Bayar utang / cicilan', 'Membayar cicilan atau melunasi utang usaha', 'expense', 'LIABILITY_STAR', 'CASH_STAR', 'PENDANAAN', false, '{cicilan,nyicil,angsuran,"bayar utang","setor koperasi","bayar pinjaman"}', 80, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('ea217994-1f80-4f53-9cf4-2e2b1175b463', 'JASA', 9, NULL, 'Ambil untuk rumah', 'Uang usaha yang dipakai untuk keperluan pribadi atau rumah', 'expense', '3200', 'CASH_STAR', 'PENDANAAN', false, '{rumah,anak,sekolah,spp,dapur,pribadi,"belanja rumah",arisan,kondangan}', 100, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('e77ca411-390e-4bda-b1ad-7fdd98d8c6d0', 'JASA', 10, NULL, 'Pekerjaan belum dibayar', 'Pekerjaan sudah selesai tapi pelanggan belum membayar', 'income', '1300', '4100', 'NON_KAS', true, '{ngutang,bon,kasbon,"belum bayar","utang pelanggan",termin}', 110, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('9b2ca565-be43-4146-9e96-91126ac2ad3c', 'JASA', 8, NULL, 'Beli alat / aset', 'Beli peralatan kerja yang dipakai lama', 'expense', '1600', 'CASH_OR_PAYABLE', 'INVESTASI', false, '{"beli alat",blender,bor,chiller,dispenser,etalase,freezer,gerinda,gerobak,kipas,kompresor,komputer,kulkas,kursi,laptop,lemari,meja,mesin,"mesin jahit",mixer,motor,oven,penggorengan,peralatan,perkakas,printer,rak,showcase,tenda,timbangan,vitrin,"wajan besar"}', 90, 'coa-emkm-v1', true, '2026-09-07 00:33:05.043452+07');
INSERT INTO public.category_templates (id, sector, category_code, subtype, label_umkm, description_umkm, direction, debit_rule, credit_rule, cash_flow_section, affects_pnl, trigger_keywords, sort_order, version, is_active, created_at) VALUES ('80290e46-a29a-4eeb-8484-bcb65378fd04', 'PERDAGANGAN_KULINER', 8, NULL, 'Beli alat / aset', 'Beli peralatan usaha yang dipakai lama', 'expense', '1600', 'CASH_OR_PAYABLE', 'INVESTASI', false, '{alat,"beli kulkas",blender,bor,chiller,dispenser,etalase,freezer,gerinda,gerobak,kipas,kompor,kompresor,komputer,kulkas,kursi,laptop,lemari,meja,mesin,"mesin jahit",mixer,motor,oven,penggorengan,printer,rak,showcase,tenda,timbangan,vitrin,"wajan besar"}', 90, 'coa-emkm-v1', true, '2026-09-07 00:33:04.94318+07');


--
-- Data for Name: coa_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1100', 'Kas', 'ASET', 'DEBIT', false, 'BS_KAS', NULL, 10, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1200', 'Bank / Giro', 'ASET', 'DEBIT', false, 'BS_GIRO', NULL, 20, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1300', 'Piutang Usaha', 'ASET', 'DEBIT', false, 'BS_PIUTANG_USAHA', NULL, 30, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1400', 'Persediaan', 'ASET', 'DEBIT', false, 'BS_PERSEDIAAN', NULL, 40, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1500', 'Beban Dibayar di Muka', 'ASET', 'DEBIT', false, 'BS_BEBAN_DIBAYAR_DIMUKA', NULL, 50, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1600', 'Aset Tetap', 'ASET', 'DEBIT', false, 'BS_ASET_TETAP', NULL, 60, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('1690', 'Akumulasi Penyusutan', 'ASET', 'KREDIT', true, 'BS_AKUMULASI_PENYUSUTAN', NULL, 70, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('2100', 'Utang Usaha', 'LIABILITAS', 'KREDIT', false, 'BS_UTANG_USAHA', NULL, 110, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('2200', 'Utang Bank', 'LIABILITAS', 'KREDIT', false, 'BS_UTANG_BANK', NULL, 120, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('2300', 'Utang Pinjaman Lain', 'LIABILITAS', 'KREDIT', false, 'BS_UTANG_BANK', NULL, 130, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('2400', 'Utang Pajak', 'LIABILITAS', 'KREDIT', false, 'BS_UTANG_PAJAK', NULL, 140, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('3100', 'Modal Pemilik', 'EKUITAS', 'KREDIT', false, 'BS_MODAL', NULL, 210, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('3200', 'Prive', 'EKUITAS', 'DEBIT', true, 'BS_MODAL', NULL, 220, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('3300', 'Saldo Laba', 'EKUITAS', 'KREDIT', false, 'BS_SALDO_LABA', NULL, 230, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('4100', 'Pendapatan Usaha', 'PENDAPATAN', 'KREDIT', false, 'IS_PENDAPATAN_USAHA', NULL, 310, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('4200', 'Pendapatan Lain-lain', 'PENDAPATAN', 'KREDIT', false, 'IS_PENDAPATAN_LAIN', NULL, 320, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5100', 'Beban Pokok Penjualan', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', NULL, 410, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5210', 'Beban Bahan Bakar & Energi', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 421, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5220', 'Beban Utilitas', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 422, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5230', 'Beban Gaji & Upah', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 423, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5240', 'Beban Sewa', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 424, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5250', 'Beban Kemasan & Label', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 425, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5260', 'Beban Transport & Ongkir', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 426, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5270', 'Beban Promosi & Komisi Platform', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 427, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5280', 'Beban Penyusutan', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 428, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5290', 'Beban Usaha Lain-lain', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_USAHA', '5200', 429, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5310', 'Beban Bunga Pinjaman', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_LAIN', NULL, 510, true, '2026-09-07 00:33:04.94318+07');
INSERT INTO public.coa_accounts (code, name, account_type, normal_balance, is_contra, report_line, parent_code, sort_order, is_active, created_at) VALUES ('5400', 'Beban Pajak Penghasilan', 'BEBAN', 'DEBIT', false, 'IS_BEBAN_PAJAK', NULL, 520, true, '2026-09-07 00:33:04.94318+07');


--
-- Data for Name: document_requirements; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('ac004644-bf43-41d3-93a0-e0be58a8a75d', 'PERDAGANGAN_KULINER', 'ktp', 'wajib', 1, 'dokumen-ktp', 'Fondasi identitas pemilik usaha.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('93d4f881-5c18-460b-b090-d158dd4a107b', 'PERDAGANGAN_KULINER', 'nib', 'wajib', 2, 'dokumen-nib', 'Bisa diurus sendiri di OSS, gratis, sekitar 30 menit.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('d96c2150-e250-45a1-8bc4-f5e3a501a42b', 'PERDAGANGAN_KULINER', 'pirt', 'wajib', 3, 'dokumen-pirt', 'Syarat edar pangan olahan rumah produksi.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('0d1b1160-d89c-400a-bea6-dd9c170be80c', 'PERDAGANGAN_KULINER', 'halal', 'wajib', 4, 'dokumen-halal', 'Wajib bagi usaha mikro dan kecil mulai 17 Oktober 2026 (PP 42/2024).', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('36e38971-dec9-476f-a8c9-b0ae88cf45eb', 'PERDAGANGAN_KULINER', 'npwp', 'disarankan', 5, 'dokumen-npwp', 'Diperlukan saat penjualan setahun mendekati Rp500 juta.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('1467b9e7-8eb4-4774-b600-b88a1fb22fce', 'PERDAGANGAN_KULINER', 'izin_edar', 'disarankan', 6, 'dokumen-bpom', 'Saat produk masuk ritel modern.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('f808878b-36e0-4ca1-a77e-cfb1dd09c6de', 'PERDAGANGAN_KULINER', 'akta_pendirian', 'disarankan', 7, 'dokumen-merek', 'Perlindungan nama usaha untuk jangka panjang.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('3ec70ff0-56eb-488c-961d-42b7a37cfdb2', 'JASA', 'ktp', 'wajib', 1, 'dokumen-ktp', 'Fondasi identitas pemilik usaha.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('5f52ab48-54d5-484b-b367-907bb9ad39e1', 'JASA', 'nib', 'wajib', 2, 'dokumen-nib', 'Bisa diurus sendiri di OSS, gratis, sekitar 30 menit.', '2026-09-07 00:33:05.047752+07');
INSERT INTO public.document_requirements (id, sector, doc_type, requirement, order_index, mission_key, note, created_at) VALUES ('42606aea-a537-42be-8161-0905502614db', 'JASA', 'npwp', 'disarankan', 3, 'dokumen-npwp', 'Diperlukan saat penjualan setahun mendekati Rp500 juta.', '2026-09-07 00:33:05.047752+07');


--
-- Data for Name: missions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('7ef3c478-3ed9-4024-8180-7caa1968eb9f', 'record_transactions', 'Catat transaksi usaha', 'Mulai dengan mencatat pemasukan atau pengeluaran yang benar-benar terjadi.', 'pencatatan', 'active', '{"effort": "low", "evidence": "confirmed_transactions"}', '{"impact": 45}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('58168353-12e0-42d6-881b-b770316bd1c0', 'upload_nib', 'Lengkapi NIB usaha', 'Unggah NIB agar legalitas dasar usaha dapat dibaca dan Anda periksa.', 'legalitas', 'active', '{"effort": "medium", "evidence": "nib_document"}', '{"impact": 25}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('5435978c-2f7d-49da-a55c-5cdcd114364a', 'complete_profile', 'Lengkapi profil usaha', 'Isi nama usaha, sektor, lokasi, dan kontak agar data usaha mudah dipahami.', 'profil', 'active', '{"effort": "low", "evidence": "profile_fields"}', '{"impact": 6}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('ea8fd270-e78e-44bf-9101-929a889bde4c', 'use_digital_payment', 'Catat pembayaran digital', 'Saat menerima QRIS, transfer, atau dompet digital, pilih cara pembayaran yang sesuai.', 'pencatatan', 'active', '{"effort": "low", "evidence": "digital_payment_transaction"}', '{"impact": 6}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('5de164ad-54c6-43a6-b14e-6ef8882932da', 'record_utilities', 'Catat biaya rutin usaha', 'Catat listrik, air, atau internet usaha agar biaya operasional lebih lengkap.', 'pencatatan', 'active', '{"effort": "low", "evidence": "utilities_transaction"}', '{"impact": 6}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('02800302-2bf5-4fda-ad6b-1619e5080001', 'record_sales_channel', 'Catat asal pesanan', 'Isi asal pesanan ketika transaksi datang dari toko, pesan antar, atau kanal lain.', 'pencatatan', 'active', '{"effort": "low", "evidence": "sales_channel_transaction"}', '{"impact": 6}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.missions (id, code, title, description, category, status, requirements, reward, created_at, updated_at) VALUES ('7904ef04-e9c8-4cf1-8bf8-1bb0648a8bf6', 'upload_certificate', 'Tambahkan sertifikat pendukung', 'Unggah sertifikat atau izin tambahan yang memang dimiliki usaha.', 'dokumen', 'active', '{"effort": "medium", "evidence": "supporting_certificate"}', '{"impact": 6}', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');


--
-- Data for Name: readiness_rule_sets; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.readiness_rule_sets (id, version, status, rules, weights, thresholds, created_by, published_by, published_at, created_at, updated_at, effective_at) VALUES ('b05969d0-1b8f-419b-9474-faa8669ce0e1', 'wp03-baseline-v1', 'retired', '{"source": "wp03_backfill", "authority": "transitional"}', '{}', '{}', NULL, NULL, '2026-09-07 00:33:04.832476+07', '2026-09-07 00:33:04.832476+07', '2026-09-07 00:33:04.920199+07', NULL);
INSERT INTO public.readiness_rule_sets (id, version, status, rules, weights, thresholds, created_by, published_by, published_at, created_at, updated_at, effective_at) VALUES ('31bb07a0-155a-48d9-8ff7-6df62a842cb8', 'wp08-pilot-v1', 'published', '{"disclaimer": "Konfigurasi kesiapan data BERKEMBANG.ID, bukan penilaian resmi regulator atau jaminan pembiayaan."}', '{"utilities": 6, "basic_legality": 25, "complete_profile": 6, "digital_payments": 6, "digital_footprint": 6, "certificates_training": 6, "transaction_recording": 45}', '{"strong": 80, "building": 0, "consistent": 65, "developing": 35}', NULL, NULL, '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07', '2026-09-07 00:33:04.920199+07');
INSERT INTO public.readiness_rule_sets (id, version, status, rules, weights, thresholds, created_by, published_by, published_at, created_at, updated_at, effective_at) VALUES ('92030c89-13dd-4632-9bfc-18023d6d0e58', 'wp08-pilot-v2', 'published', '{"bronze": {"A1": 8, "A3": 14, "B1": 0.70, "D1": 1}, "levels": ["MULAI", "TEMBAGA", "PERAK", "EMAS"], "windows": {"habitDays": 30, "qualityDays": 90, "evidenceDays": 90, "fullMonthMinDays": 8, "fullMonthLookback": 3}, "graceDays": 7, "components": {"A1": {"gold": 24, "pillar": "A", "silver": 20, "partial": 8}, "A2": {"gold": 20, "pillar": "A", "silver": 12, "partial": 4}, "A3": {"gold": 90, "pillar": "A", "silver": 60, "partial": 14}, "B1": {"gold": 0.95, "pillar": "B", "silver": 0.90, "partial": 0.70}, "B2": {"gold": 3, "pillar": "B", "silver": 2, "partial": 1}, "B3": {"gold": 0.70, "pillar": "B", "silver": 0.40, "partial": 0.20}, "B4": {"gold": 2, "pillar": "B", "silver": null, "partial": 1}, "C1": {"gold": 4, "pillar": "C", "silver": 3, "partial": 1}, "C2": {"gold": 4, "pillar": "C", "silver": 4, "partial": 1}, "D1": {"gold": 1, "pillar": "D", "silver": 1, "partial": null}, "D2": {"gold": 6, "pillar": "D", "silver": 3, "partial": 1}, "D3": {"gold": 1, "pillar": "D", "silver": null, "partial": null}}, "disclaimer": "Tingkat kesiapan menggambarkan kelengkapan dan kebiasaan pencatatan usaha Anda, dihitung otomatis dengan aturan terbuka. Ini bukan penilaian resmi, bukan skor kredit, dan bukan jaminan pembiayaan.", "bigSpendIdr": 500000, "effortOrder": ["C2", "D1", "C1_NIB", "A2", "A1", "B3", "C1_HALAL", "D2"]}', '{}', '{}', NULL, NULL, '2026-09-07 00:33:05.083394+07', '2026-09-07 00:33:05.083394+07', '2026-09-07 00:33:05.083394+07', '2026-09-07 00:33:05.083394+07');


--
-- PostgreSQL database dump complete
--




-- ===== Bucket penyimpanan, hak akses, dan kebijakannya =====

grant usage on schema storage to authenticated;

grant usage on schema storage to service_role;

grant DELETE, INSERT, SELECT, UPDATE on storage.objects to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on storage.objects to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set name = excluded.name, public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 10485760, ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']::text[])
on conflict (id) do update set name = excluded.name, public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[])
on conflict (id) do update set name = excluded.name, public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete to authenticated using (((bucket_id = 'avatars'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects for insert to authenticated with check (((bucket_id = 'avatars'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "avatars_owner_select" on storage.objects;
create policy "avatars_owner_select" on storage.objects for select to authenticated using (((bucket_id = 'avatars'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update to authenticated using (((bucket_id = 'avatars'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = 'avatars'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "captures_owner_delete" on storage.objects;
create policy "captures_owner_delete" on storage.objects for delete to authenticated using (((bucket_id = 'captures'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "captures_owner_insert" on storage.objects;
create policy "captures_owner_insert" on storage.objects for insert to authenticated with check (((bucket_id = 'captures'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "captures_owner_select" on storage.objects;
create policy "captures_owner_select" on storage.objects for select to authenticated using (((bucket_id = 'captures'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text)));

reset check_function_bodies;
