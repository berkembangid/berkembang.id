-- 0108 — Masa berlaku dokumen izin, dan pengingat sebelum habis.
--
-- Kolom `documents.valid_until` sudah ada sejak 0041, lengkap dengan
-- indeksnya, dan layar Dokumen meminta pemilik « isi masa berlakunya biar
-- bisa kami ingatkan sebelum habis ». Tetapi tidak ada satu pun jalan untuk
-- mengisinya, dan tidak ada pengingat yang membacanya. PIRT dan sertifikat
-- halal yang habis diam-diam baru ketahuan saat lembaga menanyakannya.
--
-- Pengingatnya DITURUNKAN, sama seperti `fn_pending_reminders` (0037): tidak
-- ada baris yang disimpan dan tidak ada penjadwal. Ia muncul 30 hari sebelum
-- tanggalnya dan hilang sendiri begitu dokumen penggantinya diunggah atau
-- tanggalnya diperbarui.

begin;

create or replace function public.set_document_validity(p_document_id uuid, p_valid_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_document public.documents%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  select * into v_document from public.documents where id = p_document_id for update;
  if v_document.id is null or not private.business_access(v_document.business_id) then
    raise exception using errcode = 'P0002', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if v_document.status = 'superseded' then
    raise exception using errcode = '22023', message = 'DOCUMENT_ARCHIVED';
  end if;
  -- Tanggal yang jauh di masa lalu hampir pasti salah ketik tahun; tanggal
  -- lebih dari 25 tahun ke depan juga. Kosong (null) berarti « tidak ada
  -- masa berlaku » dan boleh.
  if p_valid_until is not null
    and (p_valid_until < date '2000-01-01' or p_valid_until > (current_date + interval '25 years')::date) then
    raise exception using errcode = '22023', message = 'VALIDITY_OUT_OF_RANGE';
  end if;

  update public.documents
  set valid_until = p_valid_until, updated_at = now()
  where id = v_document.id;

  return jsonb_build_object('documentId', v_document.id, 'validUntil', p_valid_until);
end;
$fn$;

-- Invoker, bukan definer: RLS `documents` yang membatasi ke usaha sendiri,
-- persis seperti pengingat stok dan tutup kas.
create or replace function public.fn_document_expiry_reminders(
  p_business_id uuid,
  p_as_of date
)
returns table (
  document_id uuid,
  doc_type text,
  name text,
  valid_until date,
  days_left integer
)
language sql
stable
set search_path = ''
as $$
  select
    document.id,
    document.doc_type,
    document.name,
    document.valid_until,
    (document.valid_until - p_as_of)::integer as days_left
  from public.documents as document
  where document.business_id = p_business_id
    and document.valid_until is not null
    and document.status not in ('superseded', 'rejected')
    and document.valid_until <= p_as_of + 30
  order by document.valid_until;
$$;

revoke all on function public.set_document_validity(uuid, date) from public, anon;
revoke all on function public.fn_document_expiry_reminders(uuid, date) from public, anon, authenticated;
grant execute on function public.set_document_validity(uuid, date) to authenticated;
grant execute on function public.fn_document_expiry_reminders(uuid, date) to authenticated;

commit;
