import { expect, test } from "@playwright/test";

/**
 * Skenario demo Tahap A: "ambil 300 ribu buat SPP anak".
 *
 * Yang dibuktikan: uang yang diambil untuk rumah tidak mengurangi untung
 * bersih; ia pindah ke kotaknya sendiri. Ini jawaban langsung atas keluhan
 * nomor satu riset Depok — uang usaha dan uang rumah tercampur.
 *
 * Uji ini butuh aplikasi yang benar-benar berjalan dengan Supabase asli dan
 * satu akun uji, karena layar konfirmasi memerlukan sesi login. Jalankan:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 *   E2E_EMAIL=... E2E_PASSWORD=... npx playwright test warung-prive
 *
 * Tanpa ketiga variabel itu uji ini dilewati, bukan dianggap lulus.
 */

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasCredentials = Boolean(process.env.PLAYWRIGHT_BASE_URL && email && password);

function rupiah(text: string | null): number {
  if (!text) return 0;
  const digits = text.replace(/[^\d-]/g, "");
  return digits ? Number(digits) : 0;
}

test.describe("uang yang diambil untuk rumah", () => {
  test.skip(
    !hasCredentials,
    "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD dari akun uji.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/kata sandi|password/i).fill(password!);
    await page.getByRole("button", { name: /masuk/i }).click();
    await page.waitForURL(/\/umkm/);
  });

  test("tidak mengurangi untung bersih, hanya menambah kotaknya sendiri", async ({ page }) => {
    await page.goto("/umkm/laporan");
    await page.getByRole("button", { name: "Bulan Ini" }).click();

    const profitBox = page.getByRole("article").filter({ hasText: "Untung bersih" });
    const householdBox = page.getByRole("article").filter({ hasText: "Diambil untuk rumah" });
    await expect(profitBox).toBeVisible();
    const profitBefore = rupiah(await profitBox.textContent());
    const householdBefore = rupiah(await householdBox.textContent());

    await page.goto("/umkm/catat");
    await page.getByRole("button", { name: /ketik|tulis/i }).first().click();
    await page.getByRole("textbox").first().fill("ambil 300 ribu buat SPP anak");
    await page.getByRole("button", { name: /proses|kirim|periksa/i }).first().click();

    await expect(page.getByText(/Item Teridentifikasi/i)).toBeVisible({ timeout: 60_000 });
    // Prior kata pemicu prive harus sudah memilih kategorinya lebih dulu.
    await expect(page.getByRole("button", { name: "Ambil untuk rumah", pressed: true })).toBeVisible();
    await page.getByRole("button", { name: /Simpan Catatan/i }).click();
    await expect(page.getByText(/tersimpan/i)).toBeVisible({ timeout: 30_000 });

    await page.goto("/umkm/laporan");
    await page.getByRole("button", { name: "Bulan Ini" }).click();
    await expect(profitBox).toBeVisible();

    expect(rupiah(await profitBox.textContent())).toBe(profitBefore);
    expect(rupiah(await householdBox.textContent())).toBe(householdBefore + 300_000);

    await page.screenshot({ path: "test-results/warung-bulan-ini.png", fullPage: true });
  });
});
