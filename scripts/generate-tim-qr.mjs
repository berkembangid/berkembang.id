/**
 * Membuat QR untuk kartu nama tim.
 *
 *   npm run qr:tim                          -- memakai APP_URL, memeriksanya dulu
 *   npm run qr:tim -- --base https://...    -- alamat lain
 *   npm run qr:tim -- --lewati-periksa      -- tanpa memeriksa (lihat peringatan)
 *
 * SATU HAL YANG MEMBEDAKAN INI DARI PEMBUAT QR LAIN.
 *
 * Ia MEMERIKSA alamatnya lebih dulu, dan menolak menulis berkas apa pun kalau
 * salah satu profil tidak menjawab 200.
 *
 * Alasannya sederhana dan tidak bisa diperbaiki belakangan: kartu nama
 * dicetak. Seratus lembar dengan QR menuju halaman 404 bukan bug yang bisa
 * di-deploy ulang -- ia sudah ada di dompet orang lain, dan satu-satunya
 * perbaikannya mencetak ulang semuanya. Beberapa detik memeriksa di sini
 * menggantikan biaya itu.
 *
 * Tiga sebab paling sering QR kartu nama menunjuk halaman mati, dan semuanya
 * tertangkap pemeriksaan ini:
 *
 *   - alamatnya `berkembang.id` padahal yang melayani `www.berkembang.id`
 *   - slug diubah sesudah kartunya dicetak
 *   - halamannya belum ter-deploy saat kartunya dikirim ke tukang cetak
 *
 * BENTUK BERKASNYA.
 *
 *   public/tim/qr-<slug>.svg   untuk desain kartu (vektor, tidak pecah)
 *   public/tim/qr-<slug>.png   1024 px, untuk alat yang menolak SVG
 *
 * SVG yang dipakai, bukan PNG, kalau alat desainnya menerima: QR adalah
 * gambar garis, dan garis yang dicetak dari vektor tetap tajam pada ukuran
 * apa pun. QR yang pecah gagal dipindai justru di cahaya redup ruang pameran.
 *
 * KOREKSI GALAT LEVEL "H".
 *
 * Level tertinggi: sampai 30% permukaannya boleh rusak dan masih terbaca.
 * Kartu nama dilipat, tergores, dan terkena air, jadi ini bukan kemewahan.
 * Konsekuensinya QR-nya lebih rapat -- karena itu ukuran cetaknya minimal
 * 2 cm, dan itu disebutkan di keluarannya.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import QRCode from "qrcode";
import { readFileSync } from "node:fs";

const tim = JSON.parse(readFileSync(path.resolve("config/tim.json"), "utf8"));
const anggota = tim.anggota ?? [];

function berhenti(...baris) {
  console.error(baris.join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const lewatiPeriksa = argv.includes("--lewati-periksa");
const iBase = argv.indexOf("--base");
const pangkalan = (
  iBase >= 0 ? argv[iBase + 1] : process.env.APP_URL ?? "https://www.berkembang.id"
)?.replace(/\/$/, "");

if (!pangkalan || !/^https:\/\/[^/]+$/.test(pangkalan)) {
  berhenti(
    `Alamat pangkalan tidak sah: ${JSON.stringify(pangkalan)}`,
    "",
    "Harus berbentuk https://domain-anda.com tanpa garis miring di ujung.",
    "  npm run qr:tim -- --base https://www.berkembang.id",
  );
}

if (anggota.length === 0) berhenti("config/tim.json belum memuat satu anggota pun.");

const slugGanda = anggota
  .map((orang) => orang.slug)
  .filter((slug, i, semua) => semua.indexOf(slug) !== i);
if (slugGanda.length > 0) {
  berhenti(
    `Slug kembar: ${[...new Set(slugGanda)].join(", ")}.`,
    "Dua orang dengan slug sama berarti satu kartu menuju profil orang lain.",
  );
}

// ---------------------------------------------------------------------------
// Periksa alamatnya SEBELUM menulis apa pun
// ---------------------------------------------------------------------------

const sasaran = anggota.map((orang) => ({
  slug: orang.slug,
  nama: orang.nama,
  alamat: `${pangkalan}/tim/${orang.slug}`,
}));

if (lewatiPeriksa) {
  console.log("Pemeriksaan alamat DILEWATI.\n");
  console.log("  Kalau berkas ini dipakai mencetak kartu, QR-nya bisa menuju halaman");
  console.log("  yang tidak ada, dan kartu yang sudah tercetak tidak bisa ditarik.\n");
} else {
  console.log(`Memeriksa ${sasaran.length} alamat di ${pangkalan} ...\n`);
  const gagal = [];
  for (const s of sasaran) {
    let status = 0;
    try {
      const r = await fetch(s.alamat, { redirect: "follow" });
      status = r.status;
    } catch (galat) {
      status = `tidak tersambung (${galat.message})`;
    }
    const lulus = status === 200;
    console.log(`  ${lulus ? "OK  " : "GAGAL"}  ${s.alamat}  ${lulus ? "" : `→ ${status}`}`);
    if (!lulus) gagal.push({ ...s, status });
  }

  if (gagal.length > 0) {
    berhenti(
      "",
      `${gagal.length} dari ${sasaran.length} alamat tidak menjawab 200. Tidak ada berkas yang ditulis.`,
      "",
      "Yang paling sering:",
      "  - halamannya belum ter-deploy. Periksa Vercel → Deployments",
      "  - alamatnya salah host: apex mengalihkan, yang melayani www",
      "  - slug di config/tim.json berbeda dari yang ter-deploy",
      "",
      "Kalau memang ingin membuat QR-nya sebelum halamannya hidup:",
      "  npm run qr:tim -- --lewati-periksa",
      "",
      "Tetapi jangan mencetaknya sebelum pemeriksaan ini hijau.",
    );
  }
  console.log("\nSeluruh alamat menjawab 200.\n");
}

// ---------------------------------------------------------------------------
// Tulis berkasnya
// ---------------------------------------------------------------------------

const folder = path.resolve("public/tim");
await mkdir(folder, { recursive: true });

const opsi = {
  errorCorrectionLevel: "H",
  margin: 1,
  color: { dark: "#001b85", light: "#ffffff" },
};

for (const s of sasaran) {
  const svg = await QRCode.toString(s.alamat, { ...opsi, type: "svg" });
  await writeFile(path.join(folder, `qr-${s.slug}.svg`), svg, "utf8");

  const png = await QRCode.toBuffer(s.alamat, { ...opsi, type: "png", width: 1024 });
  await writeFile(path.join(folder, `qr-${s.slug}.png`), png);

  console.log(`  ${s.nama.padEnd(10)} public/tim/qr-${s.slug}.svg  +  .png`);
}

console.log(`
Selesai. ${sasaran.length} QR dibuat, warnanya biru Berkembang (#001b85).

Saat menaruhnya di kartu nama:

  - cetak minimal 2 cm x 2 cm. Koreksi galatnya level H, jadi polanya rapat;
    lebih kecil dari itu mulai gagal dipindai di cahaya redup
  - sisakan ruang putih di sekelilingnya, jangan sampai terpotong pinggir kartu
  - pakai yang .svg kalau alat desainnya menerima, supaya tidak pecah
  - jangan taruh di atas foto atau warna gelap: pemindai butuh kontras
  - pindai sendiri satu kartu contoh sebelum mencetak seratus`);
