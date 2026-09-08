import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_SCORE_GAP,
  rankReceiptCandidates,
} from "@/modules/ledger/receipt-candidate-ranker";

/**
 * Yang diuji di sini bukan « bisakah angka dibaca » -- itu tugas parser
 * nominal, dan ia sudah punya ujinya sendiri. Yang diuji: dari selusin angka
 * pada sebuah struk, apakah yang terpilih memang yang dibayar.
 *
 * Kesalahan yang paling mahal bukan salah baca angka, melainkan mengambil
 * angka yang salah dengan yakin: "TUNAI 100.000" untuk belanja 47.000 akan
 * tercatat rapi, seimbang, dan salah dua kali lipat.
 */
const top = (text: string) => rankReceiptCandidates(text).candidates[0]?.amountIdr ?? null;

describe("struk sederhana", () => {
  it("mengambil total, bukan angka terbesar", () => {
    expect(top("Nasi goreng 25.000\nEs teh 5.000\nTOTAL 30.000\nTUNAI 50.000\nKEMBALI 20.000")).toBe(30000);
  });

  it("mengambil total ketika hanya ada satu angka", () => {
    expect(top("TOTAL 47.000")).toBe(47000);
  });

  it("mengenali 'jumlah' sebagai penanda total", () => {
    expect(top("Beras 5kg 60.000\nMinyak 40.000\nJUMLAH 100.000")).toBe(100000);
  });

  it("mengenali 'grand total' di atas 'total' biasa", () => {
    const ranking = rankReceiptCandidates("TOTAL 90.000\nDiskon 10.000\nGRAND TOTAL 80.000");
    expect(ranking.candidates[0].amountIdr).toBe(80000);
  });

  it("mengenali 'harus dibayar'", () => {
    expect(top("Subtotal 120.000\nHARUS DIBAYAR 132.000")).toBe(132000);
  });

  it("membaca 'Total Belanja'", () => {
    expect(top("Item A 15.000\nTotal Belanja 15.000")).toBe(15000);
  });
});

describe("angka yang menyesatkan", () => {
  it("tidak pernah mengambil kembalian", () => {
    const ranking = rankReceiptCandidates("TOTAL 30.000\nTUNAI 100.000\nKEMBALIAN 70.000");
    expect(ranking.candidates.map((row) => row.amountIdr)).not.toContain(70000);
  });

  it("menurunkan tunai di bawah total meski nilainya lebih besar", () => {
    const ranking = rankReceiptCandidates("TOTAL 47.000\nTUNAI 100.000");
    expect(ranking.candidates[0].amountIdr).toBe(47000);
  });

  it("menurunkan subtotal di bawah total", () => {
    expect(top("SUBTOTAL 100.000\nPPN 11.000\nTOTAL 111.000")).toBe(111000);
  });

  it("tidak mengambil nilai diskon", () => {
    const ranking = rankReceiptCandidates("Subtotal 100.000\nDISKON 20.000\nTOTAL 80.000");
    expect(ranking.candidates[0].amountIdr).toBe(80000);
  });

  it("tidak mengambil PPN", () => {
    const ranking = rankReceiptCandidates("TOTAL 111.000\nPPN 11.000");
    expect(ranking.candidates[0].amountIdr).toBe(111000);
  });

  it("tidak mengambil biaya layanan", () => {
    expect(top("Biaya layanan 5.000\nTOTAL 55.000")).toBe(55000);
  });

  it("tidak mengambil harga satuan", () => {
    expect(top("Gula 2 x @12.000\nTOTAL 24.000")).toBe(24000);
  });

  it("tidak mengambil nomor telepon", () => {
    const ranking = rankReceiptCandidates("Telp: 081234567890\nTOTAL 25.000");
    expect(ranking.candidates[0].amountIdr).toBe(25000);
  });

  it("tidak mengambil NPWP", () => {
    const ranking = rankReceiptCandidates("NPWP: 123456789012345\nTOTAL 30.000");
    expect(ranking.candidates[0].amountIdr).toBe(30000);
  });

  it("mengabaikan tanggal", () => {
    const ranking = rankReceiptCandidates("12/08/2026\nTOTAL 18.000");
    expect(ranking.candidates.map((row) => row.amountIdr)).toEqual([18000]);
  });

  it("mengabaikan jam", () => {
    const ranking = rankReceiptCandidates("14:35:02\nTOTAL 18.000");
    expect(ranking.candidates.map((row) => row.amountIdr)).toEqual([18000]);
  });

  it("mengabaikan tanggal ISO", () => {
    const ranking = rankReceiptCandidates("2026-08-12\nTOTAL 18.000");
    expect(ranking.candidates.map((row) => row.amountIdr)).toEqual([18000]);
  });

  it("mengabaikan angka di bawah seratus rupiah", () => {
    // Nomor urut dan jumlah butir tidak pernah menjadi nominal.
    const ranking = rankReceiptCandidates("No. 7\nQty 3\nTOTAL 21.000");
    expect(ranking.candidates.map((row) => row.amountIdr)).toEqual([21000]);
  });
});

