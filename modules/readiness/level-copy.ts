import type {
  ComponentId,
  ComponentStatus,
  EvaluatedComponent,
  ReadinessLevel,
} from "@/modules/readiness/evaluator";

/**
 * Kalimat yang dibaca pemilik untuk setiap komponen.
 *
 * Aturannya satu: **sebutkan keadaannya, lalu satu langkah**. Bukan nilai, bukan
 * persentase yang berdiri sendiri. "Mencatat 14 dari 20 hari bulan ini" bisa
 * dikerjakan; "A1: 70%" tidak bisa.
 *
 * Tidak ada kalimat di berkas ini yang menyalahkan. Komponen yang belum
 * terpenuhi ditulis sebagai pekerjaan yang tersisa, bukan sebagai kekurangan —
 * dan yang datanya belum ada ditulis apa adanya, tanpa nada menuduh.
 */

export const levelNames: Record<ReadinessLevel, string> = {
  MULAI: "Mulai",
  TEMBAGA: "Tembaga",
  PERAK: "Perak",
  EMAS: "Emas",
};

/** Arti setiap anak tangga: apa yang terbuka, bukan seberapa bagus nilainya. */
export const levelMeaning: Record<ReadinessLevel, string> = {
  MULAI: "Catatanmu baru dimulai. Tingkat berikutnya terbuka setelah dua minggu mencatat.",
  TEMBAGA: "Catatanmu sudah hidup. Tingkat berikutnya membuka laporan 3 bulan siap cetak.",
  PERAK: "Laporan 3 bulan siap cetak sudah terbuka. Tingkat berikutnya membuat berkasmu lengkap di mata lembaga.",
  EMAS: "Catatan dan dokumenmu lengkap. Berkas usahamu siap dilihat lembaga mana pun.",
};

export const pillarNames: Record<"A" | "B" | "C" | "D", { title: string; tag: string }> = {
  A: { title: "Kebiasaan mencatat", tag: "seberapa hidup catatanmu" },
  B: { title: "Kualitas catatan", tag: "seberapa bisa dipercaya" },
  C: { title: "Legalitas & profil", tag: "seberapa dikenali" },
  D: { title: "Kesiapan laporan", tag: "seberapa siap dibaca" },
};

