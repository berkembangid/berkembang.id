"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { formatTanggal } from "@/lib/format";
import { notifyFromError, notifySuccess } from "@/lib/notify";
import { setDocumentValidity } from "@/modules/documents/document-client";

/**
 * Masa berlaku izin, diisi di kartu dokumennya sendiri.
 *
 * Kartu dulu hanya berpesan « isi masa berlakunya biar bisa kami ingatkan »
 * tanpa kolom apa pun. Sekarang tanggalnya diisi di sini, dan pengingat di
 * Beranda muncul 30 hari sebelum habis.
 */
export function ValidityEditor({ documentId, validUntil, onSaved }: {
  documentId: string;
  validUntil: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!validUntil);
  const [value, setValue] = useState(validUntil ?? "");
  const [busy, setBusy] = useState(false);
  const inputId = `berlaku-${documentId}`;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await setDocumentValidity(documentId, value || null);
      notifySuccess(value ? `Berlaku sampai ${formatTanggal(value, "long")}` : "Masa berlaku dihapus", {
        description: value ? "Kami ingatkan di Beranda 30 hari sebelum habis." : undefined,
      });
      setEditing(false);
      onSaved();
    } catch (error) {
      notifyFromError(error, "Masa berlaku belum tersimpan.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing && validUntil) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-umkm-muted">
        <CalendarClock size={13} aria-hidden /> Berlaku sampai {formatTanggal(validUntil, "long")}
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center font-bold text-umkm-brand">Ubah</button>
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void save(event)} className="rounded-xl border border-umkm-warning-line bg-umkm-warning-soft p-3">
      <label htmlFor={inputId} className="block text-xs font-bold text-umkm-warning">
        Berlaku sampai tanggal berapa?
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-umkm-warning">Lihat tanggalnya di dokumen. Kami ingatkan 30 hari sebelum habis.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input id={inputId} type="date" value={value} onChange={(event) => setValue(event.target.value)} className="min-h-11 rounded-lg border border-umkm-line-strong bg-white px-3 text-sm text-umkm-ink" />
        <button type="submit" disabled={busy || (!value && !validUntil)} className="min-h-11 rounded-lg bg-umkm-brand px-4 text-xs font-bold text-white disabled:opacity-50">
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
        {validUntil && (
          <button type="button" onClick={() => { setValue(validUntil); setEditing(false); }} className="min-h-11 rounded-lg border border-umkm-line bg-white px-3 text-xs font-bold text-umkm-muted">Batal</button>
        )}
      </div>
    </form>
  );
}
