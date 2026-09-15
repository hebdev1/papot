// Generated from the Supabase schema. Do not edit by hand:
// regenerate after every migration so the client types match the database.

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
          admin_label: string | null
          at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: number
          ip: unknown
          next: Json | null
          previous: Json | null
          reason: string | null
          severity: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_label?: string | null
          at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: never
          ip?: unknown
          next?: Json | null
          previous?: Json | null
          reason?: string | null
          severity?: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_label?: string | null
          at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: never
          ip?: unknown
          next?: Json | null
          previous?: Json | null
          reason?: string | null
          severity?: string
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          code: string
          group_name: string
          label_fr: string
          position: number
          sensitive: boolean
        }
        Insert: {
          code: string
          group_name: string
          label_fr: string
          position?: number
          sensitive?: boolean
        }
        Update: {
          code?: string
          group_name?: string
          label_fr?: string
          position?: number
          sensitive?: boolean
        }
        Relationships: []
      }
      admin_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          owner_id: string
          page: string
          shared: boolean
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          owner_id: string
          page: string
          shared?: boolean
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          owner_id?: string
          page?: string
          shared?: boolean
        }
        Relationships: []
      }
      booking_items: {
        Row: {
          amount: number
          booking_id: string
          detail: string
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          listing_id: string | null
          package_id: string | null
          party: number | null
          position: number
          start_time: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["booking_status"]
          table_id: string | null
          title: string
          trip_id: string | null
          unit_id: string | null
        }
        Insert: {
          amount?: number
          booking_id: string
          detail: string
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["listing_kind"]
          listing_id?: string | null
          package_id?: string | null
          party?: number | null
          position?: number
          start_time?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_id?: string | null
          title: string
          trip_id?: string | null
          unit_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          detail?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          listing_id?: string | null
          package_id?: string | null
          party?: number | null
          position?: number
          start_time?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          table_id?: string | null
          title?: string
          trip_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "listing_units"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          currency: string
          email: string
          first_name: string
          id: string
          last_name: string
          payment_method: string
          phone: string
          reference: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          payment_method: string
          phone: string
          reference: string
          status?: Database["public"]["Enums"]["booking_status"]
          total: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          payment_method?: string
          phone?: string
          reference?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
          user_id?: string | null
        }
        Relationships: []
      }
      car_details: {
        Row: {
          air_conditioning: boolean
          airport_delivery: boolean
          body: string
          doors: number | null
          drivetrain: string
          fuel: string
          gearbox: string
          listing_id: string
          luggage: number | null
          make: string
          min_days: number
          model: string
          seats: number
          unlimited_km: boolean
          with_driver: boolean
          year: number
        }
        Insert: {
          air_conditioning?: boolean
          airport_delivery?: boolean
          body: string
          doors?: number | null
          drivetrain: string
          fuel: string
          gearbox: string
          listing_id: string
          luggage?: number | null
          make: string
          min_days?: number
          model: string
          seats: number
          unlimited_km?: boolean
          with_driver?: boolean
          year: number
        }
        Update: {
          air_conditioning?: boolean
          airport_delivery?: boolean
          body?: string
          doors?: number | null
          drivetrain?: string
          fuel?: string
          gearbox?: string
          listing_id?: string
          luggage?: number | null
          make?: string
          min_days?: number
          model?: string
          seats?: number
          unlimited_km?: boolean
          with_driver?: boolean
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "car_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string | null
          fixed_fee: number | null
          id: string
          label: string
          max_fee: number | null
          min_fee: number | null
          partner_id: string | null
          partner_type: Database["public"]["Enums"]["partner_type"] | null
          percentage: number | null
          revenue_kind: Database["public"]["Enums"]["revenue_kind"] | null
          scope: Database["public"]["Enums"]["commission_scope"]
          service_kind: Database["public"]["Enums"]["listing_kind"] | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          fixed_fee?: number | null
          id?: string
          label: string
          max_fee?: number | null
          min_fee?: number | null
          partner_id?: string | null
          partner_type?: Database["public"]["Enums"]["partner_type"] | null
          percentage?: number | null
          revenue_kind?: Database["public"]["Enums"]["revenue_kind"] | null
          scope: Database["public"]["Enums"]["commission_scope"]
          service_kind?: Database["public"]["Enums"]["listing_kind"] | null
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          fixed_fee?: number | null
          id?: string
          label?: string
          max_fee?: number | null
          min_fee?: number | null
          partner_id?: string | null
          partner_type?: Database["public"]["Enums"]["partner_type"] | null
          percentage?: number | null
          revenue_kind?: Database["public"]["Enums"]["revenue_kind"] | null
          scope?: Database["public"]["Enums"]["commission_scope"]
          service_kind?: Database["public"]["Enums"]["listing_kind"] | null
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      component_inventory: {
        Row: {
          component_id: string
          day: string
          low_threshold: number | null
          prepared: number
          remaining: number | null
          sold: number
          updated_at: string
        }
        Insert: {
          component_id: string
          day: string
          low_threshold?: number | null
          prepared?: number
          remaining?: number | null
          sold?: number
          updated_at?: string
        }
        Update: {
          component_id?: string
          day?: string
          low_threshold?: number | null
          prepared?: number
          remaining?: number | null
          sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_inventory_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "food_components"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          id: string
          kind: string
          locale: string
          position: number
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          locale?: string
          position?: number
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          locale?: string
          position?: number
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string | null
          sender_label: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_label?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          kind: string
          last_message_at: string | null
          message_count: number
          partner_id: string | null
          subject: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind: string
          last_message_at?: string | null
          message_count?: number
          partner_id?: string | null
          subject?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string | null
          message_count?: number
          partner_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          active: boolean
          eta_minutes: number | null
          fee: number
          id: string
          listing_id: string
          min_order: number | null
          name: string
          position: number
        }
        Insert: {
          active?: boolean
          eta_minutes?: number | null
          fee?: number
          id?: string
          listing_id: string
          min_order?: number | null
          name: string
          position?: number
        }
        Update: {
          active?: boolean
          eta_minutes?: number | null
          fee?: number
          id?: string
          listing_id?: string
          min_order?: number | null
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          blurb: string | null
          city: string
          country: string
          created_at: string
          from_usd: number | null
          hotels: number
          id: string
          img: string | null
          position: number
          region: string | null
          restaurants: number
          tagline: string | null
          tier: number
        }
        Insert: {
          blurb?: string | null
          city: string
          country: string
          created_at?: string
          from_usd?: number | null
          hotels?: number
          id?: string
          img?: string | null
          position?: number
          region?: string | null
          restaurants?: number
          tagline?: string | null
          tier?: number
        }
        Update: {
          blurb?: string | null
          city?: string
          country?: string
          created_at?: string
          from_usd?: number | null
          hotels?: number
          id?: string
          img?: string | null
          position?: number
          region?: string | null
          restaurants?: number
          tagline?: string | null
          tier?: number
        }
        Relationships: []
      }
      dish_variations: {
        Row: {
          active: boolean
          id: string
          item_id: string
          name: string
          position: number
          price: number
        }
        Insert: {
          active?: boolean
          id?: string
          item_id: string
          name: string
          position?: number
          price: number
        }
        Update: {
          active?: boolean
          id?: string
          item_id?: string
          name?: string
          position?: number
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "dish_variations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount: number | null
          booking_id: string | null
          booking_ref: string | null
          category: Database["public"]["Enums"]["dispute_category"]
          customer_id: string | null
          customer_label: string | null
          customer_statement: string | null
          id: string
          opened_at: string
          partner_id: string | null
          partner_statement: string | null
          reference: string
          resolution: Database["public"]["Enums"]["dispute_resolution"] | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          booking_ref?: string | null
          category: Database["public"]["Enums"]["dispute_category"]
          customer_id?: string | null
          customer_label?: string | null
          customer_statement?: string | null
          id?: string
          opened_at?: string
          partner_id?: string | null
          partner_statement?: string | null
          reference: string
          resolution?: Database["public"]["Enums"]["dispute_resolution"] | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          booking_ref?: string | null
          category?: Database["public"]["Enums"]["dispute_category"]
          customer_id?: string | null
          customer_label?: string | null
          customer_statement?: string | null
          id?: string
          opened_at?: string
          partner_id?: string | null
          partner_statement?: string | null
          reference?: string
          resolution?: Database["public"]["Enums"]["dispute_resolution"] | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base: string
          quote: string
          rate: number
          updated_at: string
        }
        Insert: {
          base: string
          quote: string
          rate: number
          updated_at?: string
        }
        Update: {
          base?: string
          quote?: string
          rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      favorite_collections: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          collection_id: string | null
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "favorite_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_placements: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string | null
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: string
          placement: string
          priority: number
          starts_on: string | null
          target_market: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: string
          placement: string
          priority?: number
          starts_on?: string | null
          target_market?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
          placement?: string
          priority?: number
          starts_on?: string | null
          target_market?: string | null
        }
        Relationships: []
      }
      food_components: {
        Row: {
          active: boolean
          category: string | null
          description: string | null
          id: string
          image_url: string | null
          listing_id: string
          max_quantity: number | null
          name: string
          position: number
          prep_minutes: number | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          listing_id: string
          max_quantity?: number | null
          name: string
          position?: number
          prep_minutes?: number | null
        }
        Update: {
          active?: boolean
          category?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          listing_id?: string
          max_quantity?: number | null
          name?: string
          position?: number
          prep_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_components_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_components_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          author_label: string | null
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          author_id: string
          author_label?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          author_id?: string
          author_label?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          due_on: string | null
          id: string
          issued_on: string | null
          number: string
          partner_id: string | null
          payout_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          issued_on?: string | null
          number: string
          partner_id?: string | null
          payout_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          issued_on?: string | null
          number?: string
          partner_id?: string | null
          payout_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_availability: {
        Row: {
          day: string
          listing_id: string
          max_stay: number | null
          min_stay: number | null
          note: string | null
          price_override: number | null
          quantity: number | null
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
        }
        Insert: {
          day: string
          listing_id: string
          max_stay?: number | null
          min_stay?: number | null
          note?: string | null
          price_override?: number | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Update: {
          day?: string
          listing_id?: string
          max_stay?: number | null
          min_stay?: number | null
          note?: string | null
          price_override?: number | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_availability_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_availability_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_rates: {
        Row: {
          active: boolean
          created_at: string
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["rate_kind"]
          label: string | null
          listing_id: string
          min_stay: number | null
          price: number
          starts_on: string | null
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["rate_kind"]
          label?: string | null
          listing_id: string
          min_stay?: number | null
          price: number
          starts_on?: string | null
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["rate_kind"]
          label?: string | null
          listing_id?: string
          min_stay?: number | null
          price?: number
          starts_on?: string | null
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_rates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_rates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_units: {
        Row: {
          available: boolean
          detail: string
          id: string
          listing_id: string
          name: string
          position: number
          price: number | null
          units: number
        }
        Insert: {
          available?: boolean
          detail: string
          id?: string
          listing_id: string
          name: string
          position?: number
          price?: number | null
          units?: number
        }
        Update: {
          available?: boolean
          detail?: string
          id?: string
          listing_id?: string
          name?: string
          position?: number
          price?: number | null
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          amenities: string[]
          attrs: Json
          badge: string | null
          breakfast: boolean
          city: string
          country: string
          created_at: string
          currency: string
          free_cancellation: boolean
          id: string
          img: string | null
          kind: Database["public"]["Enums"]["listing_kind"]
          location: string
          name: string
          original_price: number | null
          partner_id: string | null
          position: number
          price: number
          published: boolean
          rating: number | null
          rating_scale: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviews: number
          stars: number | null
          status: Database["public"]["Enums"]["listing_status"]
          submitted_at: string | null
          type: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amenities?: string[]
          attrs?: Json
          badge?: string | null
          breakfast?: boolean
          city: string
          country: string
          created_at?: string
          currency?: string
          free_cancellation?: boolean
          id?: string
          img?: string | null
          kind?: Database["public"]["Enums"]["listing_kind"]
          location: string
          name: string
          original_price?: number | null
          partner_id?: string | null
          position?: number
          price: number
          published?: boolean
          rating?: number | null
          rating_scale?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviews?: number
          stars?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          submitted_at?: string | null
          type: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amenities?: string[]
          attrs?: Json
          badge?: string | null
          breakfast?: boolean
          city?: string
          country?: string
          created_at?: string
          currency?: string
          free_cancellation?: boolean
          id?: string
          img?: string | null
          kind?: Database["public"]["Enums"]["listing_kind"]
          location?: string
          name?: string
          original_price?: number | null
          partner_id?: string | null
          position?: number
          price?: number
          published?: boolean
          rating?: number | null
          rating_scale?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviews?: number
          stars?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          submitted_at?: string | null
          type?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_fixed_items: {
        Row: {
          id: string
          item_id: string
          position: number
          quantity: number
          template_id: string
        }
        Insert: {
          id?: string
          item_id: string
          position?: number
          quantity?: number
          template_id: string
        }
        Update: {
          id?: string
          item_id?: string
          position?: number
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_fixed_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_fixed_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_group_options: {
        Row: {
          component_id: string | null
          group_id: string
          id: string
          item_id: string | null
          max_quantity: number | null
          position: number
          price_delta: number
        }
        Insert: {
          component_id?: string | null
          group_id: string
          id?: string
          item_id?: string | null
          max_quantity?: number | null
          position?: number
          price_delta?: number
        }
        Update: {
          component_id?: string | null
          group_id?: string
          id?: string
          item_id?: string | null
          max_quantity?: number | null
          position?: number
          price_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_group_options_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "food_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_group_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "meal_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_group_options_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_groups: {
        Row: {
          id: string
          max_select: number
          min_select: number
          name: string
          position: number
          required: boolean
          selection: string
          template_id: string
        }
        Insert: {
          id?: string
          max_select?: number
          min_select?: number
          name: string
          position?: number
          required?: boolean
          selection?: string
          template_id: string
        }
        Update: {
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          position?: number
          required?: boolean
          selection?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_templates: {
        Row: {
          active: boolean
          base_price: number
          description: string | null
          id: string
          image_url: string | null
          kind: string
          listing_id: string
          name: string
          position: number
        }
        Insert: {
          active?: boolean
          base_price?: number
          description?: string | null
          id?: string
          image_url?: string | null
          kind: string
          listing_id: string
          name: string
          position?: number
        }
        Update: {
          active?: boolean
          base_price?: number
          description?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          listing_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_templates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_templates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          description: string | null
          id: string
          listing_id: string
          name: string
          position: number
        }
        Insert: {
          active?: boolean
          description?: string | null
          id?: string
          listing_id: string
          name: string
          position?: number
        }
        Update: {
          active?: boolean
          description?: string | null
          id?: string
          listing_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          group_id: string
          item_id: string
          position: number
        }
        Insert: {
          group_id: string
          item_id: string
          position?: number
        }
        Update: {
          group_id?: string
          item_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_notes: {
        Row: {
          item_id: string
          prep_notes: string | null
          updated_at: string
        }
        Insert: {
          item_id: string
          prep_notes?: string | null
          updated_at?: string
        }
        Update: {
          item_id?: string
          prep_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_notes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          available: boolean
          available_from: string | null
          available_until: string | null
          available_weekdays: number[]
          category_id: string
          chef_special: boolean
          description: string | null
          detail: string | null
          dietary: string[]
          discount_price: number | null
          id: string
          image_url: string | null
          listing_id: string
          name: string
          popular: boolean
          position: number
          prep_minutes: number | null
          price: number | null
          sold_out: boolean
        }
        Insert: {
          allergens?: string[]
          available?: boolean
          available_from?: string | null
          available_until?: string | null
          available_weekdays?: number[]
          category_id: string
          chef_special?: boolean
          description?: string | null
          detail?: string | null
          dietary?: string[]
          discount_price?: number | null
          id?: string
          image_url?: string | null
          listing_id: string
          name: string
          popular?: boolean
          position?: number
          prep_minutes?: number | null
          price?: number | null
          sold_out?: boolean
        }
        Update: {
          allergens?: string[]
          available?: boolean
          available_from?: string | null
          available_until?: string | null
          available_weekdays?: number[]
          category_id?: string
          chef_special?: boolean
          description?: string | null
          detail?: string | null
          dietary?: string[]
          discount_price?: number | null
          id?: string
          image_url?: string | null
          listing_id?: string
          name?: string
          popular?: boolean
          position?: number
          prep_minutes?: number | null
          price?: number | null
          sold_out?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          active: boolean
          id: string
          listing_id: string
          max_select: number
          min_select: number
          name: string
          position: number
          required: boolean
          selection: string
        }
        Insert: {
          active?: boolean
          id?: string
          listing_id: string
          max_select?: number
          min_select?: number
          name: string
          position?: number
          required?: boolean
          selection?: string
        }
        Update: {
          active?: boolean
          id?: string
          listing_id?: string
          max_select?: number
          min_select?: number
          name?: string
          position?: number
          required?: boolean
          selection?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          active: boolean
          group_id: string
          id: string
          kind: string
          max_quantity: number | null
          name: string
          position: number
          price_delta: number
        }
        Insert: {
          active?: boolean
          group_id: string
          id?: string
          kind?: string
          max_quantity?: number | null
          name: string
          position?: number
          price_delta?: number
        }
        Update: {
          active?: boolean
          group_id?: string
          id?: string
          kind?: string
          max_quantity?: number | null
          name?: string
          position?: number
          price_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          audience: string
          audience_filter: Json | null
          body: string
          channels: string[]
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          id: string
          recipients: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          title: string
        }
        Insert: {
          audience: string
          audience_filter?: Json | null
          body: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          recipients?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          title: string
        }
        Update: {
          audience?: string
          audience_filter?: Json | null
          body?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          recipients?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          title?: string
        }
        Relationships: []
      }
      order_item_customizations: {
        Row: {
          component_id: string | null
          id: string
          kind: string
          label: string
          modifier_id: string | null
          order_item_id: string
          position: number
          price_delta: number
          quantity: number
        }
        Insert: {
          component_id?: string | null
          id?: string
          kind: string
          label: string
          modifier_id?: string | null
          order_item_id: string
          position?: number
          price_delta?: number
          quantity?: number
        }
        Update: {
          component_id?: string | null
          id?: string
          kind?: string
          label?: string
          modifier_id?: string | null
          order_item_id?: string
          position?: number
          price_delta?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_customizations_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "food_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_customizations_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_customizations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "restaurant_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor: string | null
          at: string
          id: string
          order_id: string
          reason: string | null
          status: Database["public"]["Enums"]["food_order_status"]
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: string
          order_id: string
          reason?: string | null
          status: Database["public"]["Enums"]["food_order_status"]
        }
        Update: {
          actor?: string | null
          at?: string
          id?: string
          order_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["food_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      package_lines: {
        Row: {
          id: string
          label: string
          listing_id: string | null
          menu_item_id: string | null
          package_id: string
          position: number
          quantity: number
          recurring: boolean
          reference_value: number | null
          unit_id: string | null
        }
        Insert: {
          id?: string
          label: string
          listing_id?: string | null
          menu_item_id?: string | null
          package_id: string
          position?: number
          quantity?: number
          recurring?: boolean
          reference_value?: number | null
          unit_id?: string | null
        }
        Update: {
          id?: string
          label?: string
          listing_id?: string | null
          menu_item_id?: string | null
          package_id?: string
          position?: number
          quantity?: number
          recurring?: boolean
          reference_value?: number | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "package_lines_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "partner_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_lines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "listing_units"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          at: string
          detail: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: number
          partner_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          at?: string
          detail?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: never
          partner_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          at?: string
          detail?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: never
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_activity_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_activity_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_amenities: {
        Row: {
          applies_to: Database["public"]["Enums"]["partner_type"][]
          category: string | null
          code: string
          label_fr: string
          position: number
        }
        Insert: {
          applies_to: Database["public"]["Enums"]["partner_type"][]
          category?: string | null
          code: string
          label_fr: string
          position?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["partner_type"][]
          category?: string | null
          code?: string
          label_fr?: string
          position?: number
        }
        Relationships: []
      }
      partner_application_amenities: {
        Row: {
          amenity_code: string
          application_id: string
        }
        Insert: {
          amenity_code: string
          application_id: string
        }
        Update: {
          amenity_code?: string
          application_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_amenities_amenity_code_fkey"
            columns: ["amenity_code"]
            isOneToOne: false
            referencedRelation: "partner_amenities"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "partner_application_amenities_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_application_documents: {
        Row: {
          application_id: string
          doc_type: string
          review_note: string | null
          status: Database["public"]["Enums"]["partner_document_status"]
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          application_id: string
          doc_type: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["partner_document_status"]
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          application_id?: string
          doc_type?: string
          review_note?: string | null
          status?: Database["public"]["Enums"]["partner_document_status"]
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_application_documents_doc_type_fkey"
            columns: ["doc_type"]
            isOneToOne: false
            referencedRelation: "partner_document_types"
            referencedColumns: ["code"]
          },
        ]
      }
      partner_application_hours: {
        Row: {
          application_id: string
          closes_at: string | null
          is_open: boolean
          opens_at: string | null
          weekday: number
        }
        Insert: {
          application_id: string
          closes_at?: string | null
          is_open?: boolean
          opens_at?: string | null
          weekday: number
        }
        Update: {
          application_id?: string
          closes_at?: string | null
          is_open?: boolean
          opens_at?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_hours_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_application_rooms: {
        Row: {
          application_id: string
          beds: string | null
          capacity: number
          id: string
          name: string
          position: number
          price: number
          room_type: string | null
          units: number
        }
        Insert: {
          application_id: string
          beds?: string | null
          capacity: number
          id?: string
          name: string
          position?: number
          price: number
          room_type?: string | null
          units?: number
        }
        Update: {
          application_id?: string
          beds?: string | null
          capacity?: number
          id?: string
          name?: string
          position?: number
          price?: number
          room_type?: string | null
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_rooms_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_application_vehicles: {
        Row: {
          application_id: string
          body_type: string | null
          id: string
          make: string
          model: string
          position: number
          seats: number
          transmission: string
          year: number
        }
        Insert: {
          application_id: string
          body_type?: string | null
          id?: string
          make: string
          model: string
          position?: number
          seats: number
          transmission: string
          year: number
        }
        Update: {
          application_id?: string
          body_type?: string | null
          id?: string
          make?: string
          model?: string
          position?: number
          seats?: number
          transmission?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_vehicles_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          agree: boolean
          arrival_notes: string | null
          business_email: string | null
          business_name: string
          business_phone: string | null
          business_subtype: string | null
          cancellation_policy:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          city: string
          commune: string | null
          confirmation_mode:
            | Database["public"]["Enums"]["confirmation_mode"]
            | null
          confirmation_sent_at: string | null
          country: string
          created_at: string
          cuisines: string[]
          daily_rate: number | null
          department: string | null
          deposit: number | null
          email: string
          extra_km_price: number | null
          first_name: string
          fleet_size: number | null
          floors: number | null
          full_desc: string | null
          id: string
          included_km_per_day: number | null
          landmark: string | null
          last_name: string
          legal_name: string | null
          locale: string
          max_capacity: number | null
          max_party: number | null
          meal_duration_minutes: number | null
          min_notice_hours: number | null
          min_party: number | null
          monthly_rate: number | null
          neighborhood: string | null
          payout_account_last4: string | null
          payout_bank: string | null
          payout_country: string | null
          payout_currency: string | null
          payout_holder: string | null
          payout_method: Database["public"]["Enums"]["payout_method"] | null
          payout_mobile_service: string | null
          phone: string
          photos: string[]
          postal_code: string | null
          price_band: Database["public"]["Enums"]["price_band"] | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rooms_count: number | null
          seats_capacity: number | null
          short_desc: string
          stars: number | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string
          type: Database["public"]["Enums"]["partner_type"]
          user_id: string | null
          website: string | null
          weekly_rate: number | null
          whatsapp: string | null
          year_established: number | null
        }
        Insert: {
          agree: boolean
          arrival_notes?: string | null
          business_email?: string | null
          business_name: string
          business_phone?: string | null
          business_subtype?: string | null
          cancellation_policy?:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          city: string
          commune?: string | null
          confirmation_mode?:
            | Database["public"]["Enums"]["confirmation_mode"]
            | null
          confirmation_sent_at?: string | null
          country?: string
          created_at?: string
          cuisines?: string[]
          daily_rate?: number | null
          department?: string | null
          deposit?: number | null
          email: string
          extra_km_price?: number | null
          first_name: string
          fleet_size?: number | null
          floors?: number | null
          full_desc?: string | null
          id?: string
          included_km_per_day?: number | null
          landmark?: string | null
          last_name: string
          legal_name?: string | null
          locale?: string
          max_capacity?: number | null
          max_party?: number | null
          meal_duration_minutes?: number | null
          min_notice_hours?: number | null
          min_party?: number | null
          monthly_rate?: number | null
          neighborhood?: string | null
          payout_account_last4?: string | null
          payout_bank?: string | null
          payout_country?: string | null
          payout_currency?: string | null
          payout_holder?: string | null
          payout_method?: Database["public"]["Enums"]["payout_method"] | null
          payout_mobile_service?: string | null
          phone: string
          photos?: string[]
          postal_code?: string | null
          price_band?: Database["public"]["Enums"]["price_band"] | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rooms_count?: number | null
          seats_capacity?: number | null
          short_desc: string
          stars?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string
          type: Database["public"]["Enums"]["partner_type"]
          user_id?: string | null
          website?: string | null
          weekly_rate?: number | null
          whatsapp?: string | null
          year_established?: number | null
        }
        Update: {
          agree?: boolean
          arrival_notes?: string | null
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          business_subtype?: string | null
          cancellation_policy?:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          city?: string
          commune?: string | null
          confirmation_mode?:
            | Database["public"]["Enums"]["confirmation_mode"]
            | null
          confirmation_sent_at?: string | null
          country?: string
          created_at?: string
          cuisines?: string[]
          daily_rate?: number | null
          department?: string | null
          deposit?: number | null
          email?: string
          extra_km_price?: number | null
          first_name?: string
          fleet_size?: number | null
          floors?: number | null
          full_desc?: string | null
          id?: string
          included_km_per_day?: number | null
          landmark?: string | null
          last_name?: string
          legal_name?: string | null
          locale?: string
          max_capacity?: number | null
          max_party?: number | null
          meal_duration_minutes?: number | null
          min_notice_hours?: number | null
          min_party?: number | null
          monthly_rate?: number | null
          neighborhood?: string | null
          payout_account_last4?: string | null
          payout_bank?: string | null
          payout_country?: string | null
          payout_currency?: string | null
          payout_holder?: string | null
          payout_method?: Database["public"]["Enums"]["payout_method"] | null
          payout_mobile_service?: string | null
          phone?: string
          photos?: string[]
          postal_code?: string | null
          price_band?: Database["public"]["Enums"]["price_band"] | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rooms_count?: number | null
          seats_capacity?: number | null
          short_desc?: string
          stars?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string
          type?: Database["public"]["Enums"]["partner_type"]
          user_id?: string | null
          website?: string | null
          weekly_rate?: number | null
          whatsapp?: string | null
          year_established?: number | null
        }
        Relationships: []
      }
      partner_discounts: {
        Row: {
          active: boolean
          amount: number | null
          code: string | null
          created_at: string
          eligible_listings: string[] | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["discount_kind"]
          min_nights: number | null
          min_spend: number | null
          name: string
          partner_id: string
          percent: number | null
          starts_on: string | null
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          active?: boolean
          amount?: number | null
          code?: string | null
          created_at?: string
          eligible_listings?: string[] | null
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["discount_kind"]
          min_nights?: number | null
          min_spend?: number | null
          name: string
          partner_id: string
          percent?: number | null
          starts_on?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          active?: boolean
          amount?: number | null
          code?: string | null
          created_at?: string
          eligible_listings?: string[] | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["discount_kind"]
          min_nights?: number | null
          min_spend?: number | null
          name?: string
          partner_id?: string
          percent?: number | null
          starts_on?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_discounts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_discounts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_document_types: {
        Row: {
          applies_to: Database["public"]["Enums"]["partner_type"][]
          code: string
          label_fr: string
          position: number
          required: boolean
        }
        Insert: {
          applies_to: Database["public"]["Enums"]["partner_type"][]
          code: string
          label_fr: string
          position?: number
          required?: boolean
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["partner_type"][]
          code?: string
          label_fr?: string
          position?: number
          required?: boolean
        }
        Relationships: []
      }
      partner_fees: {
        Row: {
          active: boolean
          amount: number
          amount_type: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["fee_kind"]
          listing_id: string | null
          name: string
          partner_id: string
          per_night: boolean
        }
        Insert: {
          active?: boolean
          amount: number
          amount_type: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["fee_kind"]
          listing_id?: string | null
          name: string
          partner_id: string
          per_night?: boolean
        }
        Update: {
          active?: boolean
          amount?: number
          amount_type?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["fee_kind"]
          listing_id?: string | null
          name?: string
          partner_id?: string
          per_night?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "partner_fees_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_fees_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_fees_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_fees_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_integrations: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          kind: string
          last_synced_at: string | null
          partner_id: string
          status: Database["public"]["Enums"]["integration_status"]
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          kind: string
          last_synced_at?: string | null
          partner_id: string
          status?: Database["public"]["Enums"]["integration_status"]
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          kind?: string
          last_synced_at?: string | null
          partner_id?: string
          status?: Database["public"]["Enums"]["integration_status"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_integrations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_integrations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          last_active_at: string | null
          partner_id: string
          role: Database["public"]["Enums"]["partner_member_role"]
          status: Database["public"]["Enums"]["partner_member_status"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          last_active_at?: string | null
          partner_id: string
          role?: Database["public"]["Enums"]["partner_member_role"]
          status?: Database["public"]["Enums"]["partner_member_status"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          last_active_at?: string | null
          partner_id?: string
          role?: Database["public"]["Enums"]["partner_member_role"]
          status?: Database["public"]["Enums"]["partner_member_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_notification_prefs: {
        Row: {
          channels: string[]
          event: string
          partner_id: string
        }
        Insert: {
          channels?: string[]
          event: string
          partner_id: string
        }
        Update: {
          channels?: string[]
          event?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_notification_prefs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_notification_prefs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_packages: {
        Row: {
          active: boolean
          basis: Database["public"]["Enums"]["package_basis"]
          created_at: string
          description: string
          ends_on: string | null
          id: string
          image_url: string | null
          listing_id: string
          min_units: number | null
          name: string
          partner_id: string
          position: number
          price: number
          starts_on: string | null
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          active?: boolean
          basis: Database["public"]["Enums"]["package_basis"]
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          image_url?: string | null
          listing_id: string
          min_units?: number | null
          name: string
          partner_id: string
          position?: number
          price: number
          starts_on?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          active?: boolean
          basis?: Database["public"]["Enums"]["package_basis"]
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          image_url?: string | null
          listing_id?: string
          min_units?: number | null
          name?: string
          partner_id?: string
          position?: number
          price?: number
          starts_on?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_packages_listing_fkey"
            columns: ["listing_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id", "partner_id"]
          },
          {
            foreignKeyName: "partner_packages_listing_fkey"
            columns: ["listing_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id", "partner_id"]
          },
        ]
      }
      partner_permissions: {
        Row: {
          code: string
          group_name: string
          label_fr: string
          position: number
          sensitive: boolean
        }
        Insert: {
          code: string
          group_name: string
          label_fr: string
          position?: number
          sensitive?: boolean
        }
        Update: {
          code?: string
          group_name?: string
          label_fr?: string
          position?: number
          sensitive?: boolean
        }
        Relationships: []
      }
      partner_quick_replies: {
        Row: {
          body: string
          id: string
          partner_id: string
          position: number
          title: string
        }
        Insert: {
          body: string
          id?: string
          partner_id: string
          position?: number
          title: string
        }
        Update: {
          body?: string
          id?: string
          partner_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_quick_replies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_quick_replies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["partner_member_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["partner_member_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["partner_member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "partner_role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "partner_permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      partners: {
        Row: {
          application_id: string | null
          business_name: string
          city: string | null
          commission_override: number | null
          country: string
          created_at: string
          department: string | null
          email: string | null
          id: string
          joined_at: string | null
          legal_name: string | null
          owner_id: string | null
          owner_name: string | null
          phone: string | null
          rating: number | null
          status: Database["public"]["Enums"]["partner_status"]
          suspended_reason: string | null
          type: Database["public"]["Enums"]["partner_type"]
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          application_id?: string | null
          business_name: string
          city?: string | null
          commission_override?: number | null
          country?: string
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          joined_at?: string | null
          legal_name?: string | null
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["partner_status"]
          suspended_reason?: string | null
          type: Database["public"]["Enums"]["partner_type"]
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          application_id?: string | null
          business_name?: string
          city?: string | null
          commission_override?: number | null
          country?: string
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          joined_at?: string | null
          legal_name?: string | null
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["partner_status"]
          suspended_reason?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "partners_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          booking_ref: string | null
          commission: number
          created_at: string
          currency: string
          customer_id: string | null
          customer_label: string | null
          failure_reason: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string | null
          partner_id: string | null
          processor: string | null
          processor_ref: string | null
          reference: string
          revenue_kind: Database["public"]["Enums"]["revenue_kind"] | null
          risk_score: number | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          booking_id?: string | null
          booking_ref?: string | null
          commission?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_label?: string | null
          failure_reason?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          partner_id?: string | null
          processor?: string | null
          processor_ref?: string | null
          reference: string
          revenue_kind?: Database["public"]["Enums"]["revenue_kind"] | null
          risk_score?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          booking_id?: string | null
          booking_ref?: string | null
          commission?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_label?: string | null
          failure_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string | null
          partner_id?: string | null
          processor?: string | null
          processor_ref?: string | null
          reference?: string
          revenue_kind?: Database["public"]["Enums"]["revenue_kind"] | null
          risk_score?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          adjustments: number
          commission: number
          created_at: string
          currency: string
          failure_reason: string | null
          gross: number
          hold_reason: string | null
          id: string
          method: Database["public"]["Enums"]["payout_method"] | null
          net: number | null
          paid_at: string | null
          partner_id: string
          period_end: string
          period_start: string
          reference: string
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          adjustments?: number
          commission?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          gross?: number
          hold_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payout_method"] | null
          net?: number | null
          paid_at?: string | null
          partner_id: string
          period_end: string
          period_start: string
          reference: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          adjustments?: number
          commission?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          gross?: number
          hold_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payout_method"] | null
          net?: number | null
          paid_at?: string | null
          partner_id?: string
          period_end?: string
          period_start?: string
          reference?: string
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_locations: {
        Row: {
          active: boolean
          address: string | null
          delivery_fee: number | null
          hours: string | null
          id: string
          instructions: string | null
          kind: Database["public"]["Enums"]["pickup_kind"]
          name: string
          partner_id: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          delivery_fee?: number | null
          hours?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["pickup_kind"]
          name: string
          partner_id: string
        }
        Update: {
          active?: boolean
          address?: string | null
          delivery_fee?: number | null
          hours?: string | null
          id?: string
          instructions?: string | null
          kind?: Database["public"]["Enums"]["pickup_kind"]
          name?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_locations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_locations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          group_name: string
          help_fr: string | null
          key: string
          label_fr: string
          options: Json | null
          position: number
          updated_at: string
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          group_name: string
          help_fr?: string | null
          key: string
          label_fr: string
          options?: Json | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          group_name?: string
          help_fr?: string | null
          key?: string
          label_fr?: string
          options?: Json | null
          position?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: []
      }
      private_options: {
        Row: {
          capacity: string
          from_price: string
          id: string
          listing_id: string
          name: string
          position: number
        }
        Insert: {
          capacity: string
          from_price: string
          id?: string
          listing_id: string
          name: string
          position?: number
        }
        Update: {
          capacity?: string
          from_price?: string
          id?: string
          listing_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "private_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_options_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          email: string | null
          full_name: string | null
          id: string
          last_seen_at: string | null
          locale: string
          phone: string | null
          risk_flags: string[]
          status: Database["public"]["Enums"]["customer_status"]
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          risk_flags?: string[]
          status?: Database["public"]["Enums"]["customer_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen_at?: string | null
          locale?: string
          phone?: string | null
          risk_flags?: string[]
          status?: Database["public"]["Enums"]["customer_status"]
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          discount_value: number | null
          eligible_kinds: Database["public"]["Enums"]["listing_kind"][] | null
          eligible_partners: string[] | null
          ends_on: string | null
          id: string
          kind: Database["public"]["Enums"]["promotion_kind"]
          min_spend: number | null
          name: string
          starts_on: string | null
          status: Database["public"]["Enums"]["promotion_status"]
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          discount_value?: number | null
          eligible_kinds?: Database["public"]["Enums"]["listing_kind"][] | null
          eligible_partners?: string[] | null
          ends_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["promotion_kind"]
          min_spend?: number | null
          name: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          discount_value?: number | null
          eligible_kinds?: Database["public"]["Enums"]["listing_kind"][] | null
          eligible_partners?: string[] | null
          ends_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["promotion_kind"]
          min_spend?: number | null
          name?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["promotion_status"]
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_paid: number
          booking_id: string | null
          booking_ref: string | null
          booking_total: number
          cancellation_fee: number
          created_at: string
          currency: string
          customer_id: string | null
          customer_label: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          eligible_amount: number
          final_amount: number | null
          id: string
          partner_id: string | null
          payment_id: string | null
          reason: string | null
          reference: string
          requested_amount: number
          status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          amount_paid?: number
          booking_id?: string | null
          booking_ref?: string | null
          booking_total?: number
          cancellation_fee?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_label?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          eligible_amount?: number
          final_amount?: number | null
          id?: string
          partner_id?: string | null
          payment_id?: string | null
          reason?: string | null
          reference: string
          requested_amount?: number
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          amount_paid?: number
          booking_id?: string | null
          booking_ref?: string | null
          booking_total?: number
          cancellation_fee?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_label?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          eligible_amount?: number
          final_amount?: number | null
          id?: string
          partner_id?: string | null
          payment_id?: string | null
          reason?: string | null
          reference?: string
          requested_amount?: number
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_details: {
        Row: {
          accepts_groups: boolean
          capacity: number | null
          cuisine: string
          features: string[]
          instant_confirmation: boolean
          listing_id: string
          neighborhood: string | null
          price_band: string
          services: string[]
          zones: string[]
        }
        Insert: {
          accepts_groups?: boolean
          capacity?: number | null
          cuisine: string
          features?: string[]
          instant_confirmation?: boolean
          listing_id: string
          neighborhood?: string | null
          price_band: string
          services?: string[]
          zones?: string[]
        }
        Update: {
          accepts_groups?: boolean
          capacity?: number | null
          cuisine?: string
          features?: string[]
          instant_confirmation?: boolean
          listing_id?: string
          neighborhood?: string | null
          price_band?: string
          services?: string[]
          zones?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_hours: {
        Row: {
          closes_at: string
          id: string
          listing_id: string
          opens_at: string
          position: number
          weekday: number
        }
        Insert: {
          closes_at: string
          id?: string
          listing_id: string
          opens_at: string
          position?: number
          weekday: number
        }
        Update: {
          closes_at?: string
          id?: string
          listing_id?: string
          opens_at?: string
          position?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_hours_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_hours_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_inventory: {
        Row: {
          day: string
          item_id: string
          low_threshold: number | null
          prepared: number
          remaining: number | null
          sold: number
          updated_at: string
        }
        Insert: {
          day: string
          item_id: string
          low_threshold?: number | null
          prepared?: number
          remaining?: number | null
          sold?: number
          updated_at?: string
        }
        Update: {
          day?: string
          item_id?: string
          low_threshold?: number | null
          prepared?: number
          remaining?: number | null
          sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_order_items: {
        Row: {
          base_price: number | null
          id: string
          item_id: string | null
          line_total: number
          name: string
          note: string | null
          order_id: string
          position: number
          quantity: number
          template_id: string | null
          template_kind: string | null
          unit_price: number
          variation_id: string | null
          variation_name: string | null
        }
        Insert: {
          base_price?: number | null
          id?: string
          item_id?: string | null
          line_total: number
          name: string
          note?: string | null
          order_id: string
          position?: number
          quantity: number
          template_id?: string | null
          template_kind?: string | null
          unit_price: number
          variation_id?: string | null
          variation_name?: string | null
        }
        Update: {
          base_price?: number | null
          id?: string
          item_id?: string | null
          line_total?: number
          name?: string
          note?: string | null
          order_id?: string
          position?: number
          quantity?: number
          template_id?: string | null
          template_kind?: string | null
          unit_price?: number
          variation_id?: string | null
          variation_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "restaurant_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_order_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "dish_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_orders: {
        Row: {
          address: string | null
          address_notes: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivery_fee: number
          delivery_zone_id: string | null
          discount: number
          fulfillment: Database["public"]["Enums"]["fulfillment_mode"]
          id: string
          listing_id: string
          note: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["food_payment_status"]
          reference: string
          rejection_reason: string | null
          scheduled_for: string | null
          service_day: string
          service_fee: number
          status: Database["public"]["Enums"]["food_order_status"]
          subtotal: number
          tax: number
          tip: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          address_notes?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          discount?: number
          fulfillment: Database["public"]["Enums"]["fulfillment_mode"]
          id?: string
          listing_id: string
          note?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["food_payment_status"]
          reference: string
          rejection_reason?: string | null
          scheduled_for?: string | null
          service_day?: string
          service_fee?: number
          status?: Database["public"]["Enums"]["food_order_status"]
          subtotal: number
          tax?: number
          tip?: number
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          address_notes?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_fee?: number
          delivery_zone_id?: string | null
          discount?: number
          fulfillment?: Database["public"]["Enums"]["fulfillment_mode"]
          id?: string
          listing_id?: string
          note?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["food_payment_status"]
          reference?: string
          rejection_reason?: string | null
          scheduled_for?: string | null
          service_day?: string
          service_fee?: number
          status?: Database["public"]["Enums"]["food_order_status"]
          subtotal?: number
          tax?: number
          tip?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          accept_online_orders: boolean
          accept_online_reservations: boolean
          allow_delivery: boolean
          allow_dine_in_orders: boolean
          allow_pickup: boolean
          auto_confirm: boolean
          cancellation_deadline_hours: number | null
          cancellation_policy:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          default_duration_minutes: number
          delivery_eta_minutes: number
          delivery_free_over: number | null
          delivery_instructions: string | null
          deposit_amount: number | null
          deposit_required: boolean
          grace_period_minutes: number
          listing_id: string
          max_advance_days: number
          max_party: number
          min_notice_minutes: number
          min_party: number
          no_show_policy: string | null
          order_max_advance_days: number
          order_min_total: number | null
          order_prep_minutes: number
          pickup_instructions: string | null
          same_day_allowed: boolean
          updated_at: string
        }
        Insert: {
          accept_online_orders?: boolean
          accept_online_reservations?: boolean
          allow_delivery?: boolean
          allow_dine_in_orders?: boolean
          allow_pickup?: boolean
          auto_confirm?: boolean
          cancellation_deadline_hours?: number | null
          cancellation_policy?:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          default_duration_minutes?: number
          delivery_eta_minutes?: number
          delivery_free_over?: number | null
          delivery_instructions?: string | null
          deposit_amount?: number | null
          deposit_required?: boolean
          grace_period_minutes?: number
          listing_id: string
          max_advance_days?: number
          max_party?: number
          min_notice_minutes?: number
          min_party?: number
          no_show_policy?: string | null
          order_max_advance_days?: number
          order_min_total?: number | null
          order_prep_minutes?: number
          pickup_instructions?: string | null
          same_day_allowed?: boolean
          updated_at?: string
        }
        Update: {
          accept_online_orders?: boolean
          accept_online_reservations?: boolean
          allow_delivery?: boolean
          allow_dine_in_orders?: boolean
          allow_pickup?: boolean
          auto_confirm?: boolean
          cancellation_deadline_hours?: number | null
          cancellation_policy?:
            | Database["public"]["Enums"]["cancellation_policy"]
            | null
          default_duration_minutes?: number
          delivery_eta_minutes?: number
          delivery_free_over?: number | null
          delivery_instructions?: string | null
          deposit_amount?: number | null
          deposit_required?: boolean
          grace_period_minutes?: number
          listing_id?: string
          max_advance_days?: number
          max_party?: number
          min_notice_minutes?: number
          min_party?: number
          no_show_policy?: string | null
          order_max_advance_days?: number
          order_min_total?: number | null
          order_prep_minutes?: number
          pickup_instructions?: string | null
          same_day_allowed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_settings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          accessible: boolean
          active: boolean
          area_id: string | null
          can_combine: boolean
          id: string
          label: string
          listing_id: string
          max_guests: number
          min_guests: number
          position: number
          seats: number
          status: Database["public"]["Enums"]["table_status"]
          table_number: string | null
        }
        Insert: {
          accessible?: boolean
          active?: boolean
          area_id?: string | null
          can_combine?: boolean
          id?: string
          label: string
          listing_id: string
          max_guests: number
          min_guests?: number
          position?: number
          seats: number
          status?: Database["public"]["Enums"]["table_status"]
          table_number?: string | null
        }
        Update: {
          accessible?: boolean
          active?: boolean
          area_id?: string | null
          can_combine?: boolean
          id?: string
          label?: string
          listing_id?: string
          max_guests?: number
          min_guests?: number
          position?: number
          seats?: number
          status?: Database["public"]["Enums"]["table_status"]
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "seating_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          booking_id: string | null
          created_at: string
          customer_id: string | null
          customer_label: string | null
          flag: Database["public"]["Enums"]["review_flag"] | null
          flag_note: string | null
          id: string
          listing_id: string | null
          moderated_at: string | null
          moderated_by: string | null
          partner_id: string | null
          partner_reply: string | null
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
        }
        Insert: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_label?: string | null
          flag?: Database["public"]["Enums"]["review_flag"] | null
          flag_note?: string | null
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          partner_id?: string | null
          partner_reply?: string | null
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
        }
        Update: {
          body?: string | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_label?: string | null
          flag?: Database["public"]["Enums"]["review_flag"] | null
          flag_note?: string | null
          id?: string
          listing_id?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          partner_id?: string | null
          partner_reply?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["admin_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["admin_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["admin_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      seating_areas: {
        Row: {
          active: boolean
          area_type: string | null
          capacity: number | null
          description: string | null
          id: string
          listing_id: string
          name: string
          position: number
          smoking: boolean
        }
        Insert: {
          active?: boolean
          area_type?: string | null
          capacity?: number | null
          description?: string | null
          id?: string
          listing_id: string
          name: string
          position?: number
          smoking?: boolean
        }
        Update: {
          active?: boolean
          area_type?: string | null
          capacity?: number | null
          description?: string | null
          id?: string
          listing_id?: string
          name?: string
          position?: number
          smoking?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "seating_areas_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seating_areas_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          at: string
          detail: Json | null
          id: number
          ip: unknown
          kind: string
          resolved: boolean
          severity: string
          user_agent: string | null
          user_id: string | null
          user_label: string | null
        }
        Insert: {
          at?: string
          detail?: Json | null
          id?: never
          ip?: unknown
          kind: string
          resolved?: boolean
          severity?: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
        }
        Update: {
          at?: string
          detail?: Json | null
          id?: never
          ip?: unknown
          kind?: string
          resolved?: boolean
          severity?: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          email: string
          full_name: string
          invited_by: string | null
          job_title: string | null
          last_login_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          status: Database["public"]["Enums"]["staff_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          invited_by?: string | null
          job_title?: string | null
          last_login_at?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          invited_by?: string | null
          job_title?: string | null
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_label: string | null
          assigned_to: string | null
          booking_id: string | null
          booking_ref: string | null
          category: string | null
          created_at: string
          customer_id: string | null
          id: string
          partner_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          reference: string
          requester_label: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_label?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          booking_ref?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          partner_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference: string
          requester_label?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_label?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          booking_ref?: string | null
          category?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          partner_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference?: string
          requester_label?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_reservation_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      system_services: {
        Row: {
          checked_at: string
          detail_fr: string | null
          key: string
          label_fr: string
          position: number
          status: string
        }
        Insert: {
          checked_at?: string
          detail_fr?: string | null
          key: string
          label_fr: string
          position?: number
          status?: string
        }
        Update: {
          checked_at?: string
          detail_fr?: string | null
          key?: string
          label_fr?: string
          position?: number
          status?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          author_label: string | null
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind: string
          author_label?: string | null
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          author_label?: string | null
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination: string | null
          ends_on: string
          id: string
          starts_on: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          ends_on: string
          id?: string
          starts_on: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          ends_on?: string
          id?: string
          starts_on?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vehicle_maintenance: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          kind: Database["public"]["Enums"]["maintenance_kind"]
          listing_id: string
          note: string | null
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          listing_id: string
          note?: string | null
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["maintenance_kind"]
          listing_id?: string
          note?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "admin_listing_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_customer_rows: {
        Row: {
          bookings: number | null
          country: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_booking_at: string | null
          last_seen_at: string | null
          locale: string | null
          phone: string | null
          risk_flags: string[] | null
          status: Database["public"]["Enums"]["customer_status"] | null
          suspended_reason: string | null
          total_spend: number | null
        }
        Relationships: []
      }
      admin_listing_rows: {
        Row: {
          amenities: string[] | null
          attrs: Json | null
          bookings: number | null
          breakfast: boolean | null
          city: string | null
          country: string | null
          currency: string | null
          free_cancellation: boolean | null
          id: string | null
          img: string | null
          kind: Database["public"]["Enums"]["listing_kind"] | null
          location: string | null
          name: string | null
          partner_id: string | null
          partner_name: string | null
          partner_type: Database["public"]["Enums"]["partner_type"] | null
          price: number | null
          rating: number | null
          review_note: string | null
          reviews: number | null
          status: Database["public"]["Enums"]["listing_status"] | null
          submitted_at: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "admin_partner_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_partner_rows: {
        Row: {
          application_id: string | null
          bookings: number | null
          business_name: string | null
          city: string | null
          commission_override: number | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string | null
          joined_at: string | null
          listings: number | null
          outstanding_payout: number | null
          owner_name: string | null
          phone: string | null
          published_listings: number | null
          rating: number | null
          revenue: number | null
          status: Database["public"]["Enums"]["partner_status"] | null
          suspended_reason: string | null
          type: Database["public"]["Enums"]["partner_type"] | null
          verification:
            | Database["public"]["Enums"]["verification_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_reservation_rows: {
        Row: {
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_label: string | null
          ends_on: string | null
          first_title: string | null
          id: string | null
          item_count: number | null
          kinds: string[] | null
          partner_id: string | null
          partner_name: string | null
          payment_id: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          reference: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      admin_transactions: {
        Row: {
          amount: number | null
          at: string | null
          direction: string | null
          id: string | null
          kind: string | null
          label: string | null
          reference: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_activity_feed: {
        Args: { p_limit?: number }
        Returns: {
          actor: string
          at: string
          entity_id: string
          entity_type: string
          event: string
          label: string
          severity: string
        }[]
      }
      admin_add_note: {
        Args: { p_body: string; p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      admin_booking_distribution: { Args: never; Returns: Json }
      admin_can: { Args: { perm: string }; Returns: boolean }
      admin_cancel_booking: {
        Args: { p_reason: string; p_reference: string }
        Returns: undefined
      }
      admin_customer_analytics: { Args: never; Returns: Json }
      admin_customer_stats: { Args: never; Returns: Json }
      admin_decide_application: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: string
      }
      admin_decide_refund: {
        Args: {
          p_final?: number
          p_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["refund_status"]
        }
        Returns: undefined
      }
      admin_finance_stats: { Args: never; Returns: Json }
      admin_funnel: {
        Args: never
        Returns: {
          stage: string
          value: number
        }[]
      }
      admin_generate_listings: { Args: { p_partner: string }; Returns: number }
      admin_geo_performance: {
        Args: never
        Returns: {
          bookings: number
          city: string
          listings: number
          partners: number
          revenue: number
        }[]
      }
      admin_global_search: {
        Args: { q: string }
        Returns: {
          group_name: string
          href: string
          id: string
          subtitle: string
          title: string
        }[]
      }
      admin_listing_stats: { Args: never; Returns: Json }
      admin_log: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_label?: string
          p_entity_type: string
          p_next?: Json
          p_previous?: Json
          p_reason?: string
          p_severity?: string
        }
        Returns: number
      }
      admin_me: { Args: never; Returns: Json }
      admin_moderate_review: {
        Args: {
          p_flag?: Database["public"]["Enums"]["review_flag"]
          p_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["review_status"]
        }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_partner_analytics: { Args: never; Returns: Json }
      admin_partner_stats: { Args: never; Returns: Json }
      admin_payout_stats: { Args: never; Returns: Json }
      admin_refund_stats: { Args: never; Returns: Json }
      admin_reply_ticket: {
        Args: { p_body: string; p_id: string; p_internal?: boolean }
        Returns: string
      }
      admin_reservation_stats: { Args: never; Returns: Json }
      admin_resolve_dispute: {
        Args: {
          p_id: string
          p_note?: string
          p_resolution: Database["public"]["Enums"]["dispute_resolution"]
        }
        Returns: undefined
      }
      admin_revenue_series: {
        Args: { p_days?: number }
        Returns: {
          day: string
          gbv: number
          payouts: number
          refunds: number
          revenue: number
        }[]
      }
      admin_review_stats: { Args: never; Returns: Json }
      admin_set_customer_status: {
        Args: {
          p_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["customer_status"]
        }
        Returns: undefined
      }
      admin_set_document_status: {
        Args: {
          p_application: string
          p_doc_type: string
          p_note?: string
          p_status: Database["public"]["Enums"]["partner_document_status"]
        }
        Returns: undefined
      }
      admin_set_listing_status: {
        Args: {
          p_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["listing_status"]
        }
        Returns: undefined
      }
      admin_set_partner_commission: {
        Args: { p_id: string; p_percentage: number }
        Returns: undefined
      }
      admin_set_partner_member: {
        Args: {
          p_email: string
          p_full_name: string
          p_partner: string
          p_role?: Database["public"]["Enums"]["partner_member_role"]
          p_status?: Database["public"]["Enums"]["partner_member_status"]
        }
        Returns: string
      }
      admin_set_partner_status: {
        Args: {
          p_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["partner_status"]
        }
        Returns: undefined
      }
      admin_set_payout_status: {
        Args: {
          p_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["payout_status"]
        }
        Returns: undefined
      }
      admin_set_role_permissions: {
        Args: {
          p_permissions: string[]
          p_role: Database["public"]["Enums"]["admin_role"]
        }
        Returns: undefined
      }
      admin_set_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      admin_support_stats: { Args: never; Returns: Json }
      admin_touch_login: { Args: never; Returns: undefined }
      admin_update_ticket: {
        Args: {
          p_assignee?: string
          p_id: string
          p_priority?: Database["public"]["Enums"]["ticket_priority"]
          p_status?: Database["public"]["Enums"]["ticket_status"]
        }
        Returns: undefined
      }
      admin_upsert_staff: {
        Args: {
          p_email: string
          p_full_name: string
          p_role: Database["public"]["Enums"]["admin_role"]
          p_status?: Database["public"]["Enums"]["staff_status"]
        }
        Returns: string
      }
      advance_food_order: {
        Args: { p_order: string; p_reason?: string; p_status: string }
        Returns: string
      }
      assign_restaurant_table: {
        Args: {
          p_date: string
          p_listing: string
          p_party: number
          p_time: string
        }
        Returns: string
      }
      attach_application_documents: {
        Args: {
          p_application: string
          p_documents: Json
          p_type: Database["public"]["Enums"]["partner_type"]
        }
        Returns: undefined
      }
      attach_items_to_trips: { Args: { p_booking: string }; Returns: undefined }
      build_partner_listings: { Args: { p_partner: string }; Returns: number }
      claim_partner_invitations: { Args: never; Returns: number }
      create_booking: { Args: { p_payload: Json }; Returns: Json }
      effective_commission:
        | {
            Args: {
              p_kind: Database["public"]["Enums"]["listing_kind"]
              p_partner_id: string
            }
            Returns: number
          }
        | {
            Args: {
              p_kind: Database["public"]["Enums"]["listing_kind"]
              p_partner_id: string
              p_revenue?: Database["public"]["Enums"]["revenue_kind"]
            }
            Returns: number
          }
      get_booking: { Args: { p_reference: string }; Returns: Json }
      haiti_today: { Args: never; Returns: string }
      is_partner_member: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      mark_food_order_paid: {
        Args: { p_method?: string; p_order: string }
        Returns: Json
      }
      my_account_space: { Args: never; Returns: string }
      my_bookings: { Args: never; Returns: Json }
      my_partner_ids: { Args: never; Returns: string[] }
      my_trips: { Args: never; Returns: Json }
      next_booking_reference: { Args: never; Returns: string }
      next_order_reference: { Args: never; Returns: string }
      package_quote: {
        Args: { p_package: string; p_units?: number }
        Returns: Json
      }
      parse_int: { Args: { p: Json; p_field: string }; Returns: number }
      parse_num: { Args: { p: Json; p_field: string }; Returns: number }
      partner_can: {
        Args: { p_partner: string; perm: string }
        Returns: boolean
      }
      partner_customers: {
        Args: { p_partner: string }
        Returns: {
          bookings: number
          customer_id: string
          email: string
          full_name: string
          last_booking: string
          status: string
          total_spend: number
        }[]
      }
      partner_insights: { Args: { p_partner: string }; Returns: Json }
      partner_listing_performance: {
        Args: { p_partner: string }
        Returns: {
          listing_id: string
          name: string
          rating: number
          reservations: number
          revenue: number
          reviews: number
          status: string
        }[]
      }
      partner_me: { Args: never; Returns: Json }
      partner_overview: { Args: { p_partner: string }; Returns: Json }
      partner_rate_change: {
        Args: {
          p_apply?: boolean
          p_end: string
          p_listings: string[]
          p_percent: number
          p_start: string
        }
        Returns: {
          day: string
          listing_id: string
          listing_name: string
          new_price: number
          old_price: number
        }[]
      }
      partner_reply_review: {
        Args: { p_reply: string; p_review: string }
        Returns: undefined
      }
      partner_revenue_series: {
        Args: { p_days?: number; p_partner: string }
        Returns: {
          bookings: number
          day: string
          revenue: number
        }[]
      }
      partner_search: {
        Args: { p_partner: string; q: string }
        Returns: {
          group_name: string
          href: string
          id: string
          subtitle: string
          title: string
        }[]
      }
      partner_set_availability: {
        Args: {
          p_end: string
          p_listings: string[]
          p_max_stay?: number
          p_min_stay?: number
          p_quantity?: number
          p_start: string
          p_status: Database["public"]["Enums"]["availability_status"]
          p_weekdays?: number[]
        }
        Returns: number
      }
      place_food_order: { Args: { p_payload: Json }; Returns: Json }
      reassign_reservation_table: {
        Args: { p_item: string; p_table: string }
        Returns: string
      }
      restaurant_availability: {
        Args: { p_date: string; p_listing: string; p_party?: number }
        Returns: Json
      }
      restaurant_finance: {
        Args: { p_from?: string; p_partner: string; p_to?: string }
        Returns: Json
      }
      restaurant_food_stats: {
        Args: { p_days?: number; p_partner: string }
        Returns: Json
      }
      submit_partner_application: { Args: { p_payload: Json }; Returns: Json }
      track_food_order: {
        Args: { p_phone: string; p_reference: string }
        Returns: Json
      }
      trip_slack_days: { Args: never; Returns: number }
    }
    Enums: {
      admin_role:
        | "super_admin"
        | "operations_manager"
        | "partner_manager"
        | "finance_manager"
        | "support_agent"
        | "content_manager"
        | "marketing_manager"
        | "analyst"
        | "risk_manager"
      application_status: "new" | "reviewing" | "accepted" | "rejected"
      availability_status:
        | "available"
        | "blocked"
        | "booked"
        | "maintenance"
        | "closed"
      booking_status: "pending" | "confirmed" | "cancelled"
      campaign_status: "draft" | "scheduled" | "sending" | "sent" | "cancelled"
      cancellation_policy: "free_2h" | "free_24h" | "non_refundable"
      commission_scope:
        | "global"
        | "partner_type"
        | "partner"
        | "service"
        | "promotional"
      confirmation_mode: "automatique" | "manuelle"
      content_status: "draft" | "published" | "archived"
      customer_status: "active" | "suspended" | "closed"
      discount_kind:
        | "early_booking"
        | "last_minute"
        | "weekly"
        | "monthly"
        | "seasonal"
        | "promo_code"
        | "returning"
      dispute_category:
        | "customer_vs_partner"
        | "payment"
        | "service_not_delivered"
        | "property_issue"
        | "vehicle_issue"
        | "restaurant_issue"
        | "refund"
      dispute_resolution:
        | "for_customer"
        | "for_partner"
        | "partial"
        | "refund"
        | "credit"
        | "warning"
        | "partner_suspended"
      dispute_status:
        | "open"
        | "investigating"
        | "awaiting_evidence"
        | "resolved"
        | "closed"
      fee_kind:
        | "cleaning"
        | "service"
        | "resort"
        | "delivery"
        | "extra_guest"
        | "deposit"
        | "tax"
        | "other"
      food_order_status:
        | "received"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "completed"
        | "rejected"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      food_payment_status:
        | "pending"
        | "paid"
        | "refunded"
        | "partially_refunded"
        | "failed"
      fulfillment_mode: "dine_in" | "pickup" | "delivery"
      integration_status: "connected" | "disconnected" | "error"
      invoice_status: "draft" | "issued" | "paid" | "void" | "overdue"
      listing_kind: "stay" | "restaurant" | "car"
      listing_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "published"
        | "paused"
        | "rejected"
        | "suspended"
        | "archived"
      maintenance_kind: "maintenance" | "inspection" | "cleaning" | "repair"
      package_basis: "per_night" | "per_day" | "total"
      partner_document_status:
        | "uploaded"
        | "under_review"
        | "approved"
        | "rejected"
      partner_member_role:
        | "owner"
        | "manager"
        | "reservations_agent"
        | "front_desk"
        | "finance"
        | "marketing"
        | "viewer"
        | "kitchen"
        | "cashier"
        | "delivery_manager"
      partner_member_status: "invited" | "active" | "inactive"
      partner_status:
        | "pending"
        | "active"
        | "suspended"
        | "rejected"
        | "inactive"
      partner_type: "guesthouse" | "restaurant" | "car" | "hotel"
      payment_method: "card" | "mobile_money" | "bank_transfer" | "cash"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "disputed"
        | "chargeback"
      payout_method: "bank" | "card" | "mobile"
      payout_status: "ready" | "processing" | "paid" | "failed" | "held"
      pickup_kind: "office" | "airport" | "hotel_delivery" | "custom"
      price_band: "$" | "$$" | "$$$" | "$$$$"
      promotion_kind:
        | "percentage"
        | "fixed"
        | "free_service"
        | "promo_code"
        | "partner"
        | "destination"
        | "seasonal"
      promotion_status: "draft" | "scheduled" | "active" | "paused" | "expired"
      rate_kind:
        | "base"
        | "weekend"
        | "weekly"
        | "monthly"
        | "seasonal"
        | "special_date"
      refund_status:
        | "requested"
        | "under_review"
        | "approved"
        | "processing"
        | "completed"
        | "rejected"
      revenue_kind: "reservation" | "food_order" | "delivery" | "tip"
      review_flag:
        | "spam"
        | "harassment"
        | "fake"
        | "prohibited_content"
        | "conflict_of_interest"
        | "other"
      review_status: "pending" | "published" | "hidden" | "flagged" | "removed"
      staff_status: "invited" | "active" | "inactive"
      table_status: "available" | "reserved" | "occupied" | "blocked"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status:
        | "new"
        | "open"
        | "waiting_customer"
        | "waiting_partner"
        | "escalated"
        | "resolved"
        | "closed"
      verification_status:
        | "unverified"
        | "pending"
        | "in_review"
        | "verified"
        | "rejected"
        | "expired"
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
      admin_role: [
        "super_admin",
        "operations_manager",
        "partner_manager",
        "finance_manager",
        "support_agent",
        "content_manager",
        "marketing_manager",
        "analyst",
        "risk_manager",
      ],
      application_status: ["new", "reviewing", "accepted", "rejected"],
      availability_status: [
        "available",
        "blocked",
        "booked",
        "maintenance",
        "closed",
      ],
      booking_status: ["pending", "confirmed", "cancelled"],
      campaign_status: ["draft", "scheduled", "sending", "sent", "cancelled"],
      cancellation_policy: ["free_2h", "free_24h", "non_refundable"],
      commission_scope: [
        "global",
        "partner_type",
        "partner",
        "service",
        "promotional",
      ],
      confirmation_mode: ["automatique", "manuelle"],
      content_status: ["draft", "published", "archived"],
      customer_status: ["active", "suspended", "closed"],
      discount_kind: [
        "early_booking",
        "last_minute",
        "weekly",
        "monthly",
        "seasonal",
        "promo_code",
        "returning",
      ],
      dispute_category: [
        "customer_vs_partner",
        "payment",
        "service_not_delivered",
        "property_issue",
        "vehicle_issue",
        "restaurant_issue",
        "refund",
      ],
      dispute_resolution: [
        "for_customer",
        "for_partner",
        "partial",
        "refund",
        "credit",
        "warning",
        "partner_suspended",
      ],
      dispute_status: [
        "open",
        "investigating",
        "awaiting_evidence",
        "resolved",
        "closed",
      ],
      fee_kind: [
        "cleaning",
        "service",
        "resort",
        "delivery",
        "extra_guest",
        "deposit",
        "tax",
        "other",
      ],
      food_order_status: [
        "received",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
        "rejected",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      food_payment_status: [
        "pending",
        "paid",
        "refunded",
        "partially_refunded",
        "failed",
      ],
      fulfillment_mode: ["dine_in", "pickup", "delivery"],
      integration_status: ["connected", "disconnected", "error"],
      invoice_status: ["draft", "issued", "paid", "void", "overdue"],
      listing_kind: ["stay", "restaurant", "car"],
      listing_status: [
        "draft",
        "pending_review",
        "approved",
        "published",
        "paused",
        "rejected",
        "suspended",
        "archived",
      ],
      maintenance_kind: ["maintenance", "inspection", "cleaning", "repair"],
      package_basis: ["per_night", "per_day", "total"],
      partner_document_status: [
        "uploaded",
        "under_review",
        "approved",
        "rejected",
      ],
      partner_member_role: [
        "owner",
        "manager",
        "reservations_agent",
        "front_desk",
        "finance",
        "marketing",
        "viewer",
        "kitchen",
        "cashier",
        "delivery_manager",
      ],
      partner_member_status: ["invited", "active", "inactive"],
      partner_status: [
        "pending",
        "active",
        "suspended",
        "rejected",
        "inactive",
      ],
      partner_type: ["guesthouse", "restaurant", "car", "hotel"],
      payment_method: ["card", "mobile_money", "bank_transfer", "cash"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "disputed",
        "chargeback",
      ],
      payout_method: ["bank", "card", "mobile"],
      payout_status: ["ready", "processing", "paid", "failed", "held"],
      pickup_kind: ["office", "airport", "hotel_delivery", "custom"],
      price_band: ["$", "$$", "$$$", "$$$$"],
      promotion_kind: [
        "percentage",
        "fixed",
        "free_service",
        "promo_code",
        "partner",
        "destination",
        "seasonal",
      ],
      promotion_status: ["draft", "scheduled", "active", "paused", "expired"],
      rate_kind: [
        "base",
        "weekend",
        "weekly",
        "monthly",
        "seasonal",
        "special_date",
      ],
      refund_status: [
        "requested",
        "under_review",
        "approved",
        "processing",
        "completed",
        "rejected",
      ],
      revenue_kind: ["reservation", "food_order", "delivery", "tip"],
      review_flag: [
        "spam",
        "harassment",
        "fake",
        "prohibited_content",
        "conflict_of_interest",
        "other",
      ],
      review_status: ["pending", "published", "hidden", "flagged", "removed"],
      staff_status: ["invited", "active", "inactive"],
      table_status: ["available", "reserved", "occupied", "blocked"],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: [
        "new",
        "open",
        "waiting_customer",
        "waiting_partner",
        "escalated",
        "resolved",
        "closed",
      ],
      verification_status: [
        "unverified",
        "pending",
        "in_review",
        "verified",
        "rejected",
        "expired",
      ],
    },
  },
} as const
