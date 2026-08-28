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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          industry: string | null
          name: string
          owner_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          owner_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      case_events: {
        Row: {
          actor_id: string | null
          business_id: string
          case_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          business_id: string
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          business_id?: string
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "case_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "removal_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          country: string | null
          created_at: string
          google_place_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          business_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      removal_cases: {
        Row: {
          appealed_at: string | null
          assigned_to: string | null
          business_id: string
          case_number: number
          created_at: string
          created_by: string
          evidence: Json
          id: string
          location_id: string | null
          notes: string | null
          reported_at: string | null
          resolved_at: string | null
          review_id: string
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
          violation_category: Database["public"]["Enums"]["violation_category"]
        }
        Insert: {
          appealed_at?: string | null
          assigned_to?: string | null
          business_id: string
          case_number?: number
          created_at?: string
          created_by: string
          evidence?: Json
          id?: string
          location_id?: string | null
          notes?: string | null
          reported_at?: string | null
          resolved_at?: string | null
          review_id: string
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          violation_category?: Database["public"]["Enums"]["violation_category"]
        }
        Update: {
          appealed_at?: string | null
          assigned_to?: string | null
          business_id?: string
          case_number?: number
          created_at?: string
          created_by?: string
          evidence?: Json
          id?: string
          location_id?: string | null
          notes?: string | null
          reported_at?: string | null
          resolved_at?: string | null
          review_id?: string
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          violation_category?: Database["public"]["Enums"]["violation_category"]
        }
        Relationships: [
          {
            foreignKeyName: "removal_cases_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_cases_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_cases_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          ai_confidence: number | null
          ai_evidence: Json
          ai_explanation: string | null
          business_id: string
          created_at: string
          id: string
          is_legitimate_negative: boolean
          location_id: string | null
          priority: Database["public"]["Enums"]["review_priority"]
          rating: number
          recommended_action: string | null
          review_date: string
          review_text: string
          reviewer_name: string
          reviewer_profile_url: string | null
          scan_status: Database["public"]["Enums"]["scan_status"]
          scanned_at: string | null
          source_review_id: string | null
          updated_at: string
          violation_category:
            | Database["public"]["Enums"]["violation_category"]
            | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_evidence?: Json
          ai_explanation?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_legitimate_negative?: boolean
          location_id?: string | null
          priority?: Database["public"]["Enums"]["review_priority"]
          rating?: number
          recommended_action?: string | null
          review_date?: string
          review_text?: string
          reviewer_name?: string
          reviewer_profile_url?: string | null
          scan_status?: Database["public"]["Enums"]["scan_status"]
          scanned_at?: string | null
          source_review_id?: string | null
          updated_at?: string
          violation_category?:
            | Database["public"]["Enums"]["violation_category"]
            | null
        }
        Update: {
          ai_confidence?: number | null
          ai_evidence?: Json
          ai_explanation?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_legitimate_negative?: boolean
          location_id?: string | null
          priority?: Database["public"]["Enums"]["review_priority"]
          rating?: number
          recommended_action?: string | null
          review_date?: string
          review_text?: string
          reviewer_name?: string
          reviewer_profile_url?: string | null
          scan_status?: Database["public"]["Enums"]["scan_status"]
          scanned_at?: string | null
          source_review_id?: string | null
          updated_at?: string
          violation_category?:
            | Database["public"]["Enums"]["violation_category"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_jobs: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          error_message: string | null
          flagged_reviews: number
          id: string
          lease_expires_at: string | null
          processed_reviews: number
          status: Database["public"]["Enums"]["job_status"]
          total_reviews: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          error_message?: string | null
          flagged_reviews?: number
          id?: string
          lease_expires_at?: string | null
          processed_reviews?: number
          status?: Database["public"]["Enums"]["job_status"]
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          error_message?: string | null
          flagged_reviews?: number
          id?: string
          lease_expires_at?: string | null
          processed_reviews?: number
          status?: Database["public"]["Enums"]["job_status"]
          total_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      has_business_access: { Args: { _business_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "analyst"
      case_status:
        | "new"
        | "reviewing"
        | "evidence_ready"
        | "reported"
        | "appeal"
        | "resolved"
        | "rejected"
      job_status: "running" | "paused" | "completed" | "failed"
      review_priority: "high" | "medium" | "review_required" | "normal"
      scan_status: "unscanned" | "queued" | "scanning" | "scanned" | "failed"
      violation_category:
        | "spam"
        | "fake_content"
        | "off_topic"
        | "conflict_of_interest"
        | "harassment"
        | "abuse"
        | "threats"
        | "extortion"
        | "personal_information"
        | "promotional"
        | "other"
        | "none"
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
    Enums: {
      app_role: ["admin", "manager", "analyst"],
      case_status: [
        "new",
        "reviewing",
        "evidence_ready",
        "reported",
        "appeal",
        "resolved",
        "rejected",
      ],
      job_status: ["running", "paused", "completed", "failed"],
      review_priority: ["high", "medium", "review_required", "normal"],
      scan_status: ["unscanned", "queued", "scanning", "scanned", "failed"],
      violation_category: [
        "spam",
        "fake_content",
        "off_topic",
        "conflict_of_interest",
        "harassment",
        "abuse",
        "threats",
        "extortion",
        "personal_information",
        "promotional",
        "other",
        "none",
      ],
    },
  },
} as const
