# QR kartu nama tim

Berkas di folder ini **dihasilkan skrip**, bukan ditulis tangan. Jangan
menyuntingnya; ubah sumbernya lalu jalankan ulang.

```bash
npm run qr:team
```

Hasil per anggota:

| Berkas | Untuk |
| --- | --- |
| `<slug>.svg` | Desain kartu. Vektor, tidak pecah pada ukuran cetak berapa pun |
| `<slug>-1200.png` | Alat yang menolak SVG |

Isinya `https://www.berkembang.id/tim/<slug>?src=card`.

## Yang dilakukan skrip sebelum menulis

**Memeriksa setiap alamat, dan menolak menulis kalau ada yang tidak menjawab
`200`.** Kartu nama dicetak: seratus lembar dengan QR menuju 404 bukan bug yang
bisa di-deploy ulang — ia sudah ada di dompet orang lain, dan satu-satunya
perbaikannya mencetak ulang semuanya.

**Men-decode hasilnya sendiri.** Setiap PNG dibaca kembali dan dipindai seperti
kamera memindainya, lalu isinya dibandingkan dengan alamat yang dimaksud.
Membandingkan berkas dengan hasil enkode ulang hanya membuktikan pustakanya
konsisten dengan dirinya sendiri; men-decode membuktikan pemindai bisa
membacanya.

Kalau salah satu gagal, tidak ada berkas yang ditulis dan skripnya berhenti.

## Kalau halamannya belum hidup

```bash
npm run qr:team -- --lewati-periksa
```

Berkasnya dibuat, pemeriksaan alamat dilewati. **Jangan dicetak** sebelum
`npm run qr:team` tanpa opsi itu berhasil hijau.

## Setelan yang tidak boleh diubah tanpa alasan

| Setelan | Nilai | Kenapa |
| --- | --- | --- |
| Koreksi galat | **M** (15%) | H menghasilkan pola jauh lebih rapat untuk alamat yang sama; pada cetakan 2×2 cm kerapatan itu sendiri jadi penyebab gagal pindai |
| Quiet zone | **4 modul** | Spesifikasi QR menuntutnya. Lebih tipis tampak lebih rapi di layar dan gagal dipindai dari cetakan kecil berlatar warna |
| Logo tengah | **tidak ada** | Logo memakan kapasitas koreksi galat yang sama yang dipakai menahan lipatan dan goresan |
| Warna | `#001b85` di atas putih | Kontras cukup. Jangan dibalik, jangan di atas foto |

## Saat menaruhnya di kartu

- Cetak **minimal 2 cm × 2 cm**.
- SVG-nya **sudah memuat quiet zone**. Jangan dipotong sampai ke tepi pola.
- Jangan di atas foto atau warna gelap.
- **Pindai sendiri satu kartu contoh sebelum mencetak seratus.** Ini satu-satunya
  uji yang benar-benar menyerupai keadaan pemakaiannya.
