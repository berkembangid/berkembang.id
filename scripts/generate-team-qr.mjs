/**
 * QR untuk kartu nama tim (H10).
 *
 *   npm run qr:team                       -- memakai APP_URL, memeriksa dulu
 *   npm run qr:team -- --base https://... -- alamat lain
 *   npm run qr:team -- --lewati-periksa   -- tanpa memeriksa (lihat peringatan)
 *
 * Keluaran ke `docs/brand/qr/`:
 *   <slug>.svg        vektor, untuk diserahkan ke desain kartu
 *   <slug>-1200.png   1200 px, untuk alat yang menolak SVG
 *
 * TIGA HAL YANG MEMBEDAKANNYA DARI GENERATOR QR DARING.
 *
 * 1. IA MEMERIKSA ALAMATNYA LEBIH DULU, dan menolak menulis apa pun bila ada
 *    profil yang tidak menjawab 200.
 *
 *    Alasannya tidak bisa diperbaiki belakangan: kartu nama DICETAK. Seratus
 *    lembar dengan QR menuju 404 bukan bug yang bisa di-deploy ulang -- ia
 *    sudah ada di dompet orang lain, dan satu-satunya perbaikannya mencetak
 *    ulang semuanya.
 *
 * 2. IA MEN-DECODE HASILNYA SENDIRI. Setiap PNG dibaca kembali dan dipindai
 *    seperti kamera memindainya, lalu isinya dibandingkan dengan alamat yang
 *    dimaksud. Membandingkan berkas dengan hasil enkode ulang hanya
 *    membuktikan pustakanya konsisten dengan dirinya sendiri; men-decode
 *    membuktikan pemindai bisa membacanya.
 *
 * 3. QUIET ZONE 4 MODUL, bukan 1. Spesifikasi QR menuntut pita putih selebar
 *    empat modul di sekeliling pola. Versi sebelumnya di repo ini memakai 1 --
 *    tampak lebih rapat dan lebih cantik di layar, dan justru itu yang gagal
 *    dipindai dari cetakan kecil ketika latar kartunya berwarna.
 *
 * KOREKSI GALAT LEVEL M, SESUAI H10 -- bukan H.
 *
 * H (30%) menghasilkan pola jauh lebih rapat untuk alamat yang sama, dan pada
 * cetakan 2x2 cm kerapatan itu sendiri menjadi penyebab gagal pindai. M (15%)
 * sudah cukup untuk kartu yang terlipat, dengan modul yang lebih besar.
 *
 * TANPA LOGO DI TENGAH. Logo memakan kapasitas koreksi galat yang sama yang
 * dipakai menahan lipatan dan goresan. Untuk kartu sekecil ini, keandalan
 * pindai menang atas gaya.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import QRCode from "qrcode";
import jsQR from "jsqr";
import sharp from "sharp";

// `content/team.ts` adalah TypeScript, jadi slug-nya dibaca dari teks sumber,
// bukan diimpor. Menambah langkah kompilasi hanya untuk sebuah daftar slug
// membuat skrip ini bergantung pada perkakas yang bisa rusak sendiri.
const sumberTeam = await readFile(path.resolve("content/team.ts"), "utf8");
const anggota = [...sumberTeam.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);

function berhenti(...baris) {
  console.error(baris.join("\n"));
  process.exit(1);
}

if (anggota.length === 0) berhenti("Tidak ada slug yang terbaca dari content/team.ts.");

const kembar = anggota.filter((s, i) => anggota.indexOf(s) !== i);
if (kembar.length > 0) {
  berhenti(
    `Slug kembar: ${[...new Set(kembar)].join(", ")}.`,
    "Dua orang dengan slug sama berarti satu kartu menuju profil orang lain.",
  );
}

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const lewatiPeriksa = argv.includes("--lewati-periksa");
const iBase = argv.indexOf("--base");
const pangkalan = (
  iBase >= 0 ? argv[iBase + 1] : (process.env.APP_URL ?? "https://www.berkembang.id")
)?.replace(/\/$/, "");

if (!pangkalan || !/^https:\/\/[^/]+$/.test(pangkalan)) {
  berhenti(
    `Alamat pangkalan tidak sah: ${JSON.stringify(pangkalan)}`,
    "Harus berbentuk https://domain-anda.com tanpa garis miring di ujung.",
  );
}

// `?src=card` (H7): menandai kunjungan yang datang dari kartu cetak. Ia ikut
// masuk ke QR sekarang karena tidak bisa ditambahkan sesudah kartunya dicetak,
// walau pencatatannya sendiri belum ada -- lihat TODO di serah-terima.
const sasaran = anggota.map((slug) => ({
  slug,
  alamat: `${pangkalan}/tim/${slug}`,
  alamatQr: `${pangkalan}/tim/${slug}?src=card`,
}));

// ---------------------------------------------------------------------------
// Periksa alamatnya SEBELUM menulis apa pun
// ---------------------------------------------------------------------------

if (lewatiPeriksa) {
  console.log("Pemeriksaan alamat DILEWATI.\n");
  console.log("  Kalau berkas ini dipakai mencetak kartu, QR-nya bisa menuju halaman");
  console.log("  yang tidak ada, dan kartu yang sudah tercetak tidak bisa ditarik.\n");
} else {
  console.log(`Memeriksa ${sasaran.length} alamat di ${pangkalan} ...\n`);
  const gagal = [];
  for (const s of sasaran) {
    let status;
    try {
      status = (await fetch(s.alamat, { redirect: "follow" })).status;
    } catch (galat) {
      status = `tidak tersambung (${galat.message})`;
    }
    const lulus = status === 200;
    console.log(`  ${lulus ? "OK   " : "GAGAL"}  ${s.alamat}${lulus ? "" : `  -> ${status}`}`);
    if (!lulus) gagal.push(s);
  }

  if (gagal.length > 0) {
    berhenti(
      "",
      `${gagal.length} dari ${sasaran.length} alamat tidak menjawab 200. Tidak ada berkas yang ditulis.`,
      "",
      "Yang paling sering:",
      "  - halamannya belum ter-deploy. Periksa Vercel -> Deployments",
      "  - alamatnya salah host: apex mengalihkan, yang melayani www",
      "  - slug di content/team.ts berbeda dari yang ter-deploy",
      "",
      "Kalau memang perlu membuatnya sebelum halamannya hidup:",
      "  npm run qr:team -- --lewati-periksa",
      "",
      "Tetapi jangan mencetaknya sebelum pemeriksaan ini hijau.",
    );
  }
  console.log("\nSeluruh alamat menjawab 200.\n");
}

// ---------------------------------------------------------------------------
// Tulis, lalu decode kembali
// ---------------------------------------------------------------------------

const folder = path.resolve("docs/brand/qr");
await mkdir(folder, { recursive: true });

const opsi = {
  errorCorrectionLevel: "M",
  margin: 4,
  color: { dark: "#001b85", light: "#ffffff" },
};

const gagalDecode = [];

for (const s of sasaran) {
  const svg = await QRCode.toString(s.alamatQr, { ...opsi, type: "svg" });
  await writeFile(path.join(folder, `${s.slug}.svg`), svg, "utf8");

  const berkasPng = path.join(folder, `${s.slug}-1200.png`);
  await writeFile(berkasPng, await QRCode.toBuffer(s.alamatQr, { ...opsi, type: "png", width: 1200 }));

  // Dipindai kembali seperti kamera memindainya.
  const { data, info } = await sharp(berkasPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const terbaca = jsQR(new Uint8ClampedArray(data), info.width, info.height);

  const cocok = terbaca?.data === s.alamatQr;
  if (!cocok) gagalDecode.push({ ...s, terbaca: terbaca?.data ?? "(tidak terbaca)" });

  console.log(
    `  ${s.slug.padEnd(8)} ${cocok ? "decode OK" : "DECODE GAGAL"}  ${s.slug}.svg + ${s.slug}-1200.png`,
  );
}

if (gagalDecode.length > 0) {
  berhenti(
    "",
    `${gagalDecode.length} QR tidak terbaca kembali dengan benar:`,
    ...gagalDecode.map((g) => `  ${g.slug}: dibaca "${g.terbaca}", seharusnya "${g.alamatQr}"`),
    "",
    "Jangan dicetak.",
  );
}

console.log(`
Selesai. ${sasaran.length} QR di docs/brand/qr/, seluruhnya terbukti terbaca kembali.

Untuk desain kartu:
  - cetak minimal 2 cm x 2 cm
  - SVG sudah memuat quiet zone 4 modul; JANGAN dipotong sampai ke tepi pola
  - jangan taruh di atas foto atau warna gelap: pemindai butuh kontras
  - jangan tambahkan logo di tengah
  - pindai sendiri satu kartu contoh sebelum mencetak seratus`);
