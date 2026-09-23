"use client";

import { createContext, useContext } from "react";
import type { NotificationState, NotificationTarget, PortalNotification } from "@/modules/consent/notification-center";

/**
 * Satu keadaan pemberitahuan untuk lonceng dan halaman Pemberitahuan.
 *
 * Kalau halaman memuat daftarnya sendiri, menandai terbaca di sana tidak
 * menurunkan angka di lonceng sampai pemilik berpindah layar. Layout memuat
 * sekali dan membagikannya lewat konteks ini.
 */
export const UmkmNotificationsContext = createContext<NotificationState | null>(null);

export function useUmkmNotifications(): NotificationState {
  const value = useContext(UmkmNotificationsContext);
  if (!value) throw new Error("useUmkmNotifications dipakai di luar layout UMKM");
  return value;
}

/**
 * Ke mana sebuah pemberitahuan membawa pemilik usaha.
 *
 * Basis data sudah lama menulis pemberitahuan untuk pemilik -- permintaan dan
 * keputusan izin, izin yang dicabut atau berakhir, dosir yang diunduh, dan
 * undangan dinas -- tetapi portal UMKM tidak pernah membacanya. Lonceng hanya
 * berisi transaksi, padahal layar izin berjanji « Anda akan mendapat
 * pemberitahuan atas setiap keputusan ».
 *
 * Semuanya berujung di layar Izin & program: itu satu-satunya tempat pemilik
 * bisa menindaklanjuti -- mencabut izin, melihat siapa yang membuka data,
 * atau menjawab undangan.
 */
export function umkmNotificationTarget(item: PortalNotification): NotificationTarget | null {
  switch (item.notification_type) {
    case "dinas_broadcast":
      return { href: "/umkm/profil/izin#izin-program", label: "Lihat tawaran" };
    case "dossier_pdf_download":
      return { href: "/umkm/profil/izin#izin-riwayat", label: "Lihat riwayat akses" };
    case "consent_notice":
    case "consent_decision":
    case "consent_revoked":
    case "consent_expired":
      return { href: "/umkm/profil/izin#izin-lembaga", label: "Lihat izin" };
    default:
      return null;
  }
}

export const UMKM_NOTIFICATION_EMPTY_HINT =
  "Kabar soal izin data, lembaga yang membuka data usaha Anda, dan tawaran pendampingan dari dinas muncul di sini.";
