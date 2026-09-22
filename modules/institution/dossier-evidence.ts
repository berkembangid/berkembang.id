import "server-only";

/**
 * Bukti legalitas yang benar-benar diunggah pemilik, disiapkan untuk dicetak.
 *
 * Halaman 1 dossier tidak lagi memuat nomor dokumen sebagai teks saja. Yang
 * dibaca petugas lembaga adalah pindaiannya: KTP, NIB, NPWP, dan izin sektor
 * apa adanya seperti yang diunggah pemilik.
 *
 * Dua pagar yang tidak boleh lepas:
 *
 *   1. Hanya jenis dokumen yang izinnya disetujui pemilik (ConsentScope) yang
 *      pernah diambil dari storage. Scope yang tidak disetujui tidak
 *      menghasilkan baris, apalagi gambar.
 *   2. Berkas diambil dengan service role karena pembacanya lembaga, bukan
 *      pemilik -- tetapi kuerinya dikunci pada business_id dossier yang sudah
 *      disetujui, sama seperti angka keuangan di `dossier-repository`.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { ConsentScope } from "@/modules/consent/consent-schema";
import type { LegalitasItem } from "@/modules/institution/dossier-document";
import { documentTypeLabels, type DocumentType } from "@/modules/documents/document-schema";

/** Jenis dokumen yang ikut tercetak, per izin yang disetujui pemilik. */
const scopeDocumentTypes: Partial<Record<ConsentScope, readonly DocumentType[]>> = {
  owner_identity: ["ktp"],
  nib: ["nib"],
  npwp: ["npwp"],
  sector_certificates: ["pirt", "halal", "izin_edar"],
};

/** Urutan kartu di halaman 1: identitas dulu, izin sektor menyusul. */
const displayOrder: readonly DocumentType[] = ["ktp", "nib", "npwp", "pirt", "halal", "izin_edar"];

/** Maksimum gambar yang ditanam agar dossier tetap ringan dan tetap 2 halaman. */
const maxEmbeddedImages = 4;

/** Sisi terpanjang thumbnail. 900 px masih terbaca saat dicetak dua kolom di A4. */
const thumbnailEdge = 900;

/**
 * Batas bita saat `sharp` tidak tersedia dan gambar dipasang apa adanya.
 * Unggahan boleh sampai 5 MB; menanam empat berkas sebesar itu menghasilkan
 * PDF 20 MB yang tidak pantas disebut ringkas.
 */
const rawEmbedLimitBytes = 1_200_000;

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// -- Pengecil gambar (opsional) ---------------------------------------------

type SharpPipeline = {
  rotate: () => SharpPipeline;
  resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
  jpeg: (options: { quality: number; mozjpeg: boolean }) => SharpPipeline;
  toBuffer: () => Promise<Buffer>;
};
type SharpFactory = (input: Uint8Array) => SharpPipeline;

let sharpFactory: SharpFactory | null | undefined;

/**
 * `sharp` ikut terpasang bersama Next untuk optimasi gambar, jadi hampir selalu
 * ada. Ia didaftarkan sebagai optionalDependency: bila pemasangannya gagal di
 * suatu platform, dossier tetap terbit -- hanya gambar besar yang dilewati
 * (lihat `rawEmbedLimitBytes`).
 */
async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpFactory !== undefined) return sharpFactory;
  try {
    const loaded = (await import("sharp")) as unknown as { default?: SharpFactory };
    sharpFactory = loaded.default ?? (loaded as unknown as SharpFactory);
  } catch {
    sharpFactory = null;
  }
  return sharpFactory;
}

