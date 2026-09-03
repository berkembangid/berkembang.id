#!/usr/bin/env node
/**
 * Akun demo BERKEMBANG.ID beserta catatan usahanya.
 *
 * TUJUAN
 *
 * Menyiapkan satu akun UMKM dengan tiga bulan catatan yang benar-benar
 * lengkap, satu akun institusi, dan satu permintaan akses yang menunggu
 * keputusan — sehingga seluruh alur produk dapat diperagakan hidup, bukan
 * lewat tangkapan layar.
 *
 * KEPUTUSAN YANG PALING MENENTUKAN
 *
 * Skrip ini MASUK SEBAGAI PENGGUNA dan memanggil RPC yang sama persis dengan
 * yang dipakai aplikasi. Ia tidak pernah menyisipkan baris lewat service role.
 *
 * Alasannya bukan kerapian. Menyisipkan langsung ke `transactions` akan
 * melewati `fn_post_transaction_journal`, sehingga data demo punya transaksi
 * tanpa jurnal: Buku Kas terlihat penuh, tetapi Laporan Posisi Keuangan,
 * Arus Kas, dan Mode Akuntan kosong — dan itu baru ketahuan di depan juri.
 * Dengan lewat RPC, setiap angka demo dijamin bisa dihasilkan aplikasi
 * sungguhan, dan seluruh trigger keseimbangan jurnal ikut menjaganya.
 *
 * PENGAMANAN
 *
 *   - Kata sandi dibaca dari `DEMO_PASSWORD`; tidak pernah ada di repositori.
 *   - Wajib menyebut ref proyek lewat `--project <ref>` dan harus cocok dengan
 *     yang ada di `.env`. Ini yang mencegah seed demo mendarat di proyek yang
 *     salah karena satu berkas env tertukar.
 *   - Menolak jalan bila migrasi `0032`+ belum ada di sasaran, karena datanya
 *     akan tampak masuk tetapi separuh layar tetap gagal.
 *
 * PEMAKAIAN
 *
 *   $env:DEMO_PASSWORD = "..."
 *   npm run seed:demo -- --project dvaiqnrsrqxfkwrgtmjl
 *
 * Aman dijalankan berulang: setiap transaksi memakai kunci idempotensi tetap,
 * jadi menjalankannya dua kali tidak menggandakan satu catatan pun.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Lingkungan dan pengaman
// ---------------------------------------------------------------------------

function loadEnv() {
  const env = {};
  for (const name of [".env", ".env.local"]) {
    let text;
    try {
      text = readFileSync(join(process.cwd(), name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      env[trimmed.slice(0, index).trim()] = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return { ...env, ...process.env };
}

function fail(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`${hint}\n`);
  process.exit(1);
}

const env = loadEnv();
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const password = env.DEMO_PASSWORD ?? "";

const args = process.argv.slice(2);
const requestedProject = args[args.indexOf("--project") + 1];

if (!url || !anonKey || !serviceKey) {
  fail(
    "Konfigurasi Supabase belum lengkap.",
    "  Butuh NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan\n  SUPABASE_SERVICE_ROLE_KEY di .env atau .env.local.",
  );
}
if (password.length < 12) {
  fail(
    "DEMO_PASSWORD belum diisi, atau kurang dari 12 karakter.",
    [
      "  PowerShell:",
      '    $env:DEMO_PASSWORD = "sandi-demo-yang-panjang"',
      "",
      "  Akun ini hidup di proyek yang sama dengan data asli. Sandi pendek atau",
      "  yang ikut terkomit membuat siapa pun yang membaca repositori bisa masuk.",
    ].join("\n"),
  );
}

const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";
if (!requestedProject || requestedProject !== projectRef) {
  fail(
    `Sasaran harus disebut secara eksplisit. Berkas env menunjuk proyek "${projectRef}".`,
    [
      "  Jalankan ulang dengan:",
      `    npm run seed:demo -- --project ${projectRef}`,
      "",
      "  Menyebutnya sendiri adalah yang mencegah data demo mendarat di proyek",
      "  yang salah karena satu berkas env tertukar.",
    ].join("\n"),
  );
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Bentuk usaha demo
// ---------------------------------------------------------------------------

const demo = {
  umkm: {
    email: "demo.umkm@berkembang.id",
    metadata: {
      signup_account_type: "umkm",
      nama_pemilik: "Nita Rahmawati",
      nama_usaha: "Dapur Bu Nita",
      sektor_usaha: "Kuliner",
      lokasi: "Depok, Jawa Barat",
    },
  },
  // Dua institusi, bukan satu. Basis data hanya mengizinkan SATU akses aktif
  // per pasangan institusi-usaha (`consent_grants_one_active_relationship_idx`)
  // dan satu permintaan yang menunggu (`dossier_requests_one_pending_idx`) --
  // aturan privasi, bukan keterbatasan. Jadi agar demo bisa menampilkan
  // keduanya sekaligus, akses yang sudah disetujui dipegang koperasi, dan
  // permintaan yang menunggu keputusan datang dari bank.
  institution: {
    email: "demo.institusi@berkembang.id",
    metadata: {
      signup_account_type: "institution",
      nama_institusi: "Koperasi Sejahtera Depok",
      jenis_institusi: "Koperasi",
      nama_contact: "Bagus Pratama",
      lokasi: "Depok, Jawa Barat",
    },
  },
  institutionPending: {
    email: "demo.bank@berkembang.id",
    metadata: {
      signup_account_type: "institution",
      nama_institusi: "BPR Mitra Usaha",
      jenis_institusi: "Bank",
      nama_contact: "Rina Kusuma",
      lokasi: "Depok, Jawa Barat",
    },
  },
  // Dua persona SPEC Portal Institusi I12: CVC + Dinas program.
  cvc: {
    email: "demo.cvc@berkembang.id",
    metadata: {
      signup_account_type: "institution",
      nama_institusi: "BNI Ventures",
      jenis_institusi: "CVC",
      nama_contact: "Dimas Arya",
      lokasi: "Jakarta Selatan",
    },
  },
  dinas: {
    email: "demo.dinas@berkembang.id",
    metadata: {
      signup_account_type: "institution",
      nama_institusi: "Dinas Koperasi & UKM Kota Depok",
      jenis_institusi: "DINAS",
      nama_contact: "Siti Marwah",
      lokasi: "Depok, Jawa Barat",
    },
  },
};

/**
 * Acak yang dapat diulang. Menjalankan seeder dua kali harus menghasilkan
 * angka yang sama persis, supaya tangkapan layar bahan presentasi tidak
 * berubah sendiri di antara latihan dan hari-H.
 */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthStart(date, offset = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// ---------------------------------------------------------------------------
// Akun
// ---------------------------------------------------------------------------

async function upsertAuthUser({ email, metadata }) {
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (existing.error) throw new Error(`Gagal membaca daftar pengguna: ${existing.error.message}`);
  const found = existing.data.users.find((user) => user.email === email);

  if (found) {
    const updated = await admin.auth.admin.updateUserById(found.id, {
      password,
      user_metadata: metadata,
      email_confirm: true,
    });
    if (updated.error) throw new Error(`Gagal memperbarui ${email}: ${updated.error.message}`);
    return { id: found.id, created: false };
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error) throw new Error(`Gagal membuat ${email}: ${created.error.message}`);
  return { id: created.data.user.id, created: true };
}

/**
 * Cermin `lib/auth/bootstrap.ts`. Berkas itu tetap sumber kebenarannya; di
 * sini ditulis ulang karena skrip Node tidak dapat memuat modul server Next.
 */
async function bootstrapProfile(userId, email, metadata) {
  const isUmkm = metadata.signup_account_type === "umkm";
  const profile = {
    id: userId,
    auth_user_id: userId,
    email,
    role: isUmkm ? "umkm" : "institution",
    name: isUmkm ? metadata.nama_pemilik : metadata.nama_institusi,
    nama_pemilik: isUmkm ? metadata.nama_pemilik : null,
    nama_usaha: isUmkm ? metadata.nama_usaha : null,
    sektor_usaha: isUmkm ? metadata.sektor_usaha : null,
    nama_institusi: isUmkm ? null : metadata.nama_institusi,
    jenis_institusi: isUmkm ? null : metadata.jenis_institusi,
    nama_contact: isUmkm ? null : metadata.nama_contact,
    lokasi: metadata.lokasi,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
  if (error) throw new Error(`Gagal menyimpan profil ${email}: ${error.message}`);

  if (isUmkm) {
    // Trigger `provision_umkm_business` membuat usahanya sendiri.
    const business = await admin
      .from("businesses")
      .select("id")
      .eq("legacy_profile_id", userId)
      .maybeSingle();
    if (business.error) throw new Error(business.error.message);
    if (!business.data) throw new Error("Usaha demo tidak terbentuk dari profil.");
    return business.data.id;
  }

  const institution = await admin
    .from("institutions")
    .select("id")
    .eq("legacy_profile_id", userId)
    .maybeSingle();
  if (institution.error) throw new Error(institution.error.message);

  let institutionId = institution.data?.id;
  if (!institutionId) {
    const created = await admin
      .from("institutions")
      .insert({
        legacy_profile_id: userId,
        name: metadata.nama_institusi,
        type: metadata.jenis_institusi,
        contact_name: metadata.nama_contact,
        contact_email: email,
        location: metadata.lokasi,
        active: true,
        status: "active",
      })
      .select("id")
      .single();
    if (created.error) throw new Error(`Gagal membuat institusi: ${created.error.message}`);
    institutionId = created.data.id;
  }

  const membership = await admin
    .from("institution_members")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership.error) throw new Error(membership.error.message);
  if (!membership.data) {
    const { error: memberError } = await admin.from("institution_members").insert({
      institution_id: institutionId,
      profile_id: userId,
      user_id: userId,
      role: "admin",
      status: "active",
      joined_at: new Date().toISOString(),
    });
    if (memberError) throw new Error(`Gagal membuat keanggotaan institusi: ${memberError.message}`);
  }
  return institutionId;
}

async function signIn(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Gagal masuk sebagai ${email}: ${error.message}`);
  return client;
}

// ---------------------------------------------------------------------------
// Catatan usaha
// ---------------------------------------------------------------------------

function buildTransactions(startDate, today) {
  const random = makeRandom(20260902);
  const rows = [];
  let index = 0;
  const push = (row) => rows.push({ ...row, key: `demo-${String(++index).padStart(4, "0")}` });

  for (let day = new Date(startDate); day <= today; day = addDays(day, 1)) {
    const date = isoDate(day);
    const weekday = day.getUTCDay();
    const dayOfMonth = day.getUTCDate();

    // Minggu tutup. Pola ini yang membuat "hari aktif" di laporan masuk akal.
    if (weekday === 0) continue;

    // Penjualan harian. Akhir pekan lebih ramai, seperti warung sungguhan.
    const busy = weekday === 5 || weekday === 6;
    const sales = Math.round((busy ? 620000 : 380000) + random() * 240000);
    const viaBank = random() < 0.3;
    push({
      type: "income",
      amount: Math.round(sales / 1000) * 1000,
      date,
      group: "sales",
      code: "sales_direct",
      description: busy ? "Penjualan akhir pekan" : "Penjualan harian",
      payment: viaBank ? "qris" : "cash",
      emkm: 1,
    });

    // Belanja bahan dua kali seminggu.
    if (weekday === 1 || weekday === 4) {
      push({
        type: "expense",
        amount: Math.round((280000 + random() * 220000) / 1000) * 1000,
        date,
        group: "cost_of_goods",
        code: "raw_material",
        description: "Belanja bahan di pasar",
        payment: "cash",
        emkm: 5,
      });
    }

    // Biaya rutin yang jatuh pada tanggal tetap.
    if (dayOfMonth === 3) {
      push({ type: "expense", amount: 45000, date, group: "operating_expense", code: "utilities",
        description: "Isi ulang gas elpiji", payment: "cash", emkm: 6, subtype: "5210" });
    }
    if (dayOfMonth === 5) {
      push({ type: "expense", amount: 185000, date, group: "operating_expense", code: "utilities",
        description: "Token listrik dan air", payment: "cash", emkm: 6, subtype: "5220" });
      push({ type: "expense", amount: 900000, date, group: "operating_expense", code: "rent",
        description: "Sewa kios bulanan", payment: "cash", emkm: 6, subtype: "5240" });
    }
    if (dayOfMonth === 7) {
      push({ type: "expense", amount: 1200000, date, group: "operating_expense", code: "wage",
        description: "Upah Mbak Rina", payment: "cash", emkm: 6, subtype: "5230" });
    }
    if (dayOfMonth === 12) {
      push({ type: "expense", amount: 160000, date, group: "operating_expense", code: "packaging",
        description: "Kemasan dan stiker label", payment: "cash", emkm: 6, subtype: "5250" });
    }
    if (dayOfMonth === 18) {
      push({ type: "expense", amount: 95000, date, group: "operating_expense", code: "transport",
        description: "Ongkos kirim pesanan", payment: "cash", emkm: 6, subtype: "5260" });
    }

    // Uang yang dibawa pulang. Inilah angka yang membedakan produk ini dari
    // buku kas biasa, jadi ia harus ada di setiap bulan demo.
    if (dayOfMonth === 10 || dayOfMonth === 24) {
      push({ type: "expense", amount: dayOfMonth === 10 ? 400000 : 300000, date,
        group: "other", code: "other", description: "Belanja dapur rumah", payment: "cash", emkm: 9 });
    }

    // Pelanggan yang berutang, lalu melunasinya beberapa hari kemudian.
    if (dayOfMonth === 14) {
      push({ type: "income", amount: 450000, date, group: "sales", code: "sales_direct",
        description: "Pesanan kantor Bu Sari", payment: "unpaid", emkm: 10, counterparty: "Bu Sari" });
    }
    if (dayOfMonth === 20) {
      push({ type: "income", amount: 450000, date, group: "sales", code: "sales_direct",
        description: "Pelunasan pesanan Bu Sari", payment: "cash", emkm: 3, counterparty: "Bu Sari" });
    }

    // Pemasukan di luar jualan.
    if (dayOfMonth === 22) {
      push({ type: "income", amount: 150000, date, group: "other", code: "other",
        description: "Komisi titip jual keripik", payment: "cash", emkm: 2 });
    }
  }

  return rows;
}

async function seedLedger(client, businessId, startDate, today) {
  // Kondisi awal usaha. Tanpa ini, tab Kondisi Usaha hanya menampilkan ajakan
  // mengisi wizard dan tidak ada satu angka pun yang bisa ditunjukkan.
  const existingOpening = await admin
    .from("opening_balances")
    .select("id")
    .eq("business_id", businessId)
    .maybeSingle();
  if (existingOpening.error) throw new Error(existingOpening.error.message);

  if (!existingOpening.data) {
    const assetDate = isoDate(monthStart(startDate, -8));
    const { error } = await client.rpc("save_opening_balances", {
      p_start_date: isoDate(startDate),
      p_cash_idr: 1_500_000,
      p_bank_idr: 2_000_000,
      p_receivables: [{ name: "Bu Sari", amountIdr: 350_000 }],
      p_payables: [
        {
          name: "Koperasi Sejahtera",
          amountIdr: 6_000_000,
          lenderType: "KOPERASI",
          monthlyInstallmentIdr: 500_000,
          annualRate: 12,
        },
      ],
      p_inventory_idr: 1_200_000,
      p_assets: [
        { name: "Kulkas dua pintu", costIdr: 4_500_000, acquiredOn: assetDate, category: "mesin" },
        { name: "Etalase kaca", costIdr: 2_000_000, acquiredOn: assetDate, category: "peralatan" },
      ],
      p_notes: "Kondisi awal akun demo.",
    });
    if (error) throw new Error(`Kondisi awal gagal disimpan: ${error.message}`);
    console.log("  kondisi awal usaha  tersimpan");
  } else {
    console.log("  kondisi awal usaha  sudah ada, dilewati");
  }

  // Lawan transaksi pinjaman, supaya cicilan mengurangi sisa pinjaman yang benar.
  const loan = await admin
    .from("loans")
    .select("counterparty_id")
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();
  if (loan.error) throw new Error(loan.error.message);
  const loanCounterpartyId = loan.data?.counterparty_id ?? null;

  const rows = buildTransactions(startDate, today);

  // Pembelian alat: satu di atas ambang Rp500.000 sehingga masuk daftar alat
  // dan disusutkan, satu di bawahnya sehingga menjadi biaya bulan berjalan —
  // dua-duanya perlu terlihat saat demo.
  const secondMonth = monthStart(startDate, 1);
  rows.push({
    key: "demo-alat-kompor", type: "expense", amount: 750_000, date: isoDate(addDays(secondMonth, 8)),
    group: "asset", code: "equipment", description: "Kompor dua tungku", payment: "cash", emkm: 8,
  });
  rows.push({
    key: "demo-alat-pisau", type: "expense", amount: 85_000, date: isoDate(addDays(secondMonth, 9)),
    group: "asset", code: "equipment", description: "Pisau dapur baru", payment: "cash", emkm: 8,
  });
  rows.push({
    key: "demo-modal", type: "income", amount: 2_000_000, date: isoDate(addDays(secondMonth, 2)),
    group: "other", code: "other", description: "Tambahan modal dari suami", payment: "cash", emkm: 4,
    subtype: "4a",
  });

  // Cicilan koperasi setiap bulan, dengan bunganya dipisah.
  if (loanCounterpartyId) {
    for (let offset = 0; ; offset += 1) {
      const due = addDays(monthStart(startDate, offset), 27);
      if (due > today) break;
      rows.push({
        key: `demo-cicilan-${offset}`, type: "expense", amount: 560_000, date: isoDate(due),
        group: "other", code: "other", description: "Cicilan Koperasi Sejahtera", payment: "cash",
        emkm: 7, counterpartyId: loanCounterpartyId, interest: 60_000,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  let written = 0;
  for (const row of rows) {
    const { error } = await client.rpc("create_ledger_transaction", {
      p_idempotency_key: row.key,
      p_transaction_type: row.type,
      p_amount_idr: row.amount,
      p_transaction_date: row.date,
      p_category_group: row.group,
      p_category_code: row.code,
      p_description: row.description,
      p_payment_method: row.payment,
      p_counterparty: row.counterparty ?? null,
      p_emkm_category_code: row.emkm,
      p_emkm_category_subtype: row.subtype ?? null,
      p_counterparty_id: row.counterpartyId ?? null,
      p_interest_amount_idr: row.interest ?? 0,
    });
    if (error) throw new Error(`Transaksi ${row.key} (${row.date}) gagal: ${error.message}`);
    written += 1;
    if (written % 25 === 0) process.stdout.write(`  transaksi           ${written}/${rows.length}\r`);
  }
  console.log(`  transaksi           ${written} tercatat            `);

  // Hitungan stok untuk bulan yang sudah selesai. Tanpa ini, laba bulan-bulan
  // itu memikul bahan yang sebenarnya masih di rak.
  for (let offset = 0; ; offset += 1) {
    const month = monthStart(startDate, offset);
    if (monthEnd(month) >= today) break;
    const { error } = await client.rpc("save_inventory_count", {
      p_period_month: isoDate(month),
      p_counted_value_idr: 1_100_000 + offset * 150_000,
      p_notes: "Hitungan fisik akhir bulan.",
    });
    if (error) throw new Error(`Hitungan stok ${isoDate(month)} gagal: ${error.message}`);
  }
  console.log("  hitungan stok       tersimpan untuk bulan yang sudah selesai");

  // Tutup kas untuk semua hari yang PUNYA catatan, kecuali dua hari terakhir —
  // supaya lencana "Kas sudah ditutup" terlihat dan pengingat tutup kas tetap
  // punya isi.
  //
  // Tanggalnya diambil dari transaksi yang benar-benar ditulis, bukan dari
  // aturan kalender. Versi sebelumnya melewati setiap hari Minggu, padahal
  // cicilan koperasi jatuh tanggal 28 tiap bulan tanpa peduli harinya — dan
  // 28 Juni 2026 kebetulan Minggu. Hasilnya satu hari bertransaksi yang tidak
  // pernah ditutup, dan pengingat yang muncul di layar demo tanpa sebab yang
  // bisa dijelaskan.
  const closeUntil = isoDate(addDays(today, -2));
  const recordedDays = [...new Set(rows.map((row) => row.date))].filter((date) => date <= closeUntil).sort();
  let closed = 0;
  for (const date of recordedDays) {
    const { error } = await client.rpc("close_ledger_day", {
      p_closing_date: date,
      p_opening_cash_idr: null,
      p_physical_cash_idr: null,
      p_note: null,
      p_physical_bank_idr: null,
    });
    if (error) throw new Error(`Tutup kas ${date} gagal: ${error.message}`);
    closed += 1;
    if (closed % 20 === 0) process.stdout.write(`  tutup kas           ${closed} hari
`);
  }
  console.log(`  tutup kas           ${closed} hari, dua hari terakhir sengaja dibiarkan terbuka`);

  // Panaskan penyusutan, perkiraan pajak, dan indikator supaya layar pertama
  // yang dibuka saat demo tidak menghabiskan waktu menghitung.
  for (const rpc of ["ensure_depreciation_posted", "ensure_tax_estimated", "ensure_indicators_rebuilt"]) {
    const { error } = await client.rpc(rpc, { p_as_of: isoDate(today) });
    if (error) throw new Error(`${rpc} gagal: ${error.message}`);
  }
  console.log("  penyusutan, pajak, indikator  dihitung");
}

// ---------------------------------------------------------------------------
// Izin akses institusi
// ---------------------------------------------------------------------------

/**
 * Mencari permintaan yang sudah ada dari satu institusi untuk satu usaha.
 *
 * Pencocokan lewat kunci idempotensi saja tidak cukup: sebuah permintaan yang
 * dibuat percobaan sebelumnya, dengan kunci yang sejak itu berubah, tetap
 * menghalangi permintaan baru lewat `dossier_requests_one_pending_idx`.
 * Kalau tidak dikenali, seeder akan menabraknya dengan PENDING_REQUEST_EXISTS
 * dan tidak pernah bisa selesai tanpa membersihkan baris itu manual.
 */
async function findExistingRequest(institutionId, businessId) {
  const { data, error } = await admin
    .from("dossier_requests")
    .select("id,status")
    .eq("institution_id", institutionId)
    .eq("business_id", businessId)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Gagal memeriksa permintaan yang sudah ada: ${error.message}`);
  return data?.[0] ?? null;
}

