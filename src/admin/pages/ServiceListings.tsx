import { ListingsTable } from "./Listings";

/**
 * Spec §20–§23. Hotels, guesthouses, rental cars and restaurants are the same
 * listing table scoped to one service, rather than four divergent screens: an
 * operator who learns the columns once knows all four, and a fix to filtering
 * or bulk actions lands everywhere at once.
 *
 * Hotels and guesthouses share the `stay` listing kind and are separated by the
 * partner's type, which is the only place that distinction is recorded.
 */
export function ServiceListings({ service }: { service: "hotel" | "guesthouse" | "car" | "restaurant" }) {
  if (service === "hotel") {
    return (
      <ListingsTable
        title="Hôtels"
        subtitle="Propriétés hôtelières, leurs chambres et leur disponibilité."
        lockKind="stay"
        lockPartnerType="hotel"
      />
    );
  }

  if (service === "guesthouse") {
    return (
      <ListingsTable
        title="Maisons d'hôtes"
        subtitle="Maisons d'hôtes, appartements et locations entières."
        lockKind="stay"
        lockPartnerType="guesthouse"
      />
    );
  }

  if (service === "car") {
    return (
      <ListingsTable
        title="Location de voitures"
        subtitle="Véhicules, sociétés de location et documents associés."
        lockKind="car"
      />
    );
  }

  return (
    <ListingsTable
      title="Restaurants"
      subtitle="Établissements, capacité et réservations de table."
      lockKind="restaurant"
    />
  );
}
