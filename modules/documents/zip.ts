/**
 * Penulis ZIP tanpa kompresi.
 *
 * KENAPA DITULIS SENDIRI.
 *
 * Ekspor "unduh semua data saya" berjalan di server, jadi ukuran bundel bukan
 * pertimbangan. Yang jadi pertimbangan adalah menambah dependensi pihak ketiga
 * ke jalur yang memegang seluruh data seorang pemilik usaha -- KTP, jurnal,
 * dan nomor izinnya sekaligus. Formatnya sendiri sederhana dan stabil sejak
 * 1989; menuliskannya di sini berarti tidak ada kode asing yang menyentuh isi
 * berkas itu, dan hasilnya bisa diuji sampai ke bita.
 *
 * Metode `stored` (tanpa kompresi) dipilih karena isinya sudah terkompresi:
 * foto JPEG dan PDF tidak mengecil lagi, dan menambah deflate hanya menambah
 * kode yang bisa salah.
 *
 * Keluarannya deterministik: waktu berkas diberikan pemanggil, bukan diambil
 * dari jam. Dua ekspor dengan isi yang sama menghasilkan bita yang sama, dan
 * itulah yang membuatnya bisa diuji.
 */

export type ZipEntry = { path: string; data: Uint8Array };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Waktu berkas dalam format MS-DOS, dua kata 16 bit. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      (Math.floor(date.getUTCSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Menyusun satu berkas ZIP dari daftar isian.
 *
 * `modifiedAt` sengaja wajib: waktu yang diambil diam-diam dari jam sistem
 * membuat dua ekspor dengan isi identik menghasilkan bita berbeda, dan
 * perbedaan itu mustahil dijelaskan ketika ada yang menanyakannya.
 */
export function buildZip(entries: readonly ZipEntry[], modifiedAt: Date): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modifiedAt);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + name.length + entry.data.length);
    const localView = new DataView(local.buffer);
    writeUint32(localView, 0, 0x04034b50);
    localView.setUint16(4, 20, true); // versi minimum
    localView.setUint16(6, 0, true); // tanpa bendera
    localView.setUint16(8, 0, true); // metode: stored
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, entry.data.length);
    writeUint32(localView, 22, entry.data.length);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // tanpa medan tambahan
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, entry.data.length);
    writeUint32(centralView, 24, entry.data.length);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);

  const total = offset + centralSize + end.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

/**
 * Satu baris CSV.
 *
 * Nilai yang diawali `=`, `+`, `-`, atau `@` diberi kutip dan tanda petik satu
 * di depan. Tanpa itu, deskripsi transaksi yang kebetulan dimulai dengan tanda
 * sama dengan akan dijalankan sebagai rumus ketika berkasnya dibuka di Excel —
 * dan berkas ini dibuat justru untuk dibuka orang lain.
 */
export function csvRow(values: readonly (string | number | null)[]): string {
  return values
    .map((value) => {
      if (value === null) return "";
      const text = String(value);
      const dangerous = /^[=+\-@\t\r]/.test(text);
      const escaped = text.replace(/"/g, '""');
      if (dangerous) return `"'${escaped}"`;
      return /[",\n\r;]/.test(text) ? `"${escaped}"` : escaped;
    })
    .join(",");
}
