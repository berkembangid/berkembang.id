-- ============================================================
-- DATABASE BACKUP - berkembang.id (Supabase)
-- Project ID : ggudmwfhaqoqcguwgdac
-- Region     : ap-southeast-1 (Singapore)
-- DB Version : PostgreSQL 17.6.1
-- Backup Date: 2026-08-26 09:40 WIB
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- ============================================================
-- SCHEMA
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: audit_logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          bigint NOT NULL,
    "timestamp" timestamptz DEFAULT now(),
    user_email  text NOT NULL,
    action      text NOT NULL,
    details     text,
    status      text DEFAULT 'success'::text,
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TABLE: documents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
    id           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL,
    name         text NOT NULL,
    doc_type     text NOT NULL,
    storage_path text NOT NULL,
    file_url     text,
    file_size    bigint,
    mime_type    text,
    status       text DEFAULT 'uploaded'::text,
    ai_notes     text,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now(),
    CONSTRAINT documents_pkey PRIMARY KEY (id),
    CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents USING btree (user_id);

-- ------------------------------------------------------------
-- TABLE: institutions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institutions (
    id             bigint NOT NULL,
    name           text NOT NULL,
    type           text NOT NULL,
    programs_count integer DEFAULT 1,
    active         boolean DEFAULT true,
    created_at     timestamptz DEFAULT now(),
    CONSTRAINT institutions_pkey PRIMARY KEY (id)
);
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TABLE: mitra
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mitra (
    id           bigint NOT NULL,
    name         text NOT NULL,
    type         text NOT NULL,
    coverage     text NOT NULL,
    umkm_managed integer DEFAULT 0,
    active       boolean DEFAULT true,
    created_at   timestamptz DEFAULT now(),
    CONSTRAINT mitra_pkey PRIMARY KEY (id)
);
ALTER TABLE public.mitra ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TABLE: profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id              uuid NOT NULL,
    nama_usaha      text,
    sektor_usaha    text,
    lokasi          text,
    role            text DEFAULT 'umkm'::text,
    created_at      timestamptz DEFAULT now(),
    name            text,
    email           text,
    nama_institusi  text,
    jenis_institusi text,
    nama_contact    text,
    phone           text,
    readiness_score integer DEFAULT 50,
    konsistensi_days integer DEFAULT 0,
    status          text DEFAULT 'active'::text,
    nib             text,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['umkm'::text, 'institution'::text, 'admin'::text]))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TABLE: readiness_analyses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.readiness_analyses (
    id                   uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL,
    total_score          integer DEFAULT 0,
    legalitas_score      integer DEFAULT 0,
    konsistensi_score    integer DEFAULT 0,
    kelengkapan_score    integer DEFAULT 0,
    aktivitas_score      integer DEFAULT 0,
    data_pendukung_score integer DEFAULT 0,
    status_label         text DEFAULT 'Belum Dianalisis'::text,
    gaps                 jsonb DEFAULT '[]'::jsonb,
    recommendations      jsonb DEFAULT '[]'::jsonb,
    ai_summary           text,
    confidence_pct       integer DEFAULT 0,
    analyzed_at          timestamptz DEFAULT now(),
    created_at           timestamptz DEFAULT now(),
    CONSTRAINT readiness_analyses_pkey PRIMARY KEY (id),
    CONSTRAINT readiness_analyses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.readiness_analyses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_readiness_analyses_user_id ON public.readiness_analyses USING btree (user_id);

-- ------------------------------------------------------------
-- TABLE: rules_config
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rules_config (
    id         bigint NOT NULL,
    version    text NOT NULL,
    weights    jsonb NOT NULL,
    thresholds jsonb NOT NULL,
    is_active  boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    created_by text DEFAULT 'admin@berkembang.id'::text,
    CONSTRAINT rules_config_pkey PRIMARY KEY (id)
);
ALTER TABLE public.rules_config ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- TABLE: transactions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id         bigint NOT NULL,
    user_id    uuid,
    item       text NOT NULL,
    qty        text,
    type       text NOT NULL,
    nominal    numeric NOT NULL,
    kategori   text NOT NULL,
    tanggal    date NOT NULL DEFAULT CURRENT_DATE,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT transactions_pkey PRIMARY KEY (id),
    CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT transactions_type_check CHECK (type = ANY (ARRAY['masuk'::text, 'keluar'::text]))
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- RLS POLICIES
-- ============================================================

-- audit_logs
CREATE POLICY "Enable read access for audit_logs"   ON public.audit_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for audit_logs" ON public.audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for audit_logs" ON public.audit_logs FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete access for audit_logs" ON public.audit_logs FOR DELETE TO anon, authenticated USING (true);

-- documents
CREATE POLICY "Users can manage own documents" ON public.documents FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- institutions
CREATE POLICY "Enable read access for institutions"   ON public.institutions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for institutions" ON public.institutions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for institutions" ON public.institutions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete access for institutions" ON public.institutions FOR DELETE TO anon, authenticated USING (true);

-- mitra
CREATE POLICY "Enable read access for mitra"   ON public.mitra FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for mitra" ON public.mitra FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for mitra" ON public.mitra FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete access for mitra" ON public.mitra FOR DELETE TO anon, authenticated USING (true);

-- profiles
CREATE POLICY "Enable read access for all profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for profiles"          ON public.profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update for profiles"          ON public.profiles FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete for profiles"          ON public.profiles FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Allow all select profiles"           ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Allow all update profiles"           ON public.profiles FOR UPDATE TO public USING (true);
CREATE POLICY "Users can view their own profile"    ON public.profiles FOR SELECT TO public USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile"  ON public.profiles FOR UPDATE TO public USING (auth.uid() = id);

-- readiness_analyses
CREATE POLICY "Users can manage own analyses" ON public.readiness_analyses FOR ALL TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- rules_config
CREATE POLICY "Enable read access for rules_config"   ON public.rules_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for rules_config" ON public.rules_config FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for rules_config" ON public.rules_config FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete access for rules_config" ON public.rules_config FOR DELETE TO anon, authenticated USING (true);

-- transactions
CREATE POLICY "Enable read access for transactions"        ON public.transactions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for transactions"      ON public.transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for transactions"      ON public.transactions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Enable delete access for transactions"      ON public.transactions FOR DELETE TO anon, authenticated USING (true);
CREATE POLICY "Users can view their own transactions"      ON public.transactions FOR SELECT TO public USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own transactions"    ON public.transactions FOR INSERT TO public WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions"    ON public.transactions FOR UPDATE TO public USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions"    ON public.transactions FOR DELETE TO public USING (auth.uid() = user_id);


-- ============================================================
-- DATA
-- ============================================================

-- ------------------------------------------------------------
-- DATA: profiles (16 rows)
-- ------------------------------------------------------------
INSERT INTO public.profiles (id, nama_usaha, sektor_usaha, lokasi, role, created_at, name, email, nama_institusi, jenis_institusi, nama_contact, phone, readiness_score, konsistensi_days, status, nib) VALUES
('1fe29a97-0808-4236-9ce0-ee0f586d5ac7', 'Warung Nasi Goreng Pak Pur', 'Kuliner', 'Depok', 'umkm', '2026-07-21 07:26:16.581355+00', 'Warung Nasi Goreng Pak Pur', NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('8fb47cb7-a06d-4af7-985c-0e6b42c62b4b', '', '', '', 'admin', '2026-07-21 07:32:18.713524+00', 'User', NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('5c07ca09-3f1b-4d31-a502-4aa61bb733b5', '', '', '', 'institution', '2026-07-21 07:46:40.694763+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('f6583c95-8f07-45b1-bf09-bbb25155e769', 'Pixalads', 'Jasa', 'Depok', 'umkm', '2026-07-21 09:14:17.498249+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('6a032f21-9eb2-4bc0-90c8-d88025dc7789', 'Kripik Tempe Mas Handoko', 'Kuliner', 'Depok', 'umkm', '2026-07-22 05:01:04.152207+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('32886dd3-44a0-4706-b3ab-f425137497b6', 'toko alesha n alif', 'Kerajinan', 'depok Jawa barat', 'umkm', '2026-07-22 11:23:04.162954+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('3edeed0b-d7f4-4791-97a2-ca21097141ab', 'Mouw Dimsum', 'Kuliner', 'Kota Depok', 'umkm', '2026-07-23 12:40:09.212454+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('b540ab9d-876b-4b47-b504-0f13269795ad', 'Bundies Cake', 'Kuliner', 'Kota Bandung', 'umkm', '2026-07-24 06:34:41.083672+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('96476fa0-dec1-4bff-abea-87f0b3537bc4', 'utyuy', 'Fashion', 'Kabupaten Cianjur', 'umkm', '2026-07-24 18:47:05.932741+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('f8678bc0-66a2-4c5d-a7bb-930f4e965cb4', 'dewi', 'Kuliner', 'Kota Jakarta Selatan', 'umkm', '2026-07-24 18:48:05.656987+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('e2c3987c-2d88-4f35-8bbf-84e00df5015f', 'Warung Pecel Lele Bu Idah', 'Kuliner', 'Kota Depok', 'umkm', '2026-07-25 10:34:07.818474+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('3eb845e6-876e-4838-b53d-c32111a8c7fc', 'Dimsum Mouw', 'Kuliner', 'Kota Depok', 'umkm', '2026-07-25 11:54:40.004954+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('a63d4817-74da-4838-a384-3ae022bec694', 'Gyvsie Ornament', 'Kerajinan', 'Kota Bandung', 'umkm', '2026-07-26 15:53:10.848663+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('c03851df-8085-452c-9f93-8e2d5013467a', 'Gyvsie Ornament', 'Kerajinan', 'Kota Bandung', 'umkm', '2026-08-04 12:21:51.028948+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('0444f480-980a-4276-96d2-41ffa660b6ea', 'Pempek Lohan', 'Kuliner', 'Kota Depok', 'umkm', '2026-08-05 03:12:22.063583+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL),
('44a0be4b-38b2-4599-8621-76dcd936389a', '', '', '', 'admin', '2026-08-24 04:35:12.095095+00', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- DATA: transactions (19 rows)
-- ------------------------------------------------------------
INSERT INTO public.transactions (id, user_id, item, qty, type, nominal, kategori, tanggal, created_at) VALUES
(1,  '1fe29a97-0808-4236-9ce0-ee0f586d5ac7', 'Nasi Goreng Gila', '1', 'masuk', 15000, 'Penjualan', '2026-07-21', '2026-07-21 12:16:28.458914+00'),
(2,  '1fe29a97-0808-4236-9ce0-ee0f586d5ac7', 'Bumbu', '1', 'keluar', 10000, 'Bahan', '2026-07-21', '2026-07-21 12:17:35.381937+00'),
(3,  '6a032f21-9eb2-4bc0-90c8-d88025dc7789', 'KERIPIK Tempe di alun alun', '40 ', 'masuk', 30000, 'Penjualan', '2026-07-22', '2026-07-22 05:09:15.31092+00'),
(4,  '6a032f21-9eb2-4bc0-90c8-d88025dc7789', 'Penjualan Harian', '1 paket', 'masuk', 300000, 'Penjualan', '2026-07-22', '2026-07-22 05:10:16.264838+00'),
(5,  '6a032f21-9eb2-4bc0-90c8-d88025dc7789', 'Bahan Baku Usaha', '1 paket', 'keluar', 100000, 'Bahan', '2026-07-22', '2026-07-22 05:10:16.264838+00'),
(6,  '32886dd3-44a0-4706-b3ab-f425137497b6', 'tas jumlah 2', '2', 'masuk', 900000, 'Penjualan', '2026-07-22', '2026-07-22 11:28:42.370275+00'),
(7,  '32886dd3-44a0-4706-b3ab-f425137497b6', 'Jual porsi makanan , beli bahan', '20 porsi', 'masuk', 300000, 'Bahan', '2026-07-22', '2026-07-22 11:30:49.648337+00'),
(8,  'e2c3987c-2d88-4f35-8bbf-84e00df5015f', 'pecel ayam', '5 porsi', 'masuk', 75000, 'Penjualan', '2026-07-25', '2026-07-25 10:35:59.192711+00'),
(9,  'e2c3987c-2d88-4f35-8bbf-84e00df5015f', 'Bumbu', '1 barang', 'keluar', 15000, 'Bahan', '2026-07-25', '2026-07-25 10:36:20.219683+00'),
(10, 'e2c3987c-2d88-4f35-8bbf-84e00df5015f', 'Pecel ayam', '10 porsi', 'masuk', 175000, 'Penjualan', '2026-07-25', '2026-07-25 10:37:00.94726+00'),
(11, '3eb845e6-876e-4838-b53d-c32111a8c7fc', 'Dimsum Set 20', '2 Set', 'masuk', 75000, 'Penjualan', '2026-07-25', '2026-07-25 11:57:00.782724+00'),
(12, '3eb845e6-876e-4838-b53d-c32111a8c7fc', 'Torch', '1 pcs', 'keluar', 25000, 'Lain-lain', '2026-07-25', '2026-07-25 11:57:17.885818+00'),
(13, '3eb845e6-876e-4838-b53d-c32111a8c7fc', 'dim sumau original mentai', '1', 'masuk', 30000, 'Penjualan', '2026-07-25', '2026-07-25 12:00:14.525068+00'),
(14, 'a63d4817-74da-4838-a384-3ae022bec694', 'Pot Bunga Terjual Pot dengan Harga', '1 paket', 'masuk', 500000, 'Penjualan', '2026-07-26', '2026-07-26 15:55:55.879308+00'),
(15, '3eb845e6-876e-4838-b53d-c32111a8c7fc', 'Ayam Goreng', '15 porsi', 'masuk', 100000, 'Penjualan', '2026-08-04', '2026-08-04 12:25:03.259914+00'),
(16, '3eb845e6-876e-4838-b53d-c32111a8c7fc', 'bahan makanan', '1', 'keluar', 100000, 'Bahan', '2026-08-04', '2026-08-04 12:27:02.368857+00'),
(17, 'f6583c95-8f07-45b1-bf09-bbb25155e769', 'Ada pesanan paket ayam goreng seharga', '1 paket', 'masuk', 22000, 'Bahan', '2026-08-04', '2026-08-04 12:35:24.843028+00'),
(18, '1fe29a97-0808-4236-9ce0-ee0f586d5ac7', 'ayam', '15 porsi', 'masuk', 150000, 'Penjualan', '2026-08-05', '2026-08-05 01:51:43.343265+00'),
(19, '3edeed0b-d7f4-4791-97a2-ca21097141ab', 'Pemasukan Usaha', '1 paket', 'masuk', 50000, 'Penjualan', '2026-08-19', '2026-08-19 15:05:19.88487+00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- DATA: audit_logs (5 rows)
-- ------------------------------------------------------------
INSERT INTO public.audit_logs (id, "timestamp", user_email, action, details, status, created_at) VALUES
(1, '2026-07-22 04:13:55.42867+00', 'admin@berkembang.id', 'UPDATE_RULES_CONFIG', 'Bobot konsistensi: 30->35, legalitas: 30->25', 'success', '2026-07-22 04:13:55.42867+00'),
(2, '2026-07-22 04:13:55.42867+00', 'institution@bri.co.id', 'REQUEST_DOSSIER', 'UMKM ID #1247, program: KUR Mikro', 'success', '2026-07-22 04:13:55.42867+00'),
(3, '2026-07-22 04:13:55.42867+00', 'admin@berkembang.id', 'OVERRIDE_SCORE', 'UMKM ID #892, skor: 45->58, alasan: Data diperbarui', 'success', '2026-07-22 04:13:55.42867+00'),
(4, '2026-07-22 04:13:55.42867+00', 'system', 'RECALCULATE_READINESS', 'Batch recalculation: 1,247 UMKM diproses', 'success', '2026-07-22 04:13:55.42867+00'),
(5, '2026-08-24 04:35:12.573006+00', 'admin@berkembang.id', 'CREATE_ADMIN_ACCOUNT', 'Pembuatan Akun Admin Baru: harsya (harsya@gmail.com)', 'success', '2026-08-24 04:35:12.573006+00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- DATA: rules_config (1 row)
-- ------------------------------------------------------------
INSERT INTO public.rules_config (id, version, weights, thresholds, is_active, created_at, created_by) VALUES
(1, 'v1', '{"kas": 35, "legalitas": 25, "stabilitas": 5, "konsistensi": 35}', '{"maxDailyIncome": 2000000, "maxDailyExpense": 500000}', true, '2026-07-22 04:13:55.42867+00', 'admin@berkembang.id')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- DATA: documents (1 row)
-- ------------------------------------------------------------
INSERT INTO public.documents (id, user_id, name, doc_type, storage_path, file_url, file_size, mime_type, status, ai_notes, created_at, updated_at) VALUES
('41af9fe8-fdf3-4d12-8449-c64ea0607fd1', '0444f480-980a-4276-96d2-41ffa660b6ea', 'KTP Muchtar.jpg', 'ktp', '0444f480-980a-4276-96d2-41ffa660b6ea/ktp_1785899629585.jpg', 'https://ggudmwfhaqoqcguwgdac.supabase.co/storage/v1/object/public/documents/0444f480-980a-4276-96d2-41ffa660b6ea/ktp_1785899629585.jpg', 243601, 'image/jpeg', 'uploaded', NULL, '2026-08-05 03:13:51.905768+00', '2026-08-05 03:13:51.905768+00')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- DATA: institutions  -> 0 rows (empty)
-- DATA: mitra         -> 0 rows (empty)
-- DATA: readiness_analyses -> 0 rows (empty)
-- ------------------------------------------------------------

-- ============================================================
-- MIGRATIONS LOG
-- ============================================================
-- 20260723050733  enable_rls_all_tables

-- ============================================================
-- END OF BACKUP
-- ============================================================
