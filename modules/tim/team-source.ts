import "server-only";
import { z } from "zod";
import { team, type TeamMember } from "@/content/team";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Sumber isi profil tim: basis data di atas berkas.
 *
 * SIAPA YANG MEMANGGIL INI, DAN KAPAN -- ini yang menjaga halamannya tetap
 * cepat.
 *
 * HANYA server, HANYA saat halaman dibangun ulang: sekali saat build, dan
 * setiap kali admin menekan simpan (yang memanggil `revalidatePath`).
 * Pengunjung yang memindai QR menerima HTML yang sudah jadi dan TIDAK pernah
 * menyentuh basis data. Kriteria §5.1 spek (nol request ke API/Supabase) dan
 * LCP 2,38 detik yang sudah terukur tetap berlaku.
 *
 * BERKAS `content/team.ts` ADALAH JARING PENGAMAN, BUKAN SISA.
 *
 * Baris yang belum ada di basis data jatuh kembali ke berkas. Dan kalau
 * pembacaannya GAGAL -- tabelnya belum ada karena migrasi belum terpasang,
 * kunci service role tidak tersedia saat build, koneksinya putus -- seluruh
 * halaman tetap terbit dari berkas.
 *
 * Arah gagal itu dipilih dengan sadar. Alamat halaman ini sudah tercetak di
 * kartu nama: halaman yang menampilkan isi agak lama jauh lebih baik daripada
 * halaman yang gagal dibangun, dan jauh lebih baik daripada halaman kosong
 * yang dibuka orang sambil berdiri di depan pemilik kartunya.
 */

/**
 * Bentuk yang diterima dari basis data.
 *
 * Divalidasi di sini, bukan dipercaya. Kolomnya `jsonb` bebas bentuk, dan satu
 * baris yang bentuknya menyimpang -- entah karena disunting langsung lewat SQL
 * atau karena bentuknya berubah di versi lain -- akan menjatuhkan seluruh
 * halaman saat dirender. Yang tidak lolos diabaikan, dan berkasnya yang
 * dipakai.
 */
const skemaHighlight = z.object({
  year: z.string().trim().max(40).default(""),
  text: z.string().trim().max(240).default(""),
});

export const skemaProfilTim = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).default(""),
  tagline: z.string().trim().max(240).default(""),
  about: z.string().trim().max(1200).default(""),
  highlights: z.array(skemaHighlight).max(5).default([]),
  skills: z.array(z.string().trim().max(60)).max(5).default([]),
  tools: z.array(z.string().trim().max(60)).max(6).default([]),
  productRole: z.string().trim().max(600).default(""),
  links: z
    .object({
      email: z.string().trim().max(160).default(""),
      linkedin: z.string().trim().max(300).default(""),
      instagram: z.string().trim().max(160).default(""),
      scholar: z.string().trim().max(300).default(""),
    })
    .default({ email: "", linkedin: "", instagram: "", scholar: "" }),
  photo: z.string().trim().max(160).default(""),
  ogImage: z.string().trim().max(160).default(""),
  vcardPhone: z.string().trim().max(40).default(""),
});

export type ProfilTimTersimpan = z.infer<typeof skemaProfilTim>;

/** Menggabungkan satu baris basis data di atas nilai bawaan dari berkas. */
function gabung(bawaan: TeamMember, tersimpan: ProfilTimTersimpan): TeamMember {
  // Nilai kosong dari basis data TIDAK menimpa berkas: admin yang mengosongkan
  // sebuah kolom bermaksud "belum diisi", dan yang belum diisi memang tidak
  // ditampilkan -- bukan menghapus isi yang sudah ada di berkas.
  const pakai = (baru: string, lama: string | undefined) => (baru !== "" ? baru : (lama ?? ""));

  return {
    ...bawaan,
    name: tersimpan.name || bawaan.name,
    role: pakai(tersimpan.role, bawaan.role),
    tagline: pakai(tersimpan.tagline, bawaan.tagline ?? ""),
    about: pakai(tersimpan.about, bawaan.about ?? ""),
    highlights: tersimpan.highlights.length > 0 ? tersimpan.highlights : bawaan.highlights,
    skills: tersimpan.skills.length > 0 ? tersimpan.skills : bawaan.skills,
    tools: tersimpan.tools.length > 0 ? tersimpan.tools : bawaan.tools,
    productRole: pakai(tersimpan.productRole, bawaan.productRole ?? ""),
    links: {
      email: pakai(tersimpan.links.email, bawaan.links.email),
      linkedin: pakai(tersimpan.links.linkedin, bawaan.links.linkedin),
      instagram: pakai(tersimpan.links.instagram, bawaan.links.instagram),
      scholar: pakai(tersimpan.links.scholar, bawaan.links.scholar),
    },
    photo: pakai(tersimpan.photo, bawaan.photo),
    ogImage: pakai(tersimpan.ogImage, bawaan.ogImage),
    vcardPhone: pakai(tersimpan.vcardPhone, bawaan.vcardPhone),
  };
}

/** Seluruh anggota, basis data di atas berkas. Tidak pernah melempar. */
export async function muatTim(): Promise<TeamMember[]> {
  let tersimpan: Array<{ slug: string; data: unknown }> = [];

  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.from("team_profiles").select("slug, data");
    if (error) throw error;
    tersimpan = data ?? [];
  } catch {
    // Diam dengan sengaja, dan hanya di sini. Tabelnya mungkin belum ada
    // karena migrasinya belum terpasang -- keadaan yang memang diharapkan
    // selama masa peralihan. Berkasnya yang dipakai, halamannya tetap terbit.
    return team;
  }

  const perSlug = new Map<string, ProfilTimTersimpan>();
  for (const baris of tersimpan) {
    const hasil = skemaProfilTim.safeParse(baris.data);
    if (hasil.success) perSlug.set(baris.slug, hasil.data);
  }

  return team.map((bawaan) => {
    const dari = perSlug.get(bawaan.slug);
    return dari ? gabung(bawaan, dari) : bawaan;
  });
}

/** Satu anggota, atau `null` bila slug-nya tidak dikenal. */
export async function muatAnggota(slug: string): Promise<TeamMember | null> {
  const semua = await muatTim();
  return semua.find((orang) => orang.slug === slug) ?? null;
}
