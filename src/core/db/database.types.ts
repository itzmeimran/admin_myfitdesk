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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          at: string
          detail: Json | null
          id: number
          target_organization_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          at?: string
          detail?: Json | null
          id?: number
          target_organization_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          at?: string
          detail?: Json | null
          id?: number
          target_organization_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          changed_fields: string[] | null
          id: number
          organization_id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          changed_fields?: string[] | null
          id?: number
          organization_id: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          changed_fields?: string[] | null
          id?: number
          organization_id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          currency: string
          gym_id: string
          id: string
          name: string
          organization_id: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          gym_id: string
          id?: string
          name: string
          organization_id: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          gym_id?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_gym_id_organization_id_fkey"
            columns: ["gym_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          branch_id: string
          doc_type: string
          next_value: number
          organization_id: string
          padding: number
          period_key: string
          prefix: string
        }
        Insert: {
          branch_id: string
          doc_type: string
          next_value?: number
          organization_id: string
          padding?: number
          period_key?: string
          prefix: string
        }
        Update: {
          branch_id?: string
          doc_type?: string
          next_value?: number
          organization_id?: string
          padding?: number
          period_key?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      email_log: {
        Row: {
          email_type: string
          error_message: string | null
          id: string
          member_id: string | null
          organization_id: string
          provider_message_id: string | null
          recipient: string
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          email_type: string
          error_message?: string | null
          id?: string
          member_id?: string | null
          organization_id: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string
          status: string
          subject: string
        }
        Update: {
          email_type?: string
          error_message?: string | null
          id?: string
          member_id?: string | null
          organization_id?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gyms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_subscriptions: {
        Row: {
          agreed_price_minor: number
          branch_id: string
          created_at: string
          currency: string
          deleted_at: string | null
          end_date: string
          frozen_at: string | null
          id: string
          list_price_minor: number
          member_id: string
          organization_id: string
          plan_id: string | null
          plan_name_snapshot: string
          price_override_reason: string | null
          start_date: string
          status: string
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          agreed_price_minor: number
          branch_id: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          end_date: string
          frozen_at?: string | null
          id?: string
          list_price_minor: number
          member_id: string
          organization_id: string
          plan_id?: string | null
          plan_name_snapshot: string
          price_override_reason?: string | null
          start_date: string
          status?: string
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          agreed_price_minor?: number
          branch_id?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          end_date?: string
          frozen_at?: string | null
          id?: string
          list_price_minor?: number
          member_id?: string
          organization_id?: string
          plan_id?: string | null
          plan_name_snapshot?: string
          price_override_reason?: string | null
          start_date?: string
          status?: string
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_subscriptions_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_subscriptions_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_subscriptions_plan_id_organization_id_fkey"
            columns: ["plan_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_subscriptions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "staff_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          branch_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          joined_on: string
          last_name: string | null
          organization_id: string
          phone_e164: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          branch_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          joined_on?: string
          last_name?: string | null
          organization_id: string
          phone_e164?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          branch_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          joined_on?: string
          last_name?: string | null
          organization_id?: string
          phone_e164?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          created_at: string
          currency: string
          duration_days: number
          gym_id: string
          id: string
          list_price_minor: number
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          duration_days: number
          gym_id: string
          id?: string
          list_price_minor: number
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          duration_days?: number
          gym_id?: string
          id?: string
          list_price_minor?: number
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_gym_id_organization_id_fkey"
            columns: ["gym_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          default_channel: string
          digest_last_sent_on: string | null
          organization_id: string
          payment_reminders_enabled: boolean
          reminders_last_run_at: string | null
          renewal_reminders_enabled: boolean
          updated_at: string
          weekly_digest_enabled: boolean
        }
        Insert: {
          created_at?: string
          default_channel?: string
          digest_last_sent_on?: string | null
          organization_id: string
          payment_reminders_enabled?: boolean
          reminders_last_run_at?: string | null
          renewal_reminders_enabled?: boolean
          updated_at?: string
          weekly_digest_enabled?: boolean
        }
        Update: {
          created_at?: string
          default_channel?: string
          digest_last_sent_on?: string | null
          organization_id?: string
          payment_reminders_enabled?: boolean
          reminders_last_run_at?: string | null
          renewal_reminders_enabled?: boolean
          updated_at?: string
          weekly_digest_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string | null
          grace_days: number
          organization_id: string
          package_id: string | null
          // FitDeskApp migration 0074 — a package queued to take over at
          // current_period_end, promoted by that repo's activate-pending-
          // subscriptions cron. All three null, or all three set.
          pending_package_id: string | null
          pending_period_start: string | null
          pending_period_end: string | null
          provider_mandate_id: string | null
          provider_subscription_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start?: string | null
          grace_days?: number
          organization_id: string
          package_id?: string | null
          pending_package_id?: string | null
          pending_period_start?: string | null
          pending_period_end?: string | null
          provider_mandate_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string | null
          grace_days?: number
          organization_id?: string
          package_id?: string | null
          pending_package_id?: string | null
          pending_period_start?: string | null
          pending_period_end?: string | null
          provider_mandate_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_pending_package_id_fkey"
            columns: ["pending_package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line: string | null
          city: string | null
          closes_at: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          default_currency: string
          default_timezone: string
          deletion_requested_at: string | null
          grace_period_days: number
          /** FitDeskApp migration 0066 — human-readable business id (e.g.
           * "GG-0926A"), generated by a BEFORE INSERT trigger. Never set by
           * this app; the "admin_gyms_list" list RPC hasn't been widened to
           * carry it, but "admin_gym_detail" has (supabase/migrations/1012_
           * gym_owner_onboarding.sql). */
          gym_code: string
          id: string
          logo_url: string | null
          name: string
          opens_at: string | null
          postal_code: string | null
          slug: string
          state: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          closes_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string
          deletion_requested_at?: string | null
          grace_period_days?: number
          gym_code?: string
          id?: string
          logo_url?: string | null
          name: string
          opens_at?: string | null
          postal_code?: string | null
          slug: string
          state?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          week_start?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          closes_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          default_currency?: string
          default_timezone?: string
          deletion_requested_at?: string | null
          grace_period_days?: number
          gym_code?: string
          id?: string
          logo_url?: string | null
          name?: string
          opens_at?: string | null
          postal_code?: string | null
          slug?: string
          state?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      payment_gateway_integrations: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          key_id: string | null
          last_error: string | null
          organization_id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          key_id?: string | null
          last_error?: string | null
          organization_id: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          key_id?: string | null
          last_error?: string | null
          organization_id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_secrets: {
        Row: {
          key_secret_encrypted: string | null
          organization_id: string
          updated_at: string
          webhook_secret_encrypted: string | null
        }
        Insert: {
          key_secret_encrypted?: string | null
          organization_id: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Update: {
          key_secret_encrypted?: string | null
          organization_id?: string
          updated_at?: string
          webhook_secret_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_secrets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "payment_gateway_integrations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      payment_provider_events: {
        Row: {
          attempts: number
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          attempts?: number
          event_type: string
          id?: string
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
          signature_verified: boolean
        }
        Update: {
          attempts?: number
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          invoice_number: string | null
          member_id: string
          method: string
          organization_id: string
          paid_at: string
          payment_link_id: string | null
          payment_link_url: string | null
          provider: string | null
          provider_metadata: Json | null
          provider_order_id: string | null
          provider_payment_id: string | null
          recorded_by: string | null
          reference: string | null
          refunded_at: string | null
          refunded_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          renewal_duration_days: number | null
          renewal_plan_id: string | null
          renewal_plan_name: string | null
          renewal_price_minor: number | null
          renewal_start_date: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          amount_minor: number
          branch_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          member_id: string
          method: string
          organization_id: string
          paid_at?: string
          payment_link_id?: string | null
          payment_link_url?: string | null
          provider?: string | null
          provider_metadata?: Json | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          renewal_duration_days?: number | null
          renewal_plan_id?: string | null
          renewal_plan_name?: string | null
          renewal_price_minor?: number | null
          renewal_start_date?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          amount_minor?: number
          branch_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          member_id?: string
          method?: string
          organization_id?: string
          paid_at?: string
          payment_link_id?: string | null
          payment_link_url?: string | null
          provider?: string | null
          provider_metadata?: Json | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          recorded_by?: string | null
          reference?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          renewal_duration_days?: number | null
          renewal_plan_id?: string | null
          renewal_plan_name?: string | null
          renewal_price_minor?: number | null
          renewal_start_date?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_subscription_id_organization_id_fkey"
            columns: ["subscription_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "member_subscriptions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          plan_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          plan_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          plan_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_offers: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_enabled: boolean
          package_id: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          package_id: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          package_id?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_offers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_purchasable: boolean
          name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_purchasable?: boolean
          name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_purchasable?: boolean
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          email: string
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          email: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          email?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_billing_settings: {
        Row: {
          billing_model: string
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_model?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_model?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_document_sequences: {
        Row: {
          doc_type: string
          next_value: number
          padding: number
          prefix: string
        }
        Insert: {
          doc_type: string
          next_value?: number
          padding?: number
          prefix: string
        }
        Update: {
          doc_type?: string
          next_value?: number
          padding?: number
          prefix?: string
        }
        Relationships: []
      }
      platform_packages: {
        Row: {
          billing_period: string
          code: string
          created_at: string
          currency: string
          description: string | null
          duration_days: number
          features: string[]
          id: string
          is_purchasable: boolean
          max_branches: number | null
          max_members: number | null
          max_staff: number | null
          name: string
          plan_id: string | null
          price_minor: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          billing_period: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days: number
          features?: string[]
          id?: string
          is_purchasable?: boolean
          max_branches?: number | null
          max_members?: number | null
          max_staff?: number | null
          name: string
          plan_id?: string | null
          price_minor: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          billing_period?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_days?: number
          features?: string[]
          id?: string
          is_purchasable?: boolean
          max_branches?: number | null
          max_members?: number | null
          max_staff?: number | null
          name?: string
          plan_id?: string | null
          price_minor?: number
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_packages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          initiated_by: string | null
          invoice_number: string | null
          method: string | null
          organization_id: string
          package_id: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          provider: string
          provider_metadata: Json | null
          provider_order_id: string | null
          provider_payment_id: string | null
          status: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          id?: string
          initiated_by?: string | null
          invoice_number?: string | null
          method?: string | null
          organization_id: string
          package_id?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string
          provider_metadata?: Json | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          initiated_by?: string | null
          invoice_number?: string | null
          method?: string | null
          organization_id?: string
          package_id?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string
          provider_metadata?: Json | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      query_perf_events: {
        Row: {
          api: string
          bytes: number | null
          captured_at: string
          client: string
          columns: string | null
          duration_ms: number
          embeds: string[]
          error_code: string | null
          error_message: string | null
          filters: string[]
          id: number
          ok: boolean
          operation: string
          request_id: string | null
          resource: string
          route: string | null
          row_count: number | null
          seq: number
          signature: string
          span_id: string
          started_at: string
          status: number | null
          total_count: number | null
        }
        Insert: {
          api: string
          bytes?: number | null
          captured_at?: string
          client: string
          columns?: string | null
          duration_ms: number
          embeds?: string[]
          error_code?: string | null
          error_message?: string | null
          filters?: string[]
          id?: number
          ok: boolean
          operation: string
          request_id?: string | null
          resource: string
          route?: string | null
          row_count?: number | null
          seq?: number
          signature: string
          span_id: string
          started_at: string
          status?: number | null
          total_count?: number | null
        }
        Update: {
          api?: string
          bytes?: number | null
          captured_at?: string
          client?: string
          columns?: string | null
          duration_ms?: number
          embeds?: string[]
          error_code?: string | null
          error_message?: string | null
          filters?: string[]
          id?: number
          ok?: boolean
          operation?: string
          request_id?: string | null
          resource?: string
          route?: string | null
          row_count?: number | null
          seq?: number
          signature?: string
          span_id?: string
          started_at?: string
          status?: number | null
          total_count?: number | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          reset_at: string
          updated_at: string
        }
        Insert: {
          count?: number
          key: string
          reset_at: string
          updated_at?: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminder_dispatches: {
        Row: {
          created_at: string
          due_date: string
          error_message: string | null
          id: string
          kind: string
          member_id: string
          organization_id: string
          recipient: string | null
          status: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          due_date: string
          error_message?: string | null
          id?: string
          kind: string
          member_id: string
          organization_id: string
          recipient?: string | null
          status?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          due_date?: string
          error_message?: string | null
          id?: string
          kind?: string
          member_id?: string
          organization_id?: string
          recipient?: string | null
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_dispatches_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_dispatches_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "member_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          branch_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          organization_name_snapshot: string
          revoked_at: string | null
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          organization_name_snapshot: string
          revoked_at?: string | null
          role: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          organization_name_snapshot?: string
          revoked_at?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "staff_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_memberships: {
        Row: {
          branch_id: string | null
          created_at: string
          deletion_requested_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          must_change_password: boolean
          organization_id: string
          phone_e164: string | null
          role: string
          user_id: string
          username: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          must_change_password?: boolean
          organization_id: string
          phone_e164?: string | null
          role: string
          user_id: string
          username?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          must_change_password?: boolean
          organization_id?: string
          phone_e164?: string | null
          role?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_integrations: {
        Row: {
          business_name: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          last_error: string | null
          organization_id: string
          phone_number_e164: string | null
          phone_number_id: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          business_name?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_error?: string | null
          organization_id: string
          phone_number_e164?: string | null
          phone_number_id?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          business_name?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          last_error?: string | null
          organization_id?: string
          phone_number_e164?: string | null
          phone_number_id?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          id: string
          member_id: string | null
          message_type: string
          meta_message_id: string | null
          organization_id: string
          phone_number_e164: string
          read_at: string | null
          sent_at: string | null
          status: string
          template_name: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          member_id?: string | null
          message_type?: string
          meta_message_id?: string | null
          organization_id: string
          phone_number_e164: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          member_id?: string | null
          message_type?: string
          meta_message_id?: string | null
          organization_id?: string
          phone_number_e164?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_secrets: {
        Row: {
          access_token_encrypted: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_secrets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_integrations"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_assignable_packages: {
        Args: never
        Returns: {
          billing_period: string
          code: string
          currency: string
          effective_price_minor: number
          id: string
          name: string
          price_minor: number
        }[]
      }
      admin_billing_pipeline: { Args: never; Returns: Json }
      admin_cancel_subscription: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      admin_change_subscription_package: {
        Args: { p_organization_id: string; p_package_id: string }
        Returns: undefined
      }
      // migration 1013 — undoes a package queued by
      // admin_change_subscription_package before it activates.
      admin_clear_pending_subscription_package: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      admin_create_gym_owner_invitation: {
        Args: {
          p_address_line?: string
          p_billing_mode: string
          p_city?: string
          p_country?: string
          p_default_currency?: string
          p_default_timezone?: string
          p_email: string
          p_gym_name: string
          p_notes?: string
          p_owner_first_name: string
          p_owner_last_name?: string
          p_package_id?: string
          p_period_days?: number
          p_phone?: string
          p_postal_code?: string
          p_state?: string
          p_trial_days?: number
        }
        Returns: Json
      }
      admin_get_gym_owner_invitation: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      admin_resend_gym_owner_invitation: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      admin_revoke_gym_owner_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      admin_create_package: {
        Args: {
          p_billing_period: string
          p_code: string
          p_currency: string
          p_description: string
          p_duration_days: number
          p_features?: string[]
          p_max_branches: number
          p_max_members: number
          p_max_staff: number
          p_name: string
          p_price_minor: number
        }
        Returns: string
      }
      admin_create_plan: {
        Args: {
          p_code: string
          p_description: string
          p_is_purchasable?: boolean
          p_name: string
        }
        Returns: string
      }
      admin_create_plan_billing_cycle: {
        Args: {
          p_billing_period: string
          p_code: string
          p_currency: string
          p_duration_days: number
          p_is_purchasable?: boolean
          p_max_branches: number
          p_max_members: number
          p_max_staff: number
          p_plan_id: string
          p_price_minor: number
        }
        Returns: string
      }
      admin_create_plan_feature: {
        Args: {
          p_description: string
          p_is_enabled?: boolean
          p_name: string
          p_plan_id: string
        }
        Returns: string
      }
      admin_create_plan_offer: {
        Args: {
          p_discount_type: string
          p_discount_value: number
          p_expires_at: string
          p_is_enabled?: boolean
          p_package_id: string
          p_starts_at: string
        }
        Returns: string
      }
      admin_delete_plan_feature: { Args: { p_id: string }; Returns: undefined }
      admin_delete_plan_offer: { Args: { p_id: string }; Returns: undefined }
      admin_extend_subscription: {
        Args: {
          p_days: number
          p_organization_id: string
          p_payment_amount_minor?: number
          p_payment_method?: string
          p_payment_note?: string
        }
        Returns: undefined
      }
      admin_grant_platform_admin: {
        Args: { p_email: string }
        Returns: undefined
      }
      admin_gym_audit_log: {
        Args: {
          p_action?: string
          p_actor_id?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_search?: string
          p_sort_dir?: string
        }
        Returns: {
          action: string
          admin_email: string
          admin_id: string
          at: string
          detail: Json
          id: number
          total_count: number
        }[]
      }
      admin_gym_billing_history: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_method?: string
          p_offset?: number
          p_organization_id: string
          p_provider?: string
          p_sort_col?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          invoice_number: string
          method: string
          package_name: string
          paid_at: string
          period_end: string
          period_start: string
          provider: string
          status: string
          total_count: number
        }[]
      }
      admin_gym_branches: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_search?: string
          p_sort_col?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: {
          created_at: string
          currency: string
          id: string
          member_count: number
          name: string
          staff_count: number
          status: string
          timezone: string
          total_count: number
        }[]
      }
      admin_gym_configuration: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      admin_gym_detail: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      admin_gym_directory: {
        Args: never
        Returns: {
          billing_period: string
          branch_cap: number
          branch_count: number
          city: string
          created_at: string
          currency: string
          current_period_end: string
          grace_days: number
          lifetime_paid_minor: number
          member_cap: number
          member_count: number
          name: string
          organization_id: string
          owner_name: string
          package_code: string
          package_id: string
          package_name: string
          price_minor: number
          staff_cap: number
          staff_count: number
          state: string
        }[]
      }
      admin_gym_members: {
        Args: {
          p_branch_id?: string
          p_expiry_state?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_plan_name?: string
          p_search?: string
          p_sort_col?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: {
          branch_id: string
          branch_name: string
          created_at: string
          email: string
          expiry_state: string
          first_name: string
          id: string
          joined_on: string
          last_name: string
          phone_e164: string
          plan_name: string
          status: string
          subscription_end_date: string
          total_count: number
        }[]
      }
      admin_gym_staff: {
        Args: {
          p_branch_id?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_role?: string
          p_search?: string
          p_sort_col?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: {
          branch_id: string
          branch_name: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone_e164: string
          role: string
          status: string
          total_count: number
        }[]
      }
      admin_gyms_list: {
        Args: {
          p_billing_period?: string
          p_limit?: number
          p_min_branches?: number
          p_offset?: number
          p_package_id?: string
          p_search?: string
          p_sort_col?: string
          p_sort_dir?: string
          p_status?: string
        }
        Returns: {
          billing_period: string
          branch_cap: number
          branch_count: number
          city: string
          created_at: string
          currency: string
          current_period_end: string
          grace_days: number
          lifetime_paid_minor: number
          member_cap: number
          member_count: number
          name: string
          organization_id: string
          owner_email: string
          owner_name: string
          package_code: string
          package_id: string
          package_name: string
          price_minor: number
          staff_cap: number
          staff_count: number
          state: string
          suspended_at: string
          total_count: number
        }[]
      }
      admin_gyms_near_cap: {
        Args: { p_limit?: number }
        Returns: {
          cap_count: number
          name: string
          organization_id: string
          pct: number
          resource: string
          used_count: number
        }[]
      }
      admin_gyms_summary: { Args: never; Returns: Json }
      admin_list_platform_admins: {
        Args: never
        Returns: {
          email: string
          granted_at: string
          granted_by_email: string
          is_self: boolean
          revoked_at: string
          user_id: string
        }[]
      }
      admin_overview_stats: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_prev_end: string
          p_prev_start: string
        }
        Returns: Json
      }
      admin_package_mix: {
        Args: never
        Returns: {
          billing_period: string
          code: string
          gym_count: number
          mrr_minor: number
          name: string
          package_id: string
          price_minor: number
        }[]
      }
      admin_reactivate_organization: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      admin_reorder_plan_billing_cycles: {
        Args: { p_ids: string[]; p_plan_id: string }
        Returns: undefined
      }
      admin_reorder_plan_features: {
        Args: { p_ids: string[]; p_plan_id: string }
        Returns: undefined
      }
      admin_reorder_plans: { Args: { p_ids: string[] }; Returns: undefined }
      admin_restore_subscription: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      admin_revenue_trend: {
        Args: { p_weeks?: number }
        Returns: {
          revenue_minor: number
          week_start: string
        }[]
      }
      admin_revoke_platform_admin: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_set_billing_model: { Args: { p_model: string }; Returns: undefined }
      admin_set_package_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_plan_billing_cycle_purchasable: {
        Args: { p_id: string; p_is_purchasable: boolean }
        Returns: undefined
      }
      admin_set_plan_billing_cycle_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_plan_caps: {
        Args: {
          p_max_branches: number
          p_max_members: number
          p_max_staff: number
          p_plan_id: string
        }
        Returns: undefined
      }
      admin_set_plan_feature_enabled: {
        Args: { p_id: string; p_is_enabled: boolean }
        Returns: undefined
      }
      admin_set_plan_offer_enabled: {
        Args: { p_id: string; p_is_enabled: boolean }
        Returns: undefined
      }
      admin_set_plan_status: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      admin_suspend_organization: {
        Args: { p_organization_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_update_gym_logo: {
        Args: { p_organization_id: string; p_logo_url: string | null }
        Returns: undefined
      }
      admin_update_organization_profile: {
        Args: {
          p_address_line?: string
          p_city?: string
          p_contact_email?: string
          p_contact_phone?: string
          p_country?: string
          p_default_currency?: string
          p_default_timezone?: string
          p_grace_period_days: number
          p_name: string
          p_organization_id: string
          p_postal_code?: string
          p_state?: string
        }
        Returns: undefined
      }
      admin_update_package: {
        Args: {
          p_description: string
          p_duration_days: number
          p_features: string[]
          p_id: string
          p_max_branches: number
          p_max_members: number
          p_max_staff: number
          p_name: string
          p_price_minor: number
        }
        Returns: undefined
      }
      admin_update_plan: {
        Args: {
          p_description: string
          p_id: string
          p_is_purchasable: boolean
          p_name: string
        }
        Returns: undefined
      }
      admin_update_plan_billing_cycle: {
        Args: {
          p_duration_days: number
          p_id: string
          p_is_purchasable: boolean
          p_max_branches: number
          p_max_members: number
          p_max_staff: number
          p_price_minor: number
        }
        Returns: undefined
      }
      admin_update_plan_feature: {
        Args: {
          p_description: string
          p_id: string
          p_is_enabled: boolean
          p_name: string
        }
        Returns: undefined
      }
      admin_update_plan_offer: {
        Args: {
          p_discount_type: string
          p_discount_value: number
          p_expires_at: string
          p_id: string
          p_starts_at: string
        }
        Returns: undefined
      }
      attach_invoice_number: {
        Args: { p_payment_id: string; p_prefix: string }
        Returns: string
      }
      clear_must_change_password: { Args: never; Returns: undefined }
      clear_own_staff_deletion: { Args: never; Returns: undefined }
      complete_gym_signup: {
        Args: {
          p_branch_name?: string
          p_first_name: string
          p_gym_name: string
          p_last_name: string
          p_org_name: string
          p_org_slug: string
          p_owner_phone?: string
        }
        Returns: string
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_ms: number }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      next_invoice_number: {
        Args: {
          p_branch_id: string
          p_organization_id: string
          p_prefix: string
        }
        Returns: string
      }
      next_platform_invoice_number: { Args: never; Returns: string }
      org_staff_directory: {
        Args: { p_org: string }
        Returns: {
          branch_id: string
          first_name: string
          id: string
          last_name: string
          role: string
          user_id: string
        }[]
      }
      plan_effective_price: {
        Args: { p_at?: string; p_package_id: string }
        Returns: {
          currency: string
          discount_minor: number
          discount_type: string
          discount_value: number
          effective_price_minor: number
          offer_id: string
          package_id: string
          price_minor: number
        }[]
      }
      plan_resource_count: {
        Args: { p_org: string; p_resource: string }
        Returns: number
      }
      prune_audit_log: { Args: { p_keep_days?: number }; Returns: number }
      prune_payment_provider_events: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      prune_query_perf_events: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      prune_rate_limits: { Args: never; Returns: number }
      prune_reminder_dispatches: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      recent_duplicate_payment_exists: {
        Args: {
          p_amount_minor: number
          p_member_id: string
          p_method: string
          p_window_minutes?: number
        }
        Returns: boolean
      }
      request_own_staff_deletion: { Args: never; Returns: undefined }
      run_retention: { Args: never; Returns: Json }
      sell_membership_write: {
        Args: {
          p_agreed_price_minor: number
          p_branch_id: string
          p_currency: string
          p_end_date: string
          p_list_price_minor: number
          p_member_id: string
          p_organization_id: string
          p_plan_id: string
          p_plan_name_snapshot: string
          p_price_override_reason: string
          p_start_date: string
          p_superseded_ids: string[]
          p_trainer_id: string
        }
        Returns: string
      }
      subscription_paid_minor: {
        Args: { p_subscription_id: string }
        Returns: number
      }
      unread_notification_count: { Args: { p_org: string }; Returns: number }
      unresolved_gateway_events: {
        Args: { p_org: string }
        Returns: {
          attempts: number
          event_type: string
          id: string
          processing_error: string
          provider: string
          received_at: string
        }[]
      }
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
    Enums: {},
  },
} as const
