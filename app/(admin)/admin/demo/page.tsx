"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, MonitorPlay, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFromError, notifySuccess, notifyWarning } from "@/lib/notify";

type DemoRow = {
  business_id: string;
  fixture_key: string;
  created_at: string;
  business_name: string;
  sector: string | null;
  status: string;
};

type BusinessRow = { id: string; name: string; sector: string | null; status: string };

/** Fixture yang dikenal skrip seeding. Dipilih, bukan diketik bebas. */
const FIXTURES = ["dimsum-3-bulan", "warung-nasi-30-hari", "jasa-cuci-kosong"];

function whenText(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

/**
 * Akun demo.
 *
 * Menandai sebuah usaha sebagai demo MENGELUARKANNYA dari setiap angka di
 * Ruang Mesin (invarian v1.1 #13). Itu yang membuatnya berguna untuk
 * pertunjukan -- dan berbahaya kalau tersalah pasang: usaha sungguhan yang
 * tertandai akan lenyap dari dasbor tanpa jejak yang terlihat, dan tidak ada
 * yang akan mencarinya. Karena itu penandaannya menuntut SUPER_ADMIN dan
 * ditanyakan lebih dulu.
 *
 * "Reset ke fixture" belum ada di layar ini, dan tombolnya sengaja tidak
 * dipasang dalam keadaan mati. Reset yang benar menyusun ulang catatan sebuah
 * usaha lewat jalur resmi -- pembalikan, posting ulang, hitung ulang
 * penyusutan -- dan tombol yang menjanjikan itu sebelum ada isinya lebih buruk
 * daripada tombol yang belum ada.
 */
export default function AdminDemoPage() {
  const { confirmWithReason } = useConfirm();
  const [rows, setRows] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BusinessRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fixture, setFixture] = useState(FIXTURES[0]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_demo_accounts");
    if (error) setLoadError("Daftar akun demo belum dapat dibaca. Periksa peran akun Anda.");
    else {
      setLoadError("");
      setRows((data as unknown as DemoRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      notifyWarning("Ketik minimal dua huruf nama usahanya.");
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("businesses")
        .select("id,name,sector,status")
        .ilike("name", `%${term}%`)
        .limit(10);
      if (error) throw new Error(error.message);
      setResults(data ?? []);
      if ((data ?? []).length === 0) notifyWarning("Tidak ada usaha dengan nama itu.");
    } catch (cause) {
      notifyFromError(cause, "Pencarian belum dapat dijalankan.");
    } finally {
      setSearching(false);
    }
  }

  async function mark(business: BusinessRow) {
    const reason = await confirmWithReason({
      title: `Tandai "${business.name}" sebagai akun demo?`,
      description:
        "Usaha ini akan hilang dari SEMUA angka di Ruang Mesin — akun aktif, transaksi, kualitas AI, biaya. Kalau ini akun sungguhan, angkanya lenyap tanpa ada yang mencarinya.",
      reasonLabel: "Untuk apa akun ini dipakai?",
      reasonPlaceholder: "Contoh: peraga dry-run 12 September",
      confirmLabel: "Tandai demo",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (reason === null) return;

    setBusyId(business.id);
    try {
      const { error } = await supabase.rpc("admin_set_demo_account", {
        p_business_id: business.id,
        p_is_demo: true,
        p_fixture_key: fixture,
        p_reason: reason,
      });
      if (error) throw new Error(readableError(error.message));
      notifySuccess(`${business.name} ditandai sebagai akun demo`, {
        description: "Mulai sekarang usaha ini tidak ikut dihitung di dasbor mana pun.",
      });
      setResults([]);
      setQuery("");
      await load();
    } catch (cause) {
      notifyFromError(cause, "Penandaan belum berhasil.");
    } finally {
      setBusyId(null);
    }
  }

  async function unmark(row: DemoRow) {
    const reason = await confirmWithReason({
      title: `Lepas tanda demo dari "${row.business_name}"?`,
      description: "Usaha ini kembali ikut dihitung di seluruh angka Ruang Mesin, termasuk catatan lamanya.",
      reasonLabel: "Kenapa dilepas?",
      reasonPlaceholder: "Contoh: ternyata akun pengguna sungguhan",
      confirmLabel: "Lepas tanda",
      cancelLabel: "Batal",
    });
    if (reason === null) return;

    setBusyId(row.business_id);
    try {
      const { error } = await supabase.rpc("admin_set_demo_account", {
        p_business_id: row.business_id,
        p_is_demo: false,
        // Fixture-nya tidak dipakai saat melepas tanda, tetapi parameternya
        // wajib ada. Nilai kosong lebih jujur daripada mengirim ulang fixture
        // lama, yang akan terbaca di catatan seolah ia masih berlaku.
        p_fixture_key: "",
        p_reason: reason,
      });
      if (error) throw new Error(readableError(error.message));
      notifySuccess(`${row.business_name} kembali dihitung`);
      await load();
    } catch (cause) {
      notifyFromError(cause, "Pelepasan belum berhasil.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-extrabold text-[#1b2a3a] md:text-3xl">Akun demo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Akun yang ditandai di sini dikeluarkan dari seluruh angka Ruang Mesin. Hanya SUPER_ADMIN yang boleh menandai.
        </p>
      </div>

      {loadError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {loadError}
        </p>
      )}

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-bold text-[#1b2a3a]">Tandai usaha sebagai demo</h2>
        <form onSubmit={search} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="demo-search">Cari nama usaha</label>
          <input
            id="demo-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama usaha…"
            className="min-h-11 flex-1 rounded-xl border border-[#d5dfe9] px-3 text-sm outline-none focus:border-[#0b5f86]"
          />
          <label className="sr-only" htmlFor="demo-fixture">Fixture</label>
          <select
            id="demo-fixture"
            value={fixture}
            onChange={(event) => setFixture(event.target.value)}
            className="min-h-11 rounded-xl border border-[#d5dfe9] px-3 text-sm outline-none focus:border-[#0b5f86]"
          >
            {FIXTURES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button
            type="submit"
            disabled={searching}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white hover:bg-[#0f73a3] disabled:opacity-50"
          >
            {searching ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />} Cari
          </button>
        </form>

        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-[#eef2f6]">
            {results.map((business) => (
              <li key={business.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#1b2a3a]">{business.name}</p>
                  <p className="text-[11px] text-slate-500">{business.sector ?? "Tanpa sektor"} · {business.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void mark(business)}
                  disabled={busyId !== null}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86] disabled:opacity-50"
                >
                  <MonitorPlay size={14} /> Tandai demo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#e3e9f0] bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-bold text-[#1b2a3a]">Akun demo saat ini</h2>
        {loading ? (
          <div role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={16} className="animate-spin" /> Memuat…
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Belum ada akun demo. Selama daftar ini kosong, seluruh angka Ruang Mesin memuat semua akun apa adanya.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#eef2f6]">
            {rows.map((row) => (
              <li key={row.business_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[#1b2a3a]">{row.business_name}</p>
                  <p className="text-[11px] text-slate-500">
                    <span className="font-mono">{row.fixture_key}</span> · ditandai {whenText(row.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void unmark(row)}
                  disabled={busyId !== null}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#c8d3de] bg-white px-3 text-xs font-bold text-[#4a6280] hover:bg-[#f3f6f9] disabled:opacity-50"
                >
                  <X size={14} /> Lepas tanda
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function readableError(message: string): string {
  if (message.includes("BUTUH_SUPER_ADMIN")) return "Menandai akun demo hanya bisa dilakukan SUPER_ADMIN.";
  if (message.includes("BUKAN_ADMIN")) return "Sesi Anda bukan sesi admin platform.";
  if (message.includes("USAHA_TIDAK_DITEMUKAN")) return "Usaha ini tidak ada lagi.";
  if (message.includes("FIXTURE_WAJIB")) return "Pilih fixture-nya lebih dulu.";
  if (message.includes("ALASAN_WAJIB")) return "Alasannya terlalu pendek untuk berguna di riwayat nanti.";
  return message;
}
