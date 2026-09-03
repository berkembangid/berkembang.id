/**
 * Tipe suplemen untuk migrasi 0058/0059 yang belum masuk
 * `types/database.generated.ts` (regenerasi butuh DATABASE_TEST_URL lokal).
 *
 * Isinya cerminan 1:1 dari SQL migrasi — bukan tebakan. Setelah
 * `npm run db:types` dijalankan dengan DB lokal, berkas ini harus dikosongkan
 * dan pemakaiannya diganti tipe generated.
 */

export type InstitutionPortalSupplement = {
  public: {
    Tables: {
      dossier_api_keys: {
        Row: {
          id: string;
          dossier_id: string;
          institution_id: string;
          key_hash: string;
          key_prefix: string;
          scopes: string[];
          status: string;
          expires_at: string | null;
          last_used_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dossier_id: string;
          institution_id: string;
          key_hash: string;
          key_prefix: string;
          scopes: string[];
          status?: string;
          expires_at?: string | null;
          last_used_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dossier_id?: string;
          institution_id?: string;
          key_hash?: string;
          key_prefix?: string;
          scopes?: string[];
          status?: string;
          expires_at?: string | null;
          last_used_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      resolve_my_institution_id: {
        Args: { p_institution_id?: string };
        Returns: string;
      };
      list_my_institutions: {
        Args: Record<string, never>;
        Returns: import("@/types/database.generated").Json;
      };
      list_anonymous_business_candidates: {
        Args: {
          p_program_id?: string | null;
          p_institution_id?: string | null;
          p_sector?: string | null;
          p_region?: string | null;
          p_min_level?: string | null;
          p_age_band?: string | null;
          p_legal_complete?: boolean | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: import("@/types/database.generated").Json;
      };
      create_dossier_request: {
        Args: {
          p_business_id: string;
          p_program_id?: string | null;
          p_purpose_code: string;
          p_purpose_description: string;
          p_requested_scopes: string[];
          p_required_scopes?: string[];
          p_requested_duration_days?: number;
          p_download_requested?: boolean;
          p_idempotency_key?: string;
          p_institution_id?: string | null;
        };
        Returns: import("@/types/database.generated").Json;
      };
      get_my_institution_shortlist: {
        Args: { p_institution_id?: string | null };
        Returns: import("@/types/database.generated").Json;
      };
      toggle_my_institution_shortlist: {
        Args: { p_candidate_code: string; p_institution_id?: string | null };
        Returns: import("@/types/database.generated").Json;
      };
      log_institution_view: {
        Args: {
          p_institution_id: string;
          p_artifact: string;
          p_business_id?: string | null;
          p_artifact_id?: string | null;
          p_action?: string;
        };
        Returns: import("@/types/database.generated").Json;
      };
      record_institution_report_issue: {
        Args: {
          p_business_id: string;
          p_institution_id: string;
          p_dossier_id: string;
          p_document_id: string;
          p_document_uid: string;
          p_report_kind: string;
          p_storage_path: string;
          p_file_size: number;
          p_checksum_sha256: string;
          p_name: string;
          p_period_from?: string | null;
          p_period_to?: string | null;
          p_formula_version?: string | null;
        };
        Returns: import("@/types/database.generated").Json;
      };
      join_program_by_code: {
        Args: { p_join_code: string };
        Returns: import("@/types/database.generated").Json;
      };
      program_dashboard: {
        Args: { p_program_id: string };
        Returns: import("@/types/database.generated").Json;
      };
      exchange_dossier_api_key: {
        Args: { p_key_hash: string; p_scope: string };
        Returns: import("@/types/database.generated").Json;
      };
    };
  };
};
