/**
 * Syarat dan Ketentuan BERKEMBANG.ID, dalam bentuk yang bisa dirender.
 *
 * Sumber naskahnya ada di `docs/syaratketentuan/`. Naskah itu yang dibaca dan
 * disetujui manusia; berkas ini adalah bentuk yang dibaca aplikasi. Keduanya
 * dijaga tetap sejalan oleh `tests/unit/legal-terms.test.ts`, yang menuntut
 * setiap judul bagian di naskah punya pasangannya di sini -- supaya naskah
 * yang direvisi tidak diam-diam meninggalkan halaman yang dibaca pengguna.
 *
 * Ada DUA dokumen, bukan satu. Pemilik usaha dan lembaga menyetujui perjanjian
 * yang berbeda, dan naskah lembaga menyatakannya sendiri: « Ketentuan ini
 * berbeda dari, dan tidak menggantikan, Syarat dan Ketentuan Pengguna UMKM. »
 * Sebelum ini halaman /terms hanya memuat satu ringkasan bernada UMKM,
 * sementara lembaga mendaftar lewat halaman yang sama dan menyetujuinya.
 */

/** Penekanan ditulis `**begini**` dan dipecah saat dirender. */
export type TermsBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "ordered"; items: string[] }
  | { kind: "bulleted"; items: string[] };

export type TermsSection = {
  /** Sama persis dengan judul `##` di naskah, tanpa nomornya. */
  heading: string;
  blocks: TermsBlock[];
};

export type TermsDocument = {
  id: "umkm" | "institution";
  /** Label tab. */
  label: string;
  title: string;
  /** Judul ringkasan yang muncul saat mendaftar. */
  summaryTitle: string;
  /**
   * Janji inti, ditulis dari sudut pandang pembacanya.
   *
   * Kalimat yang sama tidak bisa dipakai keduanya: « catatan usaha Anda privat
   * secara bawaan » benar bagi pemilik usaha dan tidak berarti apa-apa bagi
   * lembaga, yang tidak punya catatan usaha. Sebuah janji yang salah alamat
   * terbaca sebagai janji yang tidak dipahami penulisnya.
   */
  commitment: string;
  /** Kalimat pembuka yang menyatakan perjanjian ini antara siapa dan siapa. */
  preamble: string;
  sections: TermsSection[];
};

export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE_DATE = "6 September 2026";
export const TERMS_CONTACT_EMAIL = "halo@berkembang.id";

/**
 * Nama badan hukum penyelenggara, alamat korespondensi, dan tempat kedudukan
 * hukum BELUM diisi -- ketiganya fakta yang hanya diketahui pemilik usaha ini,
 * dan mengarangnya pada dokumen yang mengikat secara hukum akan lebih buruk
 * daripada mengosongkannya.
 *
 * Sampai diisi, klausa yang bergantung padanya ditulis dalam bentuk yang tetap
 * benar tanpa fakta itu: « tempat kedudukan hukum Penyelenggara », bukan nama
 * kota yang ditebak.
 */
export const PROVIDER_NAME = "BERKEMBANG.ID";

