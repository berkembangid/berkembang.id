-- ---------------------------------------------------------------------------
-- 0104 — Organisasi terpilih dibaca dari header permintaan
-- ---------------------------------------------------------------------------
-- Orang yang menjadi anggota dua organisasi memilih salah satunya di menu
-- samping. Sebagian besar RPC portal lembaga tidak menerima parameter
-- organisasi dan memanggil `resolve_my_institution_id(null)`, yang selalu
-- memilih keanggotaan TERTUA. Akibatnya Siaran, Ringkasan wilayah, dan
-- penerima siaran menampilkan organisasi yang salah, apa pun pilihan di layar.
--
-- Daripada menambah parameter ke setiap fungsi itu satu per satu, penentunya
-- sendiri yang dibetulkan: bila tidak diberi parameter, ia membaca header
-- `x-institution-id` yang dikirim server aplikasi (PostgREST menaruh header
-- permintaan di `request.headers`). Nilai header diperlakukan persis seperti
-- parameter eksplisit -- keanggotaan aktif tetap diperiksa, dan organisasi
-- yang bukan milik pemanggil ditolak, tidak diam-diam diganti.
--
-- Tanpa header (pemanggil lama, tugas terjadwal) perilakunya tidak berubah.

begin;

create or replace function public.resolve_my_institution_id(p_institution_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  institution_id_value uuid;
  requested_id uuid := p_institution_id;
  header_value text;
begin
  if requested_id is null then
    header_value := nullif(btrim(coalesce(
      current_setting('request.headers', true)::json ->> 'x-institution-id', ''
    )), '');
    if header_value is not null then
      begin
        requested_id := header_value::uuid;
      exception when invalid_text_representation then
        raise exception 'INSTITUTION_ACCESS_DENIED';
      end;
    end if;
  end if;

  if requested_id is not null then
    select institution.id into institution_id_value
    from public.institutions as institution
    join public.institution_members as member on member.institution_id = institution.id
    where institution.id = requested_id
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

commit;
