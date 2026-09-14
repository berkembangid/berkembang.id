-- ---------------------------------------------------------------------------
-- 0088 — Neraca saldo: satu nilai, satu kolom
-- ---------------------------------------------------------------------------
-- Yang disajikan `fn_trial_balance` sebelumnya bukan neraca saldo, melainkan
-- ringkasan buku besar. Setiap akun memuat TIGA angka sekaligus:
--
--   1100 Kas    debit 5.200.000   kredit 1.400.000   saldo 3.800.000
--
-- Neraca saldo tidak bekerja begitu. Ia menyajikan SATU nilai per akun, di
-- kolom yang sesuai sisinya, dan kolom sebelahnya kosong:
--
--   1100 Kas    debit 3.800.000   kredit        -
--   1690 Akum.  debit        -    kredit   62.500
--
-- Gunanya justru itu: kedua kolom dijumlah, dan kalau sama, pembukuannya
-- seimbang. Dengan akumulasi debit dan kredit sekaligus, kedua kolom SELALU
-- sama berapa pun isinya -- karena setiap jurnal seimbang per entry. Jadi
-- penjumlahannya tidak membuktikan apa pun. Itu yang hilang.
--
-- Dan kolom "saldo" menjadi mubazir begitu nilainya ditaruh di kolom yang
-- benar: ia mengulang angka yang sudah ada di sebelahnya.
--
-- Akun bersaldo NOL tidak lagi ditampilkan. Akun yang debit dan kreditnya
-- sama besar memang tidak punya saldo untuk disajikan; menampilkannya sebagai
-- "0 dan 0" hanya memanjangkan daftar tanpa menambah satu keterangan pun.
--
-- Perhatikan akun kontra: 1690 Akumulasi Penyusutan bersaldo normal KREDIT,
-- jadi ia jatuh di kolom kredit dengan sendirinya. Kolomnya ditentukan arah
-- saldonya (debit dikurangi kredit), bukan jenis akunnya -- itu yang membuat
-- akun kontra tidak perlu diperlakukan khusus.
--
-- Tanda tangannya berubah (kolom `balance` hilang), jadi fungsinya harus
-- di-drop lebih dulu. `grant` ikut dipasang kembali: sebuah fungsi yang
-- di-drop kehilangan seluruh izinnya, dan lupa memasangnya kembali membuat
-- Neraca Saldo menjawab "permission denied" kepada setiap pemilik.

begin;

drop function if exists public.fn_trial_balance(uuid, date);

create function public.fn_trial_balance(p_business_id uuid, p_as_of date)
returns table (
  account_code text,
  account_name text,
  account_type text,
  normal_balance text,
  debit bigint,
  credit bigint
)
language sql
stable
set search_path = ''
as $fn$
  select
    saldo.code,
    saldo.name,
    saldo.account_type,
    saldo.normal_balance,
    greatest(saldo.net, 0)::bigint,
    greatest(-saldo.net, 0)::bigint
  from (
    select
      account.code,
      account.name,
      account.account_type,
      account.normal_balance,
      account.sort_order,
      coalesce(sum(line.debit) - sum(line.credit), 0) as net
    from public.coa_accounts as account
    join public.journal_lines as line on line.account_code = account.code
    join public.journal_entries as entry on entry.id = line.entry_id
    where line.business_id = p_business_id
      and entry.entry_date <= p_as_of
    group by account.code, account.name, account.account_type, account.normal_balance, account.sort_order
  ) as saldo
  where saldo.net <> 0
  order by saldo.sort_order;
$fn$;

revoke all on function public.fn_trial_balance(uuid, date) from public, anon;
grant execute on function public.fn_trial_balance(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Penjaga
-- ---------------------------------------------------------------------------

do $$
declare
  v_src text;
  v_names text[];
begin
  -- `proargnames` memuat nama kolom keluaran juga untuk fungsi RETURNS TABLE,
  -- jadi satu bacaan cukup untuk memeriksa tanda tangannya.
  select proc.prosrc, proc.proargnames into v_src, v_names
  from pg_proc as proc
  join pg_namespace as ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'fn_trial_balance';

  -- Inti `0088`: satu nilai per akun, di satu kolom.
  if 'balance' = any(v_names) then
    raise exception 'KOLOM_SALDO_KEMBALI: neraca saldo tidak perlu kolom saldo; nilainya sudah ada di kolom yang benar.';
  end if;
  if v_src not ilike '%greatest(saldo.net, 0)%' or v_src not ilike '%greatest(-saldo.net, 0)%' then
    raise exception 'DUA_KOLOM_TERISI: nilai akun harus jatuh di debit ATAU kredit, tidak keduanya.';
  end if;

  -- Izin harus terpasang kembali sesudah drop.
  if not exists (
    select 1 from information_schema.role_routine_grants
    where routine_name = 'fn_trial_balance' and grantee = 'authenticated' and privilege_type = 'EXECUTE'
  ) then
    raise exception 'IZIN_HILANG: fn_trial_balance tidak bisa dipanggil pemilik usaha sesudah di-drop.';
  end if;
end;
$$;

commit;
