import type { RekeningInput, RekeningUsaha } from "@/modules/rekening/rekening-schema";

/**
 * Pemanggil rute rekening usaha.
 *
 * Kalimat galat dari server DITERUSKAN apa adanya ke `Error.message`, karena
 * sejak `lib/api/galat.ts` kalimat itu memang sudah berbahasa Indonesia dan
 * memang sudah menyebut langkah berikutnya. `notifyFromError` akan
 * membedakannya dari kegagalan sistem: yang berbentuk kalimat jadi kuning,
 * yang tidak jadi merah.
 */
async function minta<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("Koneksi terputus. Coba lagi setelah sinyal kembali.");
  }
  const payload = await response.json().catch(() => null) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Belum berhasil. Coba lagi sebentar lagi.");
  }
  return (payload?.data ?? null) as T;
}

export function ambilRekening() {
  return minta<RekeningUsaha | null>("/api/v1/rekening-usaha");
}

export function simpanRekening(input: RekeningInput) {
  return minta<RekeningUsaha>("/api/v1/rekening-usaha", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function lampirkanBuktiRekening(documentId: string) {
  return minta<RekeningUsaha>("/api/v1/rekening-usaha/bukti", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
}

export function lupakanRekening() {
  return minta<{ deleted: boolean }>("/api/v1/rekening-usaha", { method: "DELETE" });
}
