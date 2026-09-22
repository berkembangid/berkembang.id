"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import type { DemoAccessPayload } from "@/modules/marketing/demo-access-schema";

/**
 * Akun demo, dibuka setelah nama dan surel diisi.
 *
 * KENAPA SANDINYA TETAP TERANG-TERANGAN SETELAH FORMULIRNYA DIISI.
 *
 * Halaman ini tujuan QR di poster. Yang memindainya sedang berdiri di depan
 * poster, memegang ponsel, dan tidak punya siapa-siapa untuk dimintai akun.
 * Situs demo sendiri tidak menyebut akun contohnya di mana pun -- jadi tanpa
 * baris ini, tombol "Coba demo" mendarat di halaman masuk yang tidak bisa
 * dilewati, dan orangnya pergi.
 *
 * Yang dibuka bukan data siapa pun: basis datanya terpisah dari produksi,
 * isinya usaha karangan, dan setiap layarnya berspanduk "LINGKUNGAN DEMO".
 *
 * FORMULIRNYA PENCATATAN MINAT, BUKAN PENJAGA PINTU.
 *
 * Ia tidak memverifikasi apa pun, dan memang tidak perlu. Nama karangan tetap
 * lolos. Yang dicari cuma nama orang yang bersedia meninggalkannya -- karena
 * sebelum ini, poster dipasang, QR dipindai, akun dipakai, dan tidak seorang
 * pun tahu siapa yang sudah datang.
 *
 * Karena itu pula kegagalan mencatat tidak menahan akunnya: lihat
 * `recordDemoAccessRequest`.
 *
 * AKUNNYA TIDAK ADA DI SUMBER HALAMAN SAMPAI DIMINTA.
 *
 * Route `POST /api/v1/demo-access` yang mengirimkannya. Kalau daftarnya tetap
 * dirender server lalu ditutup dengan `hidden`, formulirnya hanya hiasan di
 * depan teks yang sudah terbaca di "view source".
 *
 * SEKALI ISI, TIDAK DITANYA LAGI.
 *
 * Orang yang sama sering kembali ke halaman ini untuk menyalin ulang sandinya.
 * Menanyakan nama yang sama untuk kedua kalinya terasa seperti tidak didengar,
 * jadi jawabannya disimpan di `localStorage` peramban itu. Simpanan yang
 * hilang -- mode privat, data situs dibersihkan -- hanya berarti formulirnya
 * muncul sekali lagi, bukan halaman yang rusak.
 */

const KUNCI_SIMPANAN = "berkembang.bio.demo-access";

/**
 * Simpanan peramban dibaca lewat `useSyncExternalStore`, bukan `useEffect`.
 *
 * Server tidak tahu isi `localStorage`, jadi ia selalu merender formulirnya.
 * Kalau klien langsung merender daftar akun pada render pertamanya, HTML-nya
 * tidak cocok dengan yang dikirim server dan React membuang seluruh pohonnya.
 *
 * `getServerSnapshot` -- argumen ketiga -- ada persis untuk ini: React
 * memakainya juga pada render hidrasi di klien, lalu merender ulang dengan
 * nilai sebenarnya. Formulirnya berkedip sepersekian detik, dan itu jauh lebih
 * murah daripada hidrasi yang gagal.
 */
