begin;

-- ============================================================================
-- 0027: PENGHAPUSAN BATASAN ROLE & KEANGGOTAAN BISNIS UNTUK PORTAL UMKM
-- UMKM adalah portal mandiri satu pemilik (roleless). Setiap akun yang login
-- langsung memiliki akses penuh ke seluruh fitur UMKM (catat, laporan, dokumen,
-- kesiapan, profil) tanpa memerlukan penugasan role ('owner'/'manager'/'staff')
-- maupun pendaftaran manual di tabel keanggotaan (business_members).
-- ============================================================================

-- Helper: dapatkan atau buat otomatis entitas bisnis untuk akun yang aktif
create or replace function private.get_or_create_user_business(
  p_user_id uuid,
  p_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_profile public.profiles%rowtype;
  v_name text;
begin
  if p_user_id is null then
    return null;
  end if;

  -- 1. Jika business_id spesifik diberikan, periksa kepemilikan atau keanggotaan
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

    if v_business_id is not null then
      return v_business_id;
    end if;
  end if;

  -- 2. Bisnis yang terikat langsung ke profil akun (legacy_profile_id)
  select b.id into v_business_id
  from public.businesses b
  where b.legacy_profile_id = p_user_id
    and b.status = 'active'
  order by b.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 3. Bisnis dari relasi keanggotaan (jika ada data legacy)
  select m.business_id into v_business_id
  from public.business_members m
  where m.user_id = p_user_id
    and m.status = 'active'
  order by case m.role when 'owner' then 1 when 'manager' then 2 else 3 end, m.created_at asc
  limit 1;

  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 4. Auto-provisioning: Buat bisnis baru otomatis agar user tidak pernah terblokir
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

  -- Sinkronkan ke business_members untuk kompatibilitas trigger lama
  insert into public.business_members (business_id, profile_id, user_id, role, status, joined_at)
  values (v_business_id, p_user_id, p_user_id, 'owner', 'active', now())
  on conflict do nothing;

  return v_business_id;
end;
$$;

-- Perbarui private.business_role agar selalu menganggap pemilik UMKM sebagai 'owner'
create or replace function private.business_role(target_business_id uuid)
returns text
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    (select member.role
    from public.business_members as member
    where member.business_id = target_business_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
    order by case member.role when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end
    limit 1),
    case when exists (
      select 1 from public.businesses as business
      where business.id = target_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    ) then 'owner' end,
    'owner'
  );
$$;

-- 1. CREATE TRANSACTION CAPTURE (Roleless & Auto-provision)
create or replace function public.create_transaction_capture(
  p_idempotency_key text,
  p_input_method text,
  p_business_id uuid default null,
  p_source_text text default null,
  p_mime_type text default null,
  p_file_size bigint default null,
  p_checksum_sha256 text default null
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
  if p_input_method = 'manual' and (
    p_source_text is null or char_length(trim(p_source_text)) not between 1 and 2000
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_input_method = 'voice' and (
    p_mime_type not in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')
    or p_file_size is null or p_file_size < 1 or p_file_size > 10485760
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
  end if;
  if p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-fA-F0-9]{64}$' then
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
      'createdAt', v_capture.created_at,
      'idempotent', true
    );
  end if;

  v_capture_id := gen_random_uuid();
  if p_input_method = 'voice' then
    v_extension := case p_mime_type
      when 'audio/webm' then 'webm'
      when 'audio/mp4' then 'mp4'
      when 'audio/ogg' then 'ogg'
      when 'audio/mpeg' then 'mp3'
      else 'webm'
    end;
    v_storage_path := format('captures/%s/%s.%s', v_business_id, v_capture_id, v_extension);
  else
    v_storage_path := null;
  end if;

  insert into public.transaction_captures (
    id,
    business_id,
    user_id,
    idempotency_key,
    input_method,
    status,
    source_text,
    storage_path,
    mime_type,
    file_size,
    checksum_sha256,
    created_at,
    updated_at
  ) values (
    v_capture_id,
    v_business_id,
    v_user_id,
    trim(p_idempotency_key),
    p_input_method,
    'draft',
    case when p_input_method = 'manual' then trim(p_source_text) else null end,
    v_storage_path,
    case when p_input_method = 'voice' then p_mime_type else null end,
    case when p_input_method = 'voice' then p_file_size else null end,
    case when p_input_method = 'voice' and p_checksum_sha256 is not null then lower(p_checksum_sha256) else null end,
    now(),
    now()
  )
  returning * into v_capture;

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
    'TRANSACTION_CAPTURE_CREATED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object(
      'inputMethod', v_capture.input_method,
      'hasAudio', v_capture.storage_path is not null
    )
  );

  return jsonb_build_object(
    'id', v_capture.id,
    'businessId', v_capture.business_id,
    'inputMethod', v_capture.input_method,
    'status', v_capture.status,
    'storagePath', v_capture.storage_path,
    'createdAt', v_capture.created_at,
    'idempotent', false
  );
