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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      account_locks: {
        Row: {
          account_id: string
          locked_at: string | null
          locked_by: string | null
          updated_at: string
          version: number
        }
        Insert: {
          account_id: string
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          account_id?: string
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      accounts: {
        Row: {
          balance: number
          closing_date: number | null
          color: string
          created_at: string
          due_date: number | null
          id: string
          limit_amount: number | null
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          closing_date?: number | null
          color?: string
          created_at?: string
          due_date?: number | null
          id?: string
          limit_amount?: number | null
          name: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          closing_date?: number | null
          color?: string
          created_at?: string
          due_date?: number | null
          id?: string
          limit_amount?: number | null
          name?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_history: {
        Row: {
          backup_type: string
          created_at: string
          file_path: string
          file_size: number | null
          id: string
          user_id: string
        }
        Insert: {
          backup_type: string
          created_at?: string
          file_path: string
          file_size?: number | null
          id?: string
          user_id: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          file_path?: string
          file_size?: number | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      backup_schedules: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          last_backup_at: string | null
          next_backup_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          is_active?: boolean
          last_backup_at?: string | null
          next_backup_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_backup_at?: string | null
          next_backup_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["category_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["category_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["category_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          category: Database["public"]["Enums"]["account_category"]
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["account_category"]
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["account_category"]
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["account_nature"]
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit: {
        Row: {
          action: string
          balance_after: number | null
          balance_before: number | null
          created_at: string
          created_by: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          description: string
          entry_date: string
          entry_type: string
          id: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          description: string
          entry_date: string
          entry_type: string
          id?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          days_before: number
          id: string
          notification_time: string
          notify_credit_bills: boolean
          notify_fixed_transactions: boolean
          notify_installments: boolean
          notify_pending_transactions: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_before?: number
          id?: string
          notification_time?: string
          notify_credit_bills?: boolean
          notify_fixed_transactions?: boolean
          notify_installments?: boolean
          notify_pending_transactions?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_before?: number
          id?: string
          notification_time?: string
          notify_credit_bills?: boolean
          notify_fixed_transactions?: boolean
          notify_installments?: boolean
          notify_pending_transactions?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      period_closures: {
        Row: {
          closed_at: string
          closed_by: string
          closure_type: string
          created_at: string
          id: string
          is_locked: boolean
          notes: string | null
          period_end: string
          period_start: string
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string
          closed_by: string
          closure_type: string
          created_at?: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          period_end: string
          period_start: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string
          closed_by?: string
          closure_type?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          period_end?: string
          period_start?: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          subscription_expires_at: string | null
          trial_expires_at: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          subscription_expires_at?: string | null
          trial_expires_at?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          subscription_expires_at?: string | null
          trial_expires_at?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          bank_import_id: string | null
          bank_reference: string | null
          category_id: string | null
          created_at: string
          current_installment: number | null
          date: string
          description: string
          id: string
          installments: number | null
          invoice_month: string | null
          invoice_month_overridden: boolean
          is_fixed: boolean | null
          is_recurring: boolean | null
          linked_transaction_id: string | null
          parent_transaction_id: string | null
          reconciled: boolean | null
          reconciled_at: string | null
          reconciled_by: string | null
          recurrence_end_date: string | null
          recurrence_type: Database["public"]["Enums"]["recurrence_type"] | null
          status: Database["public"]["Enums"]["transaction_status"]
          to_account_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          bank_import_id?: string | null
          bank_reference?: string | null
          category_id?: string | null
          created_at?: string
          current_installment?: number | null
          date: string
          description: string
          id?: string
          installments?: number | null
          invoice_month?: string | null
          invoice_month_overridden?: boolean
          is_fixed?: boolean | null
          is_recurring?: boolean | null
          linked_transaction_id?: string | null
          parent_transaction_id?: string | null
          reconciled?: boolean | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          status?: Database["public"]["Enums"]["transaction_status"]
          to_account_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          bank_import_id?: string | null
          bank_reference?: string | null
          category_id?: string | null
          created_at?: string
          current_installment?: number | null
          date?: string
          description?: string
          id?: string
          installments?: number | null
          invoice_month?: string | null
          invoice_month_overridden?: boolean
          is_fixed?: boolean | null
          is_recurring?: boolean | null
          linked_transaction_id?: string | null
          parent_transaction_id?: string | null
          reconciled?: boolean | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          recurrence_end_date?: string | null
          recurrence_type?:
            | Database["public"]["Enums"]["recurrence_type"]
            | null
          status?: Database["public"]["Enums"]["transaction_status"]
          to_account_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          auto_backup: boolean
          created_at: string
          currency: string
          id: string
          language: string
          notifications: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_backup?: boolean
          created_at?: string
          currency?: string
          id?: string
          language?: string
          notifications?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_backup?: boolean
          created_at?: string
          currency?: string
          id?: string
          language?: string
          notifications?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atomic_delete_transaction: {
        Args: { p_scope?: string; p_transaction_id: string; p_user_id: string }
        Returns: {
          affected_accounts: string[]
          deleted_count: number
          error_message: string
          success: boolean
        }[]
      }
      atomic_update_transaction: {
        Args: {
          p_scope?: string
          p_transaction_id: string
          p_updates: Json
          p_user_id: string
        }
        Returns: {
          affected_accounts: string[]
          error_message: string
          success: boolean
          updated_count: number
        }[]
      }
      bulk_create_transactions: {
        Args: { p_transactions: Json; p_user_id: string }
        Returns: {
          error_message: string
          idx: number
          success: boolean
          transaction_id: string
        }[]
      }
      bulk_create_transfers: {
        Args: { p_transfers: Json; p_user_id: string }
        Returns: {
          error_message: string
          idx: number
          incoming_id: string
          outgoing_id: string
          success: boolean
        }[]
      }
      cleanup_duplicate_initial_balance: {
        Args: never
        Returns: {
          account_id: string
          duplicates_removed: number
        }[]
      }
      cleanup_expired_provisions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      cleanup_orphan_journal_entries: { Args: never; Returns: number }
      create_journal_entries_for_transaction: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      deactivate_expired_subscriptions: { Args: never; Returns: undefined }
      deactivate_expired_trials: { Args: never; Returns: undefined }
      get_system_setting: { Args: { p_setting_key: string }; Returns: string }
      get_transactions_totals:
        | {
            Args: {
              p_account_id?: string
              p_account_type?: string
              p_category_id?: string
              p_date_from?: string
              p_date_to?: string
              p_invoice_month?: string
              p_is_fixed?: string
              p_is_provision?: string
              p_status?: string
              p_type?: string
              p_user_id: string
            }
            Returns: {
              balance: number
              completed_expense: number
              completed_income: number
              pending_expense: number
              pending_income: number
              total_expense: number
              total_income: number
            }[]
          }
        | {
            Args: {
              p_account_id?: string
              p_account_type?: string
              p_category_id?: string
              p_date_from?: string
              p_date_to?: string
              p_invoice_month?: string
              p_is_fixed?: boolean
              p_is_provision?: boolean
              p_search?: string
              p_status?: string
              p_type?: string
              p_user_id: string
            }
            Returns: {
              balance: number
              total_expenses: number
              total_income: number
            }[]
          }
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_roles: {
        Args: { check_user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      has_role: {
        Args: {
          check_user_id: string
          required_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
      initialize_chart_of_accounts: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      initialize_default_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      initialize_default_settings: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: { check_user_id: string }; Returns: boolean }
      is_period_locked: {
        Args: { p_date: string; p_user_id: string }
        Returns: boolean
      }
      is_subscription_active: {
        Args: { check_user_id: string }
        Returns: boolean
      }
      is_trial_active: { Args: { check_user_id: string }; Returns: boolean }
      log_user_activity: {
        Args: {
          p_action: string
          p_new_values?: Json
          p_old_values?: Json
          p_resource_id?: string
          p_resource_type: string
          p_user_id: string
        }
        Returns: string
      }
      migrate_existing_transactions_to_journal: {
        Args: never
        Returns: {
          error_count: number
          processed_count: number
        }[]
      }
      recalculate_account_balance: {
        Args: { p_account_id: string; p_expected_version?: number }
        Returns: {
          error_message: string
          new_balance: number
          new_version: number
          success: boolean
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_double_entry: {
        Args: { p_transaction_id: string }
        Returns: {
          difference: number
          is_valid: boolean
          message: string
          total_credits: number
          total_debits: number
        }[]
      }
      validate_period_entries: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          error_details: Json
          is_valid: boolean
          missing_entries_count: number
          total_transactions: number
          unbalanced_count: number
        }[]
      }
      validate_user_access: { Args: { p_user_id: string }; Returns: boolean }
      verify_journal_entries_balance: {
        Args: { p_transaction_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_category:
        | "asset"
        | "liability"
        | "equity"
        | "revenue"
        | "expense"
        | "contra_asset"
        | "contra_liability"
      account_nature: "debit" | "credit"
      account_type: "checking" | "savings" | "credit" | "investment"
      category_type: "income" | "expense" | "both"
      recurrence_type: "daily" | "weekly" | "monthly" | "yearly"
      transaction_status: "pending" | "completed"
      transaction_type: "income" | "expense" | "transfer"
      user_role: "admin" | "user" | "subscriber" | "trial"
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
      account_category: [
        "asset",
        "liability",
        "equity",
        "revenue",
        "expense",
        "contra_asset",
        "contra_liability",
      ],
      account_nature: ["debit", "credit"],
      account_type: ["checking", "savings", "credit", "investment"],
      category_type: ["income", "expense", "both"],
      recurrence_type: ["daily", "weekly", "monthly", "yearly"],
      transaction_status: ["pending", "completed"],
      transaction_type: ["income", "expense", "transfer"],
      user_role: ["admin", "user", "subscriber", "trial"],
    },
  },
} as const
