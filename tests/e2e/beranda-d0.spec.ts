import { expect, test } from "@playwright/test";

/**
 * Lima temuan Beranda 3 September, satu uji per temuan.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD, karena
 * semuanya menuntut aplikasi berjalan dan basis data yang sudah dimigrasi
 * sampai `0040`.
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
});

test("@smoke 1. beli meja masuk daftar alat, bukan biaya bulan ini", async ({ page }) => {
  await page.goto("/umkm/catat");
  await page.getByRole("button", { name: /tulis|teks/i }).first().click();
  await page.getByRole("textbox").first().fill("beli meja 800 ribu");
  await page.getByRole("button", { name: /proses|kirim|lanjut/i }).first().click();
  // Kategori 8 "Beli alat / aset" harus terpilih, bukan kategori 6.
  await expect(page.getByText(/beli alat/i)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/d0-1-meja.png", fullPage: true });
});

test("2. kartu uang hari ini menyebut sumber angkanya", async ({ page }) => {
  await page.goto("/umkm");
  await expect(page.getByText("Sisa uang hari ini").first()).toBeVisible();
  await expect(page.getByText(/dari catatan yang sudah anda cek/i)).toBeVisible();
  await page.screenshot({ path: "test-results/d0-2-kartu-uang.png", fullPage: true });
});

test("3. tutup kas membuka tanggal yang benar", async ({ page }) => {
  await page.goto("/umkm");
  await page.getByRole("link", { name: /tutup kas/i }).first().click();
  await page.waitForURL(/tutup-kas=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText(/tutup kas/i).first()).toBeVisible();
  await page.screenshot({ path: "test-results/d0-3-tutup-kas.png", fullPage: true });
});

test("4. tidak ada istilah akuntan di Beranda", async ({ page }) => {
  await page.goto("/umkm");
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const term of ["arus kas", "ekuitas", "liabilitas", "neraca", "akrual", "debit", "kredit"]) {
    expect(body, term).not.toContain(term);
  }
  await page.screenshot({ path: "test-results/d0-4-kamus.png", fullPage: true });
});

test("5. aktivitas tidak menampilkan nominal dua kali", async ({ page }) => {
  await page.goto("/umkm");
  const rows = page.getByRole("link").filter({ hasText: /tercatat/i });
  const total = await rows.count();
  for (let index = 0; index < Math.min(total, 5); index += 1) {
    const text = await rows.nth(index).innerText();
    const amounts = text.match(/Rp[\d.]+/g) ?? [];
    expect(amounts.length, text).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: "test-results/d0-5-aktivitas.png", fullPage: true });
});
