# Paquets promotionnels — plan d'implémentation

Conception : `docs/superpowers/specs/2026-09-15-paquets-promotionnels-design.md`
Date : 2026-09-15

Travailler sur une branche `paquets-promotionnels`, pas sur `main`.

Chaque migration est suivie d'une régénération de `src/types/database.ts` — le
fichier est généré, et la sortie de `generate_typescript_types` perd l'en-tête
de deux lignes du dépôt, qu'il faut remettre.

Les vérifications SQL se font dans une transaction annulée par rollback, sur le
modèle employé dans tout le chantier restaurant :

```sql
do $do$ begin
  -- … fixtures, appels, assertions …
  raise exception 'VERIFY %', jsonb_pretty(resultat);
end $do$;
```

---

## Tâche 1 — Le schéma

### Étapes

1. Migration `packages_schema` :
   - `create type package_basis as enum ('per_night', 'per_day', 'total');`
   - `create unique index listings_id_partner_key on listings (id, partner_id);`
     — support de la clé étrangère composite qui suit.
   - `partner_packages`, avec `foreign key (listing_id, partner_id) references
     listings (id, partner_id)`, de sorte qu'un paquet ne puisse pas être posé
     sur l'annonce d'une autre entreprise.
   - contraintes : `price >= 0`, `min_units is null or min_units >= 1`,
     `usage_limit is null or usage_limit >= 1`,
     `ends_on is null or starts_on is null or ends_on >= starts_on`.
   - `package_lines`, avec :
     - `check (num_nonnulls(unit_id, listing_id, menu_item_id) <= 1)`
     - `check (num_nonnulls(unit_id, listing_id, menu_item_id) = 0 or
       reference_value is null)` — une ligne liée ne copie jamais un prix.
     - `quantity >= 1`
   - `alter table booking_items add column package_id uuid references
     partner_packages(id);`
   - index : `partner_packages (listing_id) where active`,
     `package_lines (package_id, position)`.

2. Migration `packages_rls` :
   - `enable row level security` sur les deux tables.
   - partenaire : `select` par `my_partner_ids()`, `insert`/`update`/`delete`
     par `partner_can(partner_id, 'manage_promotions')`. Pour `package_lines`,
     la même chose à travers le paquet parent.
   - anonyme : `select` d'un paquet `active`, dans sa fenêtre
     (`haiti_today()` entre `starts_on` et `ends_on` quand elles existent), dont
     l'annonce est publiée.
   - administration : `admin_can()`.
   - `used_count` en lecture seule pour le client : `revoke update on
     partner_packages from authenticated, anon`, puis `grant update (…)` sur les
     seules colonnes modifiables. Un privilège de colonne plutôt qu'un
     déclencheur : la règle vit dans le système de droits, et le chemin de
     réservation s'exécute sous le propriétaire, que ces droits ne limitent pas.
   - `haiti_today()`, pour que les fenêtres se comparent au jour de
     Port-au-Prince et non à celui d'UTC.

3. Régénérer `src/types/database.ts` et remettre l'en-tête.

### Vérifications

Dans une transaction annulée :

1. Poser un paquet sur l'annonce d'un **autre** partenaire → rejeté par la clé
   étrangère composite.
2. Une ligne avec `unit_id` **et** `menu_item_id` → rejetée.
3. Une ligne liée portant `reference_value` → rejetée.
4. `ends_on` antérieur à `starts_on` → rejeté.
5. `update partner_packages set used_count = 0` sous un rôle partenaire →
   refusé par le privilège de colonne, tandis qu'un `update` du nom et du prix
   passe — sinon la liste des colonnes accordées serait incomplète.
6. Un visiteur anonyme voit une offre active et pas une offre éteinte ou
   expirée ; un partenaire d'une autre entreprise, sans rôle dans le personnel,
   ne la voit ni ne la modifie.

Puis `npx tsc --noEmit -p tsconfig.json` doit passer.

---

## Tâche 2 — `package_quote`

### Étapes

1. `create function package_quote(p_package uuid, p_units integer) returns jsonb`,
   `stable`, `security definer`, `search_path = public, pg_temp`.