async function seedConsent({ koperasiClient, bankClient, ownerClient, businessId, institutionIds }) {
  // Scope wajib berasal dari `allowed_scopes` di migrasi 0023; nama di luar
  // daftar itu ditolak sebagai INVALID_SCOPE tanpa menyebut mana yang salah.
  //   business_identity · readiness · financial_summary · nib · npwp
  //   owner_identity · qris_history · sector_certificates
  const approvedScopes = ["business_identity", "financial_summary", "readiness"];

  // 1. Koperasi meminta akses, lalu pemilik menyetujuinya. Setelah ini portal
  //    institusi langsung punya isi yang bisa ditunjukkan.
  let koperasi = await findExistingRequest(institutionIds.institution, businessId);
  if (!koperasi) {
    const created = await koperasiClient.rpc("create_dossier_request", {
      p_business_id: businessId,
      p_program_id: null,
      p_purpose_code: "program_review",
      p_purpose_description: "Menilai kecocokan untuk program pendampingan koperasi.",
      p_requested_scopes: approvedScopes,
      p_required_scopes: ["financial_summary"],
      p_requested_duration_days: 30,
      p_download_requested: true,
      p_idempotency_key: "demo-request-koperasi",
    });
    if (created.error) throw new Error(`Permintaan koperasi gagal: ${created.error.message}`);
    koperasi = { id: created.data?.requestId, status: created.data?.status ?? "pending" };
  }
  const koperasiRequestId = koperasi.id;

  if (koperasi.status === "pending") {
    const decision = await ownerClient.rpc("respond_to_dossier_request", {
      p_request_id: koperasiRequestId,
      p_decision: "approve",
      p_approved_scopes: approvedScopes,
      p_download_allowed: true,
    });
    if (decision.error) throw new Error(`Persetujuan pemilik gagal: ${decision.error.message}`);
    console.log("  izin akses          koperasi disetujui pemilik");
  } else {
    console.log("  izin akses          koperasi sudah disetujui sebelumnya");
  }

  // 2. Bank meminta akses dan DIBIARKAN menunggu, supaya alur persetujuan bisa
  //    diperagakan hidup di depan penonton. Permintaan ini datang dari
  //    institusi yang berbeda karena akses koperasi sudah aktif, dan satu
  //    usaha hanya boleh punya satu akses aktif per institusi.
  const existingBank = await findExistingRequest(institutionIds.institutionPending, businessId);
  if (existingBank) {
    return { pendingRequestId: existingBank.id };
  }
  const bankRequest = await bankClient.rpc("create_dossier_request", {
    p_business_id: businessId,
    p_program_id: null,
    p_purpose_code: "financing_review",
    p_purpose_description: "Meninjau kesiapan data usaha sebelum pengajuan dibahas.",
    p_requested_scopes: ["business_identity", "financial_summary"],
    p_required_scopes: ["financial_summary"],
    p_requested_duration_days: 14,
    p_download_requested: false,
    p_idempotency_key: "demo-request-bank",
  });
  if (bankRequest.error) throw new Error(`Permintaan bank gagal: ${bankRequest.error.message}`);

  return { pendingRequestId: bankRequest.data?.requestId ?? null };
}

