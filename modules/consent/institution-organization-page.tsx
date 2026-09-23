"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { DashboardPage, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";
import { formatDate } from "@/modules/consent/candidate-ui";
import { usePortal } from "@/modules/consent/portal-copy";

/**
 * Organisasi & anggota, portal lembaga.
 *
 * TIGA HAL YANG DIPERBAIKI DI SINI, DAN KETIGANYA SOAL MENGATAKAN YANG BENAR.
 *
 * 1. ANGGOTA PUNYA NAMA. Layar ini dulu meminta petugas dinas MENEMPELKAN UUID
 *    untuk menambah rekannya, dan menampilkan daftarnya sebagai "ee4bc4b2…".
 *    Tidak ada kepala seksi yang tahu UUID rekannya, dan tidak ada yang bisa
 *    memastikan siapa yang ia cabut aksesnya sebelum menekan "Suspend".
 *
 * 2. TOMBOL YANG TIDAK BISA BEKERJA DIHAPUS. Ada tiga tombol peran di sini:
 *    ADMIN, ANALYST, VIEWER. Trigger `protect_institution_membership_authority`
 *    (0013) memaksa `new.role := old.role` pada setiap UPDATE, jadi ketiganya
 *    dibatalkan diam-diam oleh basis data. Penekanannya mengembalikan HTTP 200,
 *    layar ini memperbarui tampilannya sendiri, lencananya berubah -- dan tidak
 *    ada yang berubah di basis data. Kebohongan yang bertahan sampai halaman
 *    dimuat ulang.
 *
 *    Kendali itu disengaja dan tidak dilonggarkan. Yang dihapus tombolnya.
 *
 * 3. TIDAK ADA LAGI PEMBARUAN OPTIMISTIS. Setiap perubahan dibaca ulang dari
 *    server. Penolakan RLS datang sebagai "200, nol baris" -- tampak persis
 *    seperti keberhasilan bagi kode yang tidak memeriksanya.
 */

type Member = {
  id: string;
  user_id: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  display_name: string | null;
  email: string | null;
  is_self: boolean;
};

type Entitlement = {
  seats: number;
  dossier_credits: number;
  credits_used: number;
  license_from: string | null;
  license_to: string | null;
  plan_note: string | null;
};

type Institution = {
  id: string;
  name: string;
  type: string;
  status: string;
  verification_status: string;
};

type Galat = { code?: string; message?: string };

/** Mengambil kalimat yang dikirim server; kode mentah tidak pernah ditampilkan. */
function pesanGalat(body: unknown, cadangan: string): string {
  const error = (body as { error?: Galat | string } | null)?.error;
  if (error && typeof error === "object" && typeof error.message === "string") return error.message;
  return cadangan;
}

