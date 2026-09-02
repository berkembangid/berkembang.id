import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const expectedMigrations = [
  "0001_identity_business_membership.sql",
  "0002_programs_enrollments.sql",
  "0003_ledger_captures.sql",
  "0004_private_documents.sql",
  "0005_readiness_missions.sql",
  "0006_consent_dossiers.sql",
  "0007_ai_notifications_audit.sql",
  "0008_indexes_constraints.sql",
  "0009_rls_policies.sql",
  "0010_storage_policies.sql",
  "0011_backfill_existing_data.sql",
  "0012_compatibility_views.sql",
  "0013_identity_membership_rls.sql",
  "0014_storage_object_policies.sql",
  "0015_voice_capture_lifecycle.sql",
  "0016_private_document_lifecycle.sql",
  "0017_document_extraction_completion.sql",
  "0018_document_ocr_owner_confirmation.sql",
  "0019_document_reading_consent_policy.sql",
  "0020_document_extraction_retry.sql",
  "0021_ledger_report_daily_closing.sql",
  "0022_readiness_mission_engine.sql",
  "0023_consent_verified_business_profile.sql",
  "0024_umkm_owner_without_membership.sql",
  "0025_umkm_roleless_internal_plumbing.sql",
  "0026_auto_provision_umkm_business.sql",
  "0027_umkm_complete_roleless_access.sql",
  "0028_fix_capture_roleless_functions.sql",
  "0029_accounting_journal_foundation.sql",
  "0030_restore_business_isolation.sql",
  "0031_accounting_period_reports.sql",
  "0032_opening_balance_correction.sql",
  "0033_fixed_asset_threshold.sql",
  "0034_general_ledger_ordering.sql",
  "0035_tax_estimate.sql",
  "0036_indicator_monthly.sql",
  "0037_pending_reminders.sql",
  "0038_sector_aware_templates.sql",
  "0039_capture_text_only_path.sql",
  "0040_asset_keywords.sql",
  "0041_document_cabinet.sql",
];

describe("WP-03 migration contract", () => {
  it("keeps the playbook migration order exact", () => {
    const actual = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
    expect(actual).toEqual(expectedMigrations);
  });

  it("contains every core table and no destructive DDL", () => {
    const sql = expectedMigrations
      .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
      .join("\n")
      .toLowerCase();
    const coreTables = [
      "profiles", "businesses", "business_members", "institutions", "institution_members",
      "programs", "program_enrollments", "transaction_captures", "transactions", "daily_closings", "transaction_changes",
      "documents", "document_versions", "document_extractions", "document_verifications",
      "document_upload_sessions",
      "readiness_rule_sets", "readiness_score_snapshots", "readiness_score_components", "missions",
      "business_missions", "ai_jobs", "ai_runs", "ai_feedback", "dossier_requests", "consent_grants",
      "dossiers", "dossier_items", "dossier_access_events", "notifications", "audit_events",
      "platform_admins",
    ];
    for (const table of coreTables) expect(sql).toContain(`public.${table}`);
    expect(sql).not.toMatch(/\bdrop\s+(table|column|schema)\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
  });

  it("ships backfill verification and compatibility views", () => {
    const backfill = readFileSync(join(migrationDirectory, "0011_backfill_existing_data.sql"), "utf8");
    const compatibility = readFileSync(join(migrationDirectory, "0012_compatibility_views.sql"), "utf8");
    expect(backfill).toContain("migration_verification_results");
    expect(backfill).toContain("on conflict");
    expect(compatibility).toContain("security_invoker = true");
  });

  it("keeps the 0028 capture job insert syntactically closed before returning", () => {
    const repair = readFileSync(
      join(migrationDirectory, "0028_fix_capture_roleless_functions.sql"),
      "utf8",
    );
    expect(repair).toMatch(
      /jsonb_build_object\('captureId', v_capture\.id\),\s*3\s*\)\s*returning \* into v_job;/,
    );
  });
});

