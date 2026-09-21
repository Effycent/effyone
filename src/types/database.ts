// Tipos del esquema public. Reflejan supabase/migrations.
// Cuando el esquema crezca se pueden regenerar con:
//   npx supabase gen types typescript --linked --schema public
// (revisa el resultado antes de sobrescribir este archivo).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "super_admin" | "tenant_admin" | "operator";
export type SubscriptionStatus = "active" | "past_due" | "suspended" | "canceled";
export type AccessState = "full" | "grace" | "read_only" | "suspended" | "canceled";
export type FeatureKind = "boolean" | "limit";
export type FeatureCategory = "limits" | "tournament" | "public" | "management" | "integrations";
export type FeatureAvailability = "available" | "coming_soon";

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          country: string;
          timezone: string;
          logo_path: string | null;
          brand_primary: string | null;
          brand_secondary: string | null;
          plan_id: string;
          subscription_status: SubscriptionStatus;
          past_due_since: string | null;
          suspended_at: string | null;
          canceled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          country: string;
          timezone: string;
          logo_path?: string | null;
          brand_primary?: string | null;
          brand_secondary?: string | null;
          plan_id?: string;
          subscription_status?: SubscriptionStatus;
          past_due_since?: string | null;
          suspended_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          country?: string;
          timezone?: string;
          logo_path?: string | null;
          brand_primary?: string | null;
          brand_secondary?: string | null;
          plan_id?: string;
          subscription_status?: SubscriptionStatus;
          past_due_since?: string | null;
          suspended_at?: string | null;
          canceled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string | null;
          role: AppRole;
          full_name: string;
          is_active: boolean;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id?: string | null;
          role: AppRole;
          full_name: string;
          is_active?: boolean;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          role?: AppRole;
          full_name?: string;
          is_active?: boolean;
          must_change_password?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_catalog: {
        Row: {
          feature_key: string;
          kind: FeatureKind;
          category: FeatureCategory;
          name: string;
          benefit: string;
          unit: string | null;
          availability: FeatureAvailability;
          phase: number | null;
          sort_order: number;
          paused_when_readonly: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_cents: number;
          currency: string;
          sort_order: number;
          is_active: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          sort_order?: number;
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          sort_order?: number;
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_features: {
        Row: {
          plan_id: string;
          feature_key: string;
          enabled: boolean;
          limit_value: number | null;
        };
        Insert: {
          plan_id: string;
          feature_key: string;
          enabled?: boolean;
          limit_value?: number | null;
        };
        Update: {
          plan_id?: string;
          feature_key?: string;
          enabled?: boolean;
          limit_value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_features_feature_key_fkey";
            columns: ["feature_key"];
            isOneToOne: false;
            referencedRelation: "feature_catalog";
            referencedColumns: ["feature_key"];
          },
        ];
      };
      addons: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_cents: number;
          currency: string;
          billing_unit: "tournament_month" | "tenant_month";
          required_feature_key: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          billing_unit?: "tournament_month" | "tenant_month";
          required_feature_key?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          billing_unit?: "tournament_month" | "tenant_month";
          required_feature_key?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          id: boolean;
          grace_days: number;
          canceled_retention_days: number;
          updated_at: string;
        };
        Insert: never;
        Update: {
          grace_days?: number;
          canceled_retention_days?: number;
        };
        Relationships: [];
      };
      tenant_subscription_events: {
        Row: {
          id: number;
          tenant_id: string;
          event_type: "plan_changed" | "status_changed";
          from_value: string | null;
          to_value: string | null;
          note: string | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      tenant_overview: {
        Row: {
          id: string;
          slug: string;
          name: string;
          country: string;
          timezone: string;
          created_at: string;
          plan_id: string;
          plan_code: string;
          plan_name: string;
          price_cents: number;
          currency: string;
          subscription_status: SubscriptionStatus;
          past_due_since: string | null;
          suspended_at: string | null;
          canceled_at: string | null;
          access_state: AccessState;
          grace_ends_at: string | null;
          purge_eligible_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      tenant_has_feature: {
        Args: { p_tenant_id: string; p_feature_key: string };
        Returns: boolean;
      };
      tenant_feature_limit: {
        Args: { p_tenant_id: string; p_feature_key: string };
        Returns: number | null;
      };
      tenant_entitlements: {
        Args: { p_tenant_id: string };
        Returns: {
          feature_key: string;
          kind: FeatureKind;
          enabled: boolean;
          limit_value: number | null;
          unlimited: boolean;
          availability: FeatureAvailability;
        }[];
      };
      admin_set_tenant_plan: {
        Args: { p_tenant_id: string; p_plan_id: string; p_note?: string };
        Returns: undefined;
      };
      admin_set_subscription_status: {
        Args: { p_tenant_id: string; p_status: SubscriptionStatus; p_note?: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: AppRole;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type PlanFeature = Database["public"]["Tables"]["plan_features"]["Row"];
export type FeatureCatalogItem = Database["public"]["Tables"]["feature_catalog"]["Row"];
export type Addon = Database["public"]["Tables"]["addons"]["Row"];
export type PlatformSettings = Database["public"]["Tables"]["platform_settings"]["Row"];
export type SubscriptionEvent = Database["public"]["Tables"]["tenant_subscription_events"]["Row"];
export type TenantOverview = Database["public"]["Views"]["tenant_overview"]["Row"];
