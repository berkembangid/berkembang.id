/**
 * Antrean kirim ulang untuk rekaman dan foto nota.
 *
 * Sinyal di warung sering putus justru saat pemilik menekan « Selesai ».
 * Dulu rekamannya hilang: yang tersisa hanya pesan galat, dan pemilik harus
 * bercerita ulang -- yang jarang ia lakukan. Sekarang berkasnya disimpan di
 * ponsel (IndexedDB) dan dikirim ulang begitu sinyal kembali, atau saat
 * pemilik menekan « Kirim sekarang ».
 *
 * Hanya kegagalan JARINGAN yang diantrekan. Kegagalan membaca (AI tidak
 * menangkap isinya) bukan urusan sinyal, dan mengirim ulang berkas yang sama
 * tidak akan mengubah hasilnya.
 *
 * Semua akses dibungkus: di jendela privat IndexedDB bisa tidak tersedia, dan
 * aplikasinya tetap harus berjalan seperti sebelum antrean ini ada.
 */

export type PendingUpload = {
  id: string;
  inputMethod: "voice" | "camera";
  mimeType: "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/mpeg" | "image/jpeg" | "image/png";
  blob: Blob;
  createdAt: string;
};

const DB_NAME = "berkembang-antrean";
const STORE = "unggahan";
/** Berkas lebih tua dari ini dibuang: ceritanya sudah tidak diingat, dan tanggalnya akan salah. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Kegagalan yang pantas dicoba lagi nanti: jaringan, bukan isi. */
export function shouldQueueForRetry(error: unknown, online: boolean): boolean {
  if (!online) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === "NETWORK_ERROR" || code === "UPLOAD_FAILED";
}

export function isExpired(item: Pick<PendingUpload, "createdAt">, now = Date.now()): boolean {
  return now - Date.parse(item.createdAt) > MAX_AGE_MS;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Menyimpan berkas; mengembalikan false bila penyimpanan ponsel tidak tersedia. */
export async function savePendingUpload(item: Omit<PendingUpload, "id" | "createdAt">): Promise<boolean> {
  const record: PendingUpload = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const result = await withStore("readwrite", (store) => store.put(record));
  if (result !== null) window.dispatchEvent(new Event(PENDING_UPLOADS_EVENT));
  return result !== null;
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
  const all = (await withStore<PendingUpload[]>("readonly", (store) => store.getAll())) ?? [];
  const expired = all.filter((item) => isExpired(item));
  for (const item of expired) await removePendingUpload(item.id);
  return all.filter((item) => !isExpired(item)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removePendingUpload(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new Event(PENDING_UPLOADS_EVENT));
}

/** Dikirim setiap kali isi antrean berubah, supaya penanda di layar lain ikut berubah. */
export const PENDING_UPLOADS_EVENT = "berkembang:antrean-unggahan";
