// Tipos del esquema public. Reflejan supabase/migrations.
// Cuando el esquema crezca se pueden regenerar con:
//   npx supabase gen types typescript --linked --schema public
// (revisa el resultado antes de sobrescribir este archivo).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "super_admin" | "tenant_admin" | "operator";

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
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      app_role: AppRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
