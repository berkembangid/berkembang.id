"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wallet } from "lucide-react";
import { ConditionTab } from "@/components/warung/ConditionTab";
import { WelcomeTour } from "@/components/warung/WelcomeTour";
import { DashboardPage, PageHeader } from "@/components/dashboard";
import { supabase } from "@/lib/supabase";

/**
 * Kondisi awal usaha, pindah dari dalam Laporan.
 *
 * Di sana ia salah tempat. Laporan menjawab « bagaimana usaha saya berjalan »
 * dan dibaca berulang kali; kondisi awal menjawab « dari mana saya mulai » dan
 * diisi sekali seumur usaha. Menaruh keduanya bersebelahan membuat yang sekali
 * seumur hidup terlihat seperti sesuatu yang rutin diperbarui.
 *
 * LANGKAH PERTAMA PEMILIK BARU. `/auth/continue` mengantar pemilik yang baru
 * mendaftar ke sini (`?mulai=1`), sekali. Perkenalan empat kartu muncul di
 * sini, lalu ajakan mengisi kondisi awal dengan « Lewati, isi nanti » yang
 * selalu terlihat -- menahan orang di pintu masuk lebih buruk daripada angka
 * yang menyusul. Daftar persiapan di Beranda mengingatkannya lagi.
 */
export default function OpeningConditionPage() {
  return (
    <Suspense fallback={null}>
      <OpeningCondition />
    </Suspense>
  );
}

function OpeningCondition() {
  const router = useRouter();
  const onboarding = useSearchParams().get("mulai") === "1";
  const [tour, setTour] = useState<{ ownerName: string } | null>(null);

  // Perkenalan hanya bagi yang belum pernah melihatnya. Profil yang gagal
  // dibaca tidak dianggap baru: perkenalan yang muncul karena bacaan gagal
  // akan muncul pada orang yang sudah melewatinya.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_seen_at,nama_pemilik,name")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (cancelled || error || !data || data.onboarding_seen_at !== null) return;
      setTour({ ownerName: data.nama_pemilik || data.name || "" });
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {tour && <WelcomeTour ownerName={tour.ownerName} onClose={() => setTour(null)} />}
      <DashboardPage>
        <PageHeader
          title={onboarding ? "Langkah pertama: kondisi usaha Anda" : "Kondisi awal keuangan"}
          description={
            onboarding
              ? "Uang, stok, alat, piutang, dan utang yang sudah ada hari ini menjadi titik mulai laporan Anda. Belum sempat menghitung? Lewati dulu dan isi kapan saja dari menu Profil."
              : "Titik mulai usaha Anda: uang, stok, alat, piutang, dan utang yang sudah ada sebelum mulai mencatat di sini. Diisi sekali, lalu dipakai sebagai dasar seluruh laporan."
          }
          icon={Wallet}
        />
        <ConditionTab
          onSkip={onboarding ? () => router.push("/umkm") : undefined}
          onOpeningSaved={onboarding ? () => router.push("/umkm") : undefined}
        />
      </DashboardPage>
    </>
  );
}
