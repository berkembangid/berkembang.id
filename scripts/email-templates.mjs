/**
 * Templat surel autentikasi BERKEMBANG.ID.
 *
 * KENAPA SATU BERKAS, BUKAN LIMA HTML TERPISAH.
 *
 * Kelimanya memakai kepala, kaki, dan warna yang sama. Disalin lima kali, satu
 * perubahan warna merek berarti lima suntingan dan satu berkas yang terlupa.
 * Di sini kerangkanya ditulis sekali; tiap surel hanya menyumbang isinya.
 *
 * KENAPA TABEL DAN GAYA SEBARIS.
 *
 * Ini bukan halaman web. Gmail membuang `<style>` di banyak konteks, Outlook
 * memakai mesin render Word yang tidak mengenal flexbox maupun grid, dan
 * sebagian klien memblokir gambar secara bawaan. Yang tersisa dan bisa
 * diandalkan adalah tabel dengan gaya sebaris. Tidak ada gambar, tidak ada
 * fon web, tidak ada berkas eksternal: setiap surel berdiri sendiri di bawah
 * 4 KB, dan itulah arti « tetap ringan » di sini.
 *
 * `{{ .Token }}` adalah kode sekali pakai dari Supabase. `{{ .ConfirmationURL }}`
 * tetap disertakan sebagai jalan cadangan bagi yang lebih suka menekan tautan.
 */