export default function InstitutionOrganizationPage() {
  const portal = usePortal();
  // Pilihan organisasi ada di menu samping; halaman ini tidak lagi punya
  // deretan tombol organisasi kedua yang bisa berbeda dengannya.
  const { selectedId, selected, loading } = useInstitution();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const { confirm } = useConfirm();
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const isOrgAdmin = selected?.role?.toLowerCase() === "admin";

  /**
   * Satu-satunya sumber kebenaran layar ini.
   *
   * Dipanggil saat dibuka DAN sesudah setiap perubahan. Tidak ada cabang yang
   * menebak keadaan baru dari permintaan yang baru saja dikirim.
   */
  const muat = useCallback(async () => {
    if (!selectedId) return;
    try {
      const response = await fetch("/api/v1/institution/members", {
        cache: "no-store",
        headers: institutionHeaders(selectedId),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(pesanGalat(body, "Data organisasi belum dapat dimuat."));
      setInstitution(body.data.institution);
      setMembers(body.data.members ?? []);
      setEntitlement(body.data.entitlement);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Data organisasi belum dapat dimuat.");
    }
  }, [selectedId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
    void muat();
    if (!selectedId) return;
    void fetch("/api/v1/institution/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
      body: JSON.stringify({ artifact: "ORGANIZATION" }),
    }).catch(() => undefined);
  }, [muat, selectedId]);

  const aktif = members.filter((member) => member.status === "active").length;
  const kursi = entitlement?.seats ?? null;
  const kursiPenuh = kursi !== null && aktif >= kursi;

  /**
   * Menambahkan seseorang memberi ia akses ke SELURUH profil UMKM yang izinnya
   * masih berlaku untuk organisasi ini -- bukan hanya yang akan datang. Itu
   * yang ditanyakan, dengan nama orangnya, bukan dengan UUID-nya.
   */
  async function tambah() {
    if (!selectedId || !email.trim()) return;

    const yes = await confirm({
      title: `Tambahkan ${email.trim()} sebagai anggota?`,
      description:
        "Anggota baru langsung dapat melihat profil UMKM yang izinnya masih berlaku untuk organisasi ini. Setiap pembukaan dan unduhan tercatat atas nama organisasi.",
      confirmLabel: "Tambahkan",
      cancelLabel: "Batal",
    });
    if (!yes) return;

    setBusy(true);
    try {
      const response = await fetch("/api/v1/institution/members", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Anggota belum dapat ditambahkan."));
        return;
      }
      setEmail("");
      notifySuccess(
        body?.data?.reactivated ? "Anggota diaktifkan kembali" : "Anggota ditambahkan",
        { description: "Masuk sebagai Peninjau dan langsung bisa membuka portal." },
      );
      await muat();
    } catch {
      notifyFailure("Anggota belum dapat ditambahkan. Periksa koneksi, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  /** Menangguhkan tidak bisa dibatalkan oleh orang yang terkena -- itu yang ditanyakan. */
  async function ubahStatus(member: Member, status: "active" | "suspended") {
    if (!selectedId) return;
    const nama = sebutan(member);

    if (status === "suspended") {
      const yes = await confirm({
        title: `Nonaktifkan ${nama}?`,
        description:
          "Aksesnya ke profil UMKM organisasi ini berhenti seketika. Jejak pembukaan dan unduhan yang sudah terjadi tetap tersimpan, dan kursinya kembali kosong.",
        confirmLabel: "Nonaktifkan",
        cancelLabel: "Batal",
        tone: "danger",
      });
      if (!yes) return;
    }

    try {
      const response = await fetch("/api/v1/institution/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...institutionHeaders(selectedId) },
        body: JSON.stringify({ memberId: member.id, status }),
      });
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Anggota belum dapat diperbarui."));
      } else {
        notifySuccess(status === "suspended" ? `${nama} dinonaktifkan` : `${nama} diaktifkan`);
      }
    } catch {
      notifyFailure("Anggota belum dapat diperbarui. Periksa koneksi, lalu coba lagi.");
    } finally {
      // Dibaca ulang baik berhasil maupun gagal: sesudah kegagalan, layar harus
      // kembali menunjukkan keadaan yang sungguhan, bukan yang diharapkan.
      await muat();
    }
  }

  async function keluarkan(member: Member) {
    if (!selectedId) return;
    const nama = sebutan(member);

    const yes = await confirm({
      title: `Keluarkan ${nama} dari organisasi?`,
      description:
        "Barisnya hilang dari daftar dan aksesnya berhenti seketika. Jejak audit yang sudah terbentuk tetap tersimpan. Untuk menambahkannya lagi nanti, cukup masukkan surelnya.",
      confirmLabel: "Keluarkan",
      cancelLabel: "Batal",
      tone: "danger",
    });
    if (!yes) return;

    try {
      const response = await fetch(
        `/api/v1/institution/members?memberId=${encodeURIComponent(member.id)}`,
        { method: "DELETE", headers: institutionHeaders(selectedId) },
      );
      const body = await response.json();
      if (!response.ok) {
        notifyFailure(pesanGalat(body, "Anggota belum dapat dikeluarkan."));
      } else {
        notifySuccess(`${nama} dikeluarkan dari organisasi`);
      }
    } catch {
      notifyFailure("Anggota belum dapat dikeluarkan. Periksa koneksi, lalu coba lagi.");
    } finally {
      await muat();
    }
  }

  if (loading || (!institution && !loadError)) {
    return <DashboardPage>
      <PageHeader title={portal.organizationTitle} description="Identitas organisasi, anggota, dan lisensi." icon={Building2} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2" aria-hidden>
        <div className="h-44 animate-pulse rounded-2xl bg-white" />
        <div className="h-44 animate-pulse rounded-2xl bg-white" />
        <div className="h-56 animate-pulse rounded-2xl bg-white lg:col-span-2" />
      </div>
    </DashboardPage>;
  }

  return (
    <DashboardPage>
      <PageHeader title={portal.organizationTitle} description="Identitas organisasi, anggota, dan lisensi." icon={Building2} />
      {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

      {!institution ? null : (
        /*
          `grid-cols-[minmax(0,1fr)]`, bukan sekadar `grid`: track grid bawaan
          tidak pernah lebih sempit dari isinya yang terlebar, jadi satu kartu
          di 360px memaksa ketiganya melebihi layar.
        */
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5f86]">Profil organisasi</p>
            <h2 className="mt-1.5 text-lg font-bold text-[#1b2a3a]">{institution.name}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
              <Info label="Jenis" value={institution.type || "—"} />
              <Info label="Status" value={institution.status === "active" ? "Aktif" : "Tidak aktif"} />
              <Info label="Verifikasi" value={institution.verification_status === "verified" ? "Terverifikasi" : institution.verification_status === "rejected" ? "Ditolak" : "Menunggu"} />
              <Info label="Anggota aktif" value={String(aktif)} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5f86]">Lisensi</p>
            {/*
              Kursi ditulis "2 dari 10", bukan "10": angka tunggal membuat
              batasnya tak terlihat sampai ia menolak penambahan -- dan pada
              saat itu orangnya sudah mengetik surel.
            */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 min-[400px]:grid-cols-3">
              <Metric label="Kursi terpakai" value={kursi === null ? String(aktif) : `${aktif} dari ${kursi}`} />
              <Metric label="Kuota dosir" value={entitlement?.dossier_credits ? String(entitlement.dossier_credits) : "Tanpa batas"} />
              <Metric label="Dosir terpakai" value={String(entitlement?.credits_used ?? 0)} />
            </div>
            <p className="mt-3 text-xs text-[#6e859e]">
              Berlaku {formatDate(entitlement?.license_from ?? null, "—")} sampai {formatDate(entitlement?.license_to ?? null, "tanpa batas")}
              {entitlement?.plan_note && <> · {entitlement.plan_note}</>}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#8aa0b6]">
              Kuota berkurang saat permintaan disetujui pemilik usaha. Lisensi diatur admin platform.
            </p>
          </section>

          <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(16,40,64,.04)] lg:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#1b2a3a]"><Users size={17} className="text-[#0b5f86]" />Anggota</h2>
              <p className="text-xs text-[#6e859e]">{aktif} aktif{kursi !== null && ` dari ${kursi} kursi`}</p>
            </div>

            {members.length === 0
              ? <p className="mt-3 rounded-xl bg-[#f6f8fb] p-5 text-center text-xs text-[#6e859e]">Belum ada anggota. Tambahkan rekan kerja lewat surel akun Berkembang.id mereka.</p>
              : <ul className="mt-3 divide-y divide-[#eef2f6] rounded-xl border border-[#eef2f6]">
                {members.map((member) => {
                  const role = member.role.toLowerCase();
                  const canManage = isOrgAdmin && role !== "admin" && !member.is_self;
                  return <li key={member.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d6eefa] text-[11px] font-extrabold text-[#0b5f86]">{inisial(member)}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#1b2a3a]">
                          {sebutan(member)}
                          {member.is_self && <span className="ml-2 rounded bg-[#eef8fd] px-1.5 py-0.5 text-[10px] font-bold text-[#0b5f86]">Anda</span>}
                        </p>
                        <p className="truncate text-xs text-[#6e859e]">{member.email ?? "Surel belum terbaca"}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span title="Peran hanya dapat diubah admin platform" className="inline-flex min-h-7 items-center rounded-full border border-[#d5dee8] px-2.5 text-[11px] font-bold text-[#34496a]">{roleLabel(role)}</span>
                      <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${member.status === "active" ? "border-[#a9ebd0] bg-[#edfbf5] text-[#0a5c42]" : "border-[#f5d58a] bg-[#fff8e6] text-[#6b4700]"}`}>
                        {member.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                      {/*
                        Baris pengelola dan baris sendiri tidak diberi tombol.
                        Basis data menolak keduanya, dan tombol yang selalu
                        ditolak hanya mengajari orang bahwa layar ini tidak bisa
                        dipercaya.
                      */}
                      {canManage && <>
                        <button type="button" onClick={() => void ubahStatus(member, member.status === "active" ? "suspended" : "active")} className="min-h-11 rounded-xl border border-[#d5dee8] bg-white px-3.5 text-xs font-bold text-[#34496a] hover:bg-[#f6f8fb]">
                          {member.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                        <button type="button" onClick={() => void keluarkan(member)} aria-label={`Keluarkan ${sebutan(member)}`} title="Keluarkan dari organisasi" className="grid size-11 place-items-center rounded-xl border border-[#d5dee8] bg-white text-[#6e859e] hover:border-[#f4b0a8] hover:text-[#b4304a]">
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </>}
                    </div>
                  </li>;
                })}
              </ul>}

            {isOrgAdmin ? (
              <form className="mt-4 rounded-xl border border-dashed border-[#c8d3de] p-4" onSubmit={(event) => { event.preventDefault(); void tambah(); }}>
                <label htmlFor="member-email" className="text-xs font-bold text-[#4a6280]">Tambah anggota lewat surel</label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-[#d5dee8] bg-white px-3 focus-within:border-[#0b5f86] focus-within:ring-2 focus-within:ring-[#0b5f86]/15">
                    <Mail size={16} className="shrink-0 text-[#8aa0b6]" aria-hidden />
                    <input id="member-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@organisasi.co.id" disabled={kursiPenuh} className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" />
                  </div>
                  <button type="submit" disabled={busy || kursiPenuh || !email.trim()} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-sm font-bold text-white hover:bg-[#094f70] disabled:opacity-50">
                    <UserPlus size={15} />{busy ? "Menyimpan…" : "Tambah anggota"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#6e859e]">
                  {kursiPenuh
                    ? "Kursi lisensi sudah terpakai semua. Nonaktifkan satu anggota lebih dulu, atau hubungi admin platform untuk menambah kursi."
                    : "Orangnya harus sudah punya akun Berkembang.id dengan surel itu. Anggota baru masuk sebagai Peninjau — peran hanya dapat diubah admin platform."}
                </p>
              </form>
            ) : (
              <p className="mt-3 text-xs text-[#6e859e]">Hanya pengelola organisasi yang dapat menambah atau menonaktifkan anggota.</p>
            )}
          </section>
        </div>
      )}
    </DashboardPage>
  );
}

/** Nama yang bisa disebut manusia; surel kalau namanya belum ada. */
function sebutan(member: Member): string {
  return member.display_name ?? member.email ?? "Anggota tanpa nama";
}

function inisial(member: Member): string {
  const words = sebutan(member).split(/[\s@.]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Nama peran dalam bahasa layar. API anggota mengirim huruf besar ("ADMIN"),
 * konteks organisasi mengirim huruf kecil ("admin"); keduanya dinormalkan
 * lebih dulu, lalu diterjemahkan.
 */
function roleLabel(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized === "admin") return "Pengelola";
  if (normalized === "analyst" || normalized === "reviewer") return "Analis";
  if (normalized === "viewer") return "Peninjau";
  return role;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f6f8fb] p-3"><p className="text-[#6e859e]">{label}</p><p className="mt-1 font-bold text-[#1b2a3a]">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-[#f6f8fb] p-3"><p className="truncate text-base font-bold text-[#1b2a3a]">{value}</p><p className="mt-0.5 text-[11px] text-[#6e859e]">{label}</p></div>;
}
