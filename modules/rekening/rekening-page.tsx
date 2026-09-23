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
import SearchableSelect from "@/components/SearchableSelect";
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
import { DAFTAR_BANK } from "@/modules/rekening/daftar-bank";

const PILIHAN_BANK = [
  ...DAFTAR_BANK,
  { value: BANK_LAINNYA, hint: "BPR, BPRS, koperasi, atau bank yang tidak ada di daftar", alwaysShow: true },
];

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
  0: "border-umkm-line bg-white text-umkm-subtle",
  1: "border-umkm-warning-line bg-umkm-warning-soft text-umkm-warning",
  2: "border-umkm-success-line bg-umkm-success-soft text-umkm-success",
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
        description: "Anda bisa mencatatnya lagi kapan saja.",
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
        description="Satu rekening yang khusus dipakai untuk uang usaha — boleh atas nama Anda sendiri. Ini yang membuat laporan Anda bisa dibaca tanpa memilah belanja rumah."
        icon={Landmark}
      />

      {memuat ? (
        <DashboardPanel className="p-6">
          <p className="flex items-center gap-2 text-xs text-umkm-subtle">
            <LoaderCircle size={14} className="animate-spin" /> Memuat catatan rekening…
          </p>
        </DashboardPanel>
      ) : (
        <>
          {gagalMuat && (
            <DashboardPanel className="border-umkm-warning-line bg-umkm-warning-soft p-4">
              <p className="text-xs text-umkm-warning">{gagalMuat}</p>
            </DashboardPanel>
          )}

          {/* Keadaan sekarang, dan satu langkah berikutnya. */}
          <DashboardPanel className={`p-5 ${toneByStage[stage]}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                {copy.badge}
              </span>
              {stage === 2 && rekening?.ownerConfirmedAt && (
                <span className="text-xs">
                  dinyatakan {tanggalPanjang(rekening.ownerConfirmedAt)}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-base font-bold text-umkm-ink">{copy.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-umkm-muted">{copy.body}</p>
            {copy.next && (
              <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-umkm-ink">
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
                className="rounded-2xl border border-umkm-brand bg-umkm-brand px-4 py-5 text-left text-white transition-opacity hover:opacity-90"
              >
                <p className="text-sm font-bold">Sudah punya rekening usaha</p>
                <p className="mt-1 text-xs leading-relaxed text-white/80">
                  Catat banknya dan 4 angka terakhir. Kurang dari satu menit.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("panduan")}
                className="rounded-2xl border border-umkm-line bg-white px-4 py-5 text-left transition-colors hover:bg-umkm-surface"
              >
                <p className="text-sm font-bold text-umkm-ink">Belum punya</p>
                <p className="mt-1 text-xs leading-relaxed text-umkm-subtle">
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
                description="Rekening atas nama Anda sendiri sudah cukup, asalkan khusus dipakai untuk uang usaha."
                action={
                  <button
                    type="button"
                    onClick={() => setMode("ringkasan")}
                    className="inline-flex min-h-11 items-center rounded-lg border border-umkm-line px-3 text-xs font-bold text-umkm-muted hover:bg-umkm-surface"
                  >
                    Tutup panduan
                  </button>
                }
              />
              <ol className="space-y-3 px-4 py-4 md:px-5">
                {PANDUAN_BUKA_REKENING.map((langkah, index) => (
                  <li key={langkah.judul} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-umkm-surface-muted text-xs font-bold text-umkm-brand">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-umkm-ink">{langkah.judul}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-umkm-subtle">{langkah.isi}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-t border-umkm-line-soft px-4 py-3 md:px-5">
                <button
                  type="button"
                  onClick={bukaFormulir}
                  className="inline-flex min-h-11 items-center text-xs font-bold text-umkm-brand"
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
                description="Nomor lengkapnya tidak kami simpan — cukup 4 angka terakhir supaya Anda mengenali rekening Anda sendiri."
              />
              {/* Sebuah <form> sungguhan: Enter di kolom terakhir menyimpan,
                  seperti formulir lain yang dikenal pemilik. */}
              <form
                className="space-y-4 px-4 py-4 md:px-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (siapSimpan && !sibuk) void simpan();
                }}
              >
                <div>
                  <label htmlFor="rekening-bank" className="block text-xs font-bold text-umkm-ink">Bank</label>
                  <SearchableSelect
                    id="rekening-bank"
                    className="mt-1.5"
                    options={PILIHAN_BANK}
                    value={bank}
                    onChange={setBank}
                    icon={Landmark}
                    placeholder="Pilih bank"
                    searchLabel="Cari bank"
                    searchPlaceholder="Cari nama bank, misalnya BRI atau Bank Jateng"
                    listLabel="Bank"
                    emptyText="Bank tidak ditemukan. Pilih « Bank lain » dan tulis namanya."
                  />
                  {bank === BANK_LAINNYA && (
                    <input
                      value={bankLain}
                      onChange={(event) => setBankLain(event.target.value)}
                      aria-label="Nama bank lainnya"
                      placeholder="Tulis nama banknya, misalnya BPD Bali atau Koperasi Sejahtera"
                      maxLength={80}
                      className="mt-2 min-h-11 w-full rounded-xl border border-umkm-line px-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="rekening-nama" className="block text-xs font-bold text-umkm-ink">Nama pemilik rekening</label>
                  <input
                    id="rekening-nama"
                    value={namaPemilik}
                    onChange={(event) => setNamaPemilik(event.target.value)}
                    aria-describedby="rekening-nama-hint"
                    placeholder="Seperti tertulis di buku tabungan"
                    maxLength={120}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line px-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand"
                  />
                  <p id="rekening-nama-hint" className="mt-1 text-xs leading-relaxed text-umkm-subtle">
                    Boleh nama Anda sendiri. Yang dinilai pemisahan uangnya, bukan atas nama siapa rekeningnya.
                  </p>
                </div>

                <div>
                  <label htmlFor="rekening-nomor" className="block text-xs font-bold text-umkm-ink">4 angka terakhir</label>
                  <input
                    id="rekening-nomor"
                    value={nomor}
                    onChange={(event) => setNomor(event.target.value)}
                    aria-describedby="rekening-nomor-hint"
                    inputMode="numeric"
                    placeholder="Boleh ketik nomor lengkapnya, yang disimpan hanya 4 angka terakhir"
                    maxLength={40}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-umkm-line px-3 text-sm text-umkm-ink outline-none focus:border-umkm-brand"
                  />
                  <p id="rekening-nomor-hint" aria-live="polite" className="mt-1 text-xs leading-relaxed text-umkm-subtle">
                    {digit
                      ? `Yang tersimpan: •••• ${digit}`
                      : "Perlu paling sedikit 4 angka."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={!siapSimpan || sibuk}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {sibuk ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("ringkasan")}
                    className="inline-flex min-h-11 items-center rounded-xl border border-umkm-line px-4 text-xs font-bold text-umkm-muted"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </DashboardPanel>
          )}

          {/* Catatan yang sudah ada. */}
          {rekening && mode === "ringkasan" && (
            <DashboardPanel>
              <PanelHeader title="Rekening yang tercatat" />
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-umkm-ink">
                    {rekening.bankName} •••• {rekening.accountLast4}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-umkm-subtle">
                    atas nama {rekening.accountHolderName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={bukaFormulir}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-muted"
                  >
                    <Pencil size={12} /> Ubah
                  </button>
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => void hapus()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-umkm-line px-3 text-xs font-bold text-umkm-danger disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Hapus
                  </button>
                </div>
              </div>
              <p className="border-t border-umkm-line-soft px-4 py-3 text-xs leading-relaxed text-umkm-subtle md:px-5">
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
                  <div className="flex items-start gap-2 rounded-xl border border-umkm-success-line bg-umkm-success-soft px-3 py-3">
                    <Check size={14} className="mt-0.5 shrink-0 text-umkm-success" />
                    <div>
                      <p className="text-xs font-bold text-umkm-success">Bukti sudah terpasang</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-umkm-success">
                        Anda menyatakan berkas ini memang rekening usaha Anda pada{" "}
                        {tanggalPanjang(rekening.ownerConfirmedAt)}.{" "}
                        <Link href="/umkm/profil/dokumen" className="-mx-1.5 inline-flex min-h-11 items-center rounded-lg px-1.5 font-bold underline">
                          Lihat di lemari
                        </Link>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-umkm-subtle">
                    Dengan melampirkan berkas, Anda menyatakan bahwa berkas itu memang rekening yang
                    Anda catat di atas. Kami tidak menghubungi bank dan tidak memeriksa keaslian
                    berkasnya — yang kami catat adalah pernyataan Anda.
                  </p>
                )}

                {koranTersedia && stage < 2 && (
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() => void lampirkan(koranTersedia.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-umkm-line bg-white px-3 py-3 text-left transition-colors hover:bg-umkm-surface disabled:opacity-40"
                  >
                    <FileText size={15} className="shrink-0 text-umkm-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-umkm-ink">Pakai rekening koran yang sudah ada</p>
                      <p className="mt-0.5 truncate text-xs text-umkm-subtle">
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
                  className="inline-flex items-center gap-2 rounded-xl bg-umkm-brand px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  {sibuk ? <LoaderCircle size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  {stage === 2 ? "Ganti bukti" : "Unggah bukti"}
                </button>
                <p className="text-xs leading-relaxed text-umkm-subtle">
                  PDF, JPG, atau PNG sampai 10 MB.
                </p>
              </div>
            </DashboardPanel>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-umkm-line bg-umkm-surface px-4 py-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-umkm-subtle">
              <Lock size={12} className="mt-0.5 shrink-0" />
              Nomor lengkap rekening Anda tidak disimpan. Berkas buktinya privat, dan baru terlihat
              lembaga setelah Anda memberi izin.
            </p>
            <Link href="/umkm/perjalanan" className="text-xs font-bold text-umkm-brand">
              Lihat Perjalanan
            </Link>
          </div>
        </>
      )}
    </DashboardPage>
  );
}
