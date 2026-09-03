/**
 * Next.js menyediakan paket `server-only` lewat bundler-nya, jadi paket itu
 * tidak ada di node_modules dan Vitest tidak bisa memuatnya. Modul kosong ini
 * menggantikannya saat pengujian sehingga modul server yang murni perhitungan
 * -- misalnya perenderan PDF laporan -- tetap bisa diuji apa adanya.
 */
export {};
