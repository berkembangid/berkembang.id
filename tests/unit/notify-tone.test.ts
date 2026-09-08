import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Satu aturan yang diuji di sini, dan ia aturan produk, bukan selera:
 * MERAH DISEDIAKAN UNTUK KEGAGALAN SISTEM.
 *
 * Salah ketik nominal, tanggal di periode yang sudah ditutup, alasan yang
 * terlalu pendek -- semuanya hal biasa yang tinggal dibetulkan pemilik. Bila
 * semuanya merah, warna merah berhenti berarti apa-apa, dan ketika sistemnya
 * benar-benar gagal tidak ada lagi cara mengatakannya.
 *
 * Pembedanya: kalau lapisan bawah sudah menjelaskan dalam kalimat yang bisa
 * dibaca pemilik, berarti ada yang bisa dikerjakan -- kuning. Kalau yang
 * sampai hanya kode atau tidak ada apa pun, tidak seorang pun tahu apa yang
 * salah, dan itulah kegagalan sistem -- merah.
 */
const calls: Array<{ kind: string; message: string }> = [];

vi.mock("sonner", () => ({
  toast: {
    success: (message: string) => calls.push({ kind: "success", message }),
    warning: (message: string) => calls.push({ kind: "warning", message }),
    error: (message: string) => calls.push({ kind: "error", message }),
    info: (message: string) => calls.push({ kind: "info", message }),
    loading: (message: string) => calls.push({ kind: "loading", message }),
    dismiss: () => undefined,
  },
}));

const { notifyFromError } = await import("@/lib/notify");

beforeEach(() => {
  calls.length = 0;
});

describe("nada pemberitahuan dari sesuatu yang dilempar", () => {
  it("memakai kuning ketika pesannya bisa dibaca pemilik", () => {
    notifyFromError(new Error("Tanggalnya sudah masuk hari yang kasnya ditutup."), "Gagal.");
    expect(calls).toEqual([
      { kind: "warning", message: "Tanggalnya sudah masuk hari yang kasnya ditutup." },
    ]);
  });

  it("memakai merah untuk kode galat, bukan menampilkannya apa adanya", () => {
    // Pemilik warung yang membaca "BUSINESS_ACCESS_DENIED" tidak mendapat
    // penjelasan apa pun; yang ia dapat hanya kesan bahwa aplikasinya rusak.
    notifyFromError(new Error("BUSINESS_ACCESS_DENIED"), "Catatan belum tersimpan.");
    expect(calls).toEqual([{ kind: "error", message: "Catatan belum tersimpan." }]);
  });

  it("memakai merah ketika tidak ada penjelasan sama sekali", () => {
    notifyFromError(new Error(""), "Catatan belum tersimpan.");
    notifyFromError(undefined, "Catatan belum tersimpan.");
    notifyFromError({ pesan: "bukan Error" }, "Catatan belum tersimpan.");
    expect(calls.map((call) => call.kind)).toEqual(["error", "error", "error"]);
  });

  it("memakai merah untuk pesan teknis satu kata", () => {
    notifyFromError(new Error("timeout"), "Catatan belum tersimpan.");
    expect(calls[0].kind).toBe("error");
  });

  it("tidak pernah memakai merah untuk kalimat Indonesia yang utuh", () => {
    for (const message of [
      "Nominalnya harus lebih besar dari nol.",
      "Alat ini sudah ditandai tidak dipakai.",
      "Kondisi awal usaha sudah pernah diisi.",
    ]) {
      calls.length = 0;
      notifyFromError(new Error(message), "Gagal.");
      expect(calls[0], message).toEqual({ kind: "warning", message });
    }
  });
});