describe("tata letak struk", () => {
  it("membaca label yang berdiri di baris sendiri", () => {
    // Struk termal sempit sering mencetak label dan angkanya terpisah baris.
    expect(top("Belanja harian\nTOTAL\n64.500")).toBe(64500);
  });

  it("mengambil kolom paling kanan pada baris berisi beberapa angka", () => {
    expect(top("Telur 2 12.000 24.000\nTOTAL 24.000")).toBe(24000);
  });

  it("memakai posisi sebagai pemecah seri, bukan penentu", () => {
    // Dua angka tanpa kata penanda apa pun: yang di bawah menang tipis, dan
    // justru karena tipis ia ditandai ambigu.
    const ranking = rankReceiptCandidates("15.000\n20.000");
    expect(ranking.ambiguous).toBe(true);
  });

  it("menggabungkan nominal yang sama dari beberapa baris", () => {
    const ranking = rankReceiptCandidates("TOTAL 50.000\nTUNAI 50.000");
    expect(ranking.candidates.filter((row) => row.amountIdr === 50000)).toHaveLength(1);
  });

  it("tidak pernah mengembalikan lebih dari dua kandidat", () => {
    const ranking = rankReceiptCandidates(
      "A 10.000\nB 20.000\nC 30.000\nD 40.000\nE 50.000\nTOTAL 150.000",
    );
    expect(ranking.candidates.length).toBeLessThanOrEqual(2);
  });

  it("membaca struk tulis tangan tanpa pemisah ribuan", () => {
    expect(top("beli tepung\ntotal 45000")).toBe(45000);
  });

  it("membaca nominal berkoma sebagai desimal rupiah", () => {
    expect(top("TOTAL 12.500,00")).toBe(12500);
  });

  it("tahan terhadap huruf besar semua", () => {
    expect(top("WARUNG MAJU\nTOTAL BAYAR 88.000")).toBe(88000);
  });

  it("tahan terhadap titik dua setelah label", () => {
    expect(top("Total: 33.000")).toBe(33000);
  });

  it("tahan terhadap spasi berlebih", () => {
    expect(top("  TOTAL     72.000  ")).toBe(72000);
  });
});

describe("keadaan yang harus ditanyakan, bukan ditebak", () => {
  it("menandai ambigu ketika dua kandidat berskor rapat", () => {
    const ranking = rankReceiptCandidates("15.000\n16.000");
    expect(ranking.ambiguous).toBe(true);
    expect(ranking.candidates).toHaveLength(2);
  });

  it("tidak menandai ambigu ketika totalnya jelas", () => {
    const ranking = rankReceiptCandidates("Nasi 20.000\nTOTAL 20.000\nKEMBALI 5.000");
    expect(ranking.ambiguous).toBe(false);
  });

  it("selisih skor di bawah ambang berarti ambigu", () => {
    const ranking = rankReceiptCandidates("TOTAL 40.000\nJUMLAH 45.000");
    if (ranking.candidates.length === 2) {
      const gap = ranking.candidates[0].score - ranking.candidates[1].score;
      expect(ranking.ambiguous).toBe(gap < AMBIGUOUS_SCORE_GAP);
    }
  });
});

describe("teks yang tidak menghasilkan apa pun", () => {
  it("mengembalikan kosong untuk teks tanpa angka", () => {
    expect(rankReceiptCandidates("terima kasih atas kunjungan anda")).toEqual({
      candidates: [],
      ambiguous: false,
    });
  });

  it("mengembalikan kosong untuk teks kosong", () => {
    expect(rankReceiptCandidates("").candidates).toEqual([]);
  });

  it("mengembalikan kosong ketika semua angkanya tanggal dan jam", () => {
    expect(rankReceiptCandidates("12/08/2026 14:35").candidates).toEqual([]);
  });

  it("tidak pernah melempar untuk masukan aneh", () => {
    for (const text of ["\n\n\n", "...", "Rp", "0", "99", "-"]) {
      expect(() => rankReceiptCandidates(text)).not.toThrow();
    }
  });
});

describe("potongan sumber untuk disorot", () => {
  it("membawa baris asalnya", () => {
    const ranking = rankReceiptCandidates("Nasi 20.000\nTOTAL BAYAR 20.000");
    expect(ranking.candidates[0].excerpt).toContain("TOTAL BAYAR");
  });

  it("memotong baris yang sangat panjang", () => {
    const ranking = rankReceiptCandidates(`TOTAL ${"x".repeat(300)} 20.000`);
    expect(ranking.candidates[0].excerpt.length).toBeLessThanOrEqual(120);
  });
});