end;
$$;

-- 2. SCHEDULE CAPTURE PROCESSING (Roleless)
create or replace function public.schedule_capture_processing(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  order by job.created_at desc
  limit 1
  for update;

  if found and v_job.status in ('queued', 'processing') then
    return jsonb_build_object(
      'captureId', v_capture.id,
      'jobId', v_job.id,
      'status', v_capture.status,
      'idempotent', true
    );
  end if;

  if v_job.id is null then
    insert into public.ai_jobs (
      capture_id,
      business_id,
      job_type,
      status,
      payload,
      created_at,
      updated_at
    ) values (
      v_capture.id,
      v_capture.business_id,
      'capture_transcription_and_extraction',
      'queued',
      jsonb_build_object(
        'inputMethod', v_capture.input_method,
        'storagePath', v_capture.storage_path,
        'sourceText', v_capture.source_text
      ),
      now(),
      now()
    )
    returning * into v_job;
  else
    update public.ai_jobs
    set
      status = 'queued',
      attempts = 0,
      worker_id = null,
      locked_until = null,
      error_code = null,
      error_message = null,
      is_fatal = false,
      updated_at = now()
    where id = v_job.id
    returning * into v_job;
  end if;

  update public.transaction_captures
  set
    status = 'processing',
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where id = v_capture.id
  returning * into v_capture;

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
    'TRANSACTION_CAPTURE_PROCESSING_SCHEDULED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object('jobId', v_job.id)
  );

  return jsonb_build_object(
    'captureId', v_capture.id,
    'jobId', v_job.id,
    'status', v_capture.status,
    'idempotent', false
  );
end;
$$;

-- 3. CONFIRM TRANSACTION CAPTURE (Roleless)
create or replace function public.confirm_transaction_capture(
  p_capture_id uuid,
  p_items jsonb,
  p_confirmation_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

    begin
      v_amount_idr := (v_item->>'amountIdr')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end;

    begin
      v_transaction_date := (v_item->>'transactionDate')::date;
    exception when others then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end;

    if v_transaction_type not in ('income', 'expense')
      or v_amount_idr is null
      or v_amount_idr <= 0
      or v_amount_idr > 100000000000
      or v_transaction_date is null
      or v_transaction_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date + interval '1 day'
      or char_length(v_description) not between 1 and 255
      or v_category_code not in (
        'sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other',
        'raw_ingredients', 'inventory', 'packaging',
        'rent', 'utilities', 'transport', 'marketing', 'maintenance', 'supplies', 'operations',
        'wages', 'salary', 'bonus',
        'tax', 'loan_repayment', 'other'
      ) then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    if v_category_code in ('sales_food', 'sales_beverage', 'sales_retail', 'sales_service', 'sales_other') then
      v_category_group := 'sales';
    elsif v_category_code in ('raw_ingredients', 'inventory', 'packaging') then
      v_category_group := 'cogs';
    elsif v_category_code in ('rent', 'utilities', 'transport', 'marketing', 'maintenance', 'supplies', 'operations') then
      v_category_group := 'operations';
    elsif v_category_code in ('wages', 'salary', 'bonus') then
      v_category_group := 'wages';
    else
      v_category_group := 'other';
    end if;

    if (v_category_group = 'sales' and v_transaction_type <> 'income')
      or (v_category_group in ('cogs', 'operations', 'wages') and v_transaction_type <> 'expense') then
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
    if v_unit is not null and char_length(v_unit) > 30 then
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

    if v_payment_method is not null and v_payment_method not in ('cash', 'qris', 'bank_transfer', 'ewallet', 'edc', 'credit', 'other') then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;
    if v_sales_channel is not null and char_length(v_sales_channel) > 50 then
      raise exception using errcode = '22023', message = 'VALIDATION_FAILED';
    end if;

    v_transaction_id := gen_random_uuid();
    insert into public.transactions (
      id,
      business_id,
      profile_id,
      user_id,
      capture_id,
      capture_item_index,
      direction,
      amount_idr,
      transaction_date,
      category_group,
      category_code,
      item,
      quantity,
      unit,
      unit_price_idr,
      payment_method,
      sales_channel,
      ledger_status,
      created_at,
      updated_at
    ) values (
      v_transaction_id,
      v_capture.business_id,
      v_capture.user_id,
      v_user_id,
      v_capture.id,
      v_index,
      v_transaction_type,
      v_amount_idr,
      v_transaction_date,
      v_category_group,
      v_category_code,
      v_description,
      v_quantity,
      v_unit,
      v_unit_price_idr,
      v_payment_method,
      v_sales_channel,
      'confirmed',
      now(),
      now()
    );

    v_transaction_ids := v_transaction_ids || jsonb_build_array(v_transaction_id);
  end loop;

  update public.transaction_captures
  set
    status = 'confirmed',
    draft_items = p_items,
    confirmation_idempotency_key = trim(p_confirmation_idempotency_key),
    confirmed_at = now(),
    updated_at = now()
  where id = v_capture.id;

  update public.ai_jobs
  set
    status = 'completed',
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object('confirmedTransactionCount', jsonb_array_length(v_transaction_ids)),
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where capture_id = v_capture.id;

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
    'TRANSACTION_CAPTURE_CONFIRMED',
    'transaction_capture',
    v_capture.id::text,
    jsonb_build_object(
      'transactionIds', v_transaction_ids,
      'transactionCount', jsonb_array_length(v_transaction_ids)
    )
  );

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'confirmed',
    'transactionIds', v_transaction_ids,
    'idempotent', false
  );