const umkm: TermsDocument = {
  id: "umkm",
  label: "Pengguna UMKM",
  title: "Syarat dan Ketentuan Pengguna UMKM",
  summaryTitle: "Ringkasan syarat untuk pemilik usaha",
  commitment:
    "Catatan usaha Anda bersifat privat secara bawaan. Tidak ada lembaga yang dapat melihat identitas maupun isinya tanpa persetujuan Anda, persetujuan tersebut dapat Anda cabut sewaktu-waktu, dan setiap akses lembaga terhadap data Anda tercatat serta dapat Anda periksa. Kami tidak menjual, menyewakan, atau memperdagangkan data pengguna kepada pihak ketiga.",
  preamble:
    `Dokumen ini adalah perjanjian antara Anda sebagai pelaku usaha (**Anda**, **Pengguna UMKM**) dan ${PROVIDER_NAME} (**Kami**) atas penggunaan aplikasi dan situs BERKEMBANG.ID (**Layanan**). Dengan membuat akun atau menggunakan Layanan, Anda menyatakan telah membaca, memahami, dan menyetujui Syarat dan Ketentuan ini beserta Kebijakan Privasi yang merupakan satu kesatuan dengannya.`,
  sections: [
    {
      heading: "Definisi",
      blocks: [
        {
          kind: "ordered",
          items: [
            "**Layanan** adalah platform pencatatan keuangan, pengelolaan dokumen usaha, dan kesiapan data usaha bagi usaha mikro, kecil, dan menengah.",
            "**Catatan Usaha** adalah seluruh data yang Anda masukkan atau hasilkan melalui Layanan, termasuk transaksi, laporan keuangan, dokumen, dan foto bukti.",
            "**Lembaga Mitra** adalah bank, bank perekonomian rakyat, lembaga pembiayaan, investor, dinas atau instansi pemerintah, penyelenggara program CSR, perguruan tinggi, atau pihak lain yang terdaftar pada portal lembaga BERKEMBANG.ID.",
            "**Persetujuan Akses** adalah izin yang Anda berikan secara sadar melalui Layanan agar Lembaga Mitra tertentu dapat melihat bagian tertentu dari Catatan Usaha Anda untuk jangka waktu tertentu.",
          ],
        },
      ],
    },
    {
      heading: "Sifat Layanan — Harap Dibaca dengan Saksama",
      blocks: [
        {
          kind: "ordered",
          items: [
            // forbidden-terms-allow — sebuah penyangkalan hukum harus menyebut hal yang disangkalnya.
            "BERKEMBANG.ID adalah **alat bantu pencatatan dan penyiapan data usaha**. Kami **bukan** bank, bukan lembaga jasa keuangan, bukan pemberi pinjaman, bukan penasihat keuangan, bukan akuntan publik, dan **bukan Pemeringkat Kredit Alternatif** sebagaimana dimaksud dalam POJK Nomor 29 Tahun 2024.",
            "Layanan **tidak melakukan penilaian kelayakan pembiayaan** dan tidak memberikan rekomendasi persetujuan atau penolakan pembiayaan. Tingkat kesiapan, indikator, dan laporan pada Layanan menggambarkan kelengkapan serta kebiasaan pencatatan usaha Anda, bukan penilaian resmi dan bukan jaminan memperoleh pembiayaan.",
            "Laporan keuangan pada Layanan disusun secara otomatis dari catatan yang Anda masukkan dengan mengacu pada Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM), dan **belum diaudit**. Kebenaran isi catatan merupakan tanggung jawab Anda sebagai pemilik usaha.",
            "Layanan tidak menyimpan, mengelola, atau memindahkan dana Anda dalam bentuk apa pun.",
          ],
        },
      ],
    },
    {
      heading: "Akun",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Anda menjamin bahwa data pendaftaran yang Anda berikan benar, akurat, dan terkini, serta bahwa Anda berusia minimal 18 tahun atau telah cakap hukum.",
            "**Satu akun mewakili satu usaha, dan akun itu memegang seluruh akses atas usahanya.** Tidak ada tingkat akses di bawahnya. Anda bertanggung jawab menjaga kerahasiaan kredensial akun dan atas seluruh aktivitas yang terjadi melalui akun Anda. Segera hubungi Kami bila menduga akun Anda digunakan tanpa izin.",
            "Kami dapat menolak, membekukan, atau menutup akun yang melanggar Syarat dan Ketentuan ini dengan pemberitahuan yang wajar, kecuali pelanggaran berat yang mengharuskan tindakan segera.",
          ],
        },
      ],
    },
    {
      heading: "Kewajiban Pengguna",
      blocks: [
        { kind: "paragraph", text: "Anda setuju untuk:" },
        {
          kind: "ordered",
          items: [
            "Memasukkan catatan yang jujur dan menggambarkan transaksi yang benar-benar terjadi;",
            "Hanya mengunggah dokumen milik Anda atau yang Anda berhak unggah;",
            "Tidak menggunakan Layanan untuk kegiatan yang melanggar hukum, termasuk namun tidak terbatas pada pencucian uang, penipuan, atau menjalankan kegiatan pinjam-meminjam dana tanpa izin;",
            "Tidak memanipulasi, merekayasa, atau memalsukan Catatan Usaha dengan tujuan menyesatkan Lembaga Mitra atau pihak lain;",
            "Tidak mengganggu keamanan, kinerja, atau integritas Layanan.",
          ],
        },
        {
          kind: "paragraph",
          text: "Pelanggaran atas angka 3 dan 4 dapat mengakibatkan pembekuan akun dan, bila relevan, pemberitahuan kepada pihak berwenang sesuai peraturan perundang-undangan.",
        },
      ],
    },
    {
      heading: "Data Pribadi dan Kendali Anda",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Kami memproses data pribadi Anda sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi dan Kebijakan Privasi Kami.",
            "**Catatan Usaha Anda bersifat privat secara bawaan.** Tidak ada Lembaga Mitra yang dapat melihat identitas atau isi Catatan Usaha Anda tanpa Persetujuan Akses dari Anda.",
            "Persetujuan Akses bersifat spesifik (lembaga tertentu, cakupan tertentu, jangka waktu tertentu), dapat Anda tolak tanpa konsekuensi terhadap penggunaan Layanan, dan dapat Anda **cabut kapan saja**. Setiap akses Lembaga Mitra terhadap data Anda tercatat dan dapat Anda lihat.",
            "Fitur “bersedia ditemukan” bersifat pilihan dan nonaktif secara bawaan. Bila diaktifkan, usaha Anda tampil kepada Lembaga Mitra secara anonim, tanpa nama, kontak, alamat lengkap, maupun angka keuangan.",
            "Dokumen identitas seperti KTP dan NPWP tidak pernah dibagikan kepada Lembaga Mitra; yang dibagikan hanya status verifikasinya.",
            "Anda berhak meminta salinan seluruh data Anda dan berhak menghapus akun melalui menu Profil. Penghapusan akun mengakhiri seluruh Persetujuan Akses yang masih berlaku seketika itu juga, dan data Anda dihapus setelah masa tenggang 30 hari yang dapat Anda batalkan sendiri.",
            "Rekaman suara yang Anda gunakan untuk mencatat diproses untuk menghasilkan draf catatan dan dihapus setelah pemrosesan selesai.",
          ],
        },
      ],
    },
    {
      heading: "Biaya",
      blocks: [
        {
          kind: "paragraph",
          text: "Layanan bagi Pengguna UMKM saat ini **tidak dipungut biaya**. Apabila di kemudian hari terdapat fitur berbayar, Kami akan memberitahukannya terlebih dahulu, dan fitur pencatatan dasar tetap dapat digunakan tanpa biaya.",
        },
      ],
    },
    {
      heading: "Hak Kekayaan Intelektual",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Layanan, termasuk perangkat lunak, desain, merek, dan kontennya, adalah milik Kami atau pemberi lisensi Kami.",
            "Catatan Usaha adalah milik Anda. Anda memberi Kami lisensi terbatas untuk memproses Catatan Usaha sebatas yang diperlukan untuk menyelenggarakan Layanan, termasuk menyusun laporan dan indikator bagi Anda.",
            "Kami dapat menggunakan data yang telah **dianonimkan dan diagregasi**, sehingga tidak dapat dikaitkan dengan Anda maupun usaha Anda, untuk pengembangan Layanan, riset, dan statistik.",
          ],
        },
      ],
    },
    {
      heading: "Ketersediaan Layanan dan Batasan Tanggung Jawab",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Kami berupaya menjaga Layanan tersedia dan aman, namun Layanan diberikan “sebagaimana adanya” dan dapat mengalami gangguan, pemeliharaan, atau keterbatasan teknis.",
            "Sepanjang diperbolehkan hukum, Kami tidak bertanggung jawab atas: (a) keputusan pembiayaan atau keputusan bisnis apa pun yang diambil oleh Anda maupun Lembaga Mitra; (b) kerugian tidak langsung, kehilangan keuntungan, atau kehilangan peluang; (c) kesalahan yang bersumber dari data yang Anda masukkan.",
            "Fitur berbasis kecerdasan artifisial menghasilkan **draf yang selalu memerlukan konfirmasi Anda** sebelum tersimpan. Nominal dibaca oleh pengurai tetap di dalam aplikasi, bukan oleh kecerdasan artifisial; yang dibantu kecerdasan artifisial hanya penebakan jenis transaksi dan pembacaan dokumen, dan keduanya wajib Anda periksa lebih dulu.",
            "Ketentuan pasal ini tidak mengurangi hak-hak Anda yang tidak dapat disimpangi menurut peraturan perundang-undangan.",
          ],
        },
      ],
    },
    {
      heading: "Perubahan Layanan dan Syarat Ketentuan",
      blocks: [
        {
          kind: "paragraph",
          text: "Kami dapat memperbarui Layanan maupun Syarat dan Ketentuan ini. Perubahan yang bersifat material akan diberitahukan melalui Layanan paling lambat 7 (tujuh) hari sebelum berlaku. Dengan tetap menggunakan Layanan setelah perubahan berlaku, Anda dianggap menyetujui perubahan tersebut.",
        },
      ],
    },
    {
      heading: "Pengakhiran",
      blocks: [
        {
          kind: "paragraph",
          text: "Anda dapat berhenti menggunakan Layanan dan menghapus akun kapan saja. Ketentuan yang menurut sifatnya tetap berlaku setelah pengakhiran, antara lain kekayaan intelektual, batasan tanggung jawab, dan penyelesaian sengketa, tetap berlaku.",
        },
      ],
    },
    {
      heading: "Hukum yang Berlaku dan Penyelesaian Sengketa",
      blocks: [
        {
          kind: "paragraph",
          text: "Syarat dan Ketentuan ini diatur oleh hukum Negara Republik Indonesia. Sengketa akan diupayakan diselesaikan secara musyawarah terlebih dahulu; apabila tidak tercapai, para pihak sepakat menyelesaikannya melalui Pengadilan Negeri di tempat kedudukan hukum Penyelenggara.",
        },
      ],
    },
    {
      heading: "Kontak",
      blocks: [
        {
          kind: "paragraph",
          text: `Pertanyaan mengenai Syarat dan Ketentuan ini dapat disampaikan ke ${TERMS_CONTACT_EMAIL}.`,
        },
      ],
    },
  ],
};

