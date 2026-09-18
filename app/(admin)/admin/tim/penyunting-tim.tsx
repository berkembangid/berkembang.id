"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { TeamMember } from "@/content/team";

/**
 * Penyunting profil tim.
 *
 * DUA HAL YANG MEMBEDAKANNYA DARI FORMULIR ADMIN LAIN DI REPO INI.
 *
 * 1. SLUG TIDAK BISA DIUBAH DARI SINI. Ia ikut tercetak di QR kartu nama;
 *    mengubahnya membuat setiap kartu yang sudah beredar menunjuk halaman yang
 *    tidak ada, dan tidak ada cara menariknya kembali. Yang ditampilkan hanya
 *    alamat finalnya, supaya jelas apa yang sedang disunting.
 *
 * 2. KOSONG BERARTI "BELUM DIISI", BUKAN "HAPUS". Bidang yang dikosongkan
 *    jatuh kembali ke nilai di `content/team.ts`, dan yang belum ada tidak
 *    ditampilkan di halaman publik -- bukan ditampilkan kosong.
 */

type Props = { anggota: TeamMember[] };

type Keadaan = "diam" | "menyimpan" | "tersimpan" | "gagal";

function bersih(nilai: string | null | undefined): string {
  const rapi = (nilai ?? "").trim();
  return rapi === "TODO-KONTEN" ? "" : rapi;
}

