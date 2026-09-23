"use client";

/**
 * Pengingat hitung stok dan tutup kas.
 *
 * Dua kebiasaan yang menentukan apakah pembukuan sebuah warung bisa dipercaya,
 * dan keduanya mudah terlewat karena tidak ada yang menagih. Yang ditulis di
 * sini adalah AKIBATNYA kalau dilewat, bukan perintahnya — pemilik berhak tahu
 * kenapa ia diminta, dan bisa memutuskan sendiri apakah itu penting hari ini.
 *
 * DIKELOMPOKKAN PER JENIS, BUKAN PER HARI.
 *
 * Versi pertama menampilkan satu kartu untuk setiap hari yang belum ditutup.
 * Tiga hari berarti tiga kartu dengan kalimat penjelas yang sama persis
 * diulang tiga kali, memakan sekitar 270 piksel sebelum tab halaman ini
 * terlihat. Yang boros bukan pengingatnya, melainkan pengulangannya:
 * alasannya satu, yang berbeda hanya tanggalnya. Sekarang satu kartu per
 * jenis, alasannya ditulis sekali, dan tanggal-tanggalnya berbaris sebagai
 * keping kecil.
 *
 * Tidak ada tombol "tandai selesai". Pengingatnya dihitung dari keadaan, jadi
 * ia hilang sendiri pada detik pekerjaannya dilakukan. Tombol yang
 * menyembunyikan pengingat tanpa mengerjakannya hanya akan membuat pembukuan
 * tampak beres padahal tidak.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronRight, FileWarning, Package } from "lucide-react";
import Link from "next/link";
import { AccountingClientError, getRemindersClient } from "@/modules/accounting/accounting-client";
import type { ReminderKind, ReminderView } from "@/modules/accounting/period";
import { jakartaDate } from "@/modules/ledger/capture-schema";

/** Lebih dari ini, deretan tanggalnya berhenti membantu dan mulai menakuti. */
const maxDatesShown = 5;

