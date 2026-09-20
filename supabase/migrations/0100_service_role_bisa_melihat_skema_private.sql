-- ---------------------------------------------------------------------------
-- `service_role` bisa melihat skema `private`.
--
-- GEJALANYA: SEEDER TIDAK PERNAH BERHASIL MEMBUAT SATU DOKUMEN PUN.
--
--   ! dokumen ktp gagal: permission denied for schema private
--
-- 112 kali dalam satu kali jalan, untuk KTP, NIB, NPWP, PIRT, Halal, dan
-- rekening koran. Akibat yang terlihat di layar: tidak ada satu pun usaha demo
-- yang punya bukti legalitas, dan sesudah `0098` terbit, delapan usaha Emas
-- akan turun ke Perak pada pembacaan Perjalanan yang pertama -- karena
-- buktinya tidak pernah ada.
--
-- SEBABNYA, DAN KENAPA IA TIDAK PERNAH KETAHUAN.
--
-- `0013` memberi `usage on schema private` HANYA kepada `authenticated`.
-- `service_role` tidak pernah mendapatkannya. Trigger `documents` --
-- `private.document_shelf_default` -- bukan `security definer`, jadi ia
-- berjalan sebagai pemanggil; pemanggil `service_role` tidak bisa melihat
-- skemanya, dan penyisipannya ditolak.
--
-- Pemilik usaha sungguhan tidak pernah terkena: mereka `authenticated`.
-- Yang terkena hanya perkakas sisi server. Dan galatnya dulu ditelan
-- `try/catch` yang tidak pernah menangkap apa pun -- Supabase JS
-- MENGEMBALIKAN galat, tidak melemparnya -- sehingga seeder melaporkan
-- "40 dari 40 berhasil" sambil tidak membuat satu dokumen pun.
--
-- KENAPA MEMBERI USAGE, BUKAN MENJADIKAN TRIGGERNYA `SECURITY DEFINER`.
--
-- Ada DELAPAN fungsi trigger di `private` yang bukan definer, dan dua di
-- antaranya penjaga yang paling penting di basis data ini:
-- `reject_journal_mutation` dan `assert_journal_entry_balanced`.
--
-- Hari ini, ketika `service_role` menyentuh `journal_entries`, ia tidak
-- ditolak oleh penjaganya -- ia gagal karena tidak bisa MELIHAT penjaganya.
-- Penolakan yang kebetulan, bukan penolakan yang dirancang. Sesudah USAGE
-- diberikan, penjaga itu benar-benar berjalan dan menolak dengan alasannya
-- sendiri.
--
-- Jadi perubahan ini TIDAK melonggarkan apa pun. `service_role` sudah melewati
-- seluruh RLS dan bisa menulis ke setiap tabel; yang ia dapatkan di sini hanya
-- kemampuan MEMANGGIL fungsi bantu yang sudah ada. Yang berubah: penjaga yang
-- selama ini tidak pernah dijalankan untuknya, kini dijalankan.
--
-- Migrasi ini menegaskan kembali hal itu dengan menguji keduanya di bawah.
-- ---------------------------------------------------------------------------

grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- Penjaga: buktikan bahwa imutabilitas jurnal TETAP berlaku sesudah USAGE
-- diberikan -- dan bahwa ia kini menolak dengan alasannya sendiri, bukan
-- karena skemanya tak terlihat.
-- ---------------------------------------------------------------------------
do $$
declare
  v_entry_id uuid;
  v_pesan text;
begin
  select id into v_entry_id from public.journal_entries limit 1;
  if v_entry_id is null then
    raise notice 'Belum ada jurnal untuk diuji; penjaga tidak diperiksa.';
    return;
  end if;

  begin
    update public.journal_entries set memo = memo where id = v_entry_id;
    raise exception 'JURNAL_BISA_DIUBAH: `reject_journal_mutation` tidak menolak perubahan. Jangan terapkan migrasi ini.';
  exception
    when others then
      get stacked diagnostics v_pesan = message_text;
      if v_pesan like 'JURNAL_BISA_DIUBAH%' then
        raise;
      end if;
      if v_pesan ilike '%permission denied for schema private%' then
        raise exception 'USAGE_BELUM_BERLAKU: penjaga jurnal masih gagal karena skemanya tak terlihat, bukan karena menolak.';
      end if;
      raise notice 'Penjaga jurnal berjalan dan menolak: %', v_pesan;
  end;
end;
$$;
