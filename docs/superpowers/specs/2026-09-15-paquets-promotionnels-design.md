# Paquets promotionnels — conception

Date : 2026-09-15
État : validé avec le propriétaire, prêt pour un plan d'implémentation.

## Le problème

Un restaurant peut composer une formule — `meal_templates` — et la vendre à un
prix unique. Aucun autre métier ne le peut. Un hôtel qui veut vendre « chambre +
petit-déjeuner + transfert » à 120 $ la nuit n'a qu'un seul outil : une remise
en pourcentage sur le tarif de la chambre, qui ne dit rien de ce qui est inclus
et n'affiche rien au client.

Les remises existent déjà (`partner_discounts`, présentées comme Promotions et
Codes promo). Elles baissent un prix ; elles ne vendent pas un ensemble.

## Ce qu'est un paquet

Un paquet est une **offre** : plusieurs choses que le partenaire vend déjà,
réunies sous un nom, à un prix qu'il fixe lui-même.

Ce n'est pas une annonce. Il ne porte pas de disponibilité propre, n'apparaît
pas comme une carte dans la recherche, et ne remplace pas ce qu'il contient :
l'annonce reste la source de vérité pour le tarif de base et pour ce qui est
libre.

Les formules de restaurant restent où elles sont. Elles font ce qu'un paquet ne
fera pas — groupes de choix, composants, stock décrémenté, écran cuisine — et un
restaurant peut en plus créer un paquet, par exemple « table pour 2 + dessert +
bouteille ».

## Modèle de données

### `partner_packages`

| colonne | type | rôle |
|---|---|---|
| `id` | uuid | |
| `partner_id` | uuid | l'entreprise propriétaire ; l'ancrage de toute la RLS |
| `listing_id` | uuid | l'annonce sur laquelle le paquet est proposé |
| `name` | text | |
| `description` | text | |
| `image_url` | text | chemin de stockage, pas une URL — le bucket est privé |
| `price` | numeric(10,2) | le prix fixe, posé par le partenaire |
| `basis` | `package_basis` | `per_night` · `per_day` · `total` |
| `min_units` | smallint | minimum de nuits ou de jours que le paquet exige |
| `starts_on` / `ends_on` | date | fenêtre promotionnelle, comparée à la **date d'achat** — pas aux dates du séjour |
| `usage_limit` | integer | « les 20 premiers » |
| `used_count` | integer | compteur, non modifiable par le partenaire |
| `active` | boolean | |
| `position` | smallint | |
| `created_at` | timestamptz | |

L'annonce doit appartenir au partenaire. Plutôt qu'un déclencheur, un index
unique sur `listings (id, partner_id)` et une clé étrangère composite le
garantissent de façon déclarative.

### `package_lines`

| colonne | type | rôle |
|---|---|---|
| `package_id` | uuid | cascade à la suppression |
| `position` | smallint | |
| `label` | text | ce que le client lit |
| `unit_id` / `listing_id` / `menu_item_id` | uuid | **au plus un** ; ce qui lie la ligne à une chose réelle |
| `quantity` | smallint | |
| `recurring` | boolean | la ligne compte une fois, ou une fois par unité de séjour (nuit ou jour) |
| `reference_value` | numeric(10,2) | ce que la ligne vaudrait séparément ; **réservé aux lignes décrites** |

Contraintes :

- `num_nonnulls(unit_id, listing_id, menu_item_id) <= 1`
- une ligne liée ne porte jamais `reference_value` : sa valeur se lit en direct
  sur la ligne liée.

`recurring` s'écarte volontairement de `partner_fees.per_night`. Un paquet
traverse les trois métiers : pour un séjour l'unité est la nuit, pour une
location le jour, pour un restaurant il n'y en a pas. Un nom qui dit « nuit »
serait faux les deux tiers du temps.

### `booking_items.package_id`

Une colonne de plus, référence nullable vers `partner_packages`. Elle rend une
vente traçable jusqu'à son paquet : pour compter, pour la finance, et pour que
le partenaire voie pourquoi une chambre est bloquée.