// ---------------------------------------------------------------------------
// Persona SPEC Portal Institusi I12: BNI Ventures (CVC) + Dinas Depok (program)
// ---------------------------------------------------------------------------

/**
 * Alur demo lengkap: opt-in → discovery → request → admin approve → dossier
 * → download (PDF watermark) → revoke. BNI Ventures memegang dossier aktif
 * (siap dibuka + diunduh), Dinas memegang program dengan kode gabung.
 */
async function seedSpecPersonas({ cvcClient, dinasClient, ownerClient, businessId, institutionIds }) {
  // UMKM bersedia ditemukan supaya muncul di Temukan.
  await ownerClient.rpc("set_my_discovery_optin", { p_opted_in: true });

  // BNI Ventures: minta → disetujui → dossier aktif siap dibuka/diunduh.
  const cvcScopes = ["business_identity", "readiness", "financial_summary"];
  let cvc = await findExistingRequest(institutionIds.cvc, businessId);
  if (!cvc) {
    const created = await cvcClient.rpc("create_dossier_request", {
      p_business_id: businessId,
      p_program_id: null,
      p_purpose_code: "investment_screening",
      p_purpose_description: "Menilai kesiapan data usaha untuk penjajakan investasi.",
      p_requested_scopes: cvcScopes,
      p_required_scopes: ["financial_summary"],
      p_requested_duration_days: 90,
      p_download_requested: true,
      p_idempotency_key: "demo-request-bni-ventures",
      p_institution_id: institutionIds.cvc,
    });
    if (created.error) throw new Error(`Permintaan BNI Ventures gagal: ${created.error.message}`);
    cvc = { id: created.data?.requestId, status: created.data?.status ?? "pending" };
  }
  if (cvc.status === "pending") {
    const decision = await ownerClient.rpc("respond_to_dossier_request", {
      p_request_id: cvc.id,
      p_decision: "approve",
      p_approved_scopes: cvcScopes,
      p_download_allowed: true,
    });
    if (decision.error) throw new Error(`Persetujuan BNI Ventures gagal: ${decision.error.message}`);
    console.log("  izin akses          BNI Ventures disetujui pemilik (dossier aktif)");
  } else {
    console.log("  izin akses          BNI Ventures sudah disetujui sebelumnya");
  }

  // Dinas: buat program + kode gabung + UMKM bergabung.
  const { data: existingProgram } = await admin
    .from("programs")
    .select("id,join_code")
    .eq("institution_id", institutionIds.dinas)
    .eq("name", "Pembinaan UMKM Depok 2026")
    .maybeSingle();
  let programId = existingProgram?.id;
  let joinCode = existingProgram?.join_code;
  if (!programId) {
    const created = await admin.from("programs").insert({
      institution_id: institutionIds.dinas,
      name: "Pembinaan UMKM Depok 2026",
      region: "Kota Depok",
      status: "active",
      mission_pack: { default: ["legalitas", "kebiasaan_mencatat"] },
    }).select("id,join_code").single();
    if (created.error) throw new Error(`Program Dinas gagal dibuat: ${created.error.message}`);
    programId = created.data.id;
    joinCode = created.data.join_code;
  }
  const joined = await ownerClient.rpc("join_program_by_code", { p_join_code: joinCode });
  if (joined.error) throw new Error(`Gabung program gagal: ${joined.error.message}`);
  console.log(`  program             Dinas Depok aktif, kode gabung ${joinCode}`);

  // Entitlement demo: kredit cukup untuk alur demo, lisensi pilot setahun.
  for (const key of ["cvc", "dinas"]) {
    await admin.from("institution_entitlements").upsert({
      institution_id: institutionIds[key],
      seats: key === "cvc" ? 5 : 10,
      dossier_credits: 20,
      license_from: new Date().toISOString().slice(0, 10),
      license_to: `${new Date().getUTCFullYear() + 1}-12-31`,
      plan_note: "Pilot SPEC Portal Institusi",
    }, { onConflict: "institution_id" });
  }
  void dinasClient;
  return { joinCode };
}

