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
      /** 0115 -- daftar produk. */
      upsert_product: {
        Args: { p_id: string | null; p_name: string; p_unit: string | null; p_sell_price_idr: number | null; p_cost_price_idr: number };
        Returns: import("@/types/database.generated").Json;
      };
      archive_product: {
        Args: { p_id: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0114 -- target bulanan. */
      set_monthly_target: {
        Args: { p_revenue_target_idr: number | null; p_expense_limit_idr: number | null };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0113 -- gabung kontak lewat alias. */
      merge_contact: {
        Args: { p_from: string; p_into: string };
        Returns: import("@/types/database.generated").Json;
      };
      unmerge_contact: {
        Args: { p_name: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0111 -- alat milik sendiri disetor ke usaha, dengan jurnal. */
      contribute_fixed_asset: {
        Args: { p_name: string; p_value_idr: number; p_useful_life_months: number; p_category?: string; p_contributed_on?: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0110 -- catatan rutin. */
      upsert_recurring_transaction: {
        Args: {
          p_id: string | null; p_description: string; p_amount_idr: number; p_emkm_category_code: number;
          p_emkm_category_subtype: string | null; p_payment_method: string; p_counterparty: string | null;
          p_cadence: string; p_next_due: string;
        };
        Returns: import("@/types/database.generated").Json;
      };
      delete_recurring_transaction: {
        Args: { p_id: string };
        Returns: import("@/types/database.generated").Json;
      };
      advance_recurring_transaction: {
        Args: { p_id: string; p_expected_due: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0109 -- piutang dan utang per orang, dan nomor WhatsApp kontak. */
      fn_contact_balances: {
        Args: { p_business_id: string };
        Returns: Array<{ kind: "PIUTANG" | "UTANG"; name: string; balance_idr: number; since: string | null; last_activity: string | null; phone: string | null }>;
      };
      set_contact_phone: {
        Args: { p_name: string; p_phone: string | null; p_kind?: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0108 -- masa berlaku dokumen izin dan pengingatnya. */
      set_document_validity: {
        Args: { p_document_id: string; p_valid_until: string | null };
        Returns: import("@/types/database.generated").Json;
      };
      fn_document_expiry_reminders: {
        Args: { p_business_id: string; p_as_of: string };
        Returns: Array<{ document_id: string; doc_type: string; name: string; valid_until: string; days_left: number }>;
      };
      /** 0107 -- program yang diikuti pemilik, dan jalan keluarnya. */
      list_my_programs: {
        Args: Record<string, never>;
        Returns: import("@/types/database.generated").Json;
      };
      leave_program: {
        Args: { p_program_id: string };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0107 -- riwayat akses lembaga beserta nama lembaganya. */
      list_my_access_log: {
        Args: { p_limit?: number };
        Returns: import("@/types/database.generated").Json;
      };
      /** 0106 -- catatan pribadi pada kandidat tersimpan. */
      list_my_shortlist_notes: {
        Args: { p_institution_id?: string };
        Returns: Record<string, string>;
      };
      set_my_shortlist_note: {
        Args: { p_candidate_code: string; p_note: string; p_institution_id?: string };
        Returns: { candidateCode: string; note: string | null };
      };
      /** 0105 -- sisa kuota organisasi terpilih. */
      institution_quota: {
        Args: { p_institution_id?: string };
        Returns: {
          requestsToday: number;
          requestLimit: number;
          requestsResetAt: string;
          dossierCredits: number;
          dossierCreditsUsed: number;
        };
      };
      /**
       * 0103 -- keping anonim usaha yang sudah diminta lembaga pemanggil.
       * Layar Permintaan dan Dosir memakainya untuk kode, bidang, wilayah,
       * tingkat, dan umur catatan.
       */
      ringkasan_usaha_yang_diminta: {
        Args: { p_business_ids: string[] };
        Returns: Array<{
          business_id: string;
          candidate_code: string;
          sector: string;
          general_location: string;
          readiness_level: string;
          recording_age_band: string;
          recording_activity: string;
        }>;
      };
      /**
       * 0097 -- direktori anggota lembaga beserta nama dan surelnya.
       *
       * `profiles_select` hanya mengizinkan orang membaca profilnya sendiri,
       * jadi tanpa fungsi ini layar Organisasi hanya bisa menampilkan UUID.
       */
      institution_member_directory: {
        Args: { p_institution_id: string };
        Returns: Array<{
          id: string;
          user_id: string | null;
          role: string;
          status: string;
          joined_at: string | null;
          display_name: string | null;
          email: string | null;
          is_self: boolean;
        }>;
      };
      /** 0097 -- menambah anggota lewat surel; perannya selalu `viewer`. */
      institution_add_member_by_email: {
        Args: { p_institution_id: string; p_email: string };
        Returns: import("@/types/database.generated").Json;
      };
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
          p_search?: string | null;
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
