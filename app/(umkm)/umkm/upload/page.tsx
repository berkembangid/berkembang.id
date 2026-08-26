"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle2, Trash2, ArrowUpRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

const REQUIRED_DOCS = [
  { type: "ktp", name: "KTP Pemilik Usaha", desc: "Wajib untuk verifikasi identitas pemilik", required: true },
  { type: "nib", name: "NIB (Nomor Induk Berusaha)", desc: "Bukti legalitas formal usaha dari OSS", required: true },
  { type: "npwp", name: "NPWP Usaha / Perorangan", desc: "Dokumen pendaftaran perpajakan", required: true },
  { type: "laporan_keuangan", name: "Laporan Keuangan / Arus Kas", desc: "Catatan transaksi 3-6 bulan terakhir", required: true },
  { type: "rekening_koran", name: "Rekening Koran Bank", desc: "Bukti mutasi transaksi usaha", required: false },
  { type: "akta", name: "Akta Pendirian / SK", desc: "Dokumen legalitas badan usaha (jika ada)", required: false },
];

const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

interface DocumentRecord {
  id: string;
  name: string;
  doc_type: string;
  storage_path: string | null;
  file_url?: string | null;
  ai_notes?: string | null;
  status: string;
}

export default function UploadPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchDocs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Sesi berakhir. Silakan masuk kembali.");
      return;
    }
    const { data, error } = await supabase.from("documents").select("*").eq("user_id", user.id);
    if (error) {
      setMsg("Dokumen belum dapat dimuat. Silakan coba lagi.");
    } else {
      setDocs(data || []);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async remote read
    void fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
      setMsg("Format dokumen tidak didukung. Gunakan PDF, JPG, atau PNG.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      setMsg("Ukuran dokumen maksimal 5 MB.");
      e.target.value = "";
      return;
    }

    setUploadingType(docType);
    setMsg(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi berakhir");

      const fileExt = file.name.split(".").pop();
      const storagePath = `${user.id}/${docType}_${file.lastModified}_${file.size}.${fileExt}`;

      // Upload file to storage
      const { error: uploadErr } = await supabase.storage.from("documents").upload(storagePath, file, { upsert: true });
      if (uploadErr) throw new Error("File belum berhasil diunggah. Silakan coba lagi.");

      let aiNotes = "";
      let extractedNibNumber: string | null = null;

      // If document is NIB, trigger AI extraction and update user profile
      if (docType === "nib") {
        try {
          const extractFormData = new FormData();
          extractFormData.append("file", file);

          const res = await fetch("/api/ai/extract-nib", {
            method: "POST",
            body: extractFormData,
          });

          if (res.ok) {
            const extractData = await res.json();
            if (extractData?.nib) {
              extractedNibNumber = extractData.nib;
              aiNotes = `NIB Terdeteksi: ${extractData.nib}`;

              // 1. Sync to Supabase Auth User Metadata
              await supabase.auth.updateUser({
                data: {
                  nib: extractData.nib,
                  ...(extractData.nama_usaha ? { nama_usaha_oss: extractData.nama_usaha } : {}),
                },
              });

              // 2. Sync to Supabase 'profiles' table
              await supabase.from("profiles").upsert({
                id: user.id,
                nib: extractData.nib,
                updated_at: new Date().toISOString(),
              });
            }
          }
        } catch (aiErr) {
          console.warn("AI NIB extraction warning:", aiErr);
        }
      }

      // Insert record to DB
      const { error: dbErr } = await supabase.from("documents").insert({
        user_id: user.id,
        name: file.name,
        doc_type: docType,
        storage_path: storagePath,
        file_url: null,
        file_size: file.size,
        mime_type: file.type,
        status: "uploaded",
        ai_notes: aiNotes || undefined,
      });

      if (dbErr) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw new Error("Data dokumen belum berhasil disimpan. Silakan coba lagi.");
      }

      if (extractedNibNumber) {
        setMsg(`🎉 Dokumen NIB "${file.name}" berhasil diunggah! Nomor NIB (${extractedNibNumber}) berhasil diekstrak dan otomatis tersimpan di Profil Usaha.`);
      } else {
        setMsg(`Dokumen ${file.name} berhasil diupload!`);
      }
      await fetchDocs();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Dokumen belum berhasil diunggah.");
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (id: string, storagePath: string | null) => {
    try {
      if (storagePath) {
        const { error: storageError } = await supabase.storage.from("documents").remove([storagePath]);
        if (storageError) throw new Error("File belum berhasil dihapus.");
      }
      const { error: databaseError } = await supabase.from("documents").delete().eq("id", id);
      if (databaseError) throw new Error("Data dokumen belum berhasil dihapus.");
      await fetchDocs();
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : "Dokumen belum berhasil dihapus.");
    }
  };

  const handleView = async (documentId: string) => {
    setMsg(null);
    try {
      const response = await fetch("/api/documents/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const result = (await response.json().catch(() => null)) as { signedUrl?: string } | null;
      if (!response.ok || !result?.signedUrl) throw new Error("Tautan dokumen belum dapat dibuat.");
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Dokumen belum dapat dibuka.");
    }
  };

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-800">Upload Dokumen Usaha</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Unggah dokumen legalitas & keuangan untuk meningkatkan skor kesiapan pengajuan KUR / pendanaan.
        </p>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          {msg}
        </div>
      )}

      {/* Grid of Documents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REQUIRED_DOCS.map((doc) => {
          const uploadedDoc = docs.find((d) => d.doc_type === doc.type);
          const isUploaded = Boolean(uploadedDoc);
          const isUploading = uploadingType === doc.type;

          return (
            <div
              key={doc.type}
              className={`p-5 rounded-2xl border transition-all ${
                isUploaded
                  ? "bg-white border-emerald-200 shadow-sm"
                  : "bg-white border-slate-200 hover:border-blue-300 shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isUploaded ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      {doc.name}
                      {doc.required && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                          Wajib
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{doc.desc}</p>
                  </div>
                </div>

                {uploadedDoc ? (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1 flex-shrink-0">
                    <CheckCircle2 size={13} /> Terupload
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full flex-shrink-0">
                    Belum ada
                  </span>
                )}
              </div>

              {/* Upload area or view file */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                {uploadedDoc ? (
                  <div className="flex items-center justify-between w-full">
                    <div className="overflow-hidden">
                      <p className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">{uploadedDoc.name}</p>
                      <p className="text-[10px] text-slate-400">Status: {uploadedDoc.status}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadedDoc.storage_path && (
                        <button
                          type="button"
                          onClick={() => handleView(uploadedDoc.id)}
                          className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          Lihat <ArrowUpRight size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(uploadedDoc.id, uploadedDoc.storage_path)}
                        className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {uploadedDoc.ai_notes && (
                      <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 flex items-center justify-between text-[11px] text-emerald-800">
                        <span className="flex items-center gap-1.5 font-bold font-mono">
                          <Sparkles size={13} className="text-emerald-600 flex-shrink-0" />
                          {uploadedDoc.ai_notes}
                        </span>
                        <Link href="/umkm/profil" className="font-bold underline text-emerald-900 hover:text-emerald-700 ml-2 whitespace-nowrap">
                          Lihat di Profil →
                        </Link>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 py-2.5 px-4 rounded-xl text-xs font-bold text-blue-600 cursor-pointer transition-all">
                    <Upload size={14} />
                    {isUploading ? (doc.type === "nib" ? "Mengekstrak NIB AI..." : "Mengunggah...") : "Pilih / Drop Dokumen"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, doc.type)}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