const institution: TermsDocument = {
  id: "institution",
  label: "Lembaga & Investor",
  title: "Syarat dan Ketentuan Lembaga & Investor",
  summaryTitle: "Ringkasan syarat untuk lembaga",
  commitment:
    "Data pemilik usaha bukan milik Portal maupun milik Lembaga. Tanpa persetujuan pemiliknya, yang dapat dilihat hanya profil anonim; setiap aktivitas Anggota tercatat dan dapat diperlihatkan kepada pemilik data; dan apabila persetujuan dicabut, akses berhenti seketika.",
  preamble:
    `Dokumen ini adalah perjanjian antara organisasi yang Anda wakili (**Lembaga**) dan ${PROVIDER_NAME} (**Kami**) atas penggunaan portal lembaga BERKEMBANG.ID (**Portal**). Dengan mengaktifkan akun organisasi atau menggunakan Portal, Anda menyatakan berwenang mewakili Lembaga dan menyetujui Syarat dan Ketentuan ini beserta Kebijakan Privasi. Ketentuan ini berbeda dari, dan tidak menggantikan, Syarat dan Ketentuan Pengguna UMKM.`,
  sections: [
    {
      heading: "Definisi",
      blocks: [
        {
          kind: "ordered",
          items: [
            "**Lembaga** mencakup bank umum, bank perekonomian rakyat, perusahaan pembiayaan, investor atau perusahaan modal ventura, dinas atau instansi pemerintah, penyelenggara program tanggung jawab sosial perusahaan, perguruan tinggi, pemeringkat berizin, dan pihak lain yang Kami setujui.",
            "**Pengguna UMKM** adalah pelaku usaha yang mencatatkan usahanya pada BERKEMBANG.ID dan merupakan **pemilik data**.",
            "**Dossier** adalah kumpulan data kesiapan seorang Pengguna UMKM — antara lain laporan keuangan berbasis SAK EMKM, tingkat kesiapan, status legalitas, dan indikator kualitas data — dalam bentuk potret pada tanggal tertentu.",
            "**Persetujuan Akses** adalah izin yang diberikan Pengguna UMKM atas permintaan Lembaga untuk melihat Dossier dengan cakupan dan jangka waktu tertentu.",
            "**Anggota** adalah individu yang didaftarkan Lembaga untuk menggunakan Portal atas nama Lembaga.",
          ],
        },
      ],
    },
    {
      heading: "Sifat Layanan — Pernyataan Penting",
      blocks: [
        {
          kind: "ordered",
          items: [
            // forbidden-terms-allow — sebuah penyangkalan hukum harus menyebut hal yang disangkalnya.
            "BERKEMBANG.ID adalah **penyedia data kesiapan usaha**, bukan lembaga jasa keuangan, bukan agen penjualan produk pembiayaan, dan **bukan Pemeringkat Kredit Alternatif** sebagaimana dimaksud dalam POJK Nomor 29 Tahun 2024.",
            "Seluruh informasi pada Portal, termasuk tingkat kesiapan dan indikator, menggambarkan **kelengkapan dan kebiasaan pencatatan** Pengguna UMKM, **bukan** penilaian kelayakan pembiayaan, bukan rekomendasi, dan bukan jaminan kinerja. **Seluruh keputusan pembiayaan, investasi, atau program sepenuhnya merupakan tanggung jawab Lembaga**, termasuk pemenuhan kewajiban analisis dan kepatuhan Lembaga menurut peraturan yang berlaku baginya.",
            "Laporan keuangan pada Dossier disusun otomatis dari catatan pemilik usaha dengan mengacu pada SAK EMKM dan **belum diaudit**. Status verifikasi dokumen menggambarkan tingkat pemeriksaan yang dilakukan, bukan jaminan keaslian.",
            "BERKEMBANG.ID tidak memfasilitasi pencairan, penagihan, atau pengelolaan dana.",
          ],
        },
      ],
    },
    {
      heading: "Akun Organisasi dan Anggota",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Akun organisasi diaktifkan oleh Kami setelah proses verifikasi Lembaga. Kami berhak menolak aktivasi tanpa kewajiban menyampaikan alasan.",
            "Lembaga bertanggung jawab atas seluruh tindakan Anggotanya pada Portal, menjaga kerahasiaan kredensial, dan memastikan hanya personel yang berwenang yang menjadi Anggota. Perubahan status kepegawaian Anggota wajib segera diperbarui.",
            "Setiap aktivitas Anggota, termasuk melihat daftar kandidat, membuka Dossier, dan mengunduh berkas, **tercatat** dan dapat diperlihatkan kepada Pengguna UMKM pemilik data terkait.",
          ],
        },
      ],
    },
    {
      heading: "Akses Data dan Pelindungan Data Pribadi",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Portal tunduk pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Dalam kaitannya dengan data Pengguna UMKM, Lembaga bertindak sebagai penerima data yang wajib memprosesnya sesuai peraturan tersebut dan sesuai cakupan Persetujuan Akses.",
            "**Tanpa Persetujuan Akses, Lembaga hanya dapat melihat profil anonim**: kode kandidat, sektor, wilayah tingkat kabupaten atau kota, tingkat kesiapan, dan indikator nonfinansial. Identitas, kontak, dan data keuangan hanya terbuka setelah Persetujuan Akses diberikan.",
            "Lembaga dilarang: (a) menggunakan data di luar cakupan dan jangka waktu Persetujuan Akses; (b) membagikan, menjual, atau mengalihkan data kepada pihak lain di luar Lembaga; (c) menggabungkan data untuk mengidentifikasi Pengguna UMKM yang tidak memberikan persetujuan; (d) melakukan pengambilan data secara otomatis atau upaya menembus pembatasan teknis Portal; (e) menghubungi Pengguna UMKM dengan cara yang mengganggu atau menyesatkan.",
            "Apabila Persetujuan Akses berakhir atau dicabut, akses melalui Portal berhenti, dan Lembaga wajib menghentikan pemrosesan lebih lanjut atas salinan data yang diperoleh, kecuali penyimpanan arsip yang diwajibkan peraturan yang berlaku bagi Lembaga.",
            "Berkas yang diunduh dari Portal memuat penanda identitas Lembaga dan nomor dokumen. Lembaga bertanggung jawab menjaga kerahasiaan berkas tersebut.",
            "Lembaga wajib memberitahu Kami secara tertulis selambatnya 3×24 jam sejak mengetahui adanya insiden keamanan yang melibatkan data yang diperoleh dari Portal.",
          ],
        },
      ],
    },
    {
      heading: "Biaya dan Lisensi",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Akses Portal diberikan berdasarkan paket lisensi, antara lain jumlah Anggota dan kuota akses Dossier, sebagaimana disepakati dalam formulir pemesanan atau perjanjian terpisah.",
            "Biaya bersifat biaya lisensi dan akses data. **Tidak ada bagian dari biaya yang dikaitkan dengan persetujuan, pencairan, atau nilai fasilitas pembiayaan mana pun.**",
            "Kuota akses Dossier terpakai pada saat Persetujuan Akses diberikan oleh Pengguna UMKM. Permintaan yang ditolak atau kedaluwarsa tidak mengurangi kuota.",
          ],
        },
      ],
    },
    {
      heading: "Kewajiban Lembaga",
      blocks: [
        {
          kind: "paragraph",
          text: "Lembaga menjamin bahwa: (a) penggunaannya atas Portal mematuhi peraturan yang berlaku baginya, termasuk peraturan OJK dan Bank Indonesia yang relevan serta peraturan pelindungan data pribadi; (b) informasi yang disampaikan kepada Kami dan kepada Pengguna UMKM, termasuk pesan perkenalan, benar dan tidak menyesatkan; (c) Portal tidak digunakan untuk penawaran produk yang melanggar hukum.",
        },
      ],
    },
    {
      heading: "Hak Kekayaan Intelektual",
      blocks: [
        {
          kind: "paragraph",
          text: "Portal beserta perangkat lunak, tampilan, metodologi penyajian, dan mereknya adalah milik Kami. Lisensi yang diberikan bersifat terbatas, tidak eksklusif, dan tidak dapat dialihkan, semata-mata untuk tujuan internal Lembaga sesuai Syarat dan Ketentuan ini. Data Pengguna UMKM tetap milik Pengguna UMKM.",
        },
      ],
    },
    {
      heading: "Batasan Tanggung Jawab",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Portal disediakan “sebagaimana adanya”. Kami tidak menjamin kelengkapan, keakuratan, atau kesesuaian data untuk tujuan tertentu, karena data bersumber dari pencatatan pemilik usaha.",
            "Sepanjang diperbolehkan hukum, tanggung jawab Kami yang timbul dari atau sehubungan dengan Portal dibatasi hingga jumlah biaya lisensi yang telah dibayarkan Lembaga dalam 12 (dua belas) bulan terakhir, dan Kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau keputusan bisnis Lembaga.",
            "Lembaga membebaskan Kami dari tuntutan pihak ketiga yang timbul akibat pelanggaran Lembaga atas pasal Akses Data dan Pelindungan Data Pribadi serta pasal Kewajiban Lembaga.",
          ],
        },
      ],
    },
    {
      heading: "Penangguhan dan Pengakhiran",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Kami dapat menangguhkan atau mengakhiri akses Lembaga apabila terjadi pelanggaran material atas Syarat dan Ketentuan ini, dengan pemberitahuan; pelanggaran atas pasal Akses Data dan Pelindungan Data Pribadi dapat mengakibatkan penangguhan seketika.",
            "Pengakhiran tidak menghapus kewajiban yang telah timbul, termasuk kewajiban pembayaran dan kewajiban pelindungan data atas salinan yang telah diperoleh.",
          ],
        },
      ],
    },
    {
      heading: "Kerahasiaan, Perubahan, Hukum yang Berlaku",
      blocks: [
        {
          kind: "ordered",
          items: [
            "Para pihak menjaga kerahasiaan informasi nonpublik yang diperoleh dari pihak lainnya sehubungan dengan perjanjian ini.",
            "Perubahan material atas Syarat dan Ketentuan ini diberitahukan paling lambat 14 (empat belas) hari sebelum berlaku.",
            "Perjanjian ini diatur oleh hukum Negara Republik Indonesia; sengketa diselesaikan secara musyawarah, dan bila tidak tercapai, melalui Pengadilan Negeri di tempat kedudukan hukum Penyelenggara.",
          ],
        },
      ],
    },
    {
      heading: "Kontak",
      blocks: [
        { kind: "paragraph", text: `Korespondensi resmi: ${TERMS_CONTACT_EMAIL}.` },
      ],
    },
  ],
};

