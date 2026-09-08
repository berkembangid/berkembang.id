-- ---------------------------------------------------------------------------
-- 0072 — Metrik Ruang Mesin: baris kesehatan, kualitas AI, dan biaya
-- ---------------------------------------------------------------------------
-- Tiga fungsi, satu aturan yang menyatukannya: TIDAK SATU PUN MENGEMBALIKAN
-- RUPIAH PER AKUN UMKM.
--
-- Ini bukan kehati-hatian berlebihan. Janji privasi produk ini berlapis: admin
-- boleh melihat metadata operasional -- berapa transaksi, tingkat mana, antrean
-- berapa panjang -- tetapi isi keuangan sebuah usaha hanya terbuka lewat Mode
-- Dukungan ber-tiket yang tercatat dan terlihat oleh pemiliknya. Satu kolom
-- rupiah yang lolos ke daftar admin membatalkan seluruh janji itu, dan
-- membatalkannya diam-diam.
--
-- Agregat LINTAS PLATFORM boleh, dan itu batas yang tegas: "total token AI hari
-- ini" tidak menceritakan apa pun tentang seorang pemilik warung; "omzet warung
-- Bu Ani" menceritakan segalanya. Karena itu fungsi di bawah menjumlahkan dan
-- menghitung, tidak pernah mengelompokkan per usaha.
--
-- SATU BATAS LAGI: `transaction_captures.ocr_summary` memuat potongan baris
-- nota -- isi catatan pemilik. Tidak ada fungsi di sini yang menyentuhnya.
--
-- AKUN DEMO DIKECUALIKAN (invarian v1.1 #13). Akun demo dibuat untuk
-- dipertunjukkan, dan angkanya akan naik-turun mengikuti berapa kali kita
-- meresetnya -- bukan mengikuti apa pun yang terjadi pada pengguna sungguhan.

begin;

/**
 * Pemeriksa akses untuk seluruh fungsi metrik.
 *
 * Ditulis sekali supaya tidak ada fungsi metrik berikutnya yang lupa
 * memasangnya. Fungsi yang lupa memeriksa akses tidak akan pernah gagal
 * mencolok -- ia hanya menjawab pertanyaan yang tidak berhak ditanyakan.
 */
create or replace function private.assert_ruang_mesin_access()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'BUKAN_ADMIN';
  end if;
end;
$fn$;

/**
 * Enam lampu yang selalu terlihat di atas dasbor.
 *
 * Tiap lampu mengembalikan nilainya DAN nadanya, dan nadanya diputuskan di
 * sini, bukan di layar. Alasannya: ambang "berapa antrean yang berarti macet"
 * adalah pengetahuan operasional, dan menaruhnya di komponen React berarti
 * mengubahnya menuntut penempatan ulang aplikasi.
 *
 * Nada `alert` -- satu-satunya yang boleh merah -- hanya untuk kegagalan
 * sistem. Sakelar yang sengaja dimatikan bukan kegagalan; ia `warn`.
 */
create or replace function public.admin_health_row()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_runs_total int;
  v_runs_failed int;
  v_error_rate numeric;
  v_queued int;
  v_oldest_queue_minutes numeric;
  v_violations int;
  v_flags_off int;
  v_last_success timestamptz;
begin
  perform private.assert_ruang_mesin_access();

  select count(*), count(*) filter (where run.status = 'failed')
  into v_runs_total, v_runs_failed
  from public.ai_runs as run
  where run.started_at > now() - interval '1 hour';

  v_error_rate := case when v_runs_total = 0 then 0
                       else round(v_runs_failed::numeric * 100 / v_runs_total, 1) end;

  select count(*), coalesce(max(extract(epoch from now() - job.created_at) / 60), 0)
  into v_queued, v_oldest_queue_minutes
  from public.ai_jobs as job
  where job.status = 'queued';

  -- Inilah lampu yang paling penting di layar ini: berapa kali nominal
  -- keluaran model ditimpa parser deterministik hari ini. Angka selain nol
  -- berarti ada jalan di mana angka model bisa menjadi angka pembukuan.
  select coalesce(sum(capture.amount_overrides), 0)
  into v_violations
  from public.transaction_captures as capture
  where capture.created_at >= date_trunc('day', now())
    and not private.is_demo_business(capture.business_id);

  select count(*) into v_flags_off from public.feature_flags where not enabled;

  select max(job.completed_at) into v_last_success
  from public.ai_jobs as job
  where job.status = 'succeeded';

  return jsonb_build_array(
    jsonb_build_object(
      'key', 'api_error_rate', 'label', 'Kegagalan AI 1 jam',
      'value', v_error_rate, 'unit', 'percent', 'measurable', true,
      'tone', case when v_runs_total = 0 then 'idle'
                   when v_error_rate >= 20 then 'alert'
                   when v_error_rate >= 5 then 'warn' else 'ok' end,
      'detail', format('%s dari %s percobaan', v_runs_failed, v_runs_total)
    ),
    jsonb_build_object(
      'key', 'capture_queue', 'label', 'Antrean menunggu',
      'value', v_queued, 'unit', 'count', 'measurable', true,
      'tone', case when v_queued = 0 then 'ok'
                   when v_oldest_queue_minutes >= 15 then 'alert'
                   when v_queued >= 20 then 'warn' else 'ok' end,
      'detail', case when v_queued = 0 then 'Kosong'
                     else format('Terlama %s menit', round(v_oldest_queue_minutes)) end
    ),
    jsonb_build_object(
      'key', 'daily_job', 'label', 'Job harian terakhir',
      'value', null, 'unit', 'count',
      -- Proyek ini belum punya penjadwal apa pun. Menampilkan "hijau" untuk
      -- job yang tidak pernah dijadwalkan adalah kebohongan yang paling mahal
      -- di layar ini: ia membuat orang berhenti memeriksa.
      'measurable', false, 'tone', 'idle',
      'detail', case when v_last_success is null then 'Belum ada penjadwal'
                     else format('Pekerjaan terakhir sukses %s', to_char(v_last_success, 'DD Mon HH24:MI')) end
    ),
    jsonb_build_object(
      'key', 'provider_breaker', 'label', 'Penyedia AI',
      'value', v_runs_failed, 'unit', 'count', 'measurable', true,
      'tone', case when v_runs_failed = 0 then 'ok'
                   when v_runs_failed >= 10 then 'alert' else 'warn' end,
      'detail', case when v_runs_failed = 0 then 'Tidak ada kegagalan sejam terakhir'
                     else format('%s kegagalan sejam terakhir', v_runs_failed) end
    ),
    jsonb_build_object(
      'key', 'llm_amount_violation', 'label', 'Nominal dari model',
      'value', v_violations, 'unit', 'count', 'measurable', true,
      'tone', case when v_violations = 0 then 'ok' else 'alert' end,
      'detail', case when v_violations = 0 then 'Nol. Semua nominal lahir dari parser.'
                     else format('%s nominal model ditimpa parser hari ini', v_violations) end
    ),
    jsonb_build_object(
      'key', 'flags_off', 'label', 'Sakelar dimatikan',
      'value', v_flags_off, 'unit', 'count', 'measurable', true,
      -- Sakelar mati bukan kegagalan sistem; ia keputusan yang sengaja dibuat.
      'tone', case when v_flags_off = 0 then 'ok' else 'warn' end,
      'detail', case when v_flags_off = 0 then 'Semua fitur menyala'
                     else format('%s fitur sedang dimatikan', v_flags_off) end
    )
  );
end;
$fn$;

/**
 * Tab Kualitas AI: apakah pipeline-nya layak dipercaya.
 *
 * Yang tidak ada di sini sama pentingnya dengan yang ada. "Simpan tanpa edit"
 * dan "edit nominal vs kategori" menuntut perbandingan draf dengan hasil
 * akhir, dan perbandingan itu belum disimpan di mana pun. Keduanya terdaftar
 * di `metric_definitions` dengan `measurable = false`, dan layarnya
 * menampilkan "Belum diukur" -- bukan angka contoh.
 */
create or replace function public.admin_ai_quality(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_since timestamptz;
  v_paths jsonb;
  v_total int;
  v_p50 numeric;
  v_p95 numeric;
  v_violations int;
  v_failed int;
begin
  perform private.assert_ruang_mesin_access();
  v_since := now() - make_interval(days => greatest(least(coalesce(p_days, 7), 90), 1));

  select
    coalesce(jsonb_object_agg(path_row.capture_path, path_row.jumlah), '{}'::jsonb),
    coalesce(sum(path_row.jumlah), 0)
  into v_paths, v_total
  from (
    select coalesce(capture.capture_path, 'TIDAK_DIKETAHUI') as capture_path, count(*) as jumlah
    from public.transaction_captures as capture
    where capture.created_at >= v_since
      and not private.is_demo_business(capture.business_id)
    group by 1
  ) as path_row;

  select
    percentile_cont(0.5) within group (order by extract(epoch from capture.completed_at - capture.created_at) * 1000),
    percentile_cont(0.95) within group (order by extract(epoch from capture.completed_at - capture.created_at) * 1000)
  into v_p50, v_p95
  from public.transaction_captures as capture
  where capture.created_at >= v_since
    and capture.completed_at is not null
    and not private.is_demo_business(capture.business_id);

  select coalesce(sum(capture.amount_overrides), 0)
  into v_violations
  from public.transaction_captures as capture
  where capture.created_at >= v_since
    and not private.is_demo_business(capture.business_id);

  select count(*) into v_failed
  from public.transaction_captures as capture
  where capture.created_at >= v_since
    and capture.status = 'failed'
    and not private.is_demo_business(capture.business_id);

  return jsonb_build_object(
    'sinceDays', greatest(least(coalesce(p_days, 7), 90), 1),
    'captureTotal', v_total,
    'pathMix', v_paths,
    'latencyP50Ms', round(coalesce(v_p50, 0)),
    'latencyP95Ms', round(coalesce(v_p95, 0)),
    'amountViolations', v_violations,
    'failedCaptures', v_failed
  );
end;
$fn$;

/**
 * Tab Biaya & Kesehatan.
 *
 * Token, bukan rupiah. Harga per token berbeda per model dan berubah tanpa
 * memberi tahu siapa pun; menyimpan tarifnya di basis data berarti angka
 * rupiah yang perlahan menjadi salah tanpa ada yang tahu kapan. Token adalah
 * yang benar-benar kita ukur, dan mengalikannya dengan tarif adalah pekerjaan
 * yang tahu tarif hari ini -- bukan pekerjaan tabel ini.
 */
create or replace function public.admin_cost_row(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_since timestamptz;
  v_providers jsonb;
  v_errors int;
  v_queue_p95 numeric;
  v_daily jsonb;
begin
  perform private.assert_ruang_mesin_access();
  v_since := now() - make_interval(days => greatest(least(coalesce(p_days, 7), 90), 1));

  select coalesce(jsonb_agg(row_to_json(provider_row)), '[]'::jsonb)
  into v_providers
  from (
    select
      run.provider,
      run.model,
      count(*) as runs,
      coalesce(sum(run.prompt_tokens), 0) as prompt_tokens,
      coalesce(sum(run.completion_tokens), 0) as completion_tokens,
      count(*) filter (where run.status = 'failed') as failures
    from public.ai_runs as run
    where run.started_at >= v_since
    group by run.provider, run.model
    order by count(*) desc
  ) as provider_row;

  select count(*) into v_errors
  from public.ai_runs as run
  where run.started_at >= now() - interval '24 hours' and run.status = 'failed';

  select percentile_cont(0.95) within group (
    order by extract(epoch from coalesce(job.locked_at, now()) - job.created_at) * 1000
  )
  into v_queue_p95
  from public.ai_jobs as job
  where job.created_at >= v_since;

  select coalesce(jsonb_agg(row_to_json(day_row) order by day_row.hari), '[]'::jsonb)
  into v_daily
  from (
    select
      date_trunc('day', run.started_at)::date as hari,
      coalesce(sum(run.prompt_tokens), 0) + coalesce(sum(run.completion_tokens), 0) as tokens
    from public.ai_runs as run
    where run.started_at >= v_since
    group by 1
  ) as day_row;

  return jsonb_build_object(
    'sinceDays', greatest(least(coalesce(p_days, 7), 90), 1),
    'providers', v_providers,
    'errors24h', v_errors,
    'queueP95Ms', round(coalesce(v_queue_p95, 0)),
    'dailyTokens', v_daily
  );
end;
$fn$;

revoke all on function public.admin_health_row() from public, anon;
revoke all on function public.admin_ai_quality(integer) from public, anon;
revoke all on function public.admin_cost_row(integer) from public, anon;
grant execute on function public.admin_health_row() to authenticated;
grant execute on function public.admin_ai_quality(integer) to authenticated;
grant execute on function public.admin_cost_row(integer) to authenticated;

-- Penjaga: tidak satu pun fungsi metrik menyentuh kolom rupiah per akun atau
-- potongan nota. Diperiksa pada teks sumbernya, karena satu-satunya cara
-- aturan ini bocor adalah lewat kolom yang ditambahkan belakangan dengan niat
-- baik -- "sekalian tampilkan omzetnya biar kelihatan".
do $$
declare
  v_body text;
  v_nama text;
  v_terlarang text;
begin
  foreach v_nama in array array['admin_health_row', 'admin_ai_quality', 'admin_cost_row']
  loop
    select proc.prosrc into v_body
    from pg_proc as proc
    join pg_namespace as namespace_record on namespace_record.oid = proc.pronamespace
    where namespace_record.nspname = 'public' and proc.proname = v_nama;

    -- Yang dicari adalah RUJUKAN KOLOM, bukan kata dalam kalimat. Kata
    -- "nominal" muncul sah di label lampu ("Nominal dari model"); yang tidak
    -- pernah sah adalah `capture.nominal` -- karena itu titiknya ikut dicari.
    foreach v_terlarang in array array['amount_idr', 'ocr_summary', 'transcription', '.nominal']
    loop
      if v_body ilike '%' || v_terlarang || '%' then
        raise exception 'METRIK_MEMBOCORKAN_ISI: fungsi % menyentuh %; rute admin tidak pernah mengembalikan isi keuangan atau catatan per akun.', v_nama, v_terlarang;
      end if;
    end loop;
  end loop;
end;
$$;

commit;
