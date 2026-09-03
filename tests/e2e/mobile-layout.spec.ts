import { expect, test, type Page } from "@playwright/test";

/**
 * Tata letak ponsel: tidak meluber, tombol suara menonjol, modal di atas nav.
 *
 * Ketiganya adalah cacat yang tidak bisa dilihat satu pun uji lain. Isi yang
 * lebih lebar dari layar dipotong `overflow: hidden` tanpa scrollbar yang
 * menjelaskan kenapa; tombol yang tertutup bilah navigasi tetap ada di pohon
 * DOM dan tetap lolos setiap assertion "terlihat" yang biasa. Yang membedakan
 * hanya pengukuran geometri di peramban sungguhan.
 *
 * Dilewati tanpa PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!baseURL || !email || !password, "Butuh PLAYWRIGHT_BASE_URL, E2E_EMAIL, dan E2E_PASSWORD.");

test.use({ viewport: { width: 390, height: 844 } });

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/sandi|password/i).fill(password!);
  await page.getByRole("button", { name: /masuk/i }).click();
  await page.waitForURL(/\/umkm/);
}

/** Elemen mana pun yang melewati tepi kanan layar, beserta namanya. */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const wide: string[] = [];
    document.querySelectorAll<HTMLElement>("main *").forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && box.right > window.innerWidth + 1) {
        wide.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 50)}`);
      }
    });
    return { scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth, wide };
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("@smoke tidak ada layar UMKM yang meluber ke samping", async ({ page }) => {
  for (const path of ["/umkm", "/umkm/laporan", "/umkm/kesiapan", "/umkm/upload", "/umkm/profil"]) {
    await page.goto(path);
    await page.waitForTimeout(1_500);
    const result = await overflowing(page);
    expect(result.scrollWidth, `${path}: ${JSON.stringify(result)}`).toBeLessThanOrEqual(
      result.width + 1,
    );
    expect(result.wide, `${path} punya elemen melewati tepi kanan`).toEqual([]);
  }
  await page.goto("/umkm");
  await page.screenshot({ path: "test-results/mobile-1-beranda.png", fullPage: true });
});

test("tombol catat suara menonjol di tengah bilah", async ({ page }) => {
  // Mencatat adalah alasan aplikasi ini dibuka; ia tidak boleh menjadi satu
  // ikon di antara lima yang seragam.
  const voice = page.getByRole("link", { name: /catat dengan suara/i });
  await expect(voice).toBeVisible();

  const nav = page.locator("nav").last();
  const voiceBox = (await voice.boundingBox())!;
  const navBox = (await nav.boundingBox())!;

  // Di tengah secara mendatar.
  const voiceCentre = voiceBox.x + voiceBox.width / 2;
  const navCentre = navBox.x + navBox.width / 2;
  expect(Math.abs(voiceCentre - navCentre)).toBeLessThan(24);

  // Dan menonjol ke atas melewati bilahnya.
  const circle = voice.locator("span").first();
  const circleBox = (await circle.boundingBox())!;
  expect(circleBox.y).toBeLessThan(navBox.y);
  await page.screenshot({ path: "test-results/mobile-2-tombol-suara.png" });
});

test("modal catat transaksi tidak tertutup bilah navigasi", async ({ page }) => {
  await page.goto("/umkm/laporan");
  await page.getByRole("button", { name: /catat transaksi/i }).first().click();

  const save = page.getByRole("button", { name: /simpan transaksi/i });
  await expect(save).toBeVisible();

  // Tombol simpan harus benar-benar bisa diketuk: titik tengahnya tidak boleh
  // ditempati elemen lain. Ini yang membedakan "terlihat" dari "bisa dipakai".
  const box = (await save.boundingBox())!;
  const topmost = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element ? `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}` : "";
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost, "sesuatu menutupi tombol simpan").toMatch(/button|svg|span/);
  await page.screenshot({ path: "test-results/mobile-3-modal.png" });
});