2. Pour chaque ligne :
   - `valeur = coalesce(prix de la chose liée, reference_value)`, le prix lié
     se lisant sur `listing_units.price`, `listings.price` ou `menu_items.price`
     selon la colonne renseignée — jamais une copie ;
   - `total_ligne = quantity × valeur × (recurring ? p_units : 1)`.
3. `prix_paquet = basis in ('per_night','per_day') ? price × p_units : price`.
4. `savings_known` est vrai seulement si **aucune** ligne n'a une valeur nulle.
   Quand il est faux, `savings` est `null` — pas zéro : zéro est un chiffre,
   et nous n'en avons pas.
5. Renvoyer `{ price, reference, savings, savings_known, lines }`.

### Vérifications

Fixture, dans une transaction annulée :

- une chambre à 100,00 la nuit, ligne liée, `quantity` 1, `recurring` vrai ;
- un petit-déjeuner décrit à 15,00, `quantity` 2, `recurring` vrai ;
- paquet à 120,00, `basis = per_night`.

1. `package_quote(paquet, 3)` renvoie
   `reference = 390.00` (100×1×3 + 15×2×3), `price = 360.00`,
   `savings = 30.00`, `savings_known = true`.
2. Mettre `reference_value` du petit-déjeuner à `null` → `savings_known = false`
   et `savings is null`, `price` inchangé.
3. Passer le prix de la chambre à 130,00 → `reference` devient 480,00 sans
   qu'aucune ligne n'ait été touchée : la preuve que rien n'est copié.
4. Une ligne `recurring = false` ne se multiplie pas par `p_units`.

---

## Tâche 3 — `create_booking` déplie un paquet

### Étapes

1. Un article du panier peut porter `package_id`. Quand il le porte, tout ce
   que le client envoie d'autre pour cet article — `amount` en premier — est
   ignoré.
2. `select … from partner_packages where id = … for update` : le verrou tient
   jusqu'à la fin de la transaction et sérialise les acheteurs.
3. Refus, chacun avec un message en français que le client peut lire :
   - paquet inactif ou annonce non publiée ;
   - `haiti_today()` hors de `[starts_on, ends_on]` ;
   - unités demandées `< min_units` ;
   - `used_count >= usage_limit`.
4. `p_units` : le nombre de nuits déduit de `starts_on`/`ends_on` pour un
   séjour, de jours pour une location, `1` pour `basis = total`.
5. Écrire les articles :
   - **l'article porteur** est celui de `partner_packages.listing_id`. La ligne
     liée qui porte sur cette même annonce *est* cet article : elle ne s'y
     ajoute pas. Il reçoit le prix entier et, en `detail`, la liste des lignes
     décrites.
   - chaque autre ligne liée reçoit son propre `booking_items` à 0,00 avec le
     détail « compris dans le paquet ».
   - tous portent `package_id`.
   - pour un restaurant, l'article porteur passe par `assign_restaurant_table`
     comme aujourd'hui.
6. `update partner_packages set used_count = used_count + 1`.
7. Ajouté en cours de route : un déclencheur sur `package_lines` qui refuse une
   ligne désignant ce qu'une autre entreprise vend. Le trou est apparu en
   préparant les jeux d'essai de cette tâche.

### Vérifications

Dans des transactions annulées, sous un JWT client :

1. Charge utile avec `amount: 1` sur un paquet à 360,00 → le `bookings.total`
   vaut **360,00**. C'est la vérification qui compte le plus.
2. `usage_limit = 1` et `used_count = 1` → refus, message en français.
3. Date du jour hors fenêtre → refus. Séjour de 1 nuit sur un paquet à
   `min_units = 3` → refus.
4. Achat réussi : `used_count` a augmenté de 1 ; le nombre de `booking_items`
   vaut 1 + le nombre de lignes liées portant sur une **autre** annonce ; la
   somme des `amount` égale le total ; tous portent `package_id`.
5. Paquet restaurant : une `table_id` est attribuée sur l'article porteur.
6. Deux achats concurrents sur la dernière place : le second attend puis se
   voit refusé, jamais accepté deux fois.

