import {
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  ChefHat,
  Car,
  ClipboardCheck,
  Coins,
  CreditCard,
  FileBarChart,
  FileText,
  Gauge,
  Home,
  Layers,
  LayoutGrid,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageSquare,
  Percent,
  Plug,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tags,
  UserCog,
  PackageCheck,
  ShoppingBag,
  SlidersHorizontal,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { PartnerType } from "./partnerAuth";

/**
 * One navigation definition for the partner dashboard (spec §1, §2).
 *
 * The sidebar, the mobile sheet and the route guard all read this, so a screen
 * cannot appear in one place and be missing from another. `permission` hides an
 * entry the role does not cover; the database is what refuses the data.
 *
 * `types` restricts an item to certain business types (spec §2): a restaurant
 * has no rooms and a car rental has no menu, and showing either is how a
 * dashboard starts feeling like an ERP.
 */

export type NavItem = {
  label: string;
  to: string;
  icon: typeof Home;
  permission?: string;
  match?: string;
  types?: PartnerType[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: typeof Home;
  items: NavItem[];
};

export const OVERVIEW: NavItem = {
  label: "Vue d'ensemble",
  to: "/partenaire",
  icon: Gauge,
  match: "/partenaire",
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "listings",
    label: "Annonces",
    icon: LayoutGrid,
    items: [
      { label: "Toutes les annonces", to: "/partenaire/annonces", icon: ListChecks, permission: "manage_listings", match: "/partenaire/annonces" },
      { label: "Chambres", to: "/partenaire/chambres", icon: BedDouble, permission: "manage_listings", types: ["hotel", "guesthouse"] },
      { label: "Flotte", to: "/partenaire/flotte", icon: Car, permission: "manage_listings", types: ["car"] },
      { label: "Lieux de prise en charge", to: "/partenaire/lieux", icon: MapPin, permission: "manage_listings", types: ["car"] },
      { label: "Menu", to: "/partenaire/menu", icon: UtensilsCrossed, permission: "manage_menu", types: ["restaurant"] },
      { label: "Portions et options", to: "/partenaire/options", icon: SlidersHorizontal, permission: "manage_menu", types: ["restaurant"] },
      { label: "Formules et assiettes", to: "/partenaire/formules", icon: Layers, permission: "manage_menu", types: ["restaurant"] },
      { label: "Salles et tables", to: "/partenaire/tables", icon: LayoutGrid, permission: "manage_listings", types: ["restaurant"] },
    ],
  },
  {
    id: "reservations",
    label: "Réservations",
    icon: ClipboardCheck,
    items: [
      { label: "Toutes les réservations", to: "/partenaire/reservations", icon: ClipboardCheck, permission: "view_reservations", match: "/partenaire/reservations" },
      { label: "Calendrier", to: "/partenaire/calendrier", icon: CalendarDays, permission: "view_reservations" },
      { label: "Disponibilité", to: "/partenaire/disponibilite", icon: CalendarDays, permission: "manage_availability" },
    ],
  },
  {
    id: "orders",
    label: "Commandes",
    icon: ShoppingBag,
    items: [
      { label: "Toutes les commandes", to: "/partenaire/commandes", icon: ShoppingBag, permission: "manage_orders", match: "/partenaire/commandes", types: ["restaurant"] },
      { label: "Écran cuisine", to: "/partenaire/cuisine", icon: ChefHat, permission: "manage_orders", types: ["restaurant"] },
      { label: "Disponibilité", to: "/partenaire/stock", icon: PackageCheck, permission: "manage_inventory", types: ["restaurant"] },
    ],
  },
  {
    id: "pricing",
    label: "Tarifs",
    icon: Percent,
    items: [
      { label: "Tarifs", to: "/partenaire/tarifs", icon: Coins, permission: "manage_pricing" },
      { label: "Remises", to: "/partenaire/remises", icon: Tags, permission: "manage_pricing" },
      { label: "Frais et taxes", to: "/partenaire/frais", icon: Receipt, permission: "manage_pricing" },
    ],
  },
  {
    id: "customers",
    label: "Clients",
    icon: Users,
    items: [
      { label: "Clients", to: "/partenaire/clients", icon: Users, permission: "view_customers" },
      { label: "Messages", to: "/partenaire/messages", icon: MessageSquare, permission: "manage_messages" },
      { label: "Avis", to: "/partenaire/avis", icon: Star, permission: "manage_reviews" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    items: [
      { label: "Tableau de bord", to: "/partenaire/finance", icon: Wallet, permission: "view_finance" },
      { label: "Restauration", to: "/partenaire/restauration", icon: UtensilsCrossed, permission: "view_finance", types: ["restaurant"] },
      { label: "Versements", to: "/partenaire/versements", icon: Coins, permission: "view_finance" },
      { label: "Transactions", to: "/partenaire/transactions", icon: Receipt, permission: "view_finance" },
      { label: "Factures", to: "/partenaire/factures", icon: FileText, permission: "view_finance" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Sparkles,
    items: [
      { label: "Offres", to: "/partenaire/paquets", icon: Layers, permission: "manage_promotions" },
      { label: "Promotions", to: "/partenaire/promotions", icon: Sparkles, permission: "manage_promotions" },
      { label: "Codes promo", to: "/partenaire/coupons", icon: Tags, permission: "manage_promotions" },
    ],
  },
  {
    id: "analytics",
    label: "Analyses",
    icon: BarChart3,
    items: [
      { label: "Analyses", to: "/partenaire/analyses", icon: BarChart3, permission: "view_analytics" },
      { label: "Rapports", to: "/partenaire/rapports", icon: FileBarChart, permission: "view_analytics" },
    ],
  },
  {
    id: "business",
    label: "Entreprise",
    icon: Building2,
    items: [
      { label: "Profil de l'entreprise", to: "/partenaire/entreprise", icon: Building2, permission: "manage_settings" },
      { label: "Vérification", to: "/partenaire/verification", icon: Shield, permission: "manage_documents" },
      { label: "Équipe", to: "/partenaire/equipe", icon: UserCog, permission: "manage_staff" },
      { label: "Activité", to: "/partenaire/activite", icon: ScrollText },
    ],
  },
  {
    id: "settings",
    label: "Réglages",
    icon: Settings,
    items: [
      { label: "Règles de réservation", to: "/partenaire/reglages/reservation", icon: ClipboardCheck, permission: "manage_settings" },
      { label: "Politiques", to: "/partenaire/reglages/politiques", icon: ScrollText, permission: "manage_settings" },
      { label: "Notifications", to: "/partenaire/reglages/notifications", icon: Bell, permission: "manage_settings" },
      { label: "Paiements", to: "/partenaire/reglages/paiements", icon: CreditCard, permission: "manage_payouts" },
      { label: "Intégrations", to: "/partenaire/reglages/integrations", icon: Plug, permission: "manage_settings" },
      { label: "Sécurité", to: "/partenaire/reglages/securite", icon: Shield },
      { label: "Mon compte", to: "/partenaire/reglages/compte", icon: UserCog },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  { label: "Aide", to: "/partenaire/aide", icon: LifeBuoy },
  { label: "Support", to: "/partenaire/support", icon: LifeBuoy },
];

/** Mobile tab bar (spec §4): five destinations, never a shrunken sidebar. */
export const MOBILE_TABS: NavItem[] = [
  { label: "Accueil", to: "/partenaire", icon: Home, match: "/partenaire" },
  { label: "Commandes", to: "/partenaire/commandes", icon: ShoppingBag, permission: "manage_orders", types: ["restaurant"] },
  { label: "Réservations", to: "/partenaire/reservations", icon: ClipboardCheck, permission: "view_reservations" },
  { label: "Menu", to: "/partenaire/menu", icon: UtensilsCrossed, permission: "manage_menu", types: ["restaurant"] },
  { label: "Annonces", to: "/partenaire/annonces", icon: LayoutGrid, permission: "manage_listings", types: ["hotel", "guesthouse", "car"] },
  { label: "Messages", to: "/partenaire/messages", icon: MessageSquare, permission: "manage_messages" },
];

export const MOBILE_MORE: NavItem[] = [
  { label: "Écran cuisine", to: "/partenaire/cuisine", icon: ChefHat, permission: "manage_orders", types: ["restaurant"] },
  { label: "Disponibilité des plats", to: "/partenaire/stock", icon: PackageCheck, permission: "manage_inventory", types: ["restaurant"] },
  { label: "Calendrier", to: "/partenaire/calendrier", icon: CalendarDays, permission: "view_reservations" },
  { label: "Disponibilité", to: "/partenaire/disponibilite", icon: CalendarDays, permission: "manage_availability" },
  { label: "Tarifs", to: "/partenaire/tarifs", icon: Coins, permission: "manage_pricing" },
  { label: "Finance", to: "/partenaire/finance", icon: Wallet, permission: "view_finance" },
  { label: "Avis", to: "/partenaire/avis", icon: Star, permission: "manage_reviews" },
  { label: "Analyses", to: "/partenaire/analyses", icon: BarChart3, permission: "view_analytics" },
  { label: "Équipe", to: "/partenaire/equipe", icon: UserCog, permission: "manage_staff" },
  { label: "Réglages", to: "/partenaire/reglages/reservation", icon: Settings, permission: "manage_settings" },
  { label: "Support", to: "/partenaire/support", icon: LifeBuoy },
];

/** Filters the tree for one business type and one role. */
export function visibleGroups(type: PartnerType | undefined, can: (p: string) => boolean) {
  return NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(
      i =>
        (!i.permission || can(i.permission)) &&
        (!i.types || (type ? i.types.includes(type) : false)),
    ),
  })).filter(g => g.items.length > 0);
}

export function allNavItems(): NavItem[] {
  return [OVERVIEW, ...NAV_GROUPS.flatMap(g => g.items), ...FOOTER_ITEMS];
}
