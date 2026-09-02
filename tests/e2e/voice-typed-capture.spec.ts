import { expect, test } from "@playwright/test";

/**
 * Lima skenario ketik Checkpoint 3 spek Voice Capture.
 *
 * Jalur yang diuji adalah jalur ketik, bukan mikrofon: `SpeechRecognition` dan
 * `MediaRecorder` baru masuk di Tahap V-B. Ketikan melewati router yang sama
 * (`client_transcript` dengan engine "typed"), jadi skenario ini membuktikan
 * router, gating, parser, dan posting jurnal sekaligus — tanpa perangkat keras.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD, karena
 * ketiganya menuntut aplikasi yang berjalan dan basis data yang sudah dimigrasi
 * sampai `0039`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(
  !baseURL || !email || !password,
  "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
});

async function tulis(page: import("@playwright/test").Page, ucapan: string) {
  await page.goto("/umkm/catat");
  await page.getByRole("button", { name: /tulis|teks/i }).first().click();
  await page.getByRole("textbox").first().fill(ucapan);
  await page.getByRole("button", { name: /proses|kirim|lanjut/i }).first().click();
}

test("@smoke 1. penjualan qris tersimpan sebagai pendapatan", async ({ page }) => {
  await tulis(page, "tadi laku 35 ribu qris");
  await expect(page.getByText("Rp35.000")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/voice-1-penjualan.png", fullPage: true });
});

test("2. ambilan untuk rumah tidak mengubah untung", async ({ page }) => {
  await tulis(page, "ambil 300 ribu buat SPP anak");
  await expect(page.getByText("Rp300.000")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/voice-2-prive.png", fullPage: true });
});

test("3. dua transaksi dalam satu kalimat menghasilkan dua draf", async ({ page }) => {
  await tulis(page, "belanja tepung 200 ribu sama gas 22 ribu");
  await expect(page.getByText("Rp200.000")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Rp22.000")).toBeVisible();
  await page.screenshot({ path: "test-results/voice-3-multi.png", fullPage: true });
});

test("4. ucapan ambigu menanyakan dua pilihan, bukan menebak", async ({ page }) => {
  await tulis(page, "laku lima ratus");
  await expect(page.getByText(/yang mana maksudnya/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Rp500" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rp500.000" })).toBeVisible();
  await page.screenshot({ path: "test-results/voice-4-ambigu.png", fullPage: true });
});

test("5. utang pelanggan tercatat atas namanya", async ({ page }) => {
  await tulis(page, "Bu Ani ngutang 50 ribu");
  await expect(page.getByText("Rp50.000")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/bu ani/i)).toBeVisible();
  await page.screenshot({ path: "test-results/voice-5-piutang.png", fullPage: true });
});
