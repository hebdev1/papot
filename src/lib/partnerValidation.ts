import type { PartnerType, WizardState } from "../components/PartnerOnboarding";

/**
 * Per-step requirements. Every step that collects data must be complete before
 * Continue unlocks — the wizard cannot be clicked through.
 *
 * Returns the human-readable list of what is still missing, so the UI can say
 * why the button is disabled instead of leaving the partner guessing.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

const has = (v?: string, min = 1) => !!v && v.trim().length >= min;

export function validateStep(
  step: string,
  partnerType: PartnerType,
  s: WizardState,
): string[] {
  const f = s.formData;
  const missing: string[] = [];
  const need = (ok: boolean, label: string) => {
    if (!ok) missing.push(label);
  };

  switch (step) {
    case "type":
      need(!!partnerType, "Choisissez un type de partenaire");
      break;

    case "account":
      need(has(f.firstName), "Prénom");
      need(has(f.lastName), "Nom");
      need(EMAIL_RE.test(f.email ?? ""), "Courriel valide");
      need(has(f.phone, 6), "Téléphone");
      need(has(f.password, 8), "Mot de passe (8 caractères min.)");
      need(
        /\d/.test(f.password ?? "") && /[A-Z]/.test(f.password ?? ""),
        "Un chiffre et une majuscule dans le mot de passe",
      );
      need(!!f.password && f.password === f.confirmPassword, "Confirmation identique");
      break;

    case "profile":
      need(has(f.bizName, 2), "Nom commercial");
      need(has(f.shortDesc, 10), "Description courte (10 caractères min.)");
      need(has(f.bizPhone, 6) || has(f.phone, 6), "Téléphone professionnel");
      break;

    case "location":
      need(has(f.city, 2), "Ville");
      need(has(f.commune) || has(f.neighborhood), "Commune ou quartier");
      break;

    case "details":
      if (partnerType === "hotel") {
        need(has(f.hotelName, 2), "Nom de l'hôtel");
        need(has(f.hotelType), "Type d'hôtel");
        need(has(f.rooms), "Nombre de chambres");
        need(has(f.capacity), "Capacité maximale");
      } else if (partnerType === "guesthouse") {
        need(has(f.ghName, 2), "Nom de la propriété");
        need(has(f.ghType), "Type de propriété");
        need(has(f.ghRooms), "Nombre de chambres");
        need(has(f.ghCapacity), "Capacité maximale");
      } else if (partnerType === "car") {
        need(has(f.carCompany, 2), "Nom de l'agence");
        need(has(f.fleetSize), "Nombre de véhicules");
        need(has(f.carPhone, 6), "Téléphone");
      } else if (partnerType === "restaurant") {
        need(has(f.restName, 2), "Nom du restaurant");
        need(has(f.restType), "Type de restaurant");
        need(has(f.priceRange), "Fourchette de prix");
        need(has(f.restCapacity), "Capacité (couverts)");
      }
      break;

    case "amenities":
      need(s.amenities.length > 0, "Au moins un équipement");
      break;

    case "inventory":
      if (partnerType === "car") need(s.vehicles.length > 0, "Au moins un véhicule");
      else if (partnerType === "hotel" || partnerType === "guesthouse")
        need(s.rooms.length > 0, "Au moins un type de chambre");
      break;

    case "schedule":
      if (partnerType === "restaurant") {
        need(has(f.minParty), "Taille min. du groupe");
        need(has(f.maxParty), "Taille max. du groupe");
        need(has(f.confirm), "Mode de confirmation");
        need(Object.values(s.hours).some(h => h.open), "Au moins un jour d'ouverture");
      } else if (partnerType === "car") {
        need(has(f.dailyRate), "Tarif / jour");
        need(has(f.deposit), "Dépôt de garantie");
      }
      break;

    case "photos":
      need(s.photos.length > 0, "Au moins une photo");
      break;

    case "payout": {
      const bank = has(f.accountHolder) && has(f.bankName) && has(f.accountNum, 4);
      const mobile = has(f.mobileService) && has(f.mobileNum, 6) && has(f.mobileHolder);
      need(bank || mobile, "Coordonnées bancaires ou mobile money complètes");
      need(has(f.currency), "Devise");
      break;
    }

    // welcome / policies / verification / review / submit collect no data.
    default:
      break;
  }

  return missing;
}
