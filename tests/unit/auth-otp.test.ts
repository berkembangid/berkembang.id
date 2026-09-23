import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  isCompleteOtp,
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  sanitiseOtp,
} from "@/modules/auth/otp";

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(join(root, ...segments), "utf8");

describe("kode sekali pakai", () => {
  it("hanya menerima angka sepanjang kodenya", () => {
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("1234567")).toBe(false);
    expect(isCompleteOtp("12345a")).toBe(false);
    expect(isCompleteOtp("")).toBe(false);
  });

  it("membuang apa pun yang bukan angka saat ditempel", () => {
    // Kode yang disalin dari surel sering membawa spasi atau tanda hubung.
    expect(sanitiseOtp("482 913")).toBe("482913");
    expect(sanitiseOtp("482-913")).toBe("482913");
    expect(sanitiseOtp("48291376")).toBe("482913");
    expect(sanitiseOtp("abc")).toBe("");
  });

  it("panjang kode di antarmuka sama dengan yang didorong ke Supabase", () => {
    // Keduanya berselisih berarti orang mengetik enam angka ke kotak yang
    // menunggu delapan, lalu menekan tombol yang tidak pernah menyala.
    const pusher = read("scripts", "email-templates.mjs");
    expect(pusher).toContain(`export const OTP_LENGTH = ${OTP_LENGTH};`);
  });
});

describe("bahasa galat autentikasi", () => {
  it("menerjemahkan sebab yang paling sering ditemui", () => {
    expect(authErrorMessage("Token has expired or is invalid", "x")).toContain("kedaluwarsa");
    expect(authErrorMessage("Invalid login credentials", "x")).toContain("kata sandi salah");
    expect(authErrorMessage("User already registered", "x")).toContain("sudah terdaftar");
    expect(authErrorMessage("Email rate limit exceeded", "x")).toContain("Batas pengiriman");
  });

  it("menyebutkan sisa detik ketika permintaan terlalu berdekatan", () => {
    // Supabase menyebut angkanya; membuangnya berarti menyuruh orang menunggu
    // tanpa memberi tahu sampai kapan.
    const message = authErrorMessage("For security purposes, you can only request this after 47 seconds.", "x");
    expect(message).toContain("47 detik");
  });

  it("mengembalikan kalimat cadangan untuk galat yang tidak dikenal", () => {
    expect(authErrorMessage("something nobody mapped", "Cadangan.")).toBe("Cadangan.");
    expect(authErrorMessage("", "Cadangan.")).toBe("Cadangan.");
    expect(authErrorMessage(null, "Cadangan.")).toBe("Cadangan.");
  });

  it("tidak pernah membocorkan pesan asli berbahasa Inggris", () => {
    for (const raw of ["Token has expired or is invalid", "Invalid login credentials", "User already registered"]) {
      expect(authErrorMessage(raw, "x")).not.toContain(raw);
    }
  });
});