function monthText(month: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${month}-01T12:00:00+07:00`));
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

export type ReminderGroup = {
  kind: ReminderKind;
  items: ReminderView[];
  urgent: boolean;
};

/** Satu jenis, satu kalimat. Yang berbeda antar baris hanya tanggalnya. */
export function reminderGroupText(group: ReminderGroup): { title: string; because: string } {
  const count = group.items.length;
  if (group.kind === "HITUNG_STOK") {
    return {
      title: count === 1
        ? `Hitung sisa stok ${monthText(group.items[0].periodMonth)}`
        : `Hitung sisa stok — ${count} bulan belum dihitung`,
      because: group.urgent
        ? "Belanja bahan sudah dihitung sebagai biaya bulan itu. Selama sisa stoknya belum dihitung, untung bulan itu terlihat lebih kecil daripada yang sebenarnya."
        : "Bulan ini hampir habis. Setelah dihitung, untung bulan ini baru menunjukkan angka yang benar.",
    };
  }
  if (group.kind === "DOKUMEN_KEDALUWARSA") {
    const first = group.items[0];
    const expired = first.daysOverdue > 0 || first.dueDate < jakartaDate();
    return {
      title: count === 1
        ? `${first.subject ?? "Dokumen"} ${expired ? "sudah habis" : "habis"} ${dayLabel(first.dueDate)}`
        : `${count} dokumen izin segera habis masa berlakunya`,
      because: "Izin yang habis bisa membuat lembaga menunda pembiayaan. Urus perpanjangannya, lalu unggah dokumen yang baru.",
    };
  }
  return {
    title: count === 1
      ? `Tutup kas ${dayLabel(group.items[0].dueDate)}`
      : `Tutup kas — ${count} hari belum ditutup`,
    because: group.urgent
      ? "Selisih antara uang di laci dan catatan hanya bisa ketahuan pada harinya. Semakin lama, semakin tidak ada yang ingat."
      : "Cocokkan uang di laci dengan catatan hari ini sebelum tutup.",
  };
}

/**
 * Ke mana pengingat ini membawa pemilik.
 *
 * Bukan tombol "tandai selesai" -- justru kebalikannya. Pengingat yang hanya
 * memberi tahu tanpa menunjukkan jalannya memaksa pemilik mencari sendiri
 * layar tempat pekerjaan itu dilakukan, dan pencarian sekecil apa pun cukup
 * untuk membuatnya ditunda ke besok.
 */
export function reminderHref(kind: ReminderKind, dueDate?: string): string {
  // Tanggalnya ikut, bukan sekadar penanda: sebelum pukul 04.00 yang perlu
  // ditutup adalah dagangan kemarin, dan dialog harus membuka hari itu.
  if (kind === "DOKUMEN_KEDALUWARSA") return "/umkm/profil/dokumen";
  return kind === "TUTUP_KAS" && dueDate
    ? `/umkm/laporan?tutup-kas=${dueDate}`
    : "/umkm/laporan";
}

export function groupReminders(reminders: ReminderView[]): ReminderGroup[] {
  const order: ReminderKind[] = ["TUTUP_KAS", "HITUNG_STOK", "DOKUMEN_KEDALUWARSA"];
  return order
    .map((kind) => {
      const items = reminders.filter((item) => item.kind === kind);
      return { kind, items, urgent: items.some((item) => item.urgent) };
    })
    .filter((group) => group.items.length > 0);
}

export function ReminderStrip({ asOf = jakartaDate() }: { asOf?: string }) {
  const [reminders, setReminders] = useState<ReminderView[]>([]);

  const load = useCallback(async () => {
    try {
      const { reminders: pending } = await getRemindersClient(asOf);
      setReminders(pending);
    } catch (cause) {
      // Pengingat bukan isi utama layar. Kalau gagal dimuat, layarnya tetap
      // berguna, jadi kegagalannya tidak dijadikan pesan kesalahan.
      if (!(cause instanceof AccountingClientError)) throw cause;
      setReminders([]);
    }
  }, [asOf]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(() => groupReminders(reminders), [reminders]);
  if (groups.length === 0) return null;

  return (
    <section aria-label="Yang perlu dikerjakan" className="space-y-2">
      {groups.map((group) => {
        const { title, because } = reminderGroupText(group);
        const Icon = group.kind === "HITUNG_STOK" ? Package : group.kind === "DOKUMEN_KEDALUWARSA" ? FileWarning : CalendarCheck;
        const shown = group.items.slice(0, maxDatesShown);
        const hidden = group.items.length - shown.length;
        return (
          <Link
            key={group.kind}
            href={reminderHref(group.kind, group.items[0]?.dueDate)}
            className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 transition-colors ${
              group.urgent
                ? "border-umkm-warning-line bg-umkm-warning-soft hover:bg-umkm-warning-soft"
                : "border-umkm-brand-line bg-umkm-brand-soft hover:bg-umkm-brand-soft"
            }`}
          >
            <Icon
              size={16}
              className={`mt-0.5 shrink-0 ${group.urgent ? "text-umkm-warning" : "text-umkm-brand"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-umkm-ink">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-umkm-muted">{because}</p>
              {group.items.length > 1 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {shown.map((item) => (
                    <li
                      key={`${item.kind}-${item.dueDate}`}
                      className="rounded-full border border-umkm-line bg-white px-2 py-0.5 text-xs font-bold text-umkm-muted"
                    >
                      {group.kind === "HITUNG_STOK" ? monthText(item.periodMonth) : group.kind === "DOKUMEN_KEDALUWARSA" ? `${item.subject ?? "Dokumen"} · ${dayLabel(item.dueDate)}` : dayLabel(item.dueDate)}
                    </li>
                  ))}
                  {hidden > 0 && (
                    <li className="px-1 py-0.5 text-xs font-bold text-umkm-subtle">+{hidden} lagi</li>
                  )}
                </ul>
              )}
            </div>
            <ChevronRight
              size={16}
              className={`mt-0.5 shrink-0 ${group.urgent ? "text-umkm-warning" : "text-umkm-brand"}`}
            />
          </Link>
        );
      })}
    </section>
  );
}