function langgananSimpanan(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function bacaSimpanan(): string | null {
  try {
    return window.localStorage.getItem(KUNCI_SIMPANAN);
  } catch {
    // Mode privat atau data situs diblokir. Sama artinya dengan belum pernah
    // mengisi: formulirnya muncul. Bukan halaman rusak.
    return null;
  }
}

function TombolSalin({ nilai, label }: { nilai: string; label: string }) {
  const [tersalin, setTersalin] = useState(false);

  async function salin() {
    try {
      await navigator.clipboard.writeText(nilai);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 1800);
    } catch {
      // Peramban yang menolak papan klip (atau konteks tanpa izin) tidak
      // membuat halaman ini gagal: nilainya tetap tertulis dan bisa disalin
      // dengan tangan. Tidak ada gunanya memunculkan galat untuk itu.
    }
  }

  return (
    <button
      type="button"
      onClick={salin}
      aria-label={tersalin ? label + " tersalin" : "Salin " + label}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-[#001b85] hover:text-[#001b85] active:scale-95"
    >
      {tersalin ? (
        <Check className="h-4 w-4 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}

/** Kata sandi bersama, satu baris di atas daftar akun. */
function BarisSandi({ nilai }: { nilai: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#f4f6ff] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Kata sandi — sama untuk semua
        </p>
        {/*
          `break-all` supaya sandi yang panjang tetap terbaca utuh di layar
          360px, bukan terpotong elipsis -- yang terpotong tidak bisa disalin
          dengan tangan kalau papan klipnya kebetulan ditolak.
        */}
        <p className="break-all font-mono text-[13px] font-bold leading-5 text-[#141a34]">{nilai}</p>
      </div>
      <TombolSalin nilai={nilai} label="kata sandi" />
    </div>
  );
}

/**
 * Satu akun: perannya, apa yang akan dilihat, dan surelnya.
 *
 * Perannya ditulis di depan karena itu yang dicari orang ("saya dinas, yang
 * mana punya saya?"). Surel tanpa keterangan peran memaksa menebak.
 */
function BarisPeran({
  peran,
  lembaga,
  lihat,
  email,
}: {
  peran: string;
  lembaga: string;
  lihat: string;
  email: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#001b85]">{peran}</p>
        <p className="mt-0.5 text-[13px] font-bold leading-tight text-[#141a34]">{lembaga}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{lihat}</p>
        <p className="mt-1.5 break-all font-mono text-[12px] leading-4 text-slate-600">{email}</p>
      </div>
      <TombolSalin nilai={email} label={"surel " + peran.toLowerCase()} />
    </div>
  );
}

function Isian({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  galat,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  galat?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold text-slate-600">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={galat ? true : undefined}
        aria-describedby={galat ? id + "-galat" : undefined}
        className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#001b85]"
      />
      {galat && (
        <p id={id + "-galat"} className="mt-1 text-[11px] text-red-600">
          {galat}
        </p>
      )}
    </div>
  );
}

export function AkunDemo() {
  const tersimpan = useSyncExternalStore(langgananSimpanan, bacaSimpanan, () => null);
  const [baruSaja, setBaruSaja] = useState<DemoAccessPayload | null>(null);
  const payload = useMemo<DemoAccessPayload | null>(() => {
    if (baruSaja) return baruSaja;
    if (!tersimpan) return null;
    try {
      return JSON.parse(tersimpan) as DemoAccessPayload;
    } catch {
      return null;
    }
  }, [baruSaja, tersimpan]);
  const [nama, setNama] = useState("");
  const [surel, setSurel] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<{ nama?: string; surel?: string; umum?: string }>({});

  async function kirim(event: React.FormEvent) {
    event.preventDefault();
    if (sibuk) return;
    setSibuk(true);
    setGalat({});
    try {
      const response = await fetch("/api/v1/demo-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nama, email: surel }),
      });
      const isi = await response.json();
      if (!response.ok) {
        const fieldErrors = isi?.error?.fieldErrors ?? {};
        setGalat({
          nama: fieldErrors.name?.[0],
          surel: fieldErrors.email?.[0],
          umum: fieldErrors.name || fieldErrors.email ? undefined : isi?.error?.message,
        });
        return;
      }
      setBaruSaja(isi.data as DemoAccessPayload);
      try {
        window.localStorage.setItem(KUNCI_SIMPANAN, JSON.stringify(isi.data));
      } catch {
        // Tidak bisa diingat untuk kunjungan berikutnya. Akunnya tetap tampil
        // sekarang, dan itu yang sedang dibutuhkan orangnya.
      }
    } catch {
      setGalat({ umum: "Jaringan sedang bermasalah. Coba sekali lagi." });
    } finally {
      setSibuk(false);
    }
  }

  if (payload) {
    return (
      <>
        <div className="mt-4">
          <BarisSandi nilai={payload.sandi} />
        </div>
        <div className="mt-3 space-y-2">
          {payload.akun.map((akun) => (
            <BarisPeran key={akun.email} {...akun} />
          ))}
        </div>
      </>
    );
  }

  return (
    <form onSubmit={kirim} className="mt-4 space-y-3" noValidate>
      <Isian
        id="nama"
        label="Nama"
        type="text"
        value={nama}
        onChange={setNama}
        placeholder="Nama Anda"
        autoComplete="name"
        galat={galat.nama}
      />
      <Isian
        id="surel"
        label="Alamat surel"
        type="email"
        value={surel}
        onChange={setSurel}
        placeholder="nama@contoh.com"
        autoComplete="email"
        galat={galat.surel}
      />
      {galat.umum && <p className="text-[11px] text-red-600">{galat.umum}</p>}
      <button
        type="submit"
        disabled={sibuk}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001b85] px-4 text-sm font-bold text-white transition active:scale-[.99] disabled:opacity-60"
      >
        {sibuk && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {sibuk ? "Membuka..." : "Lihat akun demo"}
      </button>
      <p className="text-[11px] leading-4 text-slate-500">
        Kami memakainya untuk tahu siapa saja yang sudah mencoba, dan sesekali menanyakan
        kesan Anda. Tidak dibagikan ke pihak lain.
      </p>
    </form>
  );
}
