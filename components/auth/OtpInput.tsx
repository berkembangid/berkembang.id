"use client";

import { useEffect, useRef, useState } from "react";
import { OTP_LENGTH, OTP_RESEND_SECONDS, sanitiseOtp } from "@/modules/auth/otp";

/**
 * Kotak kode sekali pakai.
 *
 * Satu kotak per angka, bukan satu kolom panjang: kode yang disalin dari surel
 * lalu ditempel harus tetap masuk utuh, dan angka yang salah harus terlihat
 * tanpa menghitung karakter. Menempel kode penuh mengisi seluruh kotak
 * sekaligus; menghapus melompat mundur sendiri.
 *
 * Tombol kirim ulang menghitung mundur karena Supabase menolak permintaan yang
 * terlalu rapat. Menampilkan hitungannya bukan pengamanan -- itu urusan server
 * -- melainkan supaya orang tidak menekan tombol yang diam-diam gagal.
 */
export default function OtpInput({
  value,
  onChange,
  onResend,
  disabled = false,
  resendLabel = "Kirim ulang kode",
}: {
  value: string;
  onChange: (next: string) => void;
  onResend?: () => void | Promise<void>;
  disabled?: boolean;
  resendLabel?: string;
}) {
  const [cooldown, setCooldown] = useState(OTP_RESEND_SECONDS);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    boxes.current[Math.min(value.length, OTP_LENGTH - 1)]?.focus();
  }, [value.length]);

  function write(next: string) {
    onChange(sanitiseOtp(next));
  }

  function handleBox(index: number, raw: string) {
    const digits = sanitiseOtp(raw);
    // Menempel kode penuh ke kotak mana pun mengisi seluruhnya.
    if (digits.length > 1) { write(digits); return; }
    const characters = value.padEnd(OTP_LENGTH, " ").split("");
    characters[index] = digits || " ";
    write(characters.join("").replace(/\s/g, ""));
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        {Array.from({ length: OTP_LENGTH }, (_unused, index) => (
          <input
            key={index}
            ref={(element) => { boxes.current[index] = element; }}
            value={value[index] ?? ""}
            onChange={(event) => handleBox(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !value[index] && index > 0) {
                event.preventDefault();
                write(value.slice(0, index - 1));
              }
            }}
            onPaste={(event) => { event.preventDefault(); write(event.clipboardData.getData("text")); }}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Angka ke-${index + 1} dari ${OTP_LENGTH}`}
            disabled={disabled}
            className="h-13 w-full min-w-0 rounded-xl border border-slate-300 bg-white text-center text-lg font-bold text-[#141a34] disabled:bg-slate-50"
            style={{ height: "52px" }}
          />
        ))}
      </div>
      {onResend && (
        <button
          type="button"
          onClick={() => { setCooldown(OTP_RESEND_SECONDS); void onResend(); }}
          disabled={disabled || cooldown > 0}
          className="auth-inline-link disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Kirim ulang kode dalam ${cooldown} detik` : resendLabel}
        </button>
      )}
    </div>
  );
}
