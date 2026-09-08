"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure, notifyInfo } from "@/lib/notify";
import UmkmHeader, { type TransactionNotice } from "./umkm-header";
import { NAVIGATION, isActivePath } from "./umkm-navigation";
import styles from "./umkm-shell.module.css";

/**
 * Mencatat dengan suara adalah alasan aplikasi ini dibuka.
 *
 * Sebagai satu ikon di antara lima yang seragam, ia harus dicari; sebagai
 * tombol bundar yang menonjol di tengah — pola yang sudah dikenal pemilik
 * warung dari tombol QRIS di aplikasi bank — ia yang pertama terlihat dan bisa
 * ditekan dengan ibu jari tanpa melihat. Ini juga menjadikan mencatat satu-
 * satunya aksi utama di layar, yang memang benar.
 */
const MOBILE_VOICE = NAVIGATION.find((item) => item.label === "Catat")!;
const MOBILE_LEFT = NAVIGATION.filter((item) => ["Beranda", "Laporan"].includes(item.label));
const MOBILE_RIGHT = NAVIGATION.filter((item) => ["Perjalanan", "Profil"].includes(item.label));

/**
 * Batas waktu "sudah dilihat" disimpan di peramban, bukan di basis data.
 *
 * Menyimpannya di server berarti satu tabel, satu kebijakan RLS, dan satu
 * permintaan tulis setiap kali lonceng dibuka — untuk sebuah lencana. Yang
 * hilang bila pemilik berpindah perangkat hanyalah angka kecil di sudut
 * lonceng, dan pemberitahuannya sendiri tetap utuh di `/umkm/notifikasi`.
 */
const SEEN_KEY = "berkembang:notices-seen";

function readSeenAt(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeenAt(value: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    // Peramban dengan penyimpanan situs dimatikan tetap boleh memakai
    // aplikasinya; yang hilang hanya ingatan soal lencana.
  }
}

