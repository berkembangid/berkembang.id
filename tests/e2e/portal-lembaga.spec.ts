import { expect, test, type Page } from "@playwright/test";

/**
 * Portal lembaga dari ujung ke ujung: Temukan → Ajukan ketertarikan →
 * Permintaan → Dosir, ditambah panel pemberitahuan.
 *
 * Portal ini dulu sama sekali tidak punya uji E2E -- seluruh spesifikasi di
 * folder ini berjalan sebagai pemilik UMKM. Persetujuan admin tidak disimulasikan
 * di sini (ia butuh akun kedua); yang diuji adalah bahwa setiap layar memuat
 * datanya sendiri, menyebut UMKM dengan kodenya, dan tidak pernah menampilkan
 * kata "Kandidat" sebagai ganti kode.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_LEMBAGA_EMAIL, dan
 * E2E_LEMBAGA_PASSWORD. Akunnya harus anggota aktif sebuah lembaga, dan basis
 * datanya sudah dimigrasi sampai `0106`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_LEMBAGA_EMAIL;
const password = process.env.E2E_LEMBAGA_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_LEMBAGA_EMAIL, dan E2E_LEMBAGA_PASSWORD.");

async function login(page: Page) {
  await page.goto("/auth/login");
  const tab = page.getByRole("button", { name: /^lembaga$/i });
  if (await tab.count()) await tab.first().click();
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /^masuk/i }).click();
  await page.waitForURL(/\/lembaga/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("Temukan memuat kandidat dengan kode dan tingkatnya", async ({ page }) => {
  await page.goto("/lembaga");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const firstCard = page.locator("article").first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  await expect(firstCard.getByText(/^UMKM-[A-Z0-9]{8}$/).first()).toBeVisible();
  await expect(firstCard.getByTitle("Tingkat kesiapan")).toBeVisible();
});

test("dialog Ajukan ketertarikan menampilkan sisa kuota dan tertutup dengan Esc", async ({ page }) => {
  await page.goto("/lembaga");
  const ajukan = page.getByRole("button", { name: /ajukan ketertarikan/i }).first();
  test.skip(!(await ajukan.isVisible({ timeout: 30_000 }).catch(() => false)), "Tidak ada kandidat yang bisa diajukan.");
  await ajukan.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/permintaan hari ini|kuota permintaan hari ini sudah habis/i)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Permintaan dan Dosir menyebut kode UMKM, bukan 'Kandidat'", async ({ page }) => {
  for (const path of ["/lembaga/permintaan", "/lembaga/dosir"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Tunggu kerangka muat hilang, lalu pastikan tidak ada kartu berjudul "Kandidat".
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^Kandidat$/ })).toHaveCount(0);
  }
});

test("lonceng membuka panel pemberitahuan tanpa berpindah halaman", async ({ page }) => {
  await page.goto("/lembaga/tersimpan");
  await page.getByRole("button", { name: /buka pemberitahuan/i }).click();
  await expect(page.getByRole("dialog", { name: /pemberitahuan/i })).toBeVisible();
  await expect(page).toHaveURL(/\/lembaga\/tersimpan/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /pemberitahuan/i })).toBeHidden();
});

test("alamat lama dialihkan ke alamat baru", async ({ page }) => {
  await page.goto("/institusi/dossiers");
  await expect(page).toHaveURL(/\/lembaga\/dosir$/);
});
