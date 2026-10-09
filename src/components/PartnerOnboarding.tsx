import { useEffect, useRef, useState } from "react";
import type React from "react";
import { supabase } from "../lib/supabase";
import { emailReturnUrl } from "../lib/authRedirect";
import { Badge } from "./ui/cvui-badge";
import { buildPayload, packList, unpackList } from "../lib/partnerPayload";
import { validateStep } from "../lib/partnerValidation";
import { PARTNER_DOCUMENTS_BUCKET, PARTNER_PHOTOS_BUCKET } from "../lib/supabase";

/* ─── TYPES ─────────────────────────────────────────── */
export type PartnerType = "hotel" | "guesthouse" | "car" | "restaurant" | "bus" | null;
export type WizardState = {
  step: number;
  partnerType: PartnerType;
  formData: Record<string, string>;
  amenities: string[];
  hours: Record<string, { open: boolean; from: string; to: string }>;
  rooms: RoomItem[];
  vehicles: VehicleItem[];
  coaches: CoachItem[];
  routes: RouteItem[];
  /** "unsaved" is real: storage can be blocked, and then nothing is kept. */
  autosaveStatus: "saved" | "saving" | "unsaved";
  photos: File[];
  documents: Record<string, File>;
};

/**
 * The draft, kept between visits.
 *
 * The wizard displayed "Enregistré" from its very first render — `autosaveStatus`
 * was initialised to "saved" and never assigned again — and offered a
 * "Enregistrer et quitter" button with no handler. Nothing was saved anywhere:
 * the state lived in `useState`, and Supabase was only touched at submit. An
 * hotelier who filled fifteen steps, closed the tab and came back found an
 * empty form, having been told twice that their work was safe.
 *
 * Fifteen steps is too much to lose, so the promise is made true rather than
 * removed. localStorage, because at this point in the flow there is no account
 * to hang a server-side draft on.
 *
 * Photos and documents are `File` objects and cannot be serialised. They are
 * left out and the wizard says so, which is better than appearing to keep them
 * and silently dropping them at submit.
 */
const DRAFT_KEY = "papot.partner.draft.v1";

/**
 * Quatorze jours.
 *
 * Le dossier se remplit en quinze minutes et l'examen est annoncé sous 24 à 48
 * heures, donc « je finis ce week-end » tient deux fois dans ce délai. Au-delà,
 * un brouillon abandonné n'a plus rien à faire dans un navigateur peut-être
 * partagé : il porte un nom, une adresse, un téléphone, une banque et le nom
 * d'un titulaire de compte. `clearDraft()` ne tournait qu'après une soumission
 * réussie — un dossier jamais terminé ne s'effaçait donc jamais.
 */
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Ce qu'un brouillon a le droit de contenir.
 *
 * Une liste d'autorisation, pas d'interdiction. Un champ ajouté plus tard à une
 * étape est exclu du disque jusqu'à ce que quelqu'un l'inscrive ici, ce qui est
 * le bon sens de l'échec ; une liste d'interdiction échoue dans l'autre sens, et
 * le prochain champ sensible part en localStorage dès la première frappe.
 *
 * `updateForm` est délibérément intact. Le mot de passe doit vivre en mémoire :
 * `submit()` le passe à `supabase.auth.signUp`. La règle est qu'il n'atteigne
 * jamais le disque, pas qu'il n'existe jamais.
 *
 * Volontairement absents, et pourquoi :
 *   password, confirmPassword   des identifiants. Supabase Auth les détient ;
 *                               nous, non, à aucun moment et nulle part.
 *   accountNum, routing,        des instruments de paiement.
 *   mobileNum                   `submit_partner_application` n'en garde que les
 *                               quatre derniers chiffres, côté serveur, et c'est
 *                               tout ce dont PAPOT a besoin. Un numéro complet
 *                               en clair dans un navigateur était le seul
 *                               endroit du parcours où il existait.
 *   cardNum, cardName, cardExp  l'onglet « Carte débit » n'existe plus. Listés
 *                               ici pour qu'un brouillon écrit par une version
 *                               antérieure soit nettoyé à la lecture.
 *
 * Les clés marquées « dynamique » ne se trouvent pas en cherchant
 * `onChange("…")` : elles sont construites à l'exécution depuis un tableau.
 */
const DRAFT_FIELDS = [
  // Compte & contact — StepAccount
  "firstName", "lastName", "email", "phone", "whatsapp", "language",

  // Profil d'entreprise — StepBusinessProfile
  "bizName", "legalName", "bizType", "yearEst", "bizPhone", "bizEmail",
  "website", "bizWhatsapp", "shortDesc", "fullDesc",
  // dynamique : la grille des réseaux sociaux
  "instagram", "facebook", "tiktok",

  // Localisation — StepLocation
  "country", "state", "city", "commune", "neighborhood", "postalCode",
  "addr1", "addr2", "landmark", "arrivalNotes",

  // Détails — hôtel
  "hotelName", "hotelType", "stars", "rooms", "floors", "capacity",
  "yearOpen", "desc",
  // Détails — maison d'hôtes
  "ghName", "ghType", "ghRooms", "ghFloors", "ghCapacity", "bookingType", "ghDesc",
  // Détails — location de voiture
  "ownerType", "carCompany", "fleetSize", "carEmail", "carPhone", "carDesc",
  // Détails — restaurant
  "restName", "restType", "priceRange", "restYear", "restCapacity", "restPhone",
  "cuisines", "restDesc",
  // Détails — transport. `busCities` est une liste empaquetée par `packList`,
  // comme `cuisines` : elle vit dans `formData` plutôt qu'à côté parce que
  // l'étape se démonte à chaque retour en arrière.
  "busCompany", "busType", "busCities", "busEmail", "busPhone", "busDesc",

  // Horaires & réservations — restaurant
  "minParty", "maxParty", "resDuration", "minNotice", "confirm", "cancelPolicy",

  // Tarifs — location de voiture
  "dailyRate", "weeklyRate", "monthlyRate", "deposit", "mileage", "extraMileage",
  // dynamique : les cinq services proposés
  "insurance", "airportPickup", "hotelDelivery", "homeDelivery", "diffReturn",

  // dynamique : les huit identifiants du tableau `policies` — StepPolicies
  "cancellation", "refund", "noshow", "pets", "smoking", "children",
  "minage", "damage",

  // Paiements — StepPayout, instruments exclus
  "accountHolder", "bankName", "payCountry", "currency",
  "mobileService", "mobileHolder",
  // L'onglet choisi : ce n'est pas une donnée bancaire, c'est l'endroit où la
  // personne était. Le garder est ce qui la ramène sur le bon formulaire.
  "payoutTab",
] as const;

/**
 * Le filtre, utilisé des deux côtés.
 *
 * Il itère la liste d'autorisation et non les clés de l'objet : une clé inconnue
 * — d'un brouillon antérieur, ou réécrit à la main — est donc abandonnée par
 * construction, à l'écriture comme à la lecture.
 */
const draftFields = (f: unknown): Record<string, string> => {
  const src = (f ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of DRAFT_FIELDS) {
    const v = src[k];
    // Une chaîne vide se relit exactement comme une clé absente — partout les
    // champs font `data.x || ""` — donc on ne l'écrit pas.
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
};

const PARTNER_TYPE_VALUES = ["hotel", "guesthouse", "car", "restaurant", "bus"] as const;

type DraftState = Omit<WizardState, "photos" | "documents" | "autosaveStatus">;
type StoredDraft = DraftState & { savedAt?: number };

function readDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft | null;
    if (!d || typeof d !== "object" || typeof d.step !== "number") return null;

    // `savedAt` absent = brouillon écrit par une version antérieure, dont on ne
    // connaît pas l'âge. On le garde — perdre quinze étapes de saisie serait
    // punir quelqu'un pour un bug qui n'est pas le sien — et le filtre ci-dessous
    // le débarrasse de ce qu'il n'aurait jamais dû contenir. Le premier
    // enregistrement automatique, qui tourne au montage, le réécrit propre et
    // daté : c'est ce qui retire le mot de passe du disque, et pas seulement de
    // l'état.
    if (typeof d.savedAt === "number" && Date.now() - d.savedAt > DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }

    const type = d.partnerType as string | null;
    return {
      step: d.step,
      partnerType: PARTNER_TYPE_VALUES.includes(type as never)
        ? (type as DraftState["partnerType"])
        : null,
      // Le filtre côté lecture, et pas seulement côté écriture. Un brouillon
      // déjà posé dans le navigateur de quelqu'un contient son mot de passe en
      // clair : le recharger dans l'état le remettrait en circulation, et le
      // réécrirait tel quel au prochain enregistrement.
      formData: draftFields(d.formData),
      amenities: Array.isArray(d.amenities) ? d.amenities : [],
      hours: d.hours ?? DEFAULT_HOURS,
      rooms: Array.isArray(d.rooms) ? d.rooms : [],
      vehicles: Array.isArray(d.vehicles) ? d.vehicles : [],
      coaches: Array.isArray(d.coaches) ? d.coaches : [],
      routes: Array.isArray(d.routes) ? d.routes : [],
    };
  } catch {
    return null;
  }
}

function writeDraft(s: WizardState) {
  try {
    // Construit champ par champ plutôt que par un `...reste` : c'est ce qui
    // garantit qu'une clé ajoutée à `WizardState` demain ne s'écrive pas toute
    // seule sur le disque.
    const keep: StoredDraft = {
      step: s.step,
      partnerType: s.partnerType,
      formData: draftFields(s.formData),
      amenities: s.amenities,
      hours: s.hours,
      rooms: s.rooms,
      vehicles: s.vehicles,
      coaches: s.coaches,
      routes: s.routes,
      // Repoussé à chaque enregistrement : le délai court depuis la dernière
      // activité, pas depuis la première, ce qui est le sens de « reprendre ».
      savedAt: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(keep));
    return true;
  } catch {
    // Private browsing, or the quota is full. The caller shows "non enregistré"
    // rather than claiming a save that did not happen.
    return false;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do: the draft simply outlives its usefulness */
  }
}

type RoomItem = { id: number; name: string; type: string; capacity: string; beds: string; price: string; units: string };
type VehicleItem = { id: number; make: string; model: string; year: string; type: string; seats: string; transmission: string };

/**
 * Un autocar et un trajet, tels que l'entreprise les déclare.
 *
 * `seats` est le seul chiffre obligatoire d'un autocar : il devient la capacité
 * de chaque départ, et une capacité devinée vend soit une place qui n'existe
 * pas, soit une place de moins que le véhicule.
 *
 * La durée se saisit en heures et minutes parce que « 6 h 00 » est ce que
 * l'exploitant a en tête ; `buildPayload` la convertit en minutes, qui est ce
 * que la base garde. Les arrêts et les heures de départ sont des listes
 * séparées par des virgules : une seule ligne de saisie, et rien à apprendre.
 */
type CoachItem = {
  id: number; label: string; seats: string; pattern: string;
  coachType: string; make: string; model: string; year: string; plate: string;
};
type RouteItem = {
  id: number; origin: string; destination: string; stops: string;
  durationH: string; durationM: string; fare: string;
  departures: string; weekdays: number[];
};

/* ─── STEP META ─────────────────────────────────────── */
const STEP_NAMES = [
  "Bienvenue",
  "Type de partenaire",
  "Compte & Contact",
  "Profil d'entreprise",
  "Localisation",
  "Détails",
  "Équipements",
  "Services & Inventaire",
  "Horaires & Options",
  "Photos & Médias",
  "Politiques",
  "Vérification",
  "Paiements",
  "Révision",
  "Soumettre",
  "Succès",
];
const TOTAL_STEPS = 15; // 0 = welcome (no progress), 1-15 counted

/* ─── ICONS ─────────────────────────────────────────── */
const Ico = {
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  ),
  ArrowLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  ),
  MapPin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Eye: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  Save: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
    </svg>
  ),
  HelpCircle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Star: ({ filled }: { filled?: boolean }) => (
    <svg viewBox="0 0 24 24" fill={filled ? "#e76f2e" : "none"} stroke="#e76f2e" strokeWidth="1.5" className="w-6 h-6 cursor-pointer">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
    </svg>
  ),
};

