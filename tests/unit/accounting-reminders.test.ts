import { describe, expect, it } from "vitest";
import { groupReminders, reminderGroupText } from "@/components/warung/ReminderStrip";
import type { ReminderView } from "@/modules/accounting/period";

function reminder(overrides: Partial<ReminderView> = {}): ReminderView {
  return {
    kind: "HITUNG_STOK",
    periodMonth: "2026-08",
    dueDate: "2026-08-31",
    daysOverdue: 0,
    urgent: false,
    ...overrides,
  };
}

const closing = (date: string, urgent = true) =>
  reminder({ kind: "TUTUP_KAS", dueDate: date, periodMonth: date.slice(0, 7), urgent });

describe("pengelompokan pengingat", () => {
  it("menyatukan hari-hari yang sama jenisnya menjadi satu baris", () => {
    // Tiga kartu dengan kalimat penjelas yang sama persis diulang tiga kali
    // adalah pemborosan yang sebenarnya — alasannya satu, tanggalnya yang
    // berbeda.
    const groups = groupReminders([
      closing("2026-09-02", false),
      closing("2026-09-01"),
      closing("2026-06-28"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
  });

  it("menandai kelompok mendesak begitu satu anggotanya terlambat", () => {
    const groups = groupReminders([closing("2026-09-02", false), closing("2026-06-28", true)]);
    expect(groups[0].urgent).toBe(true);
  });

  it("mendahulukan tutup kas, karena ia hanya bisa dikerjakan pada harinya", () => {
    const groups = groupReminders([reminder({ urgent: true }), closing("2026-09-01")]);
    expect(groups.map((group) => group.kind)).toEqual(["TUTUP_KAS", "HITUNG_STOK"]);
  });

  it("tidak menyisakan kelompok kosong", () => {
    expect(groupReminders([])).toEqual([]);
    expect(groupReminders([closing("2026-09-01")]).map((group) => group.kind)).toEqual(["TUTUP_KAS"]);
  });
});

describe("kalimat pengingat", () => {
  it("menyebut tanggalnya saat hanya satu, dan jumlahnya saat lebih", () => {
    const one = reminderGroupText({ kind: "TUTUP_KAS", items: [closing("2026-09-01")], urgent: true });
    expect(one.title).toContain("1 Sep");

    const many = reminderGroupText({
      kind: "TUTUP_KAS",
      items: [closing("2026-09-01"), closing("2026-06-28")],
      urgent: true,
    });
    expect(many.title).toContain("2 hari belum ditutup");
  });

  it("menjelaskan akibat melewatkan hitungan stok, bukan sekadar memerintah", () => {
    const { title, because } = reminderGroupText({
      kind: "HITUNG_STOK",
      items: [reminder({ urgent: true })],
      urgent: true,
    });
    expect(title).toContain("Agustus 2026");
    // Yang membuat pemilik mau mengerjakannya adalah tahu apa ruginya kalau
    // tidak — bukan kata "harap segera".
    expect(because).toContain("untung bulan itu terlihat lebih kecil");
    expect(because).not.toMatch(/harap|segera|wajib/i);
  });

  it("membedakan bulan yang masih berjalan dari bulan yang sudah lewat", () => {
    const running = reminderGroupText({ kind: "HITUNG_STOK", items: [reminder()], urgent: false }).because;
    const overdue = reminderGroupText({
      kind: "HITUNG_STOK",
      items: [reminder({ urgent: true })],
      urgent: true,
    }).because;
    expect(running).toContain("Bulan ini hampir habis");
    expect(running).not.toEqual(overdue);
  });

  it("tidak memakai istilah akuntansi maupun bahasa penilaian pinjaman", () => {
    const groups = [
      { kind: "HITUNG_STOK" as const, items: [reminder()], urgent: false },
      { kind: "HITUNG_STOK" as const, items: [reminder({ urgent: true })], urgent: true },
      { kind: "TUTUP_KAS" as const, items: [closing("2026-09-02", false)], urgent: false },
      { kind: "TUTUP_KAS" as const, items: [closing("2026-09-01")], urgent: true },
    ];
    for (const group of groups) {
      const { title, because } = reminderGroupText(group);
      for (const text of [title, because]) {
        expect(text).not.toMatch(/jurnal|debit|kredit|akun|persediaan|akrual|rekonsiliasi/i);
        expect(text).not.toMatch(/plafon|layak|disetujui|ditolak|skor/i);
      }
    }
  });
});