end;
$$;

-- 4. CANCEL TRANSACTION CAPTURE (Roleless)
create or replace function public.cancel_transaction_capture(p_capture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  if v_capture.status = 'cancelled' then
    return jsonb_build_object(
      'captureId', v_capture.id,
      'status', 'cancelled',
      'storagePath', v_capture.storage_path,
      'idempotent', true
    );
  end if;

  if v_capture.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'CAPTURE_ALREADY_CONFIRMED';
  end if;

  update public.transaction_captures
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where id = v_capture.id;

  update public.ai_jobs
  set
    status = 'failed',
    error_code = 'CAPTURE_CANCELLED',
    error_message = 'Capture cancelled by user.',
    is_fatal = true,
    updated_at = now()
  where capture_id = v_capture.id
    and status in ('queued', 'processing');

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
    jsonb_build_object('storagePath', v_capture.storage_path)
  );

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'cancelled',
    'storagePath', v_capture.storage_path,
    'idempotent', false
  );
end;
$$;

-- 5. CLOSE LEDGER DAY & CANCEL TRANSACTION (Roleless)
create or replace function public.close_ledger_day(
  p_closing_date date,
  p_opening_cash_idr bigint default null,
  p_physical_cash_idr bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_existing public.daily_closings%rowtype;
  v_in bigint;
  v_out bigint;
  v_count int;
  v_expected bigint;
  v_difference bigint;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  v_business_id := private.get_or_create_user_business(v_user_id);
  if v_business_id is null then raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;

  if p_closing_date not between date '2000-01-01' and (now() at time zone 'Asia/Jakarta')::date or (p_opening_cash_idr is not null and p_opening_cash_idr<0) or (p_physical_cash_idr is not null and p_physical_cash_idr<0) or char_length(coalesce(p_note,''))>500 then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text||':'||p_closing_date::text,0));
  select * into v_existing from public.daily_closings where business_id=v_business_id and closing_date=p_closing_date for update;
  if found and v_existing.status='closed' then return jsonb_build_object('closingId',v_existing.id,'status','closed','idempotent',true); end if;
  select coalesce(sum(amount_idr) filter(where direction='income'),0),coalesce(sum(amount_idr) filter(where direction='expense'),0),count(*)
    into v_in,v_out,v_count from public.transactions where business_id=v_business_id and transaction_date=p_closing_date and ledger_status='confirmed';
  v_expected:=case when p_opening_cash_idr is null then null else p_opening_cash_idr+v_in-v_out end;
  v_difference:=case when v_expected is null or p_physical_cash_idr is null then null else p_physical_cash_idr-v_expected end;

  insert into public.daily_closings(business_id,closing_date,income_amount_idr,expense_amount_idr,transaction_count,status,closed_by,closed_at,opening_cash_idr,system_cash_in_idr,system_cash_out_idr,expected_cash_idr,physical_cash_idr,difference_idr,note)
  values(v_business_id,p_closing_date,v_in,v_out,v_count,'closed',v_user_id,now(),p_opening_cash_idr,v_in,v_out,v_expected,p_physical_cash_idr,v_difference,nullif(trim(p_note),''))
  on conflict(business_id,closing_date) do update set income_amount_idr=excluded.income_amount_idr,expense_amount_idr=excluded.expense_amount_idr,transaction_count=excluded.transaction_count,status='closed',closed_by=excluded.closed_by,closed_at=now(),opening_cash_idr=excluded.opening_cash_idr,system_cash_in_idr=excluded.system_cash_in_idr,system_cash_out_idr=excluded.system_cash_out_idr,expected_cash_idr=excluded.expected_cash_idr,physical_cash_idr=excluded.physical_cash_idr,difference_idr=excluded.difference_idr,note=excluded.note,updated_at=now() returning id into v_id;

  insert into public.audit_events(actor_user_id,actor_type,business_id,action,target_type,target_id,metadata)
  values(v_user_id,'user',v_business_id,'DAILY_CLOSING_COMPLETED','daily_closing',v_id::text,jsonb_build_object('date',p_closing_date,'transactionCount',v_count,'hasOpeningCash',p_opening_cash_idr is not null,'hasPhysicalCash',p_physical_cash_idr is not null));

  return jsonb_build_object('closingId',v_id,'status','closed','idempotent',false);
