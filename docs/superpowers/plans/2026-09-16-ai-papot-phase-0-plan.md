# AI Papot — Faz 0 : l'environnement

Brief : `AI_PAPOT_ARCHITECTURE.md` (fourni par le propriétaire)
Date : 2026-09-16

Ce document couvre **la Faz 0 seule** — l'environnement dans lequel AI Papot
tourne. C'est ce que §119 énumère et ce que §134 impose : le système ne se
génère pas d'un bloc.

## Ce que la Faz 0 livre, et ce qu'elle ne livre pas

Livré : la passerelle, l'abstraction de fournisseur, l'orchestrateur, le
registre d'outils, le TripState serveur, la persistance de conversation,
l'audit, les analytiques, le streaming, le drapeau de fonctionnalité.

Pas livré, volontairement : **aucune action d'écriture métier**. Pas de
réservation, pas de blocage d'inventaire, pas de paiement. §119 le dit, et
c'est la seule façon de mettre une passerelle en ligne sans risque.

## L'adaptation qui compte

Le brief décrit Next.js, NestJS et un monorepo. PAPOT est un SPA Vite servi en
statique, dont la logique métier vit dans des RPC `SECURITY DEFINER` sous RLS.
Deux conséquences qui ne sont pas négociables :

**Il n'y a aucun serveur.** Une clé d'API ne peut pas vivre dans le navigateur :
tout ce qui porte le préfixe `VITE_` est inliné dans le bundle et public. La
passerelle est donc une **Edge Function Supabase** — le seul endroit du projet
qui exécute du code avec des secrets. Une en existe déjà
(`send-partner-confirmation`), donc le chemin est éprouvé.

**Les outils ne sont pas des services TypeScript.** Le registre d'outils appelle
les RPC qui existent déjà, sous le JWT de l'appelant. C'est §133.3 appliqué à
cette architecture : le modèle n'atteint jamais la base, et la RLS reste le
gardien plutôt qu'une couche d'autorisation réécrite au-dessus.

## Tâche 1 — Le schéma AI

Migration `ai_schema`, dans l'ordre de §129.

| Table | Rôle |
|---|---|
| `ai_conversations` | une conversation ; porte langue, mode, modèle, `trip_state_id` |
| `ai_messages` | rôle, contenu, contenu structuré (§79), jetons |
| `ai_tool_calls` | audit §76 : outil, entrée, statut, latence — entrée redigée |
| `ai_trip_states` | §16, côté serveur : requête, sélection, budget, itinéraire, statut |
| `ai_trip_items` | §17 : type, `listing_id`, dates, prix, disponibilité |
| `ai_preferences` | §51 : catégorie, clé, valeur, confiance, source |
| `ai_cost_usage` | §93 : fournisseur, modèle, jetons, coût estimé |
| `ai_feedback` | §107 : utile / pas utile, raison |
| `ai_knowledge_sources`, `ai_documents`, `ai_document_chunks` | le socle RAG de §33, créé maintenant et rempli en Faz 2 |

RLS : une conversation et son état appartiennent à leur `user_id`, ou à leur
`session_id` pour un visiteur anonyme (§101 autorise la planification sans
compte). L'audit, les coûts et les sources de connaissance sont réservés au
personnel.

`ai_document_chunks.embedding` utilise `vector` — l'extension est disponible et
sera activée ici. La colonne existe en Faz 0 ; rien ne l'indexe avant la Faz 2.

**Vérifications** — en transaction annulée : un visiteur ne lit pas la
conversation d'un autre ; un client ne lit pas `ai_tool_calls` ni
`ai_cost_usage` ; une conversation anonyme reste lisible par son `session_id` et
par personne d'autre ; puis `tsc`.

## Tâche 2 — Le drapeau

`ai_enabled` dans `platform_settings`, groupe « Intelligence artificielle », et
`ai_enabled()` exposant le seul booléen — exactement le motif de
`demo_payments`. L'écran d'administration l'affiche sans code neuf.

Sans drapeau, une passerelle facturée à l'appel est en ligne dès son
déploiement.

## Tâche 3 — L'abstraction de fournisseur et le routeur

Dans l'Edge Function, §10 et §11 :

```ts
interface LLMProvider {
  chat(input: ChatInput): Promise<ChatResponse>
  stream(input: ChatInput): AsyncIterable<ChatChunk>
}
```

Un adaptateur Anthropic d'abord, l'interface ouverte pour les suivants. Le
routeur choisit selon la tâche : un modèle rapide pour classer l'intention, un
modèle de raisonnement pour planifier.

Le nom du modèle vient d'`ai_model_configs`, pas du code : changer de modèle ne
doit pas demander un déploiement.

