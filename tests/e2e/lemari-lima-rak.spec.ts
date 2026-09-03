import { expect, test } from "@playwright/test";

/**
 * Halaman Dokumen sebagai lemari lima rak (P1–P7).
 *
 * Yang diuji di sini sebagian besar adalah hal yang **tidak boleh ada**: kartu
 * unggah laporan keuangan, kartu riwayat QRIS, lencana merah "Wajib", dan
 * kartu Akta Pendirian bagi usaha perorangan. Menguji ketiadaan penting karena
 * tidak ada satu pun uji lain yang bisa melakukannya — sebuah kartu yang
 * kembali muncul setelah refactor akan lolos typecheck, unit, dan build tanpa
 * satu pun berteriak.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.");

test.beforeEach(async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
  await page.goto("/umkm/upload");
});

test("@smoke lima rak tampil berurutan sesuai perjalanan pemilik", async ({ page }) => {
  const headings = page.getByRole("heading", { level: 2 });
  const titles = (await headings.allInnerTexts()).map((text) => text.trim());
  const shelves = [
    "Identitas saya",
    "Izin usaha",
    "Nota & bukti",
    "Alat & perjanjian",
    "Laporan yang pernah dibuat",
  ];
  const positions = shelves.map((shelf) => titles.findIndex((title) => title.startsWith(shelf)));
  for (const [index, position] of positions.entries()) {
    expect(position, shelves[index]).toBeGreaterThanOrEqual(0);
  }
  // Urutannya bagian dari maksudnya, bukan kebetulan.
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  await page.screenshot({ path: "test-results/rak-1-lima-rak.png", fullPage: true });
});

test("kartu sumber data sudah tidak ditawarkan", async ({ page }) => {
  const body = await page.locator("main").innerText();
  // Menerima unggahan laporan jadi membuka jalan pintas melewati inti produk.
  expect(body).not.toContain("Laporan Keuangan");
  // Riwayat QRIS adalah sumber data untuk rekonsiliasi, bukan dokumen.
  expect(body).not.toContain("Riwayat QRIS");
  // Kelompok lama menyusun berkas menurut cara bank memandangnya.
  expect(body).not.toContain("Keuangan & Transaksi");
  expect(body).not.toContain("Bukti Pendukung Usaha");
  await page.screenshot({ path: "test-results/rak-2-tanpa-sumber-data.png", fullPage: true });
});

test("akun perorangan tidak dimintai Akta Pendirian", async ({ page }) => {
  // Kalau kartunya tetap ada, penghitung "X dari Y" membuat pemilik
  // perorangan selamanya kurang satu dokumen yang tidak pernah bisa ia buat.
  await expect(page.getByText("Akta Pendirian")).toHaveCount(0);
  await page.screenshot({ path: "test-results/rak-3-perorangan.png", fullPage: true });
});

test("dokumen yang belum ada bukan kegagalan berwarna merah", async ({ page }) => {
  await expect(page.getByText("Fondasi").first()).toBeVisible();
  // "Wajib" merah adalah rapor. Merah hanya untuk kegagalan sistem.
  await expect(page.getByText(/^Wajib$/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/rak-4-fondasi.png", fullPage: true });
});

test("NPWP disebut disarankan, bukan wajib, untuk usaha pangan olahan", async ({ page }) => {
  // Ia baru relevan saat penjualan setahun mendekati Rp500 juta. Menyebutnya
  // wajib padahal tidak membuat pemilik berhenti percaya pada seluruh daftar.
  const npwpCard = page.locator("article").filter({ hasText: "NPWP" }).first();
  await expect(npwpCard).toBeVisible();
  await expect(npwpCard.getByText("Fondasi")).toHaveCount(0);
  await page.screenshot({ path: "test-results/rak-5-npwp.png", fullPage: true });
});

test("unggah menawarkan kamera lebih dulu", async ({ page }) => {
  // Dokumen usaha ada dalam bentuk kertas di laci, bukan berkas di ponsel.
  await expect(page.getByText("Foto dokumennya").first()).toBeVisible();
  const cameraInput = page.locator('input[capture="environment"]').first();
  await expect(cameraInput).toHaveAttribute("accept", /image/);
  await page.screenshot({ path: "test-results/rak-6-kamera.png", fullPage: true });
});

test("rak nota menjelaskan dirinya saat masih kosong", async ({ page }) => {
  const shelf = page.locator("section").filter({ hasText: "Nota & bukti" }).first();
  const text = await shelf.innerText();
  expect(
    text.includes("Nota akan muncul di sini saat kamu memfotonya dari catatan")
      || text.includes("menempel pada satu catatan"),
    "rak nota harus menjelaskan dirinya, entah kosong atau terisi",
  ).toBe(true);
  await page.screenshot({ path: "test-results/rak-7-nota.png", fullPage: true });
});
