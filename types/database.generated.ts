// Generated from the repository migrations. Do not edit by hand.
// Regenerate with: DATABASE_TEST_URL=<localhost-db-ending-_test> npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_feedback: {
        Row: {
          id: string
          job_id: string
          run_id: string | null
          user_id: string | null
          rating: number | null
          helpful: boolean | null
          correction: Json | null
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          run_id?: string | null
          user_id?: string | null
          rating?: number | null
          helpful?: boolean | null
          correction?: Json | null
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          run_id?: string | null
          user_id?: string | null
          rating?: number | null
          helpful?: boolean | null
          correction?: Json | null
          comment?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_jobs: {
        Row: {
          id: string
          business_id: string | null
          requested_by: string | null
          capture_id: string | null
          document_version_id: string | null
          job_type: string
          status: string
          idempotency_key: string
          input_payload: Json
          attempt_count: number
          max_attempts: number
          available_at: string
          locked_at: string | null
          locked_by: string | null
          failure_code: string | null
          failure_message: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id?: string | null
          requested_by?: string | null
          capture_id?: string | null
          document_version_id?: string | null
          job_type: string
          status?: string
          idempotency_key: string
          input_payload?: Json
          attempt_count?: number
          max_attempts?: number
          available_at?: string
          locked_at?: string | null
          locked_by?: string | null
          failure_code?: string | null
          failure_message?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string | null
          requested_by?: string | null
          capture_id?: string | null
          document_version_id?: string | null
          job_type?: string
          status?: string
          idempotency_key?: string
          input_payload?: Json
          attempt_count?: number
          max_attempts?: number
          available_at?: string
          locked_at?: string | null
          locked_by?: string | null
          failure_code?: string | null
          failure_message?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "transaction_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_runs: {
        Row: {
          id: string
          job_id: string
          attempt_number: number
          provider: string
          model: string
          status: string
          request_payload: Json | null
          response_payload: Json | null
          prompt_tokens: number | null
          completion_tokens: number | null
          latency_ms: number | null
          failure_code: string | null
          failure_message: string | null
          started_at: string
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          job_id: string
          attempt_number: number
          provider: string
          model: string
          status?: string
          request_payload?: Json | null
          response_payload?: Json | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          latency_ms?: number | null
          failure_code?: string | null
          failure_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          attempt_number?: number
          provider?: string
          model?: string
          status?: string
          request_payload?: Json | null
          response_payload?: Json | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          latency_ms?: number | null
          failure_code?: string | null
          failure_message?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ai_jobs"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_events: {
        Row: {
          id: string
          actor_user_id: string | null
          actor_type: string
          business_id: string | null
          institution_id: string | null
          action: string
          target_type: string | null
          target_id: string | null
          status: string
          metadata: Json
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          actor_user_id?: string | null
          actor_type?: string
          business_id?: string | null
          institution_id?: string | null
          action: string
          target_type?: string | null
          target_id?: string | null
          status?: string
          metadata?: Json
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          actor_user_id?: string | null
          actor_type?: string
          business_id?: string | null
          institution_id?: string | null
          action?: string
          target_type?: string | null
          target_id?: string | null
          status?: string
          metadata?: Json
          occurred_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string
          legacy_numeric_id: number | null
          audit_event_id: string | null
          timestamp: string
          user: string | null
          user_email: string | null
          action: string
          details: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          legacy_numeric_id?: number | null
          audit_event_id?: string | null
          timestamp?: string
          user?: string | null
          user_email?: string | null
          action: string
          details?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          legacy_numeric_id?: number | null
          audit_event_id?: string | null
          timestamp?: string
          user?: string | null
          user_email?: string | null
          action?: string
          details?: string | null
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          }
        ]
      }
      business_members: {
        Row: {
          id: string
          business_id: string
          profile_id: string | null
          user_id: string | null
          role: string
          status: string
          invited_by: string | null
          joined_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          profile_id?: string | null
          user_id?: string | null
          role?: string
          status?: string
          invited_by?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          profile_id?: string | null
          user_id?: string | null
          role?: string
          status?: string
          invited_by?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      business_missions: {
        Row: {
          id: string
          business_id: string
          mission_id: string
          status: string
          progress: Json
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          mission_id: string
          status?: string
          progress?: Json
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          mission_id?: string
          status?: string
          progress?: Json
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_missions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          }
        ]
      }
      businesses: {
        Row: {
          id: string
          legacy_profile_id: string | null
          name: string
          legal_name: string | null
          sector: string | null
          location: string | null
          address: string | null
          phone: string | null
          nib: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          legacy_profile_id?: string | null
          name: string
          legal_name?: string | null
          sector?: string | null
          location?: string | null
          address?: string | null
          phone?: string | null
          nib?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          legacy_profile_id?: string | null
          name?: string
          legal_name?: string | null
          sector?: string | null
          location?: string | null
          address?: string | null
          phone?: string | null
          nib?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_legacy_profile_id_fkey"
            columns: ["legacy_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      category_templates: {
        Row: {
          id: string
          sector: string
          category_code: number
          subtype: string | null
          label_umkm: string
          description_umkm: string | null
          direction: string
          debit_rule: string
          credit_rule: string
          cash_flow_section: string
          affects_pnl: boolean
          trigger_keywords: string[]
          sort_order: number
          version: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          sector: string
          category_code: number
          subtype?: string | null
          label_umkm: string
          description_umkm?: string | null
          direction: string
          debit_rule: string
          credit_rule: string
          cash_flow_section: string
          affects_pnl?: boolean
          trigger_keywords?: string[]
          sort_order?: number
          version?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          sector?: string
          category_code?: number
          subtype?: string | null
          label_umkm?: string
          description_umkm?: string | null
          direction?: string
          debit_rule?: string
          credit_rule?: string
          cash_flow_section?: string
          affects_pnl?: boolean
          trigger_keywords?: string[]
          sort_order?: number
          version?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      coa_accounts: {
        Row: {
          code: string
          name: string
          account_type: string
          normal_balance: string
          is_contra: boolean
          report_line: string
          parent_code: string | null
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          code: string
          name: string
          account_type: string
          normal_balance: string
          is_contra?: boolean
          report_line: string
          parent_code?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          code?: string
          name?: string
          account_type?: string
          normal_balance?: string
          is_contra?: boolean
          report_line?: string
          parent_code?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      consent_grants: {
        Row: {
          id: string
          request_id: string
          institution_id: string
          business_id: string
          granted_by: string | null
          scopes: string[]
          status: string
          granted_at: string
          expires_at: string | null
          revoked_at: string | null
          revocation_reason: string | null
          created_at: string
          updated_at: string
          download_allowed: boolean
        }
        Insert: {
          id?: string
          request_id: string
          institution_id: string
          business_id: string
          granted_by?: string | null
          scopes?: string[]
          status?: string
          granted_at?: string
          expires_at?: string | null
          revoked_at?: string | null
          revocation_reason?: string | null
          created_at?: string
          updated_at?: string
          download_allowed?: boolean
        }
        Update: {
          id?: string
          request_id?: string
          institution_id?: string
          business_id?: string
          granted_by?: string | null
          scopes?: string[]
          status?: string
          granted_at?: string
          expires_at?: string | null
          revoked_at?: string | null
          revocation_reason?: string | null
          created_at?: string
          updated_at?: string
          download_allowed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "consent_grants_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_grants_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_grants_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dossier_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      counterparties: {
        Row: {
          id: string
          business_id: string
          name: string
          type: string
          phone: string | null
          notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          type?: string
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          type?: string
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      daily_closings: {
        Row: {
          id: string
          business_id: string
          closing_date: string
          income_amount_idr: number
          expense_amount_idr: number
          transaction_count: number
          status: string
          closed_by: string | null
          closed_at: string
          created_at: string
          updated_at: string
          opening_cash_idr: number | null
          system_cash_in_idr: number
          system_cash_out_idr: number
          expected_cash_idr: number | null
          physical_cash_idr: number | null
          difference_idr: number | null
          note: string | null
          ledger_cash_idr: number | null
          ledger_bank_idr: number | null
          physical_bank_idr: number | null
          bank_difference_idr: number | null
          cash_variance_idr: number | null
        }
        Insert: {
          id?: string
          business_id: string
          closing_date: string
          income_amount_idr?: number
          expense_amount_idr?: number
          transaction_count?: number
          status?: string
          closed_by?: string | null
          closed_at?: string
          created_at?: string
          updated_at?: string
          opening_cash_idr?: number | null
          system_cash_in_idr?: number
          system_cash_out_idr?: number
          expected_cash_idr?: number | null
          physical_cash_idr?: number | null
          difference_idr?: number | null
          note?: string | null
          ledger_cash_idr?: number | null
          ledger_bank_idr?: number | null
          physical_bank_idr?: number | null
          bank_difference_idr?: number | null
          cash_variance_idr?: number | null
        }
        Update: {
          id?: string
          business_id?: string
          closing_date?: string
          income_amount_idr?: number
          expense_amount_idr?: number
          transaction_count?: number
          status?: string
          closed_by?: string | null
          closed_at?: string
          created_at?: string
          updated_at?: string
          opening_cash_idr?: number | null
          system_cash_in_idr?: number
          system_cash_out_idr?: number
          expected_cash_idr?: number | null
          physical_cash_idr?: number | null
          difference_idr?: number | null
          note?: string | null
          ledger_cash_idr?: number | null
          ledger_bank_idr?: number | null
          physical_bank_idr?: number | null
          bank_difference_idr?: number | null
          cash_variance_idr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_closings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_closings_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      depreciation_postings: {
        Row: {
          id: string
          asset_id: string
          business_id: string
          period_month: string
          amount_idr: number
          journal_entry_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          business_id: string
          period_month: string
          amount_idr: number
          journal_entry_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          business_id?: string
          period_month?: string
          amount_idr?: number
          journal_entry_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_postings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_postings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_postings_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      document_extractions: {
        Row: {
          id: string
          document_version_id: string
          status: string
          extractor: string | null
          structured_data: Json | null
          raw_text: string | null
          failure_code: string | null
          failure_message: string | null
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
          owner_review_status: string
          confirmed_data: Json | null
          owner_confirmed_by: string | null
          owner_confirmed_at: string | null
        }
        Insert: {
          id?: string
          document_version_id: string
          status?: string
          extractor?: string | null
          structured_data?: Json | null
          raw_text?: string | null
          failure_code?: string | null
          failure_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          owner_review_status?: string
          confirmed_data?: Json | null
          owner_confirmed_by?: string | null
          owner_confirmed_at?: string | null
        }
        Update: {
          id?: string
          document_version_id?: string
          status?: string
          extractor?: string | null
          structured_data?: Json | null
          raw_text?: string | null
          failure_code?: string | null
          failure_message?: string | null
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          owner_review_status?: string
          confirmed_data?: Json | null
          owner_confirmed_by?: string | null
          owner_confirmed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_owner_confirmed_by_fkey"
            columns: ["owner_confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      document_upload_sessions: {
        Row: {
          id: string
          document_id: string
          business_id: string
          user_id: string
          idempotency_key: string
          doc_type: string
          original_name: string
          intended_version: number
          storage_path: string
          mime_type: string
          file_size: number
          checksum_sha256: string
          status: string
          rejection_code: string | null
          rejection_reason: string | null
          expires_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
          ocr_consent_at: string | null
          ocr_processor_scope: string | null
          ocr_consent_policy_version: string | null
        }
        Insert: {
          id?: string
          document_id: string
          business_id: string
          user_id: string
          idempotency_key: string
          doc_type: string
          original_name: string
          intended_version: number
          storage_path: string
          mime_type: string
          file_size: number
          checksum_sha256: string
          status?: string
          rejection_code?: string | null
          rejection_reason?: string | null
          expires_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          ocr_consent_at?: string | null
          ocr_processor_scope?: string | null
          ocr_consent_policy_version?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          business_id?: string
          user_id?: string
          idempotency_key?: string
          doc_type?: string
          original_name?: string
          intended_version?: number
          storage_path?: string
          mime_type?: string
          file_size?: number
          checksum_sha256?: string
          status?: string
          rejection_code?: string | null
          rejection_reason?: string | null
          expires_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          ocr_consent_at?: string | null
          ocr_processor_scope?: string | null
          ocr_consent_policy_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_upload_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_upload_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      document_verifications: {
        Row: {
          id: string
          document_version_id: string
          status: string
          notes: string | null
          verified_by: string | null
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_version_id: string
          status?: string
          notes?: string | null
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          document_version_id?: string
          status?: string
          notes?: string | null
          verified_by?: string | null
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_verifications_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_verifications_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      document_versions: {
        Row: {
          id: string
          document_id: string
          version: number
          storage_path: string
          mime_type: string
          file_size: number
          checksum_sha256: string | null
          uploaded_by: string | null
          created_at: string
          original_name: string | null
          status: string
          rejection_code: string | null
          rejection_reason: string | null
        }
        Insert: {
          id?: string
          document_id: string
          version: number
          storage_path: string
          mime_type: string
          file_size: number
          checksum_sha256?: string | null
          uploaded_by?: string | null
          created_at?: string
          original_name?: string | null
          status?: string
          rejection_code?: string | null
          rejection_reason?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          version?: number
          storage_path?: string
          mime_type?: string
          file_size?: number
          checksum_sha256?: string | null
          uploaded_by?: string | null
          created_at?: string
          original_name?: string | null
          status?: string
          rejection_code?: string | null
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      documents: {
        Row: {
          id: string
          business_id: string | null
          user_id: string | null
          name: string
          doc_type: string
          status: string
          current_version: number
          storage_path: string | null
          mime_type: string | null
          file_size: number | null
          checksum_sha256: string | null
          ai_notes: string | null
          file_url: string | null
          created_at: string
          updated_at: string
          archived_at: string | null
          rejection_code: string | null
          rejection_reason: string | null
          legacy_public_url_sha256: string | null
        }
        Insert: {
          id?: string
          business_id?: string | null
          user_id?: string | null
          name: string
          doc_type: string
          status?: string
          current_version?: number
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          ai_notes?: string | null
          file_url?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
          rejection_code?: string | null
          rejection_reason?: string | null
          legacy_public_url_sha256?: string | null
        }
        Update: {
          id?: string
          business_id?: string | null
          user_id?: string | null
          name?: string
          doc_type?: string
          status?: string
          current_version?: number
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          ai_notes?: string | null
          file_url?: string | null
          created_at?: string
          updated_at?: string
          archived_at?: string | null
          rejection_code?: string | null
          rejection_reason?: string | null
          legacy_public_url_sha256?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          }
        ]
      }
      dossier_access_events: {
        Row: {
          id: string
          dossier_id: string
          institution_id: string
          actor_user_id: string | null
          action: string
          ip_hash: string | null
          user_agent_hash: string | null
          occurred_at: string
          created_at: string
          resource_scope: string | null
          outcome: string
          denial_code: string | null
        }
        Insert: {
          id?: string
          dossier_id: string
          institution_id: string
          actor_user_id?: string | null
          action: string
          ip_hash?: string | null
          user_agent_hash?: string | null
          occurred_at?: string
          created_at?: string
          resource_scope?: string | null
          outcome?: string
          denial_code?: string | null
        }
        Update: {
          id?: string
          dossier_id?: string
          institution_id?: string
          actor_user_id?: string | null
          action?: string
          ip_hash?: string | null
          user_agent_hash?: string | null
          occurred_at?: string
          created_at?: string
          resource_scope?: string | null
          outcome?: string
          denial_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_access_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_access_events_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_access_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          }
        ]
      }
      dossier_items: {
        Row: {
          id: string
          dossier_id: string
          item_type: string
          source_table: string
          source_id: string | null
          snapshot: Json
          ordinal: number
          created_at: string
        }
        Insert: {
          id?: string
          dossier_id: string
          item_type: string
          source_table: string
          source_id?: string | null
          snapshot?: Json
          ordinal?: number
          created_at?: string
        }
        Update: {
          id?: string
          dossier_id?: string
          item_type?: string
          source_table?: string
          source_id?: string | null
          snapshot?: Json
          ordinal?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossier_items_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          }
        ]
      }
      dossier_requests: {
        Row: {
          id: string
          institution_id: string
          business_id: string
          program_id: string | null
          requested_by: string | null
          reviewed_by: string | null
          purpose: string
          requested_scopes: string[]
          status: string
          expires_at: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
          purpose_code: string
          purpose_description: string
          required_scopes: string[]
          requested_duration_days: number
          download_requested: boolean
          idempotency_key: string | null
        }
        Insert: {
          id?: string
          institution_id: string
          business_id: string
          program_id?: string | null
          requested_by?: string | null
          reviewed_by?: string | null
          purpose: string
          requested_scopes?: string[]
          status?: string
          expires_at?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          purpose_code?: string
          purpose_description?: string
          required_scopes?: string[]
          requested_duration_days?: number
          download_requested?: boolean
          idempotency_key?: string | null
        }
        Update: {
          id?: string
          institution_id?: string
          business_id?: string
          program_id?: string | null
          requested_by?: string | null
          reviewed_by?: string | null
          purpose?: string
          requested_scopes?: string[]
          status?: string
          expires_at?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          purpose_code?: string
          purpose_description?: string
          required_scopes?: string[]
          requested_duration_days?: number
          download_requested?: boolean
          idempotency_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossier_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_requests_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_requests_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossier_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      dossiers: {
        Row: {
          id: string
          request_id: string
          grant_id: string
          business_id: string
          institution_id: string
          version: number
          status: string
          storage_path: string | null
          mime_type: string | null
          file_size: number | null
          checksum_sha256: string | null
          generated_at: string | null
          expires_at: string | null
          failure_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          grant_id: string
          business_id: string
          institution_id: string
          version?: number
          status?: string
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          generated_at?: string | null
          expires_at?: string | null
          failure_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          grant_id?: string
          business_id?: string
          institution_id?: string
          version?: number
          status?: string
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          generated_at?: string | null
          expires_at?: string | null
          failure_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "consent_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossiers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dossier_requests"
            referencedColumns: ["id"]
          }
        ]
      }
      fixed_assets: {
        Row: {
          id: string
          business_id: string
          name: string
          category: string
          acquired_on: string
          cost_idr: number
          useful_life_months: number
          salvage_value_idr: number
          source_transaction_id: string | null
          disposed_on: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          opening_balance_id: string | null
          original_cost_idr: number | null
          original_useful_life_months: number | null
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          category?: string
          acquired_on: string
          cost_idr: number
          useful_life_months: number
          salvage_value_idr?: number
          source_transaction_id?: string | null
          disposed_on?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          opening_balance_id?: string | null
          original_cost_idr?: number | null
          original_useful_life_months?: number | null
        }
        Update: {
          id?: string
          business_id?: string
          name?: string
          category?: string
          acquired_on?: string
          cost_idr?: number
          useful_life_months?: number
          salvage_value_idr?: number
          source_transaction_id?: string | null
          disposed_on?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          opening_balance_id?: string | null
          original_cost_idr?: number | null
          original_useful_life_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          }
        ]
      }
      indicator_monthly: {
        Row: {
          id: string
          business_id: string
          period_month: string
          revenue_idr: number
          cogs_idr: number
          opex_idr: number
          interest_idr: number
          net_income_idr: number
          prive_idr: number
          capital_in_idr: number
          receivable_new_idr: number
          noncash_sales_idr: number
          noncash_sales_ratio: number | null
          days_recorded: number
          formula_version: string
          source_entry_count: number
          source_last_posted_at: string | null
          computed_at: string
        }
        Insert: {
          id?: string
          business_id: string
          period_month: string
          revenue_idr?: number
          cogs_idr?: number
          opex_idr?: number
          interest_idr?: number
          net_income_idr?: number
          prive_idr?: number
          capital_in_idr?: number
          receivable_new_idr?: number
          noncash_sales_idr?: number
          noncash_sales_ratio?: number | null
          days_recorded?: number
          formula_version: string
          source_entry_count?: number
          source_last_posted_at?: string | null
          computed_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          period_month?: string
          revenue_idr?: number
          cogs_idr?: number
          opex_idr?: number
          interest_idr?: number
          net_income_idr?: number
          prive_idr?: number
          capital_in_idr?: number
          receivable_new_idr?: number
          noncash_sales_idr?: number
          noncash_sales_ratio?: number | null
          days_recorded?: number
          formula_version?: string
          source_entry_count?: number
          source_last_posted_at?: string | null
          computed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicator_monthly_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          }
        ]
      }
      institution_members: {
        Row: {
          id: string
          institution_id: string
          profile_id: string | null
          user_id: string | null
          role: string
          status: string
          invited_by: string | null
          joined_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          institution_id: string
          profile_id?: string | null
          user_id?: string | null
          role?: string
          status?: string
          invited_by?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          profile_id?: string | null
          user_id?: string | null
          role?: string
          status?: string
          invited_by?: string | null
          joined_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_members_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      institutions: {
        Row: {
          id: string
          legacy_numeric_id: number | null
          name: string
          type: string
          programs_count: number
          active: boolean
          status: string
          contact_name: string | null
          contact_email: string | null
          location: string | null
          created_at: string
          updated_at: string
          legacy_profile_id: string | null
        }
        Insert: {
          id?: string
          legacy_numeric_id?: number | null
          name: string
          type?: string
          programs_count?: number
          active?: boolean
          status?: string
          contact_name?: string | null
          contact_email?: string | null
          location?: string | null
          created_at?: string
          updated_at?: string
          legacy_profile_id?: string | null
        }
        Update: {
          id?: string
          legacy_numeric_id?: number | null
          name?: string
          type?: string
          programs_count?: number
          active?: boolean
          status?: string
          contact_name?: string | null
          contact_email?: string | null
          location?: string | null
          created_at?: string
          updated_at?: string
          legacy_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "institutions_legacy_profile_id_fkey"
            columns: ["legacy_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      inventory_counts: {
        Row: {
          id: string
          business_id: string
          period_month: string
          counted_value_idr: number
          adjustment_idr: number
          journal_entry_id: string | null
          notes: string | null
          counted_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          period_month: string
          counted_value_idr: number
          adjustment_idr?: number
          journal_entry_id?: string | null
          notes?: string | null
          counted_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          period_month?: string
          counted_value_idr?: number
          adjustment_idr?: number
          journal_entry_id?: string | null
          notes?: string | null
          counted_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      journal_entries: {
        Row: {
          id: string
          business_id: string
          entry_date: string
          posted_at: string
          source: string
          source_id: string | null
          reverses_entry_id: string | null
          memo: string | null
          reason: string | null
          template_version: string
          created_by: string | null
          created_at: string
          cash_flow_section: string | null
        }
        Insert: {
          id?: string
          business_id: string
          entry_date: string
          posted_at?: string
          source: string
          source_id?: string | null
          reverses_entry_id?: string | null
          memo?: string | null
          reason?: string | null
          template_version?: string
          created_by?: string | null
          created_at?: string
          cash_flow_section?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          entry_date?: string
          posted_at?: string
          source?: string
          source_id?: string | null
          reverses_entry_id?: string | null
          memo?: string | null
          reason?: string | null
          template_version?: string
          created_by?: string | null
          created_at?: string
          cash_flow_section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      journal_lines: {
        Row: {
          id: string
          entry_id: string
          business_id: string
          account_code: string
          debit: number
          credit: number
          line_order: number
          memo: string | null
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          business_id: string
          account_code: string
          debit?: number
          credit?: number
          line_order?: number
          memo?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          business_id?: string
          account_code?: string
          debit?: number
          credit?: number
          line_order?: number
          memo?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "coa_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      loans: {
        Row: {
          id: string
          business_id: string
          counterparty_id: string | null
          lender_name: string
          lender_type: string
          principal_idr: number
          outstanding_idr: number
          monthly_installment_idr: number | null
          annual_rate: number | null
          started_on: string
          source_transaction_id: string | null
          closed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          opening_balance_id: string | null
        }
        Insert: {
          id?: string
          business_id: string
          counterparty_id?: string | null
          lender_name: string
          lender_type?: string
          principal_idr: number
          outstanding_idr: number
          monthly_installment_idr?: number | null
          annual_rate?: number | null
          started_on: string
          source_transaction_id?: string | null
          closed_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          opening_balance_id?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          counterparty_id?: string | null
          lender_name?: string
          lender_type?: string
          principal_idr?: number
          outstanding_idr?: number
          monthly_installment_idr?: number | null
          annual_rate?: number | null
          started_on?: string
          source_transaction_id?: string | null
          closed_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          opening_balance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_opening_balance_id_fkey"
            columns: ["opening_balance_id"]
            isOneToOne: false
            referencedRelation: "opening_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          }
        ]
      }
      migration_verification_results: {
        Row: {
          id: string
          migration_key: string
          check_name: string
          expected_count: number
          actual_count: number
          orphan_count: number
          passed: boolean
          checked_at: string
        }
        Insert: {
          id?: string
          migration_key: string
          check_name: string
          expected_count: number
          actual_count: number
          orphan_count: number
          passed: boolean
          checked_at?: string
        }
        Update: {
          id?: string
          migration_key?: string
          check_name?: string
          expected_count?: number
          actual_count?: number
          orphan_count?: number
          passed?: boolean
          checked_at?: string
        }
        Relationships: []
      }
      missions: {
        Row: {
          id: string
          code: string
          title: string
          description: string | null
          category: string
          status: string
          requirements: Json
          reward: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          title: string
          description?: string | null
          category: string
          status?: string
          requirements?: Json
          reward?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          title?: string
          description?: string | null
          category?: string
          status?: string
          requirements?: Json
          reward?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mitra: {
        Row: {
          id: string
          legacy_numeric_id: number | null
          institution_id: string | null
          name: string
          type: string
          coverage: string | null
          umkm_managed: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          legacy_numeric_id?: number | null
          institution_id?: string | null
          name: string
          type: string
          coverage?: string | null
          umkm_managed?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          legacy_numeric_id?: number | null
          institution_id?: string | null
          name?: string
          type?: string
          coverage?: string | null
          umkm_managed?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mitra_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string | null
          business_id: string | null
          notification_type: string
          title: string
          body: string
          status: string
          data: Json
          read_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          business_id?: string | null
          notification_type: string
          title: string
          body: string
          status?: string
          data?: Json
          read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          business_id?: string | null
          notification_type?: string
          title?: string
          body?: string
          status?: string
          data?: Json
          read_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      opening_balances: {
        Row: {
          id: string
          business_id: string
          start_date: string
          cash_idr: number
          bank_idr: number
          receivables_idr: number
          inventory_idr: number
          fixed_assets_idr: number
          payables_idr: number
          loans_bank_idr: number
          loans_other_idr: number
          receivable_details: Json
          notes: string | null
          journal_entry_id: string | null
          completed_at: string
          created_by: string | null
          created_at: string
          payable_details: Json
          corrected_at: string | null
          correction_count: number
          last_reason: string | null
        }
        Insert: {
          id?: string
          business_id: string
          start_date: string
          cash_idr?: number
          bank_idr?: number
          receivables_idr?: number
          inventory_idr?: number
          fixed_assets_idr?: number
          payables_idr?: number
          loans_bank_idr?: number
          loans_other_idr?: number
          receivable_details?: Json
          notes?: string | null
          journal_entry_id?: string | null
          completed_at?: string
          created_by?: string | null
          created_at?: string
          payable_details?: Json
          corrected_at?: string | null
          correction_count?: number
          last_reason?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          start_date?: string
          cash_idr?: number
          bank_idr?: number
          receivables_idr?: number
          inventory_idr?: number
          fixed_assets_idr?: number
          payables_idr?: number
          loans_bank_idr?: number
          loans_other_idr?: number
          receivable_details?: Json
          notes?: string | null
          journal_entry_id?: string | null
          completed_at?: string
          created_by?: string | null
          created_at?: string
          payable_details?: Json
          corrected_at?: string | null
          correction_count?: number
          last_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opening_balances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_balances_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
          profile_id: string | null
          status: string
          source: string
          provisioned_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          profile_id?: string | null
          status?: string
          source?: string
          provisioned_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          profile_id?: string | null
          status?: string
          source?: string
          provisioned_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_provisioned_by_fkey"
            columns: ["provisioned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          email: string | null
          role: string | null
          name: string | null
          nama_pemilik: string | null
          nama_usaha: string | null
          sektor_usaha: string | null
          nama_institusi: string | null
          jenis_institusi: string | null
          nama_contact: string | null
          lokasi: string | null
          alamat: string | null
          phone: string | null
          nib: string | null
          avatar_url: string | null
          readiness_score: number | null
          konsistensi_days: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          email?: string | null
          role?: string | null
          name?: string | null
          nama_pemilik?: string | null
          nama_usaha?: string | null
          sektor_usaha?: string | null
          nama_institusi?: string | null
          jenis_institusi?: string | null
          nama_contact?: string | null
          lokasi?: string | null
          alamat?: string | null
          phone?: string | null
          nib?: string | null
          avatar_url?: string | null
          readiness_score?: number | null
          konsistensi_days?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          email?: string | null
          role?: string | null
          name?: string | null
          nama_pemilik?: string | null
          nama_usaha?: string | null
          sektor_usaha?: string | null
          nama_institusi?: string | null
          jenis_institusi?: string | null
          nama_contact?: string | null
          lokasi?: string | null
          alamat?: string | null
          phone?: string | null
          nib?: string | null
          avatar_url?: string | null
          readiness_score?: number | null
          konsistensi_days?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      program_enrollments: {
        Row: {
          id: string
          program_id: string
          business_id: string
          status: string
          application_data: Json
          applied_by: string | null
          reviewed_by: string | null
          applied_at: string
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          business_id: string
          status?: string
          application_data?: Json
          applied_by?: string | null
          reviewed_by?: string | null
          applied_at?: string
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          business_id?: string
          status?: string
          application_data?: Json
          applied_by?: string | null
          reviewed_by?: string | null
          applied_at?: string
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_enrollments_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      programs: {
        Row: {
          id: string
          institution_id: string
          name: string
          description: string | null
          requirements: Json
          status: string
          starts_on: string | null
          ends_on: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          institution_id: string
          name: string
          description?: string | null
          requirements?: Json
          status?: string
          starts_on?: string | null
          ends_on?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          institution_id?: string
          name?: string
          description?: string | null
          requirements?: Json
          status?: string
          starts_on?: string | null
          ends_on?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          }
        ]
      }
      readiness_analyses: {
        Row: {
          id: string
          user_id: string | null
          business_id: string | null
          rule_set_id: string | null
          total_score: number
          gaps: Json
          components: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          business_id?: string | null
          rule_set_id?: string | null
          total_score?: number
          gaps?: Json
          components?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          business_id?: string | null
          rule_set_id?: string | null
          total_score?: number
          gaps?: Json
          components?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_analyses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_analyses_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "readiness_rule_sets"
            referencedColumns: ["id"]
          }
        ]
      }
      readiness_rule_sets: {
        Row: {
          id: string
          version: string
          status: string
          rules: Json
          weights: Json
          thresholds: Json
          created_by: string | null
          published_by: string | null
          published_at: string | null
          created_at: string
          updated_at: string
          effective_at: string | null
        }
        Insert: {
          id?: string
          version: string
          status?: string
          rules?: Json
          weights?: Json
          thresholds?: Json
          created_by?: string | null
          published_by?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
          effective_at?: string | null
        }
        Update: {
          id?: string
          version?: string
          status?: string
          rules?: Json
          weights?: Json
          thresholds?: Json
          created_by?: string | null
          published_by?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
          effective_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "readiness_rule_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_rule_sets_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      readiness_score_components: {
        Row: {
          id: string
          snapshot_id: string
          component_key: string
          raw_score: number | null
          weight: number
          weighted_score: number | null
          evidence: Json
          created_at: string
          component_status: string
          max_score: number
          confidence: number
          freshness: string
          evidence_count: number
          explanation: string
          next_action: string | null
          quality_tier: string
        }
        Insert: {
          id?: string
          snapshot_id: string
          component_key: string
          raw_score?: number | null
          weight: number
          weighted_score?: number | null
          evidence?: Json
          created_at?: string
          component_status?: string
          max_score?: number
          confidence?: number
          freshness?: string
          evidence_count?: number
          explanation?: string
          next_action?: string | null
          quality_tier?: string
        }
        Update: {
          id?: string
          snapshot_id?: string
          component_key?: string
          raw_score?: number | null
          weight?: number
          weighted_score?: number | null
          evidence?: Json
          created_at?: string
          component_status?: string
          max_score?: number
          confidence?: number
          freshness?: string
          evidence_count?: number
          explanation?: string
          next_action?: string | null
          quality_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_score_components_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "readiness_score_snapshots"
            referencedColumns: ["id"]
          }
        ]
      }
      readiness_score_snapshots: {
        Row: {
          id: string
          business_id: string
          rule_set_id: string
          source_analysis_id: string | null
          total_score: number
          input_hash: string | null
          summary: Json
          calculated_by: string | null
          calculated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          rule_set_id: string
          source_analysis_id?: string | null
          total_score: number
          input_hash?: string | null
          summary?: Json
          calculated_by?: string | null
          calculated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          rule_set_id?: string
          source_analysis_id?: string | null
          total_score?: number
          input_hash?: string | null
          summary?: Json
          calculated_by?: string | null
          calculated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_score_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_score_snapshots_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_score_snapshots_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "readiness_rule_sets"
            referencedColumns: ["id"]
          }
        ]
      }
      rules_config: {
        Row: {
          id: string
          legacy_numeric_id: number | null
          rule_set_id: string | null
          version: string
          weights: Json
          thresholds: Json
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          legacy_numeric_id?: number | null
          rule_set_id?: string | null
          version: string
          weights?: Json
          thresholds?: Json
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          legacy_numeric_id?: number | null
          rule_set_id?: string | null
          version?: string
          weights?: Json
          thresholds?: Json
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_config_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "readiness_rule_sets"
            referencedColumns: ["id"]
          }
        ]
      }
      tax_estimates: {
        Row: {
          id: string
          business_id: string
          period_month: string
          tax_year: number
          gross_revenue_idr: number
          cumulative_before_idr: number
          taxable_idr: number
          tax_idr: number
          rate: number
          exempt_idr: number
          journal_entry_id: string | null
          computed_at: string
        }
        Insert: {
          id?: string
          business_id: string
          period_month: string
          tax_year: number
          gross_revenue_idr?: number
          cumulative_before_idr?: number
          taxable_idr?: number
          tax_idr?: number
          rate: number
          exempt_idr: number
          journal_entry_id?: string | null
          computed_at?: string
        }
        Update: {
          id?: string
          business_id?: string
          period_month?: string
          tax_year?: number
          gross_revenue_idr?: number
          cumulative_before_idr?: number
          taxable_idr?: number
          tax_idr?: number
          rate?: number
          exempt_idr?: number
          journal_entry_id?: string | null
          computed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_estimates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_estimates_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
      transaction_captures: {
        Row: {
          id: string
          business_id: string
          user_id: string | null
          idempotency_key: string
          input_method: string
          status: string
          storage_path: string | null
          mime_type: string | null
          file_size: number | null
          checksum_sha256: string | null
          transcription: string | null
          draft_payload: Json | null
          failure_code: string | null
          failure_message: string | null
          processing_started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
          source_text: string | null
          confirmation_idempotency_key: string | null
          confirmed_by: string | null
          confirmed_at: string | null
          cancelled_at: string | null
        }
        Insert: {
          id?: string
          business_id: string
          user_id?: string | null
          idempotency_key: string
          input_method?: string
          status?: string
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          transcription?: string | null
          draft_payload?: Json | null
          failure_code?: string | null
          failure_message?: string | null
          processing_started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          source_text?: string | null
          confirmation_idempotency_key?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
        }
        Update: {
          id?: string
          business_id?: string
          user_id?: string | null
          idempotency_key?: string
          input_method?: string
          status?: string
          storage_path?: string | null
          mime_type?: string | null
          file_size?: number | null
          checksum_sha256?: string | null
          transcription?: string | null
          draft_payload?: Json | null
          failure_code?: string | null
          failure_message?: string | null
          processing_started_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
          source_text?: string | null
          confirmation_idempotency_key?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_captures_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_captures_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_captures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      transaction_changes: {
        Row: {
          id: string
          transaction_id: string
          business_id: string
          actor_user_id: string | null
          action: string
          reason: string | null
          previous_values: Json | null
          new_values: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          business_id: string
          actor_user_id?: string | null
          action: string
          reason?: string | null
          previous_values?: Json | null
          new_values?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          business_id?: string
          actor_user_id?: string | null
          action?: string
          reason?: string | null
          previous_values?: Json | null
          new_values?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_changes_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_changes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_changes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          legacy_numeric_id: number | null
          business_id: string | null
          user_id: string | null
          capture_id: string | null
          idempotency_key: string | null
          item: string
          qty: string
          direction: string | null
          type: string | null
          amount_idr: number | null
          nominal: number | null
          category: string | null
          kategori: string | null
          transaction_date: string | null
          tanggal: string | null
          notes: string | null
          created_at: string
          updated_at: string
          client_item_id: string | null
          category_code: string | null
          quantity: number | null
          unit: string | null
          unit_price_idr: number | null
          payment_method: string | null
          sales_channel: string | null
          category_group: string | null
          counterparty: string | null
          evidence_document_version_id: string | null
          ledger_status: string
          cancelled_at: string | null
          cancelled_by: string | null
          adjustment_of_transaction_id: string | null
          emkm_category_code: number | null
          emkm_category_subtype: string | null
          counterparty_id: string | null
          interest_amount_idr: number
          needs_reclass: boolean
          journal_entry_id: string | null
        }
        Insert: {
          id?: string
          legacy_numeric_id?: number | null
          business_id?: string | null
          user_id?: string | null
          capture_id?: string | null
          idempotency_key?: string | null
          item: string
          qty?: string
          direction?: string | null
          type?: string | null
          amount_idr?: number | null
          nominal?: number | null
          category?: string | null
          kategori?: string | null
          transaction_date?: string | null
          tanggal?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          client_item_id?: string | null
          category_code?: string | null
          quantity?: number | null
          unit?: string | null
          unit_price_idr?: number | null
          payment_method?: string | null
          sales_channel?: string | null
          category_group?: string | null
          counterparty?: string | null
          evidence_document_version_id?: string | null
          ledger_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          adjustment_of_transaction_id?: string | null
          emkm_category_code?: number | null
          emkm_category_subtype?: string | null
          counterparty_id?: string | null
          interest_amount_idr?: number
          needs_reclass?: boolean
          journal_entry_id?: string | null
        }
        Update: {
          id?: string
          legacy_numeric_id?: number | null
          business_id?: string | null
          user_id?: string | null
          capture_id?: string | null
          idempotency_key?: string | null
          item?: string
          qty?: string
          direction?: string | null
          type?: string | null
          amount_idr?: number | null
          nominal?: number | null
          category?: string | null
          kategori?: string | null
          transaction_date?: string | null
          tanggal?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          client_item_id?: string | null
          category_code?: string | null
          quantity?: number | null
          unit?: string | null
          unit_price_idr?: number | null
          payment_method?: string | null
          sales_channel?: string | null
          category_group?: string | null
          counterparty?: string | null
          evidence_document_version_id?: string | null
          ledger_status?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          adjustment_of_transaction_id?: string | null
          emkm_category_code?: number | null
          emkm_category_subtype?: string | null
          counterparty_id?: string | null
          interest_amount_idr?: number
          needs_reclass?: boolean
          journal_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_adjustment_of_transaction_id_fkey"
            columns: ["adjustment_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "transaction_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_evidence_document_version_id_fkey"
            columns: ["evidence_document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      latest_readiness_snapshots: {
        Row: {
          id: string | null
          business_id: string | null
          rule_set_id: string | null
          total_score: number | null
          summary: Json | null
          calculated_at: string | null
          created_at: string | null
        }
        Relationships: []
      }
      legacy_business_profiles: {
        Row: {
          user_id: string | null
          business_id: string | null
          email: string | null
          name: string | null
          nama_usaha: string | null
          sektor_usaha: string | null
          lokasi: string | null
          readiness_score: number | null
          konsistensi_days: number | null
          status: string | null
        }
        Relationships: []
      }
      legacy_documents: {
        Row: {
          id: string | null
          user_id: string | null
          name: string | null
          doc_type: string | null
          storage_path: string | null
          file_url: string | null
          file_size: number | null
          mime_type: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
          business_id: string | null
          current_version: number | null
          checksum_sha256: string | null
        }
        Relationships: []
      }
      legacy_transactions: {
        Row: {
          id: string | null
          user_id: string | null
          item: string | null
          qty: string | null
          type: string | null
          nominal: number | null
          kategori: string | null
          tanggal: string | null
          created_at: string | null
          updated_at: string | null
          business_id: string | null
          capture_id: string | null
          idempotency_key: string | null
        }
        Relationships: []
      }
      v_general_ledger: {
        Row: {
          business_id: string | null
          account_code: string | null
          account_name: string | null
          account_type: string | null
          normal_balance: string | null
          entry_date: string | null
          entry_id: string | null
          source: string | null
          memo: string | null
          debit: number | null
          credit: number | null
          running_balance: number | null
          posted_at: string | null
          line_order: number | null
          line_id: string | null
        }
        Relationships: []
      }
      wp03_consistency_report: {
        Row: {
          migration_key: string | null
          check_name: string | null
          expected_count: number | null
          actual_count: number | null
          orphan_count: number | null
          passed: boolean | null
          checked_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      access_verified_business_profile: {
        Args: {
          p_dossier_id: string
          p_resource_scope: string
          p_action?: string
          p_ip_hash?: string
          p_user_agent_hash?: string
        }
        Returns: Json
      }
      archive_document: {
        Args: {
          p_document_id: string
        }
        Returns: Json
      }
      cancel_ledger_transaction: {
        Args: {
          p_transaction_id: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_transaction: {
        Args: {
          p_transaction_id: string
          p_reason: string
        }
        Returns: Json
      }
      cancel_transaction_capture: {
        Args: {
          p_capture_id: string
        }
        Returns: Json
      }
      claim_capture_ai_job: {
        Args: {
          p_job_id: string
          p_worker_id: string
          p_provider: string
          p_model: string
        }
        Returns: Json
      }
      claim_document_extraction_job: {
        Args: {
          p_job_id: string
          p_worker_id: string
          p_provider: string
          p_model: string
        }
        Returns: Json
      }
      close_ledger_day: {
        Args: {
          p_closing_date: string
          p_opening_cash_idr?: number
          p_physical_cash_idr?: number
          p_note?: string
          p_physical_bank_idr?: number
        }
        Returns: Json
      }
      complete_capture_ai_job: {
        Args: {
          p_job_id: string
          p_attempt_number: number
          p_transcription: string
          p_draft_payload: Json
          p_latency_ms: number
          p_prompt_tokens?: number
          p_completion_tokens?: number
        }
        Returns: Json
      }
      complete_document_extraction_job: {
        Args: {
          p_job_id: string
          p_attempt_number: number
          p_extractor: string
          p_structured_data: Json
          p_latency_ms: number
        }
        Returns: Json
      }
      complete_document_upload_session: {
        Args: {
          p_document_id: string
          p_session_id: string
        }
        Returns: Json
      }
      confirm_document_extraction: {
        Args: {
          p_document_id: string
          p_document_version_id: string
          p_confirmed_data: Json
        }
        Returns: Json
      }
      confirm_transaction_capture: {
        Args: {
          p_capture_id: string
          p_confirmation_idempotency_key: string
          p_items: Json
        }
        Returns: Json
      }
      correct_opening_balances: {
        Args: {
          p_reason: string
          p_start_date: string
          p_cash_idr?: number
          p_bank_idr?: number
          p_receivables?: Json
          p_payables?: Json
          p_inventory_idr?: number
          p_assets?: Json
          p_notes?: string
        }
        Returns: Json
      }
      create_document_upload_session: {
        Args: {
          p_idempotency_key: string
          p_doc_type: string
          p_original_name: string
          p_mime_type: string
          p_file_size: number
          p_checksum_sha256: string
          p_business_id?: string
          p_document_id?: string
        }
        Returns: Json
      }
      create_dossier_request: {
        Args: {
          p_business_id: string
          p_program_id: string
          p_purpose_code: string
          p_purpose_description: string
          p_requested_scopes: string[]
          p_required_scopes?: string[]
          p_requested_duration_days?: number
          p_download_requested?: boolean
          p_idempotency_key?: string
        }
        Returns: Json
      }
      create_ledger_transaction: {
        Args: {
          p_idempotency_key: string
          p_transaction_type: string
          p_amount_idr: number
          p_transaction_date: string
          p_category_group: string
          p_category_code: string
          p_description: string
          p_quantity?: number
          p_unit?: string
          p_unit_price_idr?: number
          p_payment_method?: string
          p_sales_channel?: string
          p_counterparty?: string
          p_emkm_category_code?: number
          p_emkm_category_subtype?: string
          p_counterparty_id?: string
          p_interest_amount_idr?: number
        }
        Returns: Json
      }
      create_transaction_capture: {
        Args: {
          p_idempotency_key: string
          p_input_method: string
          p_business_id?: string
          p_source_text?: string
          p_mime_type?: string
          p_file_size?: number
          p_checksum_sha256?: string
        }
        Returns: Json
      }
      dispose_fixed_asset: {
        Args: {
          p_asset_id: string
          p_disposed_on: string
          p_proceeds_idr?: number
        }
        Returns: Json
      }
      ensure_depreciation_posted: {
        Args: {
          p_as_of?: string
        }
        Returns: number
      }
      ensure_indicators_rebuilt: {
        Args: {
          p_as_of?: string
        }
        Returns: number
      }
      ensure_tax_estimated: {
        Args: {
          p_as_of?: string
        }
        Returns: number
      }
      fail_capture_ai_job: {
        Args: {
          p_job_id: string
          p_attempt_number: number
          p_failure_code: string
          p_failure_message: string
          p_retryable: boolean
          p_latency_ms: number
          p_retry_reason?: string
        }
        Returns: Json
      }
      fail_document_extraction_job: {
        Args: {
          p_job_id: string
          p_attempt_number: number
          p_failure_code: string
          p_failure_message: string
          p_retryable: boolean
          p_latency_ms: number
        }
        Returns: Json
      }
      fn_balance_sheet: {
        Args: {
          p_business_id: string
          p_as_of: string
        }
        Returns: {
          report_line: string
          account_code: string
          account_name: string
          section: string
          amount: number
        }[]
      }
      fn_cash_flow: {
        Args: {
          p_business_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          section: string
          amount: number
        }[]
      }
      fn_income_statement: {
        Args: {
          p_business_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          report_line: string
          account_code: string
          account_name: string
          amount: number
        }[]
      }
      fn_indicator_monthly: {
        Args: {
          p_business_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          period_month: string
          revenue: number
          cogs: number
          opex: number
          interest: number
          net_income: number
          prive: number
          capital_in: number
          receivable_new: number
          noncash_sales: number
          noncash_sales_ratio: number
          days_recorded: number
          formula_version: string
        }[]
      }
      fn_notes_data: {
        Args: {
          p_business_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: Json
      }
      fn_pending_reminders: {
        Args: {
          p_business_id: string
          p_as_of: string
        }
        Returns: {
          kind: string
          period_month: string
          due_date: string
          days_overdue: number
          urgent: boolean
        }[]
      }
      fn_post_transaction_journal: {
        Args: {
          p_transaction_id: string
        }
        Returns: string
      }
      fn_reverse_journal_entry: {
        Args: {
          p_entry_id: string
          p_reason: string
        }
        Returns: string
      }
      fn_tax_estimate: {
        Args: {
          p_business_id: string
          p_as_of: string
        }
        Returns: {
          tax_year: number
          as_of: string
          gross_revenue_ytd_idr: number
          exempt_idr: number
          rate: number
          taxable_ytd_idr: number
          tax_ytd_idr: number
          remaining_before_taxable_idr: number
          is_taxable: boolean
        }[]
      }
      fn_trial_balance: {
        Args: {
          p_business_id: string
          p_as_of: string
        }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          normal_balance: string
          total_debit: number
          total_credit: number
          balance: number
        }[]
      }
      fn_warung_monthly: {
        Args: {
          p_business_id: string
          p_date_from: string
          p_date_to: string
        }
        Returns: {
          period_month: string
          revenue: number
          cogs: number
          opex: number
          interest: number
          net_income: number
          prive: number
          capital_in: number
          receivable_new: number
          days_recorded: number
        }[]
      }
      list_anonymous_business_candidates: {
        Args: {
          p_program_id?: string
        }
        Returns: Json
      }
      recalculate_my_readiness: {
        Args: Record<string, never>
        Returns: Json
      }
      record_document_ocr_consent: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      register_fixed_asset: {
        Args: {
          p_name: string
          p_cost_idr: number
          p_acquired_on: string
          p_category?: string
          p_useful_life_months?: number
          p_salvage_value_idr?: number
        }
        Returns: Json
      }
      register_loan: {
        Args: {
          p_lender_name: string
          p_principal_idr: number
          p_started_on: string
          p_lender_type?: string
          p_outstanding_idr?: number
          p_monthly_installment_idr?: number
          p_annual_rate?: number
        }
        Returns: Json
      }
      reject_document_upload_session: {
        Args: {
          p_session_id: string
          p_rejection_code: string
          p_rejection_reason: string
        }
        Returns: never
      }
      respond_to_dossier_request: {
        Args: {
          p_request_id: string
          p_decision: string
          p_approved_scopes?: string[]
          p_download_allowed?: boolean
        }
        Returns: Json
      }
      retry_document_extraction: {
        Args: {
          p_document_id: string
        }
        Returns: Json
      }
      revoke_consent_grant: {
        Args: {
          p_grant_id: string
          p_reason?: string
        }
        Returns: Json
      }
      save_inventory_count: {
        Args: {
          p_period_month: string
          p_counted_value_idr: number
          p_notes?: string
        }
        Returns: Json
      }
      save_opening_balances: {
        Args: {
          p_start_date: string
          p_cash_idr?: number
          p_bank_idr?: number
          p_receivables?: Json
          p_payables?: Json
          p_inventory_idr?: number
          p_assets?: Json
          p_notes?: string
        }
        Returns: Json
      }
      schedule_capture_processing: {
        Args: {
          p_capture_id: string
        }
        Returns: Json
      }
      set_transaction_category: {
        Args: {
          p_transaction_id: string
          p_emkm_category_code: number
          p_emkm_category_subtype?: string
          p_counterparty_id?: string
          p_interest_amount_idr?: number
        }
        Returns: Json
      }
      update_fixed_asset: {
        Args: {
          p_asset_id: string
          p_name?: string
          p_category?: string
          p_useful_life_months?: number
        }
        Returns: Json
      }
      update_ledger_transaction: {
        Args: {
          p_transaction_id: string
          p_transaction_type: string
          p_amount_idr: number
          p_transaction_date: string
          p_category_group: string
          p_category_code: string
          p_description: string
          p_reason: string
          p_quantity?: number
          p_unit?: string
          p_unit_price_idr?: number
          p_payment_method?: string
          p_sales_channel?: string
          p_counterparty?: string
          p_emkm_category_code?: number
          p_emkm_category_subtype?: string
          p_counterparty_id?: string
          p_interest_amount_idr?: number
        }
        Returns: Json
      }
      update_loan: {
        Args: {
          p_loan_id: string
          p_lender_name?: string
          p_monthly_installment_idr?: number
          p_annual_rate?: number
        }
        Returns: Json
      }
      upsert_counterparty: {
        Args: {
          p_name: string
          p_type?: string
        }
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database["public"]

export type Tables<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Row"]

export type TablesInsert<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Insert"]

export type TablesUpdate<TableName extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][TableName]["Update"]
