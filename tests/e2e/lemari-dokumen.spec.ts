import { expect, test, type Page } from "@playwright/test";

/**
 * Lemari dokumen: bukti yang menempel ke pembukuan (Tahap D-A dan rak E).
 *
 * Yang diuji di sini bukan bahwa tombolnya ada, melainkan bahwa satu foto nota
 * benar-benar sampai ke tiga tempat sekaligus: catatan uangnya, alat yang lahir
 * dari pembelian itu, dan baris jurnal yang dibaca pemeriksa. Ketiganya tidak
 * pernah disentuh layar mana pun — basis data yang menghubungkannya — jadi
 * satu-satunya cara memastikannya masih tersambung adalah menelusurinya dari
 * ujung ke ujung.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD, karena
 * semuanya menuntut aplikasi berjalan dan basis data yang sudah dimigrasi
 * sampai `0044`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.");

/**
 * JPEG sah paling kecil yang bisa dibuat: satu piksel abu-abu.
 *
 * Sengaja berupa bita di dalam berkas uji, bukan berkas fixture terpisah.
 * Berkas biner di dalam repo tidak pernah dibaca siapa pun saat ditinjau, dan
 * yang penting di sini hanya satu hal — bahwa isinya benar-benar JPEG,
 * karena unggahan memeriksa bita ajaibnya dan akan menolak berkas palsu.
 */
const onePixelJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
}

/** Mencatat satu transaksi lewat jalur ketik, sampai kartu tersimpan muncul. */
async function recordTyped(page: Page, sentence: string) {
  await page.goto("/umkm/catat");
  await page.getByRole("button", { name: /tulis|teks/i }).first().click();
  await page.getByRole("textbox").first().fill(sentence);
  await page.getByRole("button", { name: /proses|kirim|lanjut/i }).first().click();
  await page.getByRole("button", { name: /simpan/i }).first().click({ timeout: 60_000 });
  await expect(page.getByText("Catatan berhasil disimpan")).toBeVisible({ timeout: 60_000 });
}

/** Memasang foto ke input berkas yang tersembunyi di balik tombol kamera. */
async function attachPhoto(page: Page) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "nota.jpg",
    mimeType: "image/jpeg",
    buffer: onePixelJpeg,
  });
  await expect(page.getByText(/foto nota tersimpan/i)).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("@smoke beli kulkas: nota menempel ke catatan, ke alat, dan terlihat di jurnal", async ({
  page,
}) => {
  await recordTyped(page, "beli kulkas 3 juta");

  // Pembelian alat selalu diajak berbukti, berapa pun nilainya: barisnya akan
  // hidup bertahun-tahun di pembukuan sebagai alat yang disusutkan.
  await expect(page.getByText(/fotokan notanya/i)).toBeVisible();
  await expect(page.getByText(/daftar alat usaha/i)).toBeVisible();
  await page.screenshot({ path: "test-results/lemari-1-ajakan.png", fullPage: true });

  await attachPhoto(page);
  await page.screenshot({ path: "test-results/lemari-2-tersimpan.png", fullPage: true });

  // Alatnya terdaftar. Ini yang membuktikan kategori 8 melahirkan baris alat.
  await page.goto("/umkm/laporan");
  await page.getByRole("tab", { name: /kondisi/i }).first().click();
  await expect(page.getByText(/kulkas/i).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/lemari-3-alat.png", fullPage: true });

  // Klip muncul di Mode Akuntan. Inilah gunanya seluruh rak bukti bagi orang
  // yang memeriksa pembukuan: dari satu baris jurnal, buktinya satu ketukan.
  await page.goto("/umkm/akuntan");
  const clip = page.getByRole("button", { name: /lihat bukti/i }).first();
  await expect(clip).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/lemari-4-klip.png", fullPage: true });
});

test("belanja kecil tidak diganggu ajakan foto", async ({ page }) => {
  // Warung mencatat belanja Rp5.000 belasan kali sehari. Ajakan yang muncul
  // setiap kali akan berhenti dibaca dalam sehari.
  await recordTyped(page, "beli gula 20 ribu");
  await expect(page.getByText(/foto nota|fotokan/i)).toHaveCount(0);
  await page.screenshot({ path: "test-results/lemari-5-tenang.png", fullPage: true });
});

test("Pintu C: bukti bisa ditempel belakangan dari riwayat", async ({ page }) => {
  await recordTyped(page, "beli beras 200 ribu");
  await page.goto("/umkm/laporan");

  await page.getByRole("button", { name: /tambah bukti/i }).first().click();
  await expect(page.getByText(/tambah bukti/i).first()).toBeVisible();
  await attachPhoto(page);

  // Penandanya muncul di baris setelah daftar dimuat ulang.
  await expect(page.getByText(/ada bukti|[0-9]+ bukti/i).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/lemari-6-pintu-c.png", fullPage: true });
});

test("rak E: laporan yang diunduh tersimpan dengan nomornya", async ({ page }) => {
  await page.goto("/umkm/laporan");
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: /berkas laporan|unduh/i }).first().click();
  await download;

  await page.goto("/umkm/upload");
  await expect(page.getByRole("heading", { name: /laporan yang pernah dibuat/i })).toBeVisible();
  // Nomor penerbitan tercetak di kaki halaman berkasnya DAN tampil di sini;
  // itulah yang mencocokkan berkas yang dipegang pembaca dengan barisnya.
  await expect(page.getByText(/No\. BRK-\d{8}-/).first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/lemari-7-rak-e.png", fullPage: true });
});
