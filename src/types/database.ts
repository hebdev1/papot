export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      car_details: {
        Row: { listing_id: string; make: string; model: string; year: number; body: string; gearbox: string; fuel: string; drivetrain: string; seats: number; doors: number | null; luggage: number | null; with_driver: boolean; air_conditioning: boolean; unlimited_km: boolean; airport_delivery: boolean; min_days: number }
        Insert: { listing_id: string; make: string; model: string; year: number; body: string; gearbox: string; fuel: string; drivetrain: string; seats: number; doors?: number | null; luggage?: number | null; with_driver?: boolean; air_conditioning?: boolean; unlimited_km?: boolean; airport_delivery?: boolean; min_days?: number }
        Update: Partial<Database["public"]["Tables"]["car_details"]["Insert"]>
        Relationships: []
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
        Update: Partial<Database["public"]["Tables"]["destinations"]["Insert"]>
        Relationships: []
      }
      exchange_rates: {
        Row: { base: string; quote: string; rate: number; updated_at: string }
        Insert: { base: string; quote: string; rate: number; updated_at?: string }
        Update: Partial<{ base: string; quote: string; rate: number; updated_at: string }>
        Relationships: []
      }
      listing_units: {
        Row: { id: string; listing_id: string; name: string; detail: string; price: number | null; available: boolean; position: number }
        Insert: { id?: string; listing_id: string; name: string; detail: string; price?: number | null; available?: boolean; position?: number }
        Update: Partial<Database["public"]["Tables"]["listing_units"]["Insert"]>
        Relationships: []
      }
      menu_items: {
        Row: { id: string; listing_id: string; category: string; name: string; detail: string | null; tag: string | null; price: number | null; position: number }
        Insert: { id?: string; listing_id: string; category: string; name: string; detail?: string | null; tag?: string | null; price?: number | null; position?: number }
        Update: Partial<Database["public"]["Tables"]["menu_items"]["Insert"]>
        Relationships: []
      }
      private_options: {
        Row: { id: string; listing_id: string; name: string; capacity: string; from_price: string; position: number }
        Insert: { id?: string; listing_id: string; name: string; capacity: string; from_price: string; position?: number }
        Update: Partial<Database["public"]["Tables"]["private_options"]["Insert"]>
        Relationships: []
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
          img: string
          kind: Database["public"]["Enums"]["listing_kind"]
          location: string
          name: string
          original_price: number | null
          position: number
          price: number
          published: boolean
          rating: number
          rating_scale: number
          reviews: number
          stars: number | null
          type: string
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
          img: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          location: string
          name: string
          original_price?: number | null
          position?: number
          price: number
          published?: boolean
          rating: number
          rating_scale?: number
          reviews?: number
          stars?: number | null
          type: string
          vendor?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>
        Relationships: []
      }
      partner_applications: {
        Row: {
          agree: boolean
          confirmation_sent_at: string | null
          created_at: string
          details: Json
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          photos: string[]
          status: Database["public"]["Enums"]["application_status"]
          type: Database["public"]["Enums"]["partner_type"]
        }
        Insert: {
          agree: boolean
          confirmation_sent_at?: string | null
          created_at?: string
          details?: Json
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          photos?: string[]
          status?: Database["public"]["Enums"]["application_status"]
          type: Database["public"]["Enums"]["partner_type"]
        }
        Update: Partial<Database["public"]["Tables"]["partner_applications"]["Insert"]>
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_booking: {
        Args: { p_payload: Json }
        Returns: Json
      }
      get_booking: {
        Args: { p_reference: string }
        Returns: Json
      }
    }
    Enums: {
      application_status: "new" | "reviewing" | "accepted" | "rejected"
      booking_status: "pending" | "confirmed" | "cancelled"
      listing_kind: "stay" | "restaurant" | "car"
      partner_type: "guesthouse" | "restaurant" | "car"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