function toDataUri(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Mengubah berkas unggahan menjadi thumbnail JPEG siap tanam. `rotate()` tanpa
 * argumen memakai orientasi EXIF -- foto KTP dari kamera ponsel sering tersimpan
 * miring, dan tanpa ini ia tercetak menyamping.
 */
async function toThumbnail(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ image: string | null; imageNote: string | null }> {
  const sharp = await loadSharp();
  if (!sharp) {
    if (bytes.byteLength > rawEmbedLimitBytes) {
      return { image: null, imageNote: "Gambar terlalu besar untuk dicetak" };
    }
    return { image: toDataUri(bytes, mimeType), imageNote: null };
  }
  try {
    const resized = await sharp(bytes)
      .rotate()
      .resize({ width: thumbnailEdge, height: thumbnailEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    return { image: toDataUri(resized, "image/jpeg"), imageNote: null };
  } catch (error) {
    console.error("[dossier-evidence] gagal mengecilkan gambar:", error);
    return { image: null, imageNote: "Gambar tidak terbaca" };
  }
}

// -- Baris legalitas --------------------------------------------------------

type DocumentRow = {
  id: string;
  doc_type: string;
  status: string;
  storage_path: string | null;
  mime_type: string | null;
  doc_number: string | null;
  name_on_doc: string | null;
  issuer: string | null;
  valid_until: string | null;
  attested_at: string | null;
  updated_at: string;
};

function statusOf(row: DocumentRow): LegalitasItem["status"] {
  if (row.status === "verified" || row.attested_at) return "verified";
  return "available";
}

function detailOf(row: DocumentRow): string | undefined {
  const parts: string[] = [];
  if (row.doc_number) parts.push(`No. ${row.doc_number}`);
  else if (row.name_on_doc) parts.push(`a.n. ${row.name_on_doc}`);
  if (row.issuer) parts.push(row.issuer);
  if (row.valid_until) parts.push(`Berlaku s.d. ${row.valid_until.slice(0, 10)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Kartu legalitas halaman 1, lengkap dengan pindaiannya.
 *
 * Hanya scope yang disetujui yang menghasilkan kartu. Scope yang disetujui
 * tetapi dokumennya belum diunggah tetap muncul sebagai kartu kosong, karena
 * ketiadaan dokumen adalah informasi yang justru dicari lembaga.
 */
/** Jenis dokumen yang boleh dibaca untuk sekumpulan izin. */
function allowedTypes(scopes: ConsentScope[]): DocumentType[] {
  const allowed: DocumentType[] = [];
  for (const scope of scopes) {
    for (const docType of scopeDocumentTypes[scope] ?? []) {
      if (!allowed.includes(docType)) allowed.push(docType);
    }
  }
  return allowed;
}

/**
 * Kapan bukti legalitas terakhir berubah. Dipakai menilai apakah PDF yang
 * sudah diarsipkan masih menggambarkan keadaan hari ini: dokumen yang baru
 * diunggah pemilik harus membuat dossier diterbitkan ulang.
 */
export async function latestEvidenceUpdate(
  businessId: string,
  scopes: ConsentScope[],
): Promise<string | null> {
  const allowed = allowedTypes(scopes);
  if (allowed.length === 0) return null;

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("documents")
    .select("updated_at")
    .eq("business_id", businessId)
    .in("doc_type", allowed)
    .not("status", "in", "(rejected,superseded)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[dossier-evidence] gagal membaca waktu ubah dokumen:", error.message);
    return null;
  }
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

export async function buildLegalitasItems(
  businessId: string,
  scopes: ConsentScope[],
): Promise<LegalitasItem[]> {
  const allowed = allowedTypes(scopes);
  if (allowed.length === 0) return [];

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("documents")
    .select(
      "id,doc_type,status,storage_path,mime_type,doc_number,name_on_doc,issuer,valid_until,attested_at,updated_at",
    )
    .eq("business_id", businessId)
    .in("doc_type", allowed)
    .not("status", "in", "(rejected,superseded)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[dossier-evidence] gagal membaca daftar dokumen:", error.message);
  }

  // Satu berkas terbaru per jenis. Versi lama sudah berstatus 'superseded' dan
  // tersaring di kueri; sisa duplikat (mis. dua PIRT) diambil yang termuda.
  const newest = new Map<string, DocumentRow>();
  for (const row of (data ?? []) as DocumentRow[]) {
    if (!newest.has(row.doc_type)) newest.set(row.doc_type, row);
  }

  const items: LegalitasItem[] = [];
  let embedded = 0;

  for (const docType of displayOrder) {
    if (!allowed.includes(docType)) continue;
    const row = newest.get(docType);
    const label = documentTypeLabels[docType];

    if (!row) {
      items.push({ label, status: "unavailable", image: null, imageNote: "Belum diunggah" });
      continue;
    }

    const base: LegalitasItem = {
      label,
      status: statusOf(row),
      detail: detailOf(row),
      image: null,
      imageNote: null,
    };

    if (!row.storage_path) {
      items.push({ ...base, imageNote: "Berkas tidak ditemukan" });
      continue;
    }
    if (!imageMimeTypes.has(row.mime_type ?? "")) {
      items.push({ ...base, imageNote: "Berkas PDF, dibuka di portal" });
      continue;
    }
    if (embedded >= maxEmbeddedImages) {
      items.push({ ...base, imageNote: "Pindaian dibuka di portal" });
      continue;
    }

    const downloaded = await admin.storage.from("documents").download(row.storage_path);
    if (downloaded.error || !downloaded.data) {
      console.error("[dossier-evidence] gagal mengunduh berkas:", downloaded.error?.message);
      items.push({ ...base, imageNote: "Berkas tidak terbaca" });
      continue;
    }

    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const thumbnail = await toThumbnail(bytes, row.mime_type ?? "image/jpeg");
    if (thumbnail.image) embedded += 1;
    items.push({ ...base, ...thumbnail });
  }

  return items;
}
