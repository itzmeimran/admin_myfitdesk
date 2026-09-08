// Copied verbatim from FitDeskApp/src/core/db/database.types.ts (same Supabase
// project) as this repo's starting point. It predates this repo's own
// supabase/migrations/1001_platform_admins.sql — the `platform_admins` and
// `admin_audit_log` tables it adds are NOT reflected below. Regenerate this
// file (or hand-add those two tables) once that migration is applied to the
// live project; until then, code that reads/writes those tables must cast
// around this file rather than relying on it for their shape.
//
// Hand-authored to match supabase/migrations/0001_init.sql.
// Once the project is linked to the Supabase CLI, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/core/db/database.types.ts
// and delete this comment.

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          default_currency: string;
          default_timezone: string;
          contact_phone: string | null;
          contact_email: string | null;
          opens_at: string | null;
          closes_at: string | null;
          address_line: string | null;
          country: string | null;
          state: string | null;
          city: string | null;
          postal_code: string | null;
          grace_period_days: number;
          week_start: "Monday" | "Sunday";
          deletion_requested_at: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          default_currency?: string;
          default_timezone?: string;
          contact_phone?: string | null;
          contact_email?: string | null;
          opens_at?: string | null;
          closes_at?: string | null;
          address_line?: string | null;
          country?: string | null;
          state?: string | null;
          city?: string | null;
          postal_code?: string | null;
          grace_period_days?: number;
          week_start?: "Monday" | "Sunday";
          deletion_requested_at?: string | null;
          logo_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      gyms: {
        Row: {
          id: string;
          organization_id: string;
          slug: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          slug: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["gyms"]["Insert"]>;
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          organization_id: string;
          gym_id: string;
          name: string;
          timezone: string;
          currency: string;
          status: "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          gym_id: string;
          name: string;
          timezone?: string;
          currency?: string;
          status?: "active" | "archived";
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
        Relationships: [];
      };
      staff_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          branch_id: string | null;
          role: "owner" | "staff" | "trainer";
          email: string;
          first_name: string | null;
          last_name: string | null;
          phone_e164: string | null;
          username: string | null;
          must_change_password: boolean;
          deletion_requested_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          branch_id?: string | null;
          role: "owner" | "staff" | "trainer";
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          phone_e164?: string | null;
          username?: string | null;
          must_change_password?: boolean;
          deletion_requested_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["staff_memberships"]["Insert"]>;
        Relationships: [];
      };
      staff_invitations: {
        Row: {
          id: string;
          organization_id: string;
          organization_name_snapshot: string;
          branch_id: string | null;
          email: string;
          role: "owner" | "staff" | "trainer";
          status: "pending" | "accepted" | "revoked";
          invited_by: string;
          expires_at: string;
          created_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          organization_name_snapshot: string;
          branch_id?: string | null;
          email: string;
          role: "owner" | "staff" | "trainer";
          status?: "pending" | "accepted" | "revoked";
          invited_by: string;
          expires_at?: string;
          accepted_at?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["staff_invitations"]["Insert"]>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          organization_id: string;
          branch_id: string;
          first_name: string;
          last_name: string | null;
          phone_e164: string | null;
          email: string | null;
          status: "active" | "inactive" | "left";
          joined_on: string;
          avatar_url: string | null;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          branch_id: string;
          first_name: string;
          last_name?: string | null;
          phone_e164?: string | null;
          email?: string | null;
          status?: "active" | "inactive" | "left";
          joined_on?: string;
          avatar_url?: string | null;
          avatar_path?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Insert"]>;
        Relationships: [];
      };
      membership_plans: {
        Row: {
          id: string;
          organization_id: string;
          gym_id: string;
          name: string;
          duration_days: number;
          list_price_minor: number;
          currency: string;
          status: "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          gym_id: string;
          name: string;
          duration_days: number;
          list_price_minor: number;
          currency?: string;
          status?: "active" | "archived";
        };
        Update: Partial<Database["public"]["Tables"]["membership_plans"]["Insert"]>;
        Relationships: [];
      };
      member_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          branch_id: string;
          plan_id: string | null;
          plan_name_snapshot: string;
          start_date: string;
          end_date: string;
          status: "active" | "frozen" | "expired" | "cancelled";
          agreed_price_minor: number;
          list_price_minor: number;
          currency: string;
          price_override_reason: string | null;
          trainer_id: string | null;
          frozen_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id: string;
          branch_id: string;
          plan_id?: string | null;
          plan_name_snapshot: string;
          start_date: string;
          end_date: string;
          status?: "active" | "frozen" | "expired" | "cancelled";
          agreed_price_minor: number;
          list_price_minor: number;
          currency?: string;
          price_override_reason?: string | null;
          trainer_id?: string | null;
          frozen_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["member_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      platform_packages: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price_minor: number;
          currency: string;
          billing_period: "monthly" | "yearly";
          duration_days: number;
          max_branches: number | null;
          max_members: number | null;
          max_staff: number | null;
          features: string[];
          status: "active" | "archived";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          price_minor: number;
          currency?: string;
          billing_period: "monthly" | "yearly";
          duration_days: number;
          max_branches?: number | null;
          max_members?: number | null;
          max_staff?: number | null;
          features?: string[];
          status?: "active" | "archived";
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["platform_packages"]["Insert"]>;
        Relationships: [];
      };
      organization_subscriptions: {
        Row: {
          organization_id: string;
          package_id: string | null;
          status: "trialing" | "active" | "cancelled";
          current_period_start: string | null;
          current_period_end: string;
          grace_days: number;
          auto_renew: boolean;
          provider_subscription_id: string | null;
          provider_mandate_id: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          package_id?: string | null;
          status?: "trialing" | "active" | "cancelled";
          current_period_start?: string | null;
          current_period_end: string;
          grace_days?: number;
          auto_renew?: boolean;
          provider_subscription_id?: string | null;
          provider_mandate_id?: string | null;
          cancelled_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organization_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      platform_payments: {
        Row: {
          id: string;
          organization_id: string;
          package_id: string | null;
          amount_minor: number;
          currency: string;
          status: "created" | "succeeded" | "failed" | "refunded";
          provider: "razorpay";
          provider_order_id: string | null;
          provider_payment_id: string | null;
          provider_metadata: Record<string, unknown> | null;
          invoice_number: string | null;
          period_start: string | null;
          period_end: string | null;
          initiated_by: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          package_id?: string | null;
          amount_minor: number;
          currency?: string;
          status?: "created" | "succeeded" | "failed" | "refunded";
          provider?: "razorpay";
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
          provider_metadata?: Record<string, unknown> | null;
          invoice_number?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          initiated_by?: string | null;
          paid_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["platform_payments"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          branch_id: string;
          member_id: string;
          subscription_id: string | null;
          amount_minor: number;
          currency: string;
          method: "cash" | "upi" | "card" | "bank_transfer" | "cheque";
          status: "pending_confirmation" | "succeeded" | "cancelled" | "refunded";
          reference: string | null;
          paid_at: string;
          recorded_by: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          refunded_by: string | null;
          refunded_at: string | null;
          created_at: string;
          provider: "razorpay" | "phonepe" | null;
          provider_payment_id: string | null;
          provider_order_id: string | null;
          provider_metadata: Record<string, unknown> | null;
          payment_link_id: string | null;
          payment_link_url: string | null;
          invoice_number: string | null;
          /** migration 0043 — the membership this payment is buying, held on
           * the payment row until the money is actually confirmed. Null on
           * every payment that buys no membership, and cleared the moment the
           * term is created (see materialiseRenewalIntent). */
          renewal_plan_id: string | null;
          renewal_plan_name: string | null;
          renewal_duration_days: number | null;
          renewal_start_date: string | null;
          renewal_price_minor: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          branch_id: string;
          member_id: string;
          subscription_id?: string | null;
          amount_minor: number;
          currency?: string;
          method: "cash" | "upi" | "card" | "bank_transfer" | "cheque";
          status?: "pending_confirmation" | "succeeded" | "cancelled" | "refunded";
          reference?: string | null;
          paid_at?: string;
          recorded_by?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          refunded_by?: string | null;
          refunded_at?: string | null;
          provider?: "razorpay" | "phonepe" | null;
          provider_payment_id?: string | null;
          provider_order_id?: string | null;
          provider_metadata?: Record<string, unknown> | null;
          payment_link_id?: string | null;
          payment_link_url?: string | null;
          invoice_number?: string | null;
          renewal_plan_id?: string | null;
          renewal_plan_name?: string | null;
          renewal_duration_days?: number | null;
          renewal_start_date?: string | null;
          renewal_price_minor?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          organization_id: string;
          renewal_reminders_enabled: boolean;
          payment_reminders_enabled: boolean;
          weekly_digest_enabled: boolean;
          default_channel: "WhatsApp" | "SMS";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          renewal_reminders_enabled?: boolean;
          payment_reminders_enabled?: boolean;
          weekly_digest_enabled?: boolean;
          default_channel?: "WhatsApp" | "SMS";
        };
        Update: Partial<Database["public"]["Tables"]["notification_preferences"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_integrations: {
        Row: {
          id: string;
          organization_id: string;
          status: "connected" | "disconnected" | "error";
          waba_id: string | null;
          phone_number_id: string | null;
          business_name: string | null;
          phone_number_e164: string | null;
          access_token_encrypted: string | null;
          token_expires_at: string | null;
          last_error: string | null;
          connected_by: string | null;
          connected_at: string | null;
          disconnected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          status?: "connected" | "disconnected" | "error";
          waba_id?: string | null;
          phone_number_id?: string | null;
          business_name?: string | null;
          phone_number_e164?: string | null;
          access_token_encrypted?: string | null;
          token_expires_at?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string | null;
          disconnected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_integrations"]["Insert"]>;
        Relationships: [];
      };
      whatsapp_messages: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string | null;
          phone_number_e164: string;
          template_name: string | null;
          message_type: "template" | "text";
          direction: "outbound" | "inbound";
          status: "queued" | "sent" | "delivered" | "read" | "failed";
          meta_message_id: string | null;
          error_code: string | null;
          error_message: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id?: string | null;
          phone_number_e164: string;
          template_name?: string | null;
          message_type?: "template" | "text";
          direction?: "outbound" | "inbound";
          status?: "queued" | "sent" | "delivered" | "read" | "failed";
          meta_message_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          read_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_messages"]["Insert"]>;
        Relationships: [];
      };
      email_log: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string | null;
          recipient: string;
          email_type:
            | "welcome_member"
            | "membership_created"
            | "membership_renewal_reminder"
            | "membership_expired"
            | "payment_successful"
            | "payment_failed"
            | "payment_receipt"
            | "gym_owner_notification"
            | "test";
          subject: string;
          status: "sent" | "failed";
          provider_message_id: string | null;
          error_message: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id?: string | null;
          recipient: string;
          email_type:
            | "welcome_member"
            | "membership_created"
            | "membership_renewal_reminder"
            | "membership_expired"
            | "payment_successful"
            | "payment_failed"
            | "payment_receipt"
            | "gym_owner_notification"
            | "test";
          subject: string;
          status: "sent" | "failed";
          provider_message_id?: string | null;
          error_message?: string | null;
          sent_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_log"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          branch_id: string | null;
          type: string;
          title: string;
          description: string | null;
          entity_type: string | null;
          entity_id: string | null;
          created_by: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          branch_id?: string | null;
          type: string;
          title: string;
          description?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          created_by?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      notification_reads: {
        Row: {
          notification_id: string;
          user_id: string;
          read_at: string;
        };
        Insert: {
          notification_id: string;
          user_id: string;
          read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_reads"]["Insert"]>;
        // The FK has to be described here (not left as []) or postgrest-js
        // can't resolve the `notifications -> notification_reads` embed and
        // collapses the row type to `never` — see CLAUDE.md's note on this
        // file being hand-authored.
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_gateway_integrations: {
        Row: {
          id: string;
          organization_id: string;
          provider: "razorpay" | "phonepe";
          status: "connected" | "disconnected" | "error";
          key_id: string | null;
          key_secret_encrypted: string | null;
          webhook_secret_encrypted: string | null;
          last_error: string | null;
          connected_by: string | null;
          connected_at: string | null;
          disconnected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: "razorpay" | "phonepe";
          status?: "connected" | "disconnected" | "error";
          key_id?: string | null;
          key_secret_encrypted?: string | null;
          webhook_secret_encrypted?: string | null;
          last_error?: string | null;
          connected_by?: string | null;
          connected_at?: string | null;
          disconnected_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payment_gateway_integrations"]["Insert"]>;
        Relationships: [];
      };
      document_sequences: {
        Row: {
          organization_id: string;
          branch_id: string;
          doc_type: string;
          period_key: string;
          prefix: string;
          next_value: number;
          padding: number;
        };
        Insert: {
          organization_id: string;
          branch_id: string;
          doc_type: string;
          period_key?: string;
          prefix: string;
          next_value?: number;
          padding?: number;
        };
        Update: Partial<Database["public"]["Tables"]["document_sequences"]["Insert"]>;
        Relationships: [];
      };
      payment_provider_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          signature_verified: boolean;
          organization_id: string | null;
          processed_at: string | null;
          processing_error: string | null;
          attempts: number;
          received_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Record<string, unknown>;
          signature_verified: boolean;
          organization_id?: string | null;
          processed_at?: string | null;
          processing_error?: string | null;
          attempts?: number;
          received_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payment_provider_events"]["Insert"]>;
        Relationships: [];
      };
    };
    // postgrest-js's GenericSchema requires these keys to exist even when
    // empty — omitting them silently collapses every row type to `never`.
    Views: Record<string, never>;
    Functions: {
      clear_must_change_password: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      request_own_staff_deletion: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      clear_own_staff_deletion: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      complete_gym_signup: {
        Args: {
          p_org_name: string;
          p_org_slug: string;
          p_gym_name: string;
          p_first_name: string;
          p_last_name: string | null;
          p_branch_name?: string;
          p_owner_phone?: string | null;
        };
        Returns: string;
      };
      unread_notification_count: {
        Args: { p_org: string };
        Returns: number;
      };
      next_invoice_number: {
        Args: {
          p_organization_id: string;
          p_branch_id: string;
          p_prefix: string;
        };
        Returns: string;
      };
      next_platform_invoice_number: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      /** migration 0039 — true when the call may proceed, false when the key
       * is over its limit for the current window. service_role only. */
      consume_rate_limit: {
        Args: {
          p_key: string;
          p_limit: number;
          p_window_ms: number;
        };
        Returns: boolean;
      };
      prune_rate_limits: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      /** migration 0041 — yes/no only. Lets a staff member be warned about a
       * duplicate a colleague recorded, without widening payments_select. */
      recent_duplicate_payment_exists: {
        Args: {
          p_member_id: string;
          p_amount_minor: number;
          p_method: string;
          p_window_minutes?: number;
        };
        Returns: boolean;
      };
      /** migration 0043 — how much succeeded money is attached to one
       * subscription. An aggregate, not rows: since 0025 a staff member
       * cannot read a colleague's payments, so summing client-side would
       * silently under-report what a membership has been paid. */
      subscription_paid_minor: {
        Args: { p_subscription_id: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
