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
export type NotificationSeverity = "info" | "warning" | "critical";
export type TournamentFormat = "round_robin" | "single_elimination";
export type TournamentStatus = "draft" | "scheduled" | "in_progress" | "finished" | "archived";
export type StageStatus = "draft" | "scheduled" | "in_progress" | "finished";
export type SeedingMethod = "random" | "manual";
export type EntryStatus = "registered" | "withdrawn";
export type TiebreakerCode = "head_to_head" | "goal_diff" | "goals_for" | "wins" | "fewer_cards";
export type MatchStatus = "scheduled" | "in_progress" | "finished" | "canceled";

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
          email_channel_enabled: boolean;
          updated_at: string;
        };
        Insert: never;
        Update: {
          grace_days?: number;
          canceled_retention_days?: number;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: number;
          audience: "tenant" | "platform";
          tenant_id: string | null;
          kind: string;
          severity: NotificationSeverity;
          title: string;
          body: string | null;
          link: string | null;
          dedupe_key: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notification_reads: {
        Row: {
          notification_id: number;
          user_id: string;
          read_at: string;
        };
        Insert: {
          notification_id: number;
          user_id: string;
          read_at?: string;
        };
        Update: never;
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
      sports: {
        Row: {
          id: string;
          code: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      tournaments: {
        Row: {
          id: string;
          tenant_id: string;
          sport_id: string;
          name: string;
          status: TournamentStatus;
          is_public: boolean;
          discipline_yellow_for_suspension: number | null;
          discipline_suspension_matches: number;
          discipline_red_suspension_matches: number;
          discipline_cards_reset_between_stages: boolean;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: never; // se crea con la función create_tournament()
        Update: {
          name?: string;
          is_public?: boolean;
          status?: TournamentStatus;
          archived_at?: string | null;
          discipline_yellow_for_suspension?: number | null;
          discipline_suspension_matches?: number;
          discipline_red_suspension_matches?: number;
          discipline_cards_reset_between_stages?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "tournaments_sport_id_fkey";
            columns: ["sport_id"];
            isOneToOne: false;
            referencedRelation: "sports";
            referencedColumns: ["id"];
          },
        ];
      };
      tournament_stages: {
        Row: {
          id: string;
          tournament_id: string;
          stage_order: number;
          name: string;
          format: TournamentFormat;
          status: StageStatus;
          round_robin_legs: number | null;
          win_points: number | null;
          draw_points: number | null;
          loss_points: number | null;
          tie_breakers: TiebreakerCode[] | null;
          bracket_seeding: SeedingMethod | null;
          third_place_match: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tournament_groups: {
        Row: {
          id: string;
          stage_id: string;
          name: string;
          group_order: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          short_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          short_name?: string | null;
        };
        Update: {
          name?: string;
          short_name?: string | null;
        };
        Relationships: [];
      };
      tournament_entries: {
        Row: {
          id: string;
          tournament_id: string;
          team_id: string;
          tenant_id: string;
          status: EntryStatus;
          seed: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          team_id: string;
          tenant_id: string;
          status?: EntryStatus;
          seed?: number | null;
        };
        Update: {
          status?: EntryStatus;
          seed?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_entries_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      roster_players: {
        Row: {
          id: string;
          tournament_entry_id: string;
          tenant_id: string;
          full_name: string;
          jersey_number: number | null;
          document_id: string | null;
          birth_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tournament_entry_id: string;
          tenant_id: string;
          full_name: string;
          jersey_number?: number | null;
          document_id?: string | null;
          birth_date?: string | null;
          is_active?: boolean;
        };
        Update: {
          full_name?: string;
          jersey_number?: number | null;
          document_id?: string | null;
          birth_date?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          tenant_id: string;
          tournament_id: string;
          stage_id: string;
          group_id: string | null;
          round_number: number;
          slot: number;
          leg: number;
          home_entry_id: string | null;
          away_entry_id: string | null;
          scheduled_at: string | null;
          venue: string | null;
          status: MatchStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // solo lo escriben las funciones de calendario
        Update: never;
        Relationships: [];
      };
      tournament_addons: {
        Row: {
          id: string;
          tournament_id: string;
          addon_id: string;
          is_active: boolean;
          note: string | null;
          activated_at: string;
          deactivated_at: string | null;
        };
        Insert: {
          id?: string;
          tournament_id: string;
          addon_id: string;
          is_active?: boolean;
          note?: string | null;
          deactivated_at?: string | null;
        };
        Update: {
          is_active?: boolean;
          note?: string | null;
          deactivated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      tournament_overview: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          status: TournamentStatus;
          is_public: boolean;
          created_at: string;
          sport_code: string;
          sport_name: string;
          stage_id: string | null;
          format: TournamentFormat | null;
          teams_count: number;
          players_count: number;
        };
        Relationships: [];
      };
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
          /** Usable ahora: incluida en el plan y no pausada. */
          enabled: boolean;
          /** El plan la incluye (aunque esté en pausa). */
          in_plan: boolean;
          /** Incluida pero en pausa por mora, suspensión o cancelación. */
          paused: boolean;
          limit_value: number | null;
          unlimited: boolean;
          availability: FeatureAvailability;
        }[];
      };
      sync_my_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      my_unread_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      request_plan_upgrade: {
        Args: { p_plan_id: string; p_message?: string };
        Returns: boolean;
      };
      admin_set_tenant_plan: {
        Args: { p_tenant_id: string; p_plan_id: string; p_note?: string };
        Returns: undefined;
      };
      admin_set_subscription_status: {
        Args: { p_tenant_id: string; p_status: SubscriptionStatus; p_note?: string };
        Returns: undefined;
      };
      generate_round_robin_fixture: {
        Args: {
          p_stage_id: string;
          p_first_date?: string | null;
          p_days_between_rounds?: number;
          p_kickoff_time?: string;
          p_shuffle?: boolean;
        };
        Returns: number;
      };
      clear_stage_fixture: {
        Args: { p_stage_id: string };
        Returns: undefined;
      };
      set_match_schedule: {
        Args: { p_match_id: string; p_local_time: string | null; p_venue?: string | null };
        Returns: undefined;
      };
      create_tournament: {
        Args: {
          p_tenant_id: string;
          p_sport_id: string;
          p_name: string;
          p_format: TournamentFormat;
          p_is_public?: boolean;
          p_round_robin_legs?: number;
          p_win_points?: number;
          p_draw_points?: number;
          p_loss_points?: number;
          p_tie_breakers?: TiebreakerCode[];
          p_bracket_seeding?: SeedingMethod;
          p_third_place_match?: boolean;
          p_discipline_yellow_for_suspension?: number | null;
          p_discipline_suspension_matches?: number;
          p_discipline_red_suspension_matches?: number;
          p_discipline_cards_reset_between_stages?: boolean;
        };
        Returns: string;
      };
    };
    Enums: {
      match_status: MatchStatus;
      app_role: AppRole;
      subscription_status: SubscriptionStatus;
      tournament_format: TournamentFormat;
      tournament_status: TournamentStatus;
      tiebreaker_code: TiebreakerCode;
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
export type AppNotification = Database["public"]["Tables"]["notifications"]["Row"];
export type Entitlement = Database["public"]["Functions"]["tenant_entitlements"]["Returns"][number];
export type Sport = Database["public"]["Tables"]["sports"]["Row"];
export type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];
export type TournamentStage = Database["public"]["Tables"]["tournament_stages"]["Row"];
export type TournamentGroup = Database["public"]["Tables"]["tournament_groups"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type TournamentEntry = Database["public"]["Tables"]["tournament_entries"]["Row"];
export type RosterPlayer = Database["public"]["Tables"]["roster_players"]["Row"];
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type TournamentAddon =Database["public"]["Tables"]["tournament_addons"]["Row"];
export type TournamentOverview = Database["public"]["Views"]["tournament_overview"]["Row"];