end $$;

create or replace function public.cancel_transaction(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 200 then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;

  select * into v_tx from public.transactions where id=p_transaction_id for update;
  if not found then raise exception using errcode='P0001',message='TRANSACTION_NOT_FOUND'; end if;

  if v_tx.user_id <> v_user_id
    and not exists (
      select 1 from public.businesses b
      where b.id = v_tx.business_id and b.legacy_profile_id = v_user_id
    )
    and not exists (
      select 1 from public.business_members m
      where m.business_id = v_tx.business_id and m.user_id = v_user_id and m.status = 'active'
    ) then
    raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED';
  end if;

  if v_tx.ledger_status='cancelled' then return jsonb_build_object('transactionId',v_tx.id,'status','cancelled','idempotent',true); end if;

  update public.transactions set ledger_status='cancelled',cancelled_at=now(),cancelled_by=v_user_id,updated_at=now() where id=v_tx.id;
  insert into public.transaction_changes(transaction_id,business_id,actor_user_id,action,reason,previous_values)
  values(v_tx.id,v_tx.business_id,v_user_id,'cancelled',trim(p_reason),jsonb_build_object('amountIdr',v_tx.amount_idr,'type',v_tx.direction,'date',v_tx.transaction_date,'categoryCode',v_tx.category_code));

  return jsonb_build_object('transactionId',v_tx.id,'status','cancelled','idempotent',false);
end $$;

-- 6. DOCUMENT UPLOAD & MANAGEMENT (Roleless)
create or replace function public.create_document_upload_session(
  p_idempotency_key text,
  p_doc_type text,
  p_original_name text,
  p_mime_type text,
  p_file_size bigint,
  p_checksum_sha256 text,
  p_business_id uuid default null,
  p_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_doc_type not in (
    'ktp', 'nib', 'npwp', 'rekening_koran', 'qris', 'laporan_keuangan',
    'halal', 'pirt', 'bpom', 'izin_edar', 'haki', 'sertifikat', 'training', 'foto_tempat_usaha'
  ) then
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
  v_storage_path := format('documents/%s/%s/v%s.%s', v_business_id, v_target_document_id, v_next_version, v_extension);

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
$$;

-- 7. RECALCULATE MY READINESS (Roleless & Auto-provision)
create or replace function public.recalculate_my_readiness()
returns jsonb language plpgsql security definer set search_path='' as $$
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
  where d.business_id=v_business_id and d.status not in ('archived','superseded');
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

commit;