/* ─── PRIMITIVES ─────────────────────────────────────── */
function Field({
  label, id, type = "text", placeholder = "", value, onChange, error, hint, required,
}: {
  label: string; id: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; error?: string; hint?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">
        {label}{required && <span className="text-[#e76f2e] ml-0.5">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea
          id={id} rows={3} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full border-2 rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none resize-none transition-colors ${error ? "border-red-400 focus:border-red-500" : "border-[#e2d5c3] focus:border-[#6ad7fb]"}`}
        />
      ) : (
        <input
          id={id} type={type} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full border-2 rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors ${error ? "border-red-400 focus:border-red-500" : "border-[#e2d5c3] focus:border-[#6ad7fb]"}`}
        />
      )}
      {hint && !error && <p className="text-xs text-[#b0a090] mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function SelectField({ label, id, options, value, onChange }: {
  label: string; id: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] outline-none bg-white transition-colors">
        <option value="">Sélectionner…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function AmenityCard({ label, emoji, checked, onToggle }: {
  label: string; emoji: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <button onClick={onToggle}
      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-150 ${checked ? "border-[#e76f2e] bg-[#fff5f0]" : "border-[#e2d5c3] hover:border-[#6ad7fb] bg-white"}`}>
      <span className="text-xl">{emoji}</span>
      <span className={`text-xs font-medium leading-tight ${checked ? "text-[#e76f2e]" : "text-[#3E2C23]"}`}>{label}</span>
      {checked && (
        <span className="w-4 h-4 rounded-full bg-[#e76f2e] flex items-center justify-center text-white">
          <Ico.Check />
        </span>
      )}
    </button>
  );
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const isAcceptedPhoto = (f: File) =>
  (f.type === "image/jpeg" || f.type === "image/png") && f.size <= MAX_PHOTO_BYTES;

/** Drop zone wired to a real (visually hidden) file input. */
function UploadZone({
  label,
  hint,
  files,
  onFiles,
  multiple = true,
}: {
  label: string;
  hint?: string;
  files?: File[];
  onFiles?: (f: File[]) => void;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter(isAcceptedPhoto);
    if (picked.length) onFiles?.(multiple ? picked : picked.slice(0, 1));
  };

  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
      className="border-2 border-dashed border-[#c8b9a5] hover:border-[#6ad7fb] rounded-xl p-8 text-center cursor-pointer transition-colors group"
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept="image/jpeg,image/png"
        onChange={e => take(e.target.files)}
      />
      <div className="w-12 h-12 rounded-full bg-[#E9F9FE] flex items-center justify-center mx-auto mb-3 text-[#7a6355] group-hover:text-[#002089] transition-colors">
        <Ico.Upload />
      </div>
      <p className="text-sm font-semibold text-[#3E2C23]">{label}</p>
      <p className="text-xs text-[#7a6355] mt-1">Glissez vos fichiers ici ou <span className="text-[#e76f2e] font-semibold">parcourir</span></p>
      {hint && <p className="text-xs text-[#b0a090] mt-1">{hint}</p>}
      {files && files.length > 0 && (
        <p className="text-xs font-semibold text-[#15803d] mt-2">
          {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const isAcceptedDoc = (f: File) =>
  ["application/pdf", "image/jpeg", "image/png"].includes(f.type) && f.size <= MAX_DOC_BYTES;

function DocUploadCard({ label, required, file, onFile }: {
  label: string; required?: boolean; file?: File; onFile?: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploaded = !!file;
  return (
    <div className="bg-white border border-[#e2d5c3] rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#3E2C23]">{label}{required && <span className="text-[#e76f2e] ml-1">*</span>}</p>
        <span className="mt-1 block">
          <Badge
            label={uploaded ? "Téléchargé" : "Non téléchargé"}
            variant={uploaded ? "success" : "secondary"}
            appearance="subtle"
            size="small"
            animate={false}
          />
        </span>
        {file && <p className="text-[11px] text-[#7a6355] mt-1 truncate">{file.name}</p>}
      </div>
      <button
        onClick={() => input.current?.click()}
        className="shrink-0 border-2 border-[#e2d5c3] hover:border-[#6ad7fb] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#7a6355] hover:text-[#002089] transition-colors flex items-center gap-1.5">
        <input
          ref={input}
          type="file"
          hidden
          accept="application/pdf,image/jpeg,image/png"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f && isAcceptedDoc(f)) onFile?.(f);
          }}
        />
        <Ico.Upload />{uploaded ? "Remplacer" : "Télécharger"}
      </button>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${value ? "bg-[#002089]" : "bg-[#e2d5c3]"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${value ? "left-6" : "left-0.5"}`}/>
    </button>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="font-display text-2xl font-bold text-[#3E2C23]">{title}</h2>
      {subtitle && <p className="text-[#7a6355] text-sm mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#E9F9FE] border border-[#e2d5c3] rounded-xl px-4 py-3 flex gap-3 items-start">
      <span className="text-lg shrink-0">ℹ️</span>
      <p className="text-xs text-[#7a6355] leading-relaxed">{children}</p>
    </div>
  );
}

/* ─── PARTNER TYPE DATA ─────────────────────────────── */
const PARTNER_TYPES = [
  { id: "hotel" as const, emoji: "🏨", label: "Hôtel", desc: "Listez votre hôtel, chambres, équipements, prix et disponibilités.", time: "~15 min", btn: "Inscrire un Hôtel" },
  { id: "guesthouse" as const, emoji: "🏡", label: "Maison d'hôtes", desc: "Partagez votre chambre d'hôtes, villa ou B&B avec des voyageurs.", time: "~12 min", btn: "Inscrire une Maison d'hôtes" },
  { id: "car" as const, emoji: "🚗", label: "Location de voiture", desc: "Ajoutez vos véhicules, tarifs, lieux de prise en charge et disponibilités.", time: "~10 min", btn: "Inscrire des Véhicules" },
  { id: "restaurant" as const, emoji: "🍽️", label: "Restaurant", desc: "Ajoutez votre restaurant, menus, tables, horaires et réservations.", time: "~15 min", btn: "Inscrire un Restaurant" },
  { id: "bus" as const, emoji: "🚌", label: "Transport", desc: "Publiez vos trajets, vos horaires et vos tarifs, et vendez vos billets en ligne.", time: "~12 min", btn: "Inscrire une Compagnie" },
];

/* ─── AMENITIES DATA ─────────────────────────────────── */
const AMENITIES_HOTEL = [
  { cat: "Général", items: [{ e: "📶", l: "Wi-Fi" }, { e: "❄️", l: "Climatisation" }, { e: "🛎️", l: "Réception 24h/24" }, { e: "🛗", l: "Ascenseur" }, { e: "⚡", l: "Générateur" }, { e: "☀️", l: "Énergie solaire" }, { e: "🧳", l: "Bagagerie" }, { e: "🤵", l: "Concierge" }] },
  { cat: "Parking", items: [{ e: "🅿️", l: "Parking gratuit" }, { e: "💳", l: "Parking payant" }, { e: "🚘", l: "Voiturier" }] },
  { cat: "Restauration", items: [{ e: "🍽️", l: "Restaurant" }, { e: "🍳", l: "Petit-déjeuner" }, { e: "🍸", l: "Bar" }, { e: "🛏️", l: "Room service" }] },
  { cat: "Bien-être", items: [{ e: "🏊", l: "Piscine" }, { e: "💪", l: "Salle de sport" }, { e: "🧖", l: "Spa" }, { e: "💆", l: "Massage" }] },
  { cat: "Business", items: [{ e: "👥", l: "Salle de réunion" }, { e: "🎤", l: "Salle de conférence" }, { e: "💼", l: "Centre d'affaires" }] },
];

const AMENITIES_GUESTHOUSE = [
  { cat: "Utilitaires", items: [{ e: "📶", l: "Wi-Fi" }, { e: "⚡", l: "Électricité 24h/24" }, { e: "🔥", l: "Eau chaude" }, { e: "❄️", l: "Climatisation" }, { e: "🌬️", l: "Ventilateurs" }, { e: "☀️", l: "Énergie solaire" }] },
  { cat: "Cuisine", items: [{ e: "🍳", l: "Cuisine partagée" }, { e: "🏠", l: "Cuisine privée" }, { e: "🧊", l: "Réfrigérateur" }, { e: "📦", l: "Micro-ondes" }] },
  { cat: "Extérieur", items: [{ e: "🌿", l: "Jardin" }, { e: "☀️", l: "Terrasse" }, { e: "🏊", l: "Piscine" }, { e: "🏖️", l: "Accès plage" }, { e: "🔥", l: "Barbecue" }] },
  { cat: "Services", items: [{ e: "🧹", l: "Ménage" }, { e: "👕", l: "Blanchisserie" }, { e: "✈️", l: "Navette aéroport" }, { e: "🍳", l: "Petit-déjeuner" }] },
  { cat: "Sécurité", items: [{ e: "👮", l: "Gardien" }, { e: "📹", l: "CCTV" }, { e: "🔒", l: "Propriété clôturée" }, { e: "🧯", l: "Extincteur" }] },
];

const AMENITIES_CAR = [
  { cat: "Confort", items: [{ e: "❄️", l: "Climatisation" }, { e: "🎵", l: "Bluetooth" }, { e: "🔌", l: "USB" }, { e: "🍎", l: "Apple CarPlay" }, { e: "🤖", l: "Android Auto" }, { e: "🗺️", l: "GPS" }] },
  { cat: "Sécurité", items: [{ e: "📷", l: "Caméra arrière" }, { e: "🅿️", l: "Capteurs parking" }, { e: "🚗", l: "4x4 / AWD" }] },
  { cat: "Options", items: [{ e: "💺", l: "Sièges cuir" }, { e: "🌅", l: "Toit ouvrant" }, { e: "👶", l: "Siège enfant" }] },
];

const AMENITIES_RESTAURANT = [
  { cat: "Espace", items: [{ e: "🪑", l: "Salle intérieure" }, { e: "🌿", l: "Terrasse" }, { e: "❄️", l: "Climatisation" }, { e: "📶", l: "Wi-Fi" }, { e: "🅿️", l: "Parking" }, { e: "🌊", l: "Vue sur l'eau" }, { e: "🏙️", l: "Rooftop" }] },
  { cat: "Services", items: [{ e: "🎵", l: "Musique live" }, { e: "🎧", l: "DJ" }, { e: "👨‍👩‍👧", l: "Famille bienvenue" }, { e: "🧒", l: "Menu enfants" }, { e: "♿", l: "Accès handicapé" }, { e: "🎉", l: "Espace privatif" }, { e: "🛵", l: "Livraison" }, { e: "🥡", l: "À emporter" }] },
];

/**
 * Les équipements d'un autocar.
 *
 * Les libellés ne sont pas libres : la base garde un équipement par son code, et
 * les deux côtés dérivent ce code du libellé par `amenitySlug`. « Télévision »
 * donne `television`, qui est la ligne semée dans `partner_amenities` avec
 * `'bus'` dans `applies_to`. Un libellé réécrit ici sans migration
 * correspondante serait refusé par le garde de type à la soumission.
 */
const AMENITIES_BUS = [
  { cat: "Confort", items: [{ e: "❄️", l: "Climatisation" }, { e: "💺", l: "Sièges inclinables" }, { e: "🚻", l: "Toilettes à bord" }, { e: "📺", l: "Télévision" }] },
  { cat: "À bord", items: [{ e: "📶", l: "Wi-Fi" }, { e: "🔌", l: "USB" }, { e: "⚡", l: "Prises électriques" }, { e: "💧", l: "Eau offerte" }, { e: "🥐", l: "Collation" }] },
  { cat: "Bagages & accès", items: [{ e: "🧳", l: "Soute à bagages" }, { e: "♿", l: "Accès handicapé" }] },
];

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const DEFAULT_HOURS: Record<string, { open: boolean; from: string; to: string }> = Object.fromEntries(
  DAYS_FR.map(d => [d, { open: true, from: "08:00", to: "22:00" }])
);

/**
 * Les villes proposées viennent de la base.
 *
 * `destinations` porte déjà les villes que PAPOT met en avant, et une liste
 * écrite en dur dans ce fichier aurait divergé du jour où quelqu'un ajoute une
 * destination depuis la console. Ce ne sont que des propositions : une
 * compagnie dessert des bourgs qui ne seront jamais une destination
 * touristique, donc l'étape accepte aussi une ville saisie à la main.
 *
 * Un échec de lecture ne bloque rien — la liste reste vide et la saisie libre
 * suffit.
 */
function useKnownCities(): string[] {
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    supabase
      .from("destinations")
      .select("city")
      .order("position")
      .then(({ data, error }) => {
        if (!live || error || !data) return;
        setCities([...new Set(data.map(d => d.city).filter(Boolean))]);
      });
    return () => { live = false; };
  }, []);
  return cities;
}

/* ─── STEP COMPONENTS ────────────────────────────────── */

