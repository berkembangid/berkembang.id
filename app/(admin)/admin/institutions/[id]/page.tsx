"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, ArrowLeft, Save, ShieldCheck, ShieldAlert, CheckCircle2, Award, Calendar, Mail, User, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import CitySelect from "@/components/CitySelect";
import { runAdminOperation } from "@/modules/admin/operations";

export default function InstitutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("Bank BUMN");
  const [programsCount, setProgramsCount] = useState("1");
  const [active, setActive] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [location, setLocation] = useState("");

  const [seats, setSeats] = useState("5");
  const [dossierCredits, setDossierCredits] = useState("20");
  const [creditsUsed, setCreditsUsed] = useState("0");
  const [licenseFrom, setLicenseFrom] = useState("");
  const [licenseTo, setLicenseTo] = useState("");
  const [planNote, setPlanNote] = useState("");
  const [entitlementMsg, setEntitlementMsg] = useState("");

  const [isFromProfiles, setIsFromProfiles] = useState(false);

  async function fetchDetail() {
    setLoading(true);
    setErrorMsg("");
    try {
      const isProfileId = idParam.startsWith("profile:");
      const databaseId = idParam.replace(/^(institution:|profile:)/, "");

      if (!isProfileId) {
        // Fetch from institutions table
        const { data, error } = await supabase
          .from("institutions")
          .select("*")
          .eq("id", databaseId)
          .single();

        if (error || !data) {
          // fallback search in profiles
          await fetchFromProfiles(databaseId);
        } else {
          setName(data.name || "");
          setType(data.type || "Bank BUMN");
          setProgramsCount(String(data.programs_count || 1));
          setActive(Boolean(data.active ?? true));
          setIsFromProfiles(false);
          const { data: entitlement } = await supabase
            .from("institution_entitlements")
            .select("seats,dossier_credits,credits_used,license_from,license_to,plan_note")
            .eq("institution_id", databaseId)
            .maybeSingle();
          if (entitlement) {
            setSeats(String(entitlement.seats ?? 5));
            setDossierCredits(String(entitlement.dossier_credits ?? 20));
            setCreditsUsed(String(entitlement.credits_used ?? 0));
            setLicenseFrom(entitlement.license_from ?? "");
            setLicenseTo(entitlement.license_to ?? "");
            setPlanNote(entitlement.plan_note ?? "");
          }
        }
      } else {
        await fetchFromProfiles(databaseId);
      }
    } catch (err: unknown) {
      console.error("Error fetching detail:", err);
      setErrorMsg("Gagal memuat detail data institusi.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFromProfiles(idStr: string) {
    setIsFromProfiles(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", idStr)
      .single();

    if (data) {
      setName(data.nama_institusi || data.name || "");
      setType(data.jenis_institusi || "Bank BUMN");
      setContactName(data.nama_contact || data.name || "");
      setContactEmail(data.email || "");
      setLocation(data.lokasi || "");
      setActive(true);
    } else {
      setErrorMsg("Data institusi tidak ditemukan di database.");
    }
  }

  useEffect(() => {
    if (idParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote load
      void fetchDetail();
    }
  }, [idParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    const progsNum = Number(programsCount) || 1;

    try {
      const databaseId = idParam.replace(/^(institution:|profile:)/, "");
      await runAdminOperation({
        action: "save_institution",
        source: isFromProfiles ? "profiles" : "institutions",
        id: databaseId,
        name: name.trim(),
        type,
        programsCount: progsNum,
        active,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        location: location.trim(),
      });

      setSuccessMsg("Data institusi berhasil diperbarui!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      console.error("Error saving institution:", err);
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setSaving(false);
    }
  };

  const handleEntitlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isFromProfiles) return;
    setEntitlementMsg("");
    setErrorMsg("");
    try {
      const databaseId = idParam.replace(/^(institution:|profile:)/, "");
      await runAdminOperation({
        action: "set_institution_entitlement",
        id: databaseId,
        seats: Math.max(0, Number(seats) || 0),
        dossierCredits: Math.max(0, Number(dossierCredits) || 0),
        licenseFrom: licenseFrom || undefined,
        licenseTo: licenseTo || undefined,
        planNote: planNote.trim() || undefined,
      });
      setEntitlementMsg("Lisensi pilot tersimpan. Kredit hanya berkurang saat permintaan disetujui.");
      setTimeout(() => setEntitlementMsg(""), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Lisensi belum tersimpan.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto">
      {/* Header & Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/admin/institutions")}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#0b5f86] transition-colors bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          Kembali ke Daftar Institusi
        </button>
        <span className="text-xs text-slate-400 font-mono">ID: {idParam}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-[#0b5f86]/10 text-[#0b5f86] flex items-center justify-center font-bold">
            <Building2 size={28} />
          </div>
          <div>
            <h1 className="font-headline text-xl md:text-2xl font-extrabold text-[#1b2a3a]">
              Detail & Edit Institusi
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuaikan data dan preferensi program institusi terdaftar
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Memuat data institusi dari database...
          </div>
        ) : errorMsg && !name ? (
          <div className="py-8 text-center text-xs text-red-500 font-medium">
            {errorMsg}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {successMsg && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                <CheckCircle2 size={16} />
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold animate-fade-in">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Nama Institusi / Lembaga *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Bank BNI KUR"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Jenis Lembaga *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                >
                  <option value="Bank BUMN">Bank BUMN</option>
                  <option value="Bank Swasta">Bank Swasta</option>
                  <option value="Bank / Koperasi">Bank / Koperasi</option>
                  <option value="Pemerintah">Pemerintah / BUMD</option>
                  <option value="Fintech">Fintech / P2P</option>
                  <option value="NGO / Yayasan">NGO / Yayasan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Jumlah Program Aktif
                </label>
                <input
                  type="number"
                  min="1"
                  value={programsCount}
                  onChange={(e) => setProgramsCount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Status Keaktifan
                </label>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                    active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {active ? <Shield size={14} /> : <ShieldAlert size={14} />}
                    {active ? "Institusi Aktif" : "Institusi Nonaktif"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider underline">Ubah</span>
                </button>
              </div>

              {isFromProfiles && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      Nama Penanggung Jawab / Contact Person
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Nama Kontak"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      Email Kontak
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="email@institusi.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0b5f86] focus:outline-none bg-white font-medium"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                      Lokasi / Kota Operasional
                    </label>
                    <CitySelect
                      value={location}
                      onChange={(val) => setLocation(val)}
                      placeholder="Pilih Kota / Kabupaten Operasional..."
                    />
                  </div>
                </>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/institutions")}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Save size={14} />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        )}

        {!loading && !isFromProfiles && name && (
          <form onSubmit={handleEntitlement} className="mt-6 border-t border-slate-100 pt-6">
            <h2 className="text-sm font-black text-[#1b2a3a]">Lisensi pilot & kredit dossier</h2>
            <p className="mt-1 text-xs text-slate-500">Penagihan manual fase pilot. Kredit berkurang hanya saat permintaan disetujui. Terpakai saat ini: {creditsUsed}.</p>
            {entitlementMsg && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">{entitlementMsg}</p>}
            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Kursi (seats)</label>
                <input type="number" min="0" value={seats} onChange={(e) => setSeats(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Kredit dossier</label>
                <input type="number" min="0" value={dossierCredits} onChange={(e) => setDossierCredits(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Lisensi dari</label>
                <input type="date" value={licenseFrom} onChange={(e) => setLicenseFrom(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Lisensi sampai</label>
                <input type="date" value={licenseTo} onChange={(e) => setLicenseTo(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Catatan paket</label>
                <input type="text" value={planNote} onChange={(e) => setPlanNote(e.target.value)} placeholder="Pilot 5 kursi + 20 kredit dossier" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs bg-white font-medium" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#0b5f86] text-white font-bold text-xs hover:bg-[#0f73a3] cursor-pointer">Simpan lisensi</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