describe("rangkaian layar autentikasi", () => {
  it("pendaftaran menahan orang di langkah verifikasi sebelum masuk", () => {
    const register = read("app", "auth", "register", "page.tsx");
    expect(register).toContain('type: "signup"');
    expect(register).toContain("setStep(verifyStep)");
    // Mundur dari layar kode akan mendaftarkan akun yang sama dua kali.
    expect(register).toContain("step !== verifyStep");
  });

  it("lupa kata sandi memakai kode, bukan tautan", () => {
    const forgot = read("app", "auth", "lupa-sandi", "page.tsx");

    // Uji ini dulu menuntut `resetPasswordForEmail` -- dan itu BERTENTANGAN
    // dengan judulnya sendiri: fungsi itu mengirim TAUTAN pemulihan, bukan
    // kode. `0074_custom_password_reset.sql` menggantinya dengan tiga langkah
    // berkode, jadi yang basi ujinya, bukan kodenya. Sekarang yang diuji
    // ketiga langkah itu ada, dan tautan Supabase-nya tidak dipakai lagi.
    expect(forgot).toContain("/api/auth/forgot-password");
    expect(forgot).toContain("/api/auth/verify-reset-otp");
    expect(forgot).toContain("/api/auth/reset-password");
    expect(forgot).not.toContain("resetPasswordForEmail");
  });

  it("akun Google baru ditanya perannya, bukan ditebak", () => {
    const callback = read("app", "auth", "callback", "route.ts");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).toContain("/auth/lengkapi");
    const complete = read("app", "auth", "lengkapi", "page.tsx");
    // Kunci metadatanya kini ditulis di satu modul bersama, jadi yang dibaca
    // di sini tempat ia benar-benar ditulis -- bukan halaman yang memanggilnya.
    expect(complete).toContain("umkmSignupMetadata");
    expect(complete).toContain("investorSignupMetadata");
    expect(complete).toContain("/api/auth/bootstrap");
    const fields = read("modules", "auth", "onboarding-fields.ts");
    expect(fields).toContain('signup_account_type: "umkm"');
    expect(fields).toContain('signup_account_type: "investor"');
  });

  it("masuk berakhir di portalnya, kecuali sekali bagi pemilik yang baru mendaftar", () => {
    // Aturannya BERUBAH, bukan dibatalkan -- dan bedanya terletak pada apa
    // yang ditanyakan sebelum membelokkan orang.
    //
    //   Dulu   : "apakah ia belum punya transaksi". Keadaan itu tetap kosong
    //            berhari-hari, jadi pengalihannya terjadi pada SETIAP kali
    //            masuk dan terbaca seperti kegagalan masuk. Dan bendera
    //            `onboarding=1` yang dibawanya tidak pernah dibaca apa pun.
    //   Sekarang: "apakah ia sudah pernah melihat perkenalan". Penanda
    //            tersimpan (`profiles.onboarding_seen_at`) yang hanya pernah
    //            berubah sekali, jadi pengalihannya pun sekali.
    const codeOnly = (source: string) => source
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");

    const kontinu = codeOnly(read("app", "auth", "continue", "route.ts"));
    expect(kontinu).toContain("portalPathForRole(role)");
    // Pengalihannya bergantung pada penanda yang tersimpan, bukan pada keadaan
    // lain yang kebetulan kosong.
    expect(kontinu).toContain("onboarding_seen_at");
    expect(kontinu).toContain('redirect(new URL("/umkm/profil/kondisi-awal?mulai=1"');
    // Bendera yang tidak dibaca siapa pun tidak kembali.
    expect(kontinu).not.toContain("onboarding=1");
    expect(codeOnly(read("app", "auth", "register", "page.tsx"))).not.toContain("/umkm/profil");
  });

  it("perkenalan ditandai sekali, dan dilewati sama dengan diselesaikan", () => {
    // Perkenalan yang muncul lagi karena DILEWATI -- bukan diselesaikan --
    // menghukum orang karena tidak membacanya. Keduanya memanggil hal yang
    // sama, dan penandanya set-once di basis data.
    const tour = read("components", "warung", "WelcomeTour.tsx");
    expect(tour).toContain("/api/v1/onboarding/seen");
    // Satu jalan keluar untuk keduanya: tombol Lewati, tanda X, dan tombol
    // terakhir semuanya memanggil `finish`.
    expect((tour.match(/void finish\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Dan penandanya tidak disimpan di peramban, yang akan melupakannya
    // begitu pemilik berganti ponsel.
    expect(tour).not.toContain("localStorage");
  });

  it("pemulangan OAuth yang jatuh di halaman depan diteruskan, bukan ditinggalkan", () => {
    // `site_url` adalah tujuan bawaan Supabase ketika `redirectTo` tidak ada
    // di daftar izin, dan halaman depan tidak membaca `code`. Tanpa penerusan
    // ini, sesinya terbentuk diam-diam oleh `detectSessionInUrl` dan orangnya
    // tertinggal di halaman depan -- sudah masuk, tanpa satu pun petunjuk.
    const proxy = read("proxy.ts");
    expect(proxy).toContain('if (pathname === "/") {');
    expect(proxy).toContain('query.has("code")');
    // Galat OAuth juga dipantulkan ke `site_url`, jadi ia pun harus diteruskan.
    expect(proxy).toContain('query.has("error")');
    expect(proxy).toContain('target.pathname = "/auth/callback"');
  });

  it("jeda kirim ulang tidak lebih pendek dari jeda Supabase", () => {
    expect(OTP_RESEND_SECONDS).toBeGreaterThanOrEqual(60);
  });
});

describe("templat surel", () => {
  const names = ["confirmation", "recovery", "magic_link", "email_change", "invite"];

  it("semuanya ada dan ringan", () => {
    for (const name of names) {
      const html = read("supabase", "email-templates", `${name}.html`);
      expect(html.length, name).toBeLessThan(8 * 1024);
      expect(html, name).toContain("<!doctype html>");
    }
  });

  it("tidak memuat berkas dari luar", () => {
    // Gambar diblokir sebagian klien surel, dan fon web tidak pernah dipakai
    // Outlook. Yang diminta dari jaringan hanya menambah cara untuk gagal.
    for (const name of names) {
      const html = read("supabase", "email-templates", `${name}.html`);
      expect(html, name).not.toMatch(/<img|<link|<script|url\(/i);
    }
  });

  it("keempat surel berkode memuat {{ .Token }}", () => {
    for (const name of ["confirmation", "recovery", "magic_link", "email_change"]) {
      expect(read("supabase", "email-templates", `${name}.html`), name).toContain("{{ .Token }}");
    }
  });
});