**Vérification** : sans `ANTHROPIC_API_KEY`, la fonction répond 503 avec une
raison lisible, et n'écrit ni conversation ni coût. Avec la clé, un aller-retour
complet. **Cette seconde moitié ne peut pas être vérifiée sans la clé du
propriétaire** — c'est le seul chaînon que je ne peux pas fournir.

## Tâche 4 — Le registre d'outils

§100 et §13. Chaque outil déclare nom, description, schéma d'entrée,
permission, niveau de risque, et son exécution.

En Faz 0, seuls des outils de **lecture** sont enregistrés, et ils appellent ce
qui existe :

| Outil | Ce qu'il appelle |
|---|---|
| `searchListings` | `listings` sous RLS, filtré par métier, ville, prix |
| `getListingDetails` | `listings` + `listing_units` / `restaurant_details` / `car_details` |
| `checkRestaurantAvailability` | `restaurant_availability()` |
| `getPackages` | `partner_packages` + `package_quote()` |
| `getDestinations` | `destinations` |

Un outil d'écriture ne peut pas être enregistré en Faz 0 : le registre refuse
un outil dont le `riskLevel` dépasse ce que la phase autorise, plutôt que de
compter sur la discipline de qui l'ajoute.

**Ce qui manque et qui n'est pas simulé** : il n'y a pas de
`checkStayAvailability` ni de `checkCarAvailability`. `listing_availability` et
`listing_rates` existent mais sont vides et personne ne les lit ; `create_booking`
ne vérifie pas le chevauchement pour un séjour. Un outil qui répondrait
« disponible » serait un mensonge, et §84.2 impose de dire que la disponibilité
est inconnue. C'est donc ce que l'outil absent fera dire au modèle, jusqu'à ce
que le moteur existe.

**Vérifications** : chaque outil appelé sous un JWT client ne rend que ce que la
RLS laisse voir ; un outil inconnu est refusé ; chaque appel écrit une ligne
`ai_tool_calls` avec sa latence.

## Tâche 5 — L'orchestrateur et la passerelle

Edge Function `ai-chat`, `verify_jwt` désactivé pour autoriser un visiteur
anonyme (§101), avec une authentification propre : le JWT est lu et transmis aux
appels d'outils, et son absence limite l'accès aux outils publics.

Boucle : composer le prompt (§81, par morceaux, pas un bloc), appeler le
modèle, exécuter les outils demandés, revalider leurs sorties, remettre au
modèle, streamer la réponse.

L'orchestrateur ne contient aucune règle de prix ni de réservation (§9). Il
coordonne.

Streaming §95 : le client reçoit des statuts de tâche — « Recherche dans
PAPOT… », « Vérification des disponibilités… » — jamais le raisonnement.

Chaque requête écrit `ai_cost_usage`. La redaction PII de §88 s'applique avant
l'envoi au fournisseur.

**Vérifications** : une conversation anonyme puis authentifiée ; un outil qui
échoue ne casse pas la réponse ; le flux se ferme proprement ; les jetons sont
comptés ; aucun secret ne traverse la réponse.

## Tâche 6 — L'écran

Route `/planifier`, derrière le drapeau. §55 : conversation à gauche, Trip
Canvas à droite ; §56 : sur mobile, la conversation avec le canvas en feuille.

En Faz 0 le canvas affiche le TripState tel que le serveur le tient — vide au
début. Il ne calcule rien : le budget et l'itinéraire arrivent en Faz 2.

L'entrée d'accueil de §7 — « Planifier avec AI Papot » — n'apparaît que si le
drapeau est allumé.

**Vérifications** : dans le navigateur, une conversation s'ouvre, se persiste,
se recharge ; le drapeau éteint fait disparaître la route et l'entrée.

## Ce que les phases suivantes ajoutent

| Faz | Ajout |
|---|---|
| 1 | recherche conversationnelle sur l'inventaire, comparaison, questions sur une annonce |
| 2 | moteurs Budget et Itinéraire, Trip Canvas vivant, « rendre moins cher », RAG rempli |
| 3 | disponibilité et prix vivants, devis avec expiration — **dépend du moteur de disponibilité séjour/voiture** |
| 4 | blocages, checkout, création de réservation, remise au paiement |
| 5 | mobile |
| 6 | mémoire et personnalisation |
| 7 | copilote partenaire |
| 8 | intelligence administrateur |

## Les dépendances hors AI que la Faz 3 exigera

À dire maintenant plutôt qu'au moment où elles bloqueront :

- un moteur de disponibilité pour les séjours et les voitures, qui lise
  `listing_availability` et refuse un chevauchement dans `create_booking` ;
- `listing_rates` réellement lu par le calcul de prix ;
- des coordonnées sur les annonces, sans quoi §30 et §31 — distance, temps de
  trajet, « près de l'hôtel » — n'ont aucune donnée ;
- une table d'activités, sans quoi un itinéraire n'a que des repas à placer.
