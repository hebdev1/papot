import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { supabase, PARTNER_PHOTOS_BUCKET } from "../lib/supabase";
import type { TablesInsert } from "../types/database";

/* Partner application flow, lifted from the original App.tsx with its
   Supabase wiring intact: photo upload, insert, confirmation email. */

/* Mirrors the upload zone's stated limits and the bucket's own constraints. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const isAcceptedPhoto = (f: File) =>
  (f.type === "image/jpeg" || f.type === "image/png") && f.size <= MAX_PHOTO_BYTES;

const PARTNER_TYPES = [
  {
    id: "guesthouse",
    emoji: "🏡",
    label: "Maison d'hôtes",
    description: "Chambres d'hôtes, B&B, villas privées — accueillez des voyageurs dans votre espace.",
    img: "https://images.unsplash.com/photo-1783835541391-f632e3393397?w=600&h=400&fit=crop&auto=format",
    color: "#002089",
    perks: ["Commission de 8% seulement", "Paiements sous 48h", "Assurance hôte incluse", "Tableau de bord complet"],
    fields: [
      { id: "name", label: "Nom de l'établissement", placeholder: "Villa Les Oliviers", type: "text" },
      { id: "address", label: "Adresse complète", placeholder: "12 rue des Mimosas, Nice", type: "text" },
      { id: "rooms", label: "Nombre de chambres", placeholder: "5", type: "number" },
      { id: "price", label: "Prix par nuit ($ US)", placeholder: "95", type: "number" },
      { id: "description", label: "Description de l'hébergement", placeholder: "Décrivez votre maison d'hôtes...", type: "textarea" },
    ],
  },
  {
    id: "restaurant",
    emoji: "🍽️",
    label: "Restaurant",
    description: "Tables gastronomiques, bistrots, terrasses — proposez vos tables à la réservation.",
    img: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?w=600&h=400&fit=crop&auto=format",
    color: "#e76f2e",
    perks: ["0% de commission les 3 premiers mois", "Menu digital offert", "Gestion des réservations en temps réel", "Visibilité auprès de 2M+ voyageurs"],
    fields: [
      { id: "name", label: "Nom du restaurant", placeholder: "Le Bouchon Lyonnais", type: "text" },
      { id: "address", label: "Adresse", placeholder: "34 avenue Victor Hugo, Lyon", type: "text" },
      { id: "cuisine", label: "Type de cuisine", placeholder: "Française / Méditerranéenne", type: "text" },
      { id: "capacity", label: "Nombre de couverts", placeholder: "60", type: "number" },
      { id: "description", label: "Ambiance & spécialités", placeholder: "Décrivez votre restaurant...", type: "textarea" },
    ],
  },
  {
    id: "car",
    emoji: "🚗",
    label: "Location de voiture",
    description: "Citadines, SUV, véhicules de luxe — mettez votre flotte en location.",
    img: "https://images.unsplash.com/photo-1533558701576-23c65e0272fb?w=600&h=400&fit=crop&auto=format",
    color: "#3E2C23",
    perks: ["Assurance conducteur intégrée", "Vérification des conducteurs", "Prix dynamique automatique", "Commission parmi les plus basses du marché"],
    fields: [
      { id: "company", label: "Nom de votre agence / société", placeholder: "AutoSun Rentals", type: "text" },
      { id: "location", label: "Ville de prise en charge", placeholder: "Marseille", type: "text" },
      { id: "fleet", label: "Taille de la flotte (véhicules)", placeholder: "8", type: "number" },
      { id: "price", label: "Prix moyen / jour ($ US)", placeholder: "65", type: "number" },
      { id: "description", label: "Types de véhicules proposés", placeholder: "Citadines, SUV, monospace...", type: "textarea" },
    ],
  },
];


export function PartnerModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1); // 1=choose type, 2=info, 3=contact, 4=success
  const [selectedType, setSelectedType] = useState<typeof PARTNER_TYPES[0] | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ firstName: "", lastName: "", email: "", phone: "", agree: false });
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const totalSteps = 3;

  const handleTypeSelect = (type: typeof PARTNER_TYPES[0]) => {
    setSelectedType(type);
    setStep(2);
  };

  const handleFormChange = (id: string, value: string) => setFormData(p => ({ ...p, [id]: value }));

  const handleSubmit = async () => {
    if (!selectedType || submitting) return;
    setSubmitting(true);
    try {
      // Upload first so the row lands with its photo paths already attached.
      const folder = crypto.randomUUID();
      const paths: string[] = [];
      for (const [i, file] of photos.entries()) {
        const ext = file.type === "image/png" ? "png" : "jpg";
        const path = `${folder}/${i}.${ext}`;
        const { error } = await supabase.storage
          .from(PARTNER_PHOTOS_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (error) throw error;
        paths.push(path);
      }

      // Minted here because anon deliberately cannot read the row back,
      // so `.insert().select()` is not available to recover the id.
      const id = crypto.randomUUID();

      const application: TablesInsert<"partner_applications"> = {
        id,
        type: selectedType.id as TablesInsert<"partner_applications">["type"],
        first_name: contact.firstName.trim(),
        last_name: contact.lastName.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        agree: contact.agree,
        details: formData,
        photos: paths,
      };

      const { error } = await supabase.from("partner_applications").insert(application);
      if (error) throw error;

      setStep(4); // Only on success.

      // The success screen promises a confirmation email. Fire it without
      // blocking: a mail failure must not cast doubt on a stored application.
      supabase.functions
        .invoke("send-partner-confirmation", { body: { id } })
        .then(({ error }) => {
          if (error) console.error("Confirmation email failed:", error);
        })
        .catch(err => console.error("Confirmation email failed:", err));
    } catch (err) {
      // No error UI exists in the design; surface it in the console and let
      // the operator retry. The modal deliberately stays on step 3.
      console.error("Partner application failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(0,32,137,0.6)] backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#002089] px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#e76f2e] flex items-center justify-center">
              <span className="font-display font-black text-white text-sm">P</span>
            </div>
            <div>
              <p className="text-white font-display font-bold text-lg leading-none">Devenir partenaire</p>
              {step > 1 && step < 4 && (
                <p className="text-[#6ad7fb] text-xs mt-0.5">
                  Étape {step - 1} sur {totalSteps} — {selectedType?.label}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6ad7fb] hover:text-white transition-colors">
            <Icon.X />
          </button>
        </div>

        {/* Progress bar */}
        {step > 1 && step < 4 && (
          <div className="h-1 bg-[#e2d5c3] shrink-0">
            <div
              className="h-full bg-[#e76f2e] transition-all duration-500"
              style={{ width: `${((step - 1) / totalSteps) * 100}%` }}
            />
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {/* STEP 1 — Choose type */}
          {step === 1 && (
            <div className="p-8">
              <h2 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">
                Quel type d'établissement proposez-vous ?
              </h2>
              <p className="text-[#7a6355] mb-8 text-sm">Sélectionnez votre catégorie pour commencer votre inscription.</p>

              <div className="grid gap-4">
                {PARTNER_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => handleTypeSelect(type)}
                    className="flex gap-5 items-center bg-[#F5E9D8] hover:bg-[#EAF8FF] border-2 border-transparent hover:border-[#6ad7fb] rounded-2xl p-5 text-left transition-all duration-200 group"
                  >
                    <div className="relative w-24 h-20 shrink-0 rounded-xl overflow-hidden bg-[#e2d5c3]">
                      <img src={type.img} alt={type.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"/>
                      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.3)] to-transparent flex items-end justify-start p-2">
                        <span className="text-2xl">{type.emoji}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-[#3E2C23] text-lg mb-1">{type.label}</h3>
                      <p className="text-[#7a6355] text-sm leading-relaxed">{type.description}</p>
                    </div>
                    <div className="text-[#002089] group-hover:translate-x-1 transition-transform shrink-0">
                      <Icon.ArrowRight />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2 — Establishment info */}
          {step === 2 && selectedType && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{selectedType.emoji}</span>
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#3E2C23]">Votre {selectedType.label}</h2>
                  <p className="text-[#7a6355] text-sm">Renseignez les informations de votre établissement</p>
                </div>
              </div>

              {/* Perks strip */}
              <div className="grid grid-cols-2 gap-2 mb-8">
                {selectedType.perks.map(perk => (
                  <div key={perk} className="flex items-center gap-2 bg-[#F5E9D8] rounded-xl px-3 py-2">
                    <span className="w-5 h-5 rounded-full bg-[#002089] flex items-center justify-center shrink-0 text-white">
                      <Icon.Check />
                    </span>
                    <span className="text-xs text-[#3E2C23] font-medium">{perk}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {selectedType.fields.map(field => (
                  <div key={field.id}>
                    <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        rows={3}
                        placeholder={field.placeholder}
                        value={formData[field.id] || ""}
                        onChange={e => handleFormChange(field.id, e.target.value)}
                        className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none resize-none transition-colors"
                      />
                    ) : (
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={formData[field.id] || ""}
                        onChange={e => handleFormChange(field.id, e.target.value)}
                        className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors"
                      />
                    )}
                  </div>
                ))}

                {/* Photo upload zone */}
                <div>
                  <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">Photos (optionnel)</label>
                  <div
                    onClick={() => photoInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      setPhotos(Array.from(e.dataTransfer.files).filter(isAcceptedPhoto));
                    }}
                    className="border-2 border-dashed border-[#c8b9a5] hover:border-[#6ad7fb] rounded-xl p-6 text-center cursor-pointer transition-colors group"
                  >
                    <input
                      ref={photoInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png"
                      hidden
                      onChange={e => setPhotos(Array.from(e.target.files ?? []).filter(isAcceptedPhoto))}
                    />
                    <Icon.Upload />
                    <p className="text-sm text-[#7a6355] mt-2 group-hover:text-[#002089] transition-colors">
                      Glissez vos photos ici ou <span className="text-[#e76f2e] font-semibold">parcourir</span>
                    </p>
                    <p className="text-xs text-[#b0a090] mt-1">JPG, PNG · Max 10 Mo par photo</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-3 border-2 border-[#e2d5c3] rounded-xl text-[#7a6355] font-semibold text-sm hover:border-[#002089] hover:text-[#002089] transition-colors">
                  <Icon.ArrowLeft /> Retour
                </button>
                <button onClick={() => setStep(3)} className="flex-1 bg-[#002089] hover:bg-[#001560] text-white font-bold py-3 rounded-xl transition-colors text-sm">
                  Continuer →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Contact */}
          {step === 3 && selectedType && (
            <div className="p-8">
              <h2 className="font-display text-2xl font-bold text-[#3E2C23] mb-2">Vos coordonnées</h2>
              <p className="text-[#7a6355] mb-8 text-sm">Notre équipe vous contactera sous 24h pour finaliser votre inscription.</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">Prénom</label>
                  <input type="text" placeholder="Marie" value={contact.firstName} onChange={e => setContact(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">Nom</label>
                  <input type="text" placeholder="Dupont" value={contact.lastName} onChange={e => setContact(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors"/>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">Adresse e-mail</label>
                <input type="email" placeholder="marie.dupont@email.com" value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))}
                  className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors"/>
              </div>
              <div className="mb-6">
                <label className="text-xs font-semibold text-[#7a6355] uppercase tracking-wide block mb-1.5">Téléphone</label>
                <input type="tel" placeholder="+33 6 12 34 56 78" value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border-2 border-[#e2d5c3] focus:border-[#6ad7fb] rounded-xl px-4 py-3 text-sm text-[#3E2C23] placeholder:text-[#b0a090] outline-none transition-colors"/>
              </div>

              {/* Recap card */}
              <div className="bg-[#F5E9D8] rounded-2xl p-4 mb-6 flex items-center gap-4">
                <span className="text-3xl">{selectedType.emoji}</span>
                <div>
                  <p className="font-semibold text-[#3E2C23] text-sm">{formData[selectedType.fields[0]?.id] || selectedType.label}</p>
                  <p className="text-xs text-[#7a6355]">{selectedType.label} · {formData[selectedType.fields[1]?.id] || "Adresse à compléter"}</p>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer mb-8">
                <input type="checkbox" checked={contact.agree} onChange={e => setContact(p => ({ ...p, agree: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-[#002089]"/>
                <span className="text-xs text-[#7a6355] leading-relaxed">
                  J'accepte les <span className="text-[#002089] font-semibold">Conditions générales partenaires</span> de PAPOT et la <span className="text-[#002089] font-semibold">Politique de confidentialité</span>.
                </span>
              </label>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex items-center gap-2 px-5 py-3 border-2 border-[#e2d5c3] rounded-xl text-[#7a6355] font-semibold text-sm hover:border-[#002089] hover:text-[#002089] transition-colors">
                  <Icon.ArrowLeft /> Retour
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!contact.agree || submitting}
                  className="flex-1 bg-[#e76f2e] hover:bg-[#d05e20] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-lg shadow-[rgba(231,111,46,0.3)]"
                >
                  Envoyer ma demande 🎉
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Success */}
          {step === 4 && selectedType && (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mb-6">
                ✅
              </div>
              <h2 className="font-display text-3xl font-bold text-[#3E2C23] mb-3">
                Demande envoyée !
              </h2>
              <p className="text-[#7a6355] mb-2 max-w-sm">
                Bienvenue dans la famille PAPOT {selectedType.emoji}. Notre équipe partenaires examinera votre dossier et vous contactera sous <strong className="text-[#002089]">24 heures ouvrées</strong>.
              </p>
              <p className="text-xs text-[#b0a090] mb-10">Un email de confirmation a été envoyé à {contact.email || "votre adresse"}</p>

              <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-10">
                {[
                  { icon: <Icon.Shield />, label: "Dossier sécurisé" },
                  { icon: <Icon.Zap />, label: "Réponse sous 24h" },
                  { icon: <Icon.TrendingUp />, label: "Croissance rapide" },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 bg-[#F5E9D8] rounded-2xl p-4">
                    <span className="text-[#002089]">{item.icon}</span>
                    <span className="text-xs text-[#3E2C23] font-semibold text-center">{item.label}</span>
                  </div>
                ))}
              </div>

              <button onClick={onClose} className="bg-[#002089] hover:bg-[#001560] text-white font-bold px-10 py-3.5 rounded-xl transition-colors">
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PartnerSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-16 px-4 lg:px-8">
      {/* Section header */}
      <div className="text-center mb-12">
        <p className="text-xs font-semibold text-[#e76f2e] uppercase tracking-widest mb-2">Rejoignez notre réseau</p>
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#3E2C23] mb-3">
          Vous avez un établissement ?<br />Rejoignez PAPOT.
        </h2>
        <p className="text-[#7a6355] max-w-xl mx-auto text-sm leading-relaxed">
          Maisons d'hôtes, restaurants, loueurs de voitures — mettez votre établissement en ligne en moins de 10 minutes et touchez des millions de voyageurs.
        </p>
      </div>

      {/* 3 type cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto mb-10">
        {PARTNER_TYPES.map(type => (
          <button
            key={type.id}
            onClick={onOpen}
            className="group relative rounded-2xl overflow-hidden text-left h-64 bg-[#F0E5D2] hover:shadow-2xl hover:shadow-[rgba(0,32,137,0.15)] transition-all duration-300"
          >
            <img src={type.img} alt={type.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"/>
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,32,137,0.85)] via-[rgba(0,32,137,0.3)] to-transparent"/>
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <span className="text-3xl block mb-2">{type.emoji}</span>
              <h3 className="font-display font-bold text-white text-xl mb-1">{type.label}</h3>
              <p className="text-[#6ad7fb] text-xs leading-relaxed mb-3">{type.description.split("—")[0]}</p>
              <span className="inline-flex items-center gap-1.5 bg-[#e76f2e] text-white text-xs font-bold px-3 py-1.5 rounded-full group-hover:bg-white group-hover:text-[#e76f2e] transition-colors">
                Commencer <Icon.ArrowRight />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Stats band */}
      <div className="max-w-5xl mx-auto bg-[#002089] rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        {[
          { value: "18 000+", label: "Partenaires actifs" },
          { value: "8%", label: "Commission seulement" },
          { value: "48h", label: "Premier paiement reçu" },
          { value: "2M+", label: "Voyageurs / mois" },
        ].map(stat => (
          <div key={stat.label}>
            <p className="font-display font-black text-[#6ad7fb] text-2xl">{stat.value}</p>
            <p className="text-[#a8d8f0] text-xs mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