describe("SAK EMKM accounting foundation contract (0029)", () => {
  const accounting = readFileSync(
    join(migrationDirectory, "0029_accounting_journal_foundation.sql"),
    "utf8",
  );

  it("creates the journal tables, chart of accounts, and category templates", () => {
    for (const table of [
      "public.coa_accounts",
      "public.category_templates",
      "public.counterparties",
      "public.journal_entries",
      "public.journal_lines",
    ]) {
      expect(accounting).toContain(`create table if not exists ${table}`);
      expect(accounting).toContain(`alter table ${table} enable row level security`);
    }
  });

  it("seeds every SAK EMKM account code the reports depend on", () => {
    for (const code of [
      "1100", "1200", "1300", "1400", "1500", "1600", "1690",
      "2100", "2200", "2300", "2400",
      "3100", "3200", "3300",
      "4100", "4200",
      "5100", "5210", "5220", "5230", "5240", "5250", "5260", "5270", "5280", "5290",
      "5310", "5400",
    ]) {
      expect(accounting).toContain(`('${code}', '`);
    }
  });

  it("seeds all ten warung categories for the pilot sector", () => {
    const templates = accounting.match(/\('PERDAGANGAN_KULINER', *\d+,/g) ?? [];
    expect(templates.length).toBe(19);
    for (const category of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(accounting).toMatch(
        new RegExp(`\\('PERDAGANGAN_KULINER', *${category},`),
      );
    }
  });

  it("keeps the journal balanced and immutable through triggers", () => {
    expect(accounting).toContain("JOURNAL_ENTRY_UNBALANCED");
    expect(accounting).toContain("JOURNAL_ENTRY_TOO_FEW_LINES");
    expect(accounting).toContain("JOURNAL_IS_IMMUTABLE");
    expect(accounting).toMatch(/create constraint trigger journal_lines_balanced[\s\S]*deferrable initially deferred/);
    expect(accounting).toMatch(/create trigger journal_entries_immutable\s+before update or delete/);
    expect(accounting).toMatch(/create trigger journal_lines_immutable\s+before update or delete/);
  });

  it("fails hard when a category template is missing instead of guessing an account", () => {
    expect(accounting).toContain("CATEGORY_TEMPLATE_NOT_FOUND");
    expect(accounting).not.toMatch(/coalesce\(v_template\./);
  });

  it("isolates accounting tables with a strict access helper, not the roleless fallback", () => {
    expect(accounting).toContain("private.accounting_business_access");
    const policies = accounting.match(/create policy \w+ on public\.(journal_\w+|counterparties)[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(3);
    for (const policy of policies) expect(policy).not.toContain("private.business_role");
  });

  it("exposes the read models the Tahap A reports need", () => {
    expect(accounting).toContain("create view public.v_general_ledger");
    expect(accounting).toContain("security_invoker = true");
    expect(accounting).toContain("function public.fn_trial_balance(p_business_id uuid, p_as_of date)");
    expect(accounting).toContain("function public.fn_income_statement(p_business_id uuid, p_date_from date, p_date_to date)");
    expect(accounting).toContain("function public.fn_warung_monthly(p_business_id uuid, p_date_from date, p_date_to date)");
  });

  it("backfills legacy transactions and asserts the totals did not drift", () => {
    expect(accounting).toContain("needs_reclass = true");
    expect(accounting).toContain("BACKFILL_TOTAL_DRIFT");
    expect(accounting).toContain("BACKFILL_UNPOSTED_TRANSACTIONS");
    expect(accounting).toContain("BACKFILL_UNBALANCED_ENTRIES");
  });

  it("repairs the 0027 capture confirmation that wrote columns that do not exist", () => {
    const confirmation = accounting.slice(
      accounting.indexOf("create or replace function public.confirm_transaction_capture"),
    );
    expect(confirmation).toContain("fn_post_transaction_journal");
    // Tiga kolom yang tidak pernah ada di skema dan membuat 0027 gagal 42703.
    expect(confirmation).not.toContain("capture_item_index");
    expect(confirmation).not.toContain("draft_items");
    expect(confirmation).not.toMatch(/^\s+profile_id,$/m);
    expect(confirmation).not.toMatch(/result = coalesce\(result/);
    expect(confirmation).toContain("draft_payload = p_items");
  });

  it("never reads OLD from an insert-only balance trigger", () => {
    expect(accounting).not.toMatch(/coalesce\(new\.entry_id, old\.entry_id\)/);
  });
});

describe("WP-04 identity and RLS contract", () => {
  it("enables RLS, protects controlled membership, and defines storage policies", () => {
    const identityRls = readFileSync(
      join(migrationDirectory, "0013_identity_membership_rls.sql"),
      "utf8",
    ).toLowerCase();
    const storageRls = readFileSync(
      join(migrationDirectory, "0014_storage_object_policies.sql"),
      "utf8",
    ).toLowerCase();

    expect(identityRls).toContain("platform_admins");
    expect(identityRls).toContain("enable row level security");
    expect(identityRls).toContain("protect_business_membership_authority");
    expect(identityRls).toContain("protect_institution_membership_authority");
    expect(identityRls).toContain("private.has_active_consent");
    expect(identityRls).toContain("revoke all on all tables in schema public from anon, authenticated");
    expect(storageRls).not.toContain("alter table storage.objects enable row level security");
    expect(storageRls).toContain("hosted supabase owns storage.objects");
    expect(storageRls).toContain("documents_owner_select");
    expect(storageRls).toContain("split_part(name, '/', 1) = (select auth.uid())::text");
  });

  it("removes metadata, email-prefix, and profile-role authority from redirects", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    const login = readFileSync(join(process.cwd(), "app", "auth", "login", "page.tsx"), "utf8");
    const authorization = readFileSync(
      join(process.cwd(), "lib", "auth", "authorization.ts"),
      "utf8",
    );

    expect(proxy).not.toContain("user_metadata?.role");
    expect(proxy).not.toMatch(/email.*startsWith/);
    expect(proxy).not.toContain('.from("profiles")');
    expect(proxy).toContain('url.searchParams.set("error", "auth_unavailable")');
    expect(login).not.toContain("user_metadata?.role");
    expect(login).not.toContain('.from("profiles")');
    expect(authorization).toContain('.from("platform_admins")');
    expect(authorization).toContain('.from("institution_members")');
    // UMKM tanpa role: kepemilikan usaha ditentukan dari profil, bukan keanggotaan.
    expect(authorization).toContain('.from("businesses")');
    expect(authorization).not.toContain('.from("business_members")');
  });

  it("keeps privileged writes behind authenticated server routes", () => {
    const adminRoute = readFileSync(
      join(process.cwd(), "app", "api", "admin", "operations", "route.ts"),
      "utf8",
    );
    const signedUrlRoute = readFileSync(
      join(process.cwd(), "app", "api", "documents", "signed-url", "route.ts"),
      "utf8",
    );
    const adminPages = readdirSync(join(process.cwd(), "app", "(admin)", "admin"), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
      .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
      .join("\n");

    expect(adminRoute).toContain("getEffectivePortalRole");
    expect(adminRoute).toContain('!== "admin"');
    expect(adminRoute).toContain("createServiceRoleClient");
    expect(adminRoute).toContain("operationSchema.safeParse");
    expect(signedUrlRoute).toContain("createDocumentDownloadUrl");
    expect(signedUrlRoute).toContain('Deprecation: "true"');
    expect(adminPages).not.toMatch(/\.insert\(|\.update\(|\.delete\(|signUp\(/);
  });

  it("never exposes the service-role key through a public environment name", () => {
    const sourceFiles = [
      join(process.cwd(), ".env.example"),
      join(process.cwd(), "lib", "supabase", "admin.ts"),
      join(process.cwd(), "app", "api", "admin", "operations", "route.ts"),
      join(process.cwd(), "app", "api", "documents", "signed-url", "route.ts"),
    ];
    const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*SERVICE[A-Z0-9_]*/);
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("WP-05 voice-to-ledger contract", () => {
  it("locks capture state and confirms ledger data atomically through database functions", () => {
    const lifecycle = readFileSync(
      join(migrationDirectory, "0015_voice_capture_lifecycle.sql"),
      "utf8",
    ).toLowerCase();

    expect(lifecycle).toContain("create_transaction_capture");
    expect(lifecycle).toContain("schedule_capture_processing");
    expect(lifecycle).toContain("for update");
    expect(lifecycle).toContain("confirm_transaction_capture");
    expect(lifecycle).toContain("insert into public.transactions");
    expect(lifecycle).toContain("transaction_capture_confirmed");
    expect(lifecycle).toContain("readiness_recalculation");
    expect(lifecycle).toContain("revoke insert, update, delete on public.transaction_captures from authenticated");
    expect(lifecycle).toContain("confirmation_idempotency_key");
  });

  it("ships the five authenticated lifecycle endpoints with structured errors", () => {
    const routeFiles = [
      join(process.cwd(), "app", "api", "v1", "captures", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "captures", "[id]", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "captures", "[id]", "process", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "captures", "[id]", "confirm", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "captures", "[id]", "cancel", "route.ts"),
    ];
    const routes = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    const errors = readFileSync(
      join(process.cwd(), "modules", "ledger", "capture-errors.ts"),
      "utf8",
    );

    for (const file of routeFiles) expect(() => readFileSync(file, "utf8")).not.toThrow();
    expect(routes.match(/getAuthenticatedUser/g)?.length).toBeGreaterThanOrEqual(5);
    expect(routes).toContain("captureValidationErrorResponse");
    expect(errors).toContain("requestId: crypto.randomUUID()");
    expect(errors).toContain("CAPTURE_ALREADY_CONFIRMED");
  });

  it("uses provider adapters, durable jobs, private upload, and persisted review UI", () => {
    const providers = readFileSync(
      join(process.cwd(), "modules", "ai", "capture-providers.ts"),
      "utf8",
    );
    const worker = readFileSync(
      join(process.cwd(), "modules", "ledger", "capture-worker.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "app", "(umkm)", "umkm", "catat", "page.tsx"),
      "utf8",
    );

    expect(providers).toContain("interface TranscriptionProvider");
    expect(providers).toContain("interface ExtractionProvider");
    expect(worker).toContain("processQueuedCaptureJob");
    expect(worker).toContain("Capture AI job attempt failed");
    expect(page).toContain("ACTIVE_CAPTURE_STORAGE_KEY");
    expect(page).toContain("uploadToSignedUrl");
    expect(page).toContain("confirmCapture");
    expect(page).not.toContain('/api/ai/transcribe');
    expect(page).not.toContain("saveConfirmedTransactions");
  });
});

describe("WP-06 private-document contract", () => {
  it("reserves server-selected paths, versions atomically, and retires permanent URLs", () => {
    const lifecycle = readFileSync(
      join(migrationDirectory, "0016_private_document_lifecycle.sql"),
      "utf8",
    ).toLowerCase();
    const completionFix = readFileSync(
      join(migrationDirectory, "0017_document_extraction_completion.sql"),
      "utf8",
    ).toLowerCase();
    const ocrConfirmation = readFileSync(
      join(migrationDirectory, "0018_document_ocr_owner_confirmation.sql"),
      "utf8",
    ).toLowerCase();
    const consentPolicy = readFileSync(
      join(migrationDirectory, "0019_document_reading_consent_policy.sql"),
      "utf8",
    ).toLowerCase();
    const extractionRetry = readFileSync(
      join(migrationDirectory, "0020_document_extraction_retry.sql"),
      "utf8",
    ).toLowerCase();

    expect(lifecycle).toContain("create table if not exists public.document_upload_sessions");
    expect(lifecycle).toContain("create_document_upload_session");
    expect(lifecycle).toContain("complete_document_upload_session");
    expect(lifecycle).toContain("archive_document");
    expect(lifecycle).toContain("legacy_public_url_sha256");
    expect(lifecycle).toContain("extensions.digest");
    expect(lifecycle).toContain("file_url = null");
    expect(lifecycle).toContain("drop policy if exists documents_owner_insert");
    expect(lifecycle).toContain("revoke insert, update, delete on public.documents from authenticated");
    expect(lifecycle).toContain("document_version_uploaded");
    expect(completionFix).toContain("set status = 'succeeded'");
    expect(completionFix).toContain("document_record.doc_type <> 'nib'");
    expect(ocrConfirmation).toContain("record_document_ocr_consent");
    expect(ocrConfirmation).toContain("confirm_document_extraction");
    expect(ocrConfirmation).toContain("owner_corrected");
    expect(consentPolicy).toContain("ocr_consent_policy_version");
    expect(consentPolicy).toContain("document-reading-v1");
    expect(extractionRetry).toContain("retry_document_extraction");
    expect(extractionRetry).toContain("document_extraction_retried");
  });

  it("ships the authenticated document API and keeps sensitive writes behind it", () => {
    const routeFiles = [
      join(process.cwd(), "app", "api", "v1", "documents", "upload-session", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "versions", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "signed-url", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "archive", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "extraction-confirmation", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "documents", "[id]", "retry-extraction", "route.ts"),
    ];
    const routes = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    const page = readFileSync(
      join(process.cwd(), "app", "(umkm)", "umkm", "upload", "page.tsx"),
      "utf8",
    );
    const consentDialog = readFileSync(
      join(process.cwd(), "components", "documents", "DocumentUploadConsentDialog.tsx"),
      "utf8",
    );
    const oldExtractor = readFileSync(
      join(process.cwd(), "app", "api", "ai", "extract-nib", "route.ts"),
      "utf8",
    );

    expect(routes.match(/getAuthenticatedUser/g)?.length).toBeGreaterThanOrEqual(7);
    expect(routes).toContain("documentErrorResponse");
    expect(routes).toContain("processDocumentExtractionJob");
    expect(page).toContain("uploadToSignedUrl");
    expect(page).toContain("completeDocumentVersion");
    expect(page).toContain("confirmDocumentExtraction");
    expect(page).toContain("retryDocumentExtraction");
    expect(page).toContain("Identitas & Legalitas");
    expect(page).toContain("DocumentUploadConsentDialog");
    expect(consentDialog).toContain("Persetujuan ini hanya berlaku untuk file");
    expect(consentDialog).toContain("Saya sudah membaca dan menyetujui");
    expect(page).toContain("sha256Hex");
    expect(page).not.toMatch(/\.from\(["']documents["']\)\.(insert|update|delete)/);
    expect(oldExtractor).toContain("ENDPOINT_RETIRED");
    expect(oldExtractor).not.toContain("Math.random");
    expect(oldExtractor).not.toContain("smart-ocr-fallback");
  });

  it("keeps OCR outputs reviewable and never promotes unverified identity data", () => {
    const worker = readFileSync(
      join(process.cwd(), "modules", "documents", "document-worker.ts"),
      "utf8",
    );
    const extractors = readFileSync(
      join(process.cwd(), "modules", "documents", "document-extractors.ts"),
      "utf8",
    );
    const schema = readFileSync(
      join(process.cwd(), "modules", "documents", "document-schema.ts"),
      "utf8",
    );
    const lifecycle = readFileSync(
      join(migrationDirectory, "0016_private_document_lifecycle.sql"),
      "utf8",
    ).toLowerCase();

    expect(extractors).toContain("Jangan menebak");
    expect(schema).toContain("normalizedDigits([13])");
    expect(schema).toContain("normalizedDigits([16])");
    expect(worker).toContain("manual-review");
    expect(lifecycle).toContain("menunggu verifikasi");
    expect(lifecycle).not.toContain("update public.profiles");
  });

  it("ships the authenticated ledger, report, export, and daily-closing lifecycle", () => {
    const migration = readFileSync(
      join(migrationDirectory, "0021_ledger_report_daily_closing.sql"),
      "utf8",
    ).toLowerCase();
    const routeFiles = [
      join(process.cwd(), "app", "api", "v1", "ledger", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "ledger", "transactions", "[id]", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "ledger", "daily-closing", "route.ts"),
      join(process.cwd(), "app", "api", "v1", "ledger", "export", "route.ts"),
    ];
    const routes = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    const page = readFileSync(
      join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.transaction_changes");
    expect(migration).toContain("create_ledger_transaction");
    expect(migration).toContain("update_ledger_transaction");
    expect(migration).toContain("cancel_ledger_transaction");
    expect(migration).toContain("close_ledger_day");
    expect(migration).toContain("revoke insert,update,delete on public.transactions from authenticated");
    expect(routes.match(/getAuthenticatedUser/g)?.length).toBeGreaterThanOrEqual(4);
    expect(routes).toContain("ledgerErrorResponse");
    expect(routes).toContain("ledgerReportCsv");
    expect(page).toContain("Tutup kas hari ini");
    expect(page).toContain("Transaksi dibatalkan");
    expect(page).not.toMatch(/\.from\(["']transactions["']\)\.(insert|update|delete)/);
  });
});

describe("fixed asset minimum contract (0033)", () => {
  const migration = readFileSync(
    join(migrationDirectory, "0033_fixed_asset_threshold.sql"),
    "utf8",
  );
  const templates = readFileSync(
    join(process.cwd(), "modules", "accounting", "templates.ts"),
    "utf8",
  );

  it("keeps the database and the screen quoting the same amount", () => {
    const fromSql = migration.match(/select (\d+)::bigint;/)?.[1];
    const fromTypeScript = templates
      .match(/export const fixedAssetMinimumIdr = ([\d_]+);/)?.[1]
      ?.replaceAll("_", "");
    expect(fromSql).toBeDefined();
    expect(fromTypeScript).toBe(fromSql);
  });

  it("moves a cheap tool to a running cost inside the single posting funnel", () => {
    expect(migration).toContain("private.fixed_asset_threshold_idr()");
    expect(migration).toContain("create or replace function public.fn_post_transaction_journal");
    // Baris transaksinya ikut pindah, bukan hanya jurnalnya.
    expect(migration).toMatch(/update public\.transactions set[\s\S]*?emkm_category_code = 6/);
  });

  it("lets the confirmation screen explain before the owner saves", () => {
    const chips = readFileSync(
      join(process.cwd(), "components", "warung", "CategoryChips.tsx"),
      "utf8",
    );
    expect(chips).toContain("fixedAssetMinimumNotice");
    expect(chips).toContain("amountIdr");
  });
});

describe("Mode Akuntan contract (0034)", () => {
  const ordering = readFileSync(
    join(migrationDirectory, "0034_general_ledger_ordering.sql"),
    "utf8",
  );
  const reports = readFileSync(
    join(process.cwd(), "modules", "accounting", "reports.ts"),
    "utf8",
  );
  const routeFiles = [
    join(process.cwd(), "app", "api", "v1", "accounting", "ledger", "[accountCode]", "route.ts"),
    join(process.cwd(), "app", "api", "v1", "accounting", "export.csv", "route.ts"),
  ];
  const routes = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const page = readFileSync(
    join(process.cwd(), "app", "(umkm)", "umkm", "akuntan", "page.tsx"),
    "utf8",
  );

  it("exposes the very keys its running-balance window orders by", () => {
    // Saldo berjalan hanya bermakna kalau pembacanya bisa mengurutkan baris
    // dengan kunci yang sama persis dengan window-nya.
    expect(ordering).toContain("order by entry.entry_date, entry.posted_at, line.line_order, line.id");
    for (const column of ["entry.posted_at", "line.line_order", "line.id as line_id"]) {
      expect(ordering).toContain(column);
    }
    expect(ordering).toContain("security_invoker = true");
  });

  it("orders the ledger read the same way, not by date alone", () => {
    for (const key of ["posted_at", "line_order", "line_id"]) {
      expect(reports).toContain(`.order("${key}"`);
    }
  });

  it("ships the accountant endpoints the spec lists", () => {
    // Kedua route menolak pemanggil yang belum masuk, masing-masing sendiri.
    for (const file of routeFiles) {
      const route = readFileSync(file, "utf8");
      expect(route).toContain("getAuthenticatedUser");
      expect(route).toContain("UNAUTHENTICATED");
    }
    expect(routes).toContain("getGeneralLedger");
    expect(routes).toContain("journalCsv");
    // Berkas ini pergi ke luar, jadi ia diunduh, bukan ditampilkan mentah.
    expect(routes).toContain("attachment; filename=");
    expect(routes).toContain("X-Content-Type-Options");
  });

  it("gives the accountant screen one findable door, and keeps it out of the owner's menu", () => {
    const bankTab = readFileSync(
      join(process.cwd(), "components", "warung", "BankReportCard.tsx"),
      "utf8",
    );
    const layout = readFileSync(join(process.cwd(), "app", "(umkm)", "layout.tsx"), "utf8");

    // Satu pintu, dan pintu itu benar-benar terlihat: kartu yang bisa diketuk,
    // bukan satu kalimat di dasar halaman.
    expect(bankTab).toContain('href="/umkm/akuntan"');
    expect(bankTab).toContain("Perincian pembukuan");

    // Menu samping adalah navigasi harian pemilik warung. Layar berbahasa
    // akuntansi di sana mengajarinya bahwa ada bagian aplikasi yang tidak ia
    // mengerti -- persis yang produk ini dibangun untuk menghindarinya.
    expect(layout).not.toContain("/umkm/akuntan");

    // "Mode Warung" adalah nama internal dari spek. Ia tidak pernah muncul di
    // layar: memberi nama pada pengalaman baku justru menyiratkan ada mode
    // lain yang pemiliknya lewatkan.
    for (const file of [layout, bankTab]) {
      expect(file).not.toContain("Mode Warung");
    }
  });

  it("keeps the accountant screen read-only", () => {
    expect(page).toContain("Jurnal Umum");
    expect(page).toContain("Buku Besar");
    expect(page).toContain("Neraca Saldo");
    // Tidak ada satu pun jalur tulis dari layar ini.
    expect(page).not.toMatch(/method: "(POST|PATCH|PUT|DELETE)"/);
    expect(page).not.toMatch(/Client\(.*\{[\s\S]*method/);
  });
});

describe("income tax estimate contract (0035)", () => {
  const migration = readFileSync(join(migrationDirectory, "0035_tax_estimate.sql"), "utf8");
  const period = readFileSync(join(process.cwd(), "modules", "accounting", "period.ts"), "utf8");
  const condition = readFileSync(
    join(process.cwd(), "components", "warung", "ConditionTab.tsx"),
    "utf8",
  );

  it("keeps the rate and the exemption in one place each", () => {
    expect(migration).toContain("select 0.005::numeric");
    expect(migration).toContain("select 500000000::bigint");
    expect(migration).toContain("private.pph_final_rate()");
    expect(migration).toContain("private.pph_final_exempt_idr()");
  });

  it("taxes only the turnover above the exemption, never the whole month", () => {
    // Selisih dua angka kumulatif, bukan persentase omzet bulan berjalan.
    expect(migration).toContain(
      "floor(greatest(v_before + v_revenue - v_exempt, 0)::numeric * v_rate)::bigint",
    );
    expect(migration).toContain("floor(greatest(v_before - v_exempt, 0)::numeric * v_rate)::bigint");
  });

  it("bases the estimate on business turnover alone", () => {
    // 4100 saja. Untung dari menjual alat bekas (4200) bukan omzet warung.
    const revenue = migration.slice(migration.indexOf("function private.gross_revenue_between"));
    expect(revenue).toContain("line.account_code = '4100'");
    expect(revenue).not.toContain("'4200'");
  });

  it("lets a cancelled sale release the tax it had accrued", () => {
    expect(migration).toContain("if v_tax <> 0 then");
    expect(migration).toContain("values (v_entry_id, p_business_id, '2400', -v_tax, 0, 1)");
    // Batasan non-negatif akan mengunci pemilik pada pajak atas penjualan yang
    // tidak pernah jadi.
    expect(migration).not.toMatch(/check \([^)]*tax_idr >= 0/);
  });

  it("accrues without moving cash, so the cash flow identity survives", () => {
    expect(migration).toContain("'TAX_ESTIMATE'");
    expect(migration).toContain("'NON_KAS'");
  });

  it("posts what a report needs before the report is read, in one place", () => {
    expect(period).toContain("export async function ensurePeriodPosted");
    expect(period).toContain("ensure_depreciation_posted");
    expect(period).toContain("ensure_tax_estimated");
    expect(period.match(/await ensurePeriodPosted\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("never shows the owner a number without saying it is an estimate", () => {
    expect(condition).toContain("taxEstimateDisclaimer");
    expect(condition).toContain("taxEstimateSentence");
  });
});

describe("monthly indicator contract (0036)", () => {
  const migration = readFileSync(join(migrationDirectory, "0036_indicator_monthly.sql"), "utf8");
  const document = readFileSync(
    join(process.cwd(), "modules", "accounting", "statement-document.ts"),
    "utf8",
  );
  const period = readFileSync(join(process.cwd(), "modules", "accounting", "period.ts"), "utf8");

  it("keeps the formula version identical in the database and on the printed page", () => {
    const fromSql = migration.match(/select '([a-z0-9-]+)'::text;/)?.[1];
    const fromTypeScript = document.match(/export const indicatorFormulaVersion = "([^"]+)";/)?.[1];
    expect(fromSql).toBeDefined();
    expect(fromTypeScript).toBe(fromSql);
  });

  it("stores the indicators in a table under row level security, not a materialized view", () => {
    // Materialized view di PostgreSQL tidak tunduk RLS, sedangkan setiap
    // agregat di sistem ini wajib terisolasi per usaha.
    expect(migration).toContain("create table if not exists public.indicator_monthly");
    expect(migration).not.toMatch(/create\s+materialized\s+view/i);
    expect(migration).toContain("alter table public.indicator_monthly enable row level security");
    expect(migration).toContain("revoke insert, update, delete on public.indicator_monthly from authenticated");
  });

  it("rebuilds a month only when its journals actually moved", () => {
    expect(migration).toContain("source_entry_count");
    expect(migration).toContain("source_last_posted_at");
    expect(migration).toContain("is not distinct from v_last");
  });

  it("never counts the opening entry as fresh capital", () => {
    expect(migration).toContain("line.account_code = '3100' and entry.source <> 'OPENING'");
  });

  it("distinguishes a month with no sales from a month with no bank sales", () => {
    expect(migration).toContain("else null end");
    expect(migration).toContain("noncash_sales_ratio numeric(5, 4)");
  });

  it("prints one formula per indicator the appendix shows", () => {
    for (const name of [
      "Pendapatan",
      "Beban pokok",
      "Laba bersih",
      "Ambilan pemilik",
      "Modal masuk",
      "Rasio penjualan lewat rekening",
      "Hari tercatat",
    ]) {
      expect(document).toContain(`name: "${name}"`);
    }
  });

  it("rebuilds the indicators as part of the same pre-read step", () => {
    expect(period).toContain("ensure_indicators_rebuilt");
    // Terakhir, karena ia meringkas jurnal termasuk penyusutan dan pajak yang
    // baru saja diposting.
    expect(period.indexOf("ensure_indicators_rebuilt")).toBeGreaterThan(
      period.indexOf("ensure_tax_estimated"),
    );
  });
});

describe("pending reminders contract (0037)", () => {
  const migration = readFileSync(join(migrationDirectory, "0037_pending_reminders.sql"), "utf8");
  const strip = readFileSync(
    join(process.cwd(), "components", "warung", "ReminderStrip.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
    "utf8",
  );

  it("derives reminders instead of storing them", () => {
    // Baris pengingat yang tersimpan menuntut dedup, kedaluwarsa, dan
    // pembersihan -- tiga hal baru yang bisa salah, tanpa manfaat tambahan
    // selama belum ada kanal dorong maupun penjadwal.
    expect(migration).toContain("function public.fn_pending_reminders");
    expect(migration).toMatch(/language sql\s+stable/);
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/insert into public\.notifications/i);
  });

  it("only asks for a stock count from a business that buys stock", () => {
    // Penjual jasa tidak punya persediaan, dan pengingat yang tidak relevan
    // mengajari pemiliknya mengabaikan semua pengingat.
    expect(migration).toContain("line.account_code = '5100'");
    expect(migration).toContain("line.debit > 0");
  });

  it("waits until the running month is nearly over before asking", () => {
    expect(migration).toContain("p_as_of >= (bounds.this_month_end - 2)");
  });

  it("asks to close only the days that actually have records", () => {
    expect(migration).toContain("transaction.ledger_status = 'confirmed'");
    expect(migration).toContain("from public.daily_closings as closing");
  });

  it("lets the owner act on a reminder that names a past month", () => {
    // Pengingat menagih bulan-bulan lampau yang belum dihitung stoknya.
    // Kalau kartu hitungannya terkunci ke bulan berjalan, pemilik membaca
    // "Hitung sisa stok Agustus" lalu tidak menemukan cara mengerjakannya --
    // pengingat yang menuntun ke jalan buntu.
    const card = readFileSync(
      join(process.cwd(), "components", "warung", "StockCountCard.tsx"),
      "utf8",
    );
    expect(card).toContain("getRemindersClient");
    expect(card).toContain("pendingMonths");
    expect(card).toContain("Bulan yang dihitung");
  });

  it("gives the owner the consequence, and no way to dismiss without doing it", () => {
    expect(strip).toContain("reminderGroupText");
    // Satu kartu per JENIS, bukan per hari: alasannya satu, yang berbeda
    // hanya tanggalnya.
    expect(strip).toContain("groupReminders");
    expect(strip).toContain("untung bulan itu terlihat lebih kecil");
    // Tombol yang menyembunyikan pengingat tanpa mengerjakannya membuat
    // pembukuan tampak beres padahal tidak. Yang diuji keberadaan tombolnya,
    // bukan kata-katanya -- berkas itu sendiri menyebut "tandai selesai" di
    // komentar yang menjelaskan kenapa tombol itu tidak ada.
    expect(strip).not.toContain("<button");
    expect(strip).not.toContain("onClick");

    // Tetapi ia HARUS menuntun ke tempat pekerjaannya. Pengingat yang hanya
    // memberi tahu tanpa menunjukkan jalannya membuat pemilik mencari sendiri,
    // dan pencarian sekecil apa pun cukup untuk menundanya ke besok.
    expect(strip).toContain("reminderHref");
    expect(strip).toContain("tutup-kas=${dueDate}");

    // Tempatnya di Beranda, bukan di halaman Laporan. Tutup kas dan hitung
    // stok adalah pekerjaan HARI INI, dan Beranda satu-satunya halaman yang
    // pemilik buka setiap hari.
    const beranda = readFileSync(join(process.cwd(), "app", "(umkm)", "umkm", "page.tsx"), "utf8");
    expect(beranda).toContain("<ReminderStrip />");
    expect(page).not.toContain("<ReminderStrip />");
  });
});

describe("sector-aware template contract (0038)", () => {
  const migration = readFileSync(join(migrationDirectory, "0038_sector_aware_templates.sql"), "utf8");
  const templates = readFileSync(
    join(process.cwd(), "modules", "accounting", "templates.ts"),
    "utf8",
  );
  const chips = readFileSync(
    join(process.cwd(), "components", "warung", "CategoryChips.tsx"),
    "utf8",
  );

  it("stops ignoring the answer the profile screen already collects", () => {
    expect(migration).toContain("profile.sektor_usaha");
    expect(migration).toContain("function private.emkm_sector_for_business");
    // `businesses.sector` hanya potret saat usaha dibuat; ia cadangan, bukan
    // sumber kebenaran.
    expect(migration.indexOf("profile.sektor_usaha")).toBeLessThan(
      migration.indexOf("business.sector"),
    );
  });

  it("maps the answer the same way in the database and on the screen", () => {
    const sqlBlock = migration.slice(migration.indexOf("function private.emkm_sector_from_answer"));
    for (const answer of ["jasa", "teknologi"]) {
      expect(sqlBlock).toContain(`when '${answer}' then 'JASA'`);
    }
    const tsBlock = templates.slice(templates.indexOf("export function sectorFromAnswer"));
    expect(tsBlock).toContain('normalized === "jasa" || normalized === "teknologi"');
  });

  it("seeds a second sector that never asks about stock or packaging", () => {
    expect(migration).toContain("'Bahan & alat habis pakai'");
    expect(migration).toContain("'Perlengkapan kerja'");
    const jasaRows = migration.match(/\('JASA', *\d+,/g) ?? [];
    expect(jasaRows.length).toBe(19);
  });

  it("refuses to ship a sector with a missing category", () => {
    // Lubang di satu sektor menggagalkan pencatatan pemiliknya di tengah
    // jalan, dan pesan errornya tidak akan menyebut sektor sebagai penyebab.
    expect(migration).toContain("SECTOR_TEMPLATE_INCOMPLETE");
    expect(migration).toContain("generate_series(1, 10)");
  });

  it("lets wording differ per sector while the posting rules stay one", () => {
    expect(templates).toContain("export const jasaCategoryTemplates");
    expect(templates).toContain("export function templatesForSector");
    // findTemplate berhenti membuang argumen sektornya.
    expect(templates).not.toContain("void sector;");
    expect(chips).toContain("primaryChoicesFor(sector)");
    expect(chips).toContain("expenseChoicesFor(sector)");
  });
});

describe("rupiah input contract", () => {
  const moneyScreens = [
    join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
    join(process.cwd(), "app", "(umkm)", "umkm", "catat", "page.tsx"),
    join(process.cwd(), "app", "(admin)", "admin", "rules", "page.tsx"),
  ];

  it("never asks for money through a bare number field", () => {
    // Kolom angka polos membuat "78" bisa berarti 78 rupiah atau 78 ribu, dan
    // tidak ada satu pun tanda di layar yang memberi tahu mana yang dimaksud.
    for (const file of moneyScreens) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("InlineMoneyInput");
    }
  });

  it("leaves no plain number input anywhere in the owner's screens", () => {
    const owner = [
      join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
      join(process.cwd(), "app", "(umkm)", "umkm", "catat", "page.tsx"),
    ];
    for (const file of owner) {
      expect(readFileSync(file, "utf8"), file).not.toContain('type="number"');
    }
  });

  it("prefixes and groups the digits, so the amount reads back the way it was meant", () => {
    const input = readFileSync(
      join(process.cwd(), "components", "warung", "MoneyInput.tsx"),
      "utf8",
    );
    expect(input).toContain('toLocaleString("id-ID")');
    expect(input).toContain("Rp");
    expect(input).toContain('inputMode="numeric"');
  });
});

describe("owner screen design-system contract", () => {
  const warungDirectory = join(process.cwd(), "components", "warung");
  const ownerScreens = [
    join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
    join(process.cwd(), "app", "(umkm)", "umkm", "akuntan", "page.tsx"),
    ...readdirSync(warungDirectory)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => join(warungDirectory, name)),
  ];

  it("draws every bar against a track that actually has a height", () => {
    // Bug yang pernah terjadi: tinggi batang ditulis sebagai persen, tetapi
    // induknya kolom flex tanpa tinggi sendiri -- tingginya justru ditentukan
    // isinya. Lingkaran itu membuat setiap batang jatuh ke nol, dan grafik
    // "Untung 6 bulan terakhir" tampil kosong sama sekali padahal datanya ada.
    const monthly = readFileSync(
      join(process.cwd(), "components", "warung", "MonthlyTab.tsx"),
      "utf8",
    );
    expect(monthly).toContain('className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"');
    expect(monthly).toContain('className="flex w-full flex-1 items-end justify-center"');
  });

  it("uses one palette, not Tailwind's defaults alongside it", () => {
    // Tab Buku Kas dulu memakai slate/blue bawaan Tailwind sementara layar
    // lain memakai palet BERKEMBANG -- tiga biru berbeda dalam satu halaman.
    // Satu-satunya pengecualian adalah lapisan gelap di belakang dialog.
    for (const file of ownerScreens) {
      const source = readFileSync(file, "utf8").replace(/slate-950\/\d+/g, "");
      const strays = source.match(/(?:bg|text|border)-(?:slate|blue|emerald|red|amber|gray|zinc)-\d{2,3}/g) ?? [];
      expect(strays, `${file}: ${strays.join(", ")}`).toEqual([]);
    }
  });

  it("marks a transaction's state with the shared badge, not bare coloured text", () => {
    const report = readFileSync(ownerScreens[0], "utf8");
    for (const label of ["Kas sudah ditutup", "Pernah diubah", "Dibatalkan"]) {
      expect(report).toContain(`<StatusBadge tone=`);
      expect(report).toContain(label);
    }
  });

  it("hides the daily chart until there are at least two days to compare", () => {
    // Dua batang pada satu tanggal memakan ratusan piksel tinggi tanpa
    // memberi tahu apa pun yang belum tertulis di kartu ringkasan di atasnya.
    const report = readFileSync(ownerScreens[0], "utf8");
    expect(report).toContain("cashFlowData(report.transactions).length >= 2");
  });
});

describe("owner dictionary and asset keywords contract (0040)", () => {
  const migration = readFileSync(join(migrationDirectory, "0040_asset_keywords.sql"), "utf8");
  const lexicon = readFileSync(
    join(process.cwd(), "modules", "nominal-parser", "lexicon.ts"),
    "utf8",
  );
  const terms = readFileSync(join(process.cwd(), "scripts", "forbidden-terms.mjs"), "utf8");

  it("teaches the database the nouns a warung actually buys", () => {
    // "beli meja 800 ribu" dulu mendarat di kategori 6 dan tidak pernah masuk
    // daftar alat: kata "meja" tidak ada di trigger_keywords mana pun.
    for (const noun of ["meja", "kursi", "rak", "lemari", "blender", "oven", "timbangan"]) {
      expect(migration).toContain(`'${noun}'`);
    }
    expect(migration).toContain("category_code = 8");
  });

  it("refuses to let an asset noun mean two categories at once", () => {
    expect(migration).toContain("ASSET_KEYWORD_CONFLICT");
  });

  it("keeps the parser's offline table agreeing with the database", () => {
    // Kata kunci hidup di dua tempat: basis data (dipakai server) dan tabel
    // bawaan parser (dipakai klien saat luring). Keduanya boleh berbeda
    // panjangnya, tidak boleh berbeda ARTINYA.
    const assetSection = lexicon.slice(lexicon.indexOf('keyword: "beli kulkas"'));
    for (const noun of ["meja", "kursi", "rak", "lemari", "blender", "oven", "timbangan"]) {
      expect(assetSection, noun).toContain(`{ keyword: "${noun}", code: 8 }`);
    }
  });

  it("routes the server through the database table, not the parser fallback", () => {
    // Tanpa ini, menambah kata benda alat ke basis data tidak pernah mengubah
    // apa pun -- persis kenapa "meja" tidak pernah terbaca sebagai alat usaha.
    const route = readFileSync(
      join(process.cwd(), "app", "api", "v1", "captures", "route.ts"),
      "utf8",
    );
    expect(route).toContain("categoryKeywordsForSector");
    expect(route).toContain("sectorForCurrentUser");
  });

  it("bans accountant vocabulary on the owner's screens, and only there", () => {
    for (const term of ["arus kas", "debit", "kredit", "ekuitas", "liabilitas", "neraca", "jurnal"]) {
      expect(terms).toContain(`"${term}"`);
    }
    expect(terms).toContain("app/(umkm)/umkm/akuntan");
    expect(terms).toContain("ownerLanguageSurfaces");
  });

  it('no longer calls the day\'s money "arus kas" on the home screen', () => {
    const beranda = readFileSync(join(process.cwd(), "app", "(umkm)", "umkm", "page.tsx"), "utf8");
    expect(beranda).toContain("Sisa uang hari ini");
    expect(beranda).not.toContain("Arus kas");
    // Angkanya hanya dari catatan terkonfirmasi, dan kartunya harus mengatakannya.
    expect(beranda).toContain("Dari catatan yang sudah Anda cek");
    expect(beranda).toContain("belum dicek");
  });

  it("offers to close yesterday's till before four in the morning", () => {
    const beranda = readFileSync(join(process.cwd(), "app", "(umkm)", "umkm", "page.tsx"), "utf8");
    const laporan = readFileSync(
      join(process.cwd(), "app", "(umkm)", "umkm", "laporan", "page.tsx"),
      "utf8",
    );
    expect(beranda).toContain("closingTargetDate");
    expect(laporan).toContain("closingTargetDate");
    // Tanggalnya ikut di tautan; penanda "1" saja akan selalu menutup hari ini.
    expect(beranda).toContain("tutup-kas=${closingTargetDate(new Date())}");
  });
});

describe("document cabinet contract (0041)", () => {
  const migration = readFileSync(join(migrationDirectory, "0041_document_cabinet.sql"), "utf8");

  it("gives every document a shelf, including the ones uploaded tomorrow", () => {
    // Backfill hanya mengurus masa lalu. Jalur tulis dokumen ada lebih dari
    // satu, dan satu yang lupa mengisi rak menghasilkan dokumen yang raknya
    // harus ditebak layar -- salah tebak berarti KTP ikut terkirim.
    expect(migration).toContain("private.document_shelf_for_type");
    expect(migration).toContain("before insert on public.documents");
    expect(migration).toContain("DOCUMENT_BACKFILL_INCOMPLETE");
  });

  it("keeps identity and outgoing reports on separate shelves", () => {
    for (const shelf of ["identitas", "legalitas", "bukti_transaksi", "aset_kontrak", "arsip_keluaran"]) {
      expect(migration, shelf).toContain(`'${shelf}'`);
    }
  });

  it("treats evidence the way it treats journals: never edited, never deleted", () => {
    // Jurnal tidak bisa disunting; buktinya tidak boleh lebih longgar, atau
    // catatan bisa berubah arti setelah dibaca institusi.
    expect(migration).toContain("document_attachment_is_immutable");
    expect(migration).toContain("removed_reason");
    expect(migration).toContain("removed_at");
  });

  it("routes ownership through the strict accounting helper", () => {
    // `private.business_role` pernah mengembalikan 'owner' tanpa syarat.
    expect(migration).toContain("private.accounting_business_access");
    // Disebut di catatan kepala berkas sebagai yang DIHINDARI; yang dilarang
    // adalah memanggilnya.
    expect(migration).not.toMatch(/private\.business_role\s*\(/);
  });

  it("keeps every new table select-only for owners", () => {
    for (const table of [
      "document_attachments",
      "document_requirements",
      "document_reminders",
      "report_issues",
    ]) {
      expect(migration, table).toMatch(new RegExp(`grant select on public\.${table} to authenticated`));
      expect(migration, table).not.toMatch(new RegExp(`grant insert on public\.${table} to authenticated`));
    }
  });

  it("gives each issued report an identifier that cannot collide", () => {
    expect(migration).toContain("document_uid");
    expect(migration).toMatch(/document_uid text not null unique/);
  });
});