function StepWelcome({ onStart }: { onStart: (type: PartnerType) => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-3xl mx-auto py-8">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#e76f2e] flex items-center justify-center shadow-md">
          <span className="font-display font-black text-white text-lg">P</span>
        </div>
        <span className="font-display font-black text-[#002089] text-3xl">PAPOT</span>
      </div>
      <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold text-[#3E2C23] leading-tight mb-4">
        Développez votre activité<br /><span className="text-[#e76f2e]">avec nous</span>
      </h1>
      <p className="text-[#7a6355] text-base max-w-lg mb-12 leading-relaxed">
        Publiez votre hébergement, véhicule ou restaurant et commencez à recevoir des réservations de la part de voyageurs et clients locaux.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
        {PARTNER_TYPES.map(pt => (
          <div key={pt.id} className="bg-white border-2 border-[#e2d5c3] hover:border-[#6ad7fb] rounded-2xl p-6 text-left transition-all duration-200 hover:shadow-lg hover:shadow-[rgba(0,32,137,0.08)] group">
            <div className="w-14 h-14 rounded-2xl bg-[#E9F9FE] flex items-center justify-center text-3xl mb-4">{pt.emoji}</div>
            <h3 className="font-display font-bold text-[#3E2C23] text-lg mb-2">{pt.label}</h3>
            <p className="text-sm text-[#7a6355] mb-5 leading-relaxed">{pt.desc}</p>
            <button
              onClick={() => onStart(pt.id)}
              className="w-full bg-[#e76f2e] hover:bg-[#d05e20] text-white font-bold py-2.5 rounded-xl text-sm transition-colors shadow-md shadow-[rgba(231,111,46,0.2)]"
            >
              {pt.btn}
            </button>
          </div>
        ))}
      </div>
      <p className="text-sm text-[#7a6355]">
        Déjà partenaire ? <a href="#" className="text-[#002089] font-semibold hover:underline transition-colors">Se connecter</a>
      </p>
    </div>
  );
}

function StepTypeSelection({ selected, onSelect }: { selected: PartnerType; onSelect: (t: PartnerType) => void }) {
  return (
    <div>
      <SectionTitle title="Quel type d'activité souhaitez-vous référencer ?" subtitle="Sélectionnez votre catégorie. Vous pouvez ajouter d'autres établissements après l'inscription." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PARTNER_TYPES.map(pt => {
          const isSelected = selected === pt.id;
          return (
            <button key={pt.id} onClick={() => onSelect(pt.id)}
              className={`relative flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-200 ${isSelected ? "border-[#e76f2e] bg-[#fff5f0] shadow-md shadow-[rgba(231,111,46,0.12)]" : "border-[#e2d5c3] bg-white hover:border-[#6ad7fb]"}`}>
              {isSelected && (
                <span className="absolute top-3 right-3 w-6 h-6 bg-[#e76f2e] rounded-full flex items-center justify-center text-white">
                  <Ico.Check />
                </span>
              )}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${isSelected ? "bg-[#e76f2e]/10" : "bg-[#E9F9FE]"}`}>{pt.emoji}</div>
              <div className="min-w-0">
                <p className="font-display font-bold text-[#3E2C23] text-lg leading-tight">{pt.label}</p>
                <p className="text-xs text-[#7a6355] mt-1 leading-relaxed">{pt.desc}</p>
                <p className="text-xs text-[#b0a090] mt-2">⏱ Durée estimée : {pt.time}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepAccount({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const [checks, setChecks] = useState({ terms: false, agreement: false, notifs: false });
  return (
    <div>
      <SectionTitle title="Compte & Coordonnées" subtitle="Créez votre compte partenaire. Ces informations servent à gérer votre accès ; elles ne sont pas affichées sur votre fiche." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label="Prénom" id="firstName" placeholder="Marie" value={data.firstName || ""} onChange={v => onChange("firstName", v)} required />
        <Field label="Nom" id="lastName" placeholder="Dupont" value={data.lastName || ""} onChange={v => onChange("lastName", v)} required />
        <Field label="Email professionnel" id="email" type="email" placeholder="marie@example.com" value={data.email || ""} onChange={v => onChange("email", v)} required />
        <Field label="Téléphone" id="phone" type="tel" placeholder="+509 3712 3456" value={data.phone || ""} onChange={v => onChange("phone", v)} required />
        <Field label="WhatsApp" id="whatsapp" type="tel" placeholder="+509 3712 3456" value={data.whatsapp || ""} onChange={v => onChange("whatsapp", v)} />
        <SelectField label="Langue préférée" id="language" options={["Français", "English", "Español", "Kreyòl ayisyen", "Português"]} value={data.language || ""} onChange={v => onChange("language", v)} />
        <Field label="Mot de passe" id="password" type="password" placeholder="••••••••" value={data.password || ""} onChange={v => onChange("password", v)} required hint="8 caractères minimum" />
        <Field label="Confirmer le mot de passe" id="confirmPassword" type="password" placeholder="••••••••" value={data.confirmPassword || ""} onChange={v => onChange("confirmPassword", v)} required />
      </div>
      <InfoBox>
        Vos coordonnées servent à gérer votre accès et ne sont pas affichées sur
        votre fiche publique. Le mot de passe part directement à Supabase Auth :
        PAPOT ne le stocke pas, et il n'est jamais écrit dans le brouillon de ce
        formulaire.
      </InfoBox>
      <div className="space-y-3 mt-5">
        {[
          { key: "terms" as const, label: "J'accepte les Conditions générales d'utilisation." },
          { key: "agreement" as const, label: "J'accepte le Contrat Partenaire PAPOT." },
          { key: "notifs" as const, label: "J'accepte de recevoir les notifications de réservation et de compte." },
        ].map(c => (
          <label key={c.key} className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={checks[c.key]} onChange={e => setChecks(p => ({ ...p, [c.key]: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-[#002089] shrink-0" />
            <span className="text-sm text-[#3E2C23]">{c.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StepBusinessProfile({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div>
      <SectionTitle title="Profil d'entreprise" subtitle="Ces informations seront affichées sur votre fiche publique." />
      <div className="flex flex-col items-center mb-8">
        <div className="w-24 h-24 rounded-2xl bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] flex flex-col items-center justify-center cursor-pointer hover:border-[#6ad7fb] transition-colors">
          <span className="text-2xl mb-1">📷</span>
          <span className="text-xs text-[#7a6355] font-medium">Logo</span>
        </div>
        <p className="text-xs text-[#b0a090] mt-2">PNG, JPG · Max 5 Mo</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label="Nom commercial" id="bizName" placeholder="Hôtel Belle Vue" value={data.bizName || ""} onChange={v => onChange("bizName", v)} required />
        <Field label="Raison sociale / Nom légal" id="legalName" placeholder="Belle Vue S.A." value={data.legalName || ""} onChange={v => onChange("legalName", v)} />
        <SelectField label="Type d'entreprise" id="bizType" options={["Entreprise individuelle", "SARL", "SA", "Association", "Autre"]} value={data.bizType || ""} onChange={v => onChange("bizType", v)} />
        <Field label="Année de création" id="yearEst" type="number" placeholder="2018" value={data.yearEst || ""} onChange={v => onChange("yearEst", v)} />
        <Field label="Téléphone professionnel" id="bizPhone" type="tel" placeholder="+509 2813 0000" value={data.bizPhone || ""} onChange={v => onChange("bizPhone", v)} required />
        <Field label="Email professionnel" id="bizEmail" type="email" placeholder="contact@hotel.com" value={data.bizEmail || ""} onChange={v => onChange("bizEmail", v)} required />
        <Field label="Site web" id="website" placeholder="https://www.monhotel.com" value={data.website || ""} onChange={v => onChange("website", v)} />
        <Field label="WhatsApp" id="bizWhatsapp" type="tel" placeholder="+509 3712 3456" value={data.bizWhatsapp || ""} onChange={v => onChange("bizWhatsapp", v)} />
      </div>
      <Field label="Description courte" id="shortDesc" type="textarea" placeholder="Une description en 1–2 phrases pour les résultats de recherche…" value={data.shortDesc || ""} onChange={v => onChange("shortDesc", v)} required />
      <div className="mt-4">
        <Field label="Description complète" id="fullDesc" type="textarea" placeholder="Décrivez votre établissement en détail — ambiance, histoire, points forts…" value={data.fullDesc || ""} onChange={v => onChange("fullDesc", v)} />
      </div>
      <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mt-6 mb-3">Réseaux sociaux (optionnel)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[["Instagram", "instagram"], ["Facebook", "facebook"], ["TikTok", "tiktok"]].map(([lbl, key]) => (
          <Field key={key} label={lbl} id={key} placeholder={`@votre${key}`} value={data[key] || ""} onChange={v => onChange(key, v)} />
        ))}
      </div>
    </div>
  );
}

function StepLocation({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  return (
    <div>
      <SectionTitle title="Localisation" subtitle="Aidez les clients à vous trouver facilement." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <SelectField label="Pays" id="country" options={["Haïti", "France", "Canada", "USA", "Belgique", "Suisse", "Martinique", "Guadeloupe"]} value={data.country || ""} onChange={v => onChange("country", v)} />
        <Field label="Département / État" id="state" placeholder="Ouest" value={data.state || ""} onChange={v => onChange("state", v)} />
        <Field label="Ville" id="city" placeholder="Port-au-Prince" value={data.city || ""} onChange={v => onChange("city", v)} required />
        <Field label="Commune" id="commune" placeholder="Pétion-Ville" value={data.commune || ""} onChange={v => onChange("commune", v)} />
        <Field label="Quartier" id="neighborhood" placeholder="Bois Verna" value={data.neighborhood || ""} onChange={v => onChange("neighborhood", v)} />
        <Field label="Code postal" id="postalCode" placeholder="HT6140" value={data.postalCode || ""} onChange={v => onChange("postalCode", v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Field label="Adresse ligne 1" id="addr1" placeholder="12, Rue des Capois" value={data.addr1 || ""} onChange={v => onChange("addr1", v)} required />
        <Field label="Adresse ligne 2" id="addr2" placeholder="Apt. 3B, Bâtiment C" value={data.addr2 || ""} onChange={v => onChange("addr2", v)} />
        <Field label="Repère à proximité" id="landmark" placeholder="En face de la pharmacie centrale" value={data.landmark || ""} onChange={v => onChange("landmark", v)} />
      </div>
      {/* There was a "Carte interactive" panel here — a green rectangle with a
          grid drawn over it, captioned "Cliquez pour placer une épingle" — and
          four buttons under it: Rechercher l'adresse, Utiliser ma position,
          Placer une épingle, Confirmer la position. None of the five did
          anything: no map library is loaded, and no table in the schema has a
          latitude or a longitude, so a pin had nowhere to be stored. It is
          removed rather than mocked, because a partner who "confirmed" a
          position would believe their location had been recorded. The address
          fields above and the access notes below are what PAPOT actually
          keeps, and what a traveller is actually shown. */}
      <Field label="Instructions d'accès / Notes de localisation" id="arrivalNotes" type="textarea"
        placeholder="Ex : Nous sommes situés deux rues après l'église principale, à côté de la pharmacie."
        value={data.arrivalNotes || ""} onChange={v => onChange("arrivalNotes", v)}
        hint="Aidez vos clients à vous trouver facilement." />
    </div>
  );
}

function StepDetails({ partnerType, data, onChange }: { partnerType: PartnerType; data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const [starRating, setStarRating] = useState(Number(data.stars || 0));
  const [bookingType, setBookingType] = useState(data.bookingType || "");
  const [ownerType, setOwnerType] = useState(data.ownerType || "");
  // Held in `formData`, not in local state: this step unmounts on every Back,
  // and anything kept only here is gone before the payload is built.
  const cuisines = unpackList(data.cuisines);
  const CUISINE_OPTIONS = ["Haïtienne", "Caribéenne", "Créole", "Française", "Italienne", "Américaine", "Mexicaine", "Chinoise", "Japonaise", "Africaine", "Fruits de mer", "Végétalienne", "Café", "Bar & Grill", "Internationale"];

  const busCities = unpackList(data.busCities);
  const knownCities = useKnownCities();
  const [newCity, setNewCity] = useState("");
  const addCity = () => {
    const v = newCity.trim();
    if (!v || busCities.includes(v)) { setNewCity(""); return; }
    onChange("busCities", packList([...busCities, v]));
    setNewCity("");
  };

  if (partnerType === "hotel") return (
    <div>
      <SectionTitle title="Informations sur l'hôtel" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label="Nom de l'hôtel" id="hotelName" placeholder="Hôtel Belle Vue" value={data.hotelName || ""} onChange={v => onChange("hotelName", v)} required />
        <SelectField label="Type d'hôtel" id="hotelType" options={["Hôtel", "Hôtel boutique", "Resort", "Motel", "Hôtel-appartement", "Éco-hôtel", "Bed & Breakfast", "Autre"]} value={data.hotelType || ""} onChange={v => onChange("hotelType", v)} />
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2">Classement étoiles</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => { setStarRating(n); onChange("stars", String(n)); }}>
                <Ico.Star filled={n <= starRating} />
              </button>
            ))}
          </div>
        </div>
        <Field label="Nombre de chambres" id="rooms" type="number" placeholder="45" value={data.rooms || ""} onChange={v => onChange("rooms", v)} required />
        <Field label="Nombre d'étages" id="floors" type="number" placeholder="6" value={data.floors || ""} onChange={v => onChange("floors", v)} />
        <Field label="Capacité maximale" id="capacity" type="number" placeholder="120" value={data.capacity || ""} onChange={v => onChange("capacity", v)} />
        <Field label="Année d'ouverture" id="yearOpen" type="number" placeholder="2010" value={data.yearOpen || ""} onChange={v => onChange("yearOpen", v)} />
      </div>
      <Field label="Description" id="desc" type="textarea" placeholder="Décrivez votre hôtel…" value={data.desc || ""} onChange={v => onChange("desc", v)} />
    </div>
  );

  if (partnerType === "guesthouse") return (
    <div>
      <SectionTitle title="Informations sur la maison d'hôtes" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Field label="Nom de la propriété" id="ghName" placeholder="Villa Les Palmiers" value={data.ghName || ""} onChange={v => onChange("ghName", v)} required />
        <SelectField label="Type de propriété" id="ghType" options={["Maison d'hôtes", "Villa", "Maison de vacances", "Bungalow", "Cottage", "Appartement", "Studio", "Bed & Breakfast"]} value={data.ghType || ""} onChange={v => onChange("ghType", v)} />
        <Field label="Nombre de chambres" id="ghRooms" type="number" placeholder="4" value={data.ghRooms || ""} onChange={v => onChange("ghRooms", v)} required />
        <Field label="Nombre d'étages" id="ghFloors" type="number" placeholder="2" value={data.ghFloors || ""} onChange={v => onChange("ghFloors", v)} />
        <Field label="Capacité maximale" id="ghCapacity" type="number" placeholder="12" value={data.ghCapacity || ""} onChange={v => onChange("ghCapacity", v)} />
      </div>
      <p className="text-sm font-semibold text-[#3E2C23] mb-3">Comment les clients réservent-ils votre propriété ?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[["entire", "🏠", "La propriété entière"], ["rooms", "🛏️", "Chambres individuelles"], ["both", "✅", "Les deux"]].map(([val, emoji, lbl]) => (
          <button key={val} onClick={() => { setBookingType(val); onChange("bookingType", val); }}
            className={`p-4 rounded-xl border-2 text-center transition-all ${bookingType === val ? "border-[#e76f2e] bg-[#fff5f0]" : "border-[#e2d5c3] hover:border-[#6ad7fb]"}`}>
            <span className="text-2xl block mb-1">{emoji}</span>
            <span className={`text-sm font-semibold ${bookingType === val ? "text-[#e76f2e]" : "text-[#3E2C23]"}`}>{lbl}</span>
          </button>
        ))}
      </div>
      <Field label="Description" id="ghDesc" type="textarea" placeholder="Décrivez votre maison d'hôtes…" value={data.ghDesc || ""} onChange={v => onChange("ghDesc", v)} />
    </div>
  );

  if (partnerType === "car") return (
    <div>
      <SectionTitle title="Informations sur la location de voitures" />
      <p className="text-sm font-semibold text-[#3E2C23] mb-3">Vous vous inscrivez en tant que :</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {[["individual", "👤", "Propriétaire individuel", "Vous louez votre véhicule personnel"], ["company", "🏢", "Société de location", "Vous gérez une flotte de véhicules"]].map(([val, emoji, lbl, sub]) => (
          <button key={val} onClick={() => { setOwnerType(val); onChange("ownerType", val); }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${ownerType === val ? "border-[#e76f2e] bg-[#fff5f0]" : "border-[#e2d5c3] hover:border-[#6ad7fb]"}`}>
            <span className="text-2xl block mb-2">{emoji}</span>
            <p className={`text-sm font-bold ${ownerType === val ? "text-[#e76f2e]" : "text-[#3E2C23]"}`}>{lbl}</p>
            <p className="text-xs text-[#7a6355] mt-0.5">{sub}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nom de l'agence / société" id="carCompany" placeholder="AutoSun Rentals" value={data.carCompany || ""} onChange={v => onChange("carCompany", v)} required />
        <Field label="Nombre de véhicules" id="fleetSize" type="number" placeholder="8" value={data.fleetSize || ""} onChange={v => onChange("fleetSize", v)} />
        <Field label="Email de contact" id="carEmail" type="email" placeholder="info@autosun.com" value={data.carEmail || ""} onChange={v => onChange("carEmail", v)} />
        <Field label="WhatsApp / Téléphone" id="carPhone" type="tel" placeholder="+509 3712 3456" value={data.carPhone || ""} onChange={v => onChange("carPhone", v)} />
      </div>
      <div className="mt-4">
        <Field label="Description" id="carDesc" type="textarea" placeholder="Types de véhicules, zones de service…" value={data.carDesc || ""} onChange={v => onChange("carDesc", v)} />
      </div>
    </div>
  );

  if (partnerType === "restaurant") return (
    <div>
      <SectionTitle title="Informations sur le restaurant" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label="Nom du restaurant" id="restName" placeholder="Le Belvédère" value={data.restName || ""} onChange={v => onChange("restName", v)} required />
        <SelectField label="Type de restaurant" id="restType" options={["Restaurant", "Bistrot", "Brasserie", "Café", "Bar & Grill", "Gastronomique", "Street food", "Pizzeria", "Steakhouse", "Buffet"]} value={data.restType || ""} onChange={v => onChange("restType", v)} />
        <SelectField label="Fourchette de prix" id="priceRange" options={["$ (Économique)", "$$ (Modéré)", "$$$ (Haut de gamme)", "$$$$ (Luxe)"]} value={data.priceRange || ""} onChange={v => onChange("priceRange", v)} />
        <Field label="Année d'ouverture" id="restYear" type="number" placeholder="2019" value={data.restYear || ""} onChange={v => onChange("restYear", v)} />
        <Field label="Capacité (couverts)" id="restCapacity" type="number" placeholder="80" value={data.restCapacity || ""} onChange={v => onChange("restCapacity", v)} />
        <Field label="WhatsApp / Téléphone" id="restPhone" type="tel" placeholder="+509 3712 3456" value={data.restPhone || ""} onChange={v => onChange("restPhone", v)} />
      </div>
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2">Cuisine(s)</p>
        <div className="flex flex-wrap gap-2">
          {CUISINE_OPTIONS.map(c => (
            <button key={c} onClick={() => onChange("cuisines", packList(cuisines.includes(c) ? cuisines.filter(x => x !== c) : [...cuisines, c]))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${cuisines.includes(c) ? "border-[#e76f2e] bg-[#fff5f0] text-[#e76f2e]" : "border-[#e2d5c3] text-[#7a6355] hover:border-[#6ad7fb]"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <Field label="Description" id="restDesc" type="textarea" placeholder="Décrivez l'ambiance et les spécialités de votre restaurant…" value={data.restDesc || ""} onChange={v => onChange("restDesc", v)} />
    </div>
  );

  if (partnerType === "bus") return (
    <div>
      <SectionTitle title="Informations sur la compagnie de transport" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label="Nom de la compagnie" id="busCompany" placeholder="Transport Nasyonal" value={data.busCompany || ""} onChange={v => onChange("busCompany", v)} required />
        <SelectField label="Type de service" id="busType" options={["Transport interurbain", "Navette aéroport", "Transport touristique", "Transport urbain", "Service express"]} value={data.busType || ""} onChange={v => onChange("busType", v)} />
        <Field label="Email de contact" id="busEmail" type="email" placeholder="info@transport.ht" value={data.busEmail || ""} onChange={v => onChange("busEmail", v)} />
        <Field label="WhatsApp / Téléphone" id="busPhone" type="tel" placeholder="+509 3712 3456" value={data.busPhone || ""} onChange={v => onChange("busPhone", v)} />
      </div>
      <div className="mb-4">
        <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2">Villes desservies</p>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...knownCities, ...busCities])].map(c => (
            <button key={c} type="button"
              onClick={() => onChange("busCities", packList(busCities.includes(c) ? busCities.filter(x => x !== c) : [...busCities, c]))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${busCities.includes(c) ? "border-[#e76f2e] bg-[#fff5f0] text-[#e76f2e]" : "border-[#e2d5c3] text-[#7a6355] hover:border-[#6ad7fb]"}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            value={newCity}
            onChange={e => setNewCity(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
            placeholder="Une autre ville — ex. Ouanaminthe"
            className="flex-1 border border-[#e2d5c3] rounded-xl px-3 py-2 text-sm text-[#3E2C23] placeholder:text-[#b0a090] focus:border-[#6ad7fb] outline-none"
          />
          <button type="button" onClick={addCity} disabled={!newCity.trim()}
            className="border-2 border-[#e2d5c3] px-4 py-2 rounded-xl text-sm text-[#7a6355] font-semibold disabled:opacity-40">
            Ajouter
          </button>
        </div>
        <p className="text-xs text-[#b0a090] mt-2">
          Chaque ville cochée devient une gare dans votre tableau de bord, que vous
          complétez ensuite avec son adresse et ses horaires. Les propositions
          viennent des destinations déjà sur PAPOT ; ajoutez librement une ville
          qui n'y figure pas.
        </p>
      </div>
      <Field label="Description" id="busDesc" type="textarea" placeholder="Décrivez votre service — confort des autocars, ponctualité, zones desservies…" value={data.busDesc || ""} onChange={v => onChange("busDesc", v)} />
    </div>
  );

  return null;
}

function StepAmenities({ partnerType, amenities, onToggle }: { partnerType: PartnerType; amenities: string[]; onToggle: (a: string) => void }) {
  const dataset =
    partnerType === "hotel" ? AMENITIES_HOTEL
    : partnerType === "guesthouse" ? AMENITIES_GUESTHOUSE
    : partnerType === "car" ? AMENITIES_CAR
    : partnerType === "bus" ? AMENITIES_BUS
    : AMENITIES_RESTAURANT;
  return (
    <div>
      <SectionTitle title="Équipements & Services" subtitle="Sélectionnez tous les équipements disponibles dans votre établissement." />
      <div className="space-y-8">
        {dataset.map(cat => (
          <div key={cat.cat}>
            <p className="text-xs font-bold text-[#002089] uppercase tracking-widest mb-3">{cat.cat}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {cat.items.map(item => (
                <AmenityCard key={item.l} label={item.l} emoji={item.e} checked={amenities.includes(item.l)} onToggle={() => onToggle(item.l)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#b0a090] mt-6">{amenities.length} équipement{amenities.length !== 1 ? "s" : ""} sélectionné{amenities.length !== 1 ? "s" : ""}</p>
    </div>
  );
}

function StepInventory({ partnerType, rooms, setRooms, vehicles, setVehicles, coaches, setCoaches, routes, setRoutes, data, onChange }: {
  partnerType: PartnerType;
  rooms: RoomItem[]; setRooms: (r: RoomItem[]) => void;
  vehicles: VehicleItem[]; setVehicles: (v: VehicleItem[]) => void;
  coaches: CoachItem[]; setCoaches: (c: CoachItem[]) => void;
  routes: RouteItem[]; setRoutes: (r: RouteItem[]) => void;
  data: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newRoom, setNewRoom] = useState<Partial<RoomItem>>({});
  // null = the form is adding; an id = it is editing that room. The pencil
  // beside each room had no handler at all, so a typo in a price could only
  // be corrected by deleting the room and retyping all six fields.
  const [editingRoom, setEditingRoom] = useState<number | null>(null);
  const [newVehicle, setNewVehicle] = useState<Partial<VehicleItem>>({});
  const [addingCoach, setAddingCoach] = useState(false);
  const [editingCoach, setEditingCoach] = useState<number | null>(null);
  const [newCoach, setNewCoach] = useState<Partial<CoachItem>>({});
  const [addingRoute, setAddingRoute] = useState(false);
  const [editingRoute, setEditingRoute] = useState<number | null>(null);
  const [newRoute, setNewRoute] = useState<Partial<RouteItem>>({});

  if (partnerType === "hotel" || partnerType === "guesthouse") return (
    <div>
      <SectionTitle title={partnerType === "hotel" ? "Types de chambres" : "Hébergements"} subtitle="Ajoutez vos chambres ou espaces disponibles à la réservation." />
      {rooms.length === 0 && !addingRoom && (
        <div className="bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] rounded-2xl p-12 text-center mb-6">
          <span className="text-4xl block mb-3">🛏️</span>
          <p className="font-display font-bold text-[#3E2C23] text-lg mb-2">Ajoutez vos chambres</p>
          <p className="text-[#7a6355] text-sm mb-6">Définissez les types de chambres et leurs tarifs.</p>
          <button onClick={() => setAddingRoom(true)}
            className="bg-[#e76f2e] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#d05e20] transition-colors inline-flex items-center gap-2">
            <Ico.Plus /> Ajouter un type de chambre
          </button>
        </div>
      )}
      {rooms.map(r => (
        <div key={r.id} className="bg-white border border-[#e2d5c3] rounded-xl p-4 mb-3 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#E9F9FE] flex items-center justify-center text-2xl shrink-0">🛏️</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#3E2C23]">{r.name}</p>
            <p className="text-xs text-[#7a6355]">{r.type} · {r.capacity} pers. · {r.beds} lit(s) · {r.units} unité(s)</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-bold text-[#3E2C23]">{r.price} $<span className="text-xs font-normal text-[#7a6355]">/nuit</span></p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button" title="Modifier cette chambre"
              onClick={() => { setNewRoom(r); setEditingRoom(r.id); setAddingRoom(true); }}
              className="p-2 rounded-lg hover:bg-[#E9F9FE] text-[#7a6355] transition-colors"><Ico.Edit /></button>
            <button onClick={() => setRooms(rooms.filter(x => x.id !== r.id))} className="p-2 rounded-lg hover:bg-red-50 text-[#7a6355] hover:text-red-500 transition-colors"><Ico.Trash /></button>
          </div>
        </div>
      ))}
      {addingRoom && (
        <div className="bg-white border-2 border-[#6ad7fb] rounded-xl p-5 mb-4">
          <p className="font-display font-bold text-[#3E2C23] mb-4">
            {editingRoom === null ? "Nouveau type de chambre" : "Modifier le type de chambre"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Field label="Nom" id="rName" placeholder="Suite Deluxe" value={newRoom.name || ""} onChange={v => setNewRoom(p => ({ ...p, name: v }))} />
            <SelectField label="Type" id="rType" options={["Chambre simple", "Chambre double", "Suite", "Suite familiale", "Studio", "Chambre supérieure", "Dortoir"]} value={newRoom.type || ""} onChange={v => setNewRoom(p => ({ ...p, type: v }))} />
            <Field label="Capacité (pers.)" id="rCap" type="number" placeholder="2" value={newRoom.capacity || ""} onChange={v => setNewRoom(p => ({ ...p, capacity: v }))} />
            <Field label="Nombre de lits" id="rBeds" placeholder="1 King" value={newRoom.beds || ""} onChange={v => setNewRoom(p => ({ ...p, beds: v }))} />
            <Field label="Prix / nuit ($ US)" id="rPrice" type="number" placeholder="120" value={newRoom.price || ""} onChange={v => setNewRoom(p => ({ ...p, price: v }))} />
            <Field label="Unités disponibles" id="rUnits" type="number" placeholder="5" value={newRoom.units || ""} onChange={v => setNewRoom(p => ({ ...p, units: v }))} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAddingRoom(false); setNewRoom({}); setEditingRoom(null); }}
              className="border-2 border-[#e2d5c3] px-4 py-2 rounded-xl text-sm text-[#7a6355] font-semibold">Annuler</button>
            <button type="button" disabled={!newRoom.name}
              onClick={() => {
                if (!newRoom.name) return;
                const row: RoomItem = {
                  id: editingRoom ?? Date.now(),
                  name: newRoom.name, type: newRoom.type || "", capacity: newRoom.capacity || "",
                  beds: newRoom.beds || "", price: newRoom.price || "", units: newRoom.units || "",
                };
                setRooms(editingRoom === null ? [...rooms, row] : rooms.map(x => (x.id === editingRoom ? row : x)));
                setNewRoom({}); setEditingRoom(null); setAddingRoom(false);
              }}
              className="bg-[#002089] text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-40">
              {editingRoom === null ? "Ajouter" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
      {rooms.length > 0 && !addingRoom && (
        <button onClick={() => setAddingRoom(true)} className="border-2 border-dashed border-[#c8b9a5] hover:border-[#002089] w-full py-3 rounded-xl text-sm text-[#7a6355] hover:text-[#002089] font-semibold transition-colors flex items-center justify-center gap-2">
          <Ico.Plus /> Ajouter un type de chambre
        </button>
      )}
    </div>
  );

  if (partnerType === "car") return (
    <div>
      <SectionTitle title="Flotte de véhicules" subtitle="Ajoutez vos véhicules disponibles à la location." />
      {vehicles.length === 0 && !addingVehicle && (
        <div className="bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] rounded-2xl p-12 text-center mb-6">
          <span className="text-4xl block mb-3">🚗</span>
          <p className="font-display font-bold text-[#3E2C23] text-lg mb-2">Ajoutez votre premier véhicule</p>
          <button onClick={() => setAddingVehicle(true)}
            className="bg-[#e76f2e] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#d05e20] transition-colors inline-flex items-center gap-2 mt-4">
            <Ico.Plus /> Ajouter un véhicule
          </button>
        </div>
      )}
      {vehicles.map(v => (
        <div key={v.id} className="bg-white border border-[#e2d5c3] rounded-xl p-4 mb-3 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#E9F9FE] flex items-center justify-center text-2xl shrink-0">🚗</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#3E2C23]">{v.year} {v.make} {v.model}</p>
            <p className="text-xs text-[#7a6355]">{v.type} · {v.seats} places · {v.transmission}</p>
          </div>
          <button onClick={() => setVehicles(vehicles.filter(x => x.id !== v.id))} className="p-2 rounded-lg hover:bg-red-50 text-[#7a6355] hover:text-red-500 transition-colors"><Ico.Trash /></button>
        </div>
      ))}
      {addingVehicle && (
        <div className="bg-white border-2 border-[#6ad7fb] rounded-xl p-5 mb-4">
          <p className="font-display font-bold text-[#3E2C23] mb-4">Nouveau véhicule</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <Field label="Marque" id="vMake" placeholder="Toyota" value={newVehicle.make || ""} onChange={v => setNewVehicle(p => ({ ...p, make: v }))} />
            <Field label="Modèle" id="vModel" placeholder="Corolla" value={newVehicle.model || ""} onChange={v => setNewVehicle(p => ({ ...p, model: v }))} />
            <Field label="Année" id="vYear" type="number" placeholder="2022" value={newVehicle.year || ""} onChange={v => setNewVehicle(p => ({ ...p, year: v }))} />
            <SelectField label="Type" id="vType" options={["Économique", "Compacte", "Berline", "SUV", "Luxe", "Cabriolet", "Pick-up", "Van", "Monospace", "Jeep", "Électrique", "Hybride"]} value={newVehicle.type || ""} onChange={v => setNewVehicle(p => ({ ...p, type: v }))} />
            <Field label="Nombre de places" id="vSeats" type="number" placeholder="5" value={newVehicle.seats || ""} onChange={v => setNewVehicle(p => ({ ...p, seats: v }))} />
            <SelectField label="Transmission" id="vTrans" options={["Automatique", "Manuelle"]} value={newVehicle.transmission || ""} onChange={v => setNewVehicle(p => ({ ...p, transmission: v }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAddingVehicle(false)} className="border-2 border-[#e2d5c3] px-4 py-2 rounded-xl text-sm text-[#7a6355] font-semibold">Annuler</button>
            <button onClick={() => { if (newVehicle.make) { setVehicles([...vehicles, { id: Date.now(), make: newVehicle.make!, model: newVehicle.model || "", year: newVehicle.year || "", type: newVehicle.type || "", seats: newVehicle.seats || "", transmission: newVehicle.transmission || "" }]); setNewVehicle({}); setAddingVehicle(false); } }}
              className="bg-[#002089] text-white px-6 py-2 rounded-xl text-sm font-bold">Ajouter</button>
          </div>
        </div>
      )}
      {vehicles.length > 0 && !addingVehicle && (
        <button onClick={() => setAddingVehicle(true)} className="border-2 border-dashed border-[#c8b9a5] hover:border-[#002089] w-full py-3 rounded-xl text-sm text-[#7a6355] hover:text-[#002089] font-semibold transition-colors flex items-center justify-center gap-2">
          <Ico.Plus /> Ajouter un véhicule
        </button>
      )}
    </div>
  );

  if (partnerType === "restaurant") return (
    <div>
      <SectionTitle title="Menu et salle"
        subtitle="Ces deux réglages se font depuis votre tableau de bord, une fois le dossier approuvé." />
      {/* What stood here: two cards, "Importer un menu existant" and "Créer un
          menu en ligne". The first opened an UploadZone with no `onFiles`, so
          the chosen file was read and discarded. The second showed one set of
          fields — catégorie, plat, description, prix — with no button to add
          the dish and no second row; they wrote to `formData.menuCat` and
          friends, which `buildPayload` does not read, so they never left the
          browser. A restaurateur could type their whole menu into it and lose
          all of it at submit.

          The real menu builder already exists at /partenaire/menu, backed by
          `menu_items`, with portions, options and formules beside it. Pointing
          at it is the honest version of this step. */}
      <div className="bg-[#E9F9FE] border border-[#e2d5c3] rounded-xl p-4 mb-4">
        <p className="font-semibold text-[#3E2C23] text-sm">Votre menu</p>
        <p className="text-xs text-[#7a6355] mt-1 leading-relaxed">
          Plats, catégories, portions et formules s'ajoutent dans « Menu » sur votre
          tableau de bord. Vous gardez la main dessus en permanence : un prix change,
          vous le changez, et la fiche suit le jour même. Rien à préparer ici.
        </p>
      </div>
      <div>
        {/* "Zones & Tables" used to live here: four hardcoded cards — Salle
            principale, Terrasse, Jardin, VIP — each claiming "4 tables", and a
            "+ Ajouter une zone" button with no handler. None of it was the
            partner's own data, the wizard collects no zone, and
            `build_partner_listings` creates no `restaurant_areas` row, so
            whatever was shown here could never reach the database. The real
            screen exists and is reached after approval. */}
        <div className="bg-[#E9F9FE] border border-[#e2d5c3] rounded-xl p-4">
          <p className="font-semibold text-[#3E2C23] text-sm">Salles et tables</p>
          <p className="text-xs text-[#7a6355] mt-1 leading-relaxed">
            Vos salles, terrasses et tables se configurent depuis votre tableau de bord,
            dans « Salles et tables », dès que votre dossier est approuvé. Le plan de
            salle sert à placer chaque réservation, il se règle donc une fois votre
            établissement en ligne.
          </p>
        </div>
      </div>
    </div>
  );

  if (partnerType === "bus") {
    const saveCoach = () => {
      if (!newCoach.label || !newCoach.seats) return;
      const row: CoachItem = {
        id: editingCoach ?? Date.now(),
        label: newCoach.label, seats: newCoach.seats,
        pattern: newCoach.pattern || "2+2", coachType: newCoach.coachType || "",
        make: newCoach.make || "", model: newCoach.model || "",
        year: newCoach.year || "", plate: newCoach.plate || "",
      };
      setCoaches(editingCoach === null ? [...coaches, row] : coaches.map(x => (x.id === editingCoach ? row : x)));
      setNewCoach({}); setEditingCoach(null); setAddingCoach(false);
    };

    const saveRoute = () => {
      if (!newRoute.origin || !newRoute.destination || !newRoute.fare) return;
      const row: RouteItem = {
        id: editingRoute ?? Date.now(),
        origin: newRoute.origin, destination: newRoute.destination,
        stops: newRoute.stops || "",
        durationH: newRoute.durationH || "", durationM: newRoute.durationM || "",
        fare: newRoute.fare, departures: newRoute.departures || "",
        weekdays: newRoute.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      };
      setRoutes(editingRoute === null ? [...routes, row] : routes.map(x => (x.id === editingRoute ? row : x)));
      setNewRoute({}); setEditingRoute(null); setAddingRoute(false);
    };

    const days = newRoute.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    const toggleDay = (d: number) =>
      setNewRoute(p => {
        const cur = p.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
        return { ...p, weekdays: cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort() };
      });

    return (
      <div>
        <SectionTitle title="Flotte & Trajets"
          subtitle="Vos autocars et les trajets que vous souhaitez vendre. Vous pourrez en ajouter d'autres depuis votre tableau de bord." />

        {/* ── La flotte ──────────────────────────────────── */}
        <p className="text-xs font-bold text-[#002089] uppercase tracking-widest mb-3">Autocars</p>
        {coaches.length === 0 && !addingCoach && (
          <div className="bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] rounded-2xl p-8 text-center mb-6">
            <span className="text-4xl block mb-3">🚌</span>
            <p className="font-display font-bold text-[#3E2C23] text-lg mb-2">Ajoutez votre premier autocar</p>
            <p className="text-[#7a6355] text-sm mb-5">
              Le nombre de places devient la capacité de chaque départ : c'est le seul
              chiffre que nous ne pouvons pas deviner.
            </p>
            <button type="button" onClick={() => setAddingCoach(true)}
              className="bg-[#e76f2e] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#d05e20] transition-colors inline-flex items-center gap-2">
              <Ico.Plus /> Ajouter un autocar
            </button>
          </div>
        )}
        {coaches.map(c => (
          <div key={c.id} className="bg-white border border-[#e2d5c3] rounded-xl p-4 mb-3 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#E9F9FE] flex items-center justify-center text-2xl shrink-0">🚌</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#3E2C23] truncate">{c.label}</p>
              <p className="text-xs text-[#7a6355]">
                {[c.seats && `${c.seats} places`, c.pattern, c.coachType,
                  [c.make, c.model, c.year].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" title="Modifier cet autocar"
                onClick={() => { setNewCoach(c); setEditingCoach(c.id); setAddingCoach(true); }}
                className="p-2 rounded-lg hover:bg-[#E9F9FE] text-[#7a6355] transition-colors"><Ico.Edit /></button>
              <button type="button" onClick={() => setCoaches(coaches.filter(x => x.id !== c.id))}
                className="p-2 rounded-lg hover:bg-red-50 text-[#7a6355] hover:text-red-500 transition-colors"><Ico.Trash /></button>
            </div>
          </div>
        ))}
        {addingCoach && (
          <div className="bg-white border-2 border-[#6ad7fb] rounded-xl p-5 mb-4">
            <p className="font-display font-bold text-[#3E2C23] mb-4">
              {editingCoach === null ? "Nouvel autocar" : "Modifier l'autocar"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Field label="Nom / numéro de parc" id="cLabel" placeholder="Autocar 52 places" value={newCoach.label || ""} onChange={v => setNewCoach(p => ({ ...p, label: v }))} required />
              <Field label="Nombre de places" id="cSeats" type="number" placeholder="52" value={newCoach.seats || ""} onChange={v => setNewCoach(p => ({ ...p, seats: v }))} required />
              <SelectField label="Disposition des sièges" id="cPattern" options={["2+2", "2+1", "1+1", "custom"]} value={newCoach.pattern || "2+2"} onChange={v => setNewCoach(p => ({ ...p, pattern: v }))} />
              <SelectField label="Type d'autocar" id="cType" options={["Autocar climatisé", "Autocar standard", "Minibus", "Bus VIP", "Navette"]} value={newCoach.coachType || ""} onChange={v => setNewCoach(p => ({ ...p, coachType: v }))} />
              <Field label="Marque" id="cMake" placeholder="Mercedes" value={newCoach.make || ""} onChange={v => setNewCoach(p => ({ ...p, make: v }))} />
              <Field label="Modèle" id="cModel" placeholder="Tourismo" value={newCoach.model || ""} onChange={v => setNewCoach(p => ({ ...p, model: v }))} />
              <Field label="Année" id="cYear" type="number" placeholder="2019" value={newCoach.year || ""} onChange={v => setNewCoach(p => ({ ...p, year: v }))} />
              <Field label="Plaque" id="cPlate" placeholder="AA-12345" value={newCoach.plate || ""} onChange={v => setNewCoach(p => ({ ...p, plate: v }))} hint="Visible uniquement par votre équipe et PAPOT." />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAddingCoach(false); setNewCoach({}); setEditingCoach(null); }}
                className="border-2 border-[#e2d5c3] px-4 py-2 rounded-xl text-sm text-[#7a6355] font-semibold">Annuler</button>
              <button type="button" disabled={!newCoach.label || !newCoach.seats} onClick={saveCoach}
                className="bg-[#002089] text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-40">
                {editingCoach === null ? "Ajouter" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
        {coaches.length > 0 && !addingCoach && (
          <button type="button" onClick={() => setAddingCoach(true)}
            className="border-2 border-dashed border-[#c8b9a5] hover:border-[#002089] w-full py-3 rounded-xl text-sm text-[#7a6355] hover:text-[#002089] font-semibold transition-colors flex items-center justify-center gap-2 mb-8">
            <Ico.Plus /> Ajouter un autocar
          </button>
        )}

        {/* ── Les trajets ────────────────────────────────── */}
        <p className="text-xs font-bold text-[#002089] uppercase tracking-widest mb-3 mt-8">Trajets</p>
        {routes.length === 0 && !addingRoute && (
          <div className="bg-[#E9F9FE] border-2 border-dashed border-[#c8b9a5] rounded-2xl p-8 text-center mb-6">
            <span className="text-4xl block mb-3">🛣️</span>
            <p className="font-display font-bold text-[#3E2C23] text-lg mb-2">Ajoutez votre premier trajet</p>
            <p className="text-[#7a6355] text-sm mb-5">
              Chaque trajet devient une annonce, avec son tarif et ses horaires.
            </p>
            <button type="button" onClick={() => setAddingRoute(true)}
              className="bg-[#e76f2e] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#d05e20] transition-colors inline-flex items-center gap-2">
              <Ico.Plus /> Ajouter un trajet
            </button>
          </div>
        )}
        {routes.map(r => (
          <div key={r.id} className="bg-white border border-[#e2d5c3] rounded-xl p-4 mb-3 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[#E9F9FE] flex items-center justify-center text-2xl shrink-0">🛣️</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#3E2C23] truncate">{r.origin} → {r.destination}</p>
              <p className="text-xs text-[#7a6355]">
                {[
                  // "0" is a truthy string: a six-hour trip must read "6 h",
                  // not "6 h 0".
                  (Number(r.durationH) > 0 || Number(r.durationM) > 0) &&
                    `${Number(r.durationH) || 0} h${Number(r.durationM) > 0 ? ` ${r.durationM}` : ""}`,
                  r.stops && `via ${r.stops}`,
                  r.departures || "horaires à définir",
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-[#3E2C23]">{r.fare} $<span className="text-xs font-normal text-[#7a6355]">/place</span></p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" title="Modifier ce trajet"
                onClick={() => { setNewRoute(r); setEditingRoute(r.id); setAddingRoute(true); }}
                className="p-2 rounded-lg hover:bg-[#E9F9FE] text-[#7a6355] transition-colors"><Ico.Edit /></button>
              <button type="button" onClick={() => setRoutes(routes.filter(x => x.id !== r.id))}
                className="p-2 rounded-lg hover:bg-red-50 text-[#7a6355] hover:text-red-500 transition-colors"><Ico.Trash /></button>
            </div>
          </div>
        ))}
        {addingRoute && (
          <div className="bg-white border-2 border-[#6ad7fb] rounded-xl p-5 mb-4">
            <p className="font-display font-bold text-[#3E2C23] mb-4">
              {editingRoute === null ? "Nouveau trajet" : "Modifier le trajet"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Ville de départ" id="rOrigin" placeholder="Port-au-Prince" value={newRoute.origin || ""} onChange={v => setNewRoute(p => ({ ...p, origin: v }))} required />
              <Field label="Ville d'arrivée" id="rDest" placeholder="Cap-Haïtien" value={newRoute.destination || ""} onChange={v => setNewRoute(p => ({ ...p, destination: v }))} required />
              <div className="sm:col-span-2">
                <Field label="Arrêts intermédiaires" id="rStops" placeholder="Saint-Marc, Gonaïves" value={newRoute.stops || ""} onChange={v => setNewRoute(p => ({ ...p, stops: v }))}
                  hint="Séparés par des virgules. Laissez vide pour un trajet direct." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Durée — heures" id="rDurH" type="number" placeholder="6" value={newRoute.durationH || ""} onChange={v => setNewRoute(p => ({ ...p, durationH: v }))} required />
                <Field label="Minutes" id="rDurM" type="number" placeholder="0" value={newRoute.durationM || ""} onChange={v => setNewRoute(p => ({ ...p, durationM: v }))} />
              </div>
              <Field label="Tarif par place ($ US)" id="rFare" type="number" placeholder="19" value={newRoute.fare || ""} onChange={v => setNewRoute(p => ({ ...p, fare: v }))} required
                hint="Le tarif affiché aux voyageurs, en dollars. L'équivalent en gourdes suit le taux du jour." />
              <div className="sm:col-span-2">
                <Field label="Heures de départ" id="rDeps" placeholder="06:00, 14:00" value={newRoute.departures || ""} onChange={v => setNewRoute(p => ({ ...p, departures: v }))}
                  hint="Format 24 h, séparées par des virgules. Vide = vous construirez l'horaire dans votre tableau de bord." />
              </div>
            </div>
            <p className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide mb-2">Jours de service</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DAYS_FR.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)}
                  className={`w-11 h-11 rounded-xl text-xs font-bold border-2 transition-colors ${days.includes(i) ? "border-[#e76f2e] bg-[#fff5f0] text-[#e76f2e]" : "border-[#e2d5c3] text-[#7a6355] hover:border-[#6ad7fb]"}`}>
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAddingRoute(false); setNewRoute({}); setEditingRoute(null); }}
                className="border-2 border-[#e2d5c3] px-4 py-2 rounded-xl text-sm text-[#7a6355] font-semibold">Annuler</button>
              <button type="button"
                disabled={!newRoute.origin || !newRoute.destination || !newRoute.fare || !newRoute.durationH}
                onClick={saveRoute}
                className="bg-[#002089] text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-40">
                {editingRoute === null ? "Ajouter" : "Enregistrer"}
              </button>
            </div>
          </div>
        )}
        {routes.length > 0 && !addingRoute && (
          <button type="button" onClick={() => setAddingRoute(true)}
            className="border-2 border-dashed border-[#c8b9a5] hover:border-[#002089] w-full py-3 rounded-xl text-sm text-[#7a6355] hover:text-[#002089] font-semibold transition-colors flex items-center justify-center gap-2">
            <Ico.Plus /> Ajouter un trajet
          </button>
        )}

        <div className="mt-6">
          <InfoBox>
            Chaque trajet devient une annonce en brouillon, avec ses gares et son
            horaire. Rien n'est mis en vente avant que vous ne le publiiez
            vous-même, et les places ne s'ouvrent qu'une fois l'horaire confirmé
            depuis votre tableau de bord.
          </InfoBox>
        </div>
      </div>
    );
  }

  return null;
}

function StepScheduleOrOptions({ partnerType, hours, setHours, data, onChange }: {
  partnerType: PartnerType;
  hours: Record<string, { open: boolean; from: string; to: string }>;
  setHours: (h: Record<string, { open: boolean; from: string; to: string }>) => void;
  data: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  const [reservations, setReservations] = useState(true);

  if (partnerType === "restaurant") return (
    <div>
      <SectionTitle title="Horaires d'ouverture" subtitle="Définissez vos heures d'ouverture pour chaque jour de la semaine." />
      <button onClick={() => {
        const mon = hours["Lundi"];
        const allSame = Object.fromEntries(DAYS_FR.map(d => [d, { ...mon }]));
        setHours(allSame);
      }} className="mb-6 text-xs font-bold text-[#002089] border border-[#002089] px-3 py-1.5 rounded-lg hover:bg-[#002089] hover:text-white transition-colors">
        Copier les horaires du lundi sur tous les jours
      </button>
      <div className="space-y-3 mb-10">
        {DAYS_FR.map(day => {
          const h = hours[day] || { open: true, from: "08:00", to: "22:00" };
          return (
            <div key={day} className="bg-white border border-[#e2d5c3] rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
              <span className="w-24 text-sm font-semibold text-[#3E2C23] shrink-0">{day}</span>
              <Toggle value={h.open} onChange={open => setHours({ ...hours, [day]: { ...h, open } })} />
              {h.open ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="time" value={h.from} onChange={e => setHours({ ...hours, [day]: { ...h, from: e.target.value } })}
                    className="border border-[#e2d5c3] rounded-lg px-2 py-1.5 text-sm text-[#3E2C23] focus:border-[#6ad7fb] outline-none" />
                  <span className="text-[#7a6355]">—</span>
                  <input type="time" value={h.to} onChange={e => setHours({ ...hours, [day]: { ...h, to: e.target.value } })}
                    className="border border-[#e2d5c3] rounded-lg px-2 py-1.5 text-sm text-[#3E2C23] focus:border-[#6ad7fb] outline-none" />
                </div>
              ) : (
                <span className="text-sm text-[#b0a090] font-medium">Fermé</span>
              )}
            </div>
          );
        })}
      </div>
      <SectionTitle title="Réservations en ligne" subtitle="Acceptez-vous les réservations de table en ligne ?" />
      <div className="flex items-center gap-4 mb-6">
        <Toggle value={reservations} onChange={setReservations} />
        <span className="text-sm font-semibold text-[#3E2C23]">{reservations ? "Oui, j'accepte les réservations en ligne" : "Non, pas de réservation en ligne"}</span>
      </div>
      {reservations && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Taille min. du groupe" id="minParty" type="number" placeholder="1" value={data.minParty || ""} onChange={v => onChange("minParty", v)} />
          <Field label="Taille max. du groupe" id="maxParty" type="number" placeholder="12" value={data.maxParty || ""} onChange={v => onChange("maxParty", v)} />
          <Field label="Durée moyenne d'un repas" id="resDuration" placeholder="1h30" value={data.resDuration || ""} onChange={v => onChange("resDuration", v)} />
          <Field label="Délai minimum (heures)" id="minNotice" type="number" placeholder="2" value={data.minNotice || ""} onChange={v => onChange("minNotice", v)} />
          <SelectField label="Confirmation" id="confirm" options={["Automatique", "Manuelle"]} value={data.confirm || ""} onChange={v => onChange("confirm", v)} />
          <SelectField label="Politique d'annulation" id="cancelPolicy" options={["Gratuite jusqu'à 2h avant", "Gratuite jusqu'à 24h avant", "Non remboursable"]} value={data.cancelPolicy || ""} onChange={v => onChange("cancelPolicy", v)} />
        </div>
      )}
    </div>
  );

  if (partnerType === "car") return (
    <div>
      <SectionTitle title="Tarifs & Options de location" subtitle="Configurez vos tarifs et les services proposés." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Field label="Tarif / jour ($ US)" id="dailyRate" type="number" placeholder="65" value={data.dailyRate || ""} onChange={v => onChange("dailyRate", v)} required />
        <Field label="Tarif / semaine ($ US)" id="weeklyRate" type="number" placeholder="400" value={data.weeklyRate || ""} onChange={v => onChange("weeklyRate", v)} />
        <Field label="Tarif / mois ($ US)" id="monthlyRate" type="number" placeholder="1200" value={data.monthlyRate || ""} onChange={v => onChange("monthlyRate", v)} />
        <Field label="Dépôt de garantie ($ US)" id="deposit" type="number" placeholder="500" value={data.deposit || ""} onChange={v => onChange("deposit", v)} />
        <Field label="Kilométrage inclus / jour" id="mileage" placeholder="200 km" value={data.mileage || ""} onChange={v => onChange("mileage", v)} />
        <Field label="Supplément kilométrage ($/km)" id="extraMileage" placeholder="0.25" value={data.extraMileage || ""} onChange={v => onChange("extraMileage", v)} />
      </div>
      <p className="text-xs font-bold text-[#002089] uppercase tracking-widest mb-3">Services proposés</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[["insurance", "🛡️", "Assurance incluse"], ["airportPickup", "✈️", "Livraison aéroport"], ["hotelDelivery", "🏨", "Livraison hôtel"], ["homeDelivery", "🏠", "Livraison à domicile"], ["diffReturn", "🔄", "Retour lieu différent"]].map(([key, emoji, lbl]) => (
          <button key={key} onClick={() => onChange(key, data[key] === "1" ? "" : "1")}
            className={`p-3 rounded-xl border-2 flex items-center gap-2 text-sm transition-all ${data[key] === "1" ? "border-[#e76f2e] bg-[#fff5f0] text-[#e76f2e] font-semibold" : "border-[#e2d5c3] text-[#3E2C23] hover:border-[#6ad7fb]"}`}>
            <span>{emoji}</span>{lbl}
          </button>
        ))}
      </div>
    </div>
  );

  return null;
}

function StepPhotos({ partnerType, photos, onPhotos }: { partnerType: PartnerType; photos: File[]; onPhotos: (f: File[]) => void }) {
  const tips: Record<string, string[]> = {
    hotel: ["Extérieur", "Lobby", "Chambres", "Salles de bain", "Piscine", "Restaurant", "Vues"],
    guesthouse: ["Extérieur", "Chambres", "Salles de bain", "Cuisine", "Salon", "Jardin", "Vues"],
    car: ["Face avant", "Face arrière", "Côtés", "Intérieur", "Tableau de bord", "Coffre"],
    restaurant: ["Extérieur", "Salle à manger", "Plats", "Bar", "Terrasse", "Équipe"],
    bus: ["Autocar extérieur", "Sièges", "Allée centrale", "Soute à bagages", "Gare de départ", "Équipe"],
  };
  const myTips = tips[partnerType || "hotel"] || [];
  return (
    <div>
      <SectionTitle title="Photos & Médias" subtitle="Montrez à vos clients ce qui rend votre établissement unique." />
      <div className="bg-[#E9F9FE] border border-[#e2d5c3] rounded-xl p-4 mb-6 flex items-start gap-3">
        <span className="text-lg shrink-0">💡</span>
        <p className="text-xs text-[#7a6355] leading-relaxed">
          Les annonces avec des photos de qualité reçoivent <strong className="text-[#002089]">42% plus de réservations</strong>. Nous recommandons au minimum 5 photos.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
        <div className="space-y-4">
          <UploadZone files={photos} onFiles={f => onPhotos([...photos, ...f])} label="Télécharger des photos" hint="JPG, PNG · Max 10 Mo par photo · Min. recommandé : 5" />
          <UploadZone multiple={false} onFiles={f => onPhotos([...photos, ...f])} label="Photo de couverture" hint="Cette image apparaît en tête de votre annonce" />
          <UploadZone multiple={false} onFiles={f => onPhotos([...photos, ...f])} label="Logo de l'établissement" hint="PNG transparent recommandé · Carré · 400×400 px min." />
          <div className="grid grid-cols-3 gap-3">
            {["#E9F9FE", "#D6F0FB", "#C2E7F7"].map((bg, i) => (
              <div key={i} className="aspect-square rounded-xl border-2 border-[#e2d5c3] flex items-center justify-center" style={{ background: bg }}>
                <span className="text-[#b0a090] text-xs text-center px-2">Photo {i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-[#e2d5c3] rounded-xl p-4">
          <p className="font-semibold text-[#3E2C23] text-sm mb-3">📸 Photos recommandées</p>
          <div className="space-y-2">
            {myTips.map(tip => (
              <div key={tip} className="flex items-center gap-2 text-sm text-[#7a6355]">
                <span className="w-2 h-2 rounded-full bg-[#e76f2e] shrink-0"/>
                {tip}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPolicies({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const policies = [
    { id: "cancellation", label: "Politique d'annulation", emoji: "🔄", options: ["Flexible (gratuite jusqu'à 24h avant)", "Modérée (gratuite jusqu'à 5 jours avant)", "Stricte (non remboursable)"] },
    { id: "refund", label: "Politique de remboursement", emoji: "💰", options: ["Remboursement total", "Remboursement partiel (50%)", "Aucun remboursement"] },
    { id: "noshow", label: "Politique de non-présentation", emoji: "🚫", options: ["Première nuit facturée", "Total facturé", "Aucune pénalité"] },
    { id: "pets", label: "Animaux de compagnie", emoji: "🐾", options: ["Acceptés", "Non acceptés", "Acceptés avec supplément"] },
    { id: "smoking", label: "Tabagisme", emoji: "🚬", options: ["Interdit", "Autorisé dans certaines zones", "Autorisé"] },
    { id: "children", label: "Enfants", emoji: "👶", options: ["Bienvenue", "Enfants de plus de 12 ans seulement", "Non adapté aux enfants"] },
    { id: "minage", label: "Âge minimum", emoji: "🪪", options: ["18 ans", "21 ans", "25 ans", "Aucune restriction"] },
    { id: "damage", label: "Dommages et caution", emoji: "🛡️", options: ["Caution requise", "Sans caution", "Assurance proposée"] },
  ];
  return (
    <div>
      <SectionTitle title="Politiques" subtitle="Définissez vos règles pour informer vos clients avant la réservation." />
      <div className="space-y-3">
        {policies.map(p => (
          <div key={p.id} className="bg-white border border-[#e2d5c3] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{p.emoji}</span>
              <span className="font-semibold text-sm text-[#3E2C23]">{p.label}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.options.map(opt => (
                <button key={opt} onClick={() => onChange(p.id, opt)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${data[p.id] === opt ? "border-[#e76f2e] bg-[#fff5f0] text-[#e76f2e]" : "border-[#e2d5c3] text-[#7a6355] hover:border-[#6ad7fb]"}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Slug must match partner_document_types.code in the database. */
export const docSlug = (label: string) =>
  label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
       .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const DOCS_SHARED = [
  { label: "Pièce d'identité / Passeport", required: true },
  { label: "Registre du commerce / Carte d'identité fiscale", required: true },
  { label: "Justificatif de domicile", required: false },
  { label: "NIF / Numéro fiscal", required: true },
  { label: "Licence commerciale", required: false },
];

const DOCS_SPECIFIC: Record<string, { label: string; required: boolean }[]> = {
  hotel: [{ label: "Licence d'hébergement touristique", required: true }],
  guesthouse: [{ label: "Licence d'hébergement touristique", required: true }],
  car: [
    { label: "Carte grise du véhicule", required: true },
    { label: "Attestation d'assurance du véhicule", required: true },
    { label: "Contrôle technique", required: false },
  ],
  restaurant: [
    { label: "Autorisation sanitaire", required: true },
    { label: "Licence de restauration", required: true },
  ],
  bus: [
    { label: "Licence de transport public", required: true },
    { label: "Assurance de la flotte", required: true },
    { label: "Carte grise des autocars", required: true },
    { label: "Contrôle technique des autocars", required: false },
    { label: "Permis des chauffeurs", required: false },
  ],
};

/** Every document this vertical can supply, required ones flagged. */
export const documentsFor = (t: PartnerType) => [
  ...DOCS_SHARED,
  ...(DOCS_SPECIFIC[t || "hotel"] ?? []),
];

function StepVerification({ partnerType, docs, onDoc }: {
  partnerType: PartnerType;
  docs: Record<string, File>;
  onDoc: (code: string, f: File) => void;
}) {
  const shared = DOCS_SHARED;
  const specific = DOCS_SPECIFIC;
  const extra = specific[partnerType || "hotel"] || [];
  return (
    <div>
      <SectionTitle title="Vérification de l'entreprise" subtitle="La vérification renforce la confiance des clients et augmente votre visibilité." />
      <div className="bg-[#002089] rounded-xl px-4 py-3 flex items-center gap-3 mb-6">
        <Ico.Lock />
        <p className="text-[#6ad7fb] text-xs font-medium">Privé — vos documents ne seront jamais affichés publiquement.</p>
      </div>
      <div className="space-y-3 mb-6">
        <p className="text-xs font-bold text-[#002089] uppercase tracking-widest">Documents communs</p>
        {shared.map(d => <DocUploadCard key={d.label} label={d.label} required={d.required} file={docs[docSlug(d.label)]} onFile={f => onDoc(docSlug(d.label), f)} />)}
      </div>
      {extra.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-[#002089] uppercase tracking-widest">Documents spécifiques</p>
          {extra.map(d => <DocUploadCard key={d.label} label={d.label} required={d.required} file={docs[docSlug(d.label)]} onFile={f => onDoc(docSlug(d.label), f)} />)}
        </div>
      )}
    </div>
  );
}

function StepPayout({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  /**
   * L'onglet choisi vit dans le dossier, pas dans l'écran.
   *
   * Il était en `useState` local, donc perdu à chaque Retour et à chaque
   * reprise de brouillon : un candidat Mobile Money revenait sur l'onglet
   * « Compte bancaire », vide, pendant que ses champs mobiles — toujours
   * remplis — l'attendaient sur un onglet qu'il ne regardait pas. Le numéro,
   * lui, n'est délibérément plus conservé (c'est un instrument de paiement),
   * ce qui rendait l'écran encore plus déroutant : la bannière lui demandait
   * de le ressaisir, sur le mauvais onglet.
   */
  const method = data.payoutTab || "bank";
  const setMethod = (v: string) => onChange("payoutTab", v);
  return (
    <div>
      <SectionTitle title="Paiements & Virements" subtitle="Indiquez-nous où envoyer vos revenus." />
      {/* « Cryptées » était faux sur le seul chemin de stockage que ces champs
          atteignaient : du JSON en clair dans localStorage, à chaque frappe. Et
          « jamais affichées publiquement » répondait à une question que personne
          ne pose. Ce qui compte, c'est ce que PAPOT garde et ce qu'il jette. */}
      <div className="bg-[#002089] rounded-xl px-5 py-4 flex items-start gap-3 mb-6">
        <span className="shrink-0 mt-0.5 text-[#6ad7fb]"><Ico.Lock /></span>
        <p className="text-[#6ad7fb] text-sm font-medium leading-relaxed">
          PAPOT ne garde pas votre numéro de compte : seuls les quatre derniers
          chiffres sont enregistrés, avec le nom du titulaire et la banque. Le
          numéro complet n'est pas conservé dans le brouillon de ce formulaire —
          il faudra le ressaisir si vous revenez plus tard.
        </p>
      </div>
      {/* L'onglet « Carte débit » était là, avec trois champs : numéro, nom, date
          d'expiration. Il ne pouvait pas satisfaire sa propre étape —
          `partnerValidation.ts` n'accepte qu'un bloc bancaire ou mobile money
          complet, jamais une carte — donc personne n'a jamais pu soumettre un
          dossier par ce chemin. `partnerPayload.ts` ne lisait `cardNum` et
          `cardName` que comme un test de présence, et n'a jamais lu `cardExp`.
          Ne restait donc que la conséquence : un numéro de carte en clair dans
          localStorage, à chaque frappe, pour un onglet qui ne menait nulle part.

          Un versement par carte n'est de toute façon pas un moyen de versement :
          on ne pousse pas des fonds vers un PAN. */}
      <div className="flex gap-2 mb-6">
        {[["bank", "🏦", "Compte bancaire"], ["digital", "📱", "Mobile Money"]].map(([val, emoji, lbl]) => (
          <button key={val} onClick={() => setMethod(val)}
            className={`flex-1 py-3 rounded-xl border-2 text-xs font-semibold flex flex-col items-center gap-1 transition-all ${method === val ? "border-[#002089] bg-[#002089] text-white" : "border-[#e2d5c3] text-[#7a6355] hover:border-[#6ad7fb]"}`}>
            <span className="text-xl">{emoji}</span>{lbl}
          </button>
        ))}
      </div>
      {method === "bank" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom du titulaire du compte" id="accountHolder" placeholder="Marie Dupont" value={data.accountHolder || ""} onChange={v => onChange("accountHolder", v)} required />
          <Field label="Nom de la banque" id="bankName" placeholder="Sogebank" value={data.bankName || ""} onChange={v => onChange("bankName", v)} required />
          <Field label="Numéro de compte" id="accountNum" placeholder="1234567890" value={data.accountNum || ""} onChange={v => onChange("accountNum", v)} required />
          <Field label="Code de routage / IBAN" id="routing" placeholder="HTI00001234" value={data.routing || ""} onChange={v => onChange("routing", v)} />
          <SelectField label="Pays" id="payCountry" options={["Haïti", "France", "USA", "Canada"]} value={data.payCountry || ""} onChange={v => onChange("payCountry", v)} />
          <SelectField label="Devise" id="currency" options={["USD — Dollar américain", "HTG — Gourde haïtienne"]} value={data.currency || ""} onChange={v => onChange("currency", v)} />
        </div>
      )}
      {method === "digital" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SelectField label="Service Mobile Money" id="mobileService" options={["MonCash", "Natcash", "Lajan Kach", "Autre"]} value={data.mobileService || ""} onChange={v => onChange("mobileService", v)} />
          <Field label="Numéro de téléphone" id="mobileNum" type="tel" placeholder="+509 3712 3456" value={data.mobileNum || ""} onChange={v => onChange("mobileNum", v)} />
          <Field label="Nom du titulaire" id="mobileHolder" placeholder="Marie Dupont" value={data.mobileHolder || ""} onChange={v => onChange("mobileHolder", v)} />
        </div>
      )}
    </div>
  );
}

/**
 * The review screen told a story it had never checked.
 *
 * Its nine sections were a literal array: "Complet 100 %" eight times, "Photos"
 * permanently at 80 %, "Vérification" permanently at 0 %. The ring therefore
 * read 87 % whatever the partner had actually filled in, and the one screen
 * whose entire job is to report the state of the file was the only screen that
 * never looked at it. A partner who had uploaded every document was still told
 * the vérification was pending; one who had skipped nothing still saw 87 %.
 *
 * `validateStep` already knows what each step requires — the wizard locks
 * Continue with it — so the review asks the same question and the two can never
 * disagree. What is missing is named, and the edit button goes to the step that
 * collects it instead of doing nothing.
 */
function StepReview({ partnerType, state, steps, onEdit }: {
  partnerType: PartnerType;
  state: WizardState;
  steps: StepKey[];
  onEdit: (step: number) => void;
}) {
  // Only the steps that collect something. welcome, type, review, submit and
  // success have nothing to report on.
  const REVIEWED: Partial<Record<StepKey, string>> = {
    account: "Compte & contact",
    profile: "Informations sur l'entreprise",
    location: "Localisation",
    details: "Détails de l'activité",
    amenities: "Équipements",
    inventory: "Services & inventaire",
    schedule: "Horaires & options",
    photos: "Photos",
    policies: "Politiques",
    verification: "Vérification",
    payout: "Informations de paiement",
  };

  const sections = steps
    .map((key, index) => ({ key, index, label: REVIEWED[key] }))
    .filter((s): s is { key: StepKey; index: number; label: string } => !!s.label)
    .map(s => ({ ...s, missing: validateStep(s.key, partnerType, state) }));

  const done = sections.filter(s => s.missing.length === 0).length;
  const overall = sections.length ? Math.round((done / sections.length) * 100) : 0;

  return (
    <div>
      <SectionTitle title="Révision avant soumission" subtitle="Vérifiez toutes les informations avant de soumettre votre dossier." />
      <div className="flex items-center gap-6 bg-[#002089] rounded-2xl px-6 py-5 mb-8">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5"/>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#6ad7fb" strokeWidth="3.5"
              strokeDasharray={`${overall} ${100 - overall}`} strokeLinecap="round"/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display font-black text-white text-lg">{overall}%</span>
          </div>
        </div>
        <div>
          <p className="text-white font-display font-bold text-xl">
            {done} section{done > 1 ? "s" : ""} sur {sections.length} complétée{done > 1 ? "s" : ""}
          </p>
          <p className="text-[#6ad7fb] text-sm mt-1">
            {overall === 100
              ? "Parfait ! Votre dossier est prêt pour soumission."
              : "Reprenez les sections signalées ci-dessous : le formulaire ne pourra pas être envoyé tant qu'il en manque."}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sections.map(s => {
          const ok = s.missing.length === 0;
          return (
            <div key={s.key} className="bg-white border border-[#e2d5c3] rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#3E2C23] truncate">{s.label}</p>
                <Badge
                  label={ok ? "Complet" : "À compléter"}
                  variant={ok ? "success" : "warning"}
                  appearance="subtle" size="small" animate={false}
                />
                {!ok && (
                  <p className="text-xs text-[#7a6355] mt-1.5 leading-snug">
                    Manque : {s.missing.join(", ")}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => onEdit(s.index)}
                title={`Modifier : ${s.label}`}
                className="shrink-0 text-xs text-[#002089] font-semibold border border-[#e2d5c3] px-2 py-1 rounded-lg hover:border-[#002089] transition-colors">
                <Ico.Edit />
              </button>
            </div>
          );
        })}
      </div>
      {/* No "aperçu client" button here: the annonce does not exist yet. It is
          built by `build_partner_listings` when an administrator accepts the
          dossier, so there is nothing to preview and the button showed nothing. */}
    </div>
  );
}

function StepSubmit({ partnerType }: { partnerType: PartnerType }) {
  const checklist = [
    "Informations sur l'entreprise complètes",
    "Localisation confirmée",
    "Tarification configurée",
    "Inventaire/services ajoutés",
    "Photos téléchargées",
    "Politiques complétées",
    "Documents de vérification téléchargés",
    "Informations de paiement renseignées",
  ];
  return (
    <div className="max-w-xl mx-auto">
      <SectionTitle title="Prêt à soumettre votre annonce ?" subtitle="Relisez la checklist ci-dessous avant de soumettre." />
      <div className="bg-white border border-[#e2d5c3] rounded-2xl p-6 mb-8">
        <div className="space-y-3">
          {checklist.map(item => (
            <div key={item} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                <Ico.Check />
              </span>
              <span className="text-sm text-[#3E2C23]">{item}</span>
            </div>
          ))}
        </div>
      </div>
      <InfoBox>
        Notre équipe examinera votre dossier dans un délai de <strong>24 à 48 heures ouvrées</strong>. Vous recevrez un e-mail de confirmation avec le statut de votre demande.
      </InfoBox>
    </div>
  );
}

function StepSuccess({ onDashboard, onPreview, onAdd }: { onDashboard: () => void; onPreview: () => void; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto py-8">
      <div className="papot-pop w-24 h-24 rounded-full bg-green-100 flex items-center justify-center text-5xl mb-6 animate-[papot-pop_0.5s_cubic-bezier(0.22,1,0.36,1)_both]">
        ✅
      </div>
      <h2 className="font-display text-3xl font-bold text-[#3E2C23] mb-3">
        Votre annonce a été soumise !
      </h2>
      <p className="text-[#7a6355] mb-2 leading-relaxed">
        Notre équipe examine votre dossier. Vous serez notifié par e-mail dès que votre annonce sera approuvée.
      </p>
      <div className="bg-[#E9F9FE] border border-[#e2d5c3] rounded-xl px-6 py-3 mb-8 flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"/>
        <span className="text-sm font-semibold text-[#3E2C23]">Statut : En cours d'examen</span>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mb-8">
        {[
          { emoji: "🛡️", label: "Dossier sécurisé" },
          { emoji: "⚡", label: "Réponse sous 24–48h" },
          { emoji: "📈", label: "Croissance rapide" },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-[#e2d5c3] rounded-xl p-4 flex flex-col items-center gap-2">
            <span className="text-2xl">{item.emoji}</span>
            <span className="text-xs text-[#3E2C23] font-semibold text-center">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col w-full gap-3">
        <button onClick={onDashboard} className="w-full bg-[#002089] hover:bg-[#001560] text-white font-bold py-3.5 rounded-xl transition-colors">
          Accéder au tableau de bord →
        </button>
        <button onClick={onPreview} className="w-full border-2 border-[#e2d5c3] hover:border-[#6ad7fb] text-[#3E2C23] font-semibold py-3 rounded-xl transition-colors">
          Aperçu de l'annonce
        </button>
        <button onClick={onAdd} className="w-full text-[#7a6355] hover:text-[#002089] font-medium py-2 text-sm transition-colors">
          + Ajouter un autre établissement
        </button>
      </div>
    </div>
  );
}

/* ─── WIZARD SHELL ───────────────────────────────────── */
function WizardShell({
  step, totalSteps, stepName, onExit, onBack, onContinue,
  continueLabel, canContinue, autosave, isFirstStep, isLastStep, missing = [], children,
  onSaveAndExit,
}: {
  step: number; totalSteps: number; stepName: string;
  onExit: () => void; onBack: () => void; onContinue: () => void;
  continueLabel: string; canContinue: boolean;
  autosave: "saved" | "saving" | "unsaved"; isFirstStep: boolean; isLastStep: boolean;
  onSaveAndExit: () => void;
  missing?: string[];
  children: React.ReactNode;
}) {
  // Welcome sits before the counted range and success past it; neither shows progress.
  const showProgress = !isFirstStep && !isLastStep;
  const pct = showProgress ? Math.round((step / totalSteps) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#E9F9FE]">
      {/* Top bar */}
      <div className="bg-[#002089] px-4 lg:px-8 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#e76f2e] flex items-center justify-center shrink-0">
            <span className="font-display font-black text-white text-sm">P</span>
          </div>
          {showProgress && (
            <div>
              <p className="text-white font-semibold text-sm leading-none">{stepName}</p>
              <p className="text-[#6ad7fb] text-xs mt-0.5">
                Étape {step} sur {totalSteps} · {pct}% complété
              </p>
            </div>
          )}
          {!showProgress && <span className="font-display font-black text-white text-xl">PAPOT Partenaires</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-[#6ad7fb]">
            <Ico.Save />
            {autosave === "saving"
              ? "Enregistrement…"
              : autosave === "unsaved"
                ? "Non enregistré"
                : "Brouillon gardé"}
          </span>
          {/* Opens beside the wizard rather than over it: the draft survives
              either way now, but nobody should have to lose their place to
              read how the vetting works. */}
          <a href="/aide" target="_blank" rel="noreferrer"
            className="hidden sm:block text-xs text-[#6ad7fb] hover:text-white font-medium transition-colors">
            Aide
          </a>
          <button onClick={onExit}
            className="flex items-center gap-1.5 border border-[#6ad7fb]/30 text-[#6ad7fb] hover:text-white hover:border-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
            <Ico.X /> Quitter
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div className="h-1 bg-white/20 shrink-0">
          <div className="h-full bg-[#e76f2e] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 pb-28">
          {children}
        </div>
      </div>

      {/* Sticky bottom bar */}
      {!isLastStep && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#e2d5c3] px-4 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <button onClick={onBack}
                className="flex items-center gap-1.5 border-2 border-[#e2d5c3] hover:border-[#002089] text-[#7a6355] hover:text-[#002089] px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors">
                <Ico.ArrowLeft /> Retour
              </button>
            )}
            <button
              onClick={onSaveAndExit}
              className="hidden sm:block text-xs text-[#b0a090] hover:text-[#7a6355] transition-colors"
            >
              Enregistrer et quitter
            </button>
          </div>
          <div className="flex items-center gap-4 min-w-0">
            {missing.length > 0 && (
              <p className="hidden md:block text-xs text-[#b3261e] text-right truncate max-w-md">
                À compléter : {missing.join(" · ")}
              </p>
            )}
            <button onClick={onContinue} disabled={!canContinue}
              className="shrink-0 flex items-center gap-2 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-2.5 rounded-xl transition-colors shadow-lg shadow-[rgba(231,111,46,0.3)] text-sm">
              {continueLabel} <Ico.ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── MAIN WIZARD ────────────────────────────────────── */

/**
 * Step order is an explicit list rather than index arithmetic. The original
 * export shifted indices by hand and had `isSuccess` inverted against
 * `renderStep`, so the success screen rendered with the nav bar still showing
 * and one step further landed on a blank screen.
 */
type StepKey =
  | "welcome" | "type" | "account" | "profile" | "location" | "details"
  | "amenities" | "inventory" | "schedule" | "photos" | "policies"
  | "verification" | "payout" | "review" | "submit" | "success";

const STEP_LABEL: Record<StepKey, string> = {
  welcome: "Bienvenue", type: "Type de partenaire", account: "Compte",
  profile: "Profil", location: "Localisation", details: "Détails",
  amenities: "Équipements", inventory: "Inventaire", schedule: "Horaires",
  photos: "Photos", policies: "Politiques", verification: "Vérification",
  payout: "Paiements", review: "Révision", submit: "Soumettre", success: "Succès",
};

/** Maps the wizard's type onto the partner_type enum. */
const TYPE_TO_ENUM: Record<Exclude<PartnerType, null>, string> = {
  hotel: "hotel", guesthouse: "guesthouse", car: "car", restaurant: "restaurant",
  bus: "bus",
};

export default function PartnerOnboardingWizard({
  onClose,
  onDashboard,
}: {
  onClose: () => void;
  onDashboard?: (type: PartnerType) => void;
}) {
  // The draft is read once, synchronously, so the first paint already shows the
  // restored answers rather than an empty form that fills in a tick later.
  const [state, setState] = useState<WizardState>(() => {
    const draft = readDraft();
    return draft
      ? { ...draft, autosaveStatus: "saved" as const, photos: [], documents: {} }
      : ({
          step: 0,
    partnerType: null,
    formData: {},
    amenities: [],
    hours: DEFAULT_HOURS,
    rooms: [],
    vehicles: [],
    coaches: [],
    routes: [],
          autosaveStatus: "saved",
          photos: [],
          documents: {},
        } as WizardState);
  });
  const [submitting, setSubmitting] = useState(false);
  const [restored] = useState(() => readDraft() !== null);

  /**
   * Le dossier est parti : il n'y a plus de brouillon à tenir.
   *
   * Sans ce drapeau, `clearDraft()` ne servait à rien. Il efface la clé, puis
   * `go(1)` change `state.step` — qui est dans les dépendances ci-dessous — donc
   * l'enregistrement automatique se redéclenche aussitôt et réécrit le
   * brouillon que la ligne du dessus venait de supprimer. Un dossier soumis
   * restait donc en localStorage, et rouvrir l'assistant proposait de
   * « reprendre » une candidature déjà envoyée, prête à être renvoyée en double.
   *
   * Une ref et non un état : la changer ne doit rien redessiner, et elle doit
   * être lue par l'effet du même tour que le `setState` qui la suit.
   */
  const submitted = useRef(false);

  // Every change to the answers is written back. `step` is included on purpose:
  // coming back to the step you left is most of what "reprendre" means.
  useEffect(() => {
    if (submitted.current) return; // le dossier est envoyé, plus rien à garder
    if (state.step === 0 && !state.partnerType) return; // nothing worth keeping yet
    const ok = writeDraft(state);
    setState(prev =>
      prev.autosaveStatus === (ok ? "saved" : "unsaved")
        ? prev
        : { ...prev, autosaveStatus: ok ? "saved" : "unsaved" },
    );
  }, [
    state.step, state.partnerType, state.formData, state.amenities,
    state.hours, state.rooms, state.vehicles, state.coaches, state.routes,
  ]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateForm = (k: string, v: string) =>
    setState(p => ({ ...p, formData: { ...p.formData, [k]: v } }));
  const toggleAmenity = (a: string) =>
    setState(p => ({
      ...p,
      amenities: p.amenities.includes(a) ? p.amenities.filter(x => x !== a) : [...p.amenities, a],
    }));
  const setHours = (h: WizardState["hours"]) => setState(p => ({ ...p, hours: h }));
  const setRooms = (r: WizardState["rooms"]) => setState(p => ({ ...p, rooms: r }));
  const setVehicles = (v: WizardState["vehicles"]) => setState(p => ({ ...p, vehicles: v }));
  const setCoaches = (c: WizardState["coaches"]) => setState(p => ({ ...p, coaches: c }));
  const setRoutes = (r: WizardState["routes"]) => setState(p => ({ ...p, routes: r }));

  const { partnerType, formData } = state;
  // A transport company has no separate schedule step: its times and service
  // days belong to each route, and they are collected with the route itself.
  // Luggage rules and fare classes arrive with the dashboard screens that own
  // them — asking for them here would collect answers with nowhere to go.
  const hasSchedule = partnerType === "restaurant" || partnerType === "car";

  const steps: StepKey[] = [
    "welcome", "type", "account", "profile", "location", "details",
    "amenities", "inventory",
    ...(hasSchedule ? (["schedule"] as StepKey[]) : []),
    "photos", "policies", "verification", "payout", "review", "submit", "success",
  ];

  const current = steps[Math.min(state.step, steps.length - 1)];
  const countedTotal = steps.length - 2; // welcome and success are not counted
  const isWelcome = current === "welcome";
  const isSuccess = current === "success";

  // Nothing may be skipped: Continue stays locked until the step is complete.
  const missing = partnerType || current === "type" ? validateStep(current, partnerType, state) : [];
  const stepComplete = missing.length === 0;

  const go = (delta: number) =>
    setState(p => ({ ...p, step: Math.max(0, Math.min(p.step + delta, steps.length - 1)) }));

  /** Business name varies per type; pick whichever the chosen branch filled. */
  const businessName =
    formData.bizName || formData.hotelName || formData.ghName ||
    formData.restName || formData.carCompany || formData.busCompany || "";

  const submit = async () => {
    if (!partnerType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // The password belongs to Supabase Auth, never to our table. Creating the
      // account first also lets the RPC attach user_id via auth.uid().
      const { data: session } = await supabase.auth.getSession();
      if (!session.session && formData.password && formData.email) {
        const { error } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            emailRedirectTo: emailReturnUrl("/login"),
            data: {
              full_name: `${formData.firstName ?? ""} ${formData.lastName ?? ""}`.trim(),
              phone: formData.phone ?? null,
            },
          },
        });
        // A duplicate account must not block the application itself.
        if (error) console.warn("Partner account creation skipped:", error.message);
      }

      // Upload first so the application row lands with its photo paths.
      const folder = crypto.randomUUID();
      const paths: string[] = [];
      for (const [i, file] of state.photos.entries()) {
        const ext = file.type === "image/png" ? "png" : "jpg";
        const path = `${folder}/${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PARTNER_PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        paths.push(path);
      }

      // Verification papers go to their own private bucket.
      const documents: { type: string; path: string }[] = [];
      for (const [code, file] of Object.entries(state.documents)) {
        const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
        const path = `${folder}/${code}.${ext}`;
        const { error: docErr } = await supabase.storage
          .from(PARTNER_DOCUMENTS_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (docErr) throw docErr;
        documents.push({ type: code, path });
      }

      const { data: created, error } = await supabase.rpc("submit_partner_application", {
        p_payload: { ...buildPayload(partnerType, state), photos: paths, documents },
      });
      if (error) throw error;

      // L'accusé de réception que l'écran de succès promet.
      //
      // `send-partner-confirmation` est déployée et fonctionne depuis des
      // semaines, et rien ne l'appelait : la promesse était faite, le courriel
      // ne partait pas. La RPC renvoyait déjà l'identifiant, que le client
      // jetait.
      //
      // En oubli volontaire, comme pour une commande : la candidature est
      // enregistrée, et un courriel qui échoue ne doit pas faire croire le
      // contraire. La fonction ne reçoit que l'identifiant et écrit à
      // l'adresse portée par la ligne.
      const applicationId = (created as { id?: string } | null)?.id;
      if (applicationId) {
        void supabase.functions
          .invoke("send-partner-confirmation", { body: { id: applicationId } })
          .catch(e => console.error("Confirmation email failed:", e));
      }
      // Sent and accepted: the draft has done its job and must not reappear.
      // Le drapeau d'abord : les deux `setState` qui suivent redéclencheraient
      // l'enregistrement automatique, qui réécrirait la clé qu'on efface ici.
      submitted.current = true;
      clearDraft();
      /**
       * Le mot de passe a fini son travail.
       *
       * Après `signUp` il ne sert plus à rien : `buildPayload` ne le lit pas,
       * l'écran de succès ne l'affiche pas, et le garder en mémoire le laisse
       * dans React DevTools et dans tout instantané du tas jusqu'à la fermeture
       * de l'onglet.
       *
       * Ici et pas juste après `signUp` : si la soumission échoue entre les
       * deux, un retour à l'étape « Compte » trouverait les champs vides et
       * `validateStep` rebloquerait le dossier. Les trois secondes gagnées en
       * l'effaçant plus tôt ne pèsent rien face à quinze minutes de saisie que
       * le wizard refuse de laisser repartir.
       */
      setState(p => {
        const { password: _pw, confirmPassword: _cpw, ...rest } = p.formData;
        return { ...p, formData: rest };
      });

      go(1); // success
    } catch (err) {
      console.error("Partner application failed:", err);
      // The RPC raises human-readable French messages for validation failures;
      // show those rather than a generic error.
      const msg = (err as { message?: string })?.message ?? "";
      setSubmitError(
        msg && !/fetch|network|Failed to send/i.test(msg)
          ? msg.replace(/^.*?:\s*/, "")
          : "L'envoi a échoué. Vérifiez votre connexion et réessayez.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (current) {
      case "welcome":
        return <StepWelcome onStart={t => setState(p => ({ ...p, partnerType: t, step: 2 }))} />;
      case "type":
        return <StepTypeSelection selected={partnerType} onSelect={t => setState(p => ({ ...p, partnerType: t }))} />;
      case "account":
        return <StepAccount data={formData} onChange={updateForm} />;
      case "profile":
        return <StepBusinessProfile data={formData} onChange={updateForm} />;
      case "location":
        return <StepLocation data={formData} onChange={updateForm} />;
      case "details":
        return <StepDetails partnerType={partnerType} data={formData} onChange={updateForm} />;
      case "amenities":
        return <StepAmenities partnerType={partnerType} amenities={state.amenities} onToggle={toggleAmenity} />;
      case "inventory":
        return (
          <StepInventory
            partnerType={partnerType} rooms={state.rooms} setRooms={setRooms}
            vehicles={state.vehicles} setVehicles={setVehicles}
            coaches={state.coaches} setCoaches={setCoaches}
            routes={state.routes} setRoutes={setRoutes}
            data={formData} onChange={updateForm}
          />
        );
      case "schedule":
        return (
          <StepScheduleOrOptions
            partnerType={partnerType} hours={state.hours} setHours={setHours}
            data={formData} onChange={updateForm}
          />
        );
      case "photos":
        return (
          <StepPhotos
            partnerType={partnerType}
            photos={state.photos}
            onPhotos={f => setState(p => ({ ...p, photos: f }))}
          />
        );
      case "policies":     return <StepPolicies data={formData} onChange={updateForm} />;
      case "verification":
        return (
          <StepVerification
            partnerType={partnerType}
            docs={state.documents}
            onDoc={(code, f) => setState(p => ({ ...p, documents: { ...p.documents, [code]: f } }))}
          />
        );
      case "payout":       return <StepPayout data={formData} onChange={updateForm} />;
      case "review":
        return (
          <StepReview
            partnerType={partnerType} state={state} steps={steps}
            onEdit={i => setState(p => ({ ...p, step: i }))}
          />
        );
      case "submit":
        return (
          <>
            <StepSubmit partnerType={partnerType} />
            {submitError && (
              <p className="max-w-xl mx-auto mt-4 text-[13px] text-[#b3261e] bg-[#fdecea] border border-[#f5c2bd] rounded-xl px-3.5 py-2.5">
                {submitError}
              </p>
            )}
          </>
        );
      case "success":
        return (
          <StepSuccess
            onDashboard={() => (onDashboard ? onDashboard(partnerType) : onClose())}
            onPreview={onClose}
            onAdd={() => {
              // Un nouveau dossier commence : l'enregistrement automatique
              // reprend son travail. L'état repart à l'étape 0 sans type, donc
              // l'effet s'arrête de lui-même jusqu'au premier vrai choix.
              submitted.current = false;
              clearDraft();
              setState({
                step: 0, partnerType: null, formData: {}, amenities: [],
                hours: DEFAULT_HOURS, rooms: [], vehicles: [], coaches: [], routes: [],
                autosaveStatus: "saved", photos: [], documents: {},
              });
            }}
          />
        );
    }
  };

  return (
    <WizardShell
      step={state.step}
      totalSteps={countedTotal}
      stepName={STEP_LABEL[current]}
      onExit={onClose}
      onSaveAndExit={() => {
        writeDraft(state);
        onClose();
      }}
      onBack={() => go(-1)}
      onContinue={current === "submit" ? submit : () => go(1)}
      continueLabel={
        current === "submit" ? (submitting ? "Envoi…" : "Soumettre pour révision") : "Continuer"
      }
      canContinue={stepComplete && !submitting}
      autosave={submitting ? "saving" : state.autosaveStatus}
      isFirstStep={isWelcome}
      isLastStep={isSuccess}
      missing={missing}
    >
      {/* Said once, on return. Photos and documents are File objects that
          cannot be serialised, so they are genuinely gone — telling the
          applicant is better than letting them discover it at submit. */}
      {restored && state.step > 0 && (
        <p className="mb-5 rounded-xl bg-[#D6F0FB] px-4 py-3 text-[13px] leading-relaxed text-[#00508a]">
          Nous avons retrouvé votre brouillon et vous avons remis à l'étape où vous étiez. Trois
          choses ne sont pas conservées entre deux visites, volontairement : les photos, les
          documents, et votre numéro de compte ou de téléphone de paiement. Il faudra les saisir
          à nouveau.
        </p>
      )}
      {renderStep()}
    </WizardShell>
  );
}
