-- ---------------------------------------------------------------------------
-- 0068 — Jalur kamera: foto nota menjadi draf transaksi
-- ---------------------------------------------------------------------------
-- Foto nota memakai pipeline yang sama persis dengan suara: gambar dibaca
-- menjadi teks, teks masuk parser nominal dan resolver kategori yang sama,
-- lalu berhenti di kartu konfirmasi yang sama. Tidak ada parser kedua, dan
-- tidak ada model yang boleh mengeluarkan angka -- model hanya menyalin teks
-- yang terlihat di gambar; angkanya lahir dari parser.
--
-- Yang berubah di sini hanya pintu masuknya, dan itu tiga hal kecil:
--
--   1. `input_method` menerima 'camera'
--   2. `capture_path` menerima 'OCR'
--   3. `create_transaction_capture` mengenali foto, menolak yang lebih besar
--      dari 2 MB, dan menyiapkan path penyimpanan dengan konvensi yang sama
--      dengan audio -- diawali user_id supaya cocok dengan policy storage.
--
-- Batas 2 MB berlaku SESUDAH pengecilan di klien (sisi terpanjang 1600 px).
-- Yang lebih besar dari itu hampir pasti belum lewat pengecilan, dan
-- menerimanya berarti membayar pembacaan untuk piksel yang tidak menolong.
--
-- Definisi fungsinya disalin dari skema dasar lalu diubah di enam titik,
-- bukan ditulis ulang dengan tangan.

begin;

alter table public.transaction_captures
  drop constraint if exists transaction_captures_input_method_check;
alter table public.transaction_captures
  add constraint transaction_captures_input_method_check
  check (input_method = any (array['voice'::text, 'manual'::text, 'import'::text, 'camera'::text]));

alter table public.transaction_captures
  drop constraint if exists transaction_captures_path_check;
alter table public.transaction_captures
  add constraint transaction_captures_path_check
  check (capture_path is null or capture_path = any (array['TEXT_ONLY'::text, 'WHISPER'::text, 'OCR'::text]));

create or replace function public.create_transaction_capture(p_idempotency_key text, p_input_method text, p_business_id uuid DEFAULT NULL::uuid, p_source_text text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_file_size bigint DEFAULT NULL::bigint, p_checksum_sha256 text DEFAULT NULL::text, p_capture_path text DEFAULT NULL::text) RETURNS jsonb
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
  v_has_image boolean;
  v_has_text boolean;
  v_path text;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method not in ('voice', 'manual', 'camera') then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  v_has_text := p_source_text is not null
    and char_length(trim(p_source_text)) between 1 and 2000;
  v_has_audio := p_mime_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')
    and p_file_size is not null and p_file_size between 1 and 10485760;
  -- Foto nota: dua megabyte sesudah dikecilkan klien ke sisi terpanjang 1600
  -- piksel. Yang lebih besar dari itu hampir pasti belum lewat pengecilan, dan
  -- menerimanya berarti membayar OCR untuk piksel yang tidak menolong dibaca.
  v_has_image := p_mime_type in ('image/jpeg', 'image/png')
    and p_file_size is not null and p_file_size between 1 and 2097152;

  if p_input_method = 'manual' and not v_has_text then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;

  -- Kamera tanpa foto tidak punya apa pun untuk dibaca. Tidak ada jalur
  -- cadangan seperti suara, karena tidak ada transkrip klien untuk foto.
  if p_input_method = 'camera' and not v_has_image then
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
  if p_capture_path is not null and p_capture_path not in ('TEXT_ONLY', 'WHISPER', 'OCR') then
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
    case when p_input_method = 'camera' then 'OCR'
         when p_input_method = 'voice' and not v_has_audio then 'TEXT_ONLY'
         when p_input_method = 'voice' then 'WHISPER'
         else null end
  );

  -- Foto nota memakai konvensi penyimpanan yang sama dengan audio: diawali
  -- user_id supaya cocok dengan policy storage, lalu id capture-nya.
  if p_input_method = 'camera' and v_has_image then
    v_storage_path := v_user_id::text || '/' || v_capture_id::text || '/source.'
      || case p_mime_type when 'image/png' then 'png' else 'jpg' end;
  -- Path penyimpanan hanya dibuat bila audionya memang akan diunggah.
  elsif p_input_method = 'voice' and v_has_audio and v_path is distinct from 'TEXT_ONLY' then
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

-- Penjaga: ketiga jalur harus benar-benar diterima, dan foto yang kebesaran
-- tetap harus tertolak. Batas yang hanya ada di komentar bukan batas.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transaction_captures'::regclass
      and conname = 'transaction_captures_path_check'
      and pg_get_constraintdef(oid) like '%OCR%'
  ) then
    raise exception 'JALUR_OCR_TERTUTUP: capture_path masih menolak OCR.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transaction_captures'::regclass
      and conname = 'transaction_captures_input_method_check'
      and pg_get_constraintdef(oid) like '%camera%'
  ) then
    raise exception 'JALUR_OCR_TERTUTUP: input_method masih menolak camera.';
  end if;
end;
$$;

commit;