export type ComponentCopy = {
  title: string;
  hint: string;
  action: { label: string; href: string } | null;
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function round(value: number | null): number {
  return value === null ? 0 : Math.round(value);
}

/**
 * Judul dan ajakan untuk satu komponen.
 *
 * Sengaja menerima komponen yang sudah dievaluasi, bukan fakta mentah: kalimat
 * tidak boleh memutuskan sendiri apakah sesuatu terpenuhi, karena kalau ia
 * memutuskan, akan ada dua tempat yang menghitung hal yang sama.
 */
export function componentCopy(component: EvaluatedComponent): ComponentCopy {
  const { id, status, value, targetNext } = component;
  const done = status === "TERPENUHI";
  const noData = status === "BELUM_ADA_DATA";

  switch (id) {
    case "A1":
      return {
        title: targetNext
          ? `Mencatat ${round(value)} dari ${targetNext} hari`
          : `Mencatat ${round(value)} hari bulan ini`,
        hint: done
          ? "Kebiasaanmu sudah kuat. Terus begini."
          : "Sedikit lagi — mencatat hari ini menambah satu.",
        action: done ? null : { label: "Catat", href: "/umkm/catat" },
      };
    case "A2":
      return {
        title: targetNext
          ? `Tutup kas ${round(value)} dari ${targetNext} kali`
          : `Tutup kas ${round(value)} kali`,
        hint: done
          ? "Uang di laci dan catatan rutin dicocokkan."
          : "Cocokkan uang di laci tiap tutup hari.",
        action: done ? null : { label: "Tutup kas", href: "/umkm/laporan" },
      };
    case "A3":
      return {
        title: `Catatan berumur ${round(value)} hari`,
        hint: done
          ? "Umur catatan tidak bisa dibeli — ini yang paling dipercaya."
          : "Terus jalan. Umur catatan bertambah sendiri setiap hari.",
        action: null,
      };
    case "B1":
      return {
        title: noData
          ? "Belum ada catatan untuk diperiksa"
          : `${percent(value)} catatan sudah kamu cek`,
        hint: noData
          ? "Setelah ada catatan, bagian ini terisi sendiri."
          : done
            ? "Tidak ada yang menunggu pemeriksaan."
            : "Periksa catatan yang masih menunggu konfirmasi.",
        action: done || noData ? null : { label: "Periksa", href: "/umkm/catat" },
      };
    case "B2":
      return {
        title: done
          ? "Uang pribadi tercatat terpisah"
          : `Uang pribadi tercatat ${round(value)} dari ${targetNext ?? 2} bulan`,
        hint: done
          ? "“Diambil untuk rumah” tercatat rutin — ini yang membedakan catatan usaha dari catatan pribadi."
          : "Catat juga uang yang diambil untuk keperluan rumah.",
        action: done ? null : { label: "Catat", href: "/umkm/catat" },
      };
    case "B3":
      return {
        title: noData
          ? "Belum ada belanja besar"
          : `Nota ada di ${percent(value)} belanja besar`,
        hint: noData
          ? "Bagian ini menunggu belanja di atas Rp500 ribu. Belum ada bukan berarti kurang."
          : done
            ? "Belanja besarmu berbukti."
            : "Foto nota untuk belanja di atas Rp500 ribu.",
        action: done || noData ? null : { label: "Lihat", href: "/umkm/laporan" },
      };
    case "B4":
      return {
        title: done
          ? "Sisa bahan rutin dihitung"
          : `Hitung stok ${round(value)} bulan terakhir`,
        hint: done
          ? "Untung bulananmu sudah menghitung sisa bahan."
          : "Akhir bulan, cek sisa bahan sekali saja.",
        action: done ? null : { label: "Hitung", href: "/umkm/laporan" },
      };
    case "C1":
      return {
        title: done
          ? "Izin usaha lengkap"
          : `${round(value)} dari ${targetNext ?? 4} izin sudah tersimpan`,
        hint: done
          ? "Dokumen wajib sektormu sudah ada dan sudah kamu cek."
          : "Lengkapi izin yang belum ada — NIB gratis dan bisa diurus sendiri.",
        action: done ? null : { label: "Unggah", href: "/umkm/upload" },
      };
    case "C2":
      return {
        title: done ? "Profil usaha lengkap" : `Profil terisi ${round(value)} dari 4 bagian`,
        hint: done
          ? "Tahun mulai, alamat, WhatsApp, dan asal pesanan sudah terisi."
          : "Lengkapi tahun mulai usaha, alamat, WhatsApp, dan asal pesanan.",
        action: done ? null : { label: "Lengkapi", href: "/umkm/profil" },
      };
    case "D1":
      return {
        title: done ? "Kondisi awal usaha sudah diisi" : "Kondisi awal usaha belum diisi",
        hint: done
          ? "Angka-angka laporanmu punya titik mulai yang jelas."
          : "Tanpa ini, laporan tidak tahu dari mana harus mulai menghitung.",
        action: done ? null : { label: "Isi", href: "/umkm/laporan" },
      };
    case "D2":
      return {
        title: `${round(value)} dari ${targetNext ?? 3} bulan penuh tercatat`,
        hint: done
          ? "Rentang catatanmu cukup untuk laporan yang bermakna."
          : "Satu bulan penuh lagi, laporan yang lebih panjang bisa dicetak.",
        action: done ? null : { label: "Catat", href: "/umkm/catat" },
      };
    case "D3":
      return {
        title: done ? "Laporan sudah pernah diterbitkan" : "Belum pernah menerbitkan laporan",
        hint: done
          ? "Berkasnya tersimpan di lemari, lengkap dengan nomornya."
          : "Terbuka setelah tingkat Perak.",
        action: done ? null : { label: "Lihat laporan", href: "/umkm/laporan" },
      };
  }
}

/** Warna titik: hijau terpenuhi, amber sebagian, netral sisanya. */
export function statusTone(status: ComponentStatus): "success" | "attention" | "neutral" {
  if (status === "TERPENUHI") return "success";
  if (status === "SEBAGIAN") return "attention";
  return "neutral";
}

/** Kalimat "langkah paling berdampak" untuk kartu hero dan Beranda. */
export function stepHeadline(id: ComponentId, missingCount: number): string {
  const remaining = missingCount <= 1 ? "Tinggal ini" : `Tinggal ${missingCount} syarat lagi`;
  return `${remaining} — ini yang paling cepat kamu selesaikan.`;
}
