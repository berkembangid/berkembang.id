import { expect, test, type Page } from "@playwright/test";

/**
 * Rekening usaha — tiga anak tangga, tiga layar yang berbeda.
 *
 * Endpointnya dipalsukan, bukan datanya disiapkan di basis data. Yang diuji di
 * sini adalah apakah pemilik selalu tahu di mana ia berdiri dan apa langkah
 * berikutnya — dan itu pertanyaan tentang layar, bukan tentang SQL. Aturan
 * anak tangganya sendiri dijaga uji unit evaluator dan uji kontrak migrasi.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.");

const rekeningTercatat = {
  id: "00000000-0000-4000-8000-000000000001",
  bankName: "BRI",
  accountHolderName: "Sri Wahyuni",
  accountLast4: "4821",
  evidenceDocumentId: null,
  ownerConfirmedAt: null,
  stage: 1,
  updatedAt: new Date().toISOString(),
};

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
}

/** Memalsukan GET saja; PUT dan POST ditangani masing-masing uji. */
async function palsukanRekening(page: Page, data: unknown) {
  await page.route("**/api/v1/rekening-usaha", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ json: { data } });
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("@smoke yang belum punya rekening tidak disodori formulir", async ({ page }) => {
  await palsukanRekening(page, null);
  await page.goto("/umkm/profil/rekening");

  await expect(page.getByText("Rekening usaha belum dicatat")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Sudah punya rekening usaha/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Belum punya/ })).toBeVisible();

  // Pintu kedua membuka panduan, bukan formulir kosong yang tidak bisa diisi.
  await page.getByRole("button", { name: /^Belum punya/ }).click();
  await expect(page.getByText("Membuka rekening untuk usaha")).toBeVisible();
  await expect(page.getByText(/Bawa KTP/)).toBeVisible();
});

test("nomor lengkap yang diketik hanya tersimpan empat angkanya", async ({ page }) => {
  await palsukanRekening(page, null);

  let dikirim: Record<string, unknown> | null = null;
  await page.route("**/api/v1/rekening-usaha", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    dikirim = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { data: rekeningTercatat } });
  });

  await page.goto("/umkm/profil/rekening");
  await page.getByRole("button", { name: /Sudah punya rekening usaha/ }).click();
  await page.getByRole("button", { name: "BRI", exact: true }).click();
  await page.getByPlaceholder(/tertulis di buku tabungan/i).fill("Sri Wahyuni");
  await page.getByPlaceholder(/nomor lengkapnya/i).fill("0201-0123-4821");

  // Layar memberi tahu apa yang akan tersimpan SEBELUM tombol ditekan.
  await expect(page.getByText("Yang tersimpan: •••• 4821")).toBeVisible();

  await page.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => dikirim).not.toBeNull();
  expect(dikirim!).toMatchObject({ bankName: "BRI", accountLast4: "4821" });
});

test("yang sudah mencatat diberi satu langkah berikutnya, bukan dibiarkan menebak", async ({ page }) => {
  await palsukanRekening(page, rekeningTercatat);
  await page.goto("/umkm/profil/rekening");

  await expect(page.getByText("Rekening usaha sudah dicatat")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Lampirkan rekening koran/)).toBeVisible();
  await expect(page.getByText("BRI •••• 4821")).toBeVisible();
  await expect(page.getByRole("button", { name: /Unggah bukti/ })).toBeVisible();
});

test("yang sudah berbukti tidak lagi diminta apa-apa", async ({ page }) => {
  await palsukanRekening(page, {
    ...rekeningTercatat,
    evidenceDocumentId: "00000000-0000-4000-8000-000000000002",
    ownerConfirmedAt: new Date().toISOString(),
    stage: 2,
  });
  await page.goto("/umkm/profil/rekening");

  await expect(page.getByText("Rekening usaha terpisah, dengan buktinya")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Bukti sudah terpasang")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Unggah bukti$/ })).toHaveCount(0);
});

test("Perjalanan menautkan langkah rekening ke layar yang mengerjakannya", async ({ page }) => {
  // Kartu B5 harus membawa pemilik ke tempat pekerjaannya. Tautan yang salah
  // di sini membuat langkah itu mustahil diselesaikan dari Perjalanan.
  await page.goto("/umkm/roadmap");
  const kartu = page.getByText(/Rekening usaha (belum dicatat|sudah dicatat|terpisah)/).first();
  await expect(kartu).toBeVisible({ timeout: 30_000 });
});
