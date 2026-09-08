"use client";

import { Wallet } from "lucide-react";
import { ConditionTab } from "@/components/warung/ConditionTab";
import { DashboardPage, PageHeader } from "@/components/dashboard";

/**
 * Kondisi awal usaha, pindah dari dalam Laporan.
 *
 * Di sana ia salah tempat. Laporan menjawab « bagaimana usaha saya berjalan »
 * dan dibaca berulang kali; kondisi awal menjawab « dari mana saya mulai » dan
 * diisi sekali seumur usaha. Menaruh keduanya bersebelahan membuat yang sekali
 * seumur hidup terlihat seperti sesuatu yang rutin diperbarui.
 */
export default function OpeningConditionPage() {
  return (
    <DashboardPage>
      <PageHeader
        title="Kondisi awal keuangan"
        description="Titik mulai usaha Anda: uang, stok, alat, piutang, dan utang yang sudah ada sebelum mulai mencatat di sini. Diisi sekali, lalu dipakai sebagai dasar seluruh laporan."
        icon={Wallet}
      />
      <ConditionTab />
    </DashboardPage>
  );
}
