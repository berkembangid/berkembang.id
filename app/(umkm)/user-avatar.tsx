"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Foto profil pemilik, atau inisialnya bila belum ada foto.
 *
 * `<img>` biasa, bukan `next/image`: fotonya tinggal di Supabase Storage atau
 * di Google (masuk lewat Google), dua asal yang tidak perlu didaftarkan ke
 * pengoptimal gambar untuk sebuah lingkaran 36 piksel. Foto yang gagal dimuat
 * -- tautan lama, berkas terhapus -- jatuh ke inisial, bukan ikon rusak.
 */
export function UserAvatar({ name, src, className = "" }: { name: string; src: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const initials = name.trim().slice(0, 2).toUpperCase() || "?";
  const showImage = Boolean(src) && failedSrc !== src;

  // Gambar yang sudah gagal SEBELUM React terpasang tidak memicu `onError`
  // lagi; periksa sekali sesudah terpasang: selesai dimuat tetapi tanpa ukuran.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !src) return;
    if (image.complete && image.naturalWidth === 0) {
      const timer = window.setTimeout(() => setFailedSrc(src), 0);
      return () => window.clearTimeout(timer);
    }
  }, [src]);

  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-umkm-brand-tint text-xs font-extrabold text-umkm-brand ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- lihat komentar di atas
        <img ref={imageRef} src={src!} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}

/**
 * Dikirim halaman Profil setelah tersimpan, supaya sidebar dan header ikut
 * berganti tanpa memuat ulang halaman.
 */
export const PROFILE_UPDATED_EVENT = "berkembang:profil-diperbarui";

export type ProfileUpdatedDetail = { name?: string; businessName?: string; avatarUrl?: string | null };
