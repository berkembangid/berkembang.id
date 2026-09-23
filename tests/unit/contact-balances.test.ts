import { describe, expect, it } from "vitest";
import { reminderMessage, totalsByKind, whatsappLink, whatsappNumber } from "@/modules/ledger/contact-balances";

describe("tagihan lewat WhatsApp", () => {
  it("menormalkan nomor Indonesia ke bentuk wa.me", () => {
    expect(whatsappNumber("0812-3456-7890")).toBe("6281234567890");
    expect(whatsappNumber("+62 812 3456 7890")).toBe("6281234567890");
    expect(whatsappNumber("812345678901")).toBe("62812345678901");
    expect(whatsappNumber("123")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("pesannya menyebut nama, nominal, dan nama usaha, dan tetap sopan", () => {
    const text = reminderMessage({ name: "Bu Sari", balanceIdr: 200_000 }, "Warung Makmur");
    expect(text).toContain("Bu Sari");
    expect(text).toContain("Rp200.000");
    expect(text).toContain("Warung Makmur");
    expect(text).toContain("mohon abaikan");
  });

  it("tanpa nomor, WhatsApp dibuka untuk memilih kontak sendiri", () => {
    expect(whatsappLink({ name: "A", balanceIdr: 1, phone: null }, "")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(whatsappLink({ name: "A", balanceIdr: 1, phone: "08123456789" }, "")).toMatch(/^https:\/\/wa\.me\/628123456789\?text=/);
  });

  it("menjumlahkan piutang dan utang terpisah", () => {
    expect(totalsByKind([
      { kind: "PIUTANG", name: "A", balanceIdr: 200, since: null, lastActivity: null, phone: null },
      { kind: "UTANG", name: "B", balanceIdr: 500, since: null, lastActivity: null, phone: null },
    ])).toEqual({ piutangIdr: 200, utangIdr: 500 });
  });
});
