import { expect, test, type Page } from "@playwright/test";

/**
 * Tingkat Kesiapan — satu model, satu endpoint, banyak render.
 *
 * Uji terpenting di berkas ini adalah yang pertama: Beranda dan halaman
 * Kesiapan harus menampilkan tingkat yang sama, dan keduanya harus berubah
 * ketika satu endpoint yang sama dipalsukan. Itu satu-satunya cara membuktikan
 * tidak ada layar yang diam-diam menghitung sendiri — dan menghitung sendiri
 * persis yang dulu menghasilkan tiga angka berbeda di satu layar.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.");

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("@smoke satu endpoint memberi tingkat yang sama di dua layar", async ({ page }) => {
  // Endpoint dipalsukan sekali; kalau ada layar yang menghitung sendiri, ia
  // akan menampilkan tingkat yang berbeda dan uji ini merah.
  await page.route("**/api/v1/readiness", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as { data: Record<string, unknown> };
    payload.data.level = "EMAS";
    payload.data.levelName = "Emas";
    payload.data.nextLevel = null;
    await route.fulfill({ json: payload });
  });

  await page.goto("/umkm/kesiapan");
  await expect(page.getByText("Emas").first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "test-results/kesiapan-1-halaman.png", fullPage: true });

  await page.goto("/umkm");
  await expect(page.getByText("Tingkat kesiapan")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Emas").first()).toBeVisible();
  await page.screenshot({ path: "test-results/kesiapan-2-beranda.png", fullPage: true });
});

test("akun dengan riwayat tidak dimulai dari Mulai", async ({ page }) => {
  // Evaluasi retroaktif: akun lama mendapat tingkat sesuai datanya pada
  // pembacaan pertama, bukan default terendah.
  await page.goto("/umkm/kesiapan");
  const level = page.locator("section", { hasText: "Tingkat kesiapan usahamu" }).first();
  await expect(level).toBeVisible({ timeout: 30_000 });
  const text = await level.innerText();
  expect(
    /Tembaga|Perak|Emas/.test(text),
    `akun uji dengan data seharusnya melewati "Mulai", terbaca: ${text}`,
  ).toBe(true);
  await page.screenshot({ path: "test-results/kesiapan-3-retroaktif.png", fullPage: true });
});

test("tidak ada angka mentah di layar pemilik", async ({ page }) => {
  for (const path of ["/umkm", "/umkm/kesiapan", "/umkm/kesiapan/metodologi"]) {
    await page.goto(path);
    await page.waitForTimeout(1_500);
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["/100", "dari 100", "score", "skor", "poin"]) {
      expect(body, `${forbidden} di ${path}`).not.toContain(forbidden);
    }
  }
  await page.screenshot({ path: "test-results/kesiapan-4-tanpa-angka.png", fullPage: true });
});

test("belanja besar yang belum ada tampil netral, bukan merah", async ({ page }) => {
  // Warung yang tidak pernah belanja besar tidak sedang lalai — ia hemat.
  await page.route("**/api/v1/readiness", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      data: { pillars: { id: string; components: Record<string, unknown>[] }[] };
    };
    const pillarB = payload.data.pillars.find((pillar) => pillar.id === "B");
    const b3 = pillarB?.components.find((component) => component.id === "B3");
    if (b3) {
      b3.status = "BELUM_ADA_DATA";
      b3.tone = "neutral";
      b3.title = "Belum ada belanja besar";
      b3.hint = "Bagian ini menunggu belanja di atas Rp500 ribu. Belum ada bukan berarti kurang.";
      b3.action = null;
    }
    await route.fulfill({ json: payload });
  });

  await page.goto("/umkm/kesiapan");
  await expect(page.getByText("Belum ada belanja besar")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Belum ada bukan berarti kurang/)).toBeVisible();
  await page.screenshot({ path: "test-results/kesiapan-5-b3-netral.png", fullPage: true });
});

test("halaman metodologi menjelaskan aturannya apa adanya", async ({ page }) => {
  // Angka yang menilai usaha seseorang tanpa cara memeriksanya adalah kotak
  // hitam, dan kotak hitam yang menilai kelayakan adalah yang dilarang.
  await page.goto("/umkm/kesiapan/metodologi");
  await expect(page.getByRole("heading", { name: /cara kami menghitung/i })).toBeVisible();
  await expect(page.getByText("wp08-pilot-v2")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Syarat Perak/i)).toBeVisible();
  await page.screenshot({ path: "test-results/kesiapan-6-metodologi.png", fullPage: true });
});

test("rute lama tetap hidup dan menampilkan halaman yang sama", async ({ page }) => {
  for (const path of ["/umkm/roadmap", "/umkm/score", "/umkm/gaps"]) {
    await page.goto(path);
    await expect(page.getByText("Tingkat kesiapan usahamu")).toBeVisible({ timeout: 30_000 });
  }
});