export const TERMS_DOCUMENTS = [umkm, institution] as const;

export type TermsAudience = (typeof TERMS_DOCUMENTS)[number]["id"];

/**
 * Id dokumennya `institution`, sama dengan `profiles.role` dan tipe `Role` di
 * halaman pendaftaran -- satu kosakata untuk satu hal. Yang berbeda hanya
 * alamatnya: `?pihak=lembaga` ditulis dalam bahasa pembacanya, dan keduanya
 * diterima supaya tautan lama tidak mati.
 */
export function termsDocumentFor(audience: string | null | undefined): TermsDocument {
  const normalised = audience === "lembaga" ? "institution" : audience;
  return TERMS_DOCUMENTS.find((document) => document.id === normalised) ?? umkm;
}

/**
 * Ringkasan yang muncul saat mendaftar.
 *
 * Bukan pengganti naskah lengkap, melainkan hal-hal yang paling sering
 * disalahpahami dan paling menentukan apakah seseorang mau memakai Layanan
 * sama sekali. Lembaga melihat ringkasannya sendiri: sebelum ini ia
 * menyetujui ringkasan bernada UMKM yang bukan perjanjiannya.
 */
export const TERMS_HIGHLIGHTS: Record<TermsAudience, { title: string; body: string }[]> = {
  umkm: [
    {
      title: "Penggunaan data usaha Anda",
      body: "Data usaha diproses semata-mata untuk menyusun pembukuan, menghitung tingkat kesiapan, dan menyusun saran langkah berikutnya bagi Anda. Kami tidak menjual, menyewakan, atau memperdagangkan data tersebut kepada pihak mana pun.",
    },
    {
      title: "Kerahasiaan dokumen identitas",
      body: "Dokumen identitas seperti KTP dan NPWP tidak pernah dibagikan kepada lembaga; yang dibagikan hanya status verifikasinya. Lembaga hanya dapat melihat bagian yang Anda setujui, dan persetujuan tersebut dapat Anda cabut sewaktu-waktu.",
    },
    {
      title: "Peran kecerdasan artifisial",
      body: "Nominal transaksi dibaca oleh pengurai tetap di dalam aplikasi, bukan oleh kecerdasan artifisial. Kecerdasan artifisial hanya membantu menebak jenis transaksi, dan setiap hasilnya wajib Anda periksa sebelum tersimpan.",
    },
    {
      title: "Batas tingkat kesiapan",
      body: "Tingkat kesiapan menggambarkan kelengkapan pencatatan usaha Anda, bukan penilaian kelayakan pembiayaan dan bukan jaminan memperoleh pendanaan. Kami bukan Pemeringkat Kredit Alternatif sebagaimana dimaksud dalam POJK Nomor 29 Tahun 2024.",
    },
    {
      title: "Hak menghentikan layanan dan memindahkan data",
      body: "Seluruh isi akun dapat Anda unduh sewaktu-waktu. Penghapusan akun mengakhiri seluruh persetujuan akses lembaga seketika, dan data dihapus setelah masa tenggang 30 hari yang dapat Anda batalkan sendiri.",
    },
  ],
  institution: [
    {
      title: "Akses tanpa persetujuan terbatas pada profil anonim",
      body: "Tanpa Persetujuan Akses, yang dapat dilihat hanya kode kandidat, sektor, wilayah tingkat kabupaten atau kota, tingkat kesiapan, dan indikator nonfinansial. Identitas, kontak, dan data keuangan terbuka hanya setelah pemilik usaha memberikan persetujuan.",
    },
    {
      title: "Pencatatan aktivitas Anggota",
      body: "Setiap aktivitas Anggota, meliputi melihat daftar kandidat, membuka Dossier, dan mengunduh berkas, tercatat pada Portal. Catatan tersebut dapat diperlihatkan kepada pemilik data yang bersangkutan.",
    },
    {
      title: "Tanggung jawab atas keputusan pembiayaan",
      body: "Tingkat kesiapan menggambarkan kelengkapan pencatatan, bukan rekomendasi dan bukan jaminan kinerja. Seluruh keputusan pembiayaan, investasi, atau program, beserta kewajiban analisis dan kepatuhannya, tetap melekat pada Lembaga.",
    },
    {
      title: "Pembatasan penggunaan data",
      body: "Membagikan, menjual, atau mengalihkan data kepada pihak di luar Lembaga, serta melakukan pengambilan data secara otomatis, dilarang. Pelanggaran atas ketentuan tersebut dapat mengakibatkan penangguhan akses seketika.",
    },
    {
      title: "Status laporan keuangan",
      body: "Laporan keuangan pada Dossier disusun otomatis dari catatan pemilik usaha dengan mengacu pada SAK EMKM dan belum diaudit. Status verifikasi dokumen menggambarkan tingkat pemeriksaan yang dilakukan, bukan jaminan keaslian.",
    },
  ],
};
