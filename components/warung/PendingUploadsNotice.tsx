"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { listPendingUploads, PENDING_UPLOADS_EVENT } from "@/modules/ledger/pending-uploads";

/**
 * Penanda di Beranda bahwa ada rekaman atau foto yang belum terkirim.
 *
 * Berkasnya menunggu di ponsel sejak sinyal putus. Tanpa penanda ini pemilik
 * yang tidak membuka layar Catat lagi tidak tahu ada catatan yang tertahan.
 */
export function PendingUploadsNotice() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const refresh = () => { void listPendingUploads().then((items) => setCount(items.length)); };
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(PENDING_UPLOADS_EVENT, refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PENDING_UPLOADS_EVENT, refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  if (count === 0) return null;
  return (
    <Link href="/umkm/catat" className="flex min-h-11 items-center gap-3 rounded-2xl border border-umkm-warning-line bg-umkm-warning-soft px-3.5 py-3">
      <CloudOff size={16} className="shrink-0 text-umkm-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-umkm-ink">{count} catatan menunggu dikirim</span>
        <span className="block text-xs text-umkm-muted">Tersimpan di ponsel ini sejak sinyal putus. Ketuk untuk mengirim.</span>
      </span>
    </Link>
  );
}
