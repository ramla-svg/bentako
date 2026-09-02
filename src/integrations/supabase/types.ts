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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          store_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id: string
          metadata?: Json
          store_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          cash_after: number | null
          cash_before: number | null
          created_at: string
          created_by: string | null
          customer_mobile_number: string | null
          customer_name: string | null
          id: string
          provider: Database["public"]["Enums"]["service_provider"]
          reference_number: string | null
          service_fee: number
          status: string
          store_id: string
          transaction_type: Database["public"]["Enums"]["cash_txn_type"]
          updated_at: string
          wallet_after: number | null
          wallet_before: number | null
        }
        Insert: {
          amount?: number
          cash_after?: number | null
          cash_before?: number | null
          created_at?: string
          created_by?: string | null
          customer_mobile_number?: string | null
          customer_name?: string | null
          id: string
          provider?: Database["public"]["Enums"]["service_provider"]
          reference_number?: string | null
          service_fee?: number
          status?: string
          store_id: string
          transaction_type: Database["public"]["Enums"]["cash_txn_type"]
          updated_at?: string
          wallet_after?: number | null
          wallet_before?: number | null
        }
        Update: {
          amount?: number
          cash_after?: number | null
          cash_before?: number | null
          created_at?: string
          created_by?: string | null
          customer_mobile_number?: string | null
          customer_name?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["service_provider"]
          reference_number?: string | null
          service_fee?: number
          status?: string
          store_id?: string
          transaction_type?: Database["public"]["Enums"]["cash_txn_type"]
          updated_at?: string
          wallet_after?: number | null
          wallet_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          sale_id: string | null
          store_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id: string
          notes?: string | null
          sale_id?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          sale_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          credit_balance: number
          id: string
          is_active: boolean
          mobile_number: string | null
          name: string
          notes: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_balance?: number
          id: string
          is_active?: boolean
          mobile_number?: string | null
          name: string
          notes?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_balance?: number
          id?: string
          is_active?: boolean
          mobile_number?: string | null
          name?: string
          notes?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          is_active: boolean
          notes: string | null
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id: string
          is_active?: boolean
          notes?: string | null
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          new_stock: number
          notes: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reference_id: string | null
          store_id: string
          supplier: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id: string
          quantity: number
          reference_id?: string | null
          store_id: string
          supplier?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reference_id?: string | null
          store_id?: string
          supplier?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number
          name: string
          selling_price: number
          sku: string | null
          stock_quantity: number
          store_id: string
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name: string
          selling_price?: number
          sku?: string | null
          stock_quantity?: number
          store_id: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number
          name?: string
          selling_price?: number
          sku?: string | null
          stock_quantity?: number
          store_id?: string
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          pin_hash: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          pin_hash?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          pin_hash?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          category_name_snapshot: string | null
          cost_price_snapshot: number
          created_at: string
          id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          sale_id: string
          selling_price_snapshot: number
          store_id: string
          subtotal: number
        }
        Insert: {
          category_name_snapshot?: string | null
          cost_price_snapshot?: number
          created_at?: string
          id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          sale_id: string
          selling_price_snapshot?: number
          store_id: string
          subtotal?: number
        }
        Update: {
          category_name_snapshot?: string | null
          cost_price_snapshot?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          sale_id?: string
          selling_price_snapshot?: number
          store_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_received: number
          cashier_id: string | null
          cashier_name: string | null
          change_amount: number
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal: number
          total: number
          transaction_number: string
          updated_at: string
        }
        Insert: {
          cash_received?: number
          cashier_id?: string | null
          cashier_name?: string | null
          change_amount?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          id: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["sale_status"]
          store_id: string
          subtotal?: number
          total?: number
          transaction_number: string
          updated_at?: string
        }
        Update: {
          cash_received?: number
          cashier_id?: string | null
          cashier_name?: string | null
          change_amount?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["sale_status"]
          store_id?: string
          subtotal?: number
          total?: number
          transaction_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          allow_negative_stock: boolean
          confirm_void: boolean
          created_at: string
          currency: string
          default_low_stock_threshold: number
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          owner_name: string | null
          receipt_footer: string | null
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          confirm_void?: boolean
          created_at?: string
          currency?: string
          default_low_stock_threshold?: number
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          owner_name?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          confirm_void?: boolean
          created_at?: string
          currency?: string
          default_low_stock_threshold?: number
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          owner_name?: string | null
          receipt_footer?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_store_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "cashier"
      cash_txn_type: "cash_in" | "cash_out"
      movement_type:
        | "stock_in"
        | "sale"
        | "adjustment_add"
        | "adjustment_remove"
        | "damaged"
        | "expired"
        | "returned"
        | "cashout_related"
        | "supplier_purchase"
        | "void_restore"
      payment_method: "cash" | "gcash" | "maya" | "bank" | "other"
      sale_status: "completed" | "voided"
      service_provider: "gcash" | "maya" | "bank" | "remittance" | "other"
      unit_type:
        | "piece"
        | "pack"
        | "sachet"
        | "bottle"
        | "can"
        | "box"
        | "kilo"
        | "gram"
        | "liter"
        | "ml"
        | "other"
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
      app_role: ["owner", "cashier"],
      cash_txn_type: ["cash_in", "cash_out"],
      movement_type: [
        "stock_in",
        "sale",
        "adjustment_add",
        "adjustment_remove",
        "damaged",
        "expired",
        "returned",
        "cashout_related",
        "supplier_purchase",
        "void_restore",
      ],
      payment_method: ["cash", "gcash", "maya", "bank", "other"],
      sale_status: ["completed", "voided"],
      service_provider: ["gcash", "maya", "bank", "remittance", "other"],
      unit_type: [
        "piece",
        "pack",
        "sachet",
        "bottle",
        "can",
        "box",
        "kilo",
        "gram",
        "liter",
        "ml",
        "other",
      ],
    },
  },
} as const