export default function UMKMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { confirm } = useConfirm();
  const [notices, setNotices] = useState<TransactionNotice[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [userName, setUserName] = useState("Pengguna");
  const [businessName, setBusinessName] = useState("");
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    // Ditunda satu tick, pola yang sama dengan pemuatan lain di aplikasi ini:
    // penyimpanan peramban tidak ada di server, jadi pembacaannya harus
    // terjadi setelah render pertama terpasang.
    const timer = window.setTimeout(() => {
      // Batas awal ditetapkan pada kunjungan pertama, bukan pada awal waktu.
      // Tanpa ini, pemilik yang sudah punya delapan transaksi lama akan
      // disambut lencana berisi delapan "baru" yang sudah lama dibacanya.
      const stored = readSeenAt();
      if (stored) {
        setSeenAt(stored);
        return;
      }
      const now = new Date().toISOString();
      writeSeenAt(now);
      setSeenAt(now);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;

      const [profile, transactionResult] = await Promise.all([
        supabase.from("profiles").select("name,nama_usaha").eq("auth_user_id", user.id).maybeSingle(),
        supabase
          .from("transactions")
          .select("id,direction,type,amount_idr,nominal,item,transaction_date,tanggal,created_at,user_id")
          .neq("ledger_status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      setUserName(profile.data?.name ?? user.user_metadata?.nama_pemilik ?? user.email?.split("@")[0] ?? "Pengguna");
      setBusinessName(profile.data?.nama_usaha ?? user.user_metadata?.nama_usaha ?? "");
      setNotices((transactionResult.data ?? []) as TransactionNotice[]);

      // Penyaringan dilakukan di server. Sebelumnya setiap penyisipan pada
      // seluruh tabel dikirim ke setiap peramban yang terbuka, lalu dibuang
      // lagi di sini — pekerjaan jaringan untuk data yang memang tidak boleh
      // dilihat, dan bergantung pada penyaring di sisi klien untuk kebenaran.
      channel = supabase
        .channel(`umkm-transaction-notices-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
          (payload) => setNotices((previous) => [payload.new as TransactionNotice, ...previous].slice(0, 8)),
        )
        .subscribe();
    }

    void load();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  // Jumlah yang belum dibaca diturunkan dari data, bukan dihitung sendiri.
  // Penghitung terpisah akan menyimpang begitu ada satu jalur yang lupa
  // menaikkannya — dan jalur itu selalu ada.
  const unread = useMemo(
    () => (seenAt ? notices.filter((notice) => (notice.created_at ?? "") > seenAt).length : 0),
    [notices, seenAt],
  );

  const markNoticesSeen = useCallback(() => {
    const now = new Date().toISOString();
    writeSeenAt(now);
    setSeenAt(now);
  }, []);

  /**
   * Keluar ditanyakan lebih dulu.
   *
   * Tombolnya duduk bersebelahan dengan tautan profil di menu samping dan di
   * dalam menu akun; salah tekan berarti kehilangan draf catatan yang belum
   * dikonfirmasi dan harus masuk lagi lewat surel atau Google.
   */
  const signOut = useCallback(async () => {
    const yes = await confirm({
      title: "Keluar dari akun?",
      description: "Catatan yang sudah dikonfirmasi tetap tersimpan. Draf yang belum dikonfirmasi akan hilang, dan Anda perlu masuk lagi untuk membukanya.",
      confirmLabel: "Keluar",
      cancelLabel: "Tetap di sini",
      tone: "danger",
    });
    if (!yes) return;

    notifyInfo("Sedang keluar…");
    const { error } = await supabase.auth.signOut();
    if (error) {
      notifyFailure("Belum berhasil keluar. Coba sekali lagi.");
      return;
    }
    window.location.href = "/auth/login";
  }, [confirm]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/umkm" className={styles.sidebarBrand} aria-label="Berkembang.id">
          <Image
            src="/logo/logo berkembang.webp"
            alt="Berkembang.id"
            width={150}
            height={38}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
        <p className={styles.navLabel}>Ruang usaha</p>
        <nav aria-label="Menu utama UMKM">
          {NAVIGATION.map((item) => {
            const active = isActivePath(pathname, item);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
                <item.Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.profile}>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d6eefa] text-xs font-extrabold text-[#0b5f86]">{userName.slice(0, 2).toUpperCase()}</div>
            <Link href="/umkm/profil" className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#1b2a3a]">{userName}</p>
              <p className="truncate text-[10px] text-[#6e859e]">{businessName || "Kelola profil usaha"}</p>
            </Link>
            <button onClick={() => void signOut()} aria-label="Keluar dari akun" className="grid h-9 w-9 place-items-center rounded-lg text-[#9fb0c2] hover:bg-[#f3f6f9] hover:text-[#34496a]"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <div className={styles.content}>
        <UmkmHeader
          userName={userName}
          businessName={businessName}
          notices={notices}
          unread={unread}
          onNoticesSeen={markNoticesSeen}
          onSignOut={() => void signOut()}
        />
        {children}
      </div>

      <nav aria-label="Menu utama UMKM" className={styles.bottomNav}>
        {MOBILE_LEFT.map((item) => {
          const active = isActivePath(pathname, item);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${styles.bottomLink} ${active ? styles.bottomLinkActive : ""}`}><item.Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{item.label}</span></Link>;
        })}

        <Link
          href={MOBILE_VOICE.href}
          aria-current={isActivePath(pathname, MOBILE_VOICE) ? "page" : undefined}
          aria-label="Catat dengan suara"
          className={styles.voiceSlot}
        >
          <span className={`${styles.voiceButton} ${isActivePath(pathname, MOBILE_VOICE) ? styles.voiceButtonActive : ""}`}>
            <MOBILE_VOICE.Icon size={24} strokeWidth={2.4} />
          </span>
          <span className={styles.voiceLabel}>{MOBILE_VOICE.label}</span>
        </Link>

        {MOBILE_RIGHT.map((item) => {
          const active = isActivePath(pathname, item);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${styles.bottomLink} ${active ? styles.bottomLinkActive : ""}`}><item.Icon size={19} strokeWidth={active ? 2.5 : 2} /><span>{item.label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
