import type { PartnerType, WizardState } from "../components/PartnerOnboarding";

/**
 * Maps the wizard's flat `formData` onto the typed contract that
 * `submit_partner_application` expects.
 *
 * The wizard uses a different field id per vertical for the same concept
 * (hotelName / ghName / restName / carCompany all mean "business name"), so
 * this is where that is reconciled. Credentials and raw payment instruments
 * are simply never read here — there is nowhere for them to go.
 */

const DAY_ORDER = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * The wizard tracks amenities by their French label; the database keys them by
 * code. Both sides derive the code from the label the same way, so there is no
 * lookup table to drift out of sync.
 */
export const amenitySlug = (label: string) =>
  label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const CANCELLATION: Record<string, string> = {
  "Gratuite jusqu'à 2h avant": "free_2h",
  "Gratuite jusqu'à 24h avant": "free_24h",
  "Non remboursable": "non_refundable",
};

/** "$$ (Modéré)" -> "$$" */
const priceBand = (v?: string) => (v ? v.trim().split(" ")[0] : undefined);

const pick = (...vals: (string | undefined)[]) =>
  vals.map(v => v?.trim()).find(v => v) || undefined;

/** Which payout tab the partner actually filled in. */
function payoutMethod(f: Record<string, string>): string | undefined {
  if (f.accountNum || f.bankName || f.routing) return "bank";
  if (f.cardNum || f.cardName) return "card";
  if (f.mobileNum || f.mobileService) return "mobile";
  return undefined;
}

export function buildPayload(type: Exclude<PartnerType, null>, state: WizardState) {
  const f = state.formData;
  const isCar = type === "car";
  const isRestaurant = type === "restaurant";
  const isLodging = type === "hotel" || type === "guesthouse";

  return {
    type,
    agree: true,

    contact: {
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email,
      phone: pick(f.phone, f.bizPhone, f.carPhone, f.restPhone),
      whatsapp: pick(f.whatsapp, f.bizWhatsapp),
      locale: f.language === "Kreyòl" ? "ht" : f.language === "English" ? "en" : "fr",
    },

    business: {
      name: pick(f.bizName, f.hotelName, f.ghName, f.restName, f.carCompany),
      legalName: f.legalName,
      subtype: pick(f.hotelType, f.ghType, f.restType, f.bizType),
      yearEstablished: pick(f.yearEst, f.yearOpen, f.restYear),
      email: pick(f.bizEmail, f.carEmail, f.email),
      phone: pick(f.bizPhone, f.carPhone, f.restPhone),
      website: f.website,
      shortDesc: pick(f.shortDesc, f.desc, f.ghDesc, f.carDesc, f.restDesc, f.fullDesc),
      fullDesc: pick(f.fullDesc, f.desc, f.ghDesc, f.carDesc, f.restDesc),
    },

    location: {
      country: f.country,
      department: f.state,
      city: f.city,
      commune: f.commune,
      neighborhood: f.neighborhood,
      postalCode: f.postalCode,
      landmark: f.landmark,
      arrivalNotes: f.arrivalNotes,
    },

    // Each vertical only sends its own numbers; the DB rejects cross-contamination.
    capacity: {
      rooms: isLodging ? pick(f.rooms, f.ghRooms) : undefined,
      floors: isLodging ? pick(f.floors, f.ghFloors) : undefined,
      maxCapacity: isLodging ? pick(f.capacity, f.ghCapacity) : undefined,
      fleetSize: isCar ? f.fleetSize : undefined,
      seats: isRestaurant ? f.restCapacity : undefined,
      priceBand: isRestaurant ? priceBand(f.priceRange) : undefined,
    },

    service: isRestaurant
      ? {
          minParty: f.minParty,
          maxParty: f.maxParty,
          mealDuration: f.resDuration,
          minNotice: f.minNotice,
          confirmation: f.confirm ? f.confirm.toLowerCase() : undefined,
          cancellation: CANCELLATION[f.cancelPolicy ?? ""],
        }
      : {},

    pricing: isCar
      ? {
          daily: f.dailyRate,
          weekly: f.weeklyRate,
          monthly: f.monthlyRate,
          deposit: f.deposit,
          includedKm: f.mileage,
          extraKm: f.extraMileage,
        }
      : {},

    payout: {
      method: payoutMethod(f),
      holder: pick(f.accountHolder, f.mobileHolder, f.cardName),
      bank: f.bankName,
      country: f.payCountry,
      currency: f.currency ? f.currency.slice(0, 3) : undefined,
      mobileService: f.mobileService,
      // Only digits are sent; the RPC keeps the last four and discards the rest.
      accountNum: pick(f.accountNum, f.mobileNum),
    },

    amenities: state.amenities.map(amenitySlug),

    rooms: isLodging
      ? state.rooms.map(r => ({
          name: r.name,
          type: r.type,
          capacity: r.capacity,
          beds: r.beds,
          price: r.price,
          units: r.units,
        }))
      : [],

    vehicles: isCar
      ? state.vehicles.map(v => ({
          make: v.make,
          model: v.model,
          year: v.year,
          bodyType: v.type,
          seats: v.seats,
          transmission: v.transmission,
        }))
      : [],

    hours: Object.entries(state.hours).map(([day, h]) => ({
      weekday: DAY_ORDER.indexOf(day),
      isOpen: h.open,
      opensAt: h.from,
      closesAt: h.to,
    })).filter(h => h.weekday >= 0),

    photos: [],
  };
}
