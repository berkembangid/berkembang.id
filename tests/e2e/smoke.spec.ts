import { expect, test } from "@playwright/test";

test("@smoke landing page and PWA icon are reachable", async ({ page, request }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/BERKEMBANG\.ID/i);
  await expect(page.getByRole("main")).toBeVisible();

  const iconResponse = await request.get("/icons/icon-192.png");
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()["content-type"]).toBe("image/png");
});