---

## Tâche 4 — Écran partenaire `/partenaire/paquets`

### Étapes

1. `src/partner/pages/Packages.tsx` :
   - liste : nom, annonce, prix et base, nombre de lignes, fenêtre,
     `used_count / usage_limit`, interrupteur `active` ;
   - formulaire dans un `Modal` : identité, prix, base, `min_units`, dates,
     limite, photo ;
   - éditeur de lignes : « liée à une chose » — la liste se remplit selon
     `listings.kind` de l'annonce choisie : `listing_units` pour un `stay`, les
     autres annonces `car` du partenaire pour une location, `menu_items` pour un
     restaurant — ou « décrite », avec étiquette et valeur facultative ;
   - aperçu appelant `package_quote`, et, quand `savings_known` est faux, la
     phrase qui nomme la ligne fautive : « L'économie ne sera pas affichée : la
     ligne "Transfert aéroport" n'a pas de valeur. »
2. Entrée de navigation dans `src/partner/lib/nav.ts`, groupe `marketing`,
   permission `manage_promotions`, **sans `types`** — tous les métiers la voient.
3. Route dans `src/partner/PartnerApp.tsx`.

### Vérifications

`npx tsc --noEmit` et `npx pnpm@10 build`.

**Le rendu de cet écran ne peut pas être regardé** : aucun compte n'entre dans
`/partenaire`. Le seul compte rattaché à une entreprise est aussi un compte du
personnel, et l'isolation des espaces l'envoie vers l'administration. Le dire
dans le message de commit plutôt que de laisser croire que l'écran a été vu.

---

## Tâche 5 — Fiche publique : la section « Offres »

### Étapes

1. Lire d'abord `src/routes/Checkout.tsx` et `src/lib/cart.tsx` avant de
   toucher à quoi que ce soit : c'est ce chemin qui décide de la forme exacte.
2. `CartItem` reçoit `package_id?: string | null`, et `Checkout` le transmet
   dans la charge utile.
3. Dans `src/routes/Property.tsx`, une section « Offres » à côté du choix
   existant. Choisir un paquet remplace le panneau de prix : prix du paquet,
   contenu ligne à ligne, et « Vous économisez X » **seulement** quand
   `savings_known` est vrai.
4. Le panier reçoit **un seul** article, portant `package_id`, le titre du
   paquet et le prix rendu par `package_quote` — un affichage, que la base
   recalculera de toute façon.

### Vérifications

Créer en SQL un paquet sur un restaurant publié et un sur un séjour publié,
puis dans le navigateur :

1. La section apparaît, le contenu est celui des lignes.
2. La ligne d'économie est présente, puis **disparaît** après avoir mis à
   `null` la valeur d'une ligne décrite.
3. Une réservation complète : la référence s'affiche, et en base le
   `bookings.total` est celui du paquet, avec le bon nombre d'articles.
4. Un paquet expiré ou inactif n'apparaît pas.

---

## Tâche 6 — Accueil : « Offres du moment »

### Étapes

1. Une section sur la page d'accueil listant les paquets actifs des annonces
   publiées, avec la photo, le nom, l'annonce et le prix.
2. Chaque carte mène à `/p/:id` de l'annonce porteuse — le chemin que les
   cartes restaurant et voiture viennent d'obtenir.

### Vérifications

Dans le navigateur : la section montre les paquets semés à la tâche 5, chaque
carte ouvre la bonne fiche, et un paquet désactivé disparaît au rechargement.

---

## Tâche 7 — Revue finale

1. `npx tsc --noEmit -p tsconfig.json` et `npx pnpm@10 build`.
2. Vérifier que **chaque commit** de la branche compile, pas seulement la
   pointe : la série restaurant a montré qu'un commit de types placé avant la
   page qui en dépend casse la bisection.
3. Relire le hors-périmètre de la conception et confirmer que rien n'y a été
   entamé par accident.
4. Rapporter ce qui n'a pas pu être vérifié, nommément l'écran partenaire.
