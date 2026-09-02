import { describe, expect, it } from "vitest";
import {
  assuranceText,
  cabinetShelves,
  requirementLabel,
  shelfUploadCards,
  uploadCardsFor,
} from "@/modules/documents/cabinet-shelves";

describe("cabinetShelves", () => {
  it("follows the journey a warung actually walks", () => {
    expect(cabinetShelves.map((shelf) => shelf.id)).toEqual([
      "identitas",
      "legalitas",
      "bukti_transaksi",
      "aset_kontrak",
      "arsip_keluaran",
    ]);
  });

  it("names the shelves in the owner's words", () => {
    const titles = cabinetShelves.map((shelf) => shelf.title);
    expect(titles).toContain("Nota & bukti");
    expect(titles).toContain("Laporan yang pernah dibuat");
    // Kelompok lama menyusun berkas menurut cara bank memandangnya.
    expect(titles).not.toContain("Keuangan & Transaksi");
    expect(titles).not.toContain("Bukti Pendukung Usaha");
  });
});

describe("shelfUploadCards", () => {
  it("no longer offers to upload a financial statement", () => {
    // Produk ini menghasilkan laporan dari catatan harian. Menerima unggahan
    // laporan jadi berarti menyediakan jalan pintas melewati intinya, dan angka
    // yang masuk lewat situ tidak bisa ditelusuri ke satu transaksi pun.
    expect(shelfUploadCards.map((card) => card.type)).not.toContain("laporan_keuangan");
  });

  it("no longer treats a QRIS history as a document", () => {
    // Itu sumber data untuk rekonsiliasi. Menyimpannya sebagai berkas membuat
    // pemilik mengira pekerjaannya selesai padahal datanya tidak dipakai.
    expect(shelfUploadCards.map((card) => card.type)).not.toContain("qris");
  });

  it("keeps identity documents on their own shelf", () => {
    for (const card of shelfUploadCards) {
      if (["ktp", "npwp"].includes(card.type)) expect(card.shelf).toBe("identitas");
    }
  });

  it("moves the bank statement in with tools and agreements", () => {
    expect(shelfUploadCards.find((card) => card.type === "rekening_koran")?.shelf).toBe(
      "aset_kontrak",
    );
  });
});

describe("uploadCardsFor", () => {
  it("does not ask a sole trader for a deed they cannot have", () => {
    const types = uploadCardsFor("perorangan").map((card) => card.type);
    expect(types).not.toContain("akta_pendirian");
  });

  it("asks a registered company for it", () => {
    expect(uploadCardsFor("badan_usaha").map((card) => card.type)).toContain("akta_pendirian");
  });

  it("changes the count the owner is measured against", () => {
    // Penghitung "X dari Y" harus ikut menyusut, kalau tidak pemilik
    // perorangan selamanya kurang satu dokumen yang tidak pernah bisa ia buat.
    expect(uploadCardsFor("perorangan").length).toBeLessThan(uploadCardsFor("badan_usaha").length);
  });
});

describe("requirementLabel", () => {
  it("calls a missing foundation a step, not a failure", () => {
    // Merah di produk ini hanya untuk kegagalan sistem. Dokumen yang belum ada
    // bukan kerusakan; ia langkah berikutnya.
    const label = requirementLabel("wajib");
    expect(label?.text).toBe("Fondasi");
    expect(label?.tone).toBe("attention");
    expect(label?.text).not.toBe("Wajib");
  });

  it("marks a recommended document without alarming anyone", () => {
    expect(requirementLabel("disarankan")).toEqual({ text: "Disarankan", tone: "neutral" });
  });

  it("says nothing for a document the sector does not ask for", () => {
    expect(requirementLabel(null)).toBeNull();
  });
});

describe("assuranceText", () => {
  it("distinguishes a typed number from a photographed permit", () => {
    expect(assuranceText("self_declared", false)).toBe("Baru nomornya");
    expect(assuranceText("self_declared", true)).toBe("Tersimpan");
  });

  it("never promises the document is genuine", () => {
    // Kita melaporkan derajat pemeriksaan, bukan menjamin keaslian.
    for (const level of ["self_declared", "checked", "confirmed", "attested"]) {
      expect(assuranceText(level, true).toLowerCase()).not.toContain("terverifikasi");
      expect(assuranceText(level, true).toLowerCase()).not.toContain("asli");
    }
  });

  it("names the highest level as a person checking, not a system", () => {
    expect(assuranceText("attested", true)).toBe("Diperiksa pendamping");
  });
});
