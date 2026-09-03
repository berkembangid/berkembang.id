-- ============================================================================
-- 0039: JALUR TEKS UNTUK CAPTURE SUARA
--
-- Sampai sekarang basis data memegang satu asumsi: sebuah capture bermetode
-- `voice` PASTI punya audio. `create_transaction_capture` menolak `voice`
-- tanpa `p_mime_type` dan `p_file_size`, dan `source_text` hanya disimpan
-- untuk metode `manual`.
--
-- Asumsi itu benar sampai fitur caption langsung ada, dan salah sesudahnya.
-- Keputusan V3 spek Voice Capture: bila peramban sudah menghasilkan transkrip
-- berkeyakinan tinggi DAN parser server menemukan nominal di dalamnya, audio
-- tidak perlu diunggah sama sekali. Tidak ada berkas, tidak ada Whisper, dan
-- draf muncul di bawah satu detik.
--
-- Yang berubah di sini hanya melonggarkan, tidak pernah memperketat:
--
--   a. `voice` sah bila punya metadata audio ATAU teks sumber. Salah satu
--      harus ada -- capture tanpa keduanya tidak punya bahan apa pun untuk
--      diproses, dan menolaknya di sini lebih jujur daripada membiarkannya
--      gagal di worker beberapa detik kemudian.
--
--   b. `source_text` kini disimpan untuk kedua metode. Sebelumnya transkrip
--      peramban akan hilang begitu masuk, dan jalur teks mustahil dijalankan.
--
--   c. `storage_path` hanya dibuat bila memang ada audio. Path yang menunjuk
--      berkas yang tidak akan pernah diunggah membuat worker menunggu sesuatu
--      yang tidak pernah datang.
--
--   d. Kolom `capture_path` mencatat jalur yang dipilih. Spek Bagian 7
--      menjadikan rasio TEXT_ONLY sebagai metrik; tanpa kolom ini, angkanya
--      hanya bisa ditaksir dari log dan tidak pernah bisa dihitung.
-- ============================================================================

begin;

alter table public.transaction_captures
  add column if not exists capture_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaction_captures_path_check'
  ) then
    alter table public.transaction_captures add constraint transaction_captures_path_check
      check (capture_path is null or capture_path in ('TEXT_ONLY', 'WHISPER'));
  end if;
end;
$$;

create or replace function public.create_transaction_capture(
  p_idempotency_key text,
  p_input_method text,
  p_business_id uuid default null,
  p_source_text text default null,
  p_mime_type text default null,
  p_file_size bigint default null,
  p_checksum_sha256 text default null,
  p_capture_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.create_transaction_capture(text, text, uuid, text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.create_transaction_capture(text, text, uuid, text, text, bigint, text, text)
  to authenticated;

-- Tanda tangan lama dicabut supaya tidak ada dua fungsi bernama sama dengan
-- urutan parameter berbeda. Persis itu yang membuat panggilan named-argument
-- menjadi ambigu dan ditolak PostgREST pada kerusakan `0027`.
drop function if exists public.create_transaction_capture(text, text, uuid, text, text, bigint, text);

commit;
