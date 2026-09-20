"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Trash2, UserPlus, Users } from "lucide-react";
import { DashboardPage, EmptyState, FeedbackBanner, PageHeader } from "@/components/dashboard";
import { useConfirm } from "@/components/ui/confirm";
import { notifyFailure, notifySuccess } from "@/lib/notify";
import { institutionHeaders, useInstitution } from "@/modules/institution/institution-context";

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
  const { institutions, selectedId, selected, select, loading } = useInstitution();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const { confirm } = useConfirm();
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const isOrgAdmin = selected?.role === "admin";

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
        { description: "Masuk sebagai VIEWER dan langsung bisa membuka portal." },
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

  return (
    <DashboardPage>
      <PageHeader
        title="Organisasi"
        description="Kelola identitas organisasi, anggota, dan lisensi pilot."
        icon={Building2}
      />
      {loadError && <FeedbackBanner tone="error" live>{loadError}</FeedbackBanner>}

      {institutions.length > 1 && (
        <section aria-label="Pilih organisasi" className="mt-5 flex flex-wrap gap-2">
          {institutions.map((row) => (
            <button
              key={row.institutionId}
              onClick={() => select(row.institutionId)}
              aria-pressed={row.institutionId === selectedId}
              className={`min-h-11 rounded-full px-4 text-xs font-bold ${
                row.institutionId === selectedId
                  ? "bg-[#0b5f86] text-white"
                  : "border border-slate-300 bg-white text-slate-600"
              }`}
            >
              {row.name} · {row.role.toUpperCase()}
            </button>
          ))}
        </section>
      )}

      {loading || !institution ? (
        <EmptyState
          icon={Building2}
          title="Organisasi belum tersedia"
          description="Hubungi admin platform untuk menyiapkan organisasi."
        />
      ) : (
        /*
          `grid-cols-[minmax(0,1fr)]`, bukan sekadar `grid`.

          Track grid bawaan berukuran `auto`, yang berarti TIDAK PERNAH lebih
          sempit dari min-content item terlebar. Di 360px satu kartu memaksa
          track menjadi 346px, dan karena hanya satu kolom, KETIGA kartu ikut
          melebihi layar -- lalu `overflow-x: hidden` di shell menyembunyikan
          akibatnya alih-alih memperbaikinya: tepi kanannya terpotong diam-diam.

          `minmax(0,1fr)` mengizinkan tracknya menyusut, dan isinya yang
          memotong diri.
        */
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0b5f86]">Profil organisasi</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">{institution.name}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Info label="Jenis" value={institution.type} />
              <Info label="Status" value={institution.status === "active" ? "Aktif" : institution.status} />
              <Info
                label="Verifikasi"
                value={institution.verification_status === "verified" ? "Terverifikasi" : "Menunggu"}
              />
              <Info label="Anggota aktif" value={String(aktif)} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0b5f86]">Lisensi pilot</p>
            {/*
              Dua kolom di layar paling sempit, tiga mulai dari 400px.

              "Kredit terpakai" tidak bisa menyusut lebih sempit dari katanya,
              jadi tiga kolom pada 360px memaksa kartunya melebihi lebar layar
              -- dan `overflow-x: hidden` di shell MENYEMBUNYIKAN akibatnya
              alih-alih memperbaikinya: tepi kanan kartunya terpotong diam-diam.
            */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-center min-[400px]:grid-cols-3">
              {/*
                Kursi ditulis sebagai "2 dari 10", bukan "10".
                Angka tunggal membuat batasnya tak terlihat sampai ia menolak
                penambahan -- dan pada saat itu orangnya sudah mengetik surel.
              */}
              <Metric label="Kursi terpakai" value={kursi === null ? String(aktif) : `${aktif}/${kursi}`} />
              <Metric label="Kredit dossier" value={String(entitlement?.dossier_credits ?? 0)} />
              <Metric label="Kredit terpakai" value={String(entitlement?.credits_used ?? 0)} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Periode: {entitlement?.license_from ?? "—"} s.d. {entitlement?.license_to ?? "—"}
            </p>
            {entitlement?.plan_note && (
              <p className="mt-1 text-xs text-slate-500">Paket: {entitlement.plan_note}</p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Penagihan manual pada fase pilot. Kredit hanya berkurang saat permintaan disetujui. Admin
              platform mengatur lisensi dari halaman admin.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Users size={17} className="text-[#0b5f86]" />
              Anggota organisasi
            </h2>

            {members.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Belum ada anggota"
                description="Tambahkan rekan kerja lewat surel akun BERKEMBANG.ID mereka."
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {sebutan(member)}
                        {member.is_self && (
                          <span className="ml-2 rounded bg-[#d6eefa] px-1.5 py-0.5 text-[10px] font-bold text-[#0b5f86]">
                            Anda
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {member.email ?? "Surel belum terbaca"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#0b5f86] ring-1 ring-slate-200">
                        {member.role}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          member.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {member.status === "active" ? "Aktif" : "Nonaktif"}
                      </span>

                      {/*
                        Baris admin dan baris sendiri tidak diberi tombol sama
                        sekali. Basis data menolak keduanya, dan tombol yang
                        selalu ditolak hanya mengajari orang bahwa layar ini
                        tidak bisa dipercaya.
                      */}
                      {isOrgAdmin && member.role !== "ADMIN" && !member.is_self && (
                        <>
                          <button
                            onClick={() =>
                              void ubahStatus(member, member.status === "active" ? "suspended" : "active")
                            }
                            className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 hover:border-[#0b5f86]"
                          >
                            {member.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button
                            onClick={() => void keluarkan(member)}
                            aria-label={`Keluarkan ${sebutan(member)}`}
                            className="grid size-11 place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {isOrgAdmin && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs font-bold text-slate-600">
                    Surel rekan kerja
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="nama@dinas.go.id"
                        disabled={kursiPenuh}
                        className="min-h-11 w-56 font-normal outline-none disabled:bg-transparent"
                      />
                    </div>
                  </label>
                  <button
                    disabled={busy || kursiPenuh || !email.trim()}
                    onClick={() => void tambah()}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <UserPlus size={14} />
                    {busy ? "Menyimpan..." : "Tambah anggota"}
                  </button>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {kursiPenuh
                    ? "Kursi lisensi sudah terpakai semua. Nonaktifkan satu anggota lebih dulu, atau hubungi admin platform untuk menambah kursi."
                    : "Orangnya harus sudah punya akun BERKEMBANG.ID dengan surel itu. Anggota baru masuk sebagai VIEWER — peran hanya dapat diubah admin platform."}
                </p>
              </div>
            )}

            {!isOrgAdmin && (
              <p className="mt-3 text-xs text-slate-500">
                Hanya ADMIN organisasi yang dapat mengelola anggota.
              </p>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
