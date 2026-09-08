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
    expect(forgot).toContain("resetPasswordForEmail");
    expect(forgot).toContain('type: "recovery"');
    // Sesi pemulihan tidak boleh menjadi jalan masuk diam-diam.
    expect(forgot).toContain("signOut");
  });

  it("akun Google baru ditanya perannya, bukan ditebak", () => {
    const callback = read("app", "auth", "callback", "route.ts");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).toContain("/auth/lengkapi");
    const complete = read("app", "auth", "lengkapi", "page.tsx");
    expect(complete).toContain("signup_account_type");
    expect(complete).toContain("/api/auth/bootstrap");
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
