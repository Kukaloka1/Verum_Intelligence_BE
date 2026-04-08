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
      chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          document_version_id: string
          embedding: string | null
          id: string
          jurisdiction_id: string
          metadata: Json
          regulator_id: string
          search_vector: unknown
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          document_version_id: string
          embedding?: string | null
          id?: string
          jurisdiction_id: string
          metadata?: Json
          regulator_id: string
          search_vector?: unknown
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          document_version_id?: string
          embedding?: string | null
          id?: string
          jurisdiction_id?: string
          metadata?: Json
          regulator_id?: string
          search_vector?: unknown
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          content_snapshot: string
          created_at: string
          document_id: string
          fetched_at: string
          id: string
          version_hash: string
        }
        Insert: {
          content_snapshot: string
          created_at?: string
          document_id: string
          fetched_at?: string
          id?: string
          version_hash: string
        }
        Update: {
          content_snapshot?: string
          created_at?: string
          document_id?: string
          fetched_at?: string
          id?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          effective_at: string | null
          hash: string
          id: string
          jurisdiction_id: string
          normalized_status: string
          published_at: string | null
          raw_url: string
          regulator_id: string
          slug: string
          source_id: string
          source_type: string
          summary: string | null
          title: string
          title_search_vector: unknown
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_at?: string | null
          hash: string
          id?: string
          jurisdiction_id: string
          normalized_status?: string
          published_at?: string | null
          raw_url: string
          regulator_id: string
          slug: string
          source_id: string
          source_type: string
          summary?: string | null
          title: string
          title_search_vector?: unknown
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_at?: string | null
          hash?: string
          id?: string
          jurisdiction_id?: string
          normalized_status?: string
          published_at?: string | null
          raw_url?: string
          regulator_id?: string
          slug?: string
          source_id?: string
          source_type?: string
          summary?: string | null
          title?: string
          title_search_vector?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdictions: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
      query_citations: {
        Row: {
          chunk_id: string | null
          citation_order: number
          created_at: string
          document_id: string | null
          document_title: string
          id: string
          published_at: string | null
          query_log_id: string
          source_name: string
          source_type: string | null
          url: string | null
        }
        Insert: {
          chunk_id?: string | null
          citation_order: number
          created_at?: string
          document_id?: string | null
          document_title: string
          id?: string
          published_at?: string | null
          query_log_id: string
          source_name: string
          source_type?: string | null
          url?: string | null
        }
        Update: {
          chunk_id?: string | null
          citation_order?: number
          created_at?: string
          document_id?: string | null
          document_title?: string
          id?: string
          published_at?: string | null
          query_log_id?: string
          source_name?: string
          source_type?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "query_citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "query_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "query_citations_query_log_id_fkey"
            columns: ["query_log_id"]
            isOneToOne: false
            referencedRelation: "query_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      query_logs: {
        Row: {
          created_at: string
          id: string
          jurisdiction_id: string | null
          query_text: string
          result_status: string
          retrieval_metadata: Json
          sources_used: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          query_text: string
          result_status?: string
          retrieval_metadata?: Json
          sources_used?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          query_text?: string
          result_status?: string
          retrieval_metadata?: Json
          sources_used?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "query_logs_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      regulators: {
        Row: {
          created_at: string
          id: string
          jurisdiction_id: string
          name: string
          official_url: string | null
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_id: string
          name: string
          official_url?: string | null
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_id?: string
          name?: string
          official_url?: string | null
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulators_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_queries: {
        Row: {
          answer_snapshot: Json
          created_at: string
          id: string
          jurisdiction_id: string | null
          query_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_snapshot: Json
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          query_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_snapshot?: Json
          created_at?: string
          id?: string
          jurisdiction_id?: string | null
          query_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_queries_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          check_method: string
          created_at: string
          id: string
          jurisdiction_id: string
          last_checked_at: string | null
          regulator_id: string
          rss_url: string | null
          slug: string
          source_type: string
          status: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          check_method?: string
          created_at?: string
          id?: string
          jurisdiction_id: string
          last_checked_at?: string | null
          regulator_id: string
          rss_url?: string | null
          slug: string
          source_type: string
          status?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          check_method?: string
          created_at?: string
          id?: string
          jurisdiction_id?: string
          last_checked_at?: string | null
          regulator_id?: string
          rss_url?: string | null
          slug?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_regulator_id_fkey"
            columns: ["regulator_id"]
            isOneToOne: false
            referencedRelation: "regulators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