## Prix et économie

Le calcul est une fonction SQL, `package_quote(p_package uuid, p_units integer)`,
qui renvoie le prix du paquet pour le séjour, ce que les lignes vaudraient
séparément, l'économie, et un drapeau `savings_known`.

`p_units` est le nombre de nuits pour un séjour, de jours pour une location, et
`1` pour un paquet à prix total.

```
valeur(ligne)  = coalesce(prix de la chose liée, reference_value)
total(ligne)   = quantity × valeur × (recurring ? unités : 1)
prix du paquet = basis = per_night ou per_day → price × unités
                 basis = total                → price
```

Deux règles qui comptent plus que la formule :

**Une ligne liée ne copie jamais un prix.** La valeur se lit sur
`listing_units.price`, `listings.price` ou `menu_items.price` au moment du
calcul. Une copie deviendrait fausse dès que le partenaire change son tarif, et
« vous économisez 30 $ » deviendrait un mensonge.

**L'économie ne s'affiche que si toutes les lignes ont une valeur.** Si le
partenaire écrit « Transfert aéroport » sans dire ce que cela vaut, PAPOT n'a
pas le droit de l'inventer. La fiche montre alors le contenu et le prix du
paquet, sans ligne d'économie. C'est la même règle qui empêche le générateur
d'annonces d'écrire un `car_details` que le formulaire n'a pas collecté.

Le navigateur n'additionne rien : il affiche ce que la fonction renvoie.

## Réservation

`create_booking` reçoit une liste d'articles dont chacun porte son propre
`amount` — c'est-à-dire que **le prix vient du navigateur**. Pour un paquet cela
ne tient pas : une requête modifiée achèterait un paquet à 120 $ pour 1 $.

Le panier n'envoie donc **qu'un seul article**, portant `package_id`, et
`create_booking` lit le paquet et ses lignes dans la base pour en déduire le
prix et les articles à écrire. Tout montant fourni par le client est ignoré.

Un article par ligne envoyé depuis le navigateur ne marcherait pas de toute
façon : le panier ne tient qu'un article par type de service (`remove(kind)`,
`key={i.kind}`), donc deux chambres dans un même paquet s'écraseraient. Et
laisser le navigateur dire ce que le paquet contient rouvrirait la porte que
relire le prix vient de fermer.

Ce qu'une vente produit :

- une ligne `booking_items` par ligne liée, pour que la chambre soit bloquée
  dans son calendrier et le véhicule dans le sien. La ligne liée qui porte sur
  l'annonce du paquet elle-même **est** l'article porteur, elle ne s'y ajoute
  pas ;
- le prix **entier sur l'article porteur** — celui de `partner_packages.listing_id`,
  toujours en première position — les autres à 0 avec un détail
  « compris dans le paquet » — l'argent reste en un seul endroit pour la
  commission et la finance, la disponibilité reste juste ;
- les lignes décrites voyagent en détail sur l'article porteur.

Pour un restaurant, l'article porteur est la réservation de table :
`assign_restaurant_table` s'exécute comme d'habitude, avec son verrou.

La base revalide au moment de l'achat, jamais le navigateur : paquet actif, date
du jour dans la fenêtre, `min_units` respecté, annonce publiée, et
`used_count < usage_limit`. Le compteur monte dans la même transaction, derrière
un `select … for update` sur la ligne du paquet, pour que le 20e et le 21e
acheteur ne puissent pas prendre la dernière place ensemble.

## Sécurité

RLS sur les deux tables :

- **partenaire** — lecture par `my_partner_ids()`, écriture par
  `partner_can(partner_id, 'manage_promotions')`. La permission existe déjà.
  L'écriture est directe sous RLS, comme le reste du catalogue d'un partenaire
  (plats, zones de livraison) ; la RPC est réservée au chemin de l'argent.
- **anonyme** — lecture d'un paquet actif, dans sa fenêtre, dont l'annonce est
  publiée. Un paquet sur un brouillon est invisible.
- **administration** — `admin_can()`.