const BRAND = {
  ink: "#141a34",
  muted: "#687086",
  line: "#e7e9ef",
  page: "#f5f7fb",
  primary: "#001b85",
  accent: "#02a8d0",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Kerangka yang dipakai kelima surel. */
function shell({ preheader, heading, intro, body, footnote }) {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;">
<tr><td style="padding:26px 28px 0 28px;">
<div style="font:700 17px/1 ${FONT};color:${BRAND.primary};letter-spacing:-.02em;">BERKEMBANG<span style="color:${BRAND.accent};">.ID</span></div>
</td></tr>
<tr><td style="padding:18px 28px 0 28px;">
<h1 style="margin:0;font:700 20px/1.3 ${FONT};color:${BRAND.ink};">${heading}</h1>
<p style="margin:10px 0 0 0;font:400 14px/1.65 ${FONT};color:${BRAND.muted};">${intro}</p>
</td></tr>
<tr><td style="padding:20px 28px 0 28px;">${body}</td></tr>
<tr><td style="padding:20px 28px 26px 28px;">
<p style="margin:0;font:400 12px/1.6 ${FONT};color:${BRAND.muted};">${footnote}</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font:400 11px/1.6 ${FONT};color:#9298a7;max-width:520px;">
BERKEMBANG.ID &middot; Pendamping usaha untuk UMKM Indonesia<br>
Surel ini dikirim otomatis. Balasan ke alamat ini tidak terbaca; hubungi kami di halo@berkembang.id.
</p>
</td></tr>
</table>
</body>
</html>`;
}

/** Kode sekali pakai, dibuat cukup besar untuk disalin dari layar ponsel. */
function codeBlock(label) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:4px 0 0 0;background:${BRAND.page};border:1px solid ${BRAND.line};border-radius:14px;">
<p style="margin:14px 0 0 0;font:700 11px/1 ${FONT};color:${BRAND.muted};letter-spacing:.09em;text-transform:uppercase;">${label}</p>
<p style="margin:8px 0 16px 0;font:700 32px/1.1 ${FONT};color:${BRAND.primary};letter-spacing:.16em;">{{ .Token }}</p>
</td></tr>
</table>`;
}

/** Jalan cadangan bagi yang lebih suka menekan tautan daripada menyalin kode. */
function linkFallback(label) {
  return `<p style="margin:16px 0 0 0;font:400 13px/1.6 ${FONT};color:${BRAND.muted};">
Atau <a href="{{ .ConfirmationURL }}" style="color:${BRAND.primary};font-weight:700;">${label}</a> tanpa memasukkan kode.
</p>`;
}

export const templates = {
  confirmation: {
    subject: "{{ .Token }} — kode verifikasi BERKEMBANG.ID",
    html: shell({
      preheader: "Kode verifikasi untuk menyelesaikan pendaftaran Anda.",
      heading: "Satu langkah lagi",
      intro:
        "Masukkan kode berikut pada halaman pendaftaran untuk memastikan alamat surel ini benar milik Anda.",
      body: codeBlock("Kode verifikasi") + linkFallback("selesaikan pendaftaran lewat tautan ini"),
      footnote:
        "Kode berlaku 1 jam dan hanya dapat dipakai sekali. Apabila Anda tidak mendaftar di BERKEMBANG.ID, abaikan surel ini &mdash; tidak ada akun yang dibuat tanpa kode ini dimasukkan.",
    }),
  },

  recovery: {
    subject: "{{ .Token }} — kode atur ulang kata sandi",
    html: shell({
      preheader: "Kode untuk mengatur ulang kata sandi Anda.",
      heading: "Atur ulang kata sandi",
      intro:
        "Kami menerima permintaan pengaturan ulang kata sandi untuk {{ .Email }}. Masukkan kode berikut untuk melanjutkan.",
      body: codeBlock("Kode atur ulang") + linkFallback("atur ulang lewat tautan ini"),
      footnote:
        "Kode berlaku 1 jam dan hanya dapat dipakai sekali. Apabila Anda tidak meminta pengaturan ulang, abaikan surel ini &mdash; kata sandi Anda tidak berubah selama kode ini tidak dimasukkan.",
    }),
  },

  magic_link: {
    subject: "{{ .Token }} — kode masuk BERKEMBANG.ID",
    html: shell({
      preheader: "Kode sekali pakai untuk masuk ke akun Anda.",
      heading: "Masuk ke akun Anda",
      intro: "Masukkan kode berikut untuk masuk tanpa kata sandi.",
      body: codeBlock("Kode masuk") + linkFallback("masuk lewat tautan ini"),
      footnote:
        "Kode berlaku 1 jam dan hanya dapat dipakai sekali. Apabila Anda tidak meminta kode ini, abaikan surel ini.",
    }),
  },

  email_change: {
    subject: "{{ .Token }} — konfirmasi alamat surel baru",
    html: shell({
      preheader: "Kode untuk mengonfirmasi alamat surel baru Anda.",
      heading: "Konfirmasi alamat surel baru",
      intro:
        "Alamat surel akun Anda akan diubah menjadi {{ .NewEmail }}. Masukkan kode berikut untuk mengonfirmasinya.",
      body: codeBlock("Kode konfirmasi"),
      footnote:
        "Kode berlaku 1 jam. Apabila Anda tidak meminta perubahan ini, abaikan surel ini dan segera hubungi halo@berkembang.id.",
    }),
  },

  invite: {
    subject: "Undangan bergabung di BERKEMBANG.ID",
    html: shell({
      preheader: "Anda diundang bergabung di BERKEMBANG.ID.",
      heading: "Anda diundang",
      intro:
        "Sebuah akun BERKEMBANG.ID telah disiapkan untuk alamat surel ini. Tekan tombol berikut untuk menetapkan kata sandi dan mulai memakainya.",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-radius:12px;background:${BRAND.primary};">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 26px;font:700 14px/1 ${FONT};color:#ffffff;text-decoration:none;">Terima undangan</a>
</td></tr>
</table>`,
      footnote:
        "Apabila Anda tidak mengenali undangan ini, abaikan surel ini &mdash; tidak ada yang terjadi sampai tautan di atas ditekan.",
    }),
  },
};

/** Panjang kode yang diharapkan antarmuka. Dipakai juga oleh skrip pendorong. */
export const OTP_LENGTH = 6;

/** Berapa lama kode berlaku, dalam detik. */
export const OTP_EXPIRY_SECONDS = 3600;
