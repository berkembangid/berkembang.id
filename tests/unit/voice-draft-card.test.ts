import { describe, expect, it } from "vitest";
import { highlightSegments } from "@/components/warung/VoiceDraftCard";

/**
 * Sorotan transkrip adalah satu-satunya cara pemilik melihat KENAPA sistem
 * menebak sebuah angka. Kalau rentangnya meleset, yang tersorot adalah kata
 * yang salah — dan itu lebih buruk daripada tidak menyorot sama sekali, karena
 * pemilik jadi mempercayai penjelasan yang keliru.
 */
describe("sorotan bukti pada transkrip", () => {
  const text = "tadi laku 35 ribu qris";

  it("menyorot kata yang menghasilkan nominal", () => {
    const pieces = highlightSegments(text, [[10, 17]]);
    expect(pieces.filter((piece) => piece.highlighted).map((piece) => piece.text)).toEqual(["35 ribu"]);
  });

  it("menyorot nominal dan kategori sekaligus, berurutan", () => {
    const pieces = highlightSegments(text, [
      [10, 17],
      [5, 9],
    ]);
    expect(pieces.filter((piece) => piece.highlighted).map((piece) => piece.text)).toEqual([
      "laku",
      "35 ribu",
    ]);
  });

  it("menyusun ulang teks aslinya tanpa kehilangan satu huruf pun", () => {
    const pieces = highlightSegments(text, [
      [5, 9],
      [10, 17],
    ]);
    expect(pieces.map((piece) => piece.text).join("")).toBe(text);
  });

  it("membuang rentang yang bertumpuk, bukan menyorot dua kali", () => {
    const pieces = highlightSegments(text, [
      [5, 12],
      [10, 17],
    ]);
    expect(pieces.map((piece) => piece.text).join("")).toBe(text);
    expect(pieces.filter((piece) => piece.highlighted)).toHaveLength(1);
  });

  it("mengabaikan rentang yang tidak masuk akal alih-alih melempar", () => {
    for (const spans of [
      [[-1, 5]],
      [[5, 5]],
      [[9, 4]],
      [[0, 999]],
      [[Number.NaN, 4]],
    ] as Array<Array<[number, number]>>) {
      const pieces = highlightSegments(text, spans);
      expect(pieces.map((piece) => piece.text).join("")).toBe(text);
    }
  });

  it("tanpa rentang sama sekali mengembalikan teks utuh tanpa sorotan", () => {
    const pieces = highlightSegments(text, []);
    expect(pieces).toEqual([{ text, highlighted: false }]);
  });

  it("menangani teks kosong", () => {
    expect(highlightSegments("", [[0, 3]])).toEqual([]);
  });
});