export function PenyuntingTim({ anggota }: Props) {
  const [aktif, setAktif] = useState(0);
  const orang = anggota[aktif];

  const [form, setForm] = useState(() => siapkan(anggota[0]));
  const [keadaan, setKeadaan] = useState<Keadaan>("diam");
  const [pesan, setPesan] = useState("");

  function siapkan(o: TeamMember) {
    return {
      name: o.name,
      role: bersih(o.role),
      tagline: bersih(o.tagline),
      about: bersih(o.about),
      highlights: (o.highlights ?? []).map((h) => ({ year: bersih(h.year), text: bersih(h.text) })),
      skills: (o.skills ?? []).map(bersih).filter(Boolean),
      tools: (o.tools ?? []).map(bersih).filter(Boolean),
      productRole: bersih(o.productRole),
      links: {
        email: bersih(o.links?.email),
        linkedin: bersih(o.links?.linkedin),
        instagram: bersih(o.links?.instagram),
        scholar: bersih(o.links?.scholar),
      },
      photo: bersih(o.photo),
      ogImage: bersih(o.ogImage),
      vcardPhone: bersih(o.vcardPhone),
    };
  }

  function pindah(i: number) {
    setAktif(i);
    setForm(siapkan(anggota[i]));
    setKeadaan("diam");
    setPesan("");
  }

  async function simpan() {
    setKeadaan("menyimpan");
    setPesan("");
    try {
      const res = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_team_profile", slug: orang.slug, ...form }),
      });
      if (!res.ok) {
        const teks = await res.text();
        throw new Error(teks.slice(0, 200) || `HTTP ${res.status}`);
      }
      setKeadaan("tersimpan");
      setPesan("Tersimpan. Halaman publiknya sudah dibangun ulang.");
    } catch (galat) {
      setKeadaan("gagal");
      setPesan(galat instanceof Error ? galat.message : "Gagal menyimpan.");
    }
  }

  const label = "mb-1.5 block text-xs font-bold text-slate-700";
  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#001b85]";

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <h1 className="text-xl font-black text-slate-900">Profil Tim</h1>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Isi halaman publik <code className="rounded bg-slate-100 px-1">/tim</code>. Yang
        dikosongkan tidak ditampilkan di halaman — bukan ditampilkan kosong.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {anggota.map((o, i) => (
          <button
            key={o.slug}
            type="button"
            onClick={() => pindah(i)}
            className={
              i === aktif
                ? "min-h-10 rounded-full bg-[#001b85] px-4 text-xs font-bold text-white"
                : "min-h-10 rounded-full border border-slate-300 px-4 text-xs font-bold text-slate-600 hover:border-[#001b85]"
            }
          >
            {o.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-bold">Alamat:</span>
        <code>/tim/{orang.slug}</code>
        <a
          href={`/tim/${orang.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 font-bold text-[#001b85] hover:underline"
        >
          Lihat <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
        Alamat ini tercetak di QR kartu nama, jadi tidak bisa diubah dari sini.
      </p>

      <div className="mt-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Nama</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={label}>Peran</label>
            <input
              className={input}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Business **&** Research"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Kata di antara <code>**</code> ditandai chip mint.
            </p>
          </div>
        </div>

        <div>
          <label className={label}>Tagline — satu kalimat</label>
          <input className={input} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </div>

        <div>
          <label className={label}>Tentang — 60–90 kata, orang pertama</label>
          <textarea
            className={`${input} min-h-28`}
            value={form.about}
            onChange={(e) => setForm({ ...form, about: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {form.about.trim() === "" ? 0 : form.about.trim().split(/\s+/).length} kata
          </p>
        </div>

        <div>
          <label className={label}>Sorotan — maksimal 5</label>
          <div className="space-y-2">
            {form.highlights.map((h, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={`${input} w-28 shrink-0`}
                  placeholder="2024"
                  value={h.year}
                  onChange={(e) => {
                    const baru = [...form.highlights];
                    baru[i] = { ...baru[i], year: e.target.value };
                    setForm({ ...form, highlights: baru });
                  }}
                />
                <input
                  className={input}
                  placeholder="Apa yang terjadi"
                  value={h.text}
                  onChange={(e) => {
                    const baru = [...form.highlights];
                    baru[i] = { ...baru[i], text: e.target.value };
                    setForm({ ...form, highlights: baru });
                  }}
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, highlights: form.highlights.filter((_, j) => j !== i) })}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-slate-500 hover:border-red-300 hover:text-red-600"
                  aria-label="Hapus sorotan"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {form.highlights.length < 5 && (
            <button
              type="button"
              onClick={() => setForm({ ...form, highlights: [...form.highlights, { year: "", text: "" }] })}
              className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-600 hover:border-[#001b85]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah sorotan
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Keahlian — maksimal 5, pisahkan koma</label>
            <input
              className={input}
              value={form.skills.join(", ")}
              onChange={(e) =>
                setForm({ ...form, skills: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5) })
              }
            />
          </div>
          <div>
            <label className={label}>Tools — maksimal 6, pisahkan koma</label>
            <input
              className={input}
              value={form.tools.join(", ")}
              onChange={(e) =>
                setForm({ ...form, tools: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6) })
              }
            />
          </div>
        </div>

        <div>
          <label className={label}>Peran di berkembang.id — 2–3 kalimat</label>
          <textarea
            className={`${input} min-h-20`}
            value={form.productRole}
            onChange={(e) => setForm({ ...form, productRole: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["email", "linkedin", "instagram", "scholar"] as const).map((k) => (
            <div key={k}>
              <label className={label}>
                {k === "email" ? "Email" : k === "scholar" ? "Google Scholar" : k[0].toUpperCase() + k.slice(1)}
              </label>
              <input
                className={input}
                value={form.links[k]}
                onChange={(e) => setForm({ ...form, links: { ...form.links, [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Foto — berkas di public/tim/</label>
            <input className={input} value={form.photo} onChange={(e) => setForm({ ...form, photo: e.target.value })} placeholder="hadi.jpg" />
          </div>
          <div>
            <label className={label}>OG image — public/og/</label>
            <input className={input} value={form.ogImage} onChange={(e) => setForm({ ...form, ogImage: e.target.value })} />
          </div>
          <div>
            <label className={label}>Nomor di vCard</label>
            <input
              className={input}
              value={form.vcardPhone}
              onChange={(e) => setForm({ ...form, vcardPhone: e.target.value })}
              placeholder="opsional"
            />
            <p className="mt-1 text-[11px] text-slate-400">Kosong = tidak ikut ke kartu kontak.</p>
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center gap-3">
        <button
          type="button"
          onClick={simpan}
          disabled={keadaan === "menyimpan"}
          className="flex min-h-11 items-center gap-2 rounded-full bg-[#001b85] px-6 text-sm font-bold text-white disabled:opacity-60"
        >
          {keadaan === "menyimpan" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Simpan
        </button>
        {pesan && (
          <p className={keadaan === "gagal" ? "text-xs font-bold text-red-600" : "text-xs font-bold text-emerald-700"}>
            {pesan}
          </p>
        )}
      </div>
    </div>
  );
}
