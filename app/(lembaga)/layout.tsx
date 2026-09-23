"use client";

import { Building2, ScrollText, Settings2 } from "lucide-react";
import PortalShell from "@/components/shell/PortalShell";
import { InstitutionProvider } from "@/modules/institution/institution-context";
import { LEMBAGA_NAV, LEMBAGA_ROUTES } from "./lembaga-navigation";

export default function LembagaLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider portalKind="institution">
    <PortalShell
      base="/lembaga"
      nav={LEMBAGA_NAV}
      routes={LEMBAGA_ROUTES}
      eyebrow="Portal lembaga"
      badge="Akses berizin"
      fallbackTitle="Portal lembaga"
      groupLabel="Ruang kerja"
      navLabel="Menu portal lembaga"
      ContextIcon={Building2}
      switcherLabel="Organisasi aktif"
      fallbackContextName="Akun lembaga"
      contextHint="Akses hanya sesuai izin pemilik usaha"
      menuLinks={[
        { href: "/lembaga/organisasi", label: "Organisasi & anggota", Icon: Settings2 },
        { href: "/lembaga/audit", label: "Log audit", Icon: ScrollText },
      ]}
      signOutDescription="Anda perlu masuk lagi untuk membuka portal lembaga."
    >
      {children}
    </PortalShell>
  </InstitutionProvider>;
}
