-- ---------------------------------------------------------------------------
-- 0071 — Jejak nominal: apa yang ditolak parser, dan dari baris mana angkanya
-- ---------------------------------------------------------------------------
-- Dua hal yang selama ini dihitung lalu dibuang.
--
-- SATU: BERAPA KALI ANGKA MODEL DITOLAK. `enforceParserAmounts` dan
-- `enforceReceiptAmount` menghitungnya di setiap capture, lalu menuliskannya
-- ke `console.warn` dan selesai. Padahal angka itulah bukti dari janji terbesar
-- produk ini -- bahwa AI tidak pernah mengarang nominal. Janji yang tidak bisa
-- ditunjukkan angkanya hanya klaim; Ruang Mesin memasangnya sebagai lampu
-- yang harus nol, dan lampu tanpa sumber tidak pernah bisa menyala.
--
-- DUA: BARIS MANA PADA NOTA YANG DIPAKAI. Pemeringkat kandidat sudah tahu
-- persis baris mana yang dipilihnya dan apa saingannya. Tanpa disimpan,
-- pemilik hanya melihat satu angka muncul entah dari mana, dan ketika angkanya
-- meleset ia tidak punya cara memeriksanya selain membaca ulang notanya
-- sendiri -- persis pekerjaan yang mau kita hilangkan.
--
-- BATAS YANG TIDAK BOLEH DILANGGAR: `ocr_summary` memuat POTONGAN teks nota,
-- dan itu isi catatan pemilik. RLS `transaction_captures` yang sudah ada
-- menutupnya untuk siapa pun selain pemiliknya, dan fungsi metrik untuk admin
-- (`0072`) hanya menjumlahkan, tidak pernah mengembalikan potongannya.

begin;

alter table public.transaction_captures
  add column if not exists amount_overrides integer not null default 0,
  add column if not exists amount_drops integer not null default 0,
  add column if not exists ocr_summary jsonb;

comment on column public.transaction_captures.amount_overrides is
  'Berapa nominal keluaran model yang ditimpa parser deterministik. Sumber lampu llm_amount_violation.';
comment on column public.transaction_captures.ocr_summary is
  'Potongan baris nota dan kandidat nominalnya. Isi catatan pemilik: tidak pernah keluar lewat rute admin.';

create index if not exists transaction_captures_amount_overrides_idx
  on public.transaction_captures(created_at)
  where amount_overrides > 0;

/**
 * Menyelesaikan pekerjaan AI, kini beserta jejak penjaganya.
 *
 * Parameternya bertambah satu, jadi fungsinya dijatuhkan lebih dulu:
 * `create or replace` menuntut tanda tangan yang sama persis, dan menambah
 * parameter hanya akan melahirkan fungsi kedua yang berdampingan dengan yang
 * lama -- dua jalan tulis untuk satu hal, dan yang lama tidak pernah tahu soal
 * jejaknya.
 *
 * `p_guard` sengaja punya nilai bawaan: pemanggil lama tetap sah, dan yang
 * hilang hanya jejaknya, bukan capture-nya.
 */
drop function if exists public.complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer);

create or replace function public.complete_capture_ai_job(
  p_job_id uuid,
  p_attempt_number integer,
  p_transcription text,
  p_draft_payload jsonb,
  p_latency_ms integer,
  p_prompt_tokens integer default null,
  p_completion_tokens integer default null,
  p_guard jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_job public.ai_jobs%rowtype;
  v_capture public.transaction_captures%rowtype;
  v_item_count integer;
  v_overrides integer;
  v_drops integer;
  v_summary jsonb;
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

  -- Jejaknya dibersihkan di sini, bukan dipercaya apa adanya: angka negatif
  -- atau bentuk yang salah lebih baik menjadi nol daripada menjadi lampu yang
  -- menyala tanpa sebab.
  v_overrides := greatest(coalesce((p_guard->>'overridden')::integer, 0), 0);
  v_drops := greatest(coalesce((p_guard->>'dropped')::integer, 0), 0);
  v_summary := case
    when p_guard ? 'excerpt' or p_guard ? 'candidates'
      then jsonb_build_object(
        'excerpt', p_guard->'excerpt',
        'ambiguous', coalesce(p_guard->'ambiguous', 'false'::jsonb),
        'candidates', coalesce(p_guard->'candidates', '[]'::jsonb)
      )
    else null
  end;

  update public.ai_runs
  set
    status = 'succeeded',
    response_payload = jsonb_build_object('itemCount', v_item_count, 'amountOverrides', v_overrides),
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
    amount_overrides = v_overrides,
    amount_drops = v_drops,
    ocr_summary = v_summary,
    failure_code = null,
    failure_message = null,
    completed_at = now(),
    updated_at = now()
  where id = v_capture.id;

  return jsonb_build_object(
    'captureId', v_capture.id,
    'status', 'needs_review',
    'itemCount', v_item_count
  );
end;
$fn$;

revoke all on function public.complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_capture_ai_job(uuid, integer, text, jsonb, integer, integer, integer, jsonb)
  to service_role;

-- Penjaga: tepat satu `complete_capture_ai_job`, dan ia tahu soal jejaknya.
-- Dua fungsi berdampingan berarti pekerja bisa memanggil yang lama tanpa ada
-- yang menyadarinya, dan lampu llm_amount_violation diam selamanya di nol
-- bukan karena tidak ada pelanggaran, melainkan karena tidak ada yang mencatat.
do $$
declare
  v_jumlah int;
begin
  select count(*) into v_jumlah
  from pg_proc as proc
  join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
  where namespace_record.nspname = 'public' and proc.proname = 'complete_capture_ai_job';

  if v_jumlah <> 1 then
    raise exception 'DUA_JALAN_SELESAI: ada % fungsi complete_capture_ai_job; yang lama tidak mencatat jejak nominal.', v_jumlah;
  end if;
end;
$$;

commit;
