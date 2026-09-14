"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";

type DinasOption = { id: string; name: string; location: string | null };
type ActiveAffiliation = { institutionId: string; institutionName: string; grantedAt: string };
type Options = { regionKnown: boolean; options: DinasOption[]; active: ActiveAffiliation | null };

/**
 * Dinas pembina — satu pilihan di halaman Profil, satu izin di baliknya.
 *
 * KENAPA INI PILIHAN, BUKAN ISIAN.
 *
 * Yang diminta adalah "satu field di profil supaya langsung terkategorikan",
 * dan itu benar. Yang tidak bisa dilakukan isian teks justru sasaran itu
 * sendiri: "Dinas KUMKM Kota Bandung", "dinas umkm bdg", dan "DISKUMKM"
 * adalah tiga teks untuk satu dinas yang sama. Yang mengkategorikan adalah
 * pilihan yang menunjuk ke satu lembaga, bukan kata yang diketik.
 *
 * KENAPA ADA KALIMAT AKIBATNYA.
 *
 * Menekan tombol ini membuka nama usaha dan nama pemilik kepada sebuah
 * lembaga pemerintah. Itu bukan pengaturan; itu izin. Dan izin yang diberikan
 * tanpa pemiliknya tahu akibatnya bukan izin -- ia cuma kolom yang terisi.
 * Karena itu kalimatnya ada di layar sebelum ditekan, bukan di syarat dan
 * ketentuan.
 *
 * Daftarnya sudah dipersempit ke kotanya sendiri oleh `list_my_dinas_options`,
 * dan fungsi itu juga yang menolak bank -- jadi tidak ada penyaringan di sini
 * yang bisa berselisih dengan yang di basis data.
 */
export function DinasAffiliationCard() {
  const { confirm } = useConfirm();
  const [state, setState] = useState<Options | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("list_my_dinas_options");
    if (error) {
      setLoadError("Daftar dinas belum dapat dimuat. Muat ulang halaman ini.");
      return;
    }
    setLoadError("");
    setState(data as unknown as Options);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function grant() {
    const option = state?.options.find((row) => row.id === chosen);
    if (!option) {
      notifyWarning("Pilih dinas pembinanya dulu.");
      return;
    }

    const yes = await confirm({
      title: `Jadikan ${option.name} dinas pembina Anda?`,
      description:
        "Dinas ini akan dapat melihat nama usaha dan nama Anda, supaya bisa mengundang Anda ke program pendampingan. " +
        "Mereka tidak dapat melihat catatan keuangan Anda, dan tidak mendapat nomor telepon Anda. " +
        "Setiap kali mereka membuka data Anda, Anda melihatnya di riwayat akses. Bisa dicabut kapan saja.",
      confirmLabel: "Ya, jadikan pembina",
      cancelLabel: "Batal",
    });
    if (!yes) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_my_dinas_affiliation", { p_institution_id: option.id });
      if (error) throw new Error(readableError(error.message));
      notifySuccess(`${option.name} kini dinas pembina Anda`, {
        description: "Bisa dicabut kapan saja dari halaman ini.",
      });
      setChosen("");
      await load();
    } catch (cause) {
      notifyFromError(cause, "Dinas pembina belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const active = state?.active;
    if (!active) return;

    const yes = await confirm({
      title: `Cabut ${active.institutionName} sebagai dinas pembina?`,
      description:
        "Mereka berhenti dapat melihat nama usaha Anda mulai saat ini. Undangan program yang sudah Anda ikuti tidak terpengaruh, " +
        "dan riwayat akses yang sudah terjadi tetap tersimpan supaya Anda bisa memeriksanya.",
      confirmLabel: "Cabut",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("revoke_my_dinas_affiliation");
      if (error) throw new Error(readableError(error.message));
      notifySuccess("Dinas pembina dicabut", { description: "Nama usaha Anda kembali tertutup bagi mereka." });
      await load();
    } catch (cause) {
      notifyFromError(cause, "Pencabutan belum berhasil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-[0_4px_16px_rgba(27,42,58,.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef8fd] text-[#0b5f86]">
          <Building2 size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#1b2a3a]">Dinas pembina</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">
            Kalau usaha Anda dibina sebuah dinas, pilih di sini. Dinas itu dapat melihat nama usaha Anda supaya bisa
            mengundang Anda ke program pendampingan — bukan catatan keuangannya.
          </p>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {loadError}
        </p>
      )}

      {!state ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-xs text-[#6e859e]">
          <LoaderCircle size={14} className="animate-spin" /> Memuat…
        </p>
      ) : state.active ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#a9ebd0] bg-[#edfbf5] p-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#0b7a55]">
              <ShieldCheck size={14} /> {state.active.institutionName}
            </p>
            <p className="mt-0.5 text-[11px] text-[#0b7a55]">
              Dipilih {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(state.active.grantedAt))}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#c8d3de] bg-white px-4 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9] disabled:opacity-50"
          >
            <X size={14} /> Cabut
          </button>
        </div>
      ) : !state.regionKnown ? (
        // Dua kembalian kosong punya arti berbeda, dan layarnya harus
        // membedakannya: tanpa kota, daftarnya tidak bisa disusun sama sekali.
        <p className="mt-4 rounded-xl border border-[#f0d9a8] bg-[#fdf8ee] p-3.5 text-xs leading-relaxed text-[#8a6412]">
          Isi dulu <strong>kota atau kabupaten</strong> usaha Anda di formulir di bawah, lalu simpan. Daftar dinas
          disusun dari kota itu.
        </p>
      ) : state.options.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#f8fafc] p-3.5 text-xs leading-relaxed text-[#6e859e]">
          Belum ada dinas yang terdaftar di kota Anda. Bagian ini akan terisi sendiri begitu ada.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="dinas-pembina">Pilih dinas pembina</label>
          <select
            id="dinas-pembina"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-[#d5dfe9] px-3 text-sm outline-none focus:border-[#0b5f86]"
          >
            <option value="">Belum dipilih</option>
            {state.options.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void grant()}
            disabled={busy || !chosen}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white hover:bg-[#0f73a3] disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Simpan
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Kode galat dari basis data bukan kalimat untuk pemilik warung.
 *
 * Dibiarkan apa adanya, "WILAYAH_TIDAK_COCOK" terbaca sebagai kerusakan
 * padahal ia aturan yang memang sengaja dibuat.
 */
function readableError(message: string): string {
  if (message.includes("WILAYAH_TIDAK_COCOK")) {
    return "Dinas itu terdaftar di kota lain. Yang bisa dipilih hanya dinas di kota usaha Anda.";
  }
  if (message.includes("KOTA_USAHA_BELUM_DIISI")) {
    return "Isi dulu kota atau kabupaten usaha Anda, lalu simpan profilnya.";
  }
  if (message.includes("BUKAN_DINAS_PEMBINA")) return "Lembaga itu bukan dinas pembina.";
  if (message.includes("DINAS_TIDAK_DITEMUKAN")) return "Dinas itu sudah tidak terdaftar.";
  if (message.includes("BUSINESS_ACCESS_DENIED")) return "Usaha Anda belum siap. Muat ulang halaman ini.";
  return message;
}
