import { muatAnggota, muatTim } from "@/modules/tim/team-source";
import { namaBerkasVcard, susunVcard } from "@/modules/tim/vcard";

/**
 * `GET /tim/<slug>/vcard` — unduhan .vcf (H5).
 *
 * Statis penuh, sama seperti halamannya: `generateStaticParams` membuat
 * keempatnya saat build, jadi tidak ada fungsi server yang menyala ketika
 * seseorang menekan "Simpan kontak" di lobi.
 *
 * ALAMAT PROFIL DI DALAM .VCF DIBACA DARI `APP_URL`.
 *
 * Bukan dari host permintaan. Kontak ini tersimpan di buku alamat orang lain
 * dan tidak bisa diperbaiki belakangan: bila seseorang membuka halaman lewat
 * alamat pratinjau atau lewat apex yang mengalihkan, URL yang ikut tersimpan
 * harus tetap alamat resminya.
 */

export const revalidate = false;

export async function generateStaticParams() {
  return (await muatTim()).map((orang) => ({ slug: orang.slug }));
}

export async function GET(
  _permintaan: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const orang = await muatAnggota(slug);
  if (!orang) {
    return new Response("Profil tidak ditemukan.", { status: 404 });
  }

  const pangkalan = (process.env.APP_URL ?? "https://www.berkembang.id").replace(/\/$/, "");
  const vcf = susunVcard(orang, `${pangkalan}/tim/${orang.slug}`);

  return new Response(vcf, {
    headers: {
      // `charset=utf-8` bukan hiasan: nama organisasinya memuat tanda pisah
      // panjang, dan tanpa charset sebagian klien menampilkannya rusak.
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${namaBerkasVcard(orang.slug)}"`,
      "cache-control": "public, max-age=3600",
    },
  });
}
