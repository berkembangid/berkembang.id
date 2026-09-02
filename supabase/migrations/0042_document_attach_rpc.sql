-- ---------------------------------------------------------------------------
-- 0042 — Menempelkan bukti: jalur tulis untuk lemari dokumen
-- ---------------------------------------------------------------------------
-- `0041` membuat tabelnya select-only, jadi belum ada cara menempelkan bukti
-- sama sekali. Berkas ini menambahkan dua RPC `security definer`, pola yang
-- sama dengan seluruh tabel akuntansi.
--
-- Tiga keputusan yang dibuat di sini:
--
--   a. **Pintu D dikerjakan server, bukan layar.** Spek meminta satu dokumen
--      menempel ke transaksi DAN ke alat/pinjaman yang lahir darinya. Yang
--      tahu bahwa pembelian kategori 8 melahirkan baris `fixed_assets` adalah
--      basis data (`source_transaction_id`), bukan kartu konfirmasi. Kalau
--      layar yang harus tahu, setiap layar baru yang menempelkan bukti harus
--      mengingatnya lagi -- dan yang lupa menghasilkan alat tanpa bukti tanpa
--      ada yang tahu. Jadi: menempel ke transaksi berarti menempel ke anaknya.
--
--   b. **Unik hanya selagi menempel.** `0041` melarang satu dokumen menempel
--      dua kali ke sasaran yang sama, tanpa memandang sudah dilepas atau
--      belum. Akibatnya pemilik yang keliru melepas nota tidak bisa
--      menempelkannya kembali: barisnya sudah ada, hanya bertanda lepas, dan
--      trigger immutable melarang menghidupkannya lagi. Batasannya diganti
--      indeks unik parsial `where removed_at is null`.
--
--   c. **Menempel bersifat idempotent.** Jaringan warung putus di tengah
--      unggahan, dan tombol ditekan dua kali. Panggilan kedua mengembalikan
--      tautan yang sama, bukan galat.

begin;

-- ---------------------------------------------------------------------------
-- a. Unik selagi menempel
-- ---------------------------------------------------------------------------

alter table public.document_attachments
  drop constraint if exists document_attachments_unique;

create unique index if not exists document_attachments_live_unique
  on public.document_attachments(document_id, target_type, target_id)
  where removed_at is null;

-- ---------------------------------------------------------------------------
-- Sasaran itu milik siapa
-- ---------------------------------------------------------------------------
-- Menempelkan bukti ke transaksi usaha lain berarti membocorkan foto nota.
-- Pemeriksaannya satu tempat supaya tidak ada pemanggil yang lupa.

create or replace function private.attachment_target_business(
  p_target_type text,
  p_target_id uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
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

-- ---------------------------------------------------------------------------
-- Menempel
-- ---------------------------------------------------------------------------

create or replace function public.attach_document(
  p_document_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

-- ---------------------------------------------------------------------------
-- Melepas
-- ---------------------------------------------------------------------------
-- Melepas bukan menghapus: barisnya tetap ada dengan alasannya, karena bukti
-- yang pernah menempel adalah bagian dari riwayat.

create or replace function public.detach_document(
  p_attachment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

revoke execute on function public.attach_document(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.detach_document(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_document(uuid, text, uuid) to authenticated;
grant execute on function public.detach_document(uuid, text) to authenticated;

commit;
