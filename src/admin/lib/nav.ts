import {
  Activity,
  BadgePercent,
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  Car,
  CircleDollarSign,
  ClipboardCheck,
  Coins,
  FileBarChart,
  FileText,
  Files,
  Gauge,
  Globe2,
  Home,
  Image,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageSquare,
  Plug,
  Receipt,
  RefreshCcw,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  Star,
  Tags,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

/**
 * The single navigation definition (spec §1). The sidebar, the mobile menu, the
 * command palette and the route guard all read this, so a screen cannot appear
 * in one place and be missing from another.
 *
 * `permission` is what the item needs to be useful. It hides the entry; the
 * database is what actually refuses the data.
 */

export type NavItem = {
  label: string;
  to: string;
  icon: typeof Home;
  permission?: string;
  /** Matched as a prefix so detail pages keep their parent highlighted. */
  match?: string;
  badge?: keyof BadgeCounts;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: typeof Home;
  items: NavItem[];
};

/** Counts the sidebar can surface next to an item. */
export type BadgeCounts = {
  pending_partner_approvals: number;
  pending_listing_reviews: number;
  refund_requests: number;
  open_disputes: number;
  support_tickets: number;
  payment_issues: number;
  flagged_reviews: number;
};

export const OVERVIEW: NavItem = { label: "Vue d'ensemble", to: "/admin", icon: Gauge, match: "/admin" };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "users",
    label: "Utilisateurs",
    icon: Users,
    items: [
      { label: "Clients", to: "/admin/clients", icon: Users, permission: "view_customers", match: "/admin/clients" },
      { label: "Partenaires", to: "/admin/partenaires", icon: Building2, permission: "view_partners", match: "/admin/partenaires", badge: "pending_partner_approvals" },
      { label: "Personnel", to: "/admin/personnel", icon: UserCog, permission: "manage_staff" },
    ],
  },
  {
    id: "listings",
    label: "Annonces",
    icon: LayoutGrid,
    items: [
      { label: "Toutes les annonces", to: "/admin/annonces", icon: ListChecks, permission: "view_listings", match: "/admin/annonces", badge: "pending_listing_reviews" },
      { label: "Hôtels", to: "/admin/hotels", icon: Building2, permission: "view_listings" },
      { label: "Maisons d'hôtes", to: "/admin/maisons-dhotes", icon: BedDouble, permission: "view_listings" },
      { label: "Location de voitures", to: "/admin/voitures", icon: Car, permission: "view_listings" },
      { label: "Restaurants", to: "/admin/restaurants", icon: UtensilsCrossed, permission: "view_listings" },
    ],
  },
  {
    id: "reservations",
    label: "Réservations",
    icon: ClipboardCheck,
    items: [
      { label: "Toutes les réservations", to: "/admin/reservations", icon: ClipboardCheck, permission: "view_bookings", match: "/admin/reservations" },
      { label: "Séjours hôtels", to: "/admin/reservations?type=hotel", icon: Building2, permission: "view_bookings" },
      { label: "Séjours maisons d'hôtes", to: "/admin/reservations?type=guesthouse", icon: BedDouble, permission: "view_bookings" },
      { label: "Locations de voitures", to: "/admin/reservations?type=car", icon: Car, permission: "view_bookings" },
      { label: "Tables restaurants", to: "/admin/reservations?type=restaurant", icon: UtensilsCrossed, permission: "view_bookings" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: CircleDollarSign,
    items: [
      { label: "Tableau de bord", to: "/admin/finance", icon: CircleDollarSign, permission: "view_payments" },
      { label: "Paiements", to: "/admin/paiements", icon: Wallet, permission: "view_payments", match: "/admin/paiements", badge: "payment_issues" },
      { label: "Versements", to: "/admin/versements", icon: Coins, permission: "view_payments" },
      { label: "Remboursements", to: "/admin/remboursements", icon: RefreshCcw, permission: "view_payments", badge: "refund_requests" },
      { label: "Commissions", to: "/admin/commissions", icon: BadgePercent, permission: "view_payments" },
      { label: "Transactions", to: "/admin/transactions", icon: Receipt, permission: "view_payments" },
      { label: "Factures", to: "/admin/factures", icon: FileText, permission: "view_payments" },
    ],
  },
  {
    id: "operations",
    label: "Opérations",
    icon: Activity,
    items: [
      { label: "Vérifications", to: "/admin/verification", icon: ClipboardCheck, permission: "manage_verification", match: "/admin/verification", badge: "pending_partner_approvals" },
      { label: "Avis", to: "/admin/avis", icon: Star, permission: "view_reviews", badge: "flagged_reviews" },
      { label: "Litiges", to: "/admin/litiges", icon: ShieldAlert, permission: "view_disputes", match: "/admin/litiges", badge: "open_disputes" },
      { label: "Support", to: "/admin/support", icon: LifeBuoy, permission: "view_support", match: "/admin/support", badge: "support_tickets" },
      { label: "Messages", to: "/admin/messages", icon: MessageSquare, permission: "view_messages" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Sparkles,
    items: [
      { label: "Promotions", to: "/admin/promotions", icon: Sparkles, permission: "manage_promotions" },
      { label: "Codes promo", to: "/admin/coupons", icon: Tags, permission: "manage_promotions" },
      { label: "Mises en avant", to: "/admin/mises-en-avant", icon: Star, permission: "manage_promotions" },
      { label: "Notifications", to: "/admin/notifications", icon: Bell, permission: "manage_content" },
    ],
  },
  {
    id: "content",
    label: "Contenu",
    icon: Files,
    items: [
      { label: "Destinations", to: "/admin/destinations", icon: MapPin, permission: "manage_content" },
      { label: "Catégories", to: "/admin/categories", icon: Tags, permission: "manage_content" },
      { label: "Équipements", to: "/admin/equipements", icon: ListChecks, permission: "manage_content" },
      { label: "Politiques", to: "/admin/politiques", icon: ScrollText, permission: "manage_content" },
      { label: "Pages", to: "/admin/pages", icon: Image, permission: "manage_content" },
    ],
  },
  {
    id: "analytics",
    label: "Analyses",
    icon: BarChart3,
    items: [
      { label: "Analyses", to: "/admin/analyses", icon: BarChart3, permission: "view_analytics" },
      { label: "Rapports", to: "/admin/rapports", icon: FileBarChart, permission: "view_analytics" },
    ],
  },
  {
    id: "system",
    label: "Système",
    icon: Settings,
    items: [
      { label: "Rôles et permissions", to: "/admin/roles", icon: KeyRound, permission: "manage_staff" },
      { label: "Journal d'audit", to: "/admin/audit", icon: ScrollText, permission: "view_audit_logs" },
      { label: "Sécurité", to: "/admin/securite", icon: Shield, permission: "view_security" },
      { label: "Intégrations", to: "/admin/integrations", icon: Plug, permission: "manage_platform_settings" },
      { label: "Paramètres", to: "/admin/parametres", icon: Settings, permission: "manage_platform_settings" },
    ],
  },
];

/** Mobile tab bar (spec §2): five destinations, not a shrunken sidebar. */
export const MOBILE_TABS: NavItem[] = [
  { label: "Accueil", to: "/admin", icon: Gauge, match: "/admin" },
  { label: "Opérations", to: "/admin/verification", icon: Activity, permission: "manage_verification" },
  { label: "Réservations", to: "/admin/reservations", icon: ClipboardCheck, permission: "view_bookings" },
  { label: "Finance", to: "/admin/finance", icon: CircleDollarSign, permission: "view_payments" },
];

/** What the "Plus" sheet offers (spec §2). */
export const MOBILE_MORE: NavItem[] = [
  { label: "Clients", to: "/admin/clients", icon: Users, permission: "view_customers" },
  { label: "Partenaires", to: "/admin/partenaires", icon: Building2, permission: "view_partners" },
  { label: "Annonces", to: "/admin/annonces", icon: LayoutGrid, permission: "view_listings" },
  { label: "Vérifications", to: "/admin/verification", icon: ClipboardCheck, permission: "manage_verification" },
  { label: "Avis", to: "/admin/avis", icon: Star, permission: "view_reviews" },
  { label: "Litiges", to: "/admin/litiges", icon: ShieldAlert, permission: "view_disputes" },
  { label: "Support", to: "/admin/support", icon: LifeBuoy, permission: "view_support" },
  { label: "Marketing", to: "/admin/promotions", icon: Sparkles, permission: "manage_promotions" },
  { label: "Analyses", to: "/admin/analyses", icon: BarChart3, permission: "view_analytics" },
  { label: "Paramètres", to: "/admin/parametres", icon: Settings, permission: "manage_platform_settings" },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: "Mon profil", to: "/admin/profil", icon: UserCog },
  { label: "Aide", to: "/admin/aide", icon: LifeBuoy },
  { label: "État du système", to: "/admin/statut", icon: Globe2 },
];

/** Flattened, for the command palette and global search (spec §56, §57). */
export function allNavItems(): NavItem[] {
  return [OVERVIEW, ...NAV_GROUPS.flatMap(g => g.items), ...FOOTER_ITEMS];
}
