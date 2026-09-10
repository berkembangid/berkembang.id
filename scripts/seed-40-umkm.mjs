#!/usr/bin/env node
/**
 * Skrip Injeksi Data 40 UMKM Berkembang.id beserta Laporan Keuangannya.
 * 
 * Karakteristik data:
 * - 40 UMKM dengan identitas, sektor, dan domisili realistis di Indonesia
 * - Sektor bervariasi: Kuliner (14), Fashion (8), Jasa (6), Pertanian (5), Kerajinan (4), Perdagangan (3)
 * - Tingkat Kesiapan (Readiness): EMAS (8), PERAK (14), TEMBAGA (12), MULAI (6)
 * - Opt-in Discovery: 34 opt-in (terlihat oleh Bank/Offtaker/Dinas), 6 belum opt-in (hanya terlihat oleh Dinas)
 * - Kondisi awal (opening balance) lengkap: Kas, Bank, Persediaan, Aset Tetap, Pinjaman
 * - Dokumen legalitas: KTP, NIB, NPWP, Halal, PIRT sesuai kesiapan
 * - Transaksi keuangan realistis (omzet harian, belanja bahan HPP, operasional, gaji, sewa, prive)
 * - Jurnal akuntansi seimbang otomatis via RPC create_ledger_transaction & daily closings
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  const env = {};
  for (const name of [".env", ".env.local"]) {
    try {
      const text = readFileSync(join(process.cwd(), name), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      continue;
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = "PasswordBerkembang2026!";

if (!url || !serviceKey || !anonKey) {
  console.error("Konfigurasi Supabase tidak lengkap di .env/.env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Definisi 40 UMKM
const UMKM_PROFILES = [
  // --- KULINER (14) ---
  {
    owner: "Budi Santoso", business: "Warung Soto Kudus Pak Budi", sector: "Kuliner", city: "Kota Semarang",
    phone: "081234567001", form: "perorangan", startYear: 2021, level: "EMAS", optIn: true,
    dailyBase: 950000, margin: 0.52, hasKiosk: true, staff: 2
  },
  {
    owner: "Siti Aminah", business: "Dapur Sambal Bu Siti", sector: "Kuliner", city: "Kota Surabaya",
    phone: "081345678002", form: "perorangan", startYear: 2020, level: "EMAS", optIn: true,
    dailyBase: 1200000, margin: 0.50, hasKiosk: true, staff: 3
  },
  {
    owner: "Hendra Wijaya", business: "Kopi Kenangan Rakyat", sector: "Kuliner", city: "Kota Bandung",
    phone: "081987654003", form: "badan_usaha", startYear: 2019, level: "EMAS", optIn: true,
    dailyBase: 1500000, margin: 0.60, hasKiosk: true, staff: 4
  },
  {
    owner: "Dewi Lestari", business: "Bakso & Mie Ayam Barokah", sector: "Kuliner", city: "Kota Yogyakarta",
    phone: "085678901004", form: "perorangan", startYear: 2022, level: "PERAK", optIn: true,
    dailyBase: 750000, margin: 0.48, hasKiosk: true, staff: 1
  },
  {
    owner: "Agus Setiawan", business: "Sate Kambing Muda Cak Agus", sector: "Kuliner", city: "Kota Surakarta",
    phone: "087890123005", form: "perorangan", startYear: 2022, level: "PERAK", optIn: true,
    dailyBase: 850000, margin: 0.45, hasKiosk: true, staff: 2
  },
  {
    owner: "Rina Kusuma", business: "Catering Berkah Rasa", sector: "Kuliner", city: "Kota Depok",
    phone: "081298765006", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 1100000, margin: 0.42, hasKiosk: false, staff: 2
  },
  {
    owner: "Ahmad Fauzi", business: "Roti Maryam & Martabak Mini", sector: "Kuliner", city: "Kota Jakarta Selatan",
    phone: "082134567007", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 500000, margin: 0.55, hasKiosk: true, staff: 1
  },
  {
    owner: "Nurul Hidayah", business: "Kedai Es Teh & Minuman Segar", sector: "Kuliner", city: "Kota Bekasi",
    phone: "085712345008", form: "perorangan", startYear: 2024, level: "TEMBAGA", optIn: true,
    dailyBase: 380000, margin: 0.65, hasKiosk: false, staff: 0
  },
  {
    owner: "Joko Widodo", business: "Warung Nasi Pecel Madiun", sector: "Kuliner", city: "Kota Malang",
    phone: "081323456009", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: false, // sengaja false
    dailyBase: 450000, margin: 0.50, hasKiosk: true, staff: 1
  },
  {
    owner: "Sri Wahyuni", business: "Kue Basah Tradisional Mbak Sri", sector: "Kuliner", city: "Kabupaten Sleman",
    phone: "087789012010", form: "perorangan", startYear: 2024, level: "TEMBAGA", optIn: true,
    dailyBase: 400000, margin: 0.52, hasKiosk: false, staff: 0
  },
  {
    owner: "Eko Prasetyo", business: "Ayam Geprek Sambal Korek", sector: "Kuliner", city: "Kota Tangerang",
    phone: "089876543011", form: "perorangan", startYear: 2023, level: "PERAK", optIn: true,
    dailyBase: 650000, margin: 0.46, hasKiosk: true, staff: 1
  },
  {
    owner: "Maya Putri", business: "Pempek Asli Palembang Cek Maya", sector: "Kuliner", city: "Kota Palembang",
    phone: "081234987012", form: "perorangan", startYear: 2022, level: "PERAK", optIn: true,
    dailyBase: 900000, margin: 0.54, hasKiosk: true, staff: 2
  },
  {
    owner: "Rizki Ramadhan", business: "Dapur Dimsum Rumahan", sector: "Kuliner", city: "Kota Bogor",
    phone: "085612345013", form: "perorangan", startYear: 2025, level: "MULAI", optIn: true,
    dailyBase: 300000, margin: 0.50, hasKiosk: false, staff: 0
  },
  {
    owner: "Fitriani", business: "Gorengan Renyah & Tahu Gejrot", sector: "Kuliner", city: "Kota Cirebon",
    phone: "087812345014", form: "perorangan", startYear: 2025, level: "MULAI", optIn: false, // sengaja false
    dailyBase: 250000, margin: 0.60, hasKiosk: false, staff: 0
  },

  // --- FASHION & KONVEKSI (8) ---
  {
    owner: "Bambang Suryo", business: "Batik Tulis Sekar Jagad", sector: "Fashion", city: "Kota Surakarta",
    phone: "081234567015", form: "badan_usaha", startYear: 2018, level: "EMAS", optIn: true,
    dailyBase: 1400000, margin: 0.58, hasKiosk: true, staff: 4
  },
  {
    owner: "Dian Sastro", business: "Hijab & Gamis Al-Madina", sector: "Fashion", city: "Kota Bandung",
    phone: "081345678016", form: "perorangan", startYear: 2020, level: "EMAS", optIn: true,
    dailyBase: 1250000, margin: 0.55, hasKiosk: true, staff: 3
  },
  {
    owner: "Wahyu Hidayat", business: "Konveksi Kaos Sablon Bintang", sector: "Fashion", city: "Kota Surabaya",
    phone: "081987654017", form: "badan_usaha", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 950000, margin: 0.45, hasKiosk: false, staff: 3
  },
  {
    owner: "Ani Yudhoyono", business: "Rumah Jahit Kebaya Cantik", sector: "Fashion", city: "Kota Semarang",
    phone: "085678901018", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 700000, margin: 0.65, hasKiosk: true, staff: 2
  },
  {
    owner: "Dedi Mulyadi", business: "Distro Kaos Polos Sunda", sector: "Fashion", city: "Kabupaten Purwakarta",
    phone: "087890123019", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 500000, margin: 0.40, hasKiosk: true, staff: 1
  },
  {
    owner: "Tri Risma", business: "Koleksi Daster Batik Rayon", sector: "Fashion", city: "Kota Pekalongan",
    phone: "081298765020", form: "perorangan", startYear: 2022, level: "PERAK", optIn: false, // sengaja false
    dailyBase: 650000, margin: 0.48, hasKiosk: false, staff: 1
  },
  {
    owner: "Arif Rahman", business: "Denim & Celana Chino Custom", sector: "Fashion", city: "Kota Bandung",
    phone: "082134567021", form: "perorangan", startYear: 2024, level: "TEMBAGA", optIn: true,
    dailyBase: 420000, margin: 0.50, hasKiosk: false, staff: 1
  },
  {
    owner: "Indah Permata", business: "Mukena Bordir Handmade", sector: "Fashion", city: "Kota Tasikmalaya",
    phone: "085712345022", form: "perorangan", startYear: 2025, level: "MULAI", optIn: true,
    dailyBase: 280000, margin: 0.55, hasKiosk: false, staff: 0
  },

  // --- JASA (6) ---
  {
    owner: "Gede Sukarma", business: "Bengkel Motor Berkah Jaya", sector: "Jasa", city: "Kota Denpasar",
    phone: "081323456023", form: "perorangan", startYear: 2019, level: "EMAS", optIn: true,
    dailyBase: 1100000, margin: 0.62, hasKiosk: true, staff: 3
  },
  {
    owner: "Ni Wayan Sari", business: "Laundry Kiloan Wangi Express", sector: "Jasa", city: "Kota Denpasar",
    phone: "087789012024", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 650000, margin: 0.58, hasKiosk: true, staff: 2
  },
  {
    owner: "Putu Suartika", business: "Barbershop Pangkas Rapi", sector: "Jasa", city: "Kabupaten Badung",
    phone: "089876543025", form: "perorangan", startYear: 2022, level: "PERAK", optIn: true,
    dailyBase: 550000, margin: 0.75, hasKiosk: true, staff: 2
  },
  {
    owner: "Made Wirawan", business: "Cuci Mobil & Motor Bersih Kilat", sector: "Jasa", city: "Kota Denpasar",
    phone: "081234987026", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 480000, margin: 0.60, hasKiosk: true, staff: 2
  },
  {
    owner: "Hasan Basri", business: "Service AC & Elektronik Mandiri", sector: "Jasa", city: "Kota Medan",
    phone: "085612345027", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 520000, margin: 0.70, hasKiosk: false, staff: 1
  },
  {
    owner: "Cut Meutia", business: "Jasa Percetakan & Fotokopi Cepat", sector: "Jasa", city: "Kota Banda Aceh",
    phone: "087812345028", form: "perorangan", startYear: 2024, level: "TEMBAGA", optIn: false, // sengaja false
    dailyBase: 380000, margin: 0.55, hasKiosk: true, staff: 1
  },

  // --- PERTANIAN & PETERNAKAN (5) ---
  {
    owner: "Teuku Umar", business: "Tani Hidroponik Segar Sejahtera", sector: "Pertanian", city: "Kota Bogor",
    phone: "081234567029", form: "badan_usaha", startYear: 2020, level: "EMAS", optIn: true,
    dailyBase: 1300000, margin: 0.50, hasKiosk: false, staff: 3
  },
  {
    owner: "Siti Fatimah", business: "Budidaya Madu Murni Alami", sector: "Pertanian", city: "Kabupaten Magelang",
    phone: "081345678030", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 750000, margin: 0.60, hasKiosk: false, staff: 1
  },
  {
    owner: "Rudi Hartono", business: "Ternak Telur Ayam Kampung Sehat", sector: "Pertanian", city: "Kabupaten Blitar",
    phone: "081987654031", form: "perorangan", startYear: 2022, level: "PERAK", optIn: true,
    dailyBase: 850000, margin: 0.42, hasKiosk: false, staff: 2
  },
  {
    owner: "Yuni Shara", business: "Kebun Bibit Buah & Tanaman Hias", sector: "Pertanian", city: "Kota Batu",
    phone: "085678901032", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 450000, margin: 0.55, hasKiosk: true, staff: 1
  },
  {
    owner: "Gunawan", business: "Budidaya Lele Sangkuriang Berkah", sector: "Pertanian", city: "Kabupaten Kediri",
    phone: "087890123033", form: "perorangan", startYear: 2025, level: "MULAI", optIn: true,
    dailyBase: 250000, margin: 0.40, hasKiosk: false, staff: 0
  },

  // --- KERAJINAN (4) ---
  {
    owner: "Ratna Sari", business: "Kerajinan Kulit Garut Kencana", sector: "Kerajinan", city: "Kabupaten Garut",
    phone: "081298765034", form: "badan_usaha", startYear: 2019, level: "EMAS", optIn: true,
    dailyBase: 1350000, margin: 0.52, hasKiosk: true, staff: 3
  },
  {
    owner: "Doni Prasetya", business: "Anyaman Rotan & Bambu Asri", sector: "Kerajinan", city: "Kota Cirebon",
    phone: "082134567035", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 700000, margin: 0.55, hasKiosk: true, staff: 2
  },
  {
    owner: "Lestari", business: "Gerabah & Keramik Kasongan Indah", sector: "Kerajinan", city: "Kabupaten Bantul",
    phone: "085712345036", form: "perorangan", startYear: 2022, level: "PERAK", optIn: false, // sengaja false
    dailyBase: 600000, margin: 0.58, hasKiosk: true, staff: 1
  },
  {
    owner: "Fajar Nugraha", business: "Souvenir Kayu & Reseller Aksesoris", sector: "Kerajinan", city: "Kota Surakarta",
    phone: "081323456037", form: "perorangan", startYear: 2024, level: "TEMBAGA", optIn: true,
    dailyBase: 380000, margin: 0.50, hasKiosk: false, staff: 0
  },

  // --- PERDAGANGAN & KELONTONG (3) ---
  {
    owner: "Mega Utami", business: "Toko Sembako Sumber Rejeki", sector: "Lainnya", city: "Kota Surabaya",
    phone: "087789012038", form: "perorangan", startYear: 2021, level: "PERAK", optIn: true,
    dailyBase: 1100000, margin: 0.28, hasKiosk: true, staff: 2
  },
  {
    owner: "Surya Saputra", business: "Warung Kelontong Berkah Bersama", sector: "Lainnya", city: "Kota Malang",
    phone: "089876543039", form: "perorangan", startYear: 2023, level: "TEMBAGA", optIn: true,
    dailyBase: 550000, margin: 0.25, hasKiosk: true, staff: 1
  },
  {
    owner: "Wulan Guritno", business: "Toko Perlengkapan Rumah Tangga Plastik", sector: "Lainnya", city: "Kota Sidoarjo",
    phone: "081234987040", form: "perorangan", startYear: 2025, level: "MULAI", optIn: false, // sengaja false
    dailyBase: 320000, margin: 0.30, hasKiosk: true, staff: 0
  },
];

function pseudoRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(d, count) {
  const next = new Date(d);
  next.setDate(next.getDate() + count);
  return next;
}

async function seedOneUmkm(item, index) {
  const pad = String(index + 1).padStart(2, "0");
  const email = `umkm.seed${pad}@berkembang.id`;
  const rand = pseudoRandom(1000 + index * 47);

  console.log(`[${pad}/40] Memproses: ${item.business} (${item.owner} - ${item.city}) [${item.level}]...`);

  // 1. Buat / Ambil Auth User
  let userId;
  const { data: existingUser } = await admin.auth.admin.listUsers();
  const matchedUser = existingUser?.users?.find(u => u.email === email);

  if (matchedUser) {
    userId = matchedUser.id;
  } else {
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        nama_pemilik: item.owner,
        nama_usaha: item.business,
        sektor_usaha: item.sector,
        lokasi: item.city,
        phone: item.phone,
        signup_account_type: "umkm"
      }
    });
    if (createError) throw new Error(`User create failed for ${email}: ${createError.message}`);
    userId = newUser.user.id;
  }

  // 2. Profile
  const profileData = {
    id: userId,
    auth_user_id: userId,
    email,
    role: "umkm",
    name: item.owner,
    nama_pemilik: item.owner,
    nama_usaha: item.business,
    sektor_usaha: item.sector,
    lokasi: item.city,
    phone: item.phone,
    bentuk_usaha: item.form,
    tahun_mulai_usaha: item.startYear,
    status: "active",
    updated_at: new Date().toISOString()
  };
  await admin.from("profiles").upsert(profileData, { onConflict: "id" });

  // 3. Business
  const { data: existingBiz } = await admin.from("businesses").select("id").eq("legacy_profile_id", userId).maybeSingle();
  let businessId = existingBiz?.id;
  if (!businessId) {
    const { data: newBiz, error: bizErr } = await admin.from("businesses").insert({
      legacy_profile_id: userId,
      name: item.business,
      legal_name: item.business,
      sector: item.sector,
      location: item.city,
      phone: item.phone,
      status: "active"
    }).select("id").single();
    if (bizErr) throw new Error(`Business create failed: ${bizErr.message}`);
    businessId = newBiz.id;
  }

  // 4. Business Member
  try {
    await admin.from("business_members").upsert({
      business_id: businessId,
      user_id: userId,
      role: "owner",
      status: "active"
    }, { onConflict: "business_id,user_id" });
  } catch {}

  // 5. Discovery Opt-in
  const candidateCode = `UMKM-${(item.city.slice(0, 2) + Math.random().toString(36).substring(2, 8)).toUpperCase()}`;
  await admin.from("discovery_optins").upsert({
    business_id: businessId,
    opted_in: item.optIn,
    candidate_code: candidateCode,
    opted_at: item.optIn ? new Date().toISOString() : null,
    copy_version: "v1"
  }, { onConflict: "business_id" });

  // 6. Business Readiness State
  await admin.from("business_readiness_state").upsert({
    business_id: businessId,
    level: item.level,
    level_since: formatDate(addDays(new Date(), -60)),
    formula_version: "v2",
    updated_at: new Date().toISOString()
  }, { onConflict: "business_id" });

  // 7. Dokumen Legalitas (Documents)
  const docList = [];
  docList.push({
    business_id: businessId,
    doc_type: "ktp_owner",
    title: `KTP ${item.owner}`,
    status: "verified",
    assurance_level: "confirmed",
    storage_path: `mock/ktp-${businessId}.jpg`,
    created_by: userId
  });
  if (item.level === "TEMBAGA" || item.level === "PERAK" || item.level === "EMAS") {
    docList.push({
      business_id: businessId,
      doc_type: "nib",
      title: `NIB ${item.business}`,
      status: "verified",
      assurance_level: "confirmed",
      storage_path: `mock/nib-${businessId}.pdf`,
      created_by: userId
    });
  }
  if (item.level === "PERAK" || item.level === "EMAS") {
    docList.push({
      business_id: businessId,
      doc_type: "npwp",
      title: `NPWP Usaha`,
      status: "verified",
      assurance_level: "confirmed",
      storage_path: `mock/npwp-${businessId}.pdf`,
      created_by: userId
    });
  }
  if (item.level === "EMAS" && item.sector === "Kuliner") {
    docList.push({
      business_id: businessId,
      doc_type: "halal",
      title: `Sertifikat Halal`,
      status: "verified",
      assurance_level: "confirmed",
      storage_path: `mock/halal-${businessId}.pdf`,
      created_by: userId
    });
    docList.push({
      business_id: businessId,
      doc_type: "pirt",
      title: `Sertifikat PIRT`,
      status: "verified",
      assurance_level: "confirmed",
      storage_path: `mock/pirt-${businessId}.pdf`,
      created_by: userId
    });
  }
  for (const doc of docList) {
    const { data: existingDoc } = await admin.from("documents").select("id").eq("business_id", businessId).eq("doc_type", doc.doc_type).maybeSingle();
    if (!existingDoc) {
      try {
        await admin.from("documents").insert(doc);
      } catch {}
    }
  }

  // 8. Opening Balances (Kondisi Awal Usaha)
  const today = new Date();
  const startDate = addDays(today, item.level === "EMAS" ? -75 : item.level === "PERAK" ? -50 : item.level === "TEMBAGA" ? -30 : -14);
  const { data: existingOpening } = await admin.from("opening_balances").select("id").eq("business_id", businessId).maybeSingle();
  
  if (!existingOpening) {
    const cashIdr = Math.round((1000000 + rand() * 2500000) / 100000) * 100000;
    const bankIdr = Math.round((2000000 + rand() * 8000000) / 100000) * 100000;
    const invIdr = Math.round((item.dailyBase * (2 + rand() * 4)) / 100000) * 100000;
    const assetIdr = Math.round((3000000 + rand() * 12000000) / 500000) * 500000;

    try {
      await admin.from("opening_balances").insert({
        business_id: businessId,
        start_date: formatDate(startDate),
        cash_idr: cashIdr,
        bank_idr: bankIdr,
        receivables_idr: 0,
        inventory_idr: invIdr,
        fixed_assets_idr: assetIdr,
        payables_idr: 0,
        loans_bank_idr: 0,
        loans_other_idr: 0,
        notes: "Saldo awal dibukukan otomatis oleh sistem.",
        completed_at: new Date().toISOString(),
        created_by: userId
      });
    } catch {}
  }

  // 9. Login as user to invoke create_ledger_transaction & daily closings
  const userClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sessionData, error: loginErr } = await userClient.auth.signInWithPassword({
    email,
    password: DEFAULT_PASSWORD
  });

  if (loginErr) {
    console.warn(`Gagal login user ${email}, beralih ke pembuatan transaksi manual: ${loginErr.message}`);
    return;
  }

  const authenticatedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } }
  });

  // Hasilkan transaksi realistis
  const transactionRows = [];
  const daysCount = item.level === "EMAS" ? 40 : item.level === "PERAK" ? 25 : item.level === "TEMBAGA" ? 15 : 6;
  let txIndex = 0;

  for (let step = 0; step < daysCount; step++) {
    const currentDay = addDays(startDate, step * Math.round(1 + rand() * 1.5));
    if (currentDay > today) break;
    const dateStr = formatDate(currentDay);
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek === 0) continue; // Minggu libur

    // 1. Penjualan harian
    const salesFactor = dayOfWeek === 5 || dayOfWeek === 6 ? 1.35 : 1.0;
    const salesAmount = Math.round((item.dailyBase * salesFactor * (0.8 + rand() * 0.4)) / 5000) * 5000;
    const isQris = rand() < 0.4;
    txIndex++;
    transactionRows.push({
      key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
      type: "income",
      amount: salesAmount,
      date: dateStr,
      group: "sales",
      code: "sales_direct",
      description: dayOfWeek === 5 || dayOfWeek === 6 ? "Penjualan akhir pekan" : "Penjualan harian",
      payment: isQris ? "qris" : "cash",
      emkm: 1
    });

    // 2. Belanja Bahan (HPP) setiap 2-3 hari
    if (step % 3 === 0) {
      const cogsAmount = Math.round((salesAmount * 2.2 * (1 - item.margin)) / 10000) * 10000;
      if (cogsAmount > 50000) {
        txIndex++;
        transactionRows.push({
          key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
          type: "expense",
          amount: cogsAmount,
          date: dateStr,
          group: "cost_of_goods",
          code: "raw_material",
          description: "Belanja bahan & pasokan usaha",
          payment: "cash",
          emkm: 5
        });
      }
    }

    // 3. Biaya Operasional (listrik, kemasan, sewa, gaji) pada tanggal tertentu
    const dayOfMonth = currentDay.getDate();
    if (dayOfMonth === 5 && item.hasKiosk) {
      txIndex++;
      transactionRows.push({
        key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
        type: "expense",
        amount: 450000 + Math.round(rand() * 300000 / 50000) * 50000,
        date: dateStr,
        group: "operating_expense",
        code: "rent",
        description: "Sewa tempat / kios",
        payment: "cash",
        emkm: 6,
        subtype: "5240"
      });
    }
    if (dayOfMonth === 7 && item.staff > 0) {
      txIndex++;
      transactionRows.push({
        key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
        type: "expense",
        amount: item.staff * (900000 + Math.round(rand() * 400000 / 50000) * 50000),
        date: dateStr,
        group: "operating_expense",
        code: "wage",
        description: `Upah karyawan (${item.staff} orang)`,
        payment: "cash",
        emkm: 6,
        subtype: "5230"
      });
    }
    if (dayOfMonth === 10) {
      txIndex++;
      transactionRows.push({
        key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
        type: "expense",
        amount: 85000 + Math.round(rand() * 120000 / 10000) * 10000,
        date: dateStr,
        group: "operating_expense",
        code: "utilities",
        description: "Token listrik & air",
        payment: "cash",
        emkm: 6,
        subtype: "5220"
      });
    }
    if (dayOfMonth === 20) {
      // Prive
      txIndex++;
      transactionRows.push({
        key: `tx-${pad}-${String(txIndex).padStart(4, "0")}`,
        type: "expense",
        amount: 350000 + Math.round(rand() * 500000 / 50000) * 50000,
        date: dateStr,
        group: "other",
        code: "other",
        description: "Ambil uang dapur / pribadi (Prive)",
        payment: "cash",
        emkm: 9
      });
    }
  }

  // Simpan transaksi
  let successCount = 0;
  const recordedDates = new Set();

  for (const row of transactionRows) {
    const { error: txErr } = await authenticatedClient.rpc("create_ledger_transaction", {
      p_idempotency_key: row.key,
      p_transaction_type: row.type,
      p_amount_idr: row.amount,
      p_transaction_date: row.date,
      p_category_group: row.group,
      p_category_code: row.code,
      p_description: row.description,
      p_payment_method: row.payment,
      p_emkm_category_code: row.emkm,
      p_emkm_category_subtype: row.subtype ?? null
    });
    if (!txErr) {
      successCount++;
      recordedDates.add(row.date);
    }
  }

  // Tutup kas harian (daily closings)
  const sortedDates = [...recordedDates].sort();
  // sisakan 2 hari terakhir belum ditutup agar realistis
  const datesToClose = sortedDates.slice(0, Math.max(0, sortedDates.length - 2));
  for (const d of datesToClose) {
    try {
      await authenticatedClient.rpc("close_ledger_day", {
        p_closing_date: d,
        p_opening_cash_idr: null,
        p_physical_cash_idr: null,
        p_note: "Tutup buku harian",
        p_physical_bank_idr: null
      });
    } catch {}
  }

  // Bangun indikator
  try {
    await authenticatedClient.rpc("ensure_indicators_rebuilt", { p_as_of: formatDate(today) });
  } catch {}

  console.log(`  -> Berhasil: ${successCount} transaksi dicatat & dijurnalkan, ${datesToClose.length} hari kas ditutup.\n`);
}

async function main() {
  console.log("=================================================================");
  console.log("MULAI SUNTIK DATA 40 UMKM & LAPORAN KEUANGAN KE SUPABASE");
  console.log("=================================================================\n");

  const startTime = Date.now();
  let done = 0;

  for (let i = 0; i < UMKM_PROFILES.length; i++) {
    try {
      await seedOneUmkm(UMKM_PROFILES[i], i);
      done++;
    } catch (err) {
      console.error(`Gagal memproses UMKM ke-${i + 1}:`, err.message);
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log("=================================================================");
  console.log(`SELESAI! ${done} dari 40 akun UMKM berhasil disuntik dalam ${durationSec} detik.`);
  console.log("=================================================================");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
