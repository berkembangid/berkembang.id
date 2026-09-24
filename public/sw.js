/*
 * Service worker Ruang Usaha (/umkm).
 *
 * Tujuannya satu: aplikasi tetap TERBUKA saat sinyal hilang, supaya pemilik
 * bisa merekam atau memotret catatan dan membiarkan antrean kirim ulang
 * (IndexedDB, lihat PendingUploadsNotice) mengirimnya nanti.
 *
 * Aturannya sengaja sempit:
 *   - Halaman /umkm (navigasi): jaringan dulu; tanpa sinyal pakai salinan
 *     terakhir halaman itu, lalu Beranda, lalu /offline.html.
 *   - /_next/static: cache permanen -- nama berkasnya sudah mengandung hash.
 *   - /api, Supabase, dan permintaan RSC: TIDAK PERNAH disimpan. Datanya
 *     milik pemilik dan harus selalu segar; angka basi lebih buruk daripada
 *     pesan "tanpa sinyal".
 *
 * Nama cache membawa versi. Mengubah VERSION membuang cache lama saat aktif.
 */
const VERSION = "v1";
const PAGES = `berkembang-umkm-pages-${VERSION}`;
const STATIC = `berkembang-umkm-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("berkembang-umkm-") && key !== PAGES && key !== STATIC)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isUmkmNavigation(request, url) {
  return request.mode === "navigate" && url.origin === self.location.origin && url.pathname.startsWith("/umkm");
}

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (isUmkmNavigation(request, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const response = await fetch(request);
        // Hanya halaman yang benar-benar terbuka yang disimpan: pengalihan ke
        // halaman masuk atau galat tidak boleh menjadi salinan "terakhir".
        if (response.ok && !response.redirected && response.type === "basic") {
          cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(url.pathname))
          || (await cache.match("/umkm"))
          || (await cache.match(OFFLINE_URL))
          || new Response("Tanpa sinyal.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
  }
  // Selain itu -- API, Supabase, RSC, gambar dari luar -- tidak disentuh.
});
