"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Users } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

type Member = { id: string; user_id: string | null; role: string; status: string; joined_at: string | null };
type Entitlement = { seats: number; dossier_credits: number; credits_used: number; license_from: string | null; license_to: string | null; plan_note: string | null };
type Institution = { id: string; name: string; type: string; status: string; verification_status: string };

const roles = ["ADMIN", "ANALYST", "VIEWER"] as const;

export default function InstitutionOrganizationPage() {
  const { institutions, selectedId, selected, select, loading } = useInstitution();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [message, setMessage] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof roles)[number]>("VIEWER");
  const [inviteUserId, setInviteUserId] = useState("");
  const [busy, setBusy] = useState(false);

  const isOrgAdmin = selected?.role === "admin";

  useEffect(() => {
    if (!selectedId) return;
    fetch("/api/v1/institution/members", { cache: "no-store", headers: institutionHeaders(selectedId) })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.error ?? "Organisasi belum dapat dimuat.");
        setInstitution(body.data.institution);
        setMembers(body.data.members ?? []);
        setEntitlement(body.data.entitlement);
        void fetch("/api/v1/institution/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
          body: JSON.stringify({ artifact: "ORGANIZATION" }),
        }).catch(() => undefined);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Organisasi belum dapat dimuat."));
  }, [selectedId]);

  async function invite() {
    if (!selectedId || !inviteUserId.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/institution/members", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ userId: inviteUserId.trim(), role: inviteRole, status: "active" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Undangan belum dapat dikirim.");
      setInviteUserId("");
      setMessage("Anggota ditambahkan. Peran mengikuti standar SPEC: ADMIN, ANALYST, VIEWER.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Undangan belum dapat dikirim.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(memberId: string, patch: { role?: string; status?: string }) {
    if (!selectedId) return;
    setMessage("");
    try {
      const response = await fetch("/api/v1/institution/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ memberId, ...patch }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Anggota belum dapat diperbarui.");
      setMembers((current) => current.map((row) => row.id === memberId ? { ...row, ...patch } : row));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Anggota belum dapat diperbarui.");
    }
  }

  return <DashboardPage>
    <PageHeader title="Organisasi" description="Kelola identitas organisasi, anggota, peran, dan lisensi pilot." icon={Building2} />
    {message && <FeedbackBanner live>{message}</FeedbackBanner>}

    {institutions.length > 1 && <section aria-label="Pilih organisasi" className="mt-5 flex flex-wrap gap-2">
      {institutions.map((row) => <button key={row.institutionId} onClick={() => select(row.institutionId)} aria-pressed={row.institutionId === selectedId} className={`min-h-10 rounded-full px-4 text-xs font-bold ${row.institutionId === selectedId ? "bg-[#0b5f86] text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{row.name} · {row.role.toUpperCase()}</button>)}
    </section>}

    {loading || !institution ? <EmptyState icon={Building2} title="Organisasi belum tersedia" description="Hubungi admin platform untuk menyiapkan organisasi." /> : <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0b5f86]">Profil organisasi</p>
        <h2 className="mt-2 text-xl font-black text-slate-900">{institution.name}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Info label="Jenis" value={institution.type} />
          <Info label="Status" value={institution.status === "active" ? "Aktif" : institution.status} />
          <Info label="Verifikasi" value={institution.verification_status === "verified" ? "Terverifikasi" : "Menunggu"} />
          <Info label="Anggota aktif" value={String(members.filter((member) => member.status === "active").length)} />
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0b5f86]">Lisensi pilot</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Metric label="Kursi" value={String(entitlement?.seats ?? 0)} />
          <Metric label="Kredit dossier" value={String(entitlement?.dossier_credits ?? 0)} />
          <Metric label="Terpakai" value={String(entitlement?.credits_used ?? 0)} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Periode: {entitlement?.license_from ?? "—"} s.d. {entitlement?.license_to ?? "—"}</p>
        {entitlement?.plan_note && <p className="mt-1 text-xs text-slate-500">Paket: {entitlement.plan_note}</p>}
        <p className="mt-3 text-xs leading-5 text-slate-500">Penagihan manual pada fase pilot. Kredit hanya berkurang saat permintaan disetujui. Admin platform mengatur lisensi dari halaman admin.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Users size={17} className="text-[#0b5f86}" />Anggota organisasi</h2>
        <div className="mt-3 space-y-2">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs">
          <span className="font-mono text-slate-600">{member.user_id?.slice(0, 8) ?? "Undangan"}{member.user_id ? "…" : ""}</span>
          <span className="font-bold uppercase text-[#0b5f86]">{member.role} · {member.status}</span>
          {isOrgAdmin && <span className="flex gap-1">
            {roles.map((role) => <button key={role} disabled={member.role === role} onClick={() => void updateMember(member.id, { role })} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold disabled:opacity-40">{role}</button>)}
            <button onClick={() => void updateMember(member.id, { status: member.status === "active" ? "suspended" : "active" })} className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-700">{member.status === "active" ? "Suspend" : "Aktifkan"}</button>
          </span>}
        </div>)}</div>
        {isOrgAdmin && <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-slate-300 p-3">
          <label className="text-xs font-bold text-slate-600">User ID anggota baru<input value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)} placeholder="UUID pengguna" className="mt-1 min-h-10 w-64 rounded-lg border border-slate-300 px-3 font-mono font-normal" /></label>
          <label className="text-xs font-bold text-slate-600">Peran<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as (typeof roles)[number])} className="mt-1 min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-normal">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <button disabled={busy || !inviteUserId.trim()} onClick={() => void invite()} className="flex min-h-10 items-center gap-1 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} />{busy ? "Menyimpan..." : "Tambah anggota"}</button>
        </div>}
        {!isOrgAdmin && <p className="mt-3 text-xs text-slate-500">Hanya ADMIN organisasi yang dapat mengelola anggota.</p>}
      </section>
    </div>}
  </DashboardPage>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xl font-black text-slate-900">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>; }
