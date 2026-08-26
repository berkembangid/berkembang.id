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
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
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
          file_url: string | null
          created_at: string
          updated_at: string
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
          file_url?: string | null
          created_at?: string
          updated_at?: string
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
          file_url?: string | null
          created_at?: string
          updated_at?: string
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
          raw_score: number
          weight: number
          weighted_score: number
          evidence: Json
          created_at: string
        }
        Insert: {
          id?: string
          snapshot_id: string
          component_key: string
          raw_score: number
          weight: number
          weighted_score: number
          evidence?: Json
          created_at?: string
        }
        Update: {
          id?: string
          snapshot_id?: string
          component_key?: string
          raw_score?: number
          weight?: number
          weighted_score?: number
          evidence?: Json
          created_at?: string
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
      transactions: {
        Row: {
          id: string
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
        }
        Insert: {
          id?: string
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
        }
        Update: {
          id?: string
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
        }
        Relationships: [
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "transaction_captures"
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
      confirm_transaction_capture: {
        Args: {
          p_capture_id: string
          p_confirmation_idempotency_key: string
          p_items: Json
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
      schedule_capture_processing: {
        Args: {
          p_capture_id: string
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