`used_count` n'est pas modifiable par le partenaire : un déclencheur refuse
toute écriture sur cette colonne hors du chemin de réservation. Sans cela, on
remet le compteur à zéro et « les 20 premiers » ne finit jamais.

## Écrans

### Partenaire — `/partenaire/paquets`

Dans le groupe Marketing, permission `manage_promotions`, **sans filtre de
métier** : tous les types d'entreprise le voient, c'est l'objet du chantier.

La liste donne par paquet : nom, annonce, prix et base, nombre de lignes,
fenêtre, consommation (`7 / 20`), interrupteur actif.

Le formulaire, dans un dialogue, a deux parties. En haut l'identité et le prix.
En bas l'éditeur de lignes : pour chaque ligne, soit **liée à une chose** — la
liste se remplit selon le métier de l'annonce : types de chambre pour un séjour,
annonces véhicule pour une location, plats pour un restaurant — soit **décrite**,
avec une étiquette et une valeur facultative.

Sous le formulaire, un aperçu calculé : « Séparément : 150 $ · Paquet : 120 $ ·
Économie : 30 $ ». Et quand une ligne décrite n'a pas de valeur, la raison est
dite en toutes lettres : « L'économie ne sera pas affichée : la ligne "Transfert
aéroport" n'a pas de valeur. » Le partenaire sait quoi corriger.

### Client

**Sur la fiche de l'annonce** — une section « Offres » à côté du choix de la
chambre. Choisir un paquet change le panneau de prix : prix du paquet, contenu,
et « Vous économisez 30 $ » quand la valeur est connue. L'achat suit le chemin
habituel.

**Sur l'accueil** — une section « Offres du moment » qui rassemble les paquets
actifs des annonces publiées.

## Hors périmètre

Décidé, et délibérément laissé de côté :

- **Paquets entre deux partenaires.** Hôtel A + loueur B supposerait un partage
  de recette entre deux entreprises, ce qui est un sujet de commission, pas de
  catalogue.
- **Le paquet comme carte de recherche.** Il faudrait un second type d'objet
  dans la recherche, les filtres et la carte.
- **Un catalogue de services par partenaire** (petit-déjeuner, transfert, guide
  vendus séparément). Les lignes décrites couvrent le besoin promotionnel sans
  ce chantier.
- **Le prix venant du navigateur pour tout le reste.** `create_booking` fait
  confiance au montant envoyé pour les chambres, les véhicules et les tables.
  Ce défaut existait avant ce chantier ; il est corrigé ici pour les paquets
  parce qu'on touche au chemin, pas au-delà.

## Vérification

Par transactions SQL annulées par rollback, puis dans le navigateur.

1. Un paquet avec une ligne liée (chambre) et une ligne décrite valorisée :
   `package_quote` sur 3 nuits donne le bon total et la bonne économie.
2. Le même paquet, ligne décrite **sans** valeur : `savings_known = false` et
   aucun chiffre d'économie.
3. Achat sous un JWT client : le total est celui de la base, et **un `amount`
   falsifié dans la charge utile est ignoré**.
4. `usage_limit = 1` et une vente déjà faite : la seconde est refusée avec une
   raison en français.
5. Idem pour la fenêtre d'achat et pour `min_units`.
6. RLS : l'anonyme lit un paquet publié et ne voit pas celui d'un brouillon ;
   un partenaire d'une autre entreprise ne lit ni n'écrit ; un membre sans
   `manage_promotions` n'écrit pas.
7. Le partenaire ne peut pas écrire `used_count` directement.
8. Navigateur : créer un paquet depuis l'écran partenaire, le voir sur la fiche
   avec sa ligne d'économie, et la voir disparaître quand une ligne perd sa
   valeur.

**Ce qui ne pourra pas être vérifié en l'état :** le point 8, côté partenaire.
Aucun compte ne peut entrer dans `/partenaire` — le seul compte rattaché à une
entreprise (lakay) est aussi un compte du personnel, et l'isolation des espaces
l'envoie vers l'administration. Rattacher une autre adresse comme propriétaire
de lakay lèverait ce blocage.
