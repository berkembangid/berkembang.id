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
