"use client";

import { Briefcase, ScrollText, Settings2 } from "lucide-react";
import PortalShell from "@/components/shell/PortalShell";
import { InstitutionProvider } from "@/modules/institution/institution-context";
import { INVESTOR_NAV, INVESTOR_ROUTES } from "./investor-navigation";

export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider portalKind="investor">
    <PortalShell
      base="/investor"
      nav={INVESTOR_NAV}
      routes={INVESTOR_ROUTES}
      eyebrow="Investor & offtaker"
      badge="Kemitraan UMKM"
      fallbackTitle="Portal investor"
      navLabel="Menu portal investor"
      ContextIcon={Briefcase}
      switcherLabel="Entitas aktif"
      fallbackContextName="Portal investor"
      contextHint="Investor / offtaker"
      menuLinks={[
        { href: "/investor/organisasi", label: "Entitas & tim", Icon: Settings2 },
        { href: "/investor/audit", label: "Log audit", Icon: ScrollText },
      ]}
      signOutDescription="Anda perlu masuk lagi untuk membuka portal investor."
    >
      {children}
    </PortalShell>
  </InstitutionProvider>;
}
