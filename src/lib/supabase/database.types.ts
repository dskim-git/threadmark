export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          target_key: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          target_key?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          target_key?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      capture_projects: {
        Row: {
          capture_id: string
          created_at: string
          owner_id: string
          project_id: string
        }
        Insert: {
          capture_id: string
          created_at?: string
          owner_id?: string
          project_id: string
        }
        Update: {
          capture_id?: string
          created_at?: string
          owner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_projects_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_tags: {
        Row: {
          capture_id: string
          created_at: string
          owner_id: string
          tag_id: string
        }
        Insert: {
          capture_id: string
          created_at?: string
          owner_id?: string
          tag_id: string
        }
        Update: {
          capture_id?: string
          created_at?: string
          owner_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_tags_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      captures: {
        Row: {
          ai_generated: boolean
          capture_type: Database["public"]["Enums"]["capture_type"]
          content: string | null
          created_at: string
          deleted_at: string | null
          id: string
          locator: Json
          original_text: string | null
          owner_id: string
          source_id: string | null
          starred: boolean
          translated_at: string | null
          translated_text: string | null
          translation_language: string | null
          translation_model: string | null
          translation_provider: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["capture_verification_status"]
        }
        Insert: {
          ai_generated?: boolean
          capture_type: Database["public"]["Enums"]["capture_type"]
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          locator?: Json
          original_text?: string | null
          owner_id?: string
          source_id?: string | null
          starred?: boolean
          translated_at?: string | null
          translated_text?: string | null
          translation_language?: string | null
          translation_model?: string | null
          translation_provider?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["capture_verification_status"]
        }
        Update: {
          ai_generated?: boolean
          capture_type?: Database["public"]["Enums"]["capture_type"]
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          locator?: Json
          original_text?: string | null
          owner_id?: string
          source_id?: string | null
          starred?: boolean
          translated_at?: string | null
          translated_text?: string | null
          translation_language?: string | null
          translation_model?: string | null
          translation_provider?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["capture_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "captures_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      google_drive_connections: {
        Row: {
          connected_at: string
          created_at: string
          encrypted_refresh_token: string
          folder_ids: Json
          granted_scope: string
          last_error: string | null
          last_used_at: string | null
          root_folder_id: string | null
          status: Database["public"]["Enums"]["drive_connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          created_at?: string
          encrypted_refresh_token: string
          folder_ids?: Json
          granted_scope: string
          last_error?: string | null
          last_used_at?: string | null
          root_folder_id?: string | null
          status?: Database["public"]["Enums"]["drive_connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          created_at?: string
          encrypted_refresh_token?: string
          folder_ids?: Json
          granted_scope?: string
          last_error?: string | null
          last_used_at?: string | null
          root_folder_id?: string | null
          status?: Database["public"]["Enums"]["drive_connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      paper_analyses: {
        Row: {
          agreements_objections: string | null
          analysis_method: string | null
          cautions: string | null
          created_at: string
          data_collection: string | null
          discovery_path: string | null
          discussion: string | null
          expected_relevance: string | null
          first_impression: string | null
          future_research: string | null
          id: string
          implications: string | null
          intended_audience: string | null
          key_concepts: string | null
          key_findings: string | null
          limitations: string | null
          main_argument: string | null
          my_interpretation: string | null
          owner_id: string
          paraphrase_candidates: string | null
          participants: string | null
          quote_candidates: string | null
          reading_purpose: string | null
          research_method: string | null
          research_purpose: string | null
          research_questions: string | null
          research_topic: string | null
          significance: string | null
          source_id: string
          study_context: string | null
          study_type: string | null
          supports_claim: string | null
          theoretical_background: string | null
          updated_at: string
          where_to_use: string | null
        }
        Insert: {
          agreements_objections?: string | null
          analysis_method?: string | null
          cautions?: string | null
          created_at?: string
          data_collection?: string | null
          discovery_path?: string | null
          discussion?: string | null
          expected_relevance?: string | null
          first_impression?: string | null
          future_research?: string | null
          id?: string
          implications?: string | null
          intended_audience?: string | null
          key_concepts?: string | null
          key_findings?: string | null
          limitations?: string | null
          main_argument?: string | null
          my_interpretation?: string | null
          owner_id?: string
          paraphrase_candidates?: string | null
          participants?: string | null
          quote_candidates?: string | null
          reading_purpose?: string | null
          research_method?: string | null
          research_purpose?: string | null
          research_questions?: string | null
          research_topic?: string | null
          significance?: string | null
          source_id: string
          study_context?: string | null
          study_type?: string | null
          supports_claim?: string | null
          theoretical_background?: string | null
          updated_at?: string
          where_to_use?: string | null
        }
        Update: {
          agreements_objections?: string | null
          analysis_method?: string | null
          cautions?: string | null
          created_at?: string
          data_collection?: string | null
          discovery_path?: string | null
          discussion?: string | null
          expected_relevance?: string | null
          first_impression?: string | null
          future_research?: string | null
          id?: string
          implications?: string | null
          intended_audience?: string | null
          key_concepts?: string | null
          key_findings?: string | null
          limitations?: string | null
          main_argument?: string | null
          my_interpretation?: string | null
          owner_id?: string
          paraphrase_candidates?: string | null
          participants?: string | null
          quote_candidates?: string | null
          reading_purpose?: string | null
          research_method?: string | null
          research_purpose?: string | null
          research_questions?: string | null
          research_topic?: string | null
          significance?: string | null
          source_id?: string
          study_context?: string | null
          study_type?: string | null
          supports_claim?: string | null
          theoretical_background?: string | null
          updated_at?: string
          where_to_use?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_analyses_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_profiles: {
        Row: {
          abstract: string | null
          authors: Json
          citation_override: string | null
          created_at: string
          doi: string | null
          id: string
          issn: string | null
          issue: string | null
          journal_name: string | null
          keywords: string[]
          original_language: string | null
          owner_id: string
          page_range: string | null
          publication_year: number | null
          source_id: string
          updated_at: string
          volume: string | null
        }
        Insert: {
          abstract?: string | null
          authors?: Json
          citation_override?: string | null
          created_at?: string
          doi?: string | null
          id?: string
          issn?: string | null
          issue?: string | null
          journal_name?: string | null
          keywords?: string[]
          original_language?: string | null
          owner_id?: string
          page_range?: string | null
          publication_year?: number | null
          source_id: string
          updated_at?: string
          volume?: string | null
        }
        Update: {
          abstract?: string | null
          authors?: Json
          citation_override?: string | null
          created_at?: string
          doi?: string | null
          id?: string
          issn?: string | null
          issue?: string | null
          journal_name?: string | null
          keywords?: string[]
          original_language?: string | null
          owner_id?: string
          page_range?: string | null
          publication_year?: number | null
          source_id?: string
          updated_at?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_profiles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_project_uses: {
        Row: {
          cautions: string | null
          citation_plan: string | null
          created_at: string
          id: string
          interpretation: string | null
          owner_id: string
          paper_source_id: string
          planned_section: string | null
          project_id: string
          status: Database["public"]["Enums"]["paper_use_status"]
          updated_at: string
          usage_intent: string | null
        }
        Insert: {
          cautions?: string | null
          citation_plan?: string | null
          created_at?: string
          id?: string
          interpretation?: string | null
          owner_id?: string
          paper_source_id: string
          planned_section?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["paper_use_status"]
          updated_at?: string
          usage_intent?: string | null
        }
        Update: {
          cautions?: string | null
          citation_plan?: string | null
          created_at?: string
          id?: string
          interpretation?: string | null
          owner_id?: string
          paper_source_id?: string
          planned_section?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["paper_use_status"]
          updated_at?: string
          usage_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_project_uses_paper_source_id_fkey"
            columns: ["paper_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_project_uses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          preferred_language: string
          rejected_at: string | null
          requested_at: string
          status: Database["public"]["Enums"]["user_status"]
          status_changed_by: string | null
          status_reason: string | null
          suspended_at: string | null
          theme_fonts: string
          theme_mode: string
          theme_palette: string
          timezone: string
          translation_target_language: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          preferred_language?: string
          rejected_at?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_by?: string | null
          status_reason?: string | null
          suspended_at?: string | null
          theme_fonts?: string
          theme_mode?: string
          theme_palette?: string
          timezone?: string
          translation_target_language?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          preferred_language?: string
          rejected_at?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["user_status"]
          status_changed_by?: string | null
          status_reason?: string | null
          suspended_at?: string | null
          theme_fonts?: string
          theme_mode?: string
          theme_palette?: string
          timezone?: string
          translation_target_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          owner_id: string
          project_type: string | null
          research_question: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_output: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["project_visibility"]
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          owner_id?: string
          project_type?: string | null
          research_question?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_output?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          owner_id?: string
          project_type?: string | null
          research_question?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_output?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Relationships: []
      }
      source_files: {
        Row: {
          byte_size: number
          checksum: string | null
          created_at: string
          drive_file_id: string | null
          drive_modified_at: string | null
          file_name: string
          id: string
          last_page: number | null
          last_verified_at: string | null
          last_zoom: number | null
          mime_type: string
          origin: Database["public"]["Enums"]["source_file_origin"]
          owner_id: string
          source_id: string
          status: Database["public"]["Enums"]["source_file_status"]
          updated_at: string
        }
        Insert: {
          byte_size: number
          checksum?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_modified_at?: string | null
          file_name: string
          id?: string
          last_page?: number | null
          last_verified_at?: string | null
          last_zoom?: number | null
          mime_type: string
          origin?: Database["public"]["Enums"]["source_file_origin"]
          owner_id?: string
          source_id: string
          status?: Database["public"]["Enums"]["source_file_status"]
          updated_at?: string
        }
        Update: {
          byte_size?: number
          checksum?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_modified_at?: string | null
          file_name?: string
          id?: string
          last_page?: number | null
          last_verified_at?: string | null
          last_zoom?: number | null
          mime_type?: string
          origin?: Database["public"]["Enums"]["source_file_origin"]
          owner_id?: string
          source_id?: string
          status?: Database["public"]["Enums"]["source_file_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_files_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_projects: {
        Row: {
          created_at: string
          owner_id: string
          project_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          owner_id?: string
          project_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          project_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_projects_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_relations: {
        Row: {
          created_at: string
          from_source_id: string
          id: string
          owner_id: string
          relation_type: Database["public"]["Enums"]["source_relation_type"]
          to_source_id: string
        }
        Insert: {
          created_at?: string
          from_source_id: string
          id?: string
          owner_id?: string
          relation_type: Database["public"]["Enums"]["source_relation_type"]
          to_source_id: string
        }
        Update: {
          created_at?: string
          from_source_id?: string
          id?: string
          owner_id?: string
          relation_type?: Database["public"]["Enums"]["source_relation_type"]
          to_source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_relations_from_source_id_fkey"
            columns: ["from_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_relations_to_source_id_fkey"
            columns: ["to_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_tags: {
        Row: {
          created_at: string
          owner_id: string
          source_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          owner_id?: string
          source_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          source_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_tags_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          canonical_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          metadata: Json
          original_url: string | null
          owner_id: string
          starred: boolean
          status: Database["public"]["Enums"]["source_status"]
          subtitle: string | null
          thumbnail_url: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["source_visibility"]
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          original_url?: string | null
          owner_id?: string
          starred?: boolean
          status?: Database["public"]["Enums"]["source_status"]
          subtitle?: string | null
          thumbnail_url?: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["source_visibility"]
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          original_url?: string | null
          owner_id?: string
          starred?: boolean
          status?: Database["public"]["Enums"]["source_status"]
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["source_visibility"]
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_capture_owned: {
        Args: { p_capture_id: string; p_owner_id: string }
        Returns: undefined
      }
      assert_project_owned: {
        Args: { p_owner_id: string; p_project_id: string }
        Returns: undefined
      }
      assert_source_owned: {
        Args: { p_owner_id: string; p_source_id: string }
        Returns: undefined
      }
      assert_tag_owned: {
        Args: { p_owner_id: string; p_tag_id: string }
        Returns: undefined
      }
      count_admins: { Args: never; Returns: number }
      is_active_user: { Args: { check_user_id?: string }; Returns: boolean }
      is_admin: { Args: { check_user_id?: string }; Returns: boolean }
      paper_authors_valid: { Args: { value: Json }; Returns: boolean }
      soft_delete_capture: { Args: { capture_id: string }; Returns: boolean }
      soft_delete_project: { Args: { project_id: string }; Returns: boolean }
      soft_delete_source: { Args: { source_id: string }; Returns: boolean }
      starred_only_change: {
        Args: { new_row: Json; old_row: Json }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
      capture_type:
        | "quote"
        | "translation"
        | "summary"
        | "paraphrase"
        | "interpretation"
        | "question"
        | "counterpoint"
        | "idea"
        | "todo"
        | "note"
        | "handwriting"
        | "voice"
      capture_verification_status:
        | "user_written"
        | "machine_generated"
        | "user_edited"
      drive_connection_status: "connected" | "revoked" | "error"
      paper_use_status: "planned" | "used"
      project_status: "active"
      project_visibility: "private"
      source_file_origin: "upload" | "picked"
      source_file_status: "pending" | "ready" | "missing"
      source_relation_type:
        | "cites"
        | "cited_by"
        | "found_in_references"
        | "similar_study"
        | "contradicts"
        | "theoretical_basis"
        | "method_reference"
        | "follow_up_reading"
      source_status: "active" | "reading_candidate"
      source_type:
        | "paper"
        | "book"
        | "website"
        | "music"
        | "youtube"
        | "media"
        | "pdf"
        | "image"
        | "drawing"
        | "audio"
        | "note"
      source_visibility: "private"
      user_status: "pending" | "active" | "rejected" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      capture_type: [
        "quote",
        "translation",
        "summary",
        "paraphrase",
        "interpretation",
        "question",
        "counterpoint",
        "idea",
        "todo",
        "note",
        "handwriting",
        "voice",
      ],
      capture_verification_status: [
        "user_written",
        "machine_generated",
        "user_edited",
      ],
      drive_connection_status: ["connected", "revoked", "error"],
      paper_use_status: ["planned", "used"],
      project_status: ["active"],
      project_visibility: ["private"],
      source_file_origin: ["upload", "picked"],
      source_file_status: ["pending", "ready", "missing"],
      source_relation_type: [
        "cites",
        "cited_by",
        "found_in_references",
        "similar_study",
        "contradicts",
        "theoretical_basis",
        "method_reference",
        "follow_up_reading",
      ],
      source_status: ["active", "reading_candidate"],
      source_type: [
        "paper",
        "book",
        "website",
        "music",
        "youtube",
        "media",
        "pdf",
        "image",
        "drawing",
        "audio",
        "note",
      ],
      source_visibility: ["private"],
      user_status: ["pending", "active", "rejected", "suspended"],
    },
  },
} as const