// ---------------------------------------------------------------------------
// Jalannya
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n  Proyek sasaran: ${projectRef}\n`);

  // Migrasi terbaru wajib sudah ada. Tanpa ini datanya masuk, tetapi tab
  // Kondisi Usaha dan Mode Akuntan tetap gagal — dan itu baru ketahuan saat
  // layarnya dibuka di depan penonton.
  const readiness = await admin.from("indicator_monthly").select("id").limit(1);
  if (readiness.error) {
    fail(
      "Basis data sasaran belum punya migrasi terbaru (`indicator_monthly` tidak ditemukan).",
      "  Jalankan dulu:  npx supabase db push\n  lalu ulangi perintah ini.",
    );
  }

  const umkmUser = await upsertAuthUser(demo.umkm);
  const businessId = await bootstrapProfile(umkmUser.id, demo.umkm.email, demo.umkm.metadata);
  console.log(`  akun UMKM           ${demo.umkm.email} (${umkmUser.created ? "dibuat" : "diperbarui"})`);

  const institutionIds = {};
  for (const key of ["institution", "institutionPending", "cvc", "dinas"]) {
    const account = demo[key];
    const user = await upsertAuthUser(account);
    institutionIds[key] = await bootstrapProfile(user.id, account.email, account.metadata);
    console.log(`  akun institusi      ${account.email} (${user.created ? "dibuat" : "diperbarui"})`);
  }

  const today = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}T00:00:00Z`);
  const startDate = monthStart(today, -3);

  const umkmClient = await signIn(demo.umkm.email);
  await seedLedger(umkmClient, businessId, startDate, today);

  const koperasiClient = await signIn(demo.institution.email);
  const bankClient = await signIn(demo.institutionPending.email);
  const consent = await seedConsent(
    { koperasiClient, bankClient, ownerClient: umkmClient, businessId, institutionIds },
  );
  console.log("  izin akses          permintaan bank menunggu keputusan pemilik");

  const cvcClient = await signIn(demo.cvc.email);
  const dinasClient = await signIn(demo.dinas.email);
  const personas = await seedSpecPersonas(
    { cvcClient, dinasClient, ownerClient: umkmClient, businessId, institutionIds },
  );

  console.log(`
  Selesai.

    UMKM       ${demo.umkm.email}
    Koperasi   ${demo.institution.email}      (akses sudah disetujui)
    Bank       ${demo.institutionPending.email}      (permintaan menunggu)
    BNI Vent.  ${demo.cvc.email}      (dossier aktif + PDF watermark)
    Dinas      ${demo.dinas.email}      (program, kode ${personas.joinCode})
    Sandi      dari DEMO_PASSWORD

  Yang siap diperagakan:
    - Ruang Usaha: Bulan Ini, Kondisi Usaha, Untuk Bank (PDF), Buku Kas
    - Mode Akuntan: jurnal, buku besar, neraca saldo, ekspor CSV
    - Pengingat tutup kas untuk dua hari terakhir
    - Portal koperasi: profil usaha yang sudah disetujui, siap dibuka
    - Portal bank: permintaan menunggu, siap disetujui pemilik di depan penonton
      (id ${consent.pendingRequestId ?? "lihat daftar permintaan"})
    - Portal BNI Ventures: dossier aktif → buka → unduh PDF ber-watermark → revoke
    - Portal Dinas: program "Pembinaan UMKM Depok 2026" → dashboard agregat non-rupiah
`);
}

main().catch((error) => {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
});
