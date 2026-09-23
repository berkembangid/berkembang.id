"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  Landmark,
  LoaderCircle,
  Lock,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import { DashboardPage, DashboardPanel, PageHeader, PanelHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { dismissNotice, notifyBusy, notifyFromError, notifySuccess } from "@/lib/notify";
import { listDocuments } from "@/modules/documents/document-client";
import { uploadDocumentFile, uploadStageText } from "@/modules/documents/document-upload";
import type { DocumentView } from "@/modules/documents/document-repository";
import {
  ambilRekening,
  lampirkanBuktiRekening,
  lupakanRekening,
  simpanRekening,
} from "@/modules/rekening/rekening-client";
import {
  BANK_LAINNYA,
  BANK_PILIHAN,
  PANDUAN_BUKA_REKENING,
  empatDigitTerakhir,
  rekeningStageCopy,
  type RekeningUsaha,
} from "@/modules/rekening/rekening-schema";

/**
 * Layar Rekening usaha.
 *
 * TIGA PINTU DI DEPAN, BUKAN SATU FORMULIR.
 *
 * Langkah ini punya dua jenis pemilik yang keadaannya sangat berbeda: yang
 * rekening usahanya sudah ada dan tinggal mencatatnya (satu menit), dan yang
 * memang belum punya (satu perjalanan ke bank). Formulir yang langsung
 * terbuka menyapa keduanya dengan pertanyaan yang sama, dan yang kedua
 * menutup halamannya karena mengira tidak ada tempat untuknya di sini.
 *
 * KEADAANNYA SELALU DISEBUT, BEGITU PULA LANGKAH BERIKUTNYA.
 *
 * Kartu paling atas tidak pernah kosong: ia menyebut di anak tangga mana
 * pemilik berdiri sekarang dan apa satu hal yang membuatnya naik. Tanpa itu,
 * layar yang menerima unggahan akan terasa seperti sumur -- berkas masuk,
 * tidak ada yang memberi tahu apakah sudah cukup.
 */

const toneByStage = {
  0: "border-[#e3e9f0] bg-white text-[#6e859e]",
  1: "border-amber-200 bg-amber-50 text-amber-700",
  2: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const;

function tanggalPanjang(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

export default function RekeningUsahaPage() {
  const { confirm } = useConfirm();
  const berkasRef = useRef<HTMLInputElement>(null);

  const [rekening, setRekening] = useState<RekeningUsaha | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [gagalMuat, setGagalMuat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const [mode, setMode] = useState<"ringkasan" | "isi" | "panduan">("ringkasan");
  const [bank, setBank] = useState<string>("");
  const [bankLain, setBankLain] = useState("");
  const [namaPemilik, setNamaPemilik] = useState("");
  const [nomor, setNomor] = useState("");

  /** Rekening koran yang sudah telanjur ada di lemari, kalau ada. */
  const [koranTersedia, setKoranTersedia] = useState<DocumentView | null>(null);

  const stage = rekening?.stage ?? 0;
  const copy = rekeningStageCopy[stage];

  const muat = useCallback(async () => {
    try {
      const data = await ambilRekening();
      setRekening(data);
      setGagalMuat(null);
    } catch (error) {
      setGagalMuat(error instanceof Error ? error.message : "Catatan rekening belum bisa dimuat.");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void muat(), 0);
    return () => window.clearTimeout(timer);
  }, [muat]);

  // Lemari dibaca terpisah dan kegagalannya diabaikan: yang hilang hanya
  // tawaran "pakai yang sudah ada", bukan kemampuan mengunggah yang baru.
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const dokumen = await listDocuments();
        const koran = dokumen.find(
          (item) =>
            item.docType === "rekening_koran" &&
            item.hasFile &&
            !["rejected", "superseded"].includes(item.status),
        );
        setKoranTersedia(koran ?? null);
      } catch {
        setKoranTersedia(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rekening]);

  const bankTerpilih = bank === BANK_LAINNYA ? bankLain.trim() : bank;
  const digit = useMemo(() => empatDigitTerakhir(nomor), [nomor]);
  const siapSimpan = bankTerpilih.length >= 2 && namaPemilik.trim().length >= 2 && digit !== null;

  function bukaFormulir() {
    if (rekening) {
      const dikenal = (BANK_PILIHAN as readonly string[]).includes(rekening.bankName);
      setBank(dikenal ? rekening.bankName : BANK_LAINNYA);
      setBankLain(dikenal ? "" : rekening.bankName);
      setNamaPemilik(rekening.accountHolderName);
      setNomor(rekening.accountLast4);
    }
    setMode("isi");
  }

  async function simpan() {
    if (!siapSimpan || !digit) return;
    setSibuk(true);
    try {
      const hasil = await simpanRekening({
        bankName: bankTerpilih,
        accountHolderName: namaPemilik.trim(),
        accountLast4: digit,
      });
      setRekening(hasil);
      setMode("ringkasan");
      notifySuccess("Rekening usaha tercatat", {
        description:
          hasil.stage >= 2
            ? "Buktinya masih terpasang, jadi langkah ini tetap terpenuhi."
            : "Langkah ini kini dihitung sebagian di Perjalanan. Lampirkan buktinya untuk memenuhinya penuh.",
      });
    } catch (error) {
      notifyFromError(error, "Rekening belum tersimpan.");
    } finally {
      setSibuk(false);
    }
  }

  async function lampirkan(documentId: string) {
    setSibuk(true);
    try {
      const hasil = await lampirkanBuktiRekening(documentId);
      setRekening(hasil);
      notifySuccess("Bukti rekening tersimpan", {
        description: "Langkah rekening usaha di Perjalanan sekarang terpenuhi penuh.",
      });
    } catch (error) {
      notifyFromError(error, "Bukti belum berhasil dilampirkan.");
    } finally {
      setSibuk(false);
    }
  }

  async function unggahLaluLampirkan(file: File) {
    setSibuk(true);
    const progres = notifyBusy(uploadStageText.memeriksa);
    try {
      const { documentId } = await uploadDocumentFile(file, "rekening_koran", {
        existingDocumentId: koranTersedia?.id,
        onStage: (tahap) => notifyBusy(uploadStageText[tahap], { id: progres }),
      });
      const hasil = await lampirkanBuktiRekening(documentId);
      setRekening(hasil);
      notifySuccess("Bukti rekening tersimpan", {
        id: progres,
        description: "Berkasnya masuk ke lemari, rak Alat & perjanjian. Hanya Anda yang bisa membukanya.",
      });
    } catch (error) {
      dismissNotice(progres);
      notifyFromError(error, "Bukti belum berhasil diunggah.");
    } finally {
      setSibuk(false);
    }
  }

  async function hapus() {
    const setuju = await confirm({
      title: "Hapus catatan rekening usaha?",
      description:
        "Langkah rekening usaha di Perjalanan kembali kosong. Berkas rekening koran di lemari tidak ikut terhapus.",
      confirmLabel: "Hapus catatan",
      tone: "danger",
    });
    if (!setuju) return;
    setSibuk(true);
    try {
      await lupakanRekening();
      setRekening(null);
      setMode("ringkasan");
      notifySuccess("Catatan rekening dihapus", {
        description: "Kamu bisa mencatatnya lagi kapan saja.",
      });
    } catch (error) {
      notifyFromError(error, "Catatan belum berhasil dihapus.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DashboardPage width="compact">
      <PageHeader
        title="Rekening usaha"
        description="Satu rekening yang khusus dipakai untuk uang usaha — boleh atas namamu sendiri. Ini yang membuat laporanmu bisa dibaca tanpa memilah belanja rumah."
        icon={Landmark}
      />

      {memuat ? (
        <DashboardPanel className="p-6">
          <p className="flex items-center gap-2 text-xs text-[#6e859e]">
            <LoaderCircle size={14} className="animate-spin" /> Memuat catatan rekening…
          </p>
        </DashboardPanel>
      ) : (
        <>
          {gagalMuat && (
            <DashboardPanel className="border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-800">{gagalMuat}</p>
            </DashboardPanel>
          )}

          {/* Keadaan sekarang, dan satu langkah berikutnya. */}
          <DashboardPanel className={`p-5 ${toneByStage[stage]}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                {copy.badge}
              </span>
              {stage === 2 && rekening?.ownerConfirmedAt && (
                <span className="text-[10px]">
                  dinyatakan {tanggalPanjang(rekening.ownerConfirmedAt)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-base font-bold text-[#1b2a3a]">{copy.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4a6280]">{copy.body}</p>
            {copy.next && (
              <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-[#1b2a3a]">
                <ArrowRight size={14} className="mt-0.5 shrink-0" />
                {copy.next}
              </p>
            )}
          </DashboardPanel>

          {/* Pintu masuk untuk yang belum punya catatan apa pun. */}
          {stage === 0 && mode === "ringkasan" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={bukaFormulir}
                className="rounded-2xl border border-[#0b5f86] bg-[#0b5f86] px-4 py-5 text-left text-white transition-opacity hover:opacity-90"
              >
                <p className="text-sm font-bold">Sudah punya rekening usaha</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/80">
                  Catat banknya dan 4 angka terakhir. Kurang dari satu menit.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("panduan")}
                className="rounded-2xl border border-[#e3e9f0] bg-white px-4 py-5 text-left transition-colors hover:bg-[#f7f9fb]"
              >
                <p className="text-sm font-bold text-[#1b2a3a]">Belum punya</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#6e859e]">
                  Lihat apa yang perlu dibawa dan apa yang ditanyakan di bank.
                </p>
              </button>
            </div>
          )}

          {/* Panduan membuka rekening. */}
          {mode === "panduan" && (
            <DashboardPanel>
              <PanelHeader
                title="Membuka rekening untuk usaha"
                description="Rekening atas namamu sendiri sudah cukup, asalkan khusus dipakai untuk uang usaha."
                action={
                  <button
                    type="button"
                    onClick={() => setMode("ringkasan")}
                    className="text-[11px] font-bold text-[#0b5f86]"
                  >
                    Tutup
                  </button>
                }
              />
              <ol className="space-y-3 px-4 py-4 md:px-5">
                {PANDUAN_BUKA_REKENING.map((langkah, index) => (
                  <li key={langkah.judul} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef4f8] text-[11px] font-bold text-[#0b5f86]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-[#1b2a3a]">{langkah.judul}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#6e859e]">{langkah.isi}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-t border-[#eef2f6] px-4 py-3 md:px-5">
                <button
                  type="button"
                  onClick={bukaFormulir}
                  className="text-[11px] font-bold text-[#0b5f86]"
                >
                  Sudah punya rekeningnya sekarang — catat di sini
                </button>
              </div>
            </DashboardPanel>
          )}

          {/* Formulir. */}
          {mode === "isi" && (
            <DashboardPanel>
              <PanelHeader
                title={rekening ? "Ubah catatan rekening" : "Catat rekening usaha"}
                description="Nomor lengkapnya tidak kami simpan — cukup 4 angka terakhir supaya kamu mengenali rekeningmu sendiri."
              />
              <div className="space-y-4 px-4 py-4 md:px-5">
                <div>
                  <label className="block text-xs font-bold text-[#1b2a3a]">Bank</label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...BANK_PILIHAN, BANK_LAINNYA].map((pilihan) => (
                      <button
                        key={pilihan}
                        type="button"
                        onClick={() => setBank(pilihan)}
                        className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                          bank === pilihan
                            ? "border-[#0b5f86] bg-[#0b5f86] text-white"
                            : "border-[#e3e9f0] bg-white text-[#4a6280] hover:bg-[#f7f9fb]"
                        }`}
                      >
                        {pilihan}
                      </button>
                    ))}
                  </div>
                  {bank === BANK_LAINNYA && (
                    <input
                      value={bankLain}
                      onChange={(event) => setBankLain(event.target.value)}
                      placeholder="Tulis nama banknya, misalnya BPD Bali atau Koperasi Sejahtera"
                      maxLength={80}
                      className="mt-2 w-full rounded-xl border border-[#e3e9f0] px-3 py-2.5 text-xs text-[#1b2a3a] outline-none focus:border-[#0b5f86]"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1b2a3a]">Nama pemilik rekening</label>
                  <input
                    value={namaPemilik}
                    onChange={(event) => setNamaPemilik(event.target.value)}
                    placeholder="Seperti tertulis di buku tabungan"
                    maxLength={120}
                    className="mt-1.5 w-full rounded-xl border border-[#e3e9f0] px-3 py-2.5 text-xs text-[#1b2a3a] outline-none focus:border-[#0b5f86]"
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-[#6e859e]">
                    Boleh namamu sendiri. Yang dinilai pemisahan uangnya, bukan atas nama siapa rekeningnya.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1b2a3a]">4 angka terakhir</label>
                  <input
                    value={nomor}
                    onChange={(event) => setNomor(event.target.value)}
                    inputMode="numeric"
                    placeholder="Boleh ketik nomor lengkapnya, yang disimpan hanya 4 angka terakhir"
                    maxLength={40}
                    className="mt-1.5 w-full rounded-xl border border-[#e3e9f0] px-3 py-2.5 text-xs text-[#1b2a3a] outline-none focus:border-[#0b5f86]"
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-[#6e859e]">
                    {digit
                      ? `Yang tersimpan: •••• ${digit}`
                      : "Perlu paling sedikit 4 angka."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!siapSimpan || sibuk}
                    onClick={() => void simpan()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {sibuk ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("ringkasan")}
                    className="rounded-xl border border-[#e3e9f0] px-4 py-2.5 text-xs font-bold text-[#4a6280]"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </DashboardPanel>
          )}

          {/* Catatan yang sudah ada. */}
          {rekening && mode === "ringkasan" && (
            <DashboardPanel>
              <PanelHeader title="Rekening yang tercatat" />
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1b2a3a]">
                    {rekening.bankName} •••• {rekening.accountLast4}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[#6e859e]">
                    atas nama {rekening.accountHolderName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={bukaFormulir}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e3e9f0] px-3 py-2 text-[11px] font-bold text-[#4a6280]"
                  >
                    <Pencil size={12} /> Ubah
                  </button>
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => void hapus()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e3e9f0] px-3 py-2 text-[11px] font-bold text-[#b42318] disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Hapus
                  </button>
                </div>
              </div>
              <p className="border-t border-[#eef2f6] px-4 py-3 text-[10px] leading-relaxed text-[#6e859e] md:px-5">
                Mengubah bank atau 4 angka terakhir akan melepas bukti yang terpasang — berkas lama
                membuktikan rekening yang lain.
              </p>
            </DashboardPanel>
          )}

          {/* Bukti. */}
          {rekening && mode === "ringkasan" && (
            <DashboardPanel>
              <PanelHeader
                title="Bukti rekening"
                description="Rekening koran satu bulan terakhir, atau foto halaman depan buku tabungan. Tersimpan privat di lemari."
              />
              <div className="space-y-3 px-4 py-4 md:px-5">
                {stage === 2 ? (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800">Bukti sudah terpasang</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-700">
                        Kamu menyatakan berkas ini memang rekening usahamu pada{" "}
                        {tanggalPanjang(rekening.ownerConfirmedAt)}.{" "}
                        <Link href="/umkm/profil/dokumen" className="-mx-1.5 inline-flex min-h-11 items-center rounded-lg px-1.5 font-bold underline">
                          Lihat di lemari
                        </Link>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed text-[#6e859e]">
                    Dengan melampirkan berkas, kamu menyatakan bahwa berkas itu memang rekening yang
                    kamu catat di atas. Kami tidak menghubungi bank dan tidak memeriksa keaslian
                    berkasnya — yang kami catat adalah pernyataanmu.
                  </p>
                )}

                {koranTersedia && stage < 2 && (
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => void lampirkan(koranTersedia.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#e3e9f0] bg-white px-3 py-3 text-left transition-colors hover:bg-[#f7f9fb] disabled:opacity-40"
                  >
                    <FileText size={15} className="shrink-0 text-[#0b5f86]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#1b2a3a]">Pakai rekening koran yang sudah ada</p>
                      <p className="mt-0.5 truncate text-[10px] text-[#6e859e]">
                        {koranTersedia.name} · sudah tersimpan di lemari
                      </p>
                    </div>
                  </button>
                )}

                <input
                  ref={berkasRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void unggahLaluLampirkan(file);
                  }}
                />
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => berkasRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0b5f86] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  {sibuk ? <LoaderCircle size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  {stage === 2 ? "Ganti bukti" : "Unggah bukti"}
                </button>
                <p className="text-[10px] leading-relaxed text-[#6e859e]">
                  PDF, JPG, atau PNG sampai 10 MB.
                </p>
              </div>
            </DashboardPanel>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3e9f0] bg-[#f7f9fb] px-4 py-3">
            <p className="flex items-start gap-2 text-[10px] leading-relaxed text-[#6e859e]">
              <Lock size={12} className="mt-0.5 shrink-0" />
              Nomor lengkap rekeningmu tidak disimpan. Berkas buktinya privat, dan baru terlihat
              lembaga setelah kamu memberi izin.
            </p>
            <Link href="/umkm/perjalanan" className="text-[11px] font-bold text-[#0b5f86]">
              Lihat Perjalanan
            </Link>
          </div>
        </>
      )}
    </DashboardPage>
  );
}
